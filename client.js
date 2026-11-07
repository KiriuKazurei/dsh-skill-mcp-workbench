// The Skill & MCP workbench browser half.
//
// Plain JavaScript with no build step: the module loader hands the factory `React`,
// and every visible string comes from this plugin's own locale dictionary so the
// panel follows the page language. The half contributes two registrations — the
// sidebar row and the `main` panel it opens — and talks to its Host half through
// the authenticated `api/skill-mcp-workbench` route plus the shipped
// `pluginManager` Remote for row enablement and live fiber state.
window.__ModuleLoader__.load({
  id: 'dsh-skill-mcp-workbench',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Route served by the plugin's Host half, document-relative like the shell's own downloads. */
    const ROUTE = 'api/skill-mcp-workbench'

    /** Dictionary namespace shared by every registration. */
    const NS = 'skillMcpWorkbench'

    /** The id the sidebar row and the main panel share. */
    const PANEL_ID = 'skill-mcp'

    /** Host fiber phase to the shared status vocabulary the Plugins page uses. */
    const PHASE_STATE = {
      active: 'done',
      failed: 'error',
      pending: 'ongoing',
      loading: 'ongoing',
      unloading: 'ongoing',
      disabled: 'idle',
    }

    /** Skill source label to dictionary key. */
    const SOURCE_KEYS = {
      'project-dsh': 'sourceProjectDsh',
      'project-agents': 'sourceProjectAgents',
      custom: 'sourceCustom',
      'user-dsh': 'sourceUserDsh',
      'user-agents': 'sourceUserAgents',
      bundled: 'sourceBundled',
      runtime: 'sourceRuntime',
    }

    /** Machine root label to dictionary key. */
    const ROOT_KEYS = {
      'user-dsh': 'sourceUserDsh',
      'user-agents': 'sourceUserAgents',
      'claude-code': 'rootClaude',
      codex: 'rootCodex',
      cursor: 'rootCursor',
      gemini: 'rootGemini',
      'config-dsh': 'rootConfigDsh',
      bundled: 'sourceBundled',
      custom: 'sourceCustom',
    }

    const en = {
      panel: 'Skill & MCP',
      title: 'Skill & MCP Workbench',
      intro: 'Browse every skill available to the Harness and every skill folder on this computer, then import or create your own. Connect MCP servers in the other tab.',
      tabSkills: 'Skills',
      tabMcp: 'MCP',
      refresh: 'Refresh',
      loading: 'Loading…',
      sectionGlobal: 'Global skills',
      globalHint: 'Everything the Harness can see, plus every skill folder on this computer.',
      sectionHarness: 'Harness skills',
      sectionSession: 'Skills this Session can invoke',
      sessionHint: 'The catalog the current Session composition advertises, including skills an agent preset contributes.',
      sectionMachine: 'Other skills on this computer',
      emptyHarness: 'No skills are visible to the Harness.',
      emptyMachine: 'No skill folders were found on this computer.',
      groupCount: '{count} skills',
      body: 'Body',
      hideBody: 'Hide body',
      modelInvocable: 'Model',
      userInvocable: 'User',
      on: 'on',
      off: 'off',
      addRoot: 'Add folder',
      addRootHint: 'Absolute path to a folder that holds skills.',
      removeRoot: 'Forget',
      rootMissing: 'not present',
      rootCount: '{count} skills',
      sourceCustom: 'Custom root',
      sourceUserDsh: 'Harness user',
      sourceUserAgents: 'Agents user',
      sourceBundled: 'Bundled',
      sourceRuntime: 'Runtime',
      rootClaude: 'Claude Code',
      rootCodex: 'Codex',
      rootCursor: 'Cursor',
      rootGemini: 'Gemini',
      rootConfigDsh: 'Harness config',
      mcpTitle: 'MCP servers',
      mcpIntro: 'Every @deepseek-ai/dsh-mcp-client row this profile declares, with its live connection state.',
      addServer: 'Add server',
      editServer: 'Edit server',
      save: 'Save',
      cancel: 'Cancel',
      serverName: 'Server name',
      serverNameHint: 'Letters, digits, “_” and “-”, up to 32 characters. It becomes the mcp__<name>__ tool prefix.',
      transport: 'Transport',
      transportHttp: 'Streamable HTTP',
      transportStdio: 'stdio (command)',
      url: 'Endpoint URL',
      headers: 'Headers',
      headersHint: 'One “Name: value” per line. Stored as plain text in the profile patch.',
      command: 'Command',
      args: 'Arguments',
      argsHint: 'One argument per line.',
      env: 'Environment',
      envHint: 'One KEY=value per line.',
      cwd: 'Working directory',
      failOnStartup: 'Fail startup on error',
      optional: 'optional',
      enabled: 'Enabled',
      phaseActive: 'connected',
      phaseFailed: 'failed',
      phaseOngoing: 'connecting',
      phaseIdle: 'idle',
      tools: 'Tools',
      toolCount: '{count} tools',
      layerProfile: 'Profile patch',
      layerHome: 'Home patch',
      readOnly: 'Declared in the {layer}; edit that file to change it.',
      secrets: 'Headers and environment values are stored as plain text in cordis.patch.yml.',
      removeServer: 'Remove',
      copyConfig: 'Copy JSON',
      copied: 'Copied',
      noServers: 'No MCP servers are configured yet.',
      importCreate: 'Import / Create',
      importTitle: 'Import a skill',
      importHint: 'A .md file with YAML frontmatter, or a .zip bundle holding <name>/SKILL.md. Skills land in the Harness user skill root.',
      chooseFile: 'Choose a .md or .zip file',
      noFileChosen: 'No file chosen',
      importAction: 'Import',
      createTitle: 'Create a skill',
      name: 'Name',
      nameHint: 'kebab-case: lowercase words joined by hyphens.',
      description: 'Description',
      descriptionHint: 'One line saying when this skill applies.',
      whenToUse: 'When to use',
      whenToUseHint: 'Optional extra routing guidance.',
      skillBody: 'Body',
      skillBodyHint: 'Markdown instructions. Optional — a placeholder is written when empty.',
      createAction: 'Create',
      cancel: 'Cancel',
      imported: 'Imported',
      created: 'Created',
      importFailed: 'The import failed',
      createFailed: 'Creating the skill failed',
    }

    const zh = {
      panel: '技能与 MCP',
      title: '技能与 MCP 工作台',
      intro: '浏览 Harness 可见的全部技能和本机所有技能目录，然后导入或创建你自己的技能。MCP 服务器在另一个分页配置。',
      tabSkills: '技能',
      tabMcp: 'MCP',
      refresh: '刷新',
      loading: '加载中…',
      sectionGlobal: '全局技能',
      globalHint: 'Harness 能看到的一切，加上本机所有技能目录。',
      sectionHarness: 'Harness 技能',
      sectionSession: '本会话可调用的技能',
      sessionHint: '当前会话组合对外公布的技能目录，包含 agent preset 贡献的技能。',
      sectionMachine: '本机其他技能',
      emptyHarness: 'Harness 看不到任何技能。',
      emptyMachine: '本机没有找到技能目录。',
      groupCount: '{count} 个技能',
      body: '正文',
      hideBody: '收起正文',
      modelInvocable: '模型',
      userInvocable: '用户',
      on: '开',
      off: '关',
      addRoot: '添加目录',
      addRootHint: '存放技能的目录绝对路径。',
      removeRoot: '移除',
      rootMissing: '不存在',
      rootCount: '{count} 个技能',
      sourceCustom: '自定义目录',
      sourceUserDsh: 'Harness 用户',
      sourceUserAgents: 'Agents 用户',
      sourceBundled: '随附',
      sourceRuntime: '运行时',
      rootClaude: 'Claude Code',
      rootCodex: 'Codex',
      rootCursor: 'Cursor',
      rootGemini: 'Gemini',
      rootConfigDsh: 'Harness 配置',
      mcpTitle: 'MCP 服务器',
      mcpIntro: '当前 profile 声明的所有 @deepseek-ai/dsh-mcp-client 行，以及它们的实时连接状态。',
      addServer: '添加服务器',
      editServer: '编辑服务器',
      save: '保存',
      cancel: '取消',
      serverName: '服务器名',
      serverNameHint: '字母、数字、“_”和“-”，最多 32 个字符。它会成为 mcp__<name>__ 工具前缀。',
      transport: '传输方式',
      transportHttp: 'Streamable HTTP',
      transportStdio: 'stdio（命令）',
      url: '接口地址',
      headers: '请求头',
      headersHint: '每行一个“名称: 值”。以明文存放在 profile patch 中。',
      command: '命令',
      args: '参数',
      argsHint: '每行一个参数。',
      env: '环境变量',
      envHint: '每行一个 KEY=value。',
      cwd: '工作目录',
      failOnStartup: '启动失败即报错',
      optional: '可选',
      enabled: '启用',
      phaseActive: '已连接',
      phaseFailed: '失败',
      phaseOngoing: '连接中',
      phaseIdle: '空闲',
      tools: '工具',
      toolCount: '{count} 个工具',
      layerProfile: 'Profile patch',
      layerHome: 'Home patch',
      readOnly: '该行声明在{layer}中，请直接编辑那个文件。',
      secrets: '请求头和环境变量以明文存放在 cordis.patch.yml 中。',
      removeServer: '移除',
      copyConfig: '复制 JSON',
      copied: '已复制',
      noServers: '还没有配置 MCP 服务器。',
      importCreate: '导入 / 创建',
      importTitle: '导入技能',
      importHint: '带 YAML frontmatter 的 .md 文件，或包含 <name>/SKILL.md 的 .zip 包。技能会写入 Harness 用户技能目录。',
      chooseFile: '选择 .md 或 .zip 文件',
      noFileChosen: '未选择文件',
      importAction: '导入',
      createTitle: '创建技能',
      name: '名称',
      nameHint: 'kebab-case：小写单词用连字符连接。',
      description: '描述',
      descriptionHint: '一句话说明这个技能什么时候用。',
      whenToUse: '使用时机',
      whenToUseHint: '可选的路由补充说明。',
      skillBody: '正文',
      skillBodyHint: 'Markdown 指令。可留空——留空时写入占位内容。',
      createAction: '创建',
      cancel: '取消',
      imported: '已导入',
      created: '已创建',
      importFailed: '导入失败',
      createFailed: '创建失败',
    }

    /** Message of an arbitrary thrown value. */
    function messageOf(error) {
      if (error instanceof Error) return error.message
      if (typeof error === 'string') return error
      return String(error)
    }

    /** Fill a dictionary template. */
    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match))
    }

    /** One Host call. */
    async function call(method, params) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, params: params ?? {} }),
      })
      const payload = await response.json().catch(() => null)
      if (payload === null) throw new Error(`${method}: the Host answered ${response.status}`)
      if (payload.ok !== true) throw new Error(payload?.error?.message ?? `${method} failed`)
      return payload.value
    }

    /** Read a chosen file as a base64 data URL, for the import route. */
    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('the file could not be read'))
        reader.readAsDataURL(file)
      })
    }

    /** A resource that reloads when its key changes, or when `reload()` is called. */
    function useResource(load, key) {
      const [state, setState] = React.useState({ status: 'loading', data: null, error: null })
      const [nonce, setNonce] = React.useState(0)
      const loadRef = React.useRef(load)
      loadRef.current = load
      React.useEffect(() => {
        let live = true
        setState((current) => ({ ...current, status: 'loading' }))
        loadRef.current().then(
          (data) => {
            if (live) setState({ status: 'ready', data, error: null })
          },
          (error) => {
            if (live) setState({ status: 'error', data: null, error: messageOf(error) })
          },
        )
        return () => {
          live = false
        }
      }, [key, nonce])
      return { ...state, reload: () => setNonce((value) => value + 1) }
    }

    /** Whether a value survives the lossless-JSON boundary the tool contract enforces. */
    function isLossless(value) {
      if (value === null) return true
      if (typeof value === 'string' || typeof value === 'boolean') return true
      if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0)
      if (Array.isArray(value)) return value.every(isLossless)
      if (typeof value === 'object') {
        return Object.getPrototypeOf(value) === Object.prototype
          && Reflect.ownKeys(value).every((key) => typeof key === 'string')
          && Object.values(value).every(isLossless)
      }
      return false
    }

    /** One stylesheet, installed with the plugin run and removed with it. */
    const STYLES = `
.smw-page { display: flex; flex-direction: column; height: 100%; min-height: 0; --smw-gutter: clamp(28px, 5%, 80px); }
.smw-head { padding: 28px var(--smw-gutter) 0 var(--smw-gutter); display: flex; flex-direction: column; gap: 12px; }
.smw-title { font-size: 20px; line-height: 26px; font-weight: 600; color: var(--dsw-alias-label-primary); margin: 0; }
.smw-intro { font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary); margin: 0; max-width: 720px; }
.smw-tabs { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.smw-tab { appearance: none; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; line-height: 18px; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
.smw-tab:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.smw-tab[aria-selected="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.smw-toolbar { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.smw-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px var(--smw-gutter) 28px var(--smw-gutter); }
/* The column owns the page width: the head and the body share one gutter, so the
   first card, the column surface and the tab label all start on the same edge. */
.smw-column { width: 100%; max-width: none; margin: 0; display: flex; flex-direction: column; gap: 20px; }
.smw-section { display: flex; flex-direction: column; gap: 8px; }
.smw-sectionHead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.smw-sectionTitle { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--dsw-alias-label-primary); margin: 0; }
.smw-count { font-size: 12px; line-height: 16px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.smw-note { font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); margin: 0; }
.smw-cards { display: flex; flex-direction: column; gap: 2px; }
/* The one skill column: a raised surface holding every flow. */
.smw-pane { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.smw-paneHead { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding-bottom: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.smw-paneTitle { font-size: 15px; line-height: 20px; font-weight: 700; color: var(--dsw-alias-label-primary); margin: 0; }
.smw-paneCount { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.smw-subHead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.smw-subTitle { font-size: 13px; line-height: 18px; font-weight: 700; color: var(--dsw-alias-label-primary); margin: 0; }
.smw-subCount { font-size: 11px; line-height: 15px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.smw-rootLabel { font-size: 11px; line-height: 15px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
/* The flow: cards wrap onto a new row when the column runs out of room, and the
   column scrolls horizontally once a single card no longer fits. */
.smw-flow { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2) transparent; }
.smw-flow::-webkit-scrollbar { height: 8px; }
.smw-flow::-webkit-scrollbar-track { background: transparent; }
.smw-flow::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 999px; }
.smw-flow > * { flex: 1 1 360px; min-width: 320px; max-width: 100%; }
/* The import / create panel: a sunken well that opens under the column heading. */
.smw-import { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); }
.smw-importHead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.smw-importTitle { font-size: 13px; line-height: 18px; font-weight: 700; color: var(--dsw-alias-label-primary); margin: 0; }
.smw-importBody { display: flex; flex-direction: column; gap: 10px; }
.smw-fileRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.smw-fileButton { appearance: none; font: inherit; font-size: 12px; line-height: 16px; font-weight: 500; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; }
.smw-fileButton:hover { border-color: var(--dsw-alias-brand-primary); }
.smw-fileName { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); word-break: break-all; }
.smw-visuallyHidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.smw-card { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
.smw-card:hover { border-color: var(--dsw-alias-border-l2); }
/* The card head is a two-column grid: the title and its tags wrap in the first
   column, while the row action keeps the same top-right corner on every card,
   including one whose long name wraps onto a second line. */
.smw-cardTop { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; }
.smw-cardMain { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.smw-cardTop > .smw-toolbar { margin-left: 0; }
/* The skill title: the loudest thing in the card. */
.smw-name { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 15px; line-height: 20px; font-weight: 700; color: var(--dsw-alias-label-primary); word-break: break-word; }
.smw-desc { font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.smw-path { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-secondary); word-break: break-all; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.smw-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; line-height: 15px; font-weight: 500; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); }
.smw-tag[data-tone="done"] { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.smw-tag[data-tone="error"] { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); font-weight: 600; }
.smw-tag[data-tone="ongoing"] { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.smw-tag[data-tone="brand"] { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); font-weight: 600; }
.smw-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.smw-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.smw-policyLabel { font-size: 11px; line-height: 15px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
/* The expanded skill body: a sunken well, one size down from the description. */
.smw-pre { margin: 6px 0 0 0; padding: 10px; border-radius: 6px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto; }
/* A button never shrinks and never wraps its label, so a short label such as
   "导入" cannot be squeezed away and a long one cannot be clipped. */
.smw-button { appearance: none; flex: none; white-space: nowrap; font: inherit; font-size: 12px; line-height: 16px; font-weight: 500; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; }
.smw-button:hover { border-color: var(--dsw-alias-border-l2); }
.smw-button:disabled { opacity: 0.55; cursor: default; }
/* The primary fill and its foreground come from the host's own button tokens, so
   the label always contrasts with the fill; a hardcoded colour vanishes on a
   light fill. */
.smw-button[data-variant="primary"] { background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary)); border-color: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary)); color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-label-primary)); font-weight: 600; }
.smw-button[data-variant="quiet"] { background: transparent; }
.smw-form { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.smw-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
.smw-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 220px; min-width: 0; }
/* A field whose input shares its row with an inline action: the input takes the
   remaining width and the action stays centred on the input, not under the hint. */
.smw-fieldControl { display: flex; align-items: center; gap: 8px; min-width: 0; }
.smw-fieldControl > .smw-input { flex: 1 1 auto; min-width: 0; }
.smw-fieldControl > .smw-button { flex: 0 0 auto; }
.smw-label { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.smw-input, .smw-select, .smw-textarea { font: inherit; font-size: 13px; line-height: 18px; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.smw-textarea { min-height: 60px; resize: vertical; font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.smw-input:focus, .smw-select:focus, .smw-textarea:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.smw-check { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-primary); }
.smw-error { font-size: 12px; line-height: 17px; color: var(--dsw-alias-state-error-primary); margin: 0; }
.smw-empty { font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary); padding: 12px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 8px; }
.smw-switch { appearance: none; width: 30px; height: 18px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); position: relative; cursor: pointer; padding: 0; flex: 0 0 auto; }
.smw-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
.smw-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.smw-switch[aria-checked="true"]::after { transform: translateX(12px); background: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-label-primary)); }
.smw-switch:disabled { opacity: 0.55; cursor: default; }
`

    /**
     * The sidebar glyph: an open book drawn in the host's own icon language.
     *
     * Every shipped panel row renders a `16px` stroke-only glyph — a `0 0 16 16`
     * viewBox, `currentColor`, a 1px stroke, no plate and no fill — and the sidebar
     * colours the row through that inherited colour. The registration's `active`
     * flag is deliberately unused here, exactly as on the `plugins` and `schedules`
     * rows: selection is shown by the row background, not by the glyph.
     */
    function PanelIcon({ size = 16 }) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': true,
        strokeWidth: 1,
      },
        h('path', { d: 'M8 4.35C7 3.42 5.5 2.98 4.12 3.12C3.3 3.2 2.86 3.55 2.86 4.02V12.2C2.86 12.6 3.2 12.83 3.6 12.78C5.06 12.63 6.78 13.02 8 13.9', stroke: 'currentColor' }),
        h('path', { d: 'M8 4.35C9 3.42 10.5 2.98 11.88 3.12C12.7 3.2 13.14 3.55 13.14 4.02V12.2C13.14 12.6 12.8 12.83 12.4 12.78C10.94 12.63 9.22 13.02 8 13.9', stroke: 'currentColor' }),
        h('path', { d: 'M8 4.35V13.9', stroke: 'currentColor' }),
      )
    }

    /** A small status tag. */
    function Tag({ tone, children }) {
      return h('span', { className: 'smw-tag', 'data-tone': tone ?? undefined }, children)
    }

    /** A button. */
    function Button({ variant, onClick, disabled, children, title }) {
      return h('button', {
        type: 'button',
        className: 'smw-button',
        'data-variant': variant,
        disabled: disabled === true,
        title,
        onClick,
      }, children)
    }

    /** A switch with the accessible pattern the host uses. */
    function Switch({ checked, onChange, disabled, label }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': label,
        className: 'smw-switch',
        disabled: disabled === true,
        onClick: () => onChange(!checked),
      })
    }

    /** A labelled text field, optionally with an inline action beside the input. */
    function Field({ label, hint, value, onChange, placeholder, mono, action }) {
      const input = h('input', {
        className: 'smw-input',
        value: value ?? '',
        placeholder,
        style: mono ? { fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)' } : undefined,
        onChange: (event) => onChange(event.target.value),
      })
      return h('div', { className: 'smw-field' },
        h('span', { className: 'smw-label' }, label),
        action !== undefined ? h('div', { className: 'smw-fieldControl' }, input, action) : input,
        hint !== undefined ? h('span', { className: 'smw-note' }, hint) : null,
      )
    }

    /** A labelled multi-line field. */
    function TextArea({ label, hint, value, onChange, placeholder }) {
      return h('div', { className: 'smw-field' },
        h('span', { className: 'smw-label' }, label),
        h('textarea', {
          className: 'smw-textarea',
          value: value ?? '',
          placeholder,
          onChange: (event) => onChange(event.target.value),
        }),
        hint !== undefined ? h('span', { className: 'smw-note' }, hint) : null,
      )
    }

    /** One skill card in any flow. */
    function SkillRow({ t, skill, onReadBody }) {
      const [open, setOpen] = React.useState(false)
      const [body, setBody] = React.useState(null)
      const [bodyError, setBodyError] = React.useState(null)
      const sourceKey = SOURCE_KEYS[skill.source] ?? 'sourceCustom'
      const toggleBody = async () => {
        if (open) {
          setOpen(false)
          return
        }
        setOpen(true)
        if (body !== null || bodyError !== null) return
        try {
          setBody(await onReadBody(skill.name))
        } catch (error) {
          setBodyError(messageOf(error))
        }
      }
      return h('div', { className: 'smw-card' },
        h('div', { className: 'smw-cardTop' },
          h('div', { className: 'smw-cardMain' },
            h('code', { className: 'smw-name' }, skill.name),
            h(Tag, null, t(sourceKey)),
            skill.invocation?.modelInvocable === false ? h(Tag, { tone: 'error' }, `${t('modelInvocable')}: ${t('off')}`) : null,
            skill.invocation?.userInvocable === false ? h(Tag, { tone: 'error' }, `${t('userInvocable')}: ${t('off')}`) : null,
          ),
          h('div', { className: 'smw-toolbar' },
            h(Button, { variant: 'quiet', onClick: toggleBody }, open ? t('hideBody') : t('body')),
          ),
        ),
        h('p', { className: 'smw-desc' }, skill.description),
        skill.path !== undefined ? h('p', { className: 'smw-path' }, skill.path) : null,
        open ? h('div', null,
          bodyError !== null ? h('p', { className: 'smw-error' }, bodyError) : null,
          body === null && bodyError === null ? h('p', { className: 'smw-note' }, t('loading')) : null,
          body !== null ? h('pre', { className: 'smw-pre' }, body.content) : null,
        ) : null,
      )
    }

    /** An empty server draft. */
    function emptyServer() {
      return {
        serverName: '',
        transport: 'streamable-http',
        url: '',
        headers: '',
        command: '',
        args: '',
        env: '',
        cwd: '',
        failOnStartupError: false,
      }
    }

    /** A row back into a form draft. */
    function serverOf(row) {
      return {
        serverName: row.serverName ?? '',
        transport: row.transport ?? 'streamable-http',
        url: row.url ?? '',
        headers: Object.entries(row.headers ?? {}).map(([key, value]) => `${key}: ${value}`).join('\n'),
        command: row.command ?? '',
        args: (row.args ?? []).join('\n'),
        env: Object.entries(row.env ?? {}).map(([key, value]) => `${key}=${value}`).join('\n'),
        cwd: row.cwd ?? '',
        failOnStartupError: row.failOnStartupError === true,
      }
    }

    /** Build the page components bound to one context. */
    function createFace(ctx, t) {
      /** Read one skill body through the Host. */
      const readBody = (name) => call('skills.read', { name })

      /** The Session whose catalog the page shows, when one is retained. */
      const sessionId = () => ctx.sessions?.list?.getSnapshot?.()?.[0]?.id ?? null

      const WorkbenchPage = function WorkbenchPage() {
        const [tab, setTab] = React.useState('skills')
        const [reload, setReload] = React.useState(0)

        return h('div', { className: 'smw-page' },
          h('div', { className: 'smw-head' },
            h('h1', { className: 'smw-title' }, t('title')),
            h('p', { className: 'smw-intro' }, t('intro')),
            h('div', { className: 'smw-tabs', role: 'tablist' },
              h('button', { type: 'button', role: 'tab', className: 'smw-tab', 'aria-selected': tab === 'skills', onClick: () => setTab('skills') }, t('tabSkills')),
              h('button', { type: 'button', role: 'tab', className: 'smw-tab', 'aria-selected': tab === 'mcp', onClick: () => setTab('mcp') }, t('tabMcp')),
              h('div', { className: 'smw-toolbar' },
                h(Button, { variant: 'quiet', onClick: () => setReload((value) => value + 1) }, t('refresh')),
              ),
            ),
          ),
          h('div', { className: 'smw-body' },
            h('div', { className: 'smw-column' },
              tab === 'skills'
                ? h(SkillsTab, { reload, readBody })
                : h(McpTab, { reload }),
            ),
          ),
        )
      }

      /** The Skills tab: one column of global skills, with the import/create entry. */
      function SkillsTab({ reload, readBody }) {
        const [notice, setNotice] = React.useState(null)
        const [busy, setBusy] = React.useState(false)
        const [panel, setPanel] = React.useState(null)
        const catalog = useResource(() => call('skills.catalog'), `catalog:${reload}`)
        const machine = useResource(() => call('skills.roots'), `roots:${reload}`)
        const session = useResource(() => call('skills.session', { sessionId: sessionId() }), `session:${reload}`)

        /** Run one operation, report its outcome, and refresh what it touched. */
        const run = async (label, operation, after) => {
          setBusy(true)
          setNotice(null)
          try {
            const result = await operation()
            setNotice({ tone: 'ok', text: label })
            if (after !== undefined) after()
            return result
          } catch (error) {
            setNotice({ tone: 'error', text: messageOf(error) })
            return null
          } finally {
            setBusy(false)
          }
        }

        const groups = catalog.status === 'ready' ? catalog.data.groups : []
        const roots = machine.status === 'ready' ? machine.data.roots : []

        const rowProps = (skill) => ({ t, skill, onReadBody: readBody })

        /** One flowing strip of cards. */
        const flow = (cards) => h('div', { className: 'smw-flow' }, cards)

        /** A sub-heading inside the column. */
        const subHead = (title, count) => h('div', { className: 'smw-subHead' },
          h('h3', { className: 'smw-subTitle' }, title),
          count !== undefined ? h('span', { className: 'smw-subCount' }, fill(t('groupCount'), { count })) : null,
        )

        const harnessCards = groups.flatMap((group) => group.skills.map((skill) =>
          h(SkillRow, { key: `harness-${group.source}-${skill.name}`, ...rowProps(skill) })))

        const sessionCards = session.status === 'ready'
          ? session.data.skills.map((skill) => h(SkillRow, {
              key: `session-${skill.name}`,
              ...rowProps({
                name: skill.name,
                description: skill.description,
                whenToUse: skill.whenToUse,
                invocation: { modelInvocable: skill.modelInvocable !== false, userInvocable: true },
                source: 'runtime',
                path: skill.path,
              }),
            }))
          : []

        const total = harnessCards.length + sessionCards.length
          + (machine.status === 'ready' ? machine.data.total : 0)

        return h('section', { className: 'smw-pane' },
          h('div', { className: 'smw-paneHead' },
            h('h2', { className: 'smw-paneTitle' }, t('sectionGlobal')),
            h('span', { className: 'smw-paneCount' }, fill(t('groupCount'), { count: total })),
            /* The import / create entry sits at the top right of the column, where
               the column's own action belongs. */
            h('div', { className: 'smw-toolbar' },
              h(Button, {
                variant: 'primary',
                onClick: () => setPanel(panel === null ? 'import' : null),
              }, t('importCreate')),
            ),
          ),
          h('p', { className: 'smw-note' }, t('globalHint')),
          notice !== null ? h('p', { className: notice.tone === 'error' ? 'smw-error' : 'smw-note' }, notice.text) : null,
          catalog.status === 'error' ? h('p', { className: 'smw-error' }, catalog.error) : null,
          panel !== null
            ? h(ImportCreate, {
                mode: panel,
                setMode: setPanel,
                busy,
                setBusy,
                setNotice,
                onCancel: () => setPanel(null),
                onDone: (label) => {
                  setPanel(null)
                  setNotice({ tone: 'ok', text: label })
                  catalog.reload()
                  machine.reload()
                  session.reload()
                },
              })
            : null,
          groups.length > 0 || catalog.status === 'error'
            ? h(React.Fragment, null,
                subHead(t('sectionHarness'), harnessCards.length),
                harnessCards.length > 0 ? flow(harnessCards) : null,
                catalog.status === 'ready' && harnessCards.length === 0
                  ? h('p', { className: 'smw-empty' }, t('emptyHarness'))
                  : null,
              )
            : null,
          sessionCards.length > 0 || session.status === 'error'
            ? h(React.Fragment, null,
                subHead(t('sectionSession'), sessionCards.length),
                session.status === 'error' ? h('p', { className: 'smw-note' }, session.error) : null,
                sessionCards.length > 0 ? flow(sessionCards) : null,
              )
            : null,
          roots.length > 0
            ? h(React.Fragment, null,
                subHead(t('sectionMachine'), machine.status === 'ready' ? machine.data.total : 0),
                h(RootAdder, {
                  busy,
                  onAdd: (path) => run(t('addRoot'), () => call('skills.roots', { add: path }), () => machine.reload()),
                }),
                roots.map((root) => h(React.Fragment, { key: root.path },
                  h('div', { className: 'smw-subHead' },
                    h('span', { className: 'smw-rootLabel' }, t(ROOT_KEYS[root.label] ?? 'sourceCustom')),
                    root.exists
                      ? h('span', { className: 'smw-subCount' }, fill(t('rootCount'), { count: root.skills.length }))
                      : h('span', { className: 'smw-subCount' }, t('rootMissing')),
                    h('div', { className: 'smw-toolbar' },
                      root.label === 'custom'
                        ? h(Button, {
                            variant: 'quiet',
                            disabled: busy,
                            onClick: () => run(t('removeRoot'), () => call('skills.roots', { remove: root.path }), () => machine.reload()),
                          }, t('removeRoot'))
                        : null,
                    ),
                  ),
                  h('p', { className: 'smw-path' }, root.path),
                  root.skills.length > 0
                    ? flow(root.skills.map((skill) => h(SkillRow, {
                        key: `root-${root.path}-${skill.name}`,
                        ...rowProps(skill),
                      })))
                    : null,
                )),
              )
            : null,
          machine.status === 'ready' && machine.data.total === 0 && roots.length > 0
            ? h('p', { className: 'smw-empty' }, t('emptyMachine'))
            : null,
          machine.status === 'error' ? h('p', { className: 'smw-error' }, machine.error) : null,
        )
      }

      /** The field that adds one extra skill root. */
      function RootAdder({ busy, onAdd }) {
        const [path, setPath] = React.useState('')
        return h(Field, {
          label: t('addRoot'),
          hint: t('addRootHint'),
          value: path,
          onChange: setPath,
          placeholder: 'D:/skills',
          mono: true,
          action: h(Button, {
            variant: 'primary',
            disabled: busy || path.trim() === '',
            onClick: () => {
              const next = path.trim()
              setPath('')
              return onAdd(next)
            },
          }, t('addRoot')),
        })
      }

      /**
       * The import / create panel: either a file picker for a `.md` or `.zip`
       * skill, or a short form that writes a new bundle.
       */
      function ImportCreate({ mode, setMode, busy, setBusy, setNotice, onCancel, onDone }) {
        const [file, setFile] = React.useState(null)
        const [error, setError] = React.useState(null)
        const [draft, setDraft] = React.useState({ name: '', description: '', whenToUse: '', body: '' })
        const patch = (next) => setDraft((current) => ({ ...current, ...next }))

        const submit = async (operation, label) => {
          setBusy(true)
          setError(null)
          setNotice(null)
          try {
            await operation()
            onDone(label)
          } catch (caught) {
            setError(messageOf(caught))
            setNotice({ tone: 'error', text: mode === 'import' ? t('importFailed') : t('createFailed') })
          } finally {
            setBusy(false)
          }
        }

        return h('form', {
          className: 'smw-import',
          onSubmit: (event) => {
            event.preventDefault()
            if (mode === 'import') {
              if (file === null) {
                setError(t('noFileChosen'))
                return
              }
              return submit(async () => {
                const data = await readFileAsDataUrl(file)
                return call('skills.import', { fileName: file.name, data })
              }, t('imported'))
            }
            return submit(() => call('skills.create', draft), t('created'))
          },
        },
          h('div', { className: 'smw-importHead' },
            h('h3', { className: 'smw-importTitle' }, mode === 'import' ? t('importTitle') : t('createTitle')),
            h('div', { className: 'smw-toolbar' },
              h('button', {
                type: 'button',
                className: 'smw-tab',
                'aria-selected': mode === 'import',
                onClick: () => {
                  setError(null)
                  setMode('import')
                },
              }, t('importTitle')),
              h('button', {
                type: 'button',
                className: 'smw-tab',
                'aria-selected': mode === 'create',
                onClick: () => {
                  setError(null)
                  setMode('create')
                },
              }, t('createTitle')),
            ),
          ),
          mode === 'import'
            ? h('div', { className: 'smw-importBody' },
                h('p', { className: 'smw-note' }, t('importHint')),
                h('div', { className: 'smw-fileRow' },
                  /* The real input is visually hidden but focusable and labelled, so
                     the styled button drives it and keyboard users keep control. */
                  h('input', {
                    id: 'smw-import-file',
                    className: 'smw-visuallyHidden',
                    type: 'file',
                    accept: '.md,.zip',
                    onChange: (event) => {
                      setError(null)
                      setFile(event.target.files?.[0] ?? null)
                    },
                  }),
                  h('label', { className: 'smw-fileButton', htmlFor: 'smw-import-file' }, t('chooseFile')),
                  h('span', { className: 'smw-fileName' }, file === null ? t('noFileChosen') : file.name),
                ),
              )
            : h('div', { className: 'smw-importBody' },
                h(Field, {
                  label: t('name'),
                  hint: t('nameHint'),
                  value: draft.name,
                  onChange: (value) => patch({ name: value }),
                  placeholder: 'my-skill',
                  mono: true,
                }),
                h(Field, {
                  label: t('description'),
                  hint: t('descriptionHint'),
                  value: draft.description,
                  onChange: (value) => patch({ description: value }),
                }),
                h(Field, {
                  label: `${t('whenToUse')} (${t('optional')})`,
                  hint: t('whenToUseHint'),
                  value: draft.whenToUse,
                  onChange: (value) => patch({ whenToUse: value }),
                }),
                h(TextArea, {
                  label: `${t('skillBody')} (${t('optional')})`,
                  hint: t('skillBodyHint'),
                  value: draft.body,
                  onChange: (value) => patch({ body: value }),
                }),
              ),
          error !== null ? h('p', { className: 'smw-error' }, error) : null,
          h('div', { className: 'smw-actions' },
            h(Button, { variant: 'primary', disabled: busy }, mode === 'import' ? t('importAction') : t('createAction')),
            h(Button, { variant: 'quiet', onClick: onCancel }, t('cancel')),
          ),
        )
      }

      /** The MCP tab. */
      function McpTab({ reload }) {
        const [notice, setNotice] = React.useState(null)
        const [busy, setBusy] = React.useState(false)
        const [editing, setEditing] = React.useState(null)
        const servers = useResource(() => call('mcp.list'), `mcp:${reload}`)

        React.useEffect(() => ctx.remote.$on('plugin-manager/changed', () => servers.reload()), [])

        const run = async (operation) => {
          setBusy(true)
          setNotice(null)
          try {
            const result = await operation()
            servers.reload()
            return result
          } catch (error) {
            setNotice({ tone: 'error', text: messageOf(error) })
            return null
          } finally {
            setBusy(false)
          }
        }

        const rows = servers.status === 'ready' ? servers.data.rows : []

        return h('section', { className: 'smw-section' },
          h('div', { className: 'smw-sectionHead' },
            h('h2', { className: 'smw-sectionTitle' }, t('mcpTitle')),
            h('span', { className: 'smw-count' }, fill(t('groupCount'), { count: rows.length })),
            h('div', { className: 'smw-toolbar' },
              h(Button, {
                variant: 'primary',
                disabled: busy || editing !== null,
                onClick: () => setEditing({ mode: 'add', server: emptyServer() }),
              }, t('addServer')),
            ),
          ),
          h('p', { className: 'smw-intro' }, t('mcpIntro')),
          h('p', { className: 'smw-note' }, t('secrets')),
          servers.status === 'error' ? h('p', { className: 'smw-error' }, servers.error) : null,
          notice !== null ? h('p', { className: notice.tone === 'error' ? 'smw-error' : 'smw-note' }, notice.text) : null,
          editing !== null ? h(ServerForm, {
            busy,
            draft: editing,
            onCancel: () => setEditing(null),
            onSubmit: (server) => run(async () => {
              if (editing.mode === 'add') return call('mcp.add', { server })
              return call('mcp.update', { id: editing.id, server })
            }).then((result) => {
              if (result !== null) setEditing(null)
              return result
            }),
          }) : null,
          rows.length === 0 && servers.status === 'ready' ? h('p', { className: 'smw-empty' }, t('noServers')) : null,
          h('div', { className: 'smw-cards' }, rows.map((row) => h(ServerRow, {
            key: row.id,
            t,
            row,
            busy,
            onEdit: () => setEditing({ mode: 'edit', id: row.id, server: serverOf(row) }),
            onRemove: () => run(() => call('mcp.remove', { id: row.id })),
            onToggle: (enabled) => run(async () => {
              const result = await ctx.remote.pluginManager.setPluginEnabled(row.id, enabled)
              if (result?.ok !== true) throw new Error(result?.error?.message ?? 'the plugin manager refused the change')
              return result
            }),
          }))),
        )
      }

      /** One MCP server row. */
      function ServerRow({ t, row, busy, onEdit, onRemove, onToggle }) {
        const [copied, setCopied] = React.useState(false)
        const tone = PHASE_STATE[row.phase] ?? 'idle'
        const phaseKey = tone === 'done' ? 'phaseActive' : tone === 'error' ? 'phaseFailed' : tone === 'ongoing' ? 'phaseOngoing' : 'phaseIdle'
        const editable = row.layer === 'profile' && (row.unreadable === null || row.unreadable === undefined)
        const config = {
          id: row.id,
          name: row.module,
          config: {
            transport: row.transport,
            serverName: row.serverName,
            ...row.transport === 'stdio'
              ? { command: row.command, args: row.args, env: row.env, ...row.cwd ? { cwd: row.cwd } : {} }
              : { url: row.url, headers: row.headers },
            failOnStartupError: row.failOnStartupError,
          },
        }
        return h('div', { className: 'smw-card' },
          h('div', { className: 'smw-cardTop' },
            h('div', { className: 'smw-cardMain' },
              h('code', { className: 'smw-name' }, row.serverName ?? row.id),
              h(Tag, { tone }, h('span', { className: 'smw-dot' }), t(phaseKey)),
              h(Tag, null, row.transport === 'stdio' ? t('transportStdio') : t('transportHttp')),
              h(Tag, null, fill(t('toolCount'), { count: row.toolCount })),
              h(Tag, null, row.layer === 'home' ? t('layerHome') : t('layerProfile')),
            ),
            h('div', { className: 'smw-toolbar' },
              h('span', { className: 'smw-check' }, t('enabled')),
              h(Switch, {
                checked: row.enabled === true,
                disabled: busy,
                label: t('enabled'),
                onChange: onToggle,
              }),
              h(Button, { variant: 'quiet', disabled: busy || !editable, onClick: onEdit }, t('editServer')),
              h(Button, {
                variant: 'quiet',
                disabled: busy,
                onClick: () => {
                  const text = JSON.stringify(config, null, 2)
                  const done = () => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }
                  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done)
                  else done()
                },
              }, copied ? t('copied') : t('copyConfig')),
              h(Button, { variant: 'quiet', disabled: busy || !editable, onClick: onRemove }, t('removeServer')),
            ),
          ),
          h('p', { className: 'smw-desc' }, row.transport === 'stdio' ? [row.command, ...row.args].join(' ') : row.url ?? ''),
          h('p', { className: 'smw-path' }, `${row.module} · ${row.id}`),
          row.tools.length > 0 ? h('p', { className: 'smw-path' }, `${t('tools')}: ${row.tools.join(', ')}`) : null,
          !editable ? h('p', { className: 'smw-note' }, fill(t('readOnly'), { layer: row.layer === 'home' ? t('layerHome') : t('layerProfile') })) : null,
        )
      }

      /** The add/edit form. */
      function ServerForm({ busy, draft, onSubmit, onCancel }) {
        const [server, setServer] = React.useState(draft.server)
        const patch = (next) => setServer((current) => ({ ...current, ...next }))
        const stdio = server.transport === 'stdio'
        return h('form', {
          className: 'smw-form',
          onSubmit: (event) => {
            event.preventDefault()
            return onSubmit(server)
          },
        },
          h('div', { className: 'smw-row' },
            h(Field, {
              label: t('serverName'),
              hint: t('serverNameHint'),
              value: server.serverName,
              onChange: (value) => patch({ serverName: value }),
              mono: true,
            }),
            h('div', { className: 'smw-field' },
              h('span', { className: 'smw-label' }, t('transport')),
              h('select', {
                className: 'smw-select',
                value: stdio ? 'stdio' : 'streamable-http',
                onChange: (event) => patch({ transport: event.target.value }),
              },
                h('option', { value: 'streamable-http' }, t('transportHttp')),
                h('option', { value: 'stdio' }, t('transportStdio')),
              ),
            ),
          ),
          stdio
            ? h(React.Fragment, null,
                h(Field, { label: t('command'), value: server.command, onChange: (value) => patch({ command: value }), mono: true }),
                h(TextArea, { label: t('args'), hint: t('argsHint'), value: server.args, onChange: (value) => patch({ args: value }) }),
                h(TextArea, { label: t('env'), hint: t('envHint'), value: server.env, onChange: (value) => patch({ env: value }) }),
                h(Field, { label: `${t('cwd')} (${t('optional')})`, value: server.cwd, onChange: (value) => patch({ cwd: value }), mono: true }),
              )
            : h(React.Fragment, null,
                h(Field, { label: t('url'), value: server.url, onChange: (value) => patch({ url: value }), mono: true }),
                h(TextArea, { label: `${t('headers')} (${t('optional')})`, hint: t('headersHint'), value: server.headers, onChange: (value) => patch({ headers: value }) }),
              ),
          h('label', { className: 'smw-check' },
            h('input', {
              type: 'checkbox',
              checked: server.failOnStartupError === true,
              onChange: (event) => patch({ failOnStartupError: event.target.checked }),
            }),
            t('failOnStartup'),
          ),
          h('div', { className: 'smw-actions' },
            h(Button, { variant: 'primary', disabled: busy }, t('save')),
            h(Button, { variant: 'quiet', onClick: onCancel }, t('cancel')),
          ),
        )
      }

      return { WorkbenchPage }
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.pluginManager', 'sessions'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-mcp-workbench: dictionaries')
        const t = ctx.locale.bind(NS)
        const { WorkbenchPage } = createFace(ctx, t)
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-plugin-css', NS)
          style.textContent = STYLES
          document.head.appendChild(style)
          return () => style.remove()
        }, 'skill-mcp-workbench: styles')
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({}),
        }, WorkbenchPage))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 10,
          locale: NS,
          label: () => t('panel'),
        }, PanelIcon))
      },
    }
  },
})
