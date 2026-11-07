// The tool contract the Harness enforces on every tool result: the value must be
// lossless JSON (plain records, dense arrays, finite numbers, no undefined), the
// output schema must be object-rooted, and `render` must return content blocks.
// These tests drive the real API table with a stub registry so a regression in
// either direction fails here instead of in the running profile.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createApi, createToolDefinition, resolvePaths } from '../lib/host/api.js'
import { join } from 'node:path'

const paths = resolvePaths()

/** The lossless-JSON rules the Host's own value walker applies. */
function isLossless(value) {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0)
  if (Array.isArray(value)) return value.every(isLossless)
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) return false
    if (!Reflect.ownKeys(value).every((key) => typeof key === 'string')) return false
    return Object.values(value).every(isLossless)
  }
  return false
}

/** A registry whose summaries carry the awkward shapes a real one can return. */
function stubSkills() {
  return {
    async list() {
      return [
        {
          name: 'plain',
          description: 'A plain skill.',
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'user-dsh',
          provider: 'filesystem',
          rank: 400,
          path: 'C:/skills/plain/SKILL.md',
        },
        {
          name: 'awkward',
          description: 'A skill with optional fields absent.',
          whenToUse: undefined,
          invocation: { modelInvocable: false, userInvocable: true },
          source: 'project-dsh',
          provider: 'filesystem',
          rank: 100,
          resourceBase: { kind: 'directory', path: 'C:/proj/.dsh/skills/awkward' },
        },
      ]
    },
    async get(name) {
      if (name !== 'plain') return undefined
      return {
        name: 'plain',
        description: 'A plain skill.',
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'user-dsh',
        provider: 'filesystem',
        path: 'C:/skills/plain/SKILL.md',
        resourceBase: { kind: 'directory', path: 'C:/skills/plain' },
        content: '# Plain\n\nBody.',
      }
    },
  }
}

function api() {
  return createApi({
    skills: stubSkills(),
    sessionSkills: {
      async list() {
        return { skills: [{ name: 'preset-skill', description: 'From a preset.', modelInvocable: true }] }
      },
    },
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    dshHome: paths.dshHome,
    agentsHome: paths.agentsHome,
    pluginManager: {
      async listPlugins() {
        return [{ entryId: 'mcp-x', enabled: true, fiberPhase: 'active', moduleName: '@deepseek-ai/dsh-mcp-client' }]
      },
    },
    tools: { schemas: () => [{ name: 'mcp__x__ping' }] },
    readExtraRoots: async () => [],
  })
}

test('every read method returns lossless JSON', async () => {
  const table = api()
  for (const method of ['info', 'skills.catalog', 'skills.read', 'skills.roots', 'skills.session', 'mcp.list']) {
    const params = method === 'skills.read' ? { name: 'plain' } : {}
    const value = await table.invoke(method, params, { readOnly: true })
    assert.ok(isLossless(value), `${method} returned a lossless value`)
    assert.notEqual(value, undefined, `${method} returned a value`)
  }
})

test('the catalog carries the documented fields with no undefined holes', async () => {
  const catalog = await api().invoke('skills.catalog', {}, { readOnly: true })
  assert.equal(catalog.total, 1)
  const names = catalog.groups.flatMap((group) => group.skills.map((skill) => skill.name))
  assert.deepEqual(names, ['plain'], 'the rankless, project-sourced entry is filtered out')
  for (const group of catalog.groups) {
    for (const skill of group.skills) {
      assert.equal(typeof skill.name, 'string')
      assert.equal(typeof skill.description, 'string')
      assert.equal(typeof skill.modelInvocable, 'boolean')
      assert.equal(typeof skill.userInvocable, 'boolean')
      assert.equal(typeof skill.rank, 'number')
      assert.ok(!('whenToUse' in skill) || typeof skill.whenToUse === 'string')
    }
  }
})

test('project-scoped sources never reach the global catalog', async () => {
  const table = createApi({
    skills: {
      async list() {
        return [
          { name: 'global-one', description: 'Global.', invocation: { modelInvocable: true, userInvocable: true }, source: 'user-dsh', provider: 'filesystem', rank: 400 },
          { name: 'project-dsh-one', description: 'Project.', invocation: { modelInvocable: true, userInvocable: true }, source: 'project-dsh', provider: 'filesystem', rank: 100 },
          { name: 'project-agents-one', description: 'Project.', invocation: { modelInvocable: true, userInvocable: true }, source: 'project-agents', provider: 'filesystem', rank: 200 },
          { name: 'runtime-one', description: 'Runtime.', invocation: { modelInvocable: true, userInvocable: true }, source: 'runtime', provider: 'runtime', rank: 600 },
        ]
      },
      async get() {
        return undefined
      },
    },
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    dshHome: paths.dshHome,
    readExtraRoots: async () => [],
  })
  const catalog = await table.invoke('skills.catalog', {}, { readOnly: true })
  assert.equal(catalog.total, 2, 'only the global and runtime entries count')
  assert.deepEqual(
    catalog.groups.flatMap((group) => group.skills.map((skill) => skill.name)).sort(),
    ['global-one', 'runtime-one'],
    'both project sources are excluded',
  )
})

test('the session catalog reaches preset-layer skills', async () => {
  const value = await api().invoke('skills.session', {}, { readOnly: true })
  assert.deepEqual(value.skills.map((skill) => skill.name), ['preset-skill'])
})

test('the tool definition satisfies the output contract', async () => {
  const table = api()
  const tool = createToolDefinition(table, table)
  assert.equal(tool.name, 'skill_mcp_manage')
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(typeof tool.output.render, 'function')

  const value = await tool.execute({ action: 'mcp.list' })
  assert.ok(isLossless(value), 'the tool value is lossless JSON')
  assert.equal(typeof value.summary, 'string')
  assert.equal(typeof value.detail, 'object')

  // The render contract takes (arguments, value) and answers content blocks.
  const content = tool.output.render({ action: 'mcp.list' }, value)
  assert.ok(Array.isArray(content), 'render returns an array of blocks')
  assert.ok(content.every((block) => typeof block === 'object' && typeof block.type === 'string'), 'each block is typed')
  assert.equal(content[0].type, 'text')
  assert.ok(content[0].text.includes('MCP rows'), 'the rendered text is the summary')
  assert.ok(content.some((block) => block.type === 'text'), 'a text block is present')
})

test('the tool renders every action without throwing', async () => {
  const tool = createToolDefinition(api(), api())
  for (const action of ['skills.list', 'skills.read', 'mcp.list']) {
    const value = await tool.execute({ action, name: 'plain' })
    const content = tool.output.render({ action }, value)
    assert.ok(Array.isArray(content) && content.length > 0, `${action} renders content`)
    assert.ok(isLossless(value), `${action} is lossless`)
  }
})

test('the agent MCP list omits connection settings that may contain secrets', async () => {
  const row = {
    id: 'mcp-example', enabled: true, phase: 'active', transport: 'stdio',
    layer: 'profile', toolCount: 1, tools: ['mcp__example__ping'],
    command: 'example', args: ['argument-secret'], env: { TOKEN: 'env-secret' },
    headers: { Authorization: 'header-secret' }, url: 'https://example.org/url-secret',
  }
  const tool = createToolDefinition({ async invoke() { return { rows: [row] } } }, {})
  const value = await tool.execute({ action: 'mcp.list' })
  assert.match(value.summary, /mcp-example.*active.*stdio/)
  assert.deepEqual(value.detail.rows[0].tools, ['mcp__example__ping'])
  assert.doesNotMatch(JSON.stringify(value), /-secret/)
})
