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
  assert.match(clientJs, /dsh-glass\.enabled/)
  assert.match(clientJs, /dsh-glass\.brandInterval/)
  assert.match(clientJs, /dsh-glass\.desktopEnabled/)
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
  assert.match(clientJs, /html\[data-dsh-glass-enabled="1"\]::after/)
  assert.match(clientJs, /::-webkit-scrollbar/)
  assert.match(clientJs, /_sidebarCol/)
})

test('alpha constants and keys are exported', () => {
  assert.match(clientJs, /DEFAULT_ALPHA\s*=\s*0\.4/)
  assert.match(clientJs, /applyAlpha\(/)
  assert.match(clientJs, /html\[data-dsh-glass-enabled="1"\] \{ background-color: transparent !important; \}/)
})

test('panel tokens become translucent glass following the alpha', () => {
  assert.match(clientJs, /--dsw-alias-bg-base: rgba\(15, 17, 23, var\(--dsh-glass-alpha/)
  assert.match(clientJs, /--dsw-specific-sidebar-fill/)
  assert.match(clientJs, /body\[data-dsh-glass-enabled="1"\]\[data-ds-dark-theme\]/)
  assert.match(clientJs, /body\[data-dsh-glass-enabled="1"\]:not\(\[data-ds-dark-theme\]\)/)
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

test('glass effects master switch gates transparency and wallpaper', () => {
  assert.match(clientJs, /DEFAULT_ENABLED\s*=\s*true/)
  assert.match(clientJs, /function loadEnabled\(\)/)
  assert.match(clientJs, /function applyEnabled\(on\)/)
  assert.match(clientJs, /data-dsh-glass-enabled/)
  assert.match(clientJs, /data-dsh-glass-enabled-control/)
  assert.match(clientJs, /启用透明面板与背景壁纸/)
  assert.match(clientJs, /if \(!loadEnabled\(\)\)/)
  assert.match(clientJs, /applyEnabled\(loadEnabled\(\)\)/)
})

test('desktop shell (Electron) is isolated by default via its own toggle', () => {
  assert.match(clientJs, /function isDesktopShell\(\)/)
  assert.match(clientJs, /window\.dshDesktop/)
  assert.match(clientJs, /dsh-glass\.desktopEnabled/)
  assert.match(clientJs, /DEFAULT_DESKTOP_ENABLED\s*=\s*false/)
  assert.match(clientJs, /isDesktopShell\(\) && !loadDesktopEnabled\(\)/)
  assert.match(clientJs, /registerSettings\(ctx\)/)
  assert.match(clientJs, /data-dsh-desktop-control/)
  assert.match(clientJs, /在桌面版中启用玻璃主题/)
})

test('brand color cycle interval is configurable (default 10s)', () => {
  assert.match(clientJs, /DEFAULT_BRAND_INTERVAL\s*=\s*10/)
  assert.match(clientJs, /function loadBrandInterval\(\)/)
  assert.match(clientJs, /loadBrandInterval\(\) \* 1000/)
  assert.match(clientJs, /KEYS\.brandInterval/)
  assert.match(clientJs, /间隔\(秒\)/)
  assert.match(clientJs, /min: '3', max: '300'/)
})

test('brand color cycle is wired (10s logo/icon rotation)', () => {
  assert.match(clientJs, /dsh-glass\.brandCycle/)
  assert.match(clientJs, /startBrandCycle/)
  assert.match(clientJs, /BRAND_GRAD_ID/)
  assert.match(clientJs, /setInterval\(cycleBrandColors, 1000\)/)
  assert.match(clientJs, /applyRailFish/)
  assert.match(clientJs, /applySidebarIcons/)
})

test('browser title-bar theme-color is pinned to the glass theme', () => {
  // DSH's ThemePresenter mirrors theme-color to the computed body background,
  // which the plugin makes transparent — Chrome app windows then paint the
  // title bar black. The plugin must own that meta instead.
  assert.match(clientJs, /meta\[name="theme-color"\]/)
  assert.match(clientJs, /THEME_COLOR_DARK\s*=\s*'#0f1117'/)
  assert.match(clientJs, /THEME_COLOR_LIGHT\s*=\s*'#f5f6f7'/)
  assert.match(clientJs, /attributeFilter: \['content'\]/)
  assert.match(clientJs, /startThemeColorWatch/)
  assert.match(clientJs, /writeThemeColor\(\)/)
})

test('controls use uncontrolled inputs so repeated clicks work', () => {
  // Controlled checked/value on a static component gets reverted by React on
  // every interaction (no re-render), making the checkbox clickable once.
  assert.match(clientJs, /defaultChecked: fx\.enabled/)
  assert.match(clientJs, /defaultValue: fx\.sidebar/)
  assert.match(clientJs, /defaultValue: fx\.center/)
  assert.match(clientJs, /defaultChecked: loadBrandCycle\(\)/)
  // The alpha slider must be uncontrolled too, or dragging reverts its thumb
  // to the initial position on every interaction.
  assert.match(clientJs, /defaultValue: String\(value\)/)
})

test('host half exports an apply function for the cordis loader', async () => {
  const m = await import('../lib/index.js')
  assert.equal(typeof m.apply, 'function')
  assert.equal(m.name, 'dsh-glass-theme')
})
