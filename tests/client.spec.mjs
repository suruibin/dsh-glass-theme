import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const clientJs = readFileSync(join(here, '../lib/client.js'), 'utf8')
const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'))
const patch = readFileSync(join(here, '../cordis.patch.yml'), 'utf8')

test('bundle parses as a plain function body', () => {
  // The file must be `window.__ModuleLoader__.load({...})`; `new Function`
  // only checks syntax, so strip the window. assignment for a bare parse.
  const body = clientJs.replace(/^window\.__ModuleLoader__\.load\(/, '(')
  assert.doesNotThrow(() => new Function(body), 'client.js must be syntactically valid')
})

test('bundle id matches the package name', () => {
  assert.match(clientJs, /id:\s*['"]dsh-glass-theme['"]/)
})

test('plugin registers the settings.section slot', () => {
  assert.match(clientJs, /slots\.inject\(['"]settings\.section['"]/)
  assert.match(clientJs, /name:\s*['"]settings\.section['"]/)
  assert.match(clientJs, /id:\s*['"]dsh-glass-theme['"]/)
})

test('package.json declares client inject modules', () => {
  const inject = pkg.dsh?.client?.inject
  assert.ok(Array.isArray(inject) && inject.length > 0, 'dsh.client.inject must be a non-empty array')
  for (const m of inject) assert.match(m, /^@deepseek-ai\/dsh-client-/)
  assert.equal(pkg.dsh.client.platform, 'web')
})

test('package.json ships only lib, patch, and docs', () => {
  const files = pkg.files
  assert.ok(Array.isArray(files) && files.length > 0, 'files whitelist must exist')
  assert.ok(files.includes('lib') && files.includes('cordis.patch.yml'))
  assert.ok(!files.includes('tests'), 'tests must not ship in the published package')
  assert.ok(!files.includes('docs'), 'docs must not ship in the published package')
})

test('cordis patch inserts the bundle id', () => {
  assert.match(patch, /id:\s*dsh-glass/)
  assert.match(patch, /name:\s*['"]?dsh-glass-theme['"]?/)
})

test('persisted keys are consistent across client and bundle', () => {
  assert.match(clientJs, /dsh-glass\.alpha/)
  assert.match(clientJs, /dsh-glass\.cursorFx/)
  assert.match(clientJs, /dsh-glass\.inputHistory/)
  assert.match(clientJs, /dsh-glass\.wallpaper/)
})

test('bundle declares its cordis inject services', () => {
  // inject must live on the SAME object as apply (a later module.exports
  // reassignment would drop a standalone exports.inject assignment).
  assert.match(clientJs, /inject:\s*\[['"]slots['"]\]/)
  assert.match(clientJs, /module\.exports\s*=\s*\{\s*apply:\s*apply[^}]*inject:\s*\[['"]slots['"]\]/)
})

test('bundle stays ES5 (no const/let/arrow/template)', () => {
  assert.doesNotMatch(clientJs, /\bconst\b|\blet\b|=>|`/)
})

test('glass stylesheet is populated', () => {
  assert.match(clientJs, /html::after/)
  assert.match(clientJs, /::-webkit-scrollbar/)
  assert.match(clientJs, /_sidebarCol/)
})

test('alpha constants and keys are exported', () => {
  assert.match(clientJs, /DEFAULT_ALPHA\s*=\s*0\.4/)
  assert.match(clientJs, /applyAlpha\(/)
  assert.match(clientJs, /color-mix\(in srgb/)
})

test('opacity blends against the theme background variable', () => {
  assert.match(clientJs, /var\(--dsw-alias-bg-base\)/)
})

test('cursor fx config and event are wired', () => {
  assert.match(clientJs, /dsh-cursor-fx-change/)
  assert.match(clientJs, /KEYS\.cursorFx/)
  assert.match(clientJs, /startCursorFx/)
})

test('wallpaper uses IndexedDB and browser file input', () => {
  assert.match(clientJs, /indexedDB\.open/)
  assert.match(clientJs, /type\s*=\s*'file'/)
  assert.match(clientJs, /12 \* 1024 \* 1024/)
  assert.match(clientJs, /dsh-glass-wallpaper/)
})

test('wallpaper layering and controls are wired', () => {
  assert.match(clientJs, /data-dsh-glass-wallpaper="1"/)
  assert.match(clientJs, /data-dsh-wallpaper-name/)
})

test('input history navigation is wired', () => {
  assert.match(clientJs, /ArrowUp/)
  assert.match(clientJs, /ArrowDown/)
  assert.match(clientJs, /setNativeValue/)
  assert.match(clientJs, /dsh-glass\.inputHistory/)
})

test('host half exports an apply function for the cordis loader', async () => {
  const m = await import('../lib/index.js')
  assert.equal(typeof m.apply, 'function')
  assert.equal(m.name, 'dsh-glass-theme')
})
