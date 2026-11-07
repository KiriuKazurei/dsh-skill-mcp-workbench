# DSH Skill & MCP 工作台

[English](README.md)

这是 **DeepSeek Harness（DSH）Web** 的侧边栏插件。通过 **Skill & MCP** 面板，可以浏览全局 Skill、导入 Skill 和管理 MCP 服务器。插件面向 DSH **0.2.1-rc.5**。

## 功能

- **Skills** 汇总 Harness 注册表、当前会话目录以及 Codex、Claude Code、Cursor、Gemini 等工具的本机 Skill 目录。你也可以添加扫描目录。项目级 Skill 不在这个全局面板中显示。
- **导入 / 新建** 支持导入 Markdown 或 ZIP Skill 包，也可以在 `$DSH_HOME/skills` 新建 `SKILL.md`。导入和新建可能覆盖同名文件，请使用来自可信来源的 Skill。
- **MCP** 显示服务器连接状态和已发布的工具。支持新增、编辑、启停和移除当前 profile 中的 Streamable HTTP 或 stdio 服务器。由全局补丁或 bundle 管理的条目以只读方式显示。
- 只读 agent 工具 `skill_mcp_manage` 可列出和读取 Skill，并查看 MCP 状态及工具名称。Web 面板通过需要认证的 `/api/skill-mcp-workbench` 接口管理配置。

MCP 请求头和环境变量的值以明文存放在 profile 的 `cordis.patch.yml` 中，请妥善保管该文件。

## 安装

1. 克隆仓库或下载并解压源码包，找到包含 `package.json` 和 `cordis.patch.yml` 的目录。
2. 在目标 DSH profile 中调用 `plugin_manager` 工具，将 `action` 设为 `install_bundle`，将 `target` 设为该目录的绝对路径。
3. 打开 DSH Web，在侧边栏选择 **Skill & MCP**。请保留安装目录。替换已安装的版本后，重启 DSH 以加载新的 JavaScript 模块。

插件使用原生 JavaScript，无需构建，也没有运行时 npm 依赖。

## 开发

使用 Node.js 24，在仓库根目录运行 `npm test`。现有测试覆盖宿主接口、补丁读写、Skill 导入、agent 工具契约和浏览器渲染。浏览器测试从本地 `node_modules` 或 `DSH_WORKBENCH_TEST_NODE_MODULES` 指定的目录加载 React、ReactDOM 和 jsdom。缺少这些依赖时会跳过浏览器用例。设置 `DSH_PROFILE_PATCH` 可用自己的 profile 补丁做验证，写入测试使用临时副本。

## 许可证

[MIT](LICENSE)
