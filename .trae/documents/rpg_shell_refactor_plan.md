# RpgShell 重构计划：iframe → Web Components + ES Modules

## 一、背景与目标

当前 `rpg_shell.js` 通过 `<iframe>` + `postMessage` 与棋类应用通信。本次重构将其替换为 **Web Components + ES Modules** 方案，实现更直接的组件集成。

## 二、文件修改清单

### 1. `rpg_shell.html` 修改

**修改点：**
- 移除 `<iframe id="rpg-chess-iframe" class="rpg-chess-iframe" style="display:none;"></iframe>`（第 44 行）
- 保留 `<div id="rpg-battle-container">` 作为组件挂载容器
- 将 `<script src="/shared/rpg/rpg_shell.js"></script>` 改为 `type="module"`（第 279 行）
- 其他脚本（vn_player、story_layer、cheat_panel、rpg_extras）保持不变，且确保在 rpg_shell.js 之前加载

### 2. `rpg_shell.js` 重构

#### 2.1 移除的内容

| 移除项 | 位置 | 说明 |
|--------|------|------|
| `iframe` / `iframeReady` / `pendingInit` 变量 | 第 24-26 行 | iframe 相关状态变量 |
| `iframe = document.getElementById('rpg-chess-iframe')` | 第 45 行 | DOM 引用 |
| `window.addEventListener('message', _onIframeMessage)` | 第 66 行 | postMessage 监听绑定 |
| `_onIframeMessage` 函数 | 第 256-278 行 | 消息处理函数 |
| `sendToIframe` 函数 | 第 280-284 行 | 发送消息函数 |
| `_hideIframe` 中的 iframe 相关逻辑 | 第 244-252 行 | 隐藏 iframe 的逻辑 |
| `_startBattle` 中的 iframe 加载逻辑 | 第 234-241 行 | iframe src 设置逻辑 |
| 导出的 `sendToIframe` 方法 | 第 491 行 | 公开 API |

#### 2.2 新增的内容

**a) 棋类模块映射常量（在 IIFE 顶部状态区后添加）：**
```javascript
const CHESS_MODULES = {
    xiangqi: '/xiangqi/static/app.js',
    wuziqi: '/wuziqi/static/app.js',
    go: '/go/static/app.js',
};

const CHESS_ELEMENTS = {
    xiangqi: 'xiangqi-board',
    wuziqi: 'wuziqi-board',
    go: 'go-board',
};

const CHESS_BASE_URLS = {
    xiangqi: 'http://localhost:8000',
    wuziqi: 'http://localhost:8001',
    go: 'http://localhost:8002',
};
```

**b) 当前组件实例变量：**
```javascript
let currentBoardElement = null;
```

**c) 组件加载函数 `loadChessComponent(chessType)`：**
- 动态 import ES Module
- 检查 custom element 是否注册成功
- 返回 element 名称

**d) 组件挂载函数 `_mountBoard(chessType, playerSide)`：**
- 先调用 `_unmountBoard()` 卸载旧组件
- 调用 `loadChessComponent()` 加载模块
- 创建 custom element，设置属性（api-base、player-side、rpg-mode）
- 监听 move、gameend、ready、error 事件
- 挂载到 battleContainer
- 调用 `boardEl.init()` 初始化

**e) 组件卸载函数 `_unmountBoard()`：**
- 若存在 currentBoardElement，调用 destroy()
- 从 DOM 移除
- 置空 currentBoardElement

**f) 公开方法 `getBoardElement()`：**
- 返回 currentBoardElement（供 CheatPanel 调用）

**g) 新增事件处理函数：**
- `_onBoardReady(e)` - 打日志
- `_onBoardError(e)` - toast 显示错误

#### 2.3 改造的函数

| 原函数 | 改造后 | 改造内容 |
|--------|--------|----------|
| `_startBattle(chapter)` | `_startBattle(chapter)` | 移除 iframe_url 判断，改用 `_mountBoard(chapter.chess_type, data.player_side)` |
| `_hideIframe()` | `_hideBoard()` | 调用 `_unmountBoard()`，显示 battlePlaceholder |
| `_onMoveComplete(msg)` | `_onBoardMove(e)` | 从 `e.detail` 获取数据，逻辑不变 |
| `_onGameEnd(msg)` | `_onBoardGameEnd(e)` | 从 `e.detail` 获取 winner，逻辑不变 |
| `_goNextChapter()` | `_goNextChapter()` | 切换章节前调用 `_unmountBoard()` |
| `loadChapter()` | `loadChapter()` | 纯 VN 章节调用 `_unmountBoard()` 而非 `_hideIframe()` |

#### 2.4 导出对象修改

- 移除 `sendToIframe`
- 新增 `getBoardElement`

## 三、实施步骤

1. 修改 `rpg_shell.html`：移除 iframe 元素，修改 script 标签为 type="module"
2. 修改 `rpg_shell.js`：
   - 新增常量映射（CHESS_MODULES、CHESS_ELEMENTS、CHESS_BASE_URLS）
   - 新增 `currentBoardElement` 变量
   - 移除 iframe 相关变量和 DOM 引用
   - 移除 postMessage 事件监听
   - 新增 `loadChessComponent`、`_mountBoard`、`_unmountBoard` 函数
   - 新增 `_onBoardReady`、`_onBoardError` 函数
   - 改造 `_startBattle` 函数
   - 将 `_hideIframe` 重命名为 `_hideBoard` 并改造
   - 将 `_onMoveComplete` 重命名为 `_onBoardMove` 并改造
   - 将 `_onGameEnd` 重命名为 `_onBoardGameEnd` 并改造
   - 改造 `loadChapter` 中调用 `_hideIframe` 的地方
   - 改造 `_goNextChapter` 添加 `_unmountBoard()` 调用
   - 更新 return 导出对象

## 四、注意事项

- 保持原有 IIFE 结构 `const RpgShell = (() => { ... })();`
- 由于使用了动态 `import()`，文件需要在 HTML 中以 `type="module"` 加载
- 所有变量作用域保持在 IIFE 内部
- 确保 `battleContainer` 变量正确引用 `#rpg-battle-container`
- 确保事件监听器的正确绑定和解绑
- `_onBoardMove` 中 `e.detail` 的字段需与原 `msg` 字段对应（captured、mover、is_check、game_ended、winner、is_five_in_a_row、go_captures）
- `_onBoardGameEnd` 中 `e.detail.winner` 需与原 `msg.winner` 对应
