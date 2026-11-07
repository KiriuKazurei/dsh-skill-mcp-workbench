// Skill operations for the workbench: the global skill catalog, every skill folder
// this machine exposes, and the writes that import or create a skill.
//
// Reads go through the Harness's own registry (`ctx.skills`) so the page shows
// exactly what an agent would see, including bundled and runtime skills. Writes
// target the user skill root `$DSH_HOME/skills`, which `dsh-skill-filesystem`
// discovers, so an imported skill reaches the next model step without a restart.
//
// Project-scoped skills are deliberately not modelled here: the workbench is a
// global skill surface, and a project's own skills live in that project's
// `.dsh/skills` directory, which the project owns.

import { readdir, readFile, stat, mkdir, cp, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { parseBlock, stringifyBlock } from './yamlrow.js'
import { readZip } from './zip.js'

/** The skill-name grammar the registry enforces. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Directory names that never hold skills. */
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.hg', '.svn', '$RECYCLE.BIN', 'System Volume Information'])

/** Archive members that carry no skill content. */
const SKIP_ENTRIES = ['__MACOSX/', '.DS_Store', 'Thumbs.db', 'desktop.ini']

/** Entries read per root before the scan stops. */
const MAX_ENTRIES = 400

/** Body bytes returned to the page. */
const MAX_BODY_BYTES = 128 * 1024

/** Expanded bytes accepted from one archive. */
const MAX_IMPORT_BYTES = 32 * 1024 * 1024

/** Discovery sources that belong to a project rather than to the global catalog. */
const PROJECT_SOURCES = new Set(['project-dsh', 'project-agents'])

/** The user skill root this plugin writes into. */
export function userSkillRoot(dshHome) {
  return join(dshHome, 'skills')
}

/** Roots this plugin scans beyond the Harness's own catalog. */
export function externalRoots(env = process.env, home = homedir()) {
  const roots = []
  const add = (path, label) => {
    if (typeof path === 'string' && path.trim() !== '') roots.push({ path: resolve(path), label })
  }
  add(join(env.DSH_HOME ?? join(home, '.dsh'), 'skills'), 'user-dsh')
  add(join(env.DSH_AGENTS_HOME ?? join(home, '.agents'), 'skills'), 'user-agents')
  add(join(home, '.claude', 'skills'), 'claude-code')
  add(join(home, '.codex', 'skills'), 'codex')
  add(join(home, '.cursor', 'skills'), 'cursor')
  add(join(home, '.gemini', 'skills'), 'gemini')
  add(join(home, '.config', 'dsh', 'skills'), 'config-dsh')
  if (env.DSH_BUNDLED_SKILL_DIR) add(env.DSH_BUNDLED_SKILL_DIR, 'bundled')
  return roots
}

/**
 * The global Harness catalog, grouped by discovery source.
 *
 * Project-scoped sources are dropped: this page is the global surface, and a
 * project's own skills are that project's business.
 *
 * @param deps - injected services.
 * @param scope - optional Agent whose preset layers contribute their skills.
 */
export async function listCatalog(deps, scope) {
  const skills = deps.skills ? await deps.skills.list({ scope }) : []
  const groups = new Map()
  for (const skill of skills) {
    if (PROJECT_SOURCES.has(skill.source)) continue
    const key = typeof skill.source === 'string' ? skill.source : 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(summaryOf(skill))
  }
  return {
    groups: [...groups.entries()].map(([source, items]) => ({ source, skills: items })),
    total: skills.filter((skill) => !PROJECT_SOURCES.has(skill.source)).length,
  }
}

/** One catalog entry as the page shows it. */
function summaryOf(skill) {
  return {
    name: skill.name,
    description: skill.description,
    ...skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {},
    invocation: skill.invocation ?? { modelInvocable: true, userInvocable: true },
    source: skill.source,
    provider: skill.provider,
    rank: skill.rank,
    ...skill.path !== undefined ? { path: skill.path } : {},
    ...skill.resourceBase?.kind === 'directory' ? { directory: skill.resourceBase.path } : {},
  }
}

/**
 * Read one skill body through the registry.
 * @param deps - injected services.
 * @param name - kebab-case skill name.
 * @param scope - optional Agent whose preset layers own the skill.
 */
export async function readSkill(deps, name, scope) {
  if (!deps.skills || !SKILL_NAME.test(String(name))) return null
  const definition = await deps.skills.get(String(name), { scope })
  if (definition === undefined) return null
  const content = typeof definition.content === 'string' ? definition.content : ''
  return {
    name: definition.name,
    description: definition.description,
    ...definition.whenToUse !== undefined ? { whenToUse: definition.whenToUse } : {},
    invocation: definition.invocation,
    source: definition.source,
    provider: definition.provider,
    ...definition.path !== undefined ? { path: definition.path } : {},
    ...definition.resourceBase?.kind === 'directory' ? { directory: definition.resourceBase.path } : {},
    content: content.length > MAX_BODY_BYTES ? content.slice(0, MAX_BODY_BYTES) : content,
    truncated: content.length > MAX_BODY_BYTES,
  }
}

/** Read one file's frontmatter and body split. */
async function readSkillFile(path) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return null
  }
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end < 0) return null
  const block = text.slice(text.indexOf('\n') + 1, end)
  const body = text.slice(text.indexOf('\n', end + 1) + 1)
  let data = null
  try {
    data = parseBlock(block)
  } catch {
    return { invalid: true }
  }
  if (data === null || typeof data !== 'object') return { invalid: true }
  return { data, body }
}

/** Frontmatter fields this workbench understands. */
function frontmatterOf(data) {
  const name = typeof data.name === 'string' ? data.name : null
  const description = typeof data.description === 'string' ? data.description : null
  const whenToUse = typeof data.whenToUse === 'string' ? data.whenToUse : null
  const disableModel = data['disable-model-invocation'] === true
  const userInvocable = data['user-invocable'] !== false
  return { name, description, whenToUse, disableModel, userInvocable }
}

/** Whether a directory entry is a skill bundle. */
async function bundleOf(root, entry) {
  const file = join(root, entry, 'SKILL.md')
  try {
    const info = await stat(file)
    if (!info.isFile()) return null
  } catch {
    return null
  }
  const parsed = await readSkillFile(file)
  if (parsed === null || parsed.invalid) return null
  const fields = frontmatterOf(parsed.data)
  if (fields.name === null || fields.description === null) return null
  return {
    name: fields.name,
    description: fields.description,
    ...fields.whenToUse !== null ? { whenToUse: fields.whenToUse } : {},
    invocation: { modelInvocable: !fields.disableModel, userInvocable: fields.userInvocable },
    path: file,
    directory: join(root, entry),
    kind: 'bundle',
  }
}

/** Whether a flat file is a skill. */
async function flatOf(root, entry) {
  if (!entry.endsWith('.md') || entry === 'SKILL.md') return null
  const file = join(root, entry)
  const parsed = await readSkillFile(file)
  if (parsed === null || parsed.invalid) return null
  const fields = frontmatterOf(parsed.data)
  if (fields.name === null || fields.description === null) return null
  return {
    name: fields.name,
    description: fields.description,
    ...fields.whenToUse !== null ? { whenToUse: fields.whenToUse } : {},
    invocation: { modelInvocable: !fields.disableModel, userInvocable: fields.userInvocable },
    path: file,
    directory: root,
    kind: 'flat',
  }
}

/**
 * Scan one directory for skills, in the same shapes the provider discovers.
 * @param root - absolute directory to scan.
 * @returns the skills found, plus whether the root exists.
 */
export async function scanRoot(root) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return { exists: false, skills: [] }
    return { exists: true, skills: [], error: error instanceof Error ? error.message : String(error) }
  }
  const skills = []
  let scanned = 0
  for (const entry of entries) {
    if (scanned >= MAX_ENTRIES) break
    if (SKIP_DIRECTORIES.has(entry.name)) continue
    scanned += 1
    if (entry.isDirectory()) {
      const found = await bundleOf(root, entry.name)
      if (found !== null) skills.push(found)
      continue
    }
    if (entry.isFile()) {
      const found = await flatOf(root, entry.name)
      if (found !== null) skills.push(found)
    }
  }
  skills.sort((left, right) => left.name.localeCompare(right.name))
  return { exists: true, skills }
}

/**
 * Scan every root this machine exposes outside the Harness catalog.
 * @param extra - additional absolute roots from the plugin's configuration.
 * @returns one entry per root with the skills it holds.
 */
export async function scanExternalRoots(extra = []) {
  const seen = new Set()
  const roots = []
  for (const root of [...externalRoots(), ...extra.map((path) => ({ path, label: 'custom' }))]) {
    const key = root.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    roots.push(root)
  }
  const result = []
  for (const root of roots) {
    const scanned = await scanRoot(root.path)
    result.push({
      path: root.path,
      label: root.label,
      exists: scanned.exists,
      ...scanned.error !== undefined ? { error: scanned.error } : {},
      skills: scanned.skills.map((skill) => ({ ...skill, root: root.path, rootLabel: root.label })),
    })
  }
  return result
}

/** Copy a directory tree with a bounded depth. */
async function copyTree(from, to, depth = 0) {
  if (depth > 6) return
  await mkdir(to, { recursive: true })
  const entries = await readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      await copyTree(source, target, depth + 1)
      continue
    }
    if (entry.isFile()) await cp(source, target, { force: true })
  }
}

/** Whether an archive member is safe to write. */
function isSafeMember(name) {
  if (name === '' || name.endsWith('/')) return false
  if (SKIP_ENTRIES.some((prefix) => name.startsWith(prefix) || basename(name) === prefix)) return false
  if (isAbsolute(name) || /^[A-Za-z]:/.test(name)) return false
  const segments = name.split('/')
  return !segments.some((segment) => segment === '..' || segment === '')
}

/** Decode a base64 payload from the browser. */
function decodeBase64(data) {
  if (typeof data !== 'string' || data === '') throw new Error('a file payload is required')
  const comma = data.indexOf(',')
  // Accept both a bare base64 string and a data URL, which is what a browser
  // FileReader hands back.
  const payload = comma >= 0 && data.slice(0, comma).includes('base64') ? data.slice(comma + 1) : data
  return Buffer.from(payload, 'base64')
}

/** Whether an archive member is a skill instruction file. */
function isInstruction(name) {
  return name === 'SKILL.md' || name.endsWith('/SKILL.md')
}

/** Parse a skill file's frontmatter and body, or report why it cannot. */
function parseSkillText(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end < 0) return null
  const block = text.slice(text.indexOf('\n') + 1, end)
  try {
    const data = parseBlock(block)
    if (data === null || typeof data !== 'object') return null
    return { data, body: text.slice(text.indexOf('\n', end + 1) + 1) }
  } catch {
    return null
  }
}

/** Write one archive member under a root, refusing anything that escapes it. */
async function writeMember(root, name, data) {
  const target = resolve(join(root, name))
  if (target !== resolve(root) && !target.toLowerCase().startsWith(resolve(root).toLowerCase() + sep)) {
    throw new Error(`archive member "${name}" escapes the skill root`)
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, data)
}

/**
 * Import a skill from a `.md` file or a `.zip` bundle into the user skill root.
 *
 * A `.md` file becomes a flat skill named after its frontmatter. A `.zip` becomes a
 * bundle: an archive of the shape `<name>/SKILL.md` keeps that directory, because
 * it *is* the skill's name; an archive holding `SKILL.md` at its top level takes its
 * name from the frontmatter and is written under `<root>/<name>/`. Either way the
 * resources beside the instruction file come with it. An existing skill of the same
 * name is replaced.
 *
 * @param dshHome - the Harness home, whose `skills` directory is the target root.
 * @param input - `{ fileName, data }` with `data` as base64 or a data URL.
 * @returns what was written.
 */
export async function importSkill(dshHome, input) {
  const fileName = String(input?.fileName ?? '').trim()
  if (fileName === '') throw new Error('a file name is required')
  const root = userSkillRoot(dshHome)
  await mkdir(root, { recursive: true })
  const bytes = decodeBase64(input?.data)

  if (/\.zip$/i.test(fileName)) {
    const members = readZip(bytes).filter((entry) => isSafeMember(entry.name))
    if (members.length === 0) throw new Error('the archive holds no files')
    const instruction = members.find((entry) => isInstruction(entry.name))
    const flat = members.find((entry) => /\.md$/i.test(entry.name) && !isInstruction(entry.name))

    if (instruction !== undefined) {
      // `<name>/SKILL.md` already carries the skill's directory, so its members are
      // written as they are; a top-level `SKILL.md` takes the skill's name from the
      // frontmatter and every member is written under that name. `dirname` answers
      // '.' for a bare file name, which is the same top-level case.
      const inner = dirname(instruction.name)
      const atTop = inner === '' || inner === '.'
      let prefix = ''
      if (atTop) {
        const parsed = parseSkillText(instruction.data.toString('utf8'))
        const fields = parsed === null ? null : frontmatterOf(parsed.data)
        if (fields === null || fields.name === null || !SKILL_NAME.test(fields.name)) {
          throw new Error('the archive’s SKILL.md needs a kebab-case "name" in its frontmatter')
        }
        prefix = fields.name
      }
      const writtenInstruction = prefix === '' ? instruction.name : `${prefix}/SKILL.md`
      let total = 0
      const written = []
      for (const member of members) {
        total += member.data.length
        if (total > MAX_IMPORT_BYTES) throw new Error('the archive expands beyond the size limit')
        const relative = prefix === '' ? member.name : `${prefix}/${member.name}`
        await writeMember(root, relative, member.data)
        written.push(relative.split(sep).join('/'))
      }
      const parsed = await readSkillFile(join(root, writtenInstruction))
      const fields = parsed !== null && !parsed.invalid ? frontmatterOf(parsed.data) : null
      return {
        root,
        name: fields?.name ?? null,
        description: fields?.description ?? null,
        kind: 'bundle',
        path: join(root, writtenInstruction),
        directory: dirname(join(root, writtenInstruction)),
        written,
      }
    }

    if (flat === undefined) throw new Error('the archive holds no SKILL.md and no .md skill file')
    const text = flat.data.toString('utf8')
    const parsed = parseSkillText(text)
    if (parsed === null) throw new Error('the archive’s .md file has no readable YAML frontmatter')
    const fields = frontmatterOf(parsed.data)
    if (fields.name === null || !SKILL_NAME.test(fields.name)) {
      throw new Error('the archive’s .md file needs a kebab-case "name" in its frontmatter')
    }
    if (fields.description === null || fields.description === '') {
      throw new Error('the archive’s .md file needs a "description" in its frontmatter')
    }
    const target = join(root, `${fields.name}.md`)
    await writeFile(target, text, 'utf8')
    return {
      root,
      name: fields.name,
      description: fields.description,
      kind: 'flat',
      path: target,
      written: [`${fields.name}.md`],
    }
  }

  if (!/\.md$/i.test(fileName)) throw new Error('only .md and .zip files can be imported')
  const text = bytes.toString('utf8')
  const parsed = parseSkillText(text)
  if (parsed === null) throw new Error('the file has no readable YAML frontmatter')
  const fields = frontmatterOf(parsed.data)
  if (fields.name === null || !SKILL_NAME.test(fields.name)) {
    throw new Error('the frontmatter needs a kebab-case "name"')
  }
  if (fields.description === null || fields.description === '') {
    throw new Error('the frontmatter needs a "description"')
  }
  const target = join(root, `${fields.name}.md`)
  await writeFile(target, text, 'utf8')
  return {
    root,
    name: fields.name,
    description: fields.description,
    kind: 'flat',
    path: target,
    written: [`${fields.name}.md`],
  }
}

/**
 * Create a new skill bundle in the user skill root.
 * @param dshHome - the Harness home, whose `skills` directory is the target root.
 * @param input - `{ name, description, whenToUse?, body? }`.
 * @returns what was written.
 */
export async function createSkill(dshHome, input) {
  const name = String(input?.name ?? '').trim()
  if (!SKILL_NAME.test(name)) throw new Error('a skill name must be kebab-case: lowercase words joined by hyphens')
  const description = String(input?.description ?? '').trim()
  if (description === '') throw new Error('a description is required')
  const whenToUse = String(input?.whenToUse ?? '').trim()
  const body = typeof input?.body === 'string' && input.body.trim() !== '' ? input.body : `# ${name}\n\nDescribe what this skill does.\n`

  const frontmatter = {
    name,
    description,
    ...whenToUse !== '' ? { whenToUse } : {},
  }
  const text = `---\n${stringifyBlock(frontmatter, 0)}\n---\n\n${body.replace(/\s*$/, '')}\n`

  const root = userSkillRoot(dshHome)
  const directory = join(root, name)
  await mkdir(directory, { recursive: true })
  const target = join(directory, 'SKILL.md')
  await writeFile(target, text, 'utf8')
  return { root, name, description, kind: 'bundle', path: target, directory, written: [`${name}/SKILL.md`] }
}
