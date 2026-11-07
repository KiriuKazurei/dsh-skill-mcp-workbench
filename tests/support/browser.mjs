// Resolve React, ReactDOM, and jsdom for the page-level tests.
//
// The plugin declares no runtime dependencies, so the browser tier borrows them
// from a sibling plugin's development dependencies. The standalone source can sit
// anywhere — inside a workspace, in an addon collection, or unpacked from the
// release zip — so several candidate locations are tried in order and the first
// one that resolves wins. When none does, the importing test skips itself.
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** Ancestor directories a standalone checkout might sit under. */
const ancestors = [
  here,                        // <collection>/<plugin>/tests/support
  join(here, '..', '..'),      // <collection>/<plugin>
  join(here, '..', '..', '..'),// <collection>
  join(here, '..', '..', '..', '..'),
]

/** Every place a sibling plugin's node_modules might live. */
const candidates = [join(here, '..', '..', 'node_modules')]
if (process.env.DSH_WORKBENCH_TEST_NODE_MODULES) candidates.push(process.env.DSH_WORKBENCH_TEST_NODE_MODULES)
for (const ancestor of ancestors) {
  candidates.push(join(ancestor, 'dsh-skills-mcp-console', 'node_modules'))
  candidates.push(join(ancestor, 'plugins', 'dsh-skills-mcp-console', 'node_modules'))
}

let React
let ReactDOM
let JSDOM

for (const candidate of candidates) {
  // `react` is the package the whole tier needs; if it is not there, move on.
  if (!existsSync(join(candidate, 'react'))) continue
  try {
    const require = createRequire(join(candidate, 'package.json'))
    React = require('react')
    ReactDOM = require('react-dom/client')
    JSDOM = require('jsdom').JSDOM
    break
  } catch {
    // A broken candidate is not fatal; the next one may resolve.
  }
}

export { React, ReactDOM, JSDOM }
