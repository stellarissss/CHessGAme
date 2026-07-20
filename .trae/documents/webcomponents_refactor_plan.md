# 前端架构重构计划：从 iframe + postMessage 到 Web Components + ES Modules

> **版本**：v1.0  
> **状态**：待审批  
> **涉及范围**：前端架构（Python 后端零改动）

---

## 一、现有架构分析

### 1.1 当前架构概览

```
┌──────────────────────────────────────────────────────────┐
│  浏览器 / RPG 外壳 (localhost:80)                          │
│  ┌────────────┐  ┌──────────────────────────────────┐    │
│  │  RpgShell  │  │  iframe: xiangqi / wuziqi / go    │    │
│  │  • 章节管理 │  │  + 棋圣系统作弊侧栏（被隐藏）      │    │
│  │  • 能量/识破│  │  + 能量条 / 回合数（被隐藏）      │    │
│  │  • VN 故事层│  └──────────────────────────────────┘    │
│  └────────────┘                                           │
└──────────────────────┬───────────────────────────────────┘
                       │ postMessage + HTTP fetch
┌──────────────────────▼───────────────────────────────────┐
│  后端服务群（FastAPI）                                     │
│  rpg_server:80  →  代理转发  →  xiangqi:8000 / wuziqi:8001│
└──────────────────────────────────────────────────────────┘
```

### 1.2 核心痛点（验证）

通过代码审查，确认以下痛点真实存在：

| 痛点 | 代码位置 | 严重程度 |
|------|---------|---------|
| **通信链路长** | 作弊流程：CheatPanel → fetch `/api/rpg/cheat/use` → 后端代理到棋类 → 返回 `modified_configs` → postMessage 到 iframe → rpg_adapter 再调 `window.app.loadConfigs()` | 🔴 高 |
| **双重请求上下文** | iframe 内的 `app.js` 独立调用 `/api/move`、`/api/ai_move` 等，RPG 外壳通过 rpg_adapter 的 `window.fetch` hook 拦截后 postMessage 上报 | 🔴 高 |
| **状态不同步** | 能量/识破在 RPG 外壳，棋盘状态在 iframe 内，靠 move_complete 回调单向同步 | 🟡 中 |
| **内存开销大** | 每个 iframe 是完整浏览器上下文，含独立的 JS 堆 / 样式表 / DOM | 🟡 中 |
| **打包风险** | iframe 加载 `http://localhost:8000/?rpg=1` 绝对 URL，桌面打包时路径问题严重 | 🔴 高 |

### 1.3 现有通信协议（postMessage）

| 消息类型 | 方向 | 触发时机 |
|---------|------|---------|
| `RPG_READY` | iframe → 父 | iframe 加载完成 |
| `RPG_INIT` | 父 → iframe | 收到 READY 后回发，携带 chapter_id / player_side / chess_type |
| `RPG_APPLY_CHEAT` | 父 → iframe | 作弊执行后，携带 modified_configs |
| `RPG_CHEAT_APPLIED` | iframe → 父 | 作弊应用完成（当前实际未被父端监听） |
| `RPG_MOVE_COMPLETE` | iframe → 父 | 每次走棋后，携带 captured / mover / game_ended 等 |
| `RPG_GAME_END` | iframe → 父 | 游戏结束，携带 winner |

---

## 二、新架构设计

### 2.1 目标架构图

```
┌──────────────────────────────────────────────────────────┐
│  浏览器 / RPG 外壳 (localhost:80)                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  RpgShell (rpg_shell.js)                          │    │
│  │  • 章节管理 / 能量/识破 / VN 故事层                │    │
│  │  • CheatPanel (作弊面板)                          │    │
│  │                                                  │    │
│  │  ┌──────────────────────────────────────────┐    │    │
│  │  │  Shadow DOM: <xiangqi-board>             │    │    │
│  │  │  (Web Component, ES Module 动态导入)       │    │    │
│  │  │  • 棋盘渲染 / 棋子交互 / AI 走棋           │    │    │
│  │  │  • 内部状态：boardState / configs         │    │    │
│  │  │  • 公开方法：applyCheatPatch() 等         │    │    │
│  │  │  • 自定义事件：move / gameend             │    │    │
│  │  └──────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP fetch（统一由外壳发起或组件内发起）
┌──────────────────────▼───────────────────────────────────┐
│  后端服务群（FastAPI, 零改动）                              │
│  rpg_server:80  →  代理转发  →  xiangqi:8000 / wuziqi:8001│
└──────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **后端零改动**：所有 Python 代码（rpg_server.py / xiangqi/main.py / wuziqi/main.py）保持不变
2. **原生 Web API**：仅使用 Custom Elements / Shadow DOM / ES Modules / Custom Events，不引入任何框架
3. **样式隔离**：Shadow DOM 替代 iframe 的天然隔离
4. **直接调用**：RPG 外壳直接持有组件实例，方法调用替代 postMessage
5. **渐进式重构**：保持棋类子项目独立运行能力（index.html 仍可单独访问）

---

## 三、棋类 Web Component 设计规范

### 3.1 自定义元素命名

| 棋类 | 元素名 | 模块路径 |
|------|--------|---------|
| 中国象棋 | `<xiangqi-board>` | `/xiangqi/static/app.js` |
| 五子棋 | `<wuziqi-board>` | `/wuziqi/static/app.js` |
| 围棋 | `<go-board>` | `/go/static/app.js` |

### 3.2 公开属性 (Attributes / Properties)

| 属性名 | 类型 | 说明 |
|--------|------|------|
| `api-base` | string | API 基础路径，默认 `/xiangqi`（或 `/wuziqi`, `/go`），用于组件内 fetch 请求 |
| `player-side` | string | 玩家方：`red` / `black`，默认 `red` |
| `rpg-mode` | boolean | 是否 RPG 模式，默认 `false`。RPG 模式下隐藏原生侧栏和输入区 |

### 3.3 公开方法 (Methods)

| 方法名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `init()` | 无 | `Promise<void>` | 初始化组件（加载配置、渲染棋盘） |
| `applyCheatPatch(modifiedConfigs)` | `modifiedConfigs: {[name: string]: object}` | `Promise<void>` | 应用作弊补丁，触发重新加载配置并重渲染 |
| `getBoardSnapshot()` | 无 | `{ boardState, configs }` | 获取当前棋盘完整状态快照 |
| `resetBoard()` | 无 | `Promise<void>` | 重置棋盘到初始状态 |
| `destroy()` | 无 | `void` | 清理资源（移除事件监听、清除定时器、断开引用） |

### 3.4 自定义事件 (Custom Events)

所有事件通过 `this.dispatchEvent(new CustomEvent(...))` 发射，冒泡到 Shadow DOM 边界外。

| 事件名 | `detail` 字段 | 触发时机 |
|--------|--------------|---------|
| `move` | `{ captured, mover, is_check, game_ended, winner, is_five_in_a_row, go_captures }` | 每次走棋完成（玩家或 AI） |
| `gameend` | `{ winner, win_condition }` | 游戏结束时 |
| `ready` | `{}` | 组件初始化完成、棋盘已渲染 |
| `error` | `{ message }` | 发生错误时 |

### 3.5 Shadow DOM 结构

```
<xiangqi-board>  ← Light DOM（属性设置在这里）
  └── #shadow-root (open)
        ├── <style>  /* 棋类样式，完全隔离 */
        ├── <div class="board-container">  /* 棋盘容器 */
        ├── <aside class="side-panel">     /* 侧栏（RPG 模式下隐藏） */
        └── <footer class="input-section"> /* 输入区（RPG 模式下隐藏） */
```

---

## 四、RPG 外壳重构设计

### 4.1 模块动态加载机制

根据 `chess_type` 动态导入对应模块并注册自定义元素：

```javascript
// 棋类模块映射
const CHESS_MODULES = {
    xiangqi: '/xiangqi/static/app.js',
    wuziqi: '/wuziqi/static/app.js',
    go: '/go/static/app.js',
};

const CHESS_ELEMENTS = {
    xiangqi: 'xiangqi-board',
    wuziqi: 'wuziqi',
    go: 'go-board',
};

async function loadChessComponent(chessType) {
    const modulePath = CHESS_MODULES[chessType];
    if (!modulePath) throw new Error(`未知棋类: ${chessType}`);
    
    // 动态导入 ES Module
    const module = await import(modulePath);
    
    // 检查自定义元素是否已注册
    const elementName = CHESS_ELEMENTS[chessType];
    if (!customElements.get(elementName)) {
        // 模块应自动注册，或导出注册函数
        if (module.registerElement) {
            module.registerElement();
        }
    }
    
    return elementName;
}
```

### 4.2 组件挂载流程

1. 调用 `loadChapter()` 加载章节元信息
2. 章节 VN 播放结束后，调用 `_startBattle(chapter)`
3. `_startBattle` 中：
   - 调用 `POST /api/rpg/battle/start`（后端重置棋类配置）
   - 动态 import 对应棋类模块
   - 创建自定义元素实例，设置属性
   - 挂载到 `#rpg-battle-container`
   - 监听组件的 `move` 和 `gameend` 事件
   - 调用组件的 `init()` 方法

### 4.3 作弊执行流程（新）

```
CheatPanel._onUse()
  │
  ├─ fetch POST /api/rpg/cheat/use  （RPG 外壳统一发起）
  │   └─ 返回 { modified_configs, cost_energy, opponent_dialogue, ... }
  │
  ├─ 更新能量/识破 UI
  │
  ├─ boardElement.applyCheatPatch(modified_configs)  （直接调用！）
  │   └─ 组件内部重新加载配置 → 重新渲染棋盘
  │
  └─ 播放对手台词 + 提示
```

### 4.4 走棋能量同步（新）

组件的 `move` 事件替代原 `RPG_MOVE_COMPLETE` postMessage：

```javascript
boardElement.addEventListener('move', async (e) => {
    const detail = e.detail;
    // 调用 RPG 后端结算能量
    const resp = await fetch('/api/rpg/move_complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            captured: detail.captured,
            mover: detail.mover,
            is_check: detail.is_check,
            game_ended: detail.game_ended,
            winner: detail.winner,
            is_five_in_a_row: detail.is_five_in_a_row,
            go_captures: detail.go_captures,
        }),
    });
    const data = await resp.json();
    if (data.success) {
        updateState({ energy: data.energy, turn_count: data.turn_count });
    }
});
```

---

## 五、需要修改的文件清单

### 5.1 棋类子项目（3 个）

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `xiangqi/static/app.js` | 重构成 ES Module | 导出自定义元素类 + 自动注册 |
| `xiangqi/static/index.html` | 小改 | 调整 script 引入方式，保持独立运行能力 |
| `wuziqi/static/app.js` | 重构成 ES Module | 同上 |
| `wuziqi/static/index.html` | 小改 | 同上 |
| `go/static/app.js` | 重构成 ES Module | 同上（若存在） |
| `go/static/index.html` | 小改 | 同上（若存在） |

### 5.2 RPG 外壳

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `shared/rpg/rpg_shell.js` | 重构 | 移除 iframe / postMessage 逻辑，改为动态 import + Web Component |
| `shared/rpg/cheat_panel.js` | 小改 | `_onUse` 中 `sendToIframe` 改为直接调用组件方法 |
| `shared/rpg/rpg_shell.html` | 小改 | 移除 iframe，改为组件容器 + 调整 script 加载方式 |
| `shared/rpg/rpg_adapter.js` | 废弃 | 功能被 Web Component 内部逻辑替代 |
| `shared/rpg/rpg_style.css` | 小改 | 调整 battle-container 样式以适配 Web Component |

### 5.3 后端（零改动）

- `shared/rpg/rpg_server.py` — 不变
- `xiangqi/main.py` — 不变
- `wuziqi/main.py` — 不变
- `go/main.py` — 不变

---

## 六、详细实施步骤

### 阶段 1：棋类组件重构（以象棋为例，五子棋/围棋同理）

#### Step 1.1：封装 App 为类

将现有的 `const App = { ... }` 对象字面量重构为 `class ChessBoard` 类，继承自 `HTMLElement`。

- 状态属性从 `App.configs` 等改为 `this.configs` 等
- 所有方法改为类方法
- `this.init()` 改为 `connectedCallback` 中调用

#### Step 1.2：实现 Shadow DOM

- 在 `connectedCallback` 中调用 `this.attachShadow({ mode: 'open' })`
- 将原 `index.html` 中的 HTML 结构（board-container / side-panel / input-section 等）移入 Shadow DOM
- 将原 `style.css` 内容通过 `<style>` 标签注入 Shadow DOM
- RPG 模式下根据 `rpg-mode` 属性隐藏侧栏和输入区

#### Step 1.3：实现公开方法

- `applyCheatPatch(modifiedConfigs)`：
  - 调用 `POST /api/config/update` 或直接替换本地 state 后重新渲染
  - 重新调用 `loadConfigs()` → `renderBoard()` → `renderPieces()` → 各 UI 更新
- `getBoardSnapshot()`：返回 `{ boardState: this.boardState, configs: this.configs }`
- `resetBoard()`：调用 `POST /api/reset_configs` 后重新加载
- `destroy()`：清理 `thinkingPollInterval` 等定时器，移除事件监听

#### Step 1.4：实现自定义事件

- 在 `executeMove` / `makeAIMove` 成功后派发 `move` 事件
  - 从 `move_history[-1]` 提取 `captured`
  - 从 `game_status` 提取 `game_ended` / `winner`
  - 从 URL 或上下文推导 `mover`（玩家方/AI方）
  - 检测 `is_five_in_a_row`（win_condition === 'five_in_a_row'）
- 在游戏结束时派发 `gameend` 事件
- 初始化完成后派发 `ready` 事件

#### Step 1.5：导出并注册

```javascript
export class XiangqiBoard extends HTMLElement { ... }

// 自动注册（当模块被 import 时）
if (!customElements.get('xiangqi-board')) {
    customElements.define('xiangqi-board', XiangqiBoard);
}
```

#### Step 1.6：保持独立运行能力

修改 `index.html`，使其在非 RPG 模式下仍能正常运行：

```html
<script type="module">
    import { XiangqiBoard } from '/static/app.js';
    // 自动注册后，创建实例并挂载
    const board = document.createElement('xiangqi-board');
    document.getElementById('app').appendChild(board);
    board.init();
</script>
```

### 阶段 2：RPG 外壳重构

#### Step 2.1：移除 iframe 相关代码

从 `rpg_shell.js` 中移除：
- `iframe` / `iframeReady` / `pendingInit` 变量
- `_onIframeMessage` / `sendToIframe` 函数
- `window.addEventListener('message', ...)` 绑定
- `_hideIframe` 中 iframe 相关逻辑
- `_startBattle` 中 iframe 加载逻辑

#### Step 2.2：实现组件加载与挂载

新增：
- `CHESS_MODULES` / `CHESS_ELEMENTS` 映射表
- `loadChessComponent(chessType)` 异步函数
- `currentBoardElement` 变量（持有当前组件实例）
- `_mountBoard(chessType, playerSide)` 挂载函数
- `_unmountBoard()` 卸载函数（调用 destroy 并移除 DOM）

#### Step 2.3：改造 _startBattle

```javascript
async function _startBattle(chapter) {
    // 1. 调用后端 battle/start（不变）
    // ...
    
    // 2. 动态加载组件模块
    const elementName = await loadChessComponent(chapter.chess_type);
    
    // 3. 创建组件实例
    const boardEl = document.createElement(elementName);
    boardEl.setAttribute('api-base', `/${chapter.chess_type}`);
    boardEl.setAttribute('player-side', data.player_side);
    boardEl.setAttribute('rpg-mode', '');
    
    // 4. 监听事件
    boardEl.addEventListener('move', _onBoardMove);
    boardEl.addEventListener('gameend', _onBoardGameEnd);
    boardEl.addEventListener('ready', _onBoardReady);
    
    // 5. 挂载到容器
    battlePlaceholder.style.display = 'none';
    battleContainer.appendChild(boardEl);
    currentBoardElement = boardEl;
    
    // 6. 初始化
    await boardEl.init();
}
```

#### Step 2.4：改造作弊面板

修改 `cheat_panel.js` 的 `_onUse`：

```javascript
// 原代码：RpgShell.sendToIframe({ type: 'RPG_APPLY_CHEAT', ... })
// 新代码：
const boardEl = RpgShell.getBoardElement();
if (boardEl && data.modified_configs && Object.keys(data.modified_configs).length > 0) {
    await boardEl.applyCheatPatch(data.modified_configs);
}
```

#### Step 2.5：改造 HTML

修改 `rpg_shell.html`：
- 移除 `<iframe id="rpg-chess-iframe">`
- 保留 `<div id="rpg-battle-container">` 作为组件挂载容器
- 将 `rpg_shell.js` 改为 `type="module"`（因为使用了动态 import）

### 阶段 3：样式适配

#### Step 3.1：棋类组件样式封装

- 将 `style.css` 内容作为字符串嵌入组件类，或通过 fetch 动态加载后注入 Shadow DOM
- 移除对外部样式的依赖（确保 Shadow DOM 内样式自洽）

#### Step 3.2：RPG 外壳样式调整

- `.rpg-battle-container` 调整为 flex 布局，让 Web Component 填满容器
- 可能需要调整宽度/高度百分比

### 阶段 4：集成测试

#### Step 4.1：独立运行验证

- 直接访问 `http://localhost:8000/`，象棋仍可正常运行
- 直接访问 `http://localhost:8001/`，五子棋仍可正常运行

#### Step 4.2：RPG 流程验证

- 启动 RPG 服务，访问 `http://localhost/`
- 序章 VN 正常播放
- 进入教程章节（五子棋），棋盘正常渲染
- 正常走棋，能量条正确变化
- 执行作弊，棋盘正确应用修改
- 游戏结束后正确进入下一章
- 象棋章节正常切换
- 最终结局正常触发

---

## 七、API 路径处理方案

### 7.1 问题

棋类组件内部的 fetch 请求路径需要正确指向对应棋类的后端服务。

原 iframe 方案：组件运行在 `http://localhost:8000/`，相对路径 `/api/move` 自动指向 8000 端口。

新方案：组件运行在 RPG 外壳页面 `http://localhost/`，相对路径 `/api/move` 会指向 80 端口。

### 7.2 解决方案

**方案 A（推荐）：RPG 后端增加棋类 API 代理路由**

在 `rpg_server.py` 中增加通配代理路由：

```python
@app.api_route("/api/chess/{chess_type}/{path:path}", methods=["GET", "POST"])
async def chess_api_proxy(chess_type: str, path: str, request: Request):
    # 代理到对应棋类服务
    return await chess_proxy(chess_type, f"/api/{path}", ...)
```

但这违反了「后端零改动」约束。

**方案 B（采纳）：使用完整 URL + CORS**

组件通过 `api-base` 属性获取基础路径（如 `http://localhost:8000`），内部 fetch 使用绝对路径：

```javascript
async loadConfigs() {
    const resp = await fetch(`${this.apiBase}/api/config/all`, { cache: 'no-store' });
    // ...
}
```

由于棋类后端已启用 CORS（`CORSMiddleware allow_origins=["*"]`），跨域请求不会有问题。

这是唯一满足「后端零改动」约束的方案。

### 7.3 apiBase 来源

从章节元信息中获取，或从 `chess_type` 推导：

```javascript
const CHESS_BASE_URLS = {
    xiangqi: 'http://localhost:8000',
    wuziqi: 'http://localhost:8001',
    go: 'http://localhost:8002',
};
```

---

## 八、风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| **样式隔离不彻底** | RPG 外壳 CSS 可能通过 CSS 变量或继承影响组件 | 中 | Shadow DOM 默认阻止外部样式渗入；仅 CSS 自定义属性可穿透，需注意命名空间 |
| **组件内存泄漏** | 切换章节时组件未正确清理，导致内存占用上升 | 中 | 实现完整的 `destroy()` 方法，`disconnectedCallback` 中调用 |
| **CORS 跨域问题** | 组件 fetch 请求被浏览器拦截 | 低 | 棋类后端已启用 CORS，验证一下即可 |
| **ES Module 兼容性** | 旧浏览器不支持动态 import | 低 | 项目使用现代 Web API，目标浏览器为现代 Chrome/Edge，没问题 |
| **五子棋/围棋代码差异** | 三个棋类的 app.js 结构可能不完全一致 | 中 | 先完整阅读 wuziqi/app.js，再统一重构模式 |
| **独立运行能力破坏** | 重构后棋类子项目无法单独访问 | 低 | index.html 改为 module 方式创建组件，保持独立运行 |

---

## 九、验收标准

### 功能验收

1. ✅ 三个棋类子项目仍可独立运行（直接访问各自端口）
2. ✅ RPG 外壳能正常加载所有章节
3. ✅ 棋盘通过 Web Component 渲染，样式与原 iframe 一致
4. ✅ 正常走棋流程完整（玩家走棋 → AI 回应 → 能量更新）
5. ✅ 作弊功能正常（评估 → 执行 → 棋盘变化 → 对手台词）
6. ✅ 游戏结束正确触发，进入下一章
7. ✅ 多章节切换正常，无内存泄漏

### 架构验收

1. ✅ 无 iframe 元素
2. ✅ 无 postMessage 调用
3. ✅ 使用 Custom Elements + Shadow DOM
4. ✅ 使用 ES Modules（import / export）
5. ✅ Python 后端代码零改动
6. ✅ 样式隔离（RPG 外壳 CSS 不污染棋盘，反之亦然）

---

## 十、实施顺序建议

1. **先重构 xiangqi/static/app.js**（代码最完整、功能最全）
2. 验证象棋组件独立运行
3. **重构 rpg_shell.js + rpg_shell.html**
4. 验证 RPG 外壳加载象棋组件
5. **重构 cheat_panel.js**
6. 验证作弊流程
7. **重构 wuziqi/static/app.js**（参照象棋模式）
8. 验证五子棋章节
9. **重构 go/static/app.js**（如存在）
10. 完整端到端测试

---

## 附录：关键代码文件参考

| 文件 | 当前行数 | 关键角色 |
|------|---------|---------|
| [xiangqi/static/app.js](file:///workspace/xiangqi/static/app.js) | ~1400+ | 象棋前端主逻辑 |
| [wuziqi/static/app.js](file:///workspace/wuziqi/static/app.js) | ~? | 五子棋前端主逻辑 |
| [shared/rpg/rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js) | 496 行 | RPG 外壳主控 |
| [shared/rpg/cheat_panel.js](file:///workspace/shared/rpg/cheat_panel.js) | 184 行 | 作弊面板 |
| [shared/rpg/rpg_adapter.js](file:///workspace/shared/rpg/rpg_adapter.js) | 182 行 | iframe 适配器（将废弃） |
| [shared/rpg/rpg_shell.html](file:///workspace/shared/rpg/rpg_shell.html) | 281 行 | RPG 外壳 HTML |
| [shared/rpg/rpg_server.py](file:///workspace/shared/rpg/rpg_server.py) | 680+ 行 | RPG 后端（零改动） |
