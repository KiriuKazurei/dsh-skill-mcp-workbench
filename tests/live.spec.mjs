// Live check of the Host half's data path against the real profile, without
// mutating anything: the same modules the route handler imports are driven with
// the real patch paths and the real skills registry is replaced by a stub that
// reports what the route would have asked for.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readMcpRows } from '../lib/host/patch.js'
import { listServers, normalizeServer, entryIdFor } from '../lib/host/mcp.js'
import { scanExternalRoots } from '../lib/host/skills.js'
import { createApi, resolvePaths } from '../lib/host/api.js'
import { join } from 'node:path'

const paths = resolvePaths()

test('the live profile patch parses into MCP rows', async () => {
  const rows = await readMcpRows([
    { label: 'home', path: paths.home },
    { label: 'profile', path: paths.profilePatch },
  ])
  assert.ok(Array.isArray(rows))
  for (const row of rows) {
    assert.equal(row.module, '@deepseek-ai/dsh-mcp-client')
    assert.ok(typeof row.id === 'string' && row.id.length > 0, 'every row carries an id')
    assert.ok(row.config.transport === 'stdio' || row.config.transport === 'streamable-http', 'a known transport')
  }
  console.log(`live MCP rows: ${rows.length} -> ${rows.map((row) => `${row.id}@${row.layer}`).join(', ') || 'none'}`)
})

test('listServers answers with the live rows and status fields', async () => {
  const servers = await listServers({
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    pluginManager: undefined,
    tools: undefined,
  })
  assert.ok(Array.isArray(servers.rows))
  for (const row of servers.rows) {
    assert.equal(typeof row.serverName, 'string')
    assert.equal(typeof row.enabled, 'boolean')
    assert.equal(typeof row.toolCount, 'number')
    assert.ok(Array.isArray(row.tools))
  }
  assert.equal(servers.profilePatch, paths.profilePatch)
})

test('the external scan finds the real machine roots', async () => {
  const roots = await scanExternalRoots([])
  assert.ok(roots.length >= 5, 'the documented roots are all scanned')
  const labels = roots.map((root) => root.label)
  for (const expected of ['user-dsh', 'user-agents', 'claude-code', 'codex', 'cursor']) {
    assert.ok(labels.includes(expected), `${expected} is scanned`)
  }
  const total = roots.reduce((sum, root) => sum + root.skills.length, 0)
  console.log(`machine skill roots: ${roots.length}, skills found: ${total}`)
  console.log(roots.map((root) => `  ${root.label} ${root.path} -> ${root.skills.length}${root.exists ? '' : ' (absent)'}`).join('\n'))
})

test('the API method table answers info', async () => {
  const api = createApi({
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    dshHome: paths.dshHome,
    agentsHome: paths.agentsHome,
    bundledSkillDir: paths.bundledSkillDir,
    skills: undefined,
    pluginManager: undefined,
    tools: undefined,
    hmr: undefined,
    readExtraRoots: async () => [],
  })
  const info = await api.invoke('info')
  assert.equal(info.profilePatch, paths.profilePatch)
  assert.equal(info.userSkillRoot, join(paths.dshHome, 'skills'), 'the write target is the user skill root')
  assert.equal(info.available.skills, false)
  assert.equal(info.available.pluginManager, false)
  const readOnly = await api.invoke('mcp.list', {}, { readOnly: true })
  assert.ok(Array.isArray(readOnly.rows))
  await assert.rejects(() => api.invoke('mcp.add', { server: { serverName: 'x', transport: 'stdio', command: 'y' } }, { readOnly: true }), /user-only/)
})

test('the read-only guard blocks every mutating method', async () => {
  const api = createApi({ profilePatch: paths.profilePatch, home: paths.home, homeDir: paths.dshHome, dshHome: paths.dshHome })
  for (const method of ['skills.import', 'skills.create', 'mcp.add', 'mcp.update', 'mcp.remove', 'mcp.enabled']) {
    await assert.rejects(() => api.invoke(method, {}, { readOnly: true }), /user-only/, `${method} must stay user-only`)
  }
  await assert.rejects(() => api.invoke('nope', {}), /unknown method/)
})
