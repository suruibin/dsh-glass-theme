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

test('bundle id is dsh-glass', () => {
  assert.match(clientJs, /id:\s*['"]dsh-glass['"]/)
})

test('plugin registers the settings.section slot', () => {
  assert.match(clientJs, /slots\.inject\(['"]settings\.section['"]/)
  assert.match(clientJs, /name:\s*['"]settings\.section['"]/)
  assert.match(clientJs, /id:\s*['"]dsh-glass['"]/)
})

test('package.json declares client inject modules', () => {
  const inject = pkg.dsh?.client?.inject
  assert.ok(Array.isArray(inject) && inject.length > 0, 'dsh.client.inject must be a non-empty array')
  for (const m of inject) assert.match(m, /^@deepseek-ai\/dsh-client-/)
  assert.equal(pkg.dsh.client.platform, 'web')
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
  assert.match(clientJs, /exports\.inject\s*=\s*\[['"]slots['"]\]/)
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
