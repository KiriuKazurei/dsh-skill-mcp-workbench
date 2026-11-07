// The workbench's own small state file: extra skill roots the user adds on the
// machine. It lives beside the Harness home so a user can edit it by hand, and it
// is read on every request so an external edit is picked up without a restart.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isAbsolute, resolve } from 'node:path'

/** File name inside the Harness home. */
const FILE_NAME = 'skill-mcp-workbench.json'

/** Roots kept in the file. */
const MAX_ROOTS = 32

/**
 * Read the extra skill roots.
 * @param home - Harness home directory.
 * @returns absolute root paths.
 */
export async function readExtraRoots(home) {
  const path = join(home, FILE_NAME)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const roots = Array.isArray(parsed?.extraSkillRoots) ? parsed.extraSkillRoots : []
  return roots.filter((root) => typeof root === 'string' && root !== '').map((root) => resolve(root)).slice(0, MAX_ROOTS)
}

/**
 * Write the extra skill roots.
 * @param home - Harness home directory.
 * @param roots - absolute root paths.
 */
export async function writeExtraRoots(home, roots) {
  const path = join(home, FILE_NAME)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({ version: 1, extraSkillRoots: roots.map((root) => resolve(root)) }, null, 2)}\n`, 'utf8')
  return path
}

/**
 * Add one root, ignoring a duplicate.
 * @param home - Harness home directory.
 * @param root - absolute directory path.
 */
export async function addExtraRoot(home, root) {
  const target = String(root ?? '').trim()
  if (target === '') throw new Error('a directory path is required')
  if (!isAbsolute(target)) throw new Error('the skill root must be an absolute path')
  const roots = await readExtraRoots(home)
  const resolved = resolve(target)
  if (roots.some((entry) => entry.toLowerCase() === resolved.toLowerCase())) return { roots, added: false, path: resolved }
  if (roots.length >= MAX_ROOTS) throw new Error(`at most ${MAX_ROOTS} extra skill roots are kept`)
  const next = [...roots, resolved]
  await writeExtraRoots(home, next)
  return { roots: next, added: true, path: resolved }
}

/**
 * Remove one root.
 * @param home - Harness home directory.
 * @param root - absolute directory path.
 */
export async function removeExtraRoot(home, root) {
  const target = resolve(String(root ?? '').trim())
  const roots = await readExtraRoots(home)
  const next = roots.filter((entry) => entry.toLowerCase() !== target.toLowerCase())
  await writeExtraRoots(home, next)
  return { roots: next, removed: roots.length !== next.length }
}
