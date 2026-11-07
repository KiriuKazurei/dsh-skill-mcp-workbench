// Smoke test for the workbench Host half: patch row round-trips, the YAML subset,
// and the skill scanner. Run with `node --test tests/host.spec.mjs`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { parseBlock, stringifyBlock } from '../lib/host/yamlrow.js'
import { parseRows, upsertRow, removeRow, readMcpRows, MCP_CLIENT_MODULE } from '../lib/host/patch.js'
import { normalizeServer, entryIdFor } from '../lib/host/mcp.js'
import { scanRoot, externalRoots, userSkillRoot } from '../lib/host/skills.js'

const SAMPLE = `# profile patch
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      magpie:
        baseURL: http://127.0.0.1:3425/v1
- id: mcp-demo
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    transport: streamable-http
    serverName: demo
    url: https://example.com/mcp
- insert:
    - id: bundled-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: bundled
        command: npx
`

test('parses rows and keeps unrelated rows intact', () => {
  const rows = parseRows(SAMPLE)
  assert.equal(rows.length, 3)
  const mcp = rows.find((row) => row.id === 'mcp-demo')
  assert.equal(mcp.name, MCP_CLIENT_MODULE)
  assert.equal(mcp.config.transport, 'streamable-http')
  assert.equal(mcp.config.url, 'https://example.com/mcp')
  const bundled = rows.find((row) => row.id === 'bundled-mcp')
  assert.equal(bundled.inserted, true)
  assert.equal(bundled.config.command, 'npx')
})

test('adds a row and preserves comments and neighbours', () => {
  const next = upsertRow(SAMPLE, {
    id: 'mcp-local',
    name: MCP_CLIENT_MODULE,
    config: { transport: 'stdio', serverName: 'local', command: 'node', args: ['server.js'], env: { TOKEN: 'abc' } },
  })
  assert.ok(next.startsWith('# profile patch\n'))
  assert.ok(next.includes('- id: llm-pi-ai'))
  assert.ok(next.includes('- id: mcp-demo'))
  assert.ok(next.includes('- id: bundled-mcp'))
  const rows = parseRows(next)
  const added = rows.find((row) => row.id === 'mcp-local')
  assert.deepEqual(added.config.args, ['server.js'])
  assert.deepEqual(added.config.env, { TOKEN: 'abc' })
})

test('updates only the config block of one row', () => {
  const next = upsertRow(SAMPLE, {
    id: 'mcp-demo',
    name: MCP_CLIENT_MODULE,
    config: { transport: 'streamable-http', serverName: 'demo', url: 'https://example.org/mcp', headers: { Authorization: 'Bearer x' } },
  })
  assert.ok(!next.includes('example.com/mcp'))
  assert.ok(next.includes('example.org/mcp'))
  const rows = parseRows(next)
  assert.equal(rows.length, 3)
  assert.equal(rows.find((row) => row.id === 'llm-pi-ai').config.providers.magpie.baseURL, 'http://127.0.0.1:3425/v1')
})

test('round-trips a written config', () => {
  const config = {
    transport: 'stdio',
    serverName: 'round-trip',
    command: 'npx',
    args: ['-y', '@scope/pkg', '--flag', 'value with spaces'],
    env: { EMPTY: '', COLON: 'a: b', HASH: 'x # y', QUOTE: "it's" },
    cwd: 'D:/work',
    failOnStartupError: true,
  }
  const text = `- id: x\n  name: '${MCP_CLIENT_MODULE}'\n  config:\n${stringifyBlock(config, 2)}\n`
  const parsed = parseRows(text)[0]
  assert.deepEqual(parsed.config, config)
})

test('refuses rows carrying an expression', () => {
  const document = `- id: mcp-expr\n  name: '${MCP_CLIENT_MODULE}'\n  config: !!js someExpression()\n`
  assert.throws(() => upsertRow(document, { id: 'mcp-expr', name: MCP_CLIENT_MODULE, config: { transport: 'stdio', serverName: 'e', command: 'x' } }), /!!js/)
})

test('removes one row and leaves the rest', () => {
  const next = removeRow(SAMPLE, 'mcp-demo')
  const rows = parseRows(next)
  assert.equal(rows.find((row) => row.id === 'mcp-demo'), undefined)
  assert.equal(rows.find((row) => row.id === 'llm-pi-ai').config.providers.magpie.baseURL, 'http://127.0.0.1:3425/v1')
  assert.equal(rows.find((row) => row.id === 'bundled-mcp').inserted, true)
})

test('parses quoted scalars, flow collections, and nested maps', () => {
  const value = parseBlock(`name: demo\ndescription: "Use when: a thing"\nargs: [a, 'b c', 3]\nmeta: {}\nflags: true\n`)
  assert.equal(value.name, 'demo')
  assert.equal(value.description, 'Use when: a thing')
  assert.deepEqual(value.args, ['a', 'b c', 3])
  assert.deepEqual(value.meta, {})
  assert.equal(value.flags, true)
})

test('normalises server forms', () => {
  assert.deepEqual(normalizeServer({ serverName: 'ok_name-1', transport: 'streamable-http', url: 'https://x.dev/mcp' }), {
    transport: 'streamable-http', serverName: 'ok_name-1', url: 'https://x.dev/mcp', headers: {}, failOnStartupError: false,
  })
  assert.deepEqual(normalizeServer({ serverName: 'ok', transport: 'stdio', command: 'npx', args: '-y\npkg', env: 'A=1\nB=2' }).args, ['-y', 'pkg'])
  assert.throws(() => normalizeServer({ serverName: 'bad name', transport: 'stdio', command: 'x' }), /serverName/)
  assert.throws(() => normalizeServer({ serverName: 'ok', transport: 'streamable-http', url: 'ftp://x' }), /http/)
})

test('entry ids follow the documented convention', () => {
  assert.equal(entryIdFor('demo'), 'mcp-demo')
})

test('scans a root for bundles and flat files', async () => {
  const root = join(process.cwd(), 'tests', 'fixtures', 'roots', 'claude')
  const scanned = await scanRoot(root)
  assert.equal(scanned.exists, true)
  const names = scanned.skills.map((skill) => skill.name).sort()
  assert.deepEqual(names, ['bundle-skill', 'flat-skill'])
  const bundle = scanned.skills.find((skill) => skill.name === 'bundle-skill')
  assert.equal(bundle.kind, 'bundle')
  assert.equal(bundle.invocation.userInvocable, true)
  assert.equal(bundle.description, 'A bundled skill fixture.')
  const flat = scanned.skills.find((skill) => skill.name === 'flat-skill')
  assert.equal(flat.kind, 'flat')
  assert.equal(flat.invocation.modelInvocable, false)
})

test('reports a missing root instead of throwing', async () => {
  const scanned = await scanRoot(join(process.cwd(), 'tests', 'fixtures', 'does-not-exist'))
  assert.equal(scanned.exists, false)
  assert.deepEqual(scanned.skills, [])
})

test('the write target is the user skill root', () => {
  assert.equal(userSkillRoot('C:/Users/me/.dsh').replace(/\\/g, '/'), 'C:/Users/me/.dsh/skills')
})

test('reads the live profile patch without changing it', async () => {
  const path = process.env.DSH_PROFILE_PATCH
  if (path === undefined) return
  const before = await readFile(path, 'utf8')
  const rows = await readMcpRows([{ label: 'profile', path }])
  assert.ok(Array.isArray(rows))
  const after = await readFile(path, 'utf8')
  assert.equal(before, after)
})

test('external roots include the agent homes', () => {
  const roots = externalRoots({ DSH_HOME: 'C:/dsh', DSH_AGENTS_HOME: 'C:/agents' }, 'C:/Users/me')
  const labels = roots.map((root) => root.label)
  assert.ok(labels.includes('user-dsh'))
  assert.ok(labels.includes('user-agents'))
  assert.ok(labels.includes('claude-code'))
  assert.ok(labels.includes('codex'))
  assert.ok(roots.some((root) => root.path === resolve('C:/agents/skills')))
  assert.ok(roots.every((root) => isAbsolute(root.path)))
})
