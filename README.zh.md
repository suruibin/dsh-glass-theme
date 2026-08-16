# dsh-glass-theme

玻璃主题插件 · Glass theme plugin for DeepSeek Harness(DSH)。

## 功能

- **主题设置页**(设置 → 主题设置):
  - 玻璃主题效果总开关:关闭后透明面板 / 壁纸全部失效,恢复原生外观,便于使用其他皮肤(如皮肤中心)
  - 背景透明度滑块(0–100%)
  - 光标特效:启用开关 + 侧边栏/右侧两栏模式(星光/水滴/飘雪/火花/关闭)
  - 背景壁纸:浏览器选择图片(≤12 MiB),底层模糊铺满,「移除」恢复
  - 品牌色循环:启用开关 + 间隔可调(3–300 秒,默认 10 秒)
- **玻璃 UI 样式**:噪点纹理、品牌蓝光晕、浮动圆角侧边栏、细滚动条
- **输入历史**:输入框 ↑/↓ 回看已发送内容,Enter 记录(上限 50 条,IME 组合期间不误记)

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
| 玻璃主题效果开关 | localStorage `dsh-glass.enabled` |
| 背景透明度 | localStorage `dsh-glass.alpha` |
| 光标特效 | localStorage `dsh-glass.cursorFx` |
| 输入历史 | localStorage `dsh-glass.inputHistory` |
| 背景壁纸 | IndexedDB `dsh-glass` / kv |
| 品牌色循环开关 | localStorage `dsh-glass.brandCycle` |
| 品牌色循环间隔 | localStorage `dsh-glass.brandInterval` |

## 开发

```bash
node --test tests/client.spec.mjs   # 纯 Node 校验(bundle 语法 + 声明一致性)
```

无构建步骤——`lib/client.js` 是手写 `__ModuleLoader__` bundle,直接随包分发。

## 已知取舍

- **壁纸可见范围**:DSH 的侧边栏/对话区/详情面板背景为不透明变量,壁纸主要露出于卡片间隙与未覆盖区(浮动玻璃卡 + tinted canvas 设计),不追求"整窗透壁纸"。
- **光标特效取色**:官方 DSH 的品牌 SVG 无 rect 元素,粒子颜色走随机调色板(不再镜像品牌色),视觉协调但不精确跟随主题。

## 与 Electron 桌面版(Deepseek-Harness fork)的差异

- 壁纸选择:浏览器原生文件选择(非系统对话框),存 IndexedDB(非磁盘)
- 无终端 dock / 文件浏览器(依赖 Electron 主进程能力)
- 输入历史不含 /backup 命令拦截(依赖 preload 桥)
