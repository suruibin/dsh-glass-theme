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
    var GLASS_CSS = [
      // Ambient texture: faint film grain (mix-blend overlay keeps it subtle)
      // + a soft brand-blue glow pooling near the top, like light on glass.
      // Both are static fixed layers — deliberately NO animation, because an
      // animated full-canvas layer pegs the renderer at ~100% CPU under
      // software rendering (see hero below).
      'html::after {',
      "  content: '';",
      '  position: fixed; inset: 0;',
      '  z-index: 2147483001;',
      '  pointer-events: none;',
      "  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\");",
      '  opacity: 0.025;',
      '  mix-blend-mode: overlay;',
      '}',
      'html::before {',
      "  content: '';",
      '  position: fixed; inset: 0;',
      '  z-index: 2147483000;',
      '  pointer-events: none;',
      '  background: radial-gradient(120% 70% at 50% -8%, rgba(65, 118, 230, 0.16), transparent 62%);',
      '}',
      // Slim unobtrusive scrollbars that read as part of the glass theme.
      '*::-webkit-scrollbar { width: 8px; height: 8px; }',
      '*::-webkit-scrollbar-track { background: transparent; }',
      '*::-webkit-scrollbar-thumb { background: rgba(128, 132, 142, 0.38); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }',
      '*::-webkit-scrollbar-thumb:hover { background: rgba(128, 132, 142, 0.62); border: 2px solid transparent; background-clip: content-box; }',
      '* { scrollbar-width: thin; scrollbar-color: rgba(128, 132, 142, 0.38) transparent; }',
      // Sidebar as a floating glass card: drop the hard divider, round all
      // corners, lift it off the canvas with margin and a soft shadow.
      '[class*=\"_sidebarCol\"] {',
      '  border-right: none !important;',
      '  border-radius: 16px !important;',
      '  margin: 8px 4px 8px 8px !important;',
      '  box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.5);',
      '}',
      '[class*=\"_sidebarCol\"] [class*=\"_root\"] {',
      '  border-radius: 12px !important;',
      '}',
      // Center column (conversation area): same floating glass card as the
      // sidebar — rounded on all four corners, lifted with margin. NO drop
      // shadow: the shadow's leftward spread lands on the sidebar's right
      // edge across the 4px gap and renders as a darker band on it.
      '[class*=\"_centerCol\"] {',
      '  border-radius: 16px !important;',
      '  margin: 8px 8px 8px 0 !important;',
      '  overflow: hidden !important;',
      '}',
      '[class*=\"_centerCol\"] [class*=\"_root\"] {',
      '  border-radius: 12px !important;',
      '}',
      // Details panel (对话 / 轨迹 / Session log): same floating-card look,
      // compact height so it does not butt against the window top edge.
      '[class*=\"_detailsCol\"] {',
      '  border-left: none !important;',
      '  border-radius: 16px !important;',
      '  margin: 16px 8px 8px 0 !important;',
      '  box-shadow: -8px 0 24px -12px rgba(0, 0, 0, 0.35);',
      '  height: 62% !important;',
      '  align-self: start !important;',
      '}',
      '[class*=\"_detailsCol\"] [class*=\"_header\"] {',
      '  height: 40px !important;',
      '}',
      '[class*=\"_detailsCol\"] [class*=\"_tabs\"] {',
      '  margin-top: 0 !important;',
      '}',
      '[class*=\"_detailsCol\"] [class*=\"_tab\"] {',
      '  font-size: 12px !important;',
      '  padding-bottom: 8px !important;',
      '}',
      '[class*=\"_detailsCol\"] [class*=\"_root\"] {',
      '  border-radius: 12px !important;',
      '}',
      // New-session button: translucent glass pill, icon only (label hidden),
      // original rounded-rect shape.
      '[class*=\"_sidebarCol\"] [class*=\"_newSession\"] {',
      '  background: rgba(65, 118, 230, 0.12) !important;',
      '  border: 1px solid rgba(65, 118, 230, 0.4) !important;',
      '  box-shadow: 0 2px 10px -4px rgba(65, 118, 230, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;',
      '  height: 30px !important;',
      '  min-height: 30px !important;',
      '  padding: 0 12px !important;',
      '  margin: 0 2px 8px !important;',
      '  border-radius: 12px !important;',
      '  transition: box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease !important;',
      '}',
      '[class*=\"_sidebarCol\"] [class*=\"_newSessionLabel\"] {',
      '  display: none !important;',
      '}',
      '[class*=\"_sidebarCol\"] [class*=\"_newSession\"]:hover {',
      '  background: rgba(65, 118, 230, 0.2) !important;',
      '  border-color: rgba(65, 118, 230, 0.6) !important;',
      '  box-shadow: 0 4px 14px -4px rgba(65, 118, 230, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;',
      '}',
      // Expanded brand: taller logo row (75px) and larger wordmark. The
      // collapsed rail keeps its compact 36px strip unchanged.
      '[class*=\"_sidebarCol\"] [class*=\"_root\"]:not([class*=\"_collapsed\"]) [class*=\"_logoRow\"] {',
      '  height: 75px !important;',
      '  margin-bottom: 6px !important;',
      '  padding-top: 6px !important;',
      '  padding-bottom: 6px !important;',
      '}',
      '[class*=\"_sidebarCol\"] [class*=\"_root\"]:not([class*=\"_collapsed\"]) [class*=\"_brand\"] svg {',
      '  width: 260px !important;',
      '  height: auto !important;',
      '}',
      // Collapsed rail: the icon buttons are 36px but the rail's asymmetric
      // padding (18px left / 10px right) pushed every icon right of center.
      // Symmetric 4px side padding centers the 36px buttons in the 44px rail.
      '[class*=\"_sidebarCol\"] [class*=\"_root\"][class*=\"_collapsed\"] {',
      '  padding: 18px 4px 6px !important;',
      '  align-items: center !important;',
      '}',
      '[class*=\"_sidebarCol\"] [class*=\"_root\"][class*=\"_collapsed\"] [class*=\"_newSession\"] {',
      '  margin: 0 0 8px !important;',
      '}',
      // Empty-state hero glow (blue blurred ellipse behind the composer):
      // hidden entirely — the user wants no glow around the input area.
      '[class*=\"_heroGlow\"] { display: none !important; }',
      // Composer input card: drop its native drop shadow — against the
      // floating glass panes the soft shadow reads as a stray dark outline
      // around the input box and clashes with the flat glass cards.
      '[class*=\"uV2eYG_card\"] { box-shadow: none !important; }',
      // Sidebar list bottom fade: its gradient endpoint follows
      // --dsw-alias-bg-base, which the glass tint makes translucent, so the
      // fade stacks a second translucent layer on the sidebar's own
      // translucent backdrop and renders as a visible darker band above the
      // footer. No fixed color can match the translucent backdrop, so hide
      // the fade entirely — the band is gone, and the sidebar reads clean.
      '[class*=\"_sidebarCol\"] [class*=\"_fade\"] { display: none !important; }',
    ].join('\n')
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
