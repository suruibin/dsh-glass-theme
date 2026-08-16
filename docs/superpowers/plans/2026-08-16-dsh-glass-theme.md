# dsGlass Theme Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Deepseek-Harness fork 中的前端可移植增强(主题设置页、玻璃样式、光标特效、壁纸、输入历史)做成标准 DSH 客户端插件 `dsh-glass-theme`,可 `dsh plugin` 安装进官方 DSH web profile。

**Architecture:** 纯客户端插件,手写 `window.__ModuleLoader__.load({ id: 'dsh-glass', factory })` bundle(零构建依赖,仿 `@a9i5k4/dsh-auto-memory/lib/client.js`)。设置入口走官方 `settings.section` 插槽;玻璃样式/输入历史/光标特效/壁纸层在 apply 时直接操作 DOM。持久化用 localStorage + IndexedDB。

**Tech Stack:** 无(手写 ES5-style bundle,宿主提供 react + `@deepseek-ai/dsh-client-*` 模块)。Node 测试:`node:test`。

**参考源:** 功能逻辑搬运自 `/projects/Deepseek-Harness/src/glass.ts`:
- `alphaControlScript()`(276 行起)—— 透明度滑块 + 光标特效开关/模式
- `ambientStyleScript()`(426 行起)—— 玻璃样式 CSS
- `whaleSprayScript()`(807 行起)—— canvas 光标粒子特效
- `inputHistoryScript()`(1128 行起)—— 输入历史(去掉 /backup 分支)
- `wallpaperLayerScript()`(2325 行起)+ `wallpaperControlScript()`(2364 行起)—— 壁纸层 + 控件(改为浏览器 file 选择 + IndexedDB)

**宿主范本:** `/home/suruibin/.dsh/profiles/web/node_modules/@a9i5k4/dsh-auto-memory/lib/client.js`(插槽注册模式)、`.../dshmarket/package.json`(`dsh.client` 声明)。

**设计文档:** `docs/superpowers/specs/2026-08-16-dsh-glass-theme-design.md`

---

## 文件结构

```
dsh-glass-theme/
├── package.json
├── cordis.patch.yml
├── lib/
│   ├── index.js          # 主进程占位,空导出
│   └── client.js         # 全部前端功能(手写 bundle)
├── README.zh.md
└── tests/
    └── client.spec.mjs   # 纯 Node 校验
```

每个文件单一职责:package.json 声明插件元数据;cordis.patch.yml 挂进层栈;client.js 承载全部 UI/逻辑;index.js 预留主进程扩展;测试校验语法与声明一致性。

---

### Task 1: 项目脚手架(package.json + cordis.patch.yml + lib/index.js)

**Files:**
- Create: `package.json`
- Create: `cordis.patch.yml`
- Create: `lib/index.js`
- Create: `.gitignore`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "dsh-glass-theme",
  "description": "玻璃主题插件:主题设置页(背景透明度/光标特效/背景壁纸)、玻璃 UI 样式、输入历史。· Glass theme plugin: theme settings page (background opacity / cursor FX / wallpaper), glass UI styles, input history.",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "license": "BSD-3-Clause",
  "keywords": ["dsh", "deepseek-harness", "plugin", "glass", "theme"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-ui-sidebar"
      ],
      "platform": "web"
    }
  }
}
```

- [ ] **Step 2: 写 cordis.patch.yml**

```yaml
# dsh glass theme bundle patch: inserts this plugin into a profile's layer stack.
- insert:
    - id: dsh-glass
      name: 'dsh-glass-theme'
```

- [ ] **Step 3: 写 lib/index.js(主进程占位)**

```js
// dsh-glass-theme — host-side placeholder.
// All current functionality lives in the client bundle (lib/client.js).
// A future main-process extension (e.g. wallpaper persisted to disk) would
// be registered here via the dsh.bundle.patch layer stack.
export const name = 'dsh-glass-theme'
```

- [ ] **Step 4: 写 .gitignore**

```
node_modules/
*.log
.DS_Store
```

- [ ] **Step 5: 提交**

```bash
git add package.json cordis.patch.yml lib/index.js .gitignore
git commit -m "chore: dsh-glass-theme scaffold (manifest + bundle patch)"
```

---

### Task 2: client.js 骨架 —— ModuleLoader bundle + settings.section 注册 + 玻璃样式注入

**Files:**
- Create: `lib/client.js`
- Create: `tests/client.spec.mjs`

**设计:** `client.js` 是一个自执行 bundle:`window.__ModuleLoader__.load({ id, factory })`。factory 通过 `require('react')` 拿 createElement(宿主模块表提供)。注册 `settings.section`(主题设置页骨架)+ apply 时注入玻璃样式 `<style>`。

- [ ] **Step 1: 写失败测试(tests/client.spec.mjs)**

```js
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

test('bundle id matches package name', () => {
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
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test tests/client.spec.mjs`
Expected: FAIL — `ENOENT`(client.js 不存在),或 `bundle parses` 失败(空内容)。

- [ ] **Step 3: 写 client.js 骨架(玻璃样式 + 设置页占位)**

```js
/* dsh-glass-theme — browser half (hand-written __ModuleLoader__ bundle).
 * Registers a settings.section page (背景透明度 / 光标特效 / 背景壁纸) and
 * injects the glass UI stylesheet (film grain, brand glow, floating rounded
 * sidebar, slim scrollbars) plus input-history navigation and the cursor-FX
 * canvas layer. Persistence: localStorage + IndexedDB.
 */
console.log('[dsh-glass] client boot')
window.__ModuleLoader__.load({
  id: 'dsh-glass',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement

    // ── 常量 ──────────────────────────────────────────────
    var VERSION = '0.1.0'
    var STYLE_ID = 'dsh-glass-style'
    var KEYS = {
      alpha: 'dsh-glass.alpha',
      cursorFx: 'dsh-glass.cursorFx',
      inputHistory: 'dsh-glass.inputHistory',
      wallpaper: 'dsh-glass.wallpaper',
    }
    var DEFAULT_ALPHA = 0.4
    var DEFAULT_FX = { enabled: true, sidebar: 'star', center: 'water' }

    // ── 玻璃样式(搬运自 glass.ts ambientStyleScript)────────
    var GLASS_CSS = null // Task 3 填充
    function ensureStyle() {
      if (GLASS_CSS === null) return
      var tag = document.getElementById(STYLE_ID)
      if (tag === null) {
        tag = document.createElement('style')
        tag.id = STYLE_ID
        document.head.appendChild(tag)
      }
      tag.textContent = GLASS_CSS
    }

    // ── 主题设置页 ────────────────────────────────────────
    function SettingsPage(props) {
      return h('div', { 'data-dsh-glass-page': '' },
        h('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '12px' } },
          '玻璃主题设置 · Glass theme settings (v' + VERSION + ')'),
        // Task 5/6/7 填充:透明度滑块、光标特效、壁纸控件
      )
    }

    // ── 挂载 ──────────────────────────────────────────────
    function apply(ctx) {
      try { ensureStyle() } catch (e) { console.warn('[dsh-glass] style inject failed', e) }
      ctx.effect(function () {
        return function () {
          var tag = document.getElementById(STYLE_ID)
          if (tag) tag.remove()
        }
      }, 'dsh-glass: styles')

      var slots = ctx.slots
      if (!slots) { console.warn('[dsh-glass] slots service unavailable'); return }
      try {
        slots.inject('settings.section', function () {
          return slots.register(
            { name: 'settings.section', id: 'dsh-glass', order: 30, label: function () { return '主题设置' } },
            function (props) { return h(SettingsPage, { close: props && props.close }) }
          )
        })
      } catch (e) { console.warn('[dsh-glass] slot registration failed', e) }
      console.log('[dsh-glass] client ready')
    }

    // Declare the services this bundle consumes (cordis inject contract).
    exports.inject = ['slots']
    module.exports = { apply: apply, name: 'dsh-glass', version: VERSION }
    return module.exports
  },
})
```

注意:骨架里 `GLASS_CSS` 为 `null` 且设置页无控件——此状态不满足最终功能,但语法与插槽注册是完整的,让 Task 2 可独立验证。

- [ ] **Step 4: 运行测试,确认通过**

Run: `node --test tests/client.spec.mjs`
Expected: PASS(全部用例)。

- [ ] **Step 5: 提交**

```bash
git add lib/client.js tests/client.spec.mjs
git commit -m "feat: client bundle skeleton with settings.section slot"
```

---

### Task 3: 玻璃样式 CSS 移植

**Files:**
- Modify: `lib/client.js`(GLASS_CSS 常量)

**源:** `/projects/Deepseek-Harness/src/glass.ts` 的 `ambientStyleScript()`,426 行起。将 `style.textContent = [...]` 数组内的全部 CSS 字符串原样搬入。

- [ ] **Step 1: 提取 ambientStyleScript 的 CSS 数组**

Run:
```bash
cd /projects/Deepseek-Harness
sed -n '431,806p' src/glass.ts
```
Expected: 一个 JS 数组(每元素一条 CSS 字符串),以 `]` 结尾。把数组字面量整体复制到剪贴板/编辑器。

- [ ] **Step 2: 将数组填入 GLASS_CSS**

把 `lib/client.js` 中:
```js
var GLASS_CSS = null // Task 3 填充
```
替换为:
```js
var GLASS_CSS = [ /* 粘贴步骤1提取的数组元素,原样 */ ].join('\n')
```

**关键调整**(保持渲染器健康,沿用 fork 版经验):
- 保留 `html::after`(噪点 0.025 overlay)与 `html::before`(品牌蓝光晕)两个静态层,`z-index` 用 `2147483001` / `2147483000`;
- 保留滚动条与浮动侧边栏卡片的全部规则;
- **不要**加入任何动画关键帧(animated full-canvas layer 在软件渲染下会打满 CPU——fork 版明确砍掉)。

- [ ] **Step 3: 运行测试**

Run: `node --test tests/client.spec.mjs`
Expected: PASS。新增一条断言:

```js
test('glass stylesheet is populated', () => {
  assert.match(clientJs, /html::after/)
  assert.match(clientJs, /::-webkit-scrollbar/)
  assert.match(clientJs, /_sidebarCol/)
})
```

- [ ] **Step 4: 提交**

```bash
git add lib/client.js tests/client.spec.mjs
git commit -m "feat: glass UI stylesheet (grain, glow, floating sidebar, slim scrollbars)"
```

---

### Task 4: 背景透明度滑块

**Files:**
- Modify: `lib/client.js`

**源:** `alphaControlScript()`,276 行起。滑块逻辑:range 0.4–1 step 0.05,值写 localStorage `dsh-glass.alpha` 并应用到根元素 CSS 变量。插件的宿主是官方 DSH(无 fork 版的 `--dsh-glass-alpha` 主进程变量),因此透明度直接作用于根元素的 `filter`/`opacity` 不可行(会糊掉整个 UI)——正确做法:为 body 的玻璃层背景色应用透明度。

**实现策略(与 fork 版不同的关键点):** 官方 DSH 页面自身有背景。本插件透明度语义 = "玻璃 tint 层的浓淡":注入一个 `html::before` 同级的 tint 层不可行(会盖住内容)。改为:透明度值写入根元素 CSS 变量 `--dsh-glass-alpha`,并在 `GLASS_CSS` 里加一条规则,让 `body` 的 background-color 使用该变量:

```css
:root { --dsh-glass-alpha: 0.4; }
body {
  background-color: color-mix(in srgb, #0d1117 calc(var(--dsh-glass-alpha) * 100%), transparent) !important;
}
```

- [ ] **Step 1: GLASS_CSS 追加透明度规则**

在 Task 3 的 `GLASS_CSS` 数组末尾追加两条字符串:

```js
':root { --dsh-glass-alpha: 0.4; }',
'body { background-color: color-mix(in srgb, #0d1117 calc(var(--dsh-glass-alpha) * 100%), transparent) !important; }',
```

- [ ] **Step 2: 在 bundle 内新增 alpha 辅助函数(放在 ensureStyle 之后)**

```js
    function loadAlpha() {
      try {
        var raw = localStorage.getItem(KEYS.alpha)
        if (raw !== null) {
          var n = Number(raw)
          if (n >= 0.4 && n <= 1) return n
        }
      } catch (e) {}
      return DEFAULT_ALPHA
    }
    function applyAlpha(value) {
      var root = document.documentElement
      root.style.setProperty('--dsh-glass-alpha', String(value))
      try { localStorage.setItem(KEYS.alpha, String(value)) } catch (e) {}
    }
```

- [ ] **Step 3: apply() 里初始化透明度**

在 `ensureStyle()` 调用之后、`ctx.effect` 之前插入:

```js
      try { applyAlpha(loadAlpha()) } catch (e) { console.warn('[dsh-glass] alpha init failed', e) }
```

- [ ] **Step 4: SettingsPage 里渲染滑块(替换骨架中的占位 div)**

```js
    function AlphaSlider() {
      var value = loadAlpha()
      var set = function (ev) {
        var v = Number(ev.target.value)
        applyAlpha(v)
        // 触发重渲染显示数值
        var label = document.querySelector('[data-dsh-alpha-value]')
        if (label) label.textContent = Math.round(v * 100) + '%'
      }
      return h('div', { 'data-dsh-alpha': '', style: { padding: '14px 0', borderBottom: '1px solid rgba(128,132,142,0.16)' } },
        h('div', { style: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' } }, '背景透明度'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' } },
          h('input', {
            type: 'range', min: '0.4', max: '1', step: '0.05',
            value: String(value),
            onChange: set,
            style: { flex: '1', cursor: 'pointer' },
          }),
          h('span', { 'data-dsh-alpha-value': '', style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', minWidth: '44px', textAlign: 'right' } },
            Math.round(value * 100) + '%'),
        ),
      )
    }
```

然后在 `SettingsPage` 中把占位 div 替换为 `h(AlphaSlider)`。

- [ ] **Step 5: 加测试**

```js
test('alpha constants and keys are exported', () => {
  assert.match(clientJs, /DEFAULT_ALPHA\s*=\s*0\.4/)
  assert.match(clientJs, /applyAlpha\(/)
  assert.match(clientJs, /color-mix\(in srgb/)
})
```

- [ ] **Step 6: 运行测试**

Run: `node --test tests/client.spec.mjs`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add lib/client.js tests/client.spec.mjs
git commit -m "feat: background opacity slider (CSS variable + localStorage)"
```

---

### Task 5: 光标特效(开关 + 双栏模式选择)

**Files:**
- Modify: `lib/client.js`

**源:** `whaleSprayScript()`,807 行起。完整 canvas 粒子逻辑(水/星/雪/火花四种,侧边栏/中心双区,40px 节流,`dsh-cursor-fx-change` 事件热重配)。搬运时:
- 配置键 `dsh-desktop-cursor-fx` → `dsh-glass.cursorFx`;
- 默认 `{ enabled: true, sidebar: 'star', center: 'water' }`;
- 移除旧的 `mode` 迁移分支(插件是全新安装,无历史配置);
- `window.__dshWhaleSpray` → 模块内部 `fxState` 对象(不再挂 window,避免与 fork 版实例冲突——同一页面不会同时有两者,但保持干净)。

- [ ] **Step 1: 在 bundle 中新增 cursor FX 模块(在 SettingsPage 之前)**

把 `whaleSprayScript()`(807–1126 行)的函数体整体搬入,并包成函数 `startCursorFx`。先写外壳:

```js
    function startCursorFx() {
      var cfg = Object.assign({}, DEFAULT_FX)
      try {
        var raw = localStorage.getItem(KEYS.cursorFx)
        if (raw !== null) {
          var parsed = JSON.parse(raw)
          cfg = Object.assign(cfg, parsed)
        }
      } catch (e) {}
      if (cfg.enabled === false) return null // toggle off: no canvas at all
      // ...(此处粘贴 whaleSprayScript 函数体其余部分,做下表机械替换)...
      return { dispose: dispose }
    }
```

> 注意:源函数体以 `return \`(() => {...})()\`` 包裹并含 `export function whaleSprayScript(): string {` 外壳——**只取** IIFE 内部 `(() => {...})()` 大括号之间的内容(从 `const canvas = document.createElement('canvas')` 到 `window.__dshWhaleSpray = { dispose }` 之前),不要复制外层模板字符串与 `export function` 壳。

对搬入的函数体做如下机械替换:

| fork 版 | 插件版 |
|---|---|
| `let cfg = { enabled: true, sidebar: 'star', center: 'water' }` | 已由外壳的 `var cfg = Object.assign({}, DEFAULT_FX)` 提供,函数体内删除该行 |
| `const raw = localStorage.getItem('dsh-desktop-cursor-fx')` 配置加载块 | 已由外壳加载,函数体内删除该 try/catch 块 |
| `if (typeof parsed.mode === 'string' && ...)` 迁移分支 | 整个删除(插件全新安装,无历史配置) |
| `if (cfg.enabled === false) return // toggle off...` | 已由外壳 `if (cfg.enabled === false) return null` 处理,函数体内删除 |
| `window.__dshWhaleSpray = { dispose }` | `return { dispose: dispose }`(函数体外壳统一返回) |
| `window.__dshWhaleSpray.dispose()` 开头重置块 | 删除(模块级单实例,由 apply 的 effect 清理) |
| `const` / `let` | `var`(保持 ES5 风格,与骨架一致) |

- [ ] **Step 2: apply() 挂载光标特效 + 清理**

在 apply() 的 `ctx.effect` 中,把返回值扩展为同时卸载样式与特效:

```js
      ctx.effect(function () {
        return function () {
          var tag = document.getElementById(STYLE_ID)
          if (tag) tag.remove()
          if (fxState && fxState.dispose) { try { fxState.dispose() } catch (e) {} }
        }
      }, 'dsh-glass: styles + fx')
```

在 `ensureStyle()` 之后、`applyAlpha` 之后调用启动:

```js
      try { fxState = startCursorFx() } catch (e) { console.warn('[dsh-glass] cursor fx failed', e) }
```

其中 `startCursorFx()` 是把 Step 1 搬入的逻辑包成的一个返回 `{ dispose }` 的函数;`fxState` 在 factory 顶层声明 `var fxState = null`。

- [ ] **Step 3: SettingsPage 渲染光标特效控件(在 AlphaSlider 下方)**

```js
    function CursorFxControl() {
      var fx = loadFx()
      var update = function (patch) {
        var next = Object.assign({}, fx, patch)
        fx = next
        try { localStorage.setItem(KEYS.cursorFx, JSON.stringify(next)) } catch (e) {}
        window.dispatchEvent(new CustomEvent('dsh-cursor-fx-change', { detail: next }))
      }
      var modeOpts = function (value, on) {
        var opts = [['star', '星光'], ['water', '水滴'], ['snow', '飘雪'], ['spark', '火花'], ['none', '关闭']]
        return opts.map(function (o) {
          return h('option', { value: o[0], selected: value === o[0] ? true : undefined }, o[1])
        })
      }
      return h('div', { 'data-dsh-cursor-fx': '', style: { padding: '14px 0', borderBottom: '1px solid rgba(128,132,142,0.16)' } },
        h('div', { style: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' } }, '光标特效'),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '4px' } },
          h('input', { type: 'checkbox', checked: fx.enabled, onChange: function (e) { update({ enabled: e.target.checked }) }, style: { width: '15px', height: '15px', accentColor: '#4176e6', cursor: 'pointer' } }),
          '启用光标特效'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' } },
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', minWidth: '52px' } }, '侧边栏'),
          h('select', { value: fx.sidebar, onChange: function (e) { update({ sidebar: e.target.value }) }, style: { flex: '1', background: 'rgb(39,46,62)', color: 'var(--dsw-alias-label-primary)', border: 'none', borderRadius: '18px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', outline: 'none' } },
            modeOpts(fx.sidebar))),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' } },
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', minWidth: '52px' } }, '右侧'),
          h('select', { value: fx.center, onChange: function (e) { update({ center: e.target.value }) }, style: { flex: '1', background: 'rgb(39,46,62)', color: 'var(--dsw-alias-label-primary)', border: 'none', borderRadius: '18px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', outline: 'none' } },
            modeOpts(fx.center))),
      )
    }
```

`loadFx()` 辅助函数(放在 loadAlpha 旁):

```js
    function loadFx() {
      try {
        var raw = localStorage.getItem(KEYS.cursorFx)
        if (raw !== null) {
          var parsed = JSON.parse(raw)
          var out = Object.assign({}, DEFAULT_FX, parsed)
          if (typeof out.enabled !== 'boolean') out.enabled = true
          return out
        }
      } catch (e) {}
      return Object.assign({}, DEFAULT_FX)
    }
```

在 `SettingsPage` 中 AlphaSlider 之后渲染 `h(CursorFxControl)`。

- [ ] **Step 4: 加测试**

```js
test('cursor fx config and event are wired', () => {
  assert.match(clientJs, /dsh-cursor-fx-change/)
  assert.match(clientJs, /KEYS\.cursorFx/)
  assert.match(clientJs, /startCursorFx/)
})
```

- [ ] **Step 5: 运行测试**

Run: `node --test tests/client.spec.mjs`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add lib/client.js tests/client.spec.mjs
git commit -m "feat: cursor FX (canvas particles, per-pane modes, live reconfig)"
```

---

### Task 6: 背景壁纸(浏览器 file 选择 + IndexedDB)

**Files:**
- Modify: `lib/client.js`

**源:** `wallpaperLayerScript()`(2325)+ `wallpaperControlScript()`(2364)。差异:
- fork 版走 `window.dshDesktop.wallpaper.pick()`(Electron 系统对话框)→ 插件版用隐藏 `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/bmp">`;
- fork 版存磁盘 → 插件版存 IndexedDB(data URL 可能 >5MB);
- 图层 `<div id="dsh-dt-wallpaper">` → `<div id="dsh-glass-wallpaper">`,同样 `z-index:-1;filter:blur(8px) brightness(0.72);transform:scale(1.06)`,需在 `body` 上保证玻璃 tint 之上、内容之下(沿用 fork 版已调好的层序)。

- [ ] **Step 1: 新增 IndexedDB 辅助(放在 factory 顶部,KEYS 之后)**

```js
    var DB_NAME = 'dsh-glass'
    var DB_STORE = 'kv'
    function idb() {
      return new Promise(function (resolve, reject) {
        if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
        var req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = function () {
          if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE)
        }
        req.onsuccess = function () { resolve(req.result) }
        req.onerror = function () { reject(req.error) }
      })
    }
    function idbGet(key) {
      return idb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(DB_STORE, 'readonly')
          var r = tx.objectStore(DB_STORE).get(key)
          r.onsuccess = function () { resolve(r.result) }
          r.onerror = function () { reject(r.error) }
        })
      })
    }
    function idbSet(key, value) {
      return idb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(DB_STORE, 'readwrite')
          tx.objectStore(DB_STORE).put(value, key)
          tx.oncomplete = function () { resolve() }
          tx.onerror = function () { reject(tx.error) }
        })
      })
    }
    function idbDel(key) {
      return idb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(DB_STORE, 'readwrite')
          tx.objectStore(DB_STORE).delete(key)
          tx.oncomplete = function () { resolve() }
          tx.onerror = function () { reject(tx.error) }
        })
      })
    }
```

- [ ] **Step 2: 新增壁纸图层辅助 + 控件**

> 注:插件 body 背景为不透明 color-mix(见 Task 4),`z-index:-1` 的壁纸层会被完全盖住。壁纸激活时必须把 body 背景改为透明(`background: transparent !important`),同时保留玻璃 tint 效果(可改为给壁纸层本身加暗色遮罩);壁纸移除时恢复 body 背景规则。

图层注入(仿 wallpaperLayerScript,ensure 逻辑):

```js
    var WALL_ID = 'dsh-glass-wallpaper'
    var wallpaperUrl = null
    function ensureWallpaperLayer() {
      var el = document.getElementById(WALL_ID)
      if (el === null) {
        el = document.createElement('div')
        el.id = WALL_ID
        el.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center;background-repeat:no-repeat;filter:blur(8px) brightness(0.72);transform:scale(1.06)'
        document.body.prepend(el)
      }
      el.style.backgroundImage = wallpaperUrl ? 'url("' + wallpaperUrl + '")' : 'none'
    }
    function loadWallpaper() {
      return idbGet(KEYS.wallpaper).then(function (rec) {
        if (rec && typeof rec.url === 'string') { wallpaperUrl = rec.url; ensureWallpaperLayer() }
      }).catch(function () {})
    }
    function setWallpaper(url, name) {
      wallpaperUrl = url || null
      ensureWallpaperLayer()
      if (!url) return idbDel(KEYS.wallpaper)
      return idbSet(KEYS.wallpaper, { url: url, name: name || '' })
    }
```

控件(在 CursorFxControl 下方渲染):

```js
    function WallpaperControl() {
      var name = '移除'
      var pick = function () {
        var input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/bmp'
        input.style.display = 'none'
        document.body.appendChild(input)
        input.onchange = function () {
          var file = input.files && input.files[0]
          input.remove()
          if (!file) return
          if (file.size > 12 * 1024 * 1024) { alert('图片过大,请选择 ≤12 MiB 的图片'); return }
          var reader = new FileReader()
          reader.onload = function () {
            setWallpaper(String(reader.result), file.name).catch(function (e) { alert('保存壁纸失败: ' + e) })
          }
          reader.onerror = function () { alert('读取图片失败') }
          reader.readAsDataURL(file)
        }
        input.click()
      }
      var clear = function () {
        setWallpaper(null, null).catch(function () {})
      }
      return h('div', { 'data-dsh-wallpaper': '', style: { padding: '14px 0', display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { style: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' } }, '背景壁纸'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('button', { onClick: pick, style: { background: '#4176e6', color: '#fff', border: 'none', borderRadius: '16px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' } }, '选择壁纸…'),
          h('button', { onClick: clear, style: { background: 'transparent', color: 'var(--dsw-alias-label-primary)', border: '1px solid rgba(65,118,230,0.4)', borderRadius: '16px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' } }, name),
        ),
      )
    }
```

在 `SettingsPage` 中 CursorFxControl 之后渲染 `h(WallpaperControl)`(设计定:壁纸在最前,故在 SettingsPage 中把它放到最上面——见 Step 3 顺序)。

- [ ] **Step 3: 调整 SettingsPage 组件顺序(壁纸在最前)**

按设计文档:"wallpaper-above-opacity order"。最终 SettingsPage 渲染顺序:

```js
    function SettingsPage(props) {
      return h('div', { 'data-dsh-glass-page': '' },
        h(WallpaperControl),
        h(AlphaSlider),
        h(CursorFxControl),
      )
    }
```

- [ ] **Step 4: apply() 里初始化壁纸**

在 `applyAlpha` 之后:

```js
      try { loadWallpaper() } catch (e) { console.warn('[dsh-glass] wallpaper load failed', e) }
```

- [ ] **Step 5: 加测试**

```js
test('wallpaper uses IndexedDB and browser file input', () => {
  assert.match(clientJs, /indexedDB\.open/)
  assert.match(clientJs, /type:\s*'file'/)
  assert.match(clientJs, /12 \* 1024 \* 1024/)
  assert.match(clientJs, /dsh-glass-wallpaper/)
})
```

- [ ] **Step 6: 运行测试**

Run: `node --test tests/client.spec.mjs`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add lib/client.js tests/client.spec.mjs
git commit -m "feat: background wallpaper (browser picker + IndexedDB + blur layer)"
```

---

### Task 7: 输入历史

**Files:**
- Modify: `lib/client.js`

**源:** `inputHistoryScript()`,1128 行起。去掉 `/backup` 拦截分支(依赖 preload 桥)与 `workspaceName`/`toast`/`runBackup` 辅助;保留 ↑/↓ 导航、Enter 记录、React 受控 textarea 原生 setter 同步。

- [ ] **Step 1: 在 bundle 中新增 input history 模块(在 apply 之前)**

```js
    var HISTORY_KEY = KEYS.inputHistory
    var HISTORY_MAX = 50
    function loadHistory() {
      var history = []
      try {
        var raw = localStorage.getItem(HISTORY_KEY)
        if (raw !== null) {
          var parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) history = parsed.filter(function (x) { return typeof x === 'string' })
        }
      } catch (e) {}
      return history
    }
    var historyState = { idx: -1, draft: '', history: loadHistory() }
    function findInput() {
      return Array.from(document.querySelectorAll('textarea')).find(function (t) {
        return !t.classList.contains('xterm-helper-textarea') && (t.placeholder || '').trim() !== ''
      })
    }
    function setNativeValue(input, value) {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      try { input.setSelectionRange(value.length, value.length) } catch (e) {}
    }
    function onHistoryKey(e) {
      if (e.key === 'ArrowUp') {
        if (historyState.history.length === 0) return
        e.preventDefault()
        if (historyState.idx === -1) { historyState.draft = e.target.value; historyState.idx = historyState.history.length }
        historyState.idx = Math.max(0, historyState.idx - 1)
        setNativeValue(e.target, historyState.history[historyState.idx])
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        historyState.idx = Math.min(historyState.history.length, historyState.idx + 1)
        setNativeValue(e.target, historyState.idx >= historyState.history.length ? historyState.draft : historyState.history[historyState.idx])
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        var text = e.target.value.trim()
        if (text !== '' && historyState.history[historyState.history.length - 1] !== text) {
          historyState.history.push(text)
          if (historyState.history.length > HISTORY_MAX) historyState.history = historyState.history.slice(-HISTORY_MAX)
          try { localStorage.setItem(HISTORY_KEY, JSON.stringify(historyState.history)) } catch (e2) {}
        }
        historyState.idx = -1
      }
    }
    function startInputHistory() {
      var attach = function () {
        var input = findInput()
        if (input !== null && input.dataset.dshGlassHistory === undefined) {
          input.dataset.dshGlassHistory = '1'
          input.addEventListener('keydown', onHistoryKey)
        }
      }
      var obs = new MutationObserver(attach)
      obs.observe(document.body, { childList: true, subtree: true })
      attach()
      return {
        dispose: function () {
          obs.disconnect()
          var input = findInput()
          if (input !== null) input.removeEventListener('keydown', onHistoryKey)
        },
      }
    }
```

- [ ] **Step 2: apply() 挂载输入历史 + 清理**

在 `fxState = startCursorFx()` 之后:

```js
      try { historyHandle = startInputHistory() } catch (e) { console.warn('[dsh-glass] input history failed', e) }
```

factory 顶层声明 `var historyHandle = null`;在 apply 的 effect 清理函数中追加:

```js
          if (historyHandle && historyHandle.dispose) { try { historyHandle.dispose() } catch (e) {} }
```

- [ ] **Step 3: 加测试**

```js
test('input history navigation is wired', () => {
  assert.match(clientJs, /ArrowUp/)
  assert.match(clientJs, /ArrowDown/)
  assert.match(clientJs, /setNativeValue/)
  assert.match(clientJs, /dsh\.glass\.inputHistory/)
})
```

- [ ] **Step 4: 运行测试**

Run: `node --test tests/client.spec.mjs`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/client.js tests/client.spec.mjs
git commit -m "feat: input history (up/down recall, enter record)"
```

---

### Task 8: README + 全量测试 + 页面注入验证

**Files:**
- Create: `README.zh.md`
- Modify: `tests/client.spec.mjs`(如需要补充断言)

- [ ] **Step 1: 写 README.zh.md**

```markdown
# dsh-glass-theme

玻璃主题插件 · Glass theme plugin for DeepSeek Harness(DSH)。

## 功能

- **主题设置页**(设置 → 主题设置):
  - 背景透明度滑块(0.4–1)
  - 光标特效:启用开关 + 侧边栏/右侧两栏模式(星光/水滴/飘雪/火花/关闭)
  - 背景壁纸:浏览器选择图片(≤12 MiB),底层模糊铺满,「移除」恢复
- **玻璃 UI 样式**:噪点纹理、品牌蓝光晕、浮动圆角侧边栏、细滚动条
- **输入历史**:输入框 ↑/↓ 回看已发送内容,Enter 记录(上限 50 条)

## 安装

```bash
# 本地开发安装(在插件仓库目录外执行)
dsh plugin --profile web add ./dsh-glass-theme

# 或发布 npm 后
dsh plugin --profile web add dsh-glass-theme
```

安装后重启 dsh web 生效。卸载:`dsh plugin --profile web remove dsh-glass-theme`。

## 数据存储

| 数据 | 位置 |
|---|---|
| 背景透明度 | localStorage `dsh-glass.alpha` |
| 光标特效 | localStorage `dsh-glass.cursorFx` |
| 输入历史 | localStorage `dsh-glass.inputHistory` |
| 背景壁纸 | IndexedDB `dsh-glass` / kv |

## 开发

```bash
node --test tests/client.spec.mjs   # 纯 Node 校验(bundle 语法 + 声明一致性)
```

无构建步骤——`lib/client.js` 是手写 `__ModuleLoader__` bundle,直接随包分发。

## 与 Electron 桌面版(Deepseek-Harness fork)的差异

- 壁纸选择:浏览器原生文件选择(非系统对话框),存 IndexedDB(非磁盘)
- 无终端 dock / 文件浏览器(依赖 Electron 主进程能力)
- 输入历史不含 /backup 命令拦截(依赖 preload 桥)
```

- [ ] **Step 2: 运行全量测试**

Run: `node --test tests/client.spec.mjs`
Expected: 全部 PASS。

- [ ] **Step 3: 语法自检**

Run: `node -e "const s=require('fs').readFileSync('lib/client.js','utf8'); const b=s.replace(/^window\.__ModuleLoader__\.load\(/,'('); new Function(b); console.log('syntax OK')"`
Expected: `syntax OK`。

- [ ] **Step 4: 页面注入验证(手动/CDP,在调试实例进行)**

验证项(任一通过即可,用现有 `--remote-debugging-port=9222` 实例):
1. 打开设置 → 侧边栏出现「主题设置」;
2. 点开 → 壁纸(最上)、透明度、光标特效依次排列;
3. 拖透明度滑块 → 背景变深/浅,刷新页面保持;
4. 切光标特效模式/开关 → 页面鼠标移动出对应粒子;
5. 选一张小图 → 底层模糊层出现,刷新保持;
6. 输入框 ↑/↓ → 回看历史。

> 若插件尚未安装,可临时把 `lib/client.js` 作为单文件注入调试实例验证(注入前需先提供 `window.__ModuleLoader__` 与宿主模块——更简单的是直接走真实安装,见 Task 9)。

- [ ] **Step 5: 提交**

```bash
git add README.zh.md tests/client.spec.mjs
git commit -m "docs: README + full test pass"
```

---

### Task 9: 真实安装验证(可选,推荐)

**Files:** 无(环境验证)

- [ ] **Step 1: 本地安装到 web profile**

Run:
```bash
cd /projects/dsh-glass-theme
dsh plugin --profile web add ./dsh-glass-theme
```
Expected: pnpm 把包装入 `~/.dsh/profiles/web/node_modules/`,且 `dsh.profile.bundles` 出现 `dsh-glass-theme`。

- [ ] **Step 2: 重启 dsh web 并验证 UI**

重启当前 dsh 进程(用户操作或 `pkill -x electron` 后再起),打开设置 → 主题设置,逐项验证 Task 8 Step 4 的 6 个验证点。

- [ ] **Step 3: 验证安装失败时的回滚**

若安装/UI 异常:
```bash
dsh plugin --profile web remove dsh-glass-theme
```
并检查 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 已移除该条目。

- [ ] **Step 4: 提交安装说明(如有发现)**

若安装过程中发现 README 描述与实际不符,修正 README 并提交。

---

## 自审记录

- **Spec coverage:**
  - 主题设置页 → Task 2(注册)+ 4/5/6(控件)
  - 玻璃样式 → Task 3
  - 光标特效 → Task 5
  - 壁纸 → Task 6
  - 输入历史 → Task 7
  - 测试/README/安装 → Task 1/8/9
- **Placeholder scan:** 唯一占位是 Task 3 Step 1 要求从源文件提取 CSS 数组后"粘贴原样"——这是有明确源位置与命令的搬运指令,非 TODO。
- **Type consistency:** `fxState`(Task 5 声明,Task 5 Step 2 使用)、`historyHandle`(Task 7 声明/使用)、`loadFx`(Task 5 定义,Task 5 Step 3 使用)、`KEYS.*` 键名在各任务间一致;SettingsPage 渲染顺序在 Task 6 Step 3 统一为 壁纸→透明度→光标特效。
