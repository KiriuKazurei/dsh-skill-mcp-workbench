// Drive the tool's own execute() through the same lossless boundary the Host
// applies, with a registry shaped like the live one. The live failure is in the
// tool path, not the API path, so the tool's return value is what gets checked.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createApi, createToolDefinition, resolvePaths } from '../lib/host/api.js'

const paths = resolvePaths()

/** The Host's lossless-JSON walker, restated so a failure names the field. */
function firstLosslessViolation(value, path = 'value') {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Object.is(value, -0) ? null : `${path} is ${value}`
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstLosslessViolation(value[index], `${path}[${index}]`)
      if (found !== null) return found
    }
    return null
  }
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) return `${path} is not a plain record`
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return `${path} has a non-string key`
      const child = value[key]
      if (child === undefined) return `${path}.${key} is undefined`
      const found = firstLosslessViolation(child, `${path}.${key}`)
      if (found !== null) return found
    }
    return null
  }
  return `${path} is a ${typeof value}`
}

/** A registry shaped like the live one: a runtime provider skill with no path and
 * a non-directory resourceBase, a filesystem skill, and a bundled skill. One entry
 * omits `rank`, which is what produced a `NaN` in the catalog view. */
function liveShapedSkills() {
  return {
    async list() {
      return [
        {
          name: 'cordis-plugin-development',
          description: 'Use when writing or changing a Cordis plugin.',
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'bundled',
          provider: 'runtime',
          rank: 600,
        },
        {
          name: 'office-docx',
          description: 'Create, read, edit, and validate Word documents.',
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'bundled',
          provider: 'runtime',
          rank: 600,
        },
        {
          name: 'user-skill',
          description: 'A filesystem skill.',
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'user-dsh',
          provider: 'filesystem',
          rank: 400,
          path: 'C:/Users/me/.dsh/skills/user-skill/SKILL.md',
          resourceBase: { kind: 'directory', path: 'C:/Users/me/.dsh/skills/user-skill' },
        },
        {
          name: 'no-rank',
          description: 'A skill whose summary carries no rank.',
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'custom',
          provider: 'remote',
        },
        {
          name: 'url-skill',
          description: 'A remote skill.',
          invocation: { modelInvocable: false, userInvocable: true },
          source: 'custom',
          provider: 'remote',
          rank: 300,
          resourceBase: { kind: 'url', url: 'https://example.com/skill' },
        },
      ]
    },
    async get(name) {
      const found = (await this.list()).find((skill) => skill.name === name)
      if (found === undefined) return undefined
      return { ...found, content: `# ${name}\n\nBody.` }
    },
  }
}

function tool(deps = {}) {
  const table = createApi({
    skills: liveShapedSkills(),
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    dshHome: paths.dshHome,
    agentsHome: paths.agentsHome,
    readExtraRoots: async () => [],
    ...deps,
  })
  return createToolDefinition(table, { dshHome: paths.dshHome, ...deps })
}

test('skills.list returns lossless JSON for a live-shaped registry', async () => {
  const value = await tool().execute({ action: 'skills.list' })
  const violation = firstLosslessViolation(value)
  assert.equal(violation, null, `lossless (offender: ${violation})`)
  assert.ok(value.summary.includes('5 global skills'), `summary names the count: ${value.summary}`)
  assert.equal(value.detail.total, 5)
  // The entry with no rank must not become NaN, which is not lossless JSON.
  const noRank = value.detail.groups.flatMap((group) => group.skills).find((skill) => skill.name === 'no-rank')
  assert.ok(noRank, 'the rankless entry is listed')
  assert.equal(noRank.rank, null, 'an absent rank is null, never NaN')
})

test('the normaliser repairs every non-lossless shape a service can return', async () => {
  const { normaliseWithReport, toLossless, isLossless } = await import('../lib/host/lossless.js')
  const awkward = {
    fine: 'text',
    missing: undefined,
    notANumber: Number('x'),
    infinite: Number.POSITIVE_INFINITY,
    negativeZero: -0,
    big: 10n,
    when: new Date(),
    list: [1, undefined, Number.NaN, 'ok'],
    nested: { alsoMissing: undefined, deep: { deeper: Number.NaN } },
  }
  const result = normaliseWithReport(awkward)
  assert.equal(firstLosslessViolation(result.value), null, 'the normalised value is lossless')
  assert.ok(isLossless(result.value), 'isLossless agrees')
  // A record field either carries a real value or is absent, so a repaired field
  // disappears rather than becoming a null the caller must special-case.
  assert.equal(result.value.missing, undefined, 'an undefined key is dropped')
  assert.equal(result.value.notANumber, undefined, 'NaN is dropped from a record')
  assert.equal(result.value.infinite, undefined, 'Infinity is dropped from a record')
  assert.equal(result.value.negativeZero, undefined, 'negative zero is dropped from a record')
  assert.equal(result.value.big, undefined, 'a bigint is dropped from a record')
  assert.equal(result.value.when, undefined, 'a Date is dropped from a record')
  assert.equal(result.value.fine, 'text', 'a real field survives')
  // Array positions are meaningful, so a bad element becomes null.
  assert.deepEqual(result.value.list, [1, null, null, 'ok'], 'bad array elements become null')
  assert.equal(result.value.nested.deep.deeper, undefined, 'a nested NaN is dropped')
  assert.equal(result.value.nested.alsoMissing, undefined, 'a nested absent field is dropped')
  assert.ok(result.repaired.length > 0, 'the report names what changed')
  assert.deepEqual(toLossless(awkward), result.value, 'toLossless and the report agree')
  // A bad scalar standing alone becomes null, because there is no key to drop.
  assert.equal(toLossless(Number.NaN), null)
  assert.equal(toLossless(10n), null)
  assert.equal(toLossless(new Date()), null)
  assert.equal(isLossless({ ok: 1 }), true)
  assert.equal(isLossless({ bad: undefined }), false)
  assert.equal(isLossless([1, , 2]), false, 'a holey array is not lossless')
})

test('skills.read returns lossless JSON for every live-shaped skill', async () => {
  for (const name of ['cordis-plugin-development', 'office-docx', 'user-skill', 'no-rank', 'url-skill']) {
    const value = await tool().execute({ action: 'skills.read', name })
    const violation = firstLosslessViolation(value)
    assert.equal(violation, null, `${name} is lossless (offender: ${violation})`)
    assert.equal(value.detail.name, name)
  }
})

test('the render contract answers blocks for every action', async () => {
  const definition = tool()
  for (const args of [{ action: 'skills.list' }, { action: 'skills.read', name: 'office-docx' }, { action: 'mcp.list' }]) {
    const value = await definition.execute(args)
    const content = definition.output.render(args, value)
    assert.ok(Array.isArray(content), `${args.action} renders an array`)
    assert.ok(content.every((block) => typeof block.type === 'string'), `${args.action} blocks are typed`)
  }
})

test('the tool passes the calling Agent as the skill scope', async () => {
  // A skill registered by an agent preset lives in that preset's layer, so the
  // lookup must carry the Agent as its scope; without it the skill is invisible.
  const seen = []
  const scopedSkills = {
    async list(options) {
      seen.push(options)
      return (await liveShapedSkills().list(options)).concat([{
        name: 'cordis-plugin-development',
        description: 'A preset-layer skill.',
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'bundled',
        provider: 'runtime',
        rank: 600,
      }])
    },
    async get(name, options) {
      seen.push(options)
      const found = (await this.list(options)).find((skill) => skill.name === name)
      return found === undefined ? undefined : { ...found, content: `# ${name}\n\nBody.` }
    },
  }
  const agent = { id: 'agent-1' }
  const definition = tool({ skills: scopedSkills })

  const value = await definition.execute({ action: 'skills.list' }, { agent, signal: undefined })
  assert.equal(seen.length > 0, true, 'the registry was consulted')
  assert.equal(seen[0].scope, agent, 'the Agent is the scope')
  assert.equal(seen[0].cwd, undefined, 'the lookup carries no cwd: the page is a global surface')
  assert.ok(value.summary.includes('cordis-plugin-development'), `the preset skill is listed: ${value.summary}`)

  const body = await definition.execute({ action: 'skills.read', name: 'cordis-plugin-development' }, { agent })
  assert.equal(body.detail.name, 'cordis-plugin-development')
  assert.equal(seen.at(-1).scope, agent, 'the read carries the same scope')
})

test('a call without an Agent carries no scope at all', async () => {
  const seen = []
  const definition = tool({
    skills: {
      async list(options) {
        seen.push(options)
        return liveShapedSkills().list(options)
      },
      async get(name, options) {
        seen.push(options)
        return liveShapedSkills().get(name, options)
      },
    },
  })
  await definition.execute({ action: 'skills.list' }, {})
  assert.equal(seen[0].scope, undefined, 'no scope is invented')
  assert.equal(seen[0].cwd, undefined, 'no cwd is invented either')
})
