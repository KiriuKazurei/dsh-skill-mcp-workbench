// The Skill & MCP workbench: one Host half that owns the operations, one browser
// half that renders the panel.
//
// The Host half registers an authenticated exact Fetch route on Connection's
// shared `/api` channel and publishes the same operation table as a Cordis service
// and a read-only agent tool, so a UI action and a tool call run identical code.
// Reads go through the Harness's own services (`ctx.skills`, `ctx.tools`,
// `ctx.pluginManager`); writes touch only the user skill root and the profile
// patch's MCP rows, and every patch write asks the Harness to reconcile.

import { createApi, createRouteHandler, createToolDefinition, resolvePaths, ROUTE_PATH } from './lib/host/api.js'
import { readExtraRoots } from './lib/host/store.js'

/** Services this plugin cannot work without. */
export const inject = ['skills', 'connection']

/**
 * Mount the workbench.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  const paths = resolvePaths()
  const profile = ctx.get('profileContext')
  const deps = {
    skills: ctx.get('skills'),
    sessionSkills: ctx.get('sessionSkillCatalog'),
    connection: ctx.get('connection'),
    hmr: ctx.get('hmr'),
    pluginManager: ctx.get('pluginManager'),
    tools: ctx.get('tools'),
    logger: ctx.get('logger'),
    dshHome: paths.dshHome,
    agentsHome: paths.agentsHome,
    homeDir: paths.dshHome,
    home: paths.home,
    profilePatch: profile?.patchPath ?? paths.profilePatch,
    bundledSkillDir: paths.bundledSkillDir,
    extraSkillRoots: [],
    readExtraRoots: () => readExtraRoots(paths.dshHome),
  }

  const api = createApi(deps)

  ctx.effect(() => ctx.provide('skillMcpWorkbench', api), 'skill-mcp-workbench: operations')

  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: createRouteHandler(deps),
  }), 'skill-mcp-workbench: api route')

  const tools = ctx.get('tools')
  if (tools !== undefined) {
    ctx.effect(() => tools.register(createToolDefinition(api, deps)), 'skill-mcp-workbench: agent tool')
  }
}
