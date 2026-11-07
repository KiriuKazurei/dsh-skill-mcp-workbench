// A deliberately small YAML subset reader/writer for the plugin patch documents
// this plugin owns. It exists because a bundle cannot depend on a YAML package,
// while MCP rows must be added, updated, and removed in the profile patch without
// losing the surrounding comments and bytes.
//
// Supported: block maps, block sequences, flow `[]` and `{}`, single- and
// double-quoted scalars, `true`/`false`/`null`, integers, and plain scalars.
// Unsupported input is reported, never silently coerced: a row this module cannot
// round-trip is refused instead of being rewritten.

/** Indentation width of one level. */
const STEP = 2

/** Leading spaces of a line. */
function indentOf(line) {
  const match = /^ */.exec(line)
  return match ? match[0].length : 0
}

/** A line that carries no content. */
function isBlank(line) {
  return line.trim() === ''
}

/** A whole-line comment or document marker. */
function isComment(line) {
  return /^\s*#/.test(line) || /^(---|\.\.\.)\s*$/.test(line)
}

/** A block-sequence item line, at any indentation. */
function isSeqItem(line) {
  return /^ *-(\s|$)/.test(line)
}

/** Split `key: value` at the first unquoted, space-delimited colon. */
function splitKey(text) {
  let quote = null
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== null) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '#' && index > 0 && /\s/.test(text[index - 1])) return null
    if (char === ':' && (index + 1 >= text.length || /\s/.test(text[index + 1]))) {
      return [text.slice(0, index).trim(), text.slice(index + 1).trim()]
    }
  }
  return null
}

/** Unquote a quoted scalar, honouring the quote's own escape rules. */
function unquote(text) {
  const quote = text[0]
  const body = text.slice(1, -1)
  if (quote === "'") return body.replace(/''/g, "'")
  return body.replace(/\\(["\\/nrt])/g, (match, char) => {
    if (char === 'n') return '\n'
    if (char === 'r') return '\r'
    if (char === 't') return '\t'
    return char
  })
}

/** Parse one scalar token. */
function parseScalar(text) {
  const value = text.trim()
  if (value === '' || value === '~' || value === 'null') return null
  if (value.startsWith('[') && value.endsWith(']')) return parseFlow(value.slice(1, -1))
  if (value.startsWith('{') && value.endsWith('}')) return parseFlowMap(value.slice(1, -1))
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    return unquote(value)
  }
  if (value === 'true' || value === 'True' || value === 'TRUE') return true
  if (value === 'false' || value === 'False' || value === 'FALSE') return false
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return Number(value)
  return value
}

/** Parse a flow sequence body. */
function parseFlow(body) {
  const items = []
  let current = ''
  let quote = null
  let depth = 0
  for (const char of body) {
    if (quote !== null) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      items.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '' || items.length > 0) items.push(current)
  return items.map((item) => parseScalar(item))
}

/** Parse a flow mapping body. */
function parseFlowMap(body) {
  const result = {}
  for (const pair of splitFlow(body)) {
    const split = splitKey(pair)
    if (split === null) continue
    result[unquoteKey(split[0])] = parseScalar(split[1])
  }
  return result
}

/** Split a flow body on top-level commas. */
function splitFlow(body) {
  const parts = []
  let current = ''
  let quote = null
  let depth = 0
  for (const char of body) {
    if (quote !== null) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

/** Strip quotes from a key token. */
function unquoteKey(text) {
  const value = text.trim()
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    return unquote(value)
  }
  return value
}

/** Content lines with their indentation, skipping blanks and comments. */
function meaningful(lines, from) {
  const result = []
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index]
    if (isBlank(line) || isComment(line)) continue
    result.push({ line, index, indent: indentOf(line) })
  }
  return result
}

/**
 * Parse a block node starting at `from`.
 * @returns the parsed value and the index of the first unconsumed line.
 */
function parseNode(lines, from, indent) {
  const rows = meaningful(lines, from)
  const first = rows[0]
  if (first === undefined) return [null, lines.length]
  if (first.indent < indent) return [null, from]
  if (isSeqItem(first.line)) return parseSequence(lines, first.index, first.indent)
  return parseMapping(lines, first.index, first.indent)
}

/** Parse a block sequence whose items sit at `indent`. */
function parseSequence(lines, from, indent) {
  const items = []
  let index = from
  while (index < lines.length) {
    const line = lines[index]
    if (isBlank(line) || isComment(line)) {
      index += 1
      continue
    }
    if (indentOf(line) !== indent || !isSeqItem(line)) break
    const rest = line.slice(indent).replace(/^-\s?/, '')
    if (rest.trim() === '') {
      const [value, next] = parseNode(lines, index + 1, indent + STEP)
      items.push(value)
      index = next
      continue
    }
    const split = splitKey(rest)
    if (split === null) {
      items.push(parseScalar(rest))
      index += 1
      continue
    }
    // An inline mapping start: re-read this line as a mapping at the item's
    // content indent so the whole item is consumed as one map. The content indent
    // is the item indent plus the dash prefix (`- ` or `-   `).
    const prefix = line.slice(indent).slice(0, line.slice(indent).length - rest.length)
    const contentIndent = indent + prefix.length
    const rewritten = lines.slice()
    rewritten[index] = ' '.repeat(contentIndent) + rest
    const [value, next] = parseMapping(rewritten, index, contentIndent)
    items.push(value)
    index = next
  }
  return [items, index]
}

/** Parse a block mapping whose keys sit at `indent`. */
function parseMapping(lines, from, indent) {
  const result = {}
  let index = from
  while (index < lines.length) {
    const line = lines[index]
    if (isBlank(line) || isComment(line)) {
      index += 1
      continue
    }
    const current = indentOf(line)
    if (current < indent) break
    if (current > indent) throw new Error(`yamlrow: unexpected indentation at line ${index + 1}`)
    if (isSeqItem(line)) break
    const split = splitKey(line.slice(indent))
    if (split === null) throw new Error(`yamlrow: cannot read line ${index + 1}: ${line.trim()}`)
    const [key, value] = split
    const name = unquoteKey(key)
    if (value === '') {
      // A sequence may sit at the key's own indentation, which YAML allows; only a
      // deeper child gets the extra level.
      const following = meaningful(lines, index + 1)[0]
      const childIndent = following !== undefined && isSeqItem(following.line) && following.indent === indent
        ? indent
        : indent + STEP
      const [child, next] = parseNode(lines, index + 1, childIndent)
      result[name] = child === null && next === index + 1 ? null : child
      index = next
      continue
    }
    result[name] = parseScalar(value)
    index += 1
  }
  return [result, index]
}

/**
 * Parse a YAML block document (or any indented block of it).
 * @param text - block text whose first meaningful line defines the root indent.
 * @returns the plain JavaScript value.
 */
export function parseBlock(text) {
  const lines = String(text).split(/\r?\n/)
  const first = meaningful(lines, 0)[0]
  if (first === undefined) return null
  const [value] = parseNode(lines, first.index, first.indent)
  return value
}

/** Whether a scalar needs quoting in block style. */
function needsQuotes(value) {
  if (value === '') return true
  if (/^[\s]|[\s]$/.test(value)) return true
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(value)) return true
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return true
  if (/[:#\[\]{}&*!|>'"%@`]/.test(value)) return true
  if (/^[?,\-]/.test(value)) return true
  if (value.includes(': ') || value.endsWith(':')) return true
  if (value.includes('\n')) return true
  // `@` and a backtick are reserved YAML indicators: a plain scalar may not start
  // with them, which is why shipped patches quote `@deepseek-ai/...` module names.
  if (/^[@`]/.test(value)) return true
  return false
}

/** Render one scalar in block style. */
function stringifyScalar(value) {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  const text = String(value)
  if (!needsQuotes(text)) return text
  if (!text.includes("'")) return `'${text.replace(/'/g, "''")}'`
  return `"${text.replace(/(["\\])/g, '\\$1').replace(/\n/g, '\\n')}"`
}

/**
 * Serialize a plain value as block YAML.
 * @param value - object, array, or scalar.
 * @param indent - starting indentation level.
 * @returns block YAML text without a trailing newline.
 */
export function stringifyBlock(value, indent = 0) {
  const pad = ' '.repeat(indent * STEP)
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`
    const lines = []
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        const body = stringifyBlock(item, indent + 1)
        const firstLine = body.split('\n')[0].slice((indent + 1) * STEP)
        lines.push(`${pad}- ${firstLine}`)
        lines.push(...body.split('\n').slice(1))
        continue
      }
      lines.push(`${pad}- ${stringifyScalar(item)}`)
    }
    return lines.join('\n')
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return `${pad}{}`
    const lines = []
    for (const key of keys) {
      const item = value[key]
      const renderedKey = needsQuotes(key) ? stringifyScalar(key) : key
      if (item !== null && typeof item === 'object' && (Array.isArray(item) ? item.length > 0 : Object.keys(item).length > 0)) {
        lines.push(`${pad}${renderedKey}:`)
        lines.push(stringifyBlock(item, indent + 1))
        continue
      }
      if (Array.isArray(item)) {
        lines.push(`${pad}${renderedKey}: []`)
        continue
      }
      if (item !== null && typeof item === 'object') {
        lines.push(`${pad}${renderedKey}: {}`)
        continue
      }
      lines.push(`${pad}${renderedKey}: ${stringifyScalar(item)}`)
    }
    return lines.join('\n')
  }
  return `${pad}${stringifyScalar(value)}`
}
