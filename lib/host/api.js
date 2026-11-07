// The workbench's Host API: one method table shared by the browser route and the
// agent tool, so a UI action and a tool call run the same operation.
//
// The browser reaches this table through the authenticated exact Fetch route the
// plugin registers on Connection's shared `/api` channel; every response is
// `{ ok: true, value }` or `{ ok: false, error: { code, message } }`.

import { listCatalog, readSkill, scanExternalRoots, importSkill, createSkill, userSkillRoot, externalRoots } from './skills.js'
import { addServer, listServers, removeServer, setServerEnabled, updateServer, entryIdFor } from './mcp.js'
import { addExtraRoot, readExtraRoots, removeExtraRoot } from './store.js'
import { toLossless } from './lossless.js'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Absolute route path served by the plugin. */
export const ROUTE_PATH = '/api/skill-mcp-workbench'

/** Read-only methods the agent tool may call. */
const READ_ONLY = new Set(['info', 'skills.catalog', 'skills.read', 'skills.roots', 'skills.session', 'mcp.list'])

/** Message of an arbitrary thrown value. */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** The extra skill roots, read fresh from the store file. */
async function extraRootsOf(deps) {
  if (deps.readExtraRoots !== undefined) return deps.readExtraRoots()
  return deps.extraSkillRoots ?? []
}

/** One scanned machine root as the page reads it. */
function rootView(root) {
  return {
    path: String(root.path),
    label: String(root.label),
    exists: root.exists === true,
    ...typeof root.error === 'string' ? { error: root.error } : {},
    skills: root.skills.map((skill) => ({
      name: String(skill.name),
      description: String(skill.description),
      ...typeof skill.whenToUse === 'string' ? { whenToUse: skill.whenToUse } : {},
      modelInvocable: skill.invocation?.modelInvocable !== false,
      userInvocable: skill.invocation?.userInvocable !== false,
      path: String(skill.path),
      directory: String(skill.directory),
      kind: String(skill.kind),
      root: String(skill.root ?? root.path),
      rootLabel: String(skill.rootLabel ?? root.label),
    })),
  }
}

/** The whole machine-root scan as the page reads it. */
function rootViewAll(roots) {
  return {
    roots: roots.map(rootView),
    total: roots.reduce((sum, root) => sum + root.skills.length, 0),
  }
}

/** One MCP row as the page and the tool read it. */
function rowViewOf(row) {
  return {
    id: String(row.id),
    module: String(row.module),
    layer: String(row.layer),
    path: String(row.path),
    disabled: row.disabled === true,
    unreadable: typeof row.unreadable === 'string' ? row.unreadable : null,
    inserted: row.inserted === true,
    serverName: typeof row.config.serverName === 'string' ? row.config.serverName : null,
    transport: typeof row.config.transport === 'string' ? row.config.transport : null,
    url: typeof row.config.url === 'string' ? row.config.url : null,
    command: typeof row.config.command === 'string' ? row.config.command : null,
    args: Array.isArray(row.config.args) ? row.config.args.map((item) => String(item)) : [],
    env: stringRecord(row.config.env),
    headers: stringRecord(row.config.headers),
    cwd: typeof row.config.cwd === 'string' ? row.config.cwd : null,
    failOnStartupError: row.config.failOnStartupError === true,
    enabled: row.enabled === true,
    phase: typeof row.phase === 'string' ? row.phase : null,
    readOnlyReason: typeof row.readOnlyReason === 'string' ? row.readOnlyReason : null,
    tools: Array.isArray(row.tools) ? row.tools.map((item) => String(item)) : [],
    toolCount: Array.isArray(row.tools) ? row.tools.length : 0,
  }
}

/** A record of strings, or an empty record. */
function stringRecord(value) {
  const result = {}
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined || item === null) continue
      result[String(key)] = String(item)
    }
  }
  return result
}

/** One JSON response. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Failure payload. */
function failure(code, message, status = 200) {
  return json({ ok: false, error: { code, message } }, status)
}

/**
 * Build the operation table.
 * @param deps - services, resolved paths, and plugin configuration.
 * @returns the method table.
 */
export function createApi(deps) {
  const methods = {
    /** Facts the page needs before it can explain what is unavailable. */
    async info() {
      return {
        route: ROUTE_PATH,
        profilePatch: deps.profilePatch,
        homePatch: deps.home,
        dshHome: deps.dshHome,
        agentsHome: deps.agentsHome,
        bundledSkillDir: deps.bundledSkillDir ?? null,
        userSkillRoot: userSkillRoot(deps.dshHome),
        extraSkillRoots: (deps.extraSkillRoots ?? []).map((entry) => String(entry)),
        available: {
          skills: deps.skills !== undefined,
          sessionSkills: deps.sessionSkills !== undefined,
          pluginManager: deps.pluginManager !== undefined,
          hmr: deps.hmr !== undefined,
          tools: deps.tools !== undefined,
        },
      }
    },

    /** The global skill catalog, grouped by discovery source. */
    async 'skills.catalog'(params) {
      const catalog = await listCatalog(deps, params.scope)
      // Every field the page and the tool read must survive the lossless-JSON
      // boundary, so a summary is rebuilt with only plain scalars, arrays, and
      // records before it leaves the Host.
      return {
        cwd: catalog.cwd ?? null,
        total: catalog.total,
        groups: catalog.groups.map((group) => ({
          source: group.source,
          skills: group.skills.map((skill) => ({
            name: String(skill.name),
            description: String(skill.description),
            ...typeof skill.whenToUse === 'string' ? { whenToUse: skill.whenToUse } : {},
            modelInvocable: skill.invocation?.modelInvocable !== false,
            userInvocable: skill.invocation?.userInvocable !== false,
            source: String(skill.source),
            provider: String(skill.provider),
            rank: Number.isFinite(skill.rank) ? skill.rank : null,
            ...typeof skill.path === 'string' ? { path: skill.path } : {},
            ...typeof skill.directory === 'string' ? { directory: skill.directory } : {},
          })),
        })),
      }
    },

    /** One skill body through the registry. */
    async 'skills.read'(params) {
      const skill = await readSkill(deps, String(params.name ?? ''), params.scope)
      if (skill === null) throw new Error(`skill "${String(params.name ?? '')}" was not found`)
      return {
        name: String(skill.name),
        description: String(skill.description),
        ...typeof skill.whenToUse === 'string' ? { whenToUse: skill.whenToUse } : {},
        modelInvocable: skill.invocation?.modelInvocable !== false,
        userInvocable: skill.invocation?.userInvocable !== false,
        source: String(skill.source),
        provider: String(skill.provider),
        ...typeof skill.path === 'string' ? { path: skill.path } : {},
        ...typeof skill.directory === 'string' ? { directory: skill.directory } : {},
        content: String(skill.content),
        truncated: skill.truncated === true,
      }
    },

    /** The skills one Session's composition advertises, including preset layers. */
    async 'skills.session'(params) {
      if (deps.sessionSkills === undefined) {
        throw new Error('the session skill catalog is unavailable in this composition')
      }
      const value = await deps.sessionSkills.list({ sessionId: String(params.sessionId ?? '') })
      return {
        skills: (value?.skills ?? []).map((skill) => ({
          name: String(skill.name),
          description: String(skill.description),
          ...typeof skill.whenToUse === 'string' ? { whenToUse: skill.whenToUse } : {},
          modelInvocable: skill.modelInvocable !== false,
          ...typeof skill.path === 'string' ? { path: skill.path } : {},
        })),
      }
    },

    /** Every skill folder on this computer outside the Harness catalog. */
    async 'skills.roots'(params) {
      const extra = await extraRootsOf(deps)
      if (params?.add !== undefined) {
        const added = await addExtraRoot(deps.homeDir, params.add)
        deps.extraSkillRoots = added.roots
        const roots = await scanExternalRoots(added.roots)
        return { ...rootViewAll(roots), added: { path: added.path, added: added.added } }
      }
      if (params?.remove !== undefined) {
        const removed = await removeExtraRoot(deps.homeDir, params.remove)
        deps.extraSkillRoots = removed.roots
        const roots = await scanExternalRoots(removed.roots)
        return { ...rootViewAll(roots), removed: { path: String(params.remove), removed: removed.removed } }
      }
      const roots = await scanExternalRoots(extra)
      return rootViewAll(roots)
    },

    /** Import a `.md` or `.zip` skill into the user skill root. */
    async 'skills.import'(params) {
      const written = await importSkill(deps.dshHome, {
        fileName: params.fileName,
        data: params.data,
      })
      return {
        root: written.root,
        name: written.name ?? null,
        description: written.description ?? null,
        kind: written.kind ?? null,
        path: written.path ?? null,
        written: (written.written ?? []).map((entry) => String(entry)),
      }
    },

    /** Create a new skill bundle in the user skill root. */
    async 'skills.create'(params) {
      const written = await createSkill(deps.dshHome, {
        name: params.name,
        description: params.description,
        whenToUse: params.whenToUse,
        body: params.body,
      })
      return {
        root: written.root,
        name: written.name,
        description: written.description,
        kind: written.kind,
        path: written.path,
        written: written.written.map((entry) => String(entry)),
      }
    },

    /** Every MCP row with its live state. */
    async 'mcp.list'() {
      const servers = await listServers(deps)
      return {
        rows: servers.rows.map(rowViewOf),
        profilePatch: servers.profilePatch,
        homePatch: servers.homePatch,
      }
    },

    /** Add one MCP server row. */
    async 'mcp.add'(params) {
      const result = await addServer(deps, params.server ?? params)
      return { id: result.id, serverName: result.serverName, changed: result.changed === true, path: result.path ?? null }
    },

    /** Change one MCP server row. */
    async 'mcp.update'(params) {
      const id = String(params.id ?? entryIdFor(String(params.server?.serverName ?? '')))
      const result = await updateServer(deps, id, params.server ?? params)
      return {
        id: result.id,
        serverName: result.serverName,
        changed: result.changed === true,
        previousId: result.previousId ?? null,
        path: result.path ?? null,
      }
    },

    /** Remove one MCP server row. */
    async 'mcp.remove'(params) {
      const result = await removeServer(deps, String(params.id ?? ''))
      return { id: result.id, changed: result.changed === true, path: result.path ?? null }
    },

    /** Enable or disable one MCP row. */
    async 'mcp.enabled'(params) {
      const result = await setServerEnabled(deps, String(params.id ?? ''), params.enabled === true)
      return { id: result.id, enabled: result.enabled, applied: result.result?.ok === true }
    },
  }

  /** Invoke one method, refusing anything outside the read-only set when asked. */
  async function invoke(method, params, options = {}) {
    const entry = methods[method]
    if (entry === undefined) throw new Error(`unknown method "${method}"`)
    if (options.readOnly === true && !READ_ONLY.has(method)) {
      throw new Error(`method "${method}" changes configuration and stays user-only`)
    }
    // Every value crosses the lossless-JSON boundary the Harness enforces on tool
    // results and wire payloads, so it is normalised once here rather than in
    // each method.
    return toLossless(await entry(params ?? {}))
  }

  return { methods: Object.keys(methods), invoke, readOnly: [...READ_ONLY] }
}

/**
 * The Fetch handler served on the plugin's exact route.
 * @param deps - services, resolved paths, and plugin configuration.
 * @returns a Web `Request` handler.
 */
export function createRouteHandler(deps) {
  const api = createApi(deps)
  return async function handle(request) {
    if (request.method !== 'POST') return failure('method_not_allowed', 'this route accepts POST only', 405)
    let payload = null
    try {
      payload = await request.json()
    } catch {
      return failure('invalid_body', 'the request body must be JSON', 400)
    }
    const method = typeof payload?.method === 'string' ? payload.method : ''
    if (method === '') return failure('invalid_body', 'a method name is required', 400)
    try {
      const value = await api.invoke(method, payload.params ?? {})
      return json({ ok: true, value })
    } catch (error) {
      return failure('failed', messageOf(error))
    }  }
}

/**
 * Build the agent tool's read-only definition, without a build-time import.
 *
 * The skill lookup passes the calling Agent as its scope, because a skill registered
 * by an agent preset lives in that preset's layer and is invisible to a scope-less
 * Host lookup.
 *
 * @param api - the operation table this plugin's UI also calls.
 * @param deps - services, resolved paths, and plugin configuration.
 */
export function createToolDefinition(api, deps) {
  /** The lookup options one call resolves its skills with. */
  const lookupFor = async (args, exec) => ({
    ...(exec?.agent !== undefined ? { scope: exec.agent } : {}),
    ...(exec?.signal !== undefined ? { signal: exec.signal } : {}),
  })

  return {
    name: 'skill_mcp_manage',
    description: 'Read the global skill catalog and the configured MCP servers. Use it to see which skills are available, read a skill body, or check whether an MCP server is connected. Importing and creating skills stays with the user in the Skill & MCP workbench panel.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['skills.list', 'skills.read', 'mcp.list'],
          description: 'skills.list lists the global skill catalog, skills.read returns one skill body, mcp.list lists MCP rows and their live state.',
        },
        name: { type: 'string', description: 'Skill name for skills.read.' },
      },
    },
    output: {
      // Structured output is object-rooted, so the schema names each field the
      // model can rely on instead of accepting anything.
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          summary: { type: 'string' },
          detail: { type: 'object', additionalProperties: true },
        },
        required: ['summary', 'detail'],
      },
      // The render contract takes (arguments, value) and returns content blocks.
      render(_args, value) {
        return [{ type: 'text', text: value.summary }]
      },
    },
    async execute(args, exec) {
      if (args.action === 'skills.list') {
        const lookup = await lookupFor(args, exec)
        const catalog = await api.invoke('skills.catalog', lookup, { readOnly: true })
        const names = catalog.groups.flatMap((group) => group.skills.map((skill) => skill.name))
        return {
          summary: `${catalog.total} global skills: ${names.join(', ') || 'none'}`,
          detail: catalog,
        }
      }
      if (args.action === 'skills.read') {
        const lookup = await lookupFor(args, exec)
        const skill = await api.invoke('skills.read', { ...lookup, name: args.name }, { readOnly: true })
        return { summary: `Skill "${skill.name}" from ${skill.source} (${skill.path ?? 'no path'}).`, detail: skill }
      }
      const servers = await api.invoke('mcp.list', {}, { readOnly: true })
      const rows = servers.rows.map(({ id, serverName, enabled, phase, transport, layer, tools, toolCount }) => ({
        id, serverName, enabled, phase, transport, layer, tools, toolCount,
      }))
      const lines = rows.map((row) => {
        const state = row.enabled ? (row.phase ?? 'idle') : 'disabled'
        return `${row.id} [${state}] ${row.transport} (${row.toolCount} tools, ${row.layer})`
      })
      return {
        summary: `${rows.length} MCP rows: ${lines.join('; ') || 'none configured'}`,
        detail: { rows },
      }
    },
  }
}

/** Resolve the roots the plugin reports and scans. */
export function resolvePaths(env = process.env, home = homedir()) {
  const dshHome = env.DSH_HOME ?? join(home, '.dsh')
  const agentsHome = env.DSH_AGENTS_HOME ?? join(home, '.agents')
  const profileDir = env.DSH_PROFILE_DIR ?? dshHome
  return {
    dshHome,
    agentsHome,
    home: join(dshHome, 'cordis.patch.yml'),
    profilePatch: join(profileDir, 'cordis.patch.yml'),
    homeDir: dshHome,
    bundledSkillDir: env.DSH_BUNDLED_SKILL_DIR ?? null,
  }
}

/** External roots as plain paths, for the page's root list. */
export function externalRootPaths(env = process.env, home = homedir()) {
  return externalRoots(env, home).map((root) => ({ path: root.path, label: root.label }))
}
