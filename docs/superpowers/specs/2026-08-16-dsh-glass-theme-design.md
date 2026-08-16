# dsGlass — DSH 玻璃主题插件 设计文档

日期:2026-08-16
状态:已批准(用户确认方案 A)

## 1. 背景与目标

Deepseek-Harness(`/projects/Deepseek-Harness`)是一套 fork DSH 后的 Electron 桌面壳,通过
`webContents.executeJavaScript` 向托管页面注入了一批 UI 增强(玻璃样式、背景透明度、光标特效、
背景壁纸、输入历史、终端 dock、文件浏览器等)。这些注入代码直接耦合在 fork 的 `src/glass.ts`,
升级 DSH 或改用官方安装时无法复用。

本次目标:**把这些前端可移植的增强抽成一个标准 DSH 客户端插件**,以独立 npm 包形式存在,
可通过 `dsh plugin --profile web add` 安装进官方 DSH(web profile),无需 fork、无需改宿主代码。

### 范围(用户确认)

| 功能 | 是否纳入 |
|---|---|
| 主题设置四件套(背景透明度、光标特效、背景壁纸、主题设置入口) | ✅ |
| 玻璃 UI 样式(品牌蓝、圆角卡片、噪点纹理、细滚动条) | ✅ |
| 输入历史(↑/↓ 导航 + Enter 记录) | ✅ |
| 终端 dock / 文件浏览器 | ❌ 依赖 Electron 主进程,标准插件无法承载 |

## 2. 形态决策

- **方案 A(选定):纯客户端插件,手写 `__ModuleLoader__` bundle**
  - 仿照已安装插件 `@a9i5k4/dsh-auto-memory` 的 `lib/client.js` 模式。
  - 零构建依赖:手写 factory bundle,不使用 tsdown/React 组件库。
  - 设置入口用官方插槽 `settings.section`,不再需要 fork 版里"注入 nav 按钮 +
    MutationObserver 自愈 + 隐藏原生内容"的整套 hack。
- 方案 B(未选):tsdown + `@deepseek-ai/dsh-client-ui-primitives` 组件库,UI 与官方设置页
  视觉一致,但为小插件引入完整 React 构建链。
- 方案 C(未选):`dsh.bundle.patch` + 主进程路由,壁纸可写磁盘,但依赖 DSH 主进程扩展点
  成熟度,工作量与 web 部署受限。

## 3. 架构

### 3.1 项目结构

```
dsh-glass-theme/
├── package.json          # npm 包声明:dsh.bundle.patch + dsh.client.inject
├── cordis.patch.yml      # insert: id: dsh-glass(挂进 profile 层栈)
├── lib/
│   ├── client.js         # 手写 __ModuleLoader__ bundle(全部前端功能)
│   └── index.js          # 主进程侧占位(空导出,将来壁纸落盘扩展点)
├── README.zh.md          # 安装/使用说明
└── tests/
    └── client.spec.mjs   # 纯 Node 校验:bundle 语法 + 配置常量 + 插槽声明
```

### 3.2 插件声明(package.json)

```jsonc
{
  "name": "dsh-glass-theme",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js",
               "./package.json": "./package.json" },
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

注入模块集合沿用 auto-memory 已验证清单。

### 3.3 cordis.patch.yml

```yaml
# dsh glass theme bundle patch: inserts this plugin into a profile's layer stack.
- insert:
    - id: dsh-glass
      name: 'dsh-glass-theme'
```

## 4. 组件与数据流

### 4.1 client.js(factory bundle,单文件)

`window.__ModuleLoader__.load({ id: 'dsh-glass', factory: (require) => {...} })`,
factory 内部 `require('react')` + `createElement` 手写组件(同 auto-memory 模式)。

注册一个插槽 + 两处直接注入:

1. **`settings.section`** — 「主题设置」设置页,包含:
   - 背景透明度滑块(range 0.4–1,step 0.05),实时应用到根元素 `--dsh-glass-alpha`
     变量并写 localStorage;
   - 光标特效:开关 + 侧边栏/右侧两栏模式 select(star/water/mixed),沿用 whaleSpray
     canvas 粒子逻辑;
   - 背景壁纸:「选择壁纸…」按钮 → 隐藏 `<input type="file" accept="image/*">` →
     FileReader 读 data URL → IndexedDB 存储 → 注入 `#dsh-glass-wallpaper`
     底层模糊层;「移除」按钮清空。
2. **玻璃样式注入** — 不依赖设置页:apply 时直接向 `document.head` 注入 `<style>`
   (噪点纹理、品牌蓝光晕、圆角侧边栏、细滚动条),SPA 重建时自愈(轻量 observer,
   复用 fork 版已验证的 childList 方案)。
3. **输入历史** — 不依赖设置页:事件委托监听 `textarea` keydown,↑/↓ 导航 + Enter
   记录。

### 4.2 持久化键

| 键 | 内容 | 载体 |
|---|---|---|
| `dsh-glass.alpha` | 背景透明度 number(0.4–1) | localStorage |
| `dsh-glass.cursorFx` | `{ enabled, sidebar, center }` | localStorage |
| `dsh-glass.wallpaper` | 壁纸 data URL + 文件名 | IndexedDB(单个对象,data URL 可能 >5MB) |
| `dsh-glass.inputHistory` | 最近 50 条输入 | localStorage |

### 4.3 数据流

```
设置页 UI 事件 ──> 写 localStorage / IndexedDB
                   ──> 广播 theme 服务 setTheme / 直接改 DOM 变量
设置页打开 ──> 读持久化值填充控件
页面加载 ──> apply() 读持久化值,应用玻璃样式 + 壁纸层 + 光标特效 + 输入历史监听
```

## 5. 与 fork 版 (Deepseek-Harness) 的实现差异

| 项 | fork 版 | 插件版 |
|---|---|---|
| 设置入口 | 注入 nav 按钮 + 隐藏原生内容 + 自愈 observer | 官方 `settings.section` 插槽 |
| 壁纸选择 | Electron 系统文件对话框(preload 桥) | 浏览器 `<input type="file">` |
| 壁纸存储 | userData 磁盘文件 + data URL | IndexedDB 二进制 |
| 输入历史 | 含 `/backup` 命令拦截(依赖 preload 桥) | 去掉,仅保留 ↑/↓ 导航 + 记录 |
| 玻璃样式 | `ambientStyleScript` 注入 `<style>` | 同逻辑,apply 时注入 `<style>` |
| 透明度 | 主进程 glassWindowOptions + 注入脚本改变量 | 纯前端 CSS 变量 |

## 6. 错误处理与边界

- 壁纸文件:限制 ≤12MiB 与 image/* 类型,读取失败提示;IndexedDB 不可用时降级
  localStorage(data URL 超限则拒绝并提示)。
- 光标特效:canvas 上下文不可得时静默降级(不创建特效层);页面结构 class 变化时
  以兜底默认值运行。
- 输入历史:localStorage 解析失败回退空数组;React 受控 textarea 用原生 setter +
  input 事件同步(沿用 fork 版已验证方案)。
- 设置页组件渲染失败:捕获并仅影响本插件的 section,不影响宿主其他 UI。

## 7. 测试策略

1. `tests/client.spec.mjs`(纯 Node,无浏览器):
   - `new Function(bundle)` 语法校验;
   - 断言配置常量(DEFAULT_ALPHA=0.4、键名、IDB 键);
   - 断言 `dsh.client.inject` 声明与 `cordis.patch.yml` 内容一致。
2. 手工/CDP 验证(在调试实例的页面注入 client.js):
   - 设置页出现「主题设置」项,点击可打开;
   - 滑块拖动 → 页面玻璃透明度变化 + 刷新后保持;
   - 光标特效开关/模式切换生效;
   - 选壁纸 → 底层模糊层出现,刷新保持;
   - 输入框 ↑/↓ 历史导航;
   - 玻璃样式(噪点/光晕/圆角侧边栏)注入生效。
3. 真实安装验证:`dsh plugin --profile web add <路径>`,重启后走完整 UI 流程。

## 8. 交付标准(怎么算搞定)

- 独立 git 仓库 `/projects/dsh-glass-theme`,含上述文件;
- `tests/client.spec.mjs` 通过;
- 在调试实例页面注入验证 5 项功能全部生效;
- 可选:`dsh plugin --profile web add` 真实安装一次并验证;
- README.zh.md 写明安装方式与功能清单。

## 9. 暂不做(YAGNI)

- 终端 dock / 文件浏览器(Electron 主进程能力);
- 壁纸落盘到磁盘(等 DSH 主进程扩展点成熟,`lib/index.js` 预留);
- 主题色循环(品牌蓝光晕为静态层,避免渲染器 CPU 问题)。
