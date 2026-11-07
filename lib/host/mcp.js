// MCP server operations for the workbench: the `@deepseek-ai/dsh-mcp-client` rows
// a deployment declares, the writes that add, change, or remove them, and the live
// facts that say whether a row is actually connected.
//
// A row lives in a patch layer. This module writes only the profile layer's
// `cordis.patch.yml`, keeps every other row byte-identical, and asks the Harness to
// reconcile the row afterwards, so the client reconnects without a restart. Enable
// and disable go through `pluginManager`, which owns the documented patch rules for
// a row's `disabled` flag.

import { join } from 'node:path'
import { MCP_CLIENT_MODULE, readMcpRows, readPatch, removeRow, upsertRow, writePatch } from './patch.js'

/** Entry id convention for a managed row. */
export function entryIdFor(serverName) {
  return `mcp-${serverName}`
}

/** The public tool-name prefix one connected server publishes. */
const TOOL_PREFIX = 'mcp__'

/** The `serverName` grammar the client enforces. */
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** Layers a row can be declared in, highest precedence first. */
export function layersOf(deps) {
  const home = deps.home ?? join(deps.homeDir ?? '.', 'cordis.patch.yml')
  const profile = deps.profilePatch ?? home
  return [
    { label: 'home', path: home },
    { label: 'profile', path: profile },
  ]
}

/** Coerce a list input that may arrive as an array or a newline-separated string. */
function arrayOf(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter((item) => item !== '')
  if (typeof value === 'string') return value.split(/\r?\n/).map((item) => item.trim()).filter((item) => item !== '')
  return []
}

/** Coerce a string map input that may arrive as an object or `k=v` / `k: v` lines. */
function recordOf(value) {
  const result = {}
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined || item === null) continue
      result[String(key)] = String(item)
    }
    return result
  }
  for (const line of arrayOf(value)) {
    const equals = line.indexOf('=')
    const colon = line.indexOf(':')
    // Environment values legitimately contain ':' (for example a Windows PATH),
    // so an '=' anywhere wins; otherwise the first ':' separates a header.
    const split = equals >= 0 && (colon < 0 || equals < colon) ? equals : colon
    if (split <= 0) continue
    result[line.slice(0, split).trim()] = line.slice(split + 1).trim()
  }
  return result
}

/**
 * Validate and normalise one server form.
 * @param input - `{ serverName, transport, url | command, args, env, cwd, headers, failOnStartupError }`.
 * @returns the plugin config the Loader row carries.
 */
export function normalizeServer(input) {
  const serverName = String(input?.serverName ?? '').trim()
  if (!SERVER_NAME.test(serverName)) {
    throw new Error('serverName must be 1-32 characters using letters, digits, "_" or "-"')
  }
  const transport = input?.transport === 'stdio' ? 'stdio' : 'streamable-http'
  const config = { transport, serverName }
  if (transport === 'stdio') {
    const command = String(input?.command ?? '').trim()
    if (command === '') throw new Error('a stdio server needs a command')
    config.command = command
    config.args = arrayOf(input?.args)
    config.env = recordOf(input?.env)
    if (String(input?.cwd ?? '').trim() !== '') config.cwd = String(input.cwd).trim()
  } else {
    const url = String(input?.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) throw new Error('a streamable-http server needs an http(s) URL')
    config.url = url
    config.headers = recordOf(input?.headers)
  }
  config.failOnStartupError = input?.failOnStartupError === true
  return config
}

/** One row as the page shows it. */
function viewOf(row, live, tools) {
  const serverName = typeof row.config.serverName === 'string' ? row.config.serverName : null
  const entry = live instanceof Map ? live.get(row.id) : undefined
  const published = serverName === null ? [] : (tools.get(serverName) ?? [])
  return {
    id: row.id,
    module: row.module,
    layer: row.layer,
    path: row.path,
    disabled: row.disabled,
    unreadable: row.unreadable,
    inserted: row.inserted === true,
    serverName,
    transport: typeof row.config.transport === 'string' ? row.config.transport : null,
    url: typeof row.config.url === 'string' ? row.config.url : null,
    command: typeof row.config.command === 'string' ? row.config.command : null,
    args: Array.isArray(row.config.args) ? row.config.args.map((item) => String(item)) : [],
    env: row.config.env !== null && typeof row.config.env === 'object' ? row.config.env : {},
    headers: row.config.headers !== null && typeof row.config.headers === 'object' ? row.config.headers : {},
    cwd: typeof row.config.cwd === 'string' ? row.config.cwd : null,
    failOnStartupError: row.config.failOnStartupError === true,
    enabled: entry?.enabled ?? !row.disabled,
    phase: entry?.fiberPhase ?? null,
    readOnlyReason: entry?.readOnlyReason ?? null,
    tools: published,
    toolCount: published.length,
  }
}

/** Live entry facts keyed by entry id. */
async function liveEntries(deps) {
  const map = new Map()
  if (deps.pluginManager === undefined) return map
  const plugins = await deps.pluginManager.listPlugins()
  for (const plugin of plugins ?? []) {
    const id = plugin.entryId ?? plugin.id
    if (typeof id === 'string') map.set(id, plugin)
  }
  return map
}

/** Published MCP tools grouped by server name. */
function toolsByServer(deps) {
  const map = new Map()
  if (deps.tools === undefined) return map
  for (const schema of deps.tools.schemas() ?? []) {
    const name = typeof schema?.name === 'string' ? schema.name : ''
    if (!name.startsWith(TOOL_PREFIX)) continue
    const rest = name.slice(TOOL_PREFIX.length)
    const split = rest.indexOf('__')
    if (split <= 0) continue
    const server = rest.slice(0, split)
    const tool = rest.slice(split + 2)
    if (!map.has(server)) map.set(server, [])
    map.get(server).push(tool)
  }
  for (const list of map.values()) list.sort()
  return map
}

/**
 * Every MCP row the deployment declares, with its live state.
 * @param deps - injected services and resolved layer paths.
 */
export async function listServers(deps) {
  const [rows, live, tools] = await Promise.all([
    readMcpRows(layersOf(deps)),
    liveEntries(deps),
    Promise.resolve(toolsByServer(deps)),
  ])
  return {
    rows: rows.map((row) => viewOf(row, live, tools)),
    profilePatch: deps.profilePatch,
    homePatch: deps.home,
  }
}

/** Apply a patch write and reconcile the touched row. */
async function commit(deps, id, write) {
  const path = deps.profilePatch
  const before = await readPatch(path)
  const next = write(before.text)
  if (next === before.text) return { changed: false }
  await writePatch(path, next)
  if (deps.hmr !== undefined) {
    await deps.hmr.runExclusive(async () => {
      await deps.hmr.reconcileProfile([id])
    })
  }
  return { changed: true, path }
}

/**
 * Add one server row to the profile patch.
 * @param deps - injected services and resolved layer paths.
 * @param input - server form.
 */
export async function addServer(deps, input) {
  const config = normalizeServer(input)
  const id = entryIdFor(config.serverName)
  const existing = await readMcpRows(layersOf(deps))
  if (existing.some((row) => row.id === id)) {
    throw new Error(`an MCP row named "${id}" already exists; edit it instead`)
  }
  if (existing.some((row) => row.config.serverName === config.serverName)) {
    throw new Error(`the serverName "${config.serverName}" is already used by another MCP row`)
  }
  const result = await commit(deps, id, (text) => upsertRow(text, { id, name: MCP_CLIENT_MODULE, config }))
  return { id, serverName: config.serverName, ...result }
}

/**
 * Change one server row, re-creating it when the server name changes.
 * @param deps - injected services and resolved layer paths.
 * @param id - current entry id.
 * @param input - server form.
 */
export async function updateServer(deps, id, input) {
  const config = normalizeServer(input)
  const nextId = entryIdFor(config.serverName)
  const rows = await readMcpRows(layersOf(deps))
  const current = rows.find((row) => row.id === id)
  if (current === undefined) throw new Error(`MCP row "${id}" was not found`)
  if (current.path !== deps.profilePatch) {
    throw new Error(`MCP row "${id}" is declared in the ${current.layer} patch and cannot be edited here`)
  }
  if (current.unreadable !== null && current.unreadable !== undefined) {
    throw new Error(`MCP row "${id}" could not be read back and is left untouched`)
  }
  if (nextId !== id) {
    if (rows.some((row) => row.id === nextId)) throw new Error(`an MCP row named "${nextId}" already exists`)
    if (rows.some((row) => row.config.serverName === config.serverName)) {
      throw new Error(`the serverName "${config.serverName}" is already used by another MCP row`)
    }
    const result = await commit(deps, nextId, (text) => {
      const removed = removeRow(text, id)
      return upsertRow(removed, { id: nextId, name: MCP_CLIENT_MODULE, config })
    })
    return { id: nextId, previousId: id, serverName: config.serverName, ...result }
  }
  const result = await commit(deps, id, (text) => upsertRow(text, { id, name: MCP_CLIENT_MODULE, config }))
  return { id, serverName: config.serverName, ...result }
}

/**
 * Remove one server row from the profile patch.
 * @param deps - injected services and resolved layer paths.
 * @param id - entry id.
 */
export async function removeServer(deps, id) {
  const rows = await readMcpRows(layersOf(deps))
  const current = rows.find((row) => row.id === id)
  if (current === undefined) throw new Error(`MCP row "${id}" was not found`)
  if (current.path !== deps.profilePatch) {
    throw new Error(`MCP row "${id}" is declared in the ${current.layer} patch and cannot be removed here`)
  }
  const result = await commit(deps, id, (text) => removeRow(text, id))
  return { id, ...result }
}

/**
 * Enable or disable one row through the plugin manager.
 * @param deps - injected services.
 * @param id - entry id.
 * @param enabled - requested state.
 */
export async function setServerEnabled(deps, id, enabled) {
  if (deps.pluginManager === undefined) throw new Error('the plugin manager is unavailable in this profile')
  const result = await deps.pluginManager.setPluginEnabled(id, enabled === true)
  return { id, enabled: enabled === true, result }
}

/** The tool names one server publishes, for a quick connection check. */
export function serverTools(deps, serverName) {
  return toolsByServer(deps).get(serverName) ?? []
}
