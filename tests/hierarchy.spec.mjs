// The typographic and colour hierarchy of the Skills tab: the skill title is the
// loudest element in a card, the skill body is the quietest, and the surfaces nest
// base → column → card → body well. Colour rules are asserted against the shipped
// stylesheet because jsdom does not resolve `var()` custom properties.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { React, ReactDOM, JSDOM } from './support/browser.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = join(here, '..', 'client.js')

const answers = {
  'skills.catalog': { total: 2, groups: [
    { source: 'user-dsh', skills: [{ name: 'user-skill', description: 'A user skill.', invocation: { modelInvocable: false, userInvocable: true }, source: 'user-dsh', provider: 'filesystem', rank: 400, path: 'C:/Users/me/.dsh/skills/user-skill/SKILL.md' }] },
    { source: 'bundled', skills: [{ name: 'office-docx', description: 'Create, read, edit, and validate Word documents.', invocation: { modelInvocable: true, userInvocable: true }, source: 'bundled', provider: 'runtime', rank: 600 }] },
  ] },
  'skills.roots': { roots: [
    { path: 'C:/Users/me/.claude/skills', label: 'claude-code', exists: true, skills: [{ name: 'claude-skill', description: 'From Claude Code.', invocation: { modelInvocable: true, userInvocable: true }, path: 'C:/Users/me/.claude/skills/claude-skill/SKILL.md', directory: 'C:/Users/me/.claude/skills/claude-skill', kind: 'bundle' }] },
  ], total: 1 },
  'skills.session': { skills: [{ name: 'cordis-plugin-development', description: 'A preset-layer skill.', modelInvocable: true }] },
  'mcp.list': { rows: [], profilePatch: 'p', homePatch: 'h' },
}

/** Mount the page and return the container plus the shipped stylesheet text. */
async function mountPage() {
  const source = await readFile(bundle, 'utf8')
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://127.0.0.1:3064/' })
  dom.window.IS_REACT_ACT_ENVIRONMENT = true
  const captured = {}
  const context = {
    window: { __ModuleLoader__: { load: (module) => { captured.module = module } }, React },
    React,
    document: dom.window.document,
    navigator: dom.window.navigator,
    fetch: async (route, init) => {
      const body = JSON.parse(init.body)
      const value = answers[body.method]
      if (value === undefined) return { status: 404, json: async () => ({ ok: false, error: { message: body.method } }) }
      return { status: 200, json: async () => ({ ok: true, value }) }
    },
    setTimeout,
    console,
  }
  vm.createContext(context)
  vm.runInContext(source, context)
  const plugin = captured.module.factory((name) => (name === 'react' ? React : undefined))

  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator }
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })

  const registered = []
  const dictionaries = {}
  const ctx = {
    slots: { inject: (owner, cb) => cb(), register: (options, component) => { registered.push({ options, component }); return () => {} } },
    locale: {
      register: (ns, table) => {
        dictionaries[ns] = table
      },
      bind: (ns) => {
        const table = dictionaries[ns]?.en ?? {}
        return (key, values) => String(table[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (values && name in values ? String(values[name]) : match))
      },
    },
    remote: { $on: () => () => {}, pluginManager: { setPluginEnabled: async () => ({ ok: true }) } },
    sessions: { list: { getSnapshot: () => [{ id: 'session-1' }] } },
    effect: (cb) => { const dispose = cb(); return () => dispose?.() },
  }
  plugin.apply(ctx)
  const panel = registered.find((entry) => entry.options.name === 'main')

  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  await React.act(async () => { root.render(React.createElement(panel.component)) })
  await React.act(async () => {})

  const sheet = [...dom.window.document.head.querySelectorAll('style')].map((node) => node.textContent).join('\n')
  return { container, dom, sheet, restore: () => {
    Object.defineProperty(globalThis, 'window', { value: previous.window, configurable: true, writable: true })
    Object.defineProperty(globalThis, 'document', { value: previous.document, configurable: true, writable: true })
    Object.defineProperty(globalThis, 'navigator', { value: previous.navigator, configurable: true, writable: true })
  } }
}

test('the skill title is the loudest element in the card', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, dom, restore } = await mountPage()
  const styleOf = (node) => dom.window.getComputedStyle(node)

  const name = container.querySelector('.smw-card .smw-name')
  assert.ok(name, 'a skill title is rendered')
  assert.equal(styleOf(name).fontSize, '15px', 'the title is one size up')
  assert.equal(styleOf(name).fontWeight, '700', 'the title is bold')

  const desc = container.querySelector('.smw-card .smw-desc')
  assert.equal(styleOf(desc).fontSize, '12px', 'the description stays at body size')
  assert.notEqual(styleOf(desc).fontWeight, '700', 'the description is not bold')

  const path = container.querySelector('.smw-card .smw-path')
  assert.equal(styleOf(path).fontSize, '11px', 'the path is the smallest metadata')
  restore()
  dom.window.close()
})

test('the column and sub-section titles outrank the card contents', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, dom, restore } = await mountPage()
  const styleOf = (node) => dom.window.getComputedStyle(node)

  const paneTitle = container.querySelector('.smw-paneTitle')
  assert.equal(styleOf(paneTitle).fontSize, '15px', 'a column title matches the skill title size')
  assert.equal(styleOf(paneTitle).fontWeight, '700', 'a column title is bold')

  const subTitle = container.querySelector('.smw-subTitle')
  assert.equal(styleOf(subTitle).fontSize, '13px', 'a sub-section title sits between')
  assert.equal(styleOf(subTitle).fontWeight, '700', 'a sub-section title is bold')

  const name = container.querySelector('.smw-card .smw-name')
  const numeric = (node) => Number.parseFloat(styleOf(node).fontSize)
  assert.ok(numeric(paneTitle) > numeric(subTitle), 'a column title outranks a sub-section title')
  assert.ok(numeric(name) > numeric(container.querySelector('.smw-desc')), 'a skill title outranks its description')
  restore()
  dom.window.close()
})

test('the skill body is the quietest text in the card', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, dom, sheet, restore } = await mountPage()
  const styleOf = (node) => dom.window.getComputedStyle(node)

  assert.ok(sheet.includes('.smw-pre {'), 'the body rule is shipped')
  assert.ok(/\.smw-pre \{[^}]*font-size: 11px/.test(sheet), 'the body is one size down')
  assert.ok(/\.smw-pre \{[^}]*background: var\(--dsw-alias-bg-base\)/.test(sheet), 'the body sits in a sunken well')

  const name = container.querySelector('.smw-card .smw-name')
  assert.equal(styleOf(name).fontSize, '15px', 'the title is larger than the body')
  restore()
  dom.window.close()
})

test('the surfaces nest base, column, card, and body well', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { sheet, restore } = await mountPage()
  assert.ok(/\.smw-pane \{[^}]*background: var\(--dsw-alias-bg-layer-1\)/.test(sheet), 'a column is the first raised surface')
  assert.ok(/\.smw-card \{[^}]*background: var\(--dsw-alias-bg-layer-2\)/.test(sheet), 'a card is the nested surface')
  assert.ok(/\.smw-pre \{[^}]*background: var\(--dsw-alias-bg-base\)/.test(sheet), 'the body well is sunken back to the base')
  restore()
})

test('the skills tab is a single column with no project pane', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, sheet, restore } = await mountPage()

  const panes = container.querySelectorAll('.smw-pane')
  assert.equal(panes.length, 1, 'exactly one skill column is rendered')
  assert.equal(container.querySelector('.smw-columns'), null, 'the two-column grid is gone')
  assert.equal(container.querySelector('.smw-projectBar'), null, 'no workspace picker remains')
  assert.ok(!sheet.includes('.smw-columns'), 'the two-column rule is no longer shipped')
  assert.ok(!sheet.includes('.smw-projectBar'), 'the workspace-bar rule is no longer shipped')

  const text = container.textContent
  assert.ok(text.includes('Global skills'), 'the column is the global skills column')
  assert.ok(!text.includes('Skills in this project'), 'the project section is gone')
  assert.ok(!text.includes('Assign to project'), 'the assign action is gone')
  restore()
})

test('the import / create button opens a panel with both entry points', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, dom, restore } = await mountPage()

  const pane = container.querySelector('.smw-pane')
  const button = [...pane.querySelectorAll('button')].find((node) => node.textContent === 'Import / Create')
  assert.ok(button, 'the import / create button is rendered')
  // It sits in the column heading, at the trailing (right) edge.
  const heading = pane.querySelector('.smw-paneHead')
  assert.ok(heading.contains(button), 'the button lives in the column heading')
  assert.equal(dom.window.getComputedStyle(button).fontWeight, '600', 'the button is emphasised')

  await React.act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })

  const panel = container.querySelector('.smw-import')
  assert.ok(panel, 'clicking the button opens the panel')
  assert.ok(panel.textContent.includes('Import a skill'), 'the import entry is offered')
  assert.ok(panel.textContent.includes('Create a skill'), 'the create entry is offered')

  // The import entry is a real file input restricted to the two accepted formats.
  const input = panel.querySelector('input[type="file"]')
  assert.ok(input, 'a file input is rendered')
  assert.equal(input.getAttribute('accept'), '.md,.zip', 'only .md and .zip are accepted')

  // Switching to the create entry swaps in the form.
  const createTab = [...panel.querySelectorAll('button')].find((node) => node.textContent === 'Create a skill')
  await React.act(async () => {
    createTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  assert.ok(container.querySelector('.smw-import').textContent.includes('Name'), 'the create form is rendered')
  assert.equal(container.querySelector('.smw-import').querySelector('input[type="file"]'), null, 'the file input is gone in create mode')
  restore()
  dom.window.close()
})

test('the content column fills the page and every card action keeps its corner', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, dom, sheet, restore } = await mountPage()

  // One shared, scaled gutter replaces the fixed 960px column: head and body
  // start on the same edge, so the tab label and the first card line up.
  assert.ok(!/\.smw-column \{[^}]*max-width: 960px/.test(sheet), 'the fixed column cap is gone')
  assert.ok(/\.smw-column \{[^}]*width: 100%/.test(sheet), 'the column fills the body')
  assert.ok(sheet.includes('--smw-gutter: clamp('), 'the page uses one scaled gutter')
  assert.ok(/\.smw-head \{[^}]*var\(--smw-gutter\)/.test(sheet), 'the head uses the shared gutter')
  assert.ok(/\.smw-body \{[^}]*var\(--smw-gutter\)/.test(sheet), 'the body uses the shared gutter')

  // The card head is a grid: the title and tags wrap in the first cell while the
  // action stays in the trailing cell instead of falling under a long name.
  const cardTop = container.querySelector('.smw-card .smw-cardTop')
  const main = [...cardTop.children].find((node) => node.classList.contains('smw-cardMain'))
  const toolbar = [...cardTop.children].find((node) => node.classList.contains('smw-toolbar'))
  assert.ok(main, 'the card head has a title/tag cell')
  assert.ok(toolbar, 'the card head has an action cell')
  assert.equal(toolbar.querySelector('.smw-button').textContent, 'Body', 'the action cell holds the body button')
  assert.ok(!main.contains(toolbar), 'the action is not inside the wrapping title cell')
  assert.ok(/\.smw-cardTop \{[^}]*display: grid/.test(sheet), 'the card head is a two-column grid')
  assert.ok(/\.smw-cardTop > \.smw-toolbar \{[^}]*margin-left: 0/.test(sheet), 'the action keeps the trailing cell')

  // The root adder keeps its button on the input row instead of under the hint:
  // the field wraps input and action in one flex control line.
  const addLabel = [...container.querySelectorAll('.smw-field .smw-label')]
    .find((node) => node.textContent === 'Add folder')
  assert.ok(addLabel, 'the add-folder field is rendered')
  const addField = addLabel.closest('.smw-field')
  const control = addField.querySelector('.smw-fieldControl')
  assert.ok(control, 'the field has an inline control row')
  assert.ok(control.querySelector('input.smw-input'), 'the path input sits in the control row')
  assert.ok(
    [...control.querySelectorAll('button')].some((node) => node.textContent === 'Add folder'),
    'the add button shares the path input row',
  )
  assert.ok(!control.contains(addField.querySelector('.smw-note')), 'the hint stays under the control row')
  assert.ok(/\.smw-fieldControl \{[^}]*display: flex/.test(sheet), 'the control row is a flex line')
  assert.ok(/\.smw-fieldControl \{[^}]*align-items: center/.test(sheet), 'the action is centred on the input')
  restore()
  dom.window.close()
})

test('the machine roots still list under their own sub-headings', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, restore } = await mountPage()
  const text = container.textContent
  assert.ok(text.includes('Other skills on this computer'), 'the machine sub-section is rendered')
  assert.ok(text.includes('claude-skill'), 'a machine skill is listed')
  assert.ok(text.includes('Claude Code'), 'the root is labelled')
  restore()
})

test('every button carries visible text', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, dom, sheet, restore } = await mountPage()
  const styleOf = (node) => dom.window.getComputedStyle(node)

  const assertVisible = (button, where) => {
    const text = button.textContent.trim()
    assert.ok(text !== '', `${where} button has text (got ${JSON.stringify(button.textContent)})`)
  }

  /** The layout guarantees that keep a `.smw-button` label from disappearing. */
  const assertNotSqueezed = (button, where) => {
    const style = styleOf(button)
    assert.equal(style.flexGrow, '0', `${where} button does not grow`)
    assert.equal(style.flexShrink, '0', `${where} button does not shrink`)
    assert.equal(style.whiteSpace, 'nowrap', `${where} button keeps its label on one line`)
  }

  // The column heading's own action.
  const importButton = [...container.querySelectorAll('.smw-paneHead button')]
    .find((node) => node.textContent.trim() === 'Import / Create')
  assert.ok(importButton, 'the import / create button is rendered')
  assertVisible(importButton, 'the import / create')
  assertNotSqueezed(importButton, 'the import / create')

  // Open the panel and check its controls, including the submit button.
  await React.act(async () => {
    importButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  const panel = container.querySelector('.smw-import')
  assert.ok(panel, 'the panel opens')
  for (const button of panel.querySelectorAll('button')) {
    assertVisible(button, `panel "${button.textContent.trim()}"`)
  }
  for (const button of panel.querySelectorAll('button.smw-button')) {
    assertNotSqueezed(button, `panel "${button.textContent.trim()}"`)
  }
  const submit = [...panel.querySelectorAll('.smw-actions button')][0]
  assert.equal(submit.textContent.trim(), 'Import', 'the submit button is labelled')
  assert.equal(submit.getAttribute('data-variant'), 'primary', 'the submit button is primary')

  // Every button in the column carries text, and every `.smw-button` keeps it.
  for (const button of container.querySelectorAll('.smw-pane button')) {
    assertVisible(button, `column "${button.textContent.trim()}"`)
  }
  for (const button of container.querySelectorAll('.smw-pane button.smw-button')) {
    assertNotSqueezed(button, `column "${button.textContent.trim()}"`)
  }

  // The primary fill takes its foreground from the host's own token pair rather
  // than a hardcoded colour, which would vanish on a light fill.
  assert.ok(
    sheet.includes('var(--dsw-alias-button-primary-fill'),
    'the primary fill uses the host button token',
  )
  assert.ok(
    sheet.includes('var(--dsw-alias-label-primary-foreground'),
    'the primary label uses the host foreground token',
  )
  assert.ok(!sheet.includes('#ffffff'), 'no hardcoded white text remains')
  restore()
  dom.window.close()
})

test('the MCP tab keeps its own hierarchy untouched', async (t) => {
  if (React === undefined) return t.skip('react, react-dom, and jsdom are unavailable')
  const { container, dom, restore } = await mountPage()
  const tabs = [...container.querySelectorAll('[role="tab"]')]
  const mcpTab = tabs.find((tab) => tab.textContent === 'MCP')
  await React.act(async () => {
    mcpTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  assert.ok(container.textContent.includes('MCP servers'), 'the MCP section renders')
  restore()
  dom.window.close()
})
