# 五子棋 Web Component 重构计划

## 目标

将 `/workspace/wuziqi/static/app.js` 从对象字面量 `const App = { ... }` 重构为 `export class WuziqiBoard extends HTMLElement`，实现 Shadow DOM 样式隔离，参考 `/workspace/xiangqi/static/app.js` 的实现模式。

## 重构步骤

### 1. 类结构定义

- 定义 `export class WuziqiBoard extends HTMLElement`
- `static get observedAttributes()` 返回 `['api-base', 'rpg-mode', 'player-side']`
- `constructor()` 中初始化所有状态属性
- Getter 属性：
  - `apiBase` — 从 `api-base` attribute 读取，默认 `''`
  - `rpgMode` — 从 `rpg-mode` attribute 读取（hasAttribute）
  - `playerSide` — 从 `player-side` attribute 读取，默认 `'black'`（五子棋黑方先行）

### 2. Shadow DOM 渲染

- `connectedCallback()` 中调用 `attachShadow({ mode: 'open' })`
- `_renderShadowDom()` 方法：
  - 创建 `<style>` 标签，注入样式
  - 创建 `<div id="app">` 容器，注入 HTML 模板
- HTML 模板来源：从 `/workspace/wuziqi/static/index.html` 的 `#app` 内部提取完整结构

### 3. 样式转换

从 `/workspace/wuziqi/static/style.css` 提取样式，做以下转换：
- 移除 `@import url(...)` 语句（Google Fonts 导入）
- 保留 `@font-face` 声明
- `:root` 改为 `:host`
- 调整 `#app` 样式：高度从 `100vh` 改为 `100%`，添加字体和背景样式
- 移除 `html, body` 相关的全局样式
- 所有 `body::before` 等全局样式移入 `#app` 或 `:host`

### 4. DOM 查询迁移

所有 DOM 查询方法替换：
- `document.getElementById('xxx')` → `this.shadowRoot.getElementById('xxx')`
- `document.querySelectorAll('.xxx')` → `this.shadowRoot.querySelectorAll('.xxx')`
- `document.querySelector('.xxx')` → `this.shadowRoot.querySelector('.xxx')`

### 5. 内联事件迁移

HTML 中的 `onclick="App.xxx()"` 内联事件全部改为在 `bindEvents()` 中用 `addEventListener` 绑定：
- `onclick="App.restart()"` → 查找对应按钮添加 click 监听
- `onclick="App.stopMechanism(...)"` → 使用事件委托或创建时绑定

### 6. API 请求前缀

所有 `fetch('/api/xxx')` 改为 `fetch(\`${this.apiBase}/api/xxx\`)`

### 7. RPG 模式支持

- `_updateRpgMode()` 方法：隐藏/显示 `.side-panel` 和 `.input-section`
- `attributeChangedCallback()` 中监听 `rpg-mode` 变化
- `connectedCallback()` 中初始调用一次

### 8. 自定义事件派发

新增事件派发方法：
- `_dispatchMoveEvent()` — 走棋完成后派发
  - detail: `{ captured, mover, is_check: false, game_ended, winner, is_five_in_a_row, go_captures: 0 }`
  - `is_five_in_a_row` 判断：`win_condition === 'five_in_a_row'`
- `_dispatchGameEndEvent()` — 游戏结束时派发
  - detail: `{ winner, win_condition }`
- `_dispatchError(message, error)` — 错误时派发
  - detail: `{ message, error }`

触发时机：
- `executeMove()` 成功后调用 `_dispatchMoveEvent()`
- `makeAIMove()` 成功后调用 `_dispatchMoveEvent()`
- `showGameOver()` 时调用 `_dispatchGameEndEvent()`
- 各处错误处理调用 `_dispatchError()`

### 9. 公开方法

- `init()` — 返回 Promise，完成后派发 `ready` 事件
- `applyCheatPatch(modifiedConfigs)` — POST `${apiBase}/api/config/update`，然后 loadConfigs + 重渲染
- `getBoardSnapshot()` — 返回 `{ boardState, configs }`
- `resetBoard()` — 调用重置 API 后重新加载
- `destroy()` — 清理 `thinkingPollInterval`、移除 keydown 事件监听

### 10. 生命周期

- `connectedCallback()` — 附加 Shadow DOM
- `disconnectedCallback()` — 调用 `destroy()`
- `attributeChangedCallback(name, oldVal, newVal)` — 处理属性变化

### 11. 自定义元素注册

文件末尾：`customElements.define('wuziqi-board', WuziqiBoard)`

### 12. 玩家方判断调整

- `_isCurrentTurnPlayerControlled()` 中使用 `this.playerSide` 判断
- 默认玩家方为 `'black'`（五子棋黑方先行）
- `_isCurrentTurnAITurn()` 逻辑参考象棋实现

## 文件输出

重构后的代码写入 `/workspace/wuziqi/static/app.js`，替换原有内容。

## 注意事项

1. 保持所有原有功能不变
2. 棋子渲染方法名保持 `renderPieces()`（当前代码中是这个名字）
3. 正确处理 move 事件的 `is_five_in_a_row` 字段
4. `playerSide` 默认值为 `'black'`（五子棋黑方先行惯例）
5. 确保 `document.addEventListener('keydown', ...)` 在 destroy 中正确清理
6. `thinkingPollInterval` 在 destroy 中清理
7. 模块导出使用 `export class`，文件末尾注册 custom element
