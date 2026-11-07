// Reproduce the exact lossless-JSON failure the live tool reported, by feeding
// the real registry shape through the real API table. The Host walker rejects
// any `undefined` inside a record, so every optional field must be either a
// plain value or absent — never `undefined`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApi, resolvePaths } from '../lib/host/api.js'

const paths = resolvePaths()

/** The Host's own lossless-JSON walker, restated so a failure names the field. */
function firstLosslessViolation(value, path = 'value') {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Object.is(value, -0) ? null : `${path} is ${value}`
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstLosslessViolation(value[index], `${path}[${index}]`)
      if (found !== null) return found
    }
    return null
  }
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) return `${path} is not a plain record`
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return `${path} has a non-string key ${String(key)}`
      const child = value[key]
      if (child === undefined) return `${path}.${key} is undefined`
      const found = firstLosslessViolation(child, `${path}.${key}`)
      if (found !== null) return found
    }
    return null
  }
  return `${path} is a ${typeof value}`
}

/** A registry that returns the awkward shapes the real one can, including a
 * `whenToUse: undefined` hole and a missing `path`. */
function awkwardSkills() {
  return {
    async list() {
      return [
        {
          name: 'with-hole',
          description: 'Carries whenToUse as an explicit undefined.',
          whenToUse: undefined,
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'user-dsh',
          provider: 'filesystem',
          rank: 400,
          path: 'C:/skills/with-hole/SKILL.md',
        },
        {
          name: 'no-path',
          description: 'Has no instruction-file path.',
          invocation: { modelInvocable: false, userInvocable: false },
          source: 'runtime',
          provider: 'runtime',
          rank: 0,
        },
      ]
    },
    async get(name) {
      if (name !== 'with-hole') return undefined
      return {
        name: 'with-hole',
        description: 'Carries whenToUse as an explicit undefined.',
        whenToUse: undefined,
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'user-dsh',
        provider: 'filesystem',
        path: 'C:/skills/with-hole/SKILL.md',
        content: '# Body',
      }
    },
  }
}

test('the catalog drops undefined holes the real registry can return', async () => {
  const api = createApi({
    skills: awkwardSkills(),
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    defaultDirectory: 'D:/proj',
    readExtraRoots: async () => [],
  })
  const catalog = await api.invoke('skills.catalog', {})
  const violation = firstLosslessViolation(catalog)
  assert.equal(violation, null, `the catalog is lossless (offender: ${violation})`)
})

test('the skill body drops undefined holes too', async () => {
  const api = createApi({
    skills: awkwardSkills(),
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    defaultDirectory: 'D:/proj',
    readExtraRoots: async () => [],
  })
  const skill = await api.invoke('skills.read', { name: 'with-hole' })
  assert.equal(firstLosslessViolation(skill), null, 'the body is lossless')
  assert.equal(skill.name, 'with-hole')
  assert.ok(!('whenToUse' in skill), 'an absent optional stays absent')
})

test('a missing skill reports the name it searched', async () => {
  const api = createApi({
    skills: awkwardSkills(),
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    defaultDirectory: 'D:/proj',
    readExtraRoots: async () => [],
  })
  await assert.rejects(
    () => api.invoke('skills.read', { name: 'absent' }),
    /skill "absent" was not found/,
  )
})

test('the machine-root scan stays lossless with real roots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'smw-lossless-'))
  await writeFile(join(dir, 'loose.md'), '---\nname: loose\ndescription: A flat skill.\n---\n\nBody.\n', 'utf8')
  const api = createApi({
    skills: awkwardSkills(),
    profilePatch: paths.profilePatch,
    home: paths.home,
    homeDir: paths.dshHome,
    defaultDirectory: 'D:/proj',
    readExtraRoots: async () => [dir],
  })
  const roots = await api.invoke('skills.roots')
  assert.equal(firstLosslessViolation(roots), null, 'the root scan is lossless')
  const custom = roots.roots.find((root) => root.label === 'custom')
  assert.ok(custom, 'the extra root is scanned')
  assert.deepEqual(custom.skills.map((skill) => skill.name), ['loose'])
  await rm(dir, { recursive: true, force: true })
})
