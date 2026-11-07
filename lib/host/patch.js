// Profile and home patch documents: read the Loader rows a deployment declares,
// and add, update, or remove the MCP rows this plugin owns.
//
// Editing is line-oriented so comments, blank lines, and the bytes of every other
// row survive. A row whose body this module cannot read back is refused rather
// than rewritten, which keeps hand-written `!!js` rows and foreign formatting
// intact. Writing is atomic: a temporary sibling plus rename.

import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseBlock, stringifyBlock } from './yamlrow.js'

/** Loader module this plugin reads and writes MCP rows for. */
export const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/** Top-level sequence item line. */
const ROW_START = /^-(\s|$)/

/** A `key:` line at a given indentation. */
function keyAt(line, indent, key) {
  return new RegExp(`^ {${indent}}${key}:(\\s|$)`).test(line)
}

/** Indentation of a line. */
function indentOf(line) {
  const match = /^ */.exec(line)
  return match ? match[0].length : 0
}

/** A line that carries no content. */
function isBlank(line) {
  return line.trim() === ''
}

/** A whole-line comment. */
function isComment(line) {
  return /^\s*#/.test(line)
}

/**
 * Read a patch document.
 * @param path - absolute patch file path.
 * @returns the text and whether the file exists.
 */
export async function readPatch(path) {
  try {
    return { text: await readFile(path, 'utf8'), exists: true }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { text: '', exists: false }
    throw error
  }
}

/** Split a document into top-level row blocks with absolute line ranges. */
function blocksOf(lines) {
  const blocks = []
  let start = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (ROW_START.test(lines[index])) {
      if (start >= 0) blocks.push({ start, end: index })
      start = index
    }
  }
  if (start >= 0) blocks.push({ start, end: lines.length })
  return blocks
}

/** Content lines of one row, with the leading dash normalised to two spaces. */
function rowContent(lines, block) {
  const first = lines[block.start]
  if (/^-\s*$/.test(first)) return lines.slice(block.start + 1, block.end)
  return ['  ' + first.slice(2), ...lines.slice(block.start + 1, block.end)]
}

/** Locate a row's `config:` line. */
function configLineOf(lines, block) {
  for (let index = block.start; index < block.end; index += 1) {
    const line = lines[index]
    if (isBlank(line) || isComment(line)) continue
    if (indentOf(line) === 2 && keyAt(line, 2, 'config')) return index
  }
  return -1
}

/** End of a `config:` block: the next line back at indentation 2 or less. */
function configBlockEnd(lines, from, limit) {
  for (let index = from; index < limit; index += 1) {
    const line = lines[index]
    if (isBlank(line) || isComment(line)) continue
    if (indentOf(line) <= 2) return index
  }
  return limit
}

/** Parse one row body into a plain object, or report why it cannot. */
function parseRow(lines, block) {
  const content = rowContent(lines, block)
  try {
    const value = parseBlock(content.join('\n'))
    return value !== null && typeof value === 'object' ? value : null
  } catch (error) {
    return { __unreadable: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Parse a patch document into flat rows.
 *
 * Entries declared inside a top-level `insert:` list are returned as their own
 * rows with `inserted: true` and the owning block, because bundle patches declare
 * plugin rows that way.
 *
 * @param text - patch document text.
 * @returns rows with id, name, config, line ranges, and parse state.
 */
export function parseRows(text) {
  const lines = String(text).split(/\r?\n/)
  const rows = []
  for (const block of blocksOf(lines)) {
    const parsed = parseRow(lines, block)
    if (parsed !== null && parsed.__unreadable === undefined && Array.isArray(parsed.insert)) {
      for (const item of parsed.insert) {
        if (item === null || typeof item !== 'object') continue
        rows.push({
          id: typeof item.id === 'string' ? item.id : null,
          name: typeof item.name === 'string' ? item.name : null,
          disabled: item.disabled === true,
          config: item.config !== null && typeof item.config === 'object' ? item.config : null,
          inserted: true,
          block,
          unreadable: null,
        })
      }
      continue
    }
    if (parsed === null) continue
    const configLine = configLineOf(lines, block)
    rows.push({
      id: typeof parsed.id === 'string' ? parsed.id : null,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      disabled: parsed.disabled === true,
      hasConfig: configLine >= 0,
      configLine,
      configEnd: configLine >= 0 ? configBlockEnd(lines, configLine + 1, block.end) : -1,
      config: parsed.config !== null && typeof parsed.config === 'object' ? parsed.config : null,
      inserted: false,
      block,
      unreadable: parsed.__unreadable ?? null,
    })
  }
  return rows
}

/** Whether a row body holds an expression this module must not rewrite. */
function hasExpression(lines, block) {
  return lines.slice(block.start, block.end).some((line) => /!!js/.test(line))
}

/** Quote a scalar only when the plain form would not round-trip. */
function quoteIfNeeded(value) {
  const text = String(value)
  if (/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(text)) return text
  return stringifyBlock(text)
}

/**
 * Insert or update one row's configuration.
 *
 * An existing row keeps its position, comments, and `name`; only its `config:`
 * block is replaced. Rows inside an `insert:` list, rows carrying a `!!js`
 * expression, and unreadable rows are refused.
 *
 * @param text - patch document text.
 * @param row - `{ id, name, config }`.
 * @returns the next document text.
 */
export function upsertRow(text, row) {
  const lines = String(text).split(/\r?\n/)
  for (const candidate of parseRows(text)) {
    if (candidate.id !== row.id || candidate.inserted) continue
    if (candidate.unreadable !== null) {
      throw new Error(`patch row "${row.id}" could not be read back and is left untouched`)
    }
    const block = candidate.block
    if (hasExpression(lines, block)) {
      throw new Error(`patch row "${row.id}" contains a !!js expression and is left untouched`)
    }
    if (row.name !== undefined && candidate.name !== undefined && candidate.name !== row.name) {
      throw new Error(`patch row "${row.id}" declares module "${candidate.name}", expected "${row.name}"`)
    }
    const body = stringifyBlock(row.config, 2).split('\n')
    if (candidate.hasConfig) {
      return [
        ...lines.slice(0, candidate.configLine),
        '  config:',
        ...body,
        ...lines.slice(candidate.configEnd),
      ].join('\n')
    }
    return [...lines.slice(0, block.end), '  config:', ...body, ...lines.slice(block.end)].join('\n')
  }
  const header = [`- id: ${quoteIfNeeded(row.id)}`]
  if (row.name !== undefined) header.push(`  name: ${quoteIfNeeded(row.name)}`)
  header.push('  config:')
  const trimmed = [...lines]
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') trimmed.pop()
  return [...trimmed, '', ...header, ...stringifyBlock(row.config, 2).split('\n')].join('\n') + '\n'
}

/**
 * Remove every top-level row carrying one id.
 * @param text - patch document text.
 * @param id - row id.
 * @returns the next document text, or the input when nothing matched.
 */
export function removeRow(text, id) {
  const lines = String(text).split(/\r?\n/)
  const blocks = blocksOf(lines)
  const drop = new Set()
  for (const block of blocks) {
    const parsed = parseRow(lines, block)
    if (parsed !== null && parsed.__unreadable === undefined && parsed.id === id && !Array.isArray(parsed.insert)) {
      for (let index = block.start; index < block.end; index += 1) drop.add(index)
    }
  }
  if (drop.size === 0) return text
  const keep = lines.filter((line, index) => !drop.has(index))
  while (keep.length > 0 && keep[keep.length - 1] === '') keep.pop()
  return keep.join('\n') + '\n'
}

/**
 * Write a patch document atomically.
 * @param path - absolute patch file path.
 * @param text - complete document text.
 */
export async function writePatch(path, text) {
  const temporary = join(dirname(path), `.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`)
  await writeFile(temporary, text, { mode: 0o600 })
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

/**
 * Read every MCP row declared across the given patch layers.
 * @param layers - `{ label, path }` rows to read, in precedence order.
 * @returns one row per declaration with its layer and raw config.
 */
export async function readMcpRows(layers) {
  const found = []
  for (const layer of layers) {
    const { text } = await readPatch(layer.path)
    for (const row of parseRows(text)) {
      if (row.name !== MCP_CLIENT_MODULE) continue
      found.push({
        id: row.id,
        module: row.name,
        layer: layer.label,
        path: layer.path,
        disabled: row.disabled,
        config: row.config ?? {},
        unreadable: row.unreadable,
        inserted: row.inserted,
      })
    }
  }
  return found
}
