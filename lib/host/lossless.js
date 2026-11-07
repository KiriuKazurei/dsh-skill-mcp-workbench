// The lossless-JSON boundary the Harness enforces on every tool result and every
// wire value: plain records with only string keys, dense arrays, finite numbers
// that are not negative zero, and no `undefined` anywhere.
//
// The skill registry, the patch reader, and the filesystem scanner all return
// values this plugin did not construct, so any optional field can be absent,
// `undefined`, or a non-finite number. Rather than predict each shape, every value
// that leaves this plugin is normalised here: a bad field becomes `null` (or is
// dropped when it was optional), and a value that still cannot be represented is
// reported so the caller fails loudly instead of silently corrupting the payload.

/** Whether a number is representable as lossless JSON. */
function isLosslessNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)
}

/** Whether a value is already lossless JSON. */
export function isLossless(value) {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (isLosslessNumber(value)) return true
  if (Array.isArray(value)) {
    // The Host rejects a holey or decorated array: every index must be an own
    // property and the array must carry no extra own keys.
    if (value.length !== Reflect.ownKeys(value).length - 1) return false
    return value.every((item, index) => Object.hasOwn(value, index) && isLossless(item))
  }
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) return false
    if (!Reflect.ownKeys(value).every((key) => typeof key === 'string')) return false
    return Object.values(value).every(isLossless)
  }
  return false
}

/** One field that could not be represented, for the diagnostic. */
function describe(value) {
  if (value === undefined) return 'undefined'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'bigint') return 'a bigint'
  if (typeof value === 'function') return 'a function'
  if (typeof value === 'symbol') return 'a symbol'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'a non-lossless array'
  if (typeof value === 'object') return Object.getPrototypeOf(value) === Object.prototype ? 'a non-lossless record' : `a ${value.constructor?.name ?? 'non-plain'} object`
  return typeof value
}

/**
 * Normalise one value into lossless JSON.
 *
 * Records keep their string keys; a key whose value cannot be represented is
 * dropped, which is what an absent optional field looks like on the wire — the
 * same shape an omitted field already produces, so a reader cannot tell a
 * repaired field from one that was never there. Arrays keep their length and
 * replace a bad element with `null`, because a list's positions are meaningful.
 * A value that cannot be represented and has no key to drop becomes `null`.
 *
 * @param value - any value from a service, a scan, or this plugin's own code.
 * @returns a lossless JSON value.
 */
export function toLossless(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (isLosslessNumber(value)) return value
  if (Array.isArray(value)) return value.map((item) => toLossless(item))
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const result = {}
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') continue
      const child = value[key]
      if (child === undefined) continue
      const representable = child === null
        || typeof child === 'string'
        || typeof child === 'boolean'
        || isLosslessNumber(child)
        || Array.isArray(child)
        || (typeof child === 'object' && Object.getPrototypeOf(child) === Object.prototype)
      if (!representable) continue
      result[key] = toLossless(child)
    }
    return result
  }
  return null
}

/**
 * Normalise a value and report what had to change, for tests and diagnostics.
 * @param value - candidate value.
 * @returns the lossless value and the fields that were repaired.
 */
export function normaliseWithReport(value) {
  const repaired = []
  const walk = (candidate, path) => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return candidate
    if (isLosslessNumber(candidate)) return candidate
    if (Array.isArray(candidate)) {
      return candidate.map((item, index) => {
        if (item === undefined) {
          repaired.push(`${path}[${index}] was undefined`)
          return null
        }
        return walk(item, `${path}[${index}]`)
      })
    }
    if (typeof candidate === 'object' && Object.getPrototypeOf(candidate) === Object.prototype) {
      const result = {}
      for (const key of Reflect.ownKeys(candidate)) {
        if (typeof key !== 'string') continue
        const child = candidate[key]
        if (child === undefined) continue
        const representable = child === null
          || typeof child === 'string'
          || typeof child === 'boolean'
          || isLosslessNumber(child)
          || Array.isArray(child)
          || (typeof child === 'object' && Object.getPrototypeOf(child) === Object.prototype)
        if (!representable) {
          repaired.push(`${path}.${key} was ${describe(child)}`)
          continue
        }
        result[key] = walk(child, `${path}.${key}`)
      }
      return result
    }
    repaired.push(`${path} was ${describe(candidate)}`)
    return null
  }
  const normalised = walk(value, 'value')
  return { value: normalised, repaired }
}
