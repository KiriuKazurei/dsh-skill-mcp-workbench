// Display-resource checks the installation reference requires: the icon is a valid
// image of its declared format inside the size limit, and the locale files carry
// the metadata Plugin Manager and Settings read.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('the icon is a valid SVG inside the size limit', async () => {
  const path = join(root, 'icon.svg')
  const text = await readFile(path, 'utf8')
  const info = await stat(path)
  assert.ok(info.size > 0, 'the icon is not empty')
  assert.ok(info.size <= 256 * 1024, `the icon is ${info.size} bytes, within 256 KiB`)
  assert.ok(/^<svg[\s>]/.test(text.trim()), 'the icon starts with an svg element')
  assert.ok(text.includes('xmlns="http://www.w3.org/2000/svg"'), 'the icon declares the SVG namespace')
  assert.ok(text.includes('viewBox="0 0 48 48"'), 'the icon declares a viewBox')
  assert.ok(/<\/svg>\s*$/.test(text.trim()), 'the icon closes its root element')
  // No external references: an icon must stay inside the package.
  assert.ok(!/href\s*=\s*"https?:/i.test(text), 'the icon references no external URL')
  assert.ok(!/<script/i.test(text), 'the icon carries no script')
})

test('the locale files carry the display metadata', async () => {
  for (const locale of ['en', 'zh']) {
    const path = join(root, 'locale', `${locale}.json`)
    const text = await readFile(path, 'utf8')
    const parsed = JSON.parse(text)
    assert.ok(parsed.meta, `${locale} carries a meta block`)
    assert.equal(typeof parsed.meta.title, 'string', `${locale} has a title`)
    assert.ok(parsed.meta.title.length > 0, `${locale} title is not empty`)
    assert.equal(typeof parsed.meta.description, 'string', `${locale} has a description`)
    assert.ok(parsed.meta.description.length > 0, `${locale} description is not empty`)
    // The title must describe this plugin, not a template.
    assert.ok(!/my-plugin|my-decoration/i.test(parsed.meta.title + parsed.meta.description), `${locale} carries no template copy`)
  }
})

test('the manifest exports the display resources', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.ok(manifest.exports['./locale/*.json'], 'the locale glob is exported')
  assert.ok(manifest.exports['./icon'], 'the icon is exported')
  assert.ok(manifest.files.includes('icon.svg'), 'the icon is in files')
  assert.ok(manifest.files.includes('locale/*.json'), 'the locales are in files')
  assert.ok(manifest.files.includes('README.md'), 'the README is in files')
  assert.ok(manifest.files.includes('LICENSE'), 'the license is in files')
  // Every runtime module the Host and browser halves import must be listed.
  for (const module of ['index.js', 'client.js', 'cordis.patch.yml', 'lib/host/*.js']) {
    assert.ok(manifest.files.includes(module), `${module} is in files`)
  }
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.exports['./client'], 'the client half is exported')
})
