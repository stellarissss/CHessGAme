# Xiangqi Board Web Component 重构计划

## 概述

将 `/workspace/xiangqi/static/app.js` 中的 `const App = { ... }` 对象字面量重构为 `export class XiangqiBoard extends HTMLElement`，实现 Shadow DOM 样式隔离，支持属性配置和自定义事件。

## 文件信息

- **源文件**: `/workspace/xiangqi/static/app.js` (约 1818 行)
- **样式文件**: `/workspace/xiangqi/static/style.css` (约 2136 行)
- **HTML 模板**: `/workspace/xiangqi/static/index.html`

## 重构内容

### 1. 类定义与生命周期

- 创建 `export class XiangqiBoard extends HTMLElement`
- `connectedCallback()`: 连接到 DOM 时调用，attach Shadow DOM，注入 HTML 和样式，绑定事件
- `disconnectedCallback()`: 从 DOM 移除时调用 `destroy()`
- `static get observedAttributes()`: 监听 `api-base`, `rpg-mode`, `player-side` 属性变化
- `attributeChangedCallback(name, oldVal, newVal)`: 属性变化时更新

### 2. Shadow DOM 与 HTML 注入

在 `connectedCallback()` 中：
- 调用 `this.attachShadow({ mode: 'open' })`
- 将 index.html 中 `#app` 内的完整 HTML 结构注入 shadow root
- 注入 `<style>` 标签包含 style.css 内容
- 移除 `@import url()` 外部字体引用（保留 @font-face，Shadow DOM 可继承主文档字体）

### 3. 属性配置

| 属性名 | Attribute | 默认值 | 说明 |
|--------|-----------|--------|------|
| `apiBase` | `api-base` | `''` (相对路径) | API 基础路径前缀 |
| `rpgMode` | `rpg-mode` | `false` | RPG 模式下隐藏 side-panel 和 input-section |
| `playerSide` | `player-side` | `'red'` | 玩家方 |

### 4. 公开方法

| 方法名 | 返回值 | 说明 |
|--------|--------|------|
| `init()` | `Promise<void>` | 初始化，加载配置并渲染，完成后派发 `ready` 事件 |
| `applyCheatPatch(modifiedConfigs)` | `Promise<void>` | 调用 POST `/api/config/update` 更新配置，重新加载并重渲染 |
| `getBoardSnapshot()` | `{ boardState, configs }` | 返回当前棋盘状态和配置快照 |
| `resetBoard()` | `Promise<void>` | 调用重置 API 后重新加载 |
| `destroy()` | `void` | 清理定时器、移除事件监听 |

### 5. 自定义事件

| 事件名 | 触发时机 | detail 内容 |
|--------|----------|-------------|
| `ready` | init 完成后 | - |
| `move` | 每次走棋完成后 | `{ captured, mover, is_check, game_ended, winner, is_five_in_a_row: false, go_captures: 0 }` |
| `gameend` | 游戏结束时 | `{ winner, win_condition }` |
| `error` | 错误时 | `{ message, error }` |

### 6. DOM 查询替换

所有 `document.xxx` 改为 `this.shadowRoot.xxx`：
- `document.getElementById(id)` → `this.shadowRoot.getElementById(id)`
- `document.querySelectorAll(sel)` → `this.shadowRoot.querySelectorAll(sel)`
- `document.querySelector(sel)` → `this.shadowRoot.querySelector(sel)`
- `document.head.appendChild(styleEl)` → `this.shadowRoot.appendChild(styleEl)`

### 7. 内联事件绑定迁移

需要从 HTML 内联 `onclick="App.xxx()"` 改为 JS 绑定的事件：

| 位置 | 原内联事件 | 迁移方式 |
|------|-----------|----------|
| 机制截停按钮 | `onclick="App.stopMechanism(...)"` | 在 `updateMechanisms()` 渲染后用 querySelectorAll 绑定 |
| 游戏结束重开按钮 | `onclick="App.restart()"` | 在 `showGameOver()` 创建元素后绑定 |

### 8. fetch URL 前缀

所有 fetch 请求 URL 前加上 `this.apiBase`：
- `/api/config/all` → `${this.apiBase}/api/config/all`
- `/api/token_stats` → `${this.apiBase}/api/token_stats`
- `/api/valid_moves` → `${this.apiBase}/api/valid_moves`
- `/api/move` → `${this.apiBase}/api/move`
- `/api/ai_move` → `${this.apiBase}/api/ai_move`
- `/api/command` → `${this.apiBase}/api/command`
- `/api/thinking_status` → `${this.apiBase}/api/thinking_status`
- `/api/logs` → `${this.apiBase}/api/logs`
- `/api/clear_logs` → `${this.apiBase}/api/clear_logs`
- `/api/stop_mechanism` → `${this.apiBase}/api/stop_mechanism`
- `/api/mechanisms` → `${this.apiBase}/api/mechanisms`
- `/api/restart` → `${this.apiBase}/api/restart`
- `/api/apikey/status` → `${this.apiBase}/api/apikey/status`
- `/api/apikey` → `${this.apiBase}/api/apikey`
- `/api/difficulty` → `${this.apiBase}/api/difficulty`
- `/api/undo` → `${this.apiBase}/api/undo`
- `/api/undo_config` → `${this.apiBase}/api/undo_config`
- `/api/reset_configs` → `${this.apiBase}/api/reset_configs`

### 9. RPG 模式处理

在 `connectedCallback()` 和 `attributeChangedCallback()` 中：
- 当 `rpgMode` 为 true 时，给 shadow root 根元素添加 `rpg-mode` class
- CSS 中通过 `.rpg-mode .side-panel, .rpg-mode .input-section { display: none; }` 隐藏

### 10. move 事件派发

在 `executeMove()` 和 `makeAIMove()` 中，走棋完成后：
- 从 `boardState.move_history` 最后一项提取 `captured`
- `mover` 根据 `boardState.current_turn` 的反方向判断（刚走完的一方）
- 从 `game_status` 提取 `game_ended`, `winner`
- 派发 `move` 事件
- 如果游戏结束，额外派发 `gameend` 事件

### 11. 样式 CSS 变量

Shadow DOM 中 `:root` 选择器改为 `:host`，确保 CSS 变量正确作用于组件。

## 实施步骤

1. 读取完整的 app.js、style.css、index.html
2. 创建类框架：类定义、constructor、connectedCallback、disconnectedCallback
3. 定义 HTML 模板字符串（从 index.html 提取 #app 内部结构）
4. 定义 CSS 模板字符串（从 style.css 提取，调整 :root 为 :host）
5. 实现 Shadow DOM 注入
6. 迁移所有 App 对象属性为类实例属性
7. 迁移所有 App 方法为类方法
8. 替换所有 document 查询为 shadowRoot 查询
9. 替换所有 fetch URL 为带 apiBase 前缀
10. 实现内联事件迁移（stopMechanism、restart）
11. 实现公开方法：init(), applyCheatPatch(), getBoardSnapshot(), resetBoard(), destroy()
12. 实现自定义事件派发：ready, move, gameend, error
13. 实现属性观察和 RPG 模式
14. 注册 customElements.define('xiangqi-board', XiangqiBoard)
15. 导出类

## 注意事项

- `document.documentElement.style.setProperty('--board-bg', ...)` 需要改为在 shadow root 内设置变量
- `document.addEventListener('keydown', ...)` 需要保留（ESC 键监听），但在 destroy 中移除
- `window.location.reload()` 在 `sendCommand()` 中保留（D2 类 HTML 修改刷新）
- 保持所有原有功能不变
- 确保 `this` 引用正确（箭头函数或 bind）
- `_isCurrentTurnPlayerControlled()` 等内部方法中对 `player_side` 的判断需要引用 `this.playerSide`
- `applyUiConfig()` 中创建的 `custom-ui-css` style 元素需要插入到 shadow root 而非 document.head
