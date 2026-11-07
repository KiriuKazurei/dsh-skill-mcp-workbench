// A minimal ZIP reader for imported skill bundles.
//
// A bundle cannot depend on an archive package, but Node's `zlib` already inflates
// raw deflate, so only the container needs parsing: locate the end-of-central-
// directory record, walk the central directory for each entry's true sizes and
// local-header offset, then read the local header and inflate or copy the payload.
// Zip64 archives are refused with a clear message rather than mis-parsed.

import { inflateRawSync } from 'node:zlib'

/** Local file header signature. */
const LOCAL_SIGNATURE = 0x04034b50

/** Central directory file header signature. */
const CENTRAL_SIGNATURE = 0x02014b50

/** End of central directory signature. */
const EOCD_SIGNATURE = 0x06054b50

/** Stored (uncompressed) entry. */
const METHOD_STORED = 0

/** Deflated entry. */
const METHOD_DEFLATE = 8

/** Entries read from one archive before the reader stops. */
const MAX_ENTRIES = 4096

/** Expanded bytes accepted from one archive. */
const MAX_TOTAL_BYTES = 64 * 1024 * 1024

/** Bytes accepted for a single entry. */
const MAX_ENTRY_BYTES = 32 * 1024 * 1024

/** Read a little-endian unsigned 16-bit integer. */
function readU16(buffer, offset) {
  if (offset + 2 > buffer.length) throw new Error('zip: truncated header')
  return buffer.readUInt16LE(offset)
}

/** Read a little-endian unsigned 32-bit integer. */
function readU32(buffer, offset) {
  if (offset + 4 > buffer.length) throw new Error('zip: truncated header')
  return buffer.readUInt32LE(offset)
}

/** Find the end-of-central-directory record by scanning back from the end. */
function findEocd(buffer) {
  // The comment is at most 65535 bytes, so the record starts within the last
  // 22 + 65535 bytes.
  const lowest = Math.max(0, buffer.length - 22 - 0xffff)
  for (let offset = buffer.length - 22; offset >= lowest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  return -1
}

/** One archive entry. */
class Entry {
  name
  data
  method

  constructor(name, data, method) {
    this.name = name
    this.data = data
    this.method = method
  }
}

/**
 * Read every file entry from a ZIP archive.
 *
 * Directory entries, macOS resource forks, and dotfiles are dropped: they carry no
 * skill content. Sizes come from the central directory, so entries written with a
 * streaming data descriptor (flag bit 3) are read correctly too.
 *
 * @param buffer - the archive bytes.
 * @returns the file entries, in archive order.
 */
export function readZip(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer)
  const eocd = findEocd(buffer)
  if (eocd < 0) throw new Error('zip: no end-of-central-directory record found')

  const entryCount = readU16(buffer, eocd + 10)
  const directorySize = readU32(buffer, eocd + 12)
  const directoryOffset = readU32(buffer, eocd + 16)

  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('zip: Zip64 archives are not supported; re-create the archive without Zip64')
  }
  if (entryCount > MAX_ENTRIES) throw new Error(`zip: too many entries (${entryCount})`)
  if (directoryOffset + directorySize > buffer.length) throw new Error('zip: central directory is out of range')

  const entries = []
  let total = 0
  let cursor = directoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length) throw new Error('zip: truncated central directory')
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) throw new Error('zip: bad central directory signature')

    const flags = readU16(buffer, cursor + 8)
    const method = readU16(buffer, cursor + 10)
    const compressedSize = readU32(buffer, cursor + 20)
    const uncompressedSize = readU32(buffer, cursor + 24)
    const nameLength = readU16(buffer, cursor + 28)
    const extraLength = readU16(buffer, cursor + 30)
    const commentLength = readU16(buffer, cursor + 32)
    const localOffset = readU32(buffer, cursor + 42)

    const nameStart = cursor + 46
    const name = buffer.toString('utf8', nameStart, nameStart + nameLength)
    cursor = nameStart + nameLength + extraLength + commentLength

    // Bit 11 marks a UTF-8 name; anything else is treated as UTF-8 too, because a
    // skill name is ASCII by rule and a mojibake name simply fails validation later.
    if ((flags & 0x0001) !== 0) throw new Error(`zip: encrypted entry "${name}" is not supported`)
    if (name.endsWith('/')) continue
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`zip: entry "${name}" is too large`)
    total += uncompressedSize
    if (total > MAX_TOTAL_BYTES) throw new Error('zip: the archive expands beyond the size limit')

    entries.push(readEntry(buffer, name, method, compressedSize, uncompressedSize, localOffset))
  }
  return entries
}

/** Read one entry's payload through its local file header. */
function readEntry(buffer, name, method, compressedSize, uncompressedSize, localOffset) {
  if (localOffset + 30 > buffer.length) throw new Error(`zip: local header for "${name}" is out of range`)
  if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`zip: bad local header for "${name}"`)
  }
  const localNameLength = readU16(buffer, localOffset + 26)
  const localExtraLength = readU16(buffer, localOffset + 28)
  const dataStart = localOffset + 30 + localNameLength + localExtraLength
  const dataEnd = dataStart + compressedSize
  if (dataEnd > buffer.length) throw new Error(`zip: payload for "${name}" is out of range`)

  const payload = buffer.subarray(dataStart, dataEnd)
  if (method === METHOD_STORED) return new Entry(name, Buffer.from(payload), method)
  if (method === METHOD_DEFLATE) {
    const inflated = inflateRawSync(payload)
    if (inflated.length !== uncompressedSize) {
      throw new Error(`zip: entry "${name}" inflates to ${inflated.length} bytes, expected ${uncompressedSize}`)
    }
    return new Entry(name, inflated, method)
  }
  throw new Error(`zip: entry "${name}" uses unsupported compression method ${method}`)
}
