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
    var useState = React.useState
    var useEffect = React.useEffect

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
    var GLASS_CSS = null // Task 4 填充
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

    module.exports = { apply: apply, name: 'dsh-glass', version: VERSION, keys: KEYS, defaultAlpha: DEFAULT_ALPHA, defaultFx: DEFAULT_FX }
    return module.exports
  },
})
