// Mutation check on a scratch copy of the real profile patch: add, edit, rename,
// disable-state read, and remove one MCP row, asserting the file ends where it
// started and that unrelated rows survive byte-identically.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPatch, writePatch, parseRows, upsertRow, removeRow, readMcpRows } from '../lib/host/patch.js'
import { addServer, updateServer, removeServer, listServers, entryIdFor } from '../lib/host/mcp.js'

const live = process.env.DSH_PROFILE_PATCH

/** A scratch profile directory holding a copy of the real patch. */
async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), 'smw-scratch-'))
  const text = live ? await readFile(live, 'utf8') : '# Scratch profile\n- id: unrelated\n  name: example-plugin\n'
  const patch = join(dir, 'cordis.patch.yml')
  await writeFile(patch, text, 'utf8')
  return { dir, patch, original: text }
}

/** Deps wired to the scratch patch, with a recording plugin manager and HMR. */
function deps(patch, dir) {
  const reconciled = []
  return {
    deps: {
      profilePatch: patch,
      home: join(dir, 'home.yml'),
      homeDir: dir,
      pluginManager: {
        async listPlugins() {
          return [
            { entryId: 'mcp-scratch', enabled: true, fiberPhase: 'active' },
            { entryId: 'mcp-renamed', enabled: false, fiberPhase: 'failed' },
          ]
        },
        async setPluginEnabled(id, enabled) {
          return { ok: true, value: { id, enabled } }
        },
      },
      tools: {
        schemas: () => [{ name: 'mcp__scratch__ping' }, { name: 'mcp__scratch__list' }, { name: 'read' }],
      },
      hmr: {
        async runExclusive(operation) {
          return operation()
        },
        async reconcileProfile(ids) {
          reconciled.push(ids)
        },
      },
    },
    reconciled,
  }
}

test('add, edit, rename, and remove round-trip against a copy of the real patch', async () => {
  const { dir, patch, original } = await scratch()
  const wiring = deps(patch, dir)

  const before = parseRows(original)
  const added = await addServer(wiring.deps, {
    serverName: 'scratch',
    transport: 'streamable-http',
    url: 'https://scratch.example.com/mcp',
    headers: 'Authorization: Bearer token\nX-Trace: 1',
    failOnStartupError: true,
  })
  assert.equal(added.id, entryIdFor('scratch'))
  assert.equal(added.changed, true)
  assert.deepEqual(wiring.reconciled.at(-1), ['mcp-scratch'])

  const rows = await readMcpRows([{ label: 'profile', path: patch }])
  const row = rows.find((entry) => entry.id === 'mcp-scratch')
  assert.ok(row, 'the new row is declared')
  assert.equal(row.config.transport, 'streamable-http')
  assert.equal(row.config.url, 'https://scratch.example.com/mcp')
  assert.deepEqual(row.config.headers, { Authorization: 'Bearer token', 'X-Trace': '1' })
  assert.equal(row.config.failOnStartupError, true)

  // Every pre-existing row is still present and unchanged.
  const after = parseRows(await readFile(patch, 'utf8'))
  assert.equal(after.length, before.length + 1)
  for (const originalRow of before) {
    const match = after.find((entry) => entry.id === originalRow.id)
    assert.ok(match, `row ${originalRow.id} survived`)
    assert.deepEqual(match.config, originalRow.config, `row ${originalRow.id} kept its config`)
  }

  const listed = await listServers(wiring.deps)
  const view = listed.rows.find((entry) => entry.id === 'mcp-scratch')
  assert.equal(view.enabled, true)
  assert.equal(view.phase, 'active')
  assert.equal(view.toolCount, 2, 'the published tools prove the connection')
  assert.deepEqual(view.tools, ['list', 'ping'])

  const renamed = await updateServer(wiring.deps, 'mcp-scratch', {
    serverName: 'renamed',
    transport: 'stdio',
    command: 'npx',
    args: '-y\n@pkg/server',
    env: 'TOKEN=abc',
    cwd: 'D:/work',
  })
  assert.equal(renamed.id, 'mcp-renamed')
  assert.equal(renamed.previousId, 'mcp-scratch')
  const renamedRows = await readMcpRows([{ label: 'profile', path: patch }])
  assert.equal(renamedRows.find((entry) => entry.id === 'mcp-scratch'), undefined)
  const renamedRow = renamedRows.find((entry) => entry.id === 'mcp-renamed')
  assert.equal(renamedRow.config.transport, 'stdio')
  assert.deepEqual(renamedRow.config.args, ['-y', '@pkg/server'])
  assert.deepEqual(renamedRow.config.env, { TOKEN: 'abc' })
  assert.equal(renamedRow.config.cwd, 'D:/work')

  const removed = await removeServer(wiring.deps, 'mcp-renamed')
  assert.equal(removed.changed, true)
  const final = parseRows(await readFile(patch, 'utf8'))
  assert.deepEqual(final.map((row) => row.id), before.map((row) => row.id))
  assert.equal(await readFile(patch, 'utf8'), original, 'the file is byte-identical to the original')

  await rm(dir, { recursive: true, force: true })
})

test('a duplicate server name is refused', async () => {
  const { dir, patch } = await scratch()
  const wiring = deps(patch, dir)
  await addServer(wiring.deps, { serverName: 'scratch', transport: 'stdio', command: 'node' })
  await assert.rejects(() => addServer(wiring.deps, { serverName: 'scratch', transport: 'stdio', command: 'node' }), /already/)
  await rm(dir, { recursive: true, force: true })
})

test('the atomic write leaves no temporary sibling behind', async () => {
  const { dir, patch } = await scratch()
  const wiring = deps(patch, dir)
  await addServer(wiring.deps, { serverName: 'scratch', transport: 'stdio', command: 'node' })
  const { readdir } = await import('node:fs/promises')
  const names = await readdir(dir)
  assert.deepEqual(names, ['cordis.patch.yml'], 'only the patch file remains')
  await rm(dir, { recursive: true, force: true })
})
