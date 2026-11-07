// Page-level test for the workbench browser half: the real client bundle is
// evaluated in a jsdom window, its `apply` runs against a recording context, and
// the registered panel is mounted with real React.
//
// React, ReactDOM, and jsdom are borrowed from a sibling plugin's development
// dependencies so this test adds no runtime dependency to the bundle; when they
// cannot be resolved the whole file is skipped.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { React, ReactDOM, JSDOM } from './support/browser.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = join(here, '..', 'client.js')

/** Dictionary key answers, so the test never depends on the active language. */
const dictionary = {
  zh: {},
  en: {},
}

/** One recording slot registration. */
function recorder() {
  const registered = []
  const injected = []
  return {
    registered,
    injected,
    ctx: {
      slots: {
        inject(owner, callback) {
          injected.push(owner)
          const dispose = callback()
          return () => dispose()
        },
        register(options, component) {
          registered.push({ options, component })
          return () => {}
        },
      },
      locale: {
        register(ns, dictionaries) {
          dictionary[ns] = dictionaries
        },
        bind(ns) {
          const table = dictionary[ns]?.en ?? {}
          return (key, values) => String(table[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (values && name in values ? String(values[name]) : match))
        },
      },
      remote: {
        $on() {
          return () => {}
        },
        pluginManager: {
          async setPluginEnabled(id, enabled) {
            return { ok: true, value: { id, enabled } }
          },
        },
      },
      sessions: {
        list: {
          getSnapshot: () => [{ id: 'session-1' }],
        },
      },
      effect(callback) {
        const dispose = callback()
        return () => dispose?.()
      },
    },
  }
}

/** Evaluate the browser bundle and return its exported plugin. */
async function loadPlugin() {
  const source = await readFile(bundle, 'utf8')
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://127.0.0.1:3064/' })
  // React's act() needs this flag on the window it renders into.
  dom.window.IS_REACT_ACT_ENVIRONMENT = true
  const captured = {}
  const context = {
    window: {
      __ModuleLoader__: {
        load(module) {
          captured.module = module
        },
      },
    },
    React,
    document: dom.window.document,
    navigator: dom.window.navigator,
    fetch: async (route, init) => answer(route, init),
    setTimeout,
    console,
  }
  context.window.React = React
  vm.createContext(context)
  vm.runInContext(source, context)
  assert.ok(captured.module, 'the bundle registered itself with the module loader')
  const plugin = captured.module.factory((name) => (name === 'react' ? React : undefined))
  // react-dom reads the browser globals the loader would have provided.
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator }
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
  dom.restore = () => {
    Object.defineProperty(globalThis, 'window', { value: previous.window, configurable: true, writable: true })
    Object.defineProperty(globalThis, 'document', { value: previous.document, configurable: true, writable: true })
    Object.defineProperty(globalThis, 'navigator', { value: previous.navigator, configurable: true, writable: true })
  }
  return { plugin, dom }
}

/** Canned Host answers keyed by method. */
let answers = {}
let requested = []
async function answer(route, init) {
  const body = JSON.parse(init.body)
  requested.push(`${body.method} ${JSON.stringify(body.params)}`)
  const value = answers[body.method]
  if (value === undefined) return { status: 404, json: async () => ({ ok: false, error: { code: 'unknown', message: body.method } }) }
  if (value instanceof Error) return { status: 200, json: async () => ({ ok: false, error: { message: value.message } }) }
  return { status: 200, json: async () => ({ ok: true, value }) }
}
/** Mount a component and let its effects and promises settle. */
async function mount(dom, element) {
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  await act(async () => {
    root.render(element)
  })
  return container
}

/** Flush microtasks inside React's act scope. */
async function act(scope) {
  const actImplementation = React.act ?? ReactDOM.act ?? ReactDOM.unstable_act
  if (actImplementation === undefined) {
    await scope()
    await new Promise((resolve) => setTimeout(resolve, 0))
    return
  }
  return actImplementation(scope)
}

const workspace = { id: 'w1', title: 'Demo', path: 'D:/demo', origin: 'registry' }

const catalog = {
  cwd: 'D:/demo',
  groups: [
    {
      source: 'project-dsh',
      skills: [
        { name: 'project-skill', description: 'A project skill.', invocation: { modelInvocable: true, userInvocable: true }, source: 'project-dsh', provider: 'filesystem', rank: 100, path: 'D:/demo/.dsh/skills/project-skill/SKILL.md', directory: 'D:/demo/.dsh/skills/project-skill', kind: 'bundle' },
      ],
    },
    {
      source: 'user-dsh',
      skills: [
        { name: 'user-skill', description: 'A user skill.', invocation: { modelInvocable: false, userInvocable: true }, source: 'user-dsh', provider: 'filesystem', rank: 400, path: 'C:/Users/me/.dsh/skills/user-skill/SKILL.md', directory: 'C:/Users/me/.dsh/skills/user-skill', kind: 'bundle' },
      ],
    },
  ],
  total: 2,
}

const roots = {
  roots: [
    { path: 'C:/Users/me/.claude/skills', label: 'claude-code', exists: true, skills: [{ name: 'claude-skill', description: 'From Claude Code.', invocation: { modelInvocable: true, userInvocable: true }, path: 'C:/Users/me/.claude/skills/claude-skill/SKILL.md', directory: 'C:/Users/me/.claude/skills/claude-skill', kind: 'bundle' }] },
    { path: 'D:/skills', label: 'custom', exists: false, skills: [] },
  ],
  total: 1,
}

const servers = {
  rows: [
    {
      id: 'mcp-demo', module: '@deepseek-ai/dsh-mcp-client', layer: 'profile', path: 'C:/Users/me/.dsh/profiles/desktop/cordis.patch.yml',
      disabled: false, unreadable: null, inserted: false, serverName: 'demo', transport: 'streamable-http', url: 'https://example.com/mcp',
      command: null, args: [], env: {}, headers: { Authorization: 'Bearer x' }, cwd: null, failOnStartupError: false,
      enabled: true, phase: 'active', readOnlyReason: null, tools: ['ping', 'list'], toolCount: 2,
    },
    {
      id: 'mcp-stdio', module: '@deepseek-ai/dsh-mcp-client', layer: 'home', path: 'C:/Users/me/.dsh/cordis.patch.yml',
      disabled: true, unreadable: null, inserted: true, serverName: 'stdio-demo', transport: 'stdio', url: null,
      command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 'abc' }, headers: {}, cwd: 'D:/work', failOnStartupError: true,
      enabled: false, phase: 'failed', readOnlyReason: null, tools: [], toolCount: 0,
    },
  ],
  profilePatch: 'C:/Users/me/.dsh/profiles/desktop/cordis.patch.yml',
  homePatch: 'C:/Users/me/.dsh/cordis.patch.yml',
}

const skillBody = {
  name: 'project-skill', description: 'A project skill.', invocation: { modelInvocable: true, userInvocable: true },
  source: 'project-dsh', provider: 'filesystem', path: 'D:/demo/.dsh/skills/project-skill/SKILL.md',
  directory: 'D:/demo/.dsh/skills/project-skill', content: '# Body\n\nDo the thing.', truncated: false,
}

const sessionCatalog = {
  skills: [
    { name: 'cordis-plugin-development', description: 'A preset-layer skill.', modelInvocable: true },
    { name: 'office-docx', description: 'Create, read, edit, and validate Word documents.', modelInvocable: true },
  ],
}

test('the bundle contributes a sidebar row and the panel it opens', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { plugin, dom } = await loadPlugin()
  const record = recorder()
  plugin.apply(record.ctx)

  assert.deepEqual([...plugin.inject], ['slots', 'locale', 'remote', 'remote.pluginManager', 'sessions'])
  assert.ok(record.injected.includes('main'))
  assert.ok(record.injected.includes('sidebar.panellist'))

  const panel = record.registered.find((entry) => entry.options.name === 'main')
  assert.ok(panel, 'a main panel is registered')
  assert.equal(panel.options.key, 'skill-mcp')

  const row = record.registered.find((entry) => entry.options.name === 'sidebar.panellist')
  assert.ok(row, 'a sidebar row is registered')
  assert.equal(row.options.id, 'skill-mcp')
  assert.equal(row.options.order, 10)
  const label = typeof row.options.label === 'function' ? row.options.label() : row.options.label
  assert.equal(label, 'Skill & MCP')
  assert.equal(typeof row.component, 'function')

  const glyph = row.component({ size: 18, active: false })
  assert.equal(glyph.type, 'svg')
  // The row renders in the host's own icon language: the 16px stroke grid, a 1px
  // stroke, inherited colour, no fill, and no background plate of its own.
  assert.equal(glyph.props.viewBox, '0 0 16 16')
  assert.equal(glyph.props.strokeWidth, 1)
  assert.equal(glyph.props.width, 18)
  assert.equal(glyph.props.height, 18)
  assert.equal(glyph.props.fill, 'none')
  assert.equal(glyph.props.stroke, undefined)
  const paths = glyph.props.children
  assert.ok(!paths.some((child) => child.type === 'rect'), 'the glyph carries no background plate')
  assert.ok(paths.every((child) => child.props.stroke === 'currentColor'), 'every path inherits the row colour')
  dom.restore()
  dom.window.close()
})

test('the panel renders one column of global skills', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  answers = {
    'skills.catalog': catalog,
    'skills.roots': roots,
    'skills.read': skillBody,
    'skills.session': sessionCatalog,
    'mcp.list': servers,
  }
  const { plugin, dom } = await loadPlugin()
  const record = recorder()
  plugin.apply(record.ctx)
  const panel = record.registered.find((entry) => entry.options.name === 'main')
  const container = await mount(dom, React.createElement(panel.component))
  // Each section owns its own resource, so the page settles in stages; flush once
  // more so every section has committed before the text is read.
  await act(async () => {})

  const text = container.textContent
  assert.ok(text.includes('Skill & MCP Workbench'), 'the page title is rendered')
  assert.ok(text.includes('Skills'), 'the skills tab is rendered')
  assert.ok(text.includes('MCP'), 'the MCP tab is rendered')
  assert.ok(text.includes('Global skills'), 'the single column is the global skills column')
  assert.ok(text.includes('Harness skills'), 'the harness sub-section is rendered')
  assert.ok(text.includes('Other skills on this computer'), 'the machine sub-section is rendered')
  assert.ok(text.includes('user-skill'), 'a harness skill is listed')
  assert.ok(text.includes('claude-skill'), 'a machine skill is listed')
  assert.ok(text.includes('Harness user'), 'the source label is rendered')
  assert.ok(text.includes('Model: off'), 'the invocation badge is rendered')
  // The Session catalog reaches skills an agent preset contributes, which a
  // scope-less Host lookup cannot see.
  assert.ok(text.includes('Skills this Session can invoke'), 'the session section is rendered')
  assert.ok(text.includes('cordis-plugin-development'), 'a preset-layer skill is listed')
  // The project surface is gone.
  assert.ok(!text.includes('Skills in this project'), 'no project section remains')
  assert.ok(!text.includes('Assign to project'), 'no assign action remains')

  // One column, whose flows scroll horizontally and wrap.
  const panes = container.querySelectorAll('.smw-pane')
  assert.equal(panes.length, 1, 'exactly one column is rendered')
  const flows = container.querySelectorAll('.smw-flow')
  assert.ok(flows.length >= 3, 'harness, session, and machine flows are rendered')
  const styleOf = (node) => dom.window.getComputedStyle(node)
  for (const flow of flows) {
    assert.equal(styleOf(flow).overflowX, 'auto', 'a flow scrolls horizontally')
  }
  assert.equal(styleOf(flows[0]).flexWrap, 'wrap', 'a flow wraps its cards')
  // Cards keep a minimum width so a narrow column scrolls instead of squashing.
  const card = flows[0].querySelector('.smw-card')
  assert.equal(styleOf(card).minWidth, '320px', 'a card keeps a readable minimum width')
  assert.equal(styleOf(card).flexGrow, '1', 'a card grows to fill its row')
  assert.equal(styleOf(card).flexBasis, '360px', 'a card wraps at its basis')
  dom.restore()
  dom.window.close()
})

test('the MCP tab lists rows with their live state', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  answers = {
    'skills.catalog': catalog,
    'skills.roots': roots,
    'skills.read': skillBody,
    'skills.session': sessionCatalog,
    'mcp.list': servers,
  }
  const { plugin, dom } = await loadPlugin()
  const record = recorder()
  plugin.apply(record.ctx)
  const panel = record.registered.find((entry) => entry.options.name === 'main')
  const container = await mount(dom, React.createElement(panel.component))

  const tabs = [...container.querySelectorAll('[role="tab"]')]
  const mcpTab = tabs.find((tab) => tab.textContent === 'MCP')
  assert.ok(mcpTab, 'the MCP tab exists')
  await act(async () => {
    mcpTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })

  const text = container.textContent
  assert.ok(text.includes('MCP servers'), 'the MCP section is rendered')
  assert.ok(text.includes('demo'), 'a streamable-http row is listed')
  assert.ok(text.includes('stdio-demo'), 'a stdio row is listed')
  assert.ok(text.includes('connected'), 'the live phase is rendered')
  assert.ok(text.includes('failed'), 'a failed phase is rendered')
  assert.ok(text.includes('2 tools'), 'the tool count is rendered')
  assert.ok(text.includes('Home patch'), 'the layer label is rendered')
  assert.ok(text.includes('npx -y pkg'), 'the stdio command line is rendered')
  dom.restore()
  dom.window.close()
})

test('a Host failure surfaces as a message instead of a crash', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  answers = {
    workspaces: new Error('the workbench is unavailable'),
    'skills.catalog': new Error('the workbench is unavailable'),
    'skills.roots': new Error('the workbench is unavailable'),
    'mcp.list': new Error('the workbench is unavailable'),
  }
  const { plugin, dom } = await loadPlugin()
  const record = recorder()
  plugin.apply(record.ctx)
  const panel = record.registered.find((entry) => entry.options.name === 'main')
  const container = await mount(dom, React.createElement(panel.component))
  assert.ok(container.textContent.includes('the workbench is unavailable'))
  dom.restore()
  dom.window.close()
})
