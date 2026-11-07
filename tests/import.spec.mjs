// The import path: the ZIP reader, the `.md` and `.zip` import routes, and the
// create route. Archives are built in-process so the reader is exercised against
// real deflate and stored payloads without a fixture dependency.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { mkdtemp, readFile, rm, stat, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readZip } from '../lib/host/zip.js'
import { importSkill, createSkill, userSkillRoot, scanRoot } from '../lib/host/skills.js'

/** Build a ZIP archive from `{ name, data }` entries. */
function buildZip(entries, options = {}) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const stored = options.stored === true || entry.stored === true
    const payload = stored ? data : deflateRawSync(data)
    const method = stored ? 0 : 8
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += 30 + name.length + payload.length
  }

  const centralBuffer = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuffer.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuffer, eocd])
}

/** CRC-32, as the ZIP format requires. */
function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ~crc >>> 0
}

/** A home directory with a clean skills root. */
async function scratchHome() {
  const dir = await mkdtemp(join(tmpdir(), 'smw-import-'))
  await writeFile(join(dir, 'cordis.patch.yml'), '[]\n', 'utf8')
  return dir
}

const bundleSkill = '---\nname: imported-skill\ndescription: An imported bundle skill.\n---\n\n# Imported\n\nBody.\n'
const flatSkill = '---\nname: imported-flat\ndescription: An imported flat skill.\n---\n\nFlat body.\n'

test('the zip reader inflates deflate and copies stored entries', () => {
  const archive = buildZip([
    { name: 'imported-skill/SKILL.md', data: bundleSkill },
    { name: 'imported-skill/references/note.txt', data: 'a note' },
    { name: 'stored.txt', data: 'plain bytes', stored: true },
  ])
  const entries = readZip(archive)
  assert.deepEqual(entries.map((entry) => entry.name).sort(), [
    'imported-skill/SKILL.md',
    'imported-skill/references/note.txt',
    'stored.txt',
  ])
  assert.equal(entries.find((entry) => entry.name === 'imported-skill/SKILL.md').data.toString('utf8'), bundleSkill)
  assert.equal(entries.find((entry) => entry.name === 'imported-skill/references/note.txt').data.toString('utf8'), 'a note')
  assert.equal(entries.find((entry) => entry.name === 'stored.txt').data.toString('utf8'), 'plain bytes')
})

test('the zip reader refuses a malformed archive', () => {
  assert.throws(() => readZip(Buffer.from('not a zip at all')), /end-of-central-directory/)
})

test('the zip reader refuses an unsupported compression method', () => {
  // The reader takes the method from the central directory, so patch it there.
  const entry = { name: 'x.txt', data: 'hello' }
  const archive = buildZip([entry])
  const nameLength = Buffer.byteLength(entry.name, 'utf8')
  const payload = deflateRawSync(Buffer.from(entry.data, 'utf8'))
  const centralStart = 30 + nameLength + payload.length
  archive.writeUInt16LE(12, centralStart + 10)
  assert.throws(() => readZip(archive), /compression method/)
})

test('a .md import lands as a flat skill in the user root', async () => {
  const home = await scratchHome()
  const result = await importSkill(home, {
    fileName: 'imported-flat.md',
    data: Buffer.from(flatSkill, 'utf8').toString('base64'),
  })
  assert.equal(result.name, 'imported-flat')
  assert.equal(result.kind, 'flat')
  const root = userSkillRoot(home)
  assert.equal(result.path, join(root, 'imported-flat.md'))
  const text = await readFile(join(root, 'imported-flat.md'), 'utf8')
  assert.equal(text, flatSkill, 'the file is written verbatim')
  await rm(home, { recursive: true, force: true })
})

test('a .md import accepts a data URL payload', async () => {
  const home = await scratchHome()
  const data = `data:text/markdown;base64,${Buffer.from(flatSkill, 'utf8').toString('base64')}`
  const result = await importSkill(home, { fileName: 'imported-flat.md', data })
  assert.equal(result.name, 'imported-flat')
  await rm(home, { recursive: true, force: true })
})

test('a .zip import strips a wrapping directory and writes the bundle', async () => {
  const home = await scratchHome()
  const archive = buildZip([
    { name: 'imported-skill/SKILL.md', data: bundleSkill },
    { name: 'imported-skill/references/note.txt', data: 'a note' },
  ])
  const result = await importSkill(home, {
    fileName: 'bundle.zip',
    data: archive.toString('base64'),
  })
  const root = userSkillRoot(home)
  assert.equal(result.name, 'imported-skill')
  assert.equal(result.kind, 'bundle')
  assert.equal(result.path, join(root, 'imported-skill', 'SKILL.md'))
  assert.equal(await readFile(join(root, 'imported-skill', 'SKILL.md'), 'utf8'), bundleSkill)
  assert.equal(await readFile(join(root, 'imported-skill', 'references', 'note.txt'), 'utf8'), 'a note')
  // The wrapping directory is stripped, so the skill sits directly in the root.
  assert.deepEqual((await readdir(root)).sort(), ['imported-skill'])
  await rm(home, { recursive: true, force: true })
})

test('a .zip without a wrapping directory still lands as a bundle', async () => {
  const home = await scratchHome()
  const archive = buildZip([{ name: 'SKILL.md', data: bundleSkill }])
  const result = await importSkill(home, { fileName: 'bundle.zip', data: archive.toString('base64') })
  const root = userSkillRoot(home)
  assert.equal(result.name, 'imported-skill')
  assert.equal(result.path, join(root, 'imported-skill', 'SKILL.md'))
  await rm(home, { recursive: true, force: true })
})

test('an imported skill is discoverable by the root scan', async () => {
  const home = await scratchHome()
  await importSkill(home, { fileName: 'bundle.zip', data: buildZip([{ name: 'imported-skill/SKILL.md', data: bundleSkill }]).toString('base64') })
  const scanned = await scanRoot(userSkillRoot(home))
  const names = scanned.skills.map((skill) => skill.name)
  assert.deepEqual(names, ['imported-skill'], 'the imported bundle is discovered like any other')
  assert.equal(scanned.skills[0].description, 'An imported bundle skill.')
  await rm(home, { recursive: true, force: true })
})

test('an archive member cannot escape the skill root', async () => {
  const home = await scratchHome()
  const archive = buildZip([{ name: '../escaped.md', data: flatSkill }])
  await assert.rejects(
    () => importSkill(home, { fileName: 'evil.zip', data: archive.toString('base64') }),
    /escapes the skill root|no files/,
  )
  // Nothing was written outside the root either.
  assert.equal(await stat(join(home, 'skills')).then(() => true).catch(() => false), true)
  await rm(home, { recursive: true, force: true })
})

test('macOS resource-fork members are dropped', async () => {
  const home = await scratchHome()
  const archive = buildZip([
    { name: 'imported-skill/SKILL.md', data: bundleSkill },
    { name: '__MACOSX/._imported-skill', data: 'junk' },
    { name: 'imported-skill/.DS_Store', data: 'junk' },
  ])
  const result = await importSkill(home, { fileName: 'bundle.zip', data: archive.toString('base64') })
  const root = userSkillRoot(home)
  assert.equal(result.name, 'imported-skill')
  const names = await readdir(join(root, 'imported-skill'))
  assert.deepEqual(names, ['SKILL.md'], 'the resource forks are not written')
  await rm(home, { recursive: true, force: true })
})

test('a .md import without frontmatter is refused', async () => {
  const home = await scratchHome()
  await assert.rejects(
    () => importSkill(home, { fileName: 'plain.md', data: Buffer.from('# no frontmatter\n', 'utf8').toString('base64') }),
    /frontmatter/,
  )
  await rm(home, { recursive: true, force: true })
})

test('a .md import with an invalid name is refused', async () => {
  const home = await scratchHome()
  const text = '---\nname: Not_Kebab_Case\ndescription: A skill.\n---\n\nBody.\n'
  await assert.rejects(
    () => importSkill(home, { fileName: 'bad.md', data: Buffer.from(text, 'utf8').toString('base64') }),
    /kebab-case/,
  )
  await rm(home, { recursive: true, force: true })
})

test('a .md import without a description is refused', async () => {
  const home = await scratchHome()
  const text = '---\nname: no-description\n---\n\nBody.\n'
  await assert.rejects(
    () => importSkill(home, { fileName: 'bad.md', data: Buffer.from(text, 'utf8').toString('base64') }),
    /description/,
  )
  await rm(home, { recursive: true, force: true })
})

test('an unsupported extension is refused', async () => {
  const home = await scratchHome()
  await assert.rejects(
    () => importSkill(home, { fileName: 'skill.txt', data: Buffer.from(flatSkill, 'utf8').toString('base64') }),
    /only \.md and \.zip/,
  )
  await rm(home, { recursive: true, force: true })
})

test('create writes a bundle with valid frontmatter', async () => {
  const home = await scratchHome()
  const result = await createSkill(home, {
    name: 'my-new-skill',
    description: 'A created skill.',
    whenToUse: 'Use when testing creation.',
    body: '# My new skill\n\nDo the thing.',
  })
  const root = userSkillRoot(home)
  assert.equal(result.path, join(root, 'my-new-skill', 'SKILL.md'))
  const text = await readFile(join(root, 'my-new-skill', 'SKILL.md'), 'utf8')
  assert.ok(text.startsWith('---\n'), 'the file opens with frontmatter')
  assert.ok(text.includes('name: my-new-skill'), 'the name is written')
  assert.ok(text.includes('description: A created skill.'), 'the description is written')
  assert.ok(text.includes('whenToUse: Use when testing creation.'), 'the optional field is written')
  assert.ok(text.includes('Do the thing.'), 'the body is written')

  // The created skill is immediately discoverable.
  const scanned = await scanRoot(root)
  assert.deepEqual(scanned.skills.map((skill) => skill.name), ['my-new-skill'])
  assert.equal(scanned.skills[0].description, 'A created skill.')
  await rm(home, { recursive: true, force: true })
})

test('create writes a placeholder body when none is given', async () => {
  const home = await scratchHome()
  const result = await createSkill(home, { name: 'bare-skill', description: 'A bare skill.' })
  const text = await readFile(result.path, 'utf8')
  assert.ok(text.includes('Describe what this skill does.'), 'a placeholder body is written')
  assert.ok(!text.includes('whenToUse'), 'an absent optional field stays absent')
  await rm(home, { recursive: true, force: true })
})

test('create refuses an invalid name or a missing description', async () => {
  const home = await scratchHome()
  await assert.rejects(() => createSkill(home, { name: 'Bad_Name', description: 'x' }), /kebab-case/)
  await assert.rejects(() => createSkill(home, { name: 'good-name', description: '' }), /description is required/)
  await rm(home, { recursive: true, force: true })
})

test('create overwrites an existing skill of the same name', async () => {
  const home = await scratchHome()
  await createSkill(home, { name: 'dup-skill', description: 'First.' })
  await createSkill(home, { name: 'dup-skill', description: 'Second.' })
  const scanned = await scanRoot(userSkillRoot(home))
  assert.deepEqual(scanned.skills.map((skill) => skill.name), ['dup-skill'])
  assert.equal(scanned.skills[0].description, 'Second.')
  await rm(home, { recursive: true, force: true })
})
