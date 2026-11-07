# DSH Skill & MCP Workbench

[简体中文](README.zh-CN.md)

A sidebar plugin for **DeepSeek Harness (DSH) Web**. The **Skill & MCP** panel brings global skill discovery, skill imports, and MCP server management into one place. The plugin targets DSH **0.2.1-rc.5**.

## Features

- **Skills** lists entries from the Harness registry, the current session catalog, and local skill folders such as those used by Codex, Claude Code, Cursor, and Gemini. You can add folders to scan. Project-scoped skills stay outside this global panel.
- **Import / Create** imports Markdown or ZIP skill bundles and creates new `SKILL.md` bundles in `$DSH_HOME/skills`. Importing or creating a skill can overwrite files with the same name. Use skill files from sources you trust.
- **MCP** displays server state and published tools. Add, edit, enable, disable, or remove profile-owned Streamable HTTP and stdio servers. Rows owned by the home patch or a bundle are displayed as read-only.
- The read-only agent tool `skill_mcp_manage` can list and read skills and report MCP status and tool names. The Web panel uses the authenticated `/api/skill-mcp-workbench` route for configuration.

MCP headers and environment values are stored as plain text in the profile's `cordis.patch.yml`. Keep the profile file private.

## Install

1. Clone this repository or download and extract the source archive. Use the directory containing `package.json` and `cordis.patch.yml`.
2. In the target DSH profile, call the `plugin_manager` tool with `action=install_bundle` and `target` set to the absolute path of that directory.
3. Open DSH Web and select **Skill & MCP** in the sidebar. Keep the bundle directory in place. Restart DSH after replacing an installed copy to load the new JavaScript modules.

The plugin ships plain JavaScript and has no build step or runtime package dependencies.

## Development

Run `npm test` from the repository root with Node.js 24. The suite covers the host API, patch round-trips, skill imports, the agent tool contract, and browser rendering. Browser tests use React, ReactDOM, and jsdom from local `node_modules` or the directory specified by `DSH_WORKBENCH_TEST_NODE_MODULES`. The browser cases skip when those dependencies are unavailable. Set `DSH_PROFILE_PATCH` to test against your own profile patch. Mutation cases write to a temporary copy.

## License

[MIT](LICENSE)
