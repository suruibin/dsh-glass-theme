/* dsh-glass-theme — browser half (hand-written __ModuleLoader__ bundle).
 * Registers a settings.section page (背景透明度 / 光标特效 / 背景壁纸) and
 * injects the glass UI stylesheet (film grain, brand glow, floating rounded
 * sidebar, slim scrollbars) plus input-history navigation and the cursor-FX
 * canvas layer. Persistence: localStorage + IndexedDB.
 */
console.log('[dsh-glass] client boot')
window.__ModuleLoader__.load({
  id: 'dsh-glass-theme',
  factory: function (require) {
    var module = { exports: {} }
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
      brandCycle: 'dsh-glass.brandCycle',
    }
    var DEFAULT_ALPHA = 0.4
    var DEFAULT_FX = { enabled: true, sidebar: 'star', center: 'water' }
    var DEFAULT_BRAND_CYCLE = true
    var fxState = null // live cursor-FX instance, disposed with the effect
    var historyHandle = null // input-history observer, disposed with the effect
    var brandHandle = null // brand color-cycle instance, disposed with the effect

    // ── IndexedDB 辅助(壁纸 data URL 可能 >5MB,localStorage 放不下)──
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
      ':root { --dsh-glass-alpha: 0.4; }',
      // DSH paints its panels (sidebar / center / details / composer root)
      // from three design tokens. The fork overrides them to translucent
      // glass colors so the wallpaper / tint shows through the panels — the
      // plugin must do the same or the panels stay opaque and hide the
      // background entirely. Dark and light themes get their own glass tone.
      // Panel alpha follows the slider linearly: 0.4 → panels 40% opaque
      // (wallpaper/tint shows through), 1 → fully opaque.
      'body[data-ds-dark-theme] {',
      '  --dsw-alias-bg-base: rgba(15, 17, 23, var(--dsh-glass-alpha, 0.4)) !important;',
      '  --dsw-alias-bg-layer-1: rgba(15, 17, 23, var(--dsh-glass-alpha, 0.4)) !important;',
      '  --dsw-specific-sidebar-fill: rgba(15, 17, 23, var(--dsh-glass-alpha, 0.4)) !important;',
      '}',
      'body:not([data-ds-dark-theme]) {',
      '  --dsw-alias-bg-base: rgba(245, 246, 247, var(--dsh-glass-alpha, 0.4)) !important;',
      '  --dsw-alias-bg-layer-1: rgba(245, 246, 247, var(--dsh-glass-alpha, 0.4)) !important;',
      '  --dsw-specific-sidebar-fill: rgba(245, 246, 247, var(--dsh-glass-alpha, 0.4)) !important;',
      '}',
      // The glass tint itself lives on html: body must stay transparent so
      // the translucent panel tokens above reveal it (and the wallpaper).
      // Alpha 0.4 → panels ~40% translucent, alpha 1 → fully opaque, which
      // matches the fork's tint semantics.
      'html { background-color: color-mix(in srgb, #0d1117 calc(var(--dsh-glass-alpha, 0.4) * 100%), #14161a) !important; }',
      'body { background-color: transparent !important; }',
      // Wallpaper active: the z-index:-1 wallpaper layer paints above the html
      // background but below in-flow content; body transparency (already set
      // above) plus the translucent panels expose the wallpaper beneath.
      'body[data-dsh-glass-wallpaper="1"] { background-color: transparent !important; }',
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
    function loadAlpha() {
      try {
        var raw = localStorage.getItem(KEYS.alpha)
        if (raw !== null) {
          var n = Number(raw)
          if (n >= 0 && n <= 1) return n
        }
      } catch (e) {}
      return DEFAULT_ALPHA
    }
    function applyAlpha(value) {
      var root = document.documentElement
      root.style.setProperty('--dsh-glass-alpha', String(value))
      try { localStorage.setItem(KEYS.alpha, String(value)) } catch (e) {}
      // Re-bake the wallpaper mask with the new alpha so the slider stays
      // live while the wallpaper is active (body is transparent then).
      if (wallpaperUrl) { try { ensureWallpaperLayer() } catch (e) {} }
    }
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

    // ── 背景壁纸(搬运自 glass.ts wallpaperLayerScript;插件版差异:浏览器
    // 文件选择代替系统对话框,IndexedDB 代替磁盘。layer 背景双层:暗色遮罩
    // 压图上方保证文字可读性;body 用 data-dsh-glass-wallpaper 属性切换透明)──
    var WALL_ID = 'dsh-glass-wallpaper'
    var wallpaperUrl = null
    var wallpaperName = null
    var pickInput = null // singleton hidden file input, reused across picks
    function ensureWallpaperLayer() {
      var el = document.getElementById(WALL_ID)
      if (el === null) {
        el = document.createElement('div')
        el.id = WALL_ID
        el.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center;background-repeat:no-repeat;filter:blur(8px) brightness(0.72);transform:scale(1.06)'
        document.body.prepend(el)
      }
      if (wallpaperUrl) {
        // Mask follows the alpha slider (0.30-0.70, never fully opaque) so the
        // slider keeps working while the wallpaper is active — body itself is
        // transparent then and its color-mix tint is invisible.
        var a = loadAlpha() // 0.4-1
        var mask = Math.min(1, Math.max(0.3, a * 0.7)).toFixed(2)
        el.style.backgroundImage = 'linear-gradient(rgba(13,17,23,' + mask + '), rgba(13,17,23,' + mask + ')), url("' + wallpaperUrl + '")'
        document.body.setAttribute('data-dsh-glass-wallpaper', '1')
      } else {
        el.style.backgroundImage = 'none'
        document.body.removeAttribute('data-dsh-glass-wallpaper')
      }
    }
    function loadWallpaper() {
      return idbGet(KEYS.wallpaper).then(function (rec) {
        if (rec && typeof rec.url === 'string') {
          wallpaperUrl = rec.url
          wallpaperName = rec.name || null
          ensureWallpaperLayer()
        } else {
          wallpaperName = null
        }
        var n = document.querySelector('[data-dsh-wallpaper-name]')
        if (n) n.textContent = wallpaperName || ''
      }).catch(function () {})
    }
    function setWallpaper(url, name) {
      wallpaperUrl = url || null
      wallpaperName = url ? (name || null) : null
      ensureWallpaperLayer()
      if (!url) return idbDel(KEYS.wallpaper)
      return idbSet(KEYS.wallpaper, { url: url, name: name || '' })
    }

    // ── 光标特效(搬运自 glass.ts whaleSprayScript,ES5 化)──
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

      var canvas = document.createElement('canvas')
      canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482999'
      document.body.appendChild(canvas)
      var ctx = canvas.getContext('2d')
      if (ctx === null) { canvas.remove(); return }
      var resize = function () {
        canvas.width = innerWidth * devicePixelRatio
        canvas.height = innerHeight * devicePixelRatio
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      }
      resize()
      addEventListener('resize', resize)

      // Whale palette mirrors the ambient brand cycle.
      var WHALES = ['#4176e6', '#3b82f6', '#06b6d4', '#10b981', '#6366f1', '#0ea5e9', '#7b5cf0', '#f472b6']
      var whaleColor = function () {
        var rect = document.querySelector('[class*="_brand"] svg rect')
        if (rect !== null) {
          var f = rect.getAttribute('fill')
          if (f !== null && f !== 'currentColor') return f
        }
        return WHALES[Math.floor(Math.random() * WHALES.length)]
      }

      var triggerZone = function (x, y) {
        // 'sidebar' or 'center' when the point is a trigger area, else null.
        var sidebar = document.querySelector('[class*="_sidebarCol"]')
        var center = document.querySelector('[class*="_centerCol"]')
        var zone = null
        var zones = [[sidebar, 'sidebar'], [center, 'center']]
        for (var zi = 0; zi < zones.length; zi++) {
          var z = zones[zi]
          var cls = z[0]
          var name = z[1]
          if (cls === null) continue
          var r = cls.getBoundingClientRect()
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { zone = name; break }
        }
        if (zone === null) return null
        // Never over the composer input area itself.
        var seat = document.querySelector('[class*="_composerSeat"]')
        if (seat !== null) {
          var sr = seat.getBoundingClientRect()
          if (x >= sr.left && x <= sr.right && y >= sr.top && y <= sr.bottom) return null
        }
        // Skip actual message rows inside the scroll body.
        var under = document.elementFromPoint(x, y)
        if (under !== null) {
          for (var el = under; el !== null && el !== document.body; el = el.parentElement) {
            var c = String(el.className)
            if (/message|_turn|_row|_bubble|_msg|_item|markdown|_content/i.test(c) && el.closest('[class*="_scrollBody"]') !== null) {
              return null
            }
          }
        }
        return zone
      }

      // Particles: kind 'drop' (water), 'star', 'snow', 'spark'.
      var drops = []
      var MAX_DROPS = 160
      var pushDrop = function (d) {
        if (drops.length >= MAX_DROPS) drops.shift()
        drops.push(d)
      }
      var spawnWater = function (x, y, color) {
        for (var i = 0; i < 3; i++) {
          var ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.4
          var speed = 3 + Math.random() * 2
          pushDrop({ kind: 'drop', x: x + (Math.random() - 0.5) * 3, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 0, ttl: 420 + Math.random() * 180, size: 1.2 + Math.random(), color: color })
        }
        for (var i = 0; i < 2; i++) {
          var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4
          var speed = 1.4 + Math.random() * 1.6
          pushDrop({ kind: 'drop', x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 0, ttl: 460 + Math.random() * 180, size: 0.9 + Math.random() * 0.8, color: color })
        }
      }
      var spawnStars = function (x, y) {
        var hue = Math.floor(Math.random() * 360)
        var color = 'hsl(' + hue + ', 90%, 68%)'
        for (var i = 0; i < 2; i++) {
          var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2
          var speed = 0.7 + Math.random() * 1.2
          pushDrop({ kind: 'star', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 6, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 0, ttl: 700 + Math.random() * 300, size: 3 + Math.random() * 2.5, color: color, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.06 })
        }
      }
      var spawnSnow = function (x, y) {
        var color = 'rgba(255,255,255,' + (0.7 + Math.random() * 0.3).toFixed(2) + ')'
        for (var i = 0; i < 2; i++) {
          pushDrop({ kind: 'snow', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 0.4, vy: 0.4 + Math.random() * 0.6, life: 0, ttl: 900 + Math.random() * 500, size: 2.5 + Math.random() * 2, color: color, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.05 })
        }
      }
      var spawnSpark = function (x, y) {
        var hue = Math.floor(Math.random() * 60) // warm
        var color = 'hsl(' + hue + ', 95%, 62%)'
        for (var i = 0; i < 3; i++) {
          var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.8
          var speed = 1.5 + Math.random() * 2.5
          pushDrop({ kind: 'spark', x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 0, ttl: 380 + Math.random() * 240, size: 1 + Math.random() * 1.4, color: color })
        }
      }
      var drawStar = function (d) {
        var spikes = 5
        var outer = d.size
        var inner = outer * 0.4
        ctx.beginPath()
        for (var i = 0; i < spikes * 2; i++) {
          var r = i % 2 === 0 ? outer : inner
          var a = d.rot + (i * Math.PI) / spikes - Math.PI / 2
          var px = d.x + Math.cos(a) * r
          var py = d.y + Math.sin(a) * r
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
      }
      var drawSnow = function (d) {
        // Six-arm flake: three crossing lines.
        ctx.strokeStyle = d.color
        ctx.lineWidth = 1
        ctx.lineCap = 'round'
        for (var arm = 0; arm < 3; arm++) {
          var a = d.rot + (arm * Math.PI) / 3
          ctx.beginPath()
          ctx.moveTo(d.x - Math.cos(a) * d.size, d.y - Math.sin(a) * d.size)
          ctx.lineTo(d.x + Math.cos(a) * d.size, d.y + Math.sin(a) * d.size)
          ctx.stroke()
        }
      }
      var drawSpark = function (d) {
        ctx.strokeStyle = d.color
        ctx.lineWidth = 1.2
        ctx.lineCap = 'round'
        var a = Math.atan2(d.vy, d.vx)
        var len = d.size * 3
        ctx.beginPath()
        ctx.moveTo(d.x - Math.cos(a) * len, d.y - Math.sin(a) * len)
        ctx.lineTo(d.x, d.y)
        ctx.stroke()
      }

      var kindForZone = function (zone) { return zone === 'sidebar' ? cfg.sidebar : cfg.center }

      var raf = 0
      var running = false
      var lastT = 0
      var tick = function (now) {
        var dt = Math.min(32, now - (lastT || now))
        lastT = now
        for (var i = drops.length - 1; i >= 0; i--) {
          var d = drops[i]
          d.life += dt
          if (d.life >= d.ttl) { drops.splice(i, 1); continue }
          if (d.kind === 'snow') {
            d.x += d.vx * (dt / 16) + Math.sin((d.life + d.rot * 100) / 300) * 0.15
            d.y += d.vy * (dt / 16)
            d.rot += d.vr * (dt / 16)
          } else if (d.kind === 'star') {
            d.vy -= 0.008 * (dt / 16)
            d.rot += d.vr * (dt / 16)
            d.x += d.vx * (dt / 16)
            d.y += d.vy * (dt / 16)
          } else if (d.kind === 'spark') {
            d.vy += 0.06 * (dt / 16)
            d.x += d.vx * (dt / 16)
            d.y += d.vy * (dt / 16)
          } else {
            d.vy += 0.12 * (dt / 16)
            d.x += d.vx * (dt / 16)
            d.y += d.vy * (dt / 16)
          }
        }
        ctx.clearRect(0, 0, innerWidth, innerHeight)
        for (var di = 0; di < drops.length; di++) {
          var d = drops[di]
          var k = 1 - d.life / d.ttl
          ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.2))
          ctx.fillStyle = d.color
          if (d.kind === 'star') drawStar(d)
          else if (d.kind === 'snow') drawSnow(d)
          else if (d.kind === 'spark') drawSpark(d)
          else {
            ctx.beginPath()
            ctx.arc(d.x, d.y, d.size * (0.5 + 0.5 * k), 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.globalAlpha = 1
        if (drops.length > 0) {
          raf = requestAnimationFrame(tick)
        } else {
          running = false
          ctx.clearRect(0, 0, innerWidth, innerHeight)
        }
      }
      var lastX = -1
      var lastY = -1
      var onMove = function (e) {
        var x = e.clientX
        var y = e.clientY
        var zone = triggerZone(x, y)
        if (zone === null) return
        // Throttle: one burst per 40px of travel.
        if (Math.abs(x - lastX) + Math.abs(y - lastY) < 40) return
        lastX = x
        lastY = y
        var kind = kindForZone(zone)
        if (kind === 'none') return // that pane's effect is off
        var color = whaleColor()
        if (kind === 'star') spawnStars(x, y)
        else if (kind === 'snow') spawnSnow(x, y)
        else if (kind === 'spark') spawnSpark(x, y)
        else spawnWater(x, y, color)
        if (!running) {
          running = true
          lastT = performance.now()
          raf = requestAnimationFrame(tick)
        }
      }
      var onMovePaused = function (e) { if (!paused) onMove(e) }
      addEventListener('mousemove', onMovePaused)

      // Live reconfiguration from the settings toggle. Disabling pauses the
      // effect in place (canvas stays mounted, listeners stay registered) so
      // re-enabling works instantly without a page reload; a full reload still
      // re-runs this script from the persisted config.
      var paused = false
      var onFxChange = function (e) {
        var detail = e.detail
        if (!detail || typeof detail.enabled !== 'boolean') return
        if (detail.enabled === false) {
          paused = true
          drops.length = 0
          cancelAnimationFrame(raf)
          running = false
          ctx.clearRect(0, 0, innerWidth, innerHeight)
          return
        }
        paused = false
        if (typeof detail.sidebar === 'string') cfg.sidebar = detail.sidebar
        if (typeof detail.center === 'string') cfg.center = detail.center
        drops.length = 0
      }
      addEventListener('dsh-cursor-fx-change', onFxChange)

      var dispose = function () {
        removeEventListener('mousemove', onMovePaused)
        removeEventListener('resize', resize)
        removeEventListener('dsh-cursor-fx-change', onFxChange)
        cancelAnimationFrame(raf)
        canvas.remove()
      }
      return { dispose: dispose }
    }

    // ── 品牌色循环(移植自 glass.ts ambientStyleScript 的品牌色部分):每 10s
    //    轮换 whale 主色 + 渐变调色板,重绘左上角 wordmark 渐变、whale rect、
    //    侧边栏操作图标与折叠栏鱼图标。侧边栏折叠/展开切换时立即换色。──
    var BRAND_WHALES = ['#4176e6', '#3b82f6', '#06b6d4', '#10b981', '#6366f1', '#0ea5e9', '#7b5cf0', '#f472b6']
    var BRAND_GRADS = [
      ['#4176e6', '#7b5cf0', '#22d3ee'],
      ['#4176e6', '#06b6d4', '#34d399'],
      ['#6366f1', '#a855f7', '#f472b6'],
      ['#0ea5e9', '#4176e6', '#8b5cf6'],
    ]
    var BRAND_GRAD_ID = 'dsh-logo-grad'
    function loadBrandCycle() {
      try {
        var raw = localStorage.getItem(KEYS.brandCycle)
        if (raw === 'false' || raw === 'true') return raw === 'true'
      } catch (e) {}
      return DEFAULT_BRAND_CYCLE
    }
    function startBrandCycle() {
      var whaleColor = BRAND_WHALES[Math.floor(Math.random() * BRAND_WHALES.length)]
      var gradColors = BRAND_GRADS[Math.floor(Math.random() * BRAND_GRADS.length)]
      var lastAppliedGrad = ''
      var lastAppliedWhale = ''

      var ensureLogoStructure = function () {
        var svg = document.querySelector('[class*="_brand"] svg')
        if (svg === null) return
        var grad = svg.querySelector('linearGradient[id="' + BRAND_GRAD_ID + '"]')
        if (grad !== null) {
          // Gradient survives, but re-render may have reset letter fills to
          // currentColor; repoint them regardless.
          var paths = svg.querySelectorAll('path[fill="currentColor"]')
          for (var pi = 0; pi < paths.length; pi++) paths[pi].setAttribute('fill', 'url(#' + BRAND_GRAD_ID + ')')
          return
        }
        var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
        var newGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
        newGrad.id = BRAND_GRAD_ID
        newGrad.setAttribute('x1', '0')
        newGrad.setAttribute('y1', '0')
        newGrad.setAttribute('x2', '1')
        newGrad.setAttribute('y2', '0')
        defs.appendChild(newGrad)
        svg.insertBefore(defs, svg.firstChild)
        var letterPaths = svg.querySelectorAll('path[fill="currentColor"]')
        for (var li = 0; li < letterPaths.length; li++) letterPaths[li].setAttribute('fill', 'url(#' + BRAND_GRAD_ID + ')')
      }

      var applyLogo = function () {
        var svg = document.querySelector('[class*="_brand"] svg')
        if (svg === null) return
        var grad = svg.querySelector('linearGradient[id="' + BRAND_GRAD_ID + '"]')
        if (grad === null) {
          lastAppliedGrad = ''
          ensureLogoStructure()
          grad = svg.querySelector('linearGradient[id="' + BRAND_GRAD_ID + '"]')
          if (grad === null) return
        }
        var gradKey = gradColors.join('|')
        if (gradKey === lastAppliedGrad && whaleColor === lastAppliedWhale && grad.firstChild !== null) return
        while (grad.firstChild !== null) grad.removeChild(grad.firstChild)
        for (var si = 0; si < gradColors.length; si++) {
          var stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
          stop.setAttribute('offset', String((si * 100) / (gradColors.length - 1)) + '%')
          stop.setAttribute('stop-color', gradColors[si])
          grad.appendChild(stop)
        }
        var rects = svg.querySelectorAll('rect')
        for (var ri = 0; ri < rects.length; ri++) {
          if (rects[ri].getAttribute('fill') !== whaleColor) rects[ri].setAttribute('fill', whaleColor)
        }
        lastAppliedGrad = gradKey
        lastAppliedWhale = whaleColor
      }

      var applyRailFish = function () {
        var fish = document.querySelector('[class*="_railFish"]')
        if (fish === null) return
        var paths = fish.querySelectorAll('path')
        for (var fi = 0; fi < paths.length; fi++) {
          if (paths[fi].getAttribute('fill') !== whaleColor) paths[fi].setAttribute('fill', whaleColor)
        }
      }

      var applySidebarIcons = function () {
        var col = document.querySelector('[class*="_sidebarCol"]')
        if (col === null) return
        var els = col.querySelectorAll('button, [class*="_iconButton"], [class*="_icon"]')
        for (var ei = 0; ei < els.length; ei++) {
          var el = els[ei]
          if (el.closest('[class*="_overlay"], [class*="_modal"], [class*="_panel"], [class*="_dialog"]') !== null) continue
          var inRail = el.closest('[class*="_rail"]') !== null
          var label = el.getAttribute('aria-label') || ''
          var skip = (!inRail && (label.indexOf('添加工作区') !== -1 || label.indexOf('Add workspace') !== -1)) || (!inRail && el.closest('[class*="_sectionHeader"]') !== null)
          if (skip) {
            if (el.style.color !== '') el.style.color = ''
            continue
          }
          var svg = el.querySelector(':scope > svg')
          if (svg === null || svg.querySelector('path, rect, circle') === null) continue
          if (el.style.color !== whaleColor) el.style.color = whaleColor
        }
      }

      var applyAll = function () {
        applyLogo()
        applyRailFish()
        applySidebarIcons()
      }

      var lastBrandColorChange = 0
      var cycleBrandColors = function () {
        var now = Date.now()
        if (now - lastBrandColorChange < 10000) return
        lastBrandColorChange = now
        whaleColor = BRAND_WHALES[Math.floor(Math.random() * BRAND_WHALES.length)]
        gradColors = BRAND_GRADS[Math.floor(Math.random() * BRAND_GRADS.length)]
        applyAll()
      }
      var forceBrandColorChange = function () {
        lastBrandColorChange = Date.now()
        whaleColor = BRAND_WHALES[Math.floor(Math.random() * BRAND_WHALES.length)]
        gradColors = BRAND_GRADS[Math.floor(Math.random() * BRAND_GRADS.length)]
        applyAll()
      }

      // 1s 心跳检查 10s 周期(fork 同款:折叠切换靠 observer 立即换色,普通轮换
      // 由心跳驱动,避免常驻 setInterval 高频刷新)。
      var timer = setInterval(cycleBrandColors, 1000)
      var lastRailPresent = document.querySelector('[class*="_railFish"]') !== null

      // 自愈:侧边栏重建时重挂渐变/重绘图标;折叠切换立即换色。rAF 节流合并
      // SPA 高频 DOM 抖动(fork 已验证:同步 query 会让渲染器打满 CPU)。
      var obsScheduled = false
      var obsTick = function () {
        obsScheduled = false
        var styleTag = document.getElementById(STYLE_ID)
        if (styleTag === null) ensureStyle()
        ensureLogoStructure()
        applyAll()
      }
      var obs = new MutationObserver(function () {
        var brandSvg = document.querySelector('[class*="_brand"] svg')
        if (brandSvg !== null && brandSvg.querySelector('linearGradient[id="' + BRAND_GRAD_ID + '"]') === null) {
          ensureLogoStructure()
          lastAppliedGrad = ''
          applyLogo()
        }
        var railPresent = document.querySelector('[class*="_railFish"]') !== null
        if (railPresent !== lastRailPresent) {
          lastRailPresent = railPresent
          forceBrandColorChange()
        }
        if (obsScheduled) return
        obsScheduled = true
        requestAnimationFrame(obsTick)
      })
      obs.observe(document.body, { childList: true, subtree: true })
      ensureLogoStructure()
      applyAll()

      return {
        dispose: function () {
          clearInterval(timer)
          obs.disconnect()
        },
      }
    }

    // ── 主题设置页 ────────────────────────────────────────
    function AlphaSlider() {
      // Initialized once from storage and not re-rendered (controlled-but-static):
      // the label is updated imperatively in set(), so a future state addition
      // must not re-create this component on every change.
      var value = loadAlpha()
      var set = function (ev) {
        var v = Number(ev.target.value)
        applyAlpha(v)
        var label = ev.currentTarget.parentNode.querySelector('[data-dsh-alpha-value]')
        if (label) label.textContent = Math.round(v * 100) + '%'
      }
      return h('div', { 'data-dsh-alpha': '', style: { padding: '14px 0', borderBottom: '1px solid rgba(128,132,142,0.16)' } },
        h('div', { style: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' } }, '背景透明度'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' } },
          h('input', {
            type: 'range', min: '0', max: '1', step: '0.05',
            defaultValue: String(value),
            onChange: set,
            style: { flex: '1', cursor: 'pointer' },
          }),
          h('span', { 'data-dsh-alpha-value': '', style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', minWidth: '44px', textAlign: 'right' } },
            Math.round(value * 100) + '%'),
        ),
      )
    }

    function CursorFxControl() {
      var fx = loadFx()
      var update = function (patch) {
        var next = Object.assign({}, fx, patch)
        fx = next
        try { localStorage.setItem(KEYS.cursorFx, JSON.stringify(next)) } catch (e) {}
        window.dispatchEvent(new CustomEvent('dsh-cursor-fx-change', { detail: next }))
        if (next.enabled && fxState === null) {
          try { fxState = startCursorFx() } catch (e2) { console.warn('[dsh-glass] cursor fx restart failed', e2) }
        }
      }
      var modeOpts = function (value) {
        var opts = [['star', '星光'], ['water', '水滴'], ['snow', '飘雪'], ['spark', '火花'], ['none', '关闭']]
        var out = []
        for (var oi = 0; oi < opts.length; oi++) {
          var o = opts[oi]
          out.push(h('option', { value: o[0] }, o[1]))
        }
        return out
      }
      return h('div', { 'data-dsh-cursor-fx': '', style: { padding: '14px 0', borderBottom: '1px solid rgba(128,132,142,0.16)' } },
        h('div', { style: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' } }, '光标特效'),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '4px' } },
          h('input', { type: 'checkbox', defaultChecked: fx.enabled, onChange: function (e) { update({ enabled: e.target.checked }) }, style: { width: '15px', height: '15px', accentColor: '#4176e6', cursor: 'pointer' } }),
          '启用光标特效'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' } },
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', minWidth: '52px' } }, '侧边栏'),
          h('select', { defaultValue: fx.sidebar, onChange: function (e) { update({ sidebar: e.target.value }) }, style: { flex: '1', background: 'rgb(39,46,62)', color: 'var(--dsw-alias-label-primary)', border: 'none', borderRadius: '18px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', outline: 'none' } },
            modeOpts(fx.sidebar))),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' } },
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', minWidth: '52px' } }, '右侧'),
          h('select', { defaultValue: fx.center, onChange: function (e) { update({ center: e.target.value }) }, style: { flex: '1', background: 'rgb(39,46,62)', color: 'var(--dsw-alias-label-primary)', border: 'none', borderRadius: '18px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', outline: 'none' } },
            modeOpts(fx.center))),
      )
    }

    function WallpaperControl() {
      var pick = function () {
        if (pickInput === null) {
          pickInput = document.createElement('input')
          pickInput.type = 'file'
          pickInput.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/bmp'
          pickInput.style.display = 'none'
          document.body.appendChild(pickInput)
        }
        pickInput.onchange = function () {
          var file = pickInput.files && pickInput.files[0]
          if (!file) return
          pickInput.value = '' // allow re-picking the same file next time
          if (file.size > 12 * 1024 * 1024) { alert('图片过大,请选择 ≤12 MiB 的图片'); return }
          if (!/^image\//.test(file.type)) { alert('请选择图片文件'); return }
          var reader = new FileReader()
          reader.onload = function () {
            setWallpaper(String(reader.result), file.name).catch(function (e) { alert('保存壁纸失败: ' + e) })
            var n = document.querySelector('[data-dsh-wallpaper-name]')
            if (n) n.textContent = file.name
          }
          reader.onerror = function () { alert('读取图片失败') }
          reader.readAsDataURL(file)
        }
        pickInput.click()
      }
      var clear = function () {
        setWallpaper(null, null).catch(function () {})
        var n = document.querySelector('[data-dsh-wallpaper-name]')
        if (n) n.textContent = ''
      }
      return h('div', { 'data-dsh-wallpaper': '', style: { padding: '14px 0', display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { style: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' } }, '背景壁纸'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('button', { onClick: pick, style: { background: '#4176e6', color: '#fff', border: 'none', borderRadius: '16px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' } }, '选择壁纸…'),
          h('button', { onClick: clear, style: { background: 'transparent', color: 'var(--dsw-alias-label-primary)', border: '1px solid rgba(65,118,230,0.4)', borderRadius: '16px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' } }, '移除'),
        ),
        h('div', { 'data-dsh-wallpaper-name': '', style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, wallpaperName || ''),
      )
    }

    function BrandCycleControl() {
      var update = function (e) {
        var on = e.target.checked
        try { localStorage.setItem(KEYS.brandCycle, on ? 'true' : 'false') } catch (err) {}
        if (on && brandHandle === null) {
          try { brandHandle = startBrandCycle() } catch (err2) { console.warn('[dsh-glass] brand cycle restart failed', err2) }
        } else if (!on && brandHandle !== null) {
          try { brandHandle.dispose() } catch (err3) {}
          brandHandle = null
        }
      }
      return h('div', { 'data-dsh-brand-cycle': '', style: { padding: '14px 0' } },
        h('div', { style: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' } }, '品牌色循环'),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', cursor: 'pointer', marginTop: '4px' } },
          h('input', { type: 'checkbox', defaultChecked: loadBrandCycle(), onChange: update, style: { width: '15px', height: '15px', accentColor: '#4176e6', cursor: 'pointer' } }),
          '10 秒自动切换品牌色(logo / 侧边栏图标 / 折叠栏)'),
      )
    }

    function SettingsPage(props) {
      return h('div', { 'data-dsh-glass-page': '' },
        h('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '12px' } },
          '玻璃主题设置 · Glass theme settings (v' + VERSION + ')'),
        h(WallpaperControl),
        h(AlphaSlider),
        h(CursorFxControl),
        h(BrandCycleControl),
      )
    }

    // ── 输入历史(↑/↓ 召回,Enter 记录;源见 Deepseek-Harness inputHistoryScript,
    //    去掉了依赖 preload 桥的 /backup 命令分支)──
    var HISTORY_MAX = 50
    function loadHistory() {
      var history = []
      try {
        var raw = localStorage.getItem(KEYS.inputHistory)
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
        return t.dataset.dshHistory === undefined && !t.classList.contains('xterm-helper-textarea') && (t.placeholder || '').trim() !== ''
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
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
        var text = e.target.value.trim()
        if (text !== '' && historyState.history[historyState.history.length - 1] !== text) {
          historyState.history.push(text)
          if (historyState.history.length > HISTORY_MAX) historyState.history = historyState.history.slice(-HISTORY_MAX)
          try { localStorage.setItem(KEYS.inputHistory, JSON.stringify(historyState.history)) } catch (e2) {}
        }
        historyState.idx = -1
      }
    }
    function startInputHistory() {
      var attach = function () {
        var input = findInput()
        // findInput may return undefined (not null) when no composer exists
        // yet — guard truthiness, not null.
        if (input && input.dataset.dshGlassHistory === undefined) {
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
          if (input) input.removeEventListener('keydown', onHistoryKey)
        },
      }
    }

    // ── 挂载 ──────────────────────────────────────────────
    function apply(ctx) {
      try { ensureStyle() } catch (e) { console.warn('[dsh-glass] style inject failed', e) }
      try { applyAlpha(loadAlpha()) } catch (e) { console.warn('[dsh-glass] alpha init failed', e) }
      try { fxState = startCursorFx() } catch (e) { console.warn('[dsh-glass] cursor fx failed', e) }
      try { historyHandle = startInputHistory() } catch (e) { console.warn('[dsh-glass] input history failed', e) }
      try { loadWallpaper() } catch (e) { console.warn('[dsh-glass] wallpaper load failed', e) }
      try { if (loadBrandCycle()) brandHandle = startBrandCycle() } catch (e) { console.warn('[dsh-glass] brand cycle failed', e) }
      ctx.effect(function () {
        return function () {
          var tag = document.getElementById(STYLE_ID)
          if (tag) tag.remove()
          if (fxState && fxState.dispose) { try { fxState.dispose() } catch (e) {} }
          if (historyHandle && historyHandle.dispose) { try { historyHandle.dispose() } catch (e) {} }
          if (brandHandle && brandHandle.dispose) { try { brandHandle.dispose() } catch (e) {} }
          var wall = document.getElementById(WALL_ID)
          if (wall) wall.remove()
          document.body.removeAttribute('data-dsh-glass-wallpaper')
        }
      }, 'dsh-glass: styles + fx + history + brand')

      var slots = ctx.slots
      if (!slots) { console.warn('[dsh-glass] slots service unavailable'); return }
      try {
        slots.inject('settings.section', function () {
          return slots.register(
            { name: 'settings.section', id: 'dsh-glass-theme', order: 30, label: function () { return '主题设置' } },
            function (props) { return h(SettingsPage, { close: props && props.close }) }
          )
        })
      } catch (e) { console.warn('[dsh-glass] slot registration failed', e) }
      console.log('[dsh-glass] client ready')
    }

    // Declare the services this bundle consumes (cordis inject contract).
    // NOTE: keep on the same object as apply — cordis feeds module.exports
    // into ctx.registry.plugin(), and a later reassignment would drop inject.
    module.exports = { apply: apply, name: 'dsh-glass-theme', version: VERSION, inject: ['slots'] }
    return module.exports
  },
})
