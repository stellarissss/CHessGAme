# 象棋部分「前后端分离 / 实时调取 JSON / 游戏逻辑」实现原理

> 适用对象：零基础读者
> 目标项目：`/workspace/xiangqi/`（无限制象棋）
> 阅读顺序：先看架构总览 → 再看数据流 → 最后看示例与避坑

---

## 一、一句话概括

> 后端用 **FastAPI** 把 6 个 JSON 配置文件暴露成 HTTP 接口；前端用 **原生 fetch** 拉这些 JSON 渲染棋盘；玩家每次点击/输入指令，前端发请求 → 后端在内存里改 JSON → 落盘保存 → 把新 JSON 回吐给前端 → 前端重渲染。这就是所谓「前后端分离 + 实时调取 JSON」。

---

## 二、总体架构图（文字版）

```
┌───────────────────────────── 浏览器（前端） ─────────────────────────────┐
│  index.html  →  加载 app.js                                                │
│  app.js      →  自定义元素 <xiangqi-board>，内部用 fetch 调后端 API        │
│  渲染：SVG 画棋盘 + DIV 画棋子，全部数据来自后端返回的 JSON               │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │  HTTP / JSON（无 WebSocket，纯请求-响应）
                                    ▼
┌───────────────────────────── 服务器（后端） ──────────────────────────────┐
│  main.py (FastAPI)                                                        │
│    ├─ GameState         ← 内存里的 6 份 JSON 配置（dict）                  │
│    ├─ RuleEngine        ← 根据 JSON 算合法走法                             │
│    ├─ MechanismEngine   ← 处理"冻结/AI接管/随机走棋"等机制                 │
│    ├─ ChessAI           ← Minimax + Alpha-Beta，决定 AI 怎么走            │
│    └─ AIOrchestrator    ← 调 LLM 把自然语言指令翻译成 JSON Patch          │
│                                                                           │
│  configs/*.json  ←—— 持久化在磁盘上的 6 个 JSON 文件                       │
└───────────────────────────────────────────────────────────────────────────┘
```

关键源文件位置：

- 后端入口：[xiangqi/main.py](file:///workspace/xiangqi/main.py)
- 前端入口：[xiangqi/static/index.html](file:///workspace/xiangqi/static/index.html) + [xiangqi/static/app.js](file:///workspace/xiangqi/static/app.js)
- 规则引擎：[xiangqi/rule_engine.py](file:///workspace/xiangqi/rule_engine.py)
- 机制引擎：[xiangqi/mechanism_engine.py](file:///workspace/xiangqi/mechanism_engine.py)
- AI 走棋：[xiangqi/chess_ai.py](file:///workspace/xiangqi/chess_ai.py)
- LLM 编排：[xiangqi/ai_orchestrator.py](file:///workspace/xiangqi/ai_orchestrator.py)
- JSON Patch 工具：[shared/json_patch_utils.py](file:///workspace/shared/json_patch_utils.py)

---

## 三、6 个 JSON 文件的角色（理解「JSON 驱动」的第一步）

代码里写死了 6 个配置名，见 [main.py#L37](file:///workspace/xiangqi/main.py#L37)：

```python
CONFIG_FILES = ["board_state", "board", "pieces_red", "pieces_black", "rules", "ui_config"]
```

| 文件名 | 作用 | 类比 |
|---|---|---|
| `board.json` | 棋盘几何（9×10、九宫格、楚河汉界、颜色） | 棋盘本身的「物理规则」 |
| `pieces_red.json` / `pieces_black.json` | 红黑双方每种棋子的**移动定义**（jump/ray） | 每种棋子的「技能说明书」 |
| `rules.json` | 胜负条件、AI 难度、AI 性格、特殊规则 | 游戏的「宪法」 |
| `ui_config.json` | 主题颜色、字体、布局 | 游戏的「皮肤」 |
| `board_state.json` | **当前对局的实时状态**：所有棋子位置、当前回合、走棋历史、机制状态、游戏状态 | 对局的「存档」 |

**最关键的一点**：除了 `board_state.json` 是「存档」（每走一步都会变），其它 5 个是「规则定义」，正常下棋时不变；但当玩家输入"让马可以斜着走"这种作弊指令时，AI 会改写 `pieces_red.json` 里的移动定义——这就是"无限制象棋"的核心玩法。

举一个最直观的例子，红方"兵"的移动定义在 [configs/pieces_red.json#L147-L175](file:///workspace/xiangqi/configs/pieces_red.json#L147-L175)：

```json
"soldier": {
  "label": "兵",
  "moves": [
    { "kind": "jump", "to": "$forward", "block": [], "land": "any", "sym": "none" },
    { "kind": "jump", "to": [1, 0], "block": [], "land": "any", "sym": "mirror_x",
      "where": [{ "crossed_river": { "pos": "$self" } }] }
  ]
}
```

读法：「兵可以向前跳 1 格（`$forward`）；过河后（`crossed_river`）可以左右跳 1 格」。如果 AI 把这段 JSON 改成 `to: [0, -1]`，兵就能后退了——游戏逻辑立刻跟着变，**完全不用改任何代码**。

---

## 四、前后端分离是怎么"分"的

### 4.1 后端：FastAPI 暴露纯 JSON 接口

后端不渲染 HTML 模板（除了首页），所有交互都是 JSON over HTTP。核心路由在 [main.py#L186-L650](file:///workspace/xiangqi/main.py#L186-L650)：

| 路由 | 方法 | 作用 |
|---|---|---|
| `/` | GET | 返回 `index.html`（仅这一次返回 HTML） |
| `/api/config/all` | GET | 一次性返回全部 6 份 JSON 配置 |
| `/api/config/{name}` | GET | 返回单个配置 |
| `/api/valid_moves` | POST | 给定棋子 id，返回合法落点列表 |
| `/api/move` | POST | 玩家走棋 |
| `/api/ai_move` | POST | AI 走棋 |
| `/api/command` | POST | 玩家自然语言指令（"让马斜着走"） |
| `/api/undo` `/api/restart` `/api/difficulty` | POST | 悔棋/重开/调难度 |
| `/api/rpg/apply_patch` | POST | 直接打 JSON Patch（给 RPG 模块用） |

后端还挂载了静态文件目录（[main.py#L155-L161](file:///workspace/xiangqi/main.py#L155-L161)）：

```python
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
```

→ 浏览器访问 `/` 拿到 HTML，HTML 里的 `<script src="/static/app.js">` 再去拿 JS。**之后的所有交互都走 `/api/...`，不再有整页刷新。**

### 4.2 前端：原生 fetch + Web Component

前端不依赖任何框架（没有 React/Vue）。它把整个棋盘封装成一个自定义元素 `<xiangqi-board>`，见 [app.js#L1](file:///workspace/xiangqi/static/app.js#L1)：

```javascript
class XiangqiBoard extends HTMLElement { ... }
customElements.define('xiangqi-board', XiangqiBoard);
```

[index.html](file:///workspace/xiangqi/static/index.html) 里启动它：

```html
<div id="app"></div>
<script src="/static/app.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    var board = document.createElement('xiangqi-board');
    document.getElementById('app').appendChild(board);
    board.init();
  });
</script>
```

`init()` 做的第一件事就是 **拉 JSON**（[app.js#L2304-L2310](file:///workspace/xiangqi/static/app.js#L2304-L2310)）：

```javascript
async loadConfigs() {
    const resp = await fetch(`${this.apiBase}/api/config/all`, { cache: 'no-store' });
    this.configs = await resp.json();
    this.boardState = this.configs.board_state;
    this.uiConfig = this.configs.ui_config;
}
```

注意 `cache: 'no-store'`——这是"实时调取"的关键，强制浏览器不读缓存，每次都问后端要最新数据。

之后所有渲染（`renderBoard()`、`renderPieces()`、`updateTurnIndicator()`……）都是**纯函数式**地从 `this.configs` / `this.boardState` 读数据画 DOM/SVG，没有任何业务逻辑写死在前端。

### 4.3 前后端"契约"在哪里？

**没有独立的 OpenAPI 文档**，契约就是 6 份 JSON Schema（在 [shared/schemas/](file:///workspace/shared/schemas)）+ FastAPI 的 Pydantic 模型（[main.py#L169-L184](file:///workspace/xiangqi/main.py#L169-L184)）：

```python
class MoveRequest(BaseModel):
    piece_id: str
    to: list  # [x, y]
```

前端发请求时必须按这个结构传 body。FastAPI 会自动校验，校验失败直接 422。

---

## 五、"实时调取 JSON"到底指什么？

这是新人最容易误解的地方。"实时调取 JSON"在本项目里有 **3 层含义**，要分清楚：

### 含义 1：启动时一次性加载（pull）

[main.py#L56-L63](file:///workspace/xiangqi/main.py#L56-L63) 服务启动时把磁盘上的 6 个 JSON 读进内存：

```python
def load_configs(self):
    for name in CONFIG_FILES:
        path = CONFIGS_DIR / f"{name}.json"
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                self.configs[name] = json.load(f)
    self._rebuild_engines()
```

→ 前端打开页面时 `fetch('/api/config/all')` 把这 6 份拉走。
→ 此后整个对局期间，**后端不再读磁盘**，所有计算都基于内存里的 `state.configs`。

### 含义 2：每次状态变更后落盘（push to disk）

每次走棋或 AI 修改规则，后端都会 **写回磁盘**，见 [main.py#L65-L69](file:///workspace/xiangqi/main.py#L65-L69)：

```python
def save_config(self, name: str):
    path = CONFIGS_DIR / f"{name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(self.configs[name], f, ensure_ascii=False, indent=2)
```

走棋接口末尾的调用（[main.py#L354](file:///workspace/xiangqi/main.py#L354)）：

```python
state.save_config("board_state")
```

这样即使服务重启，对局也能从磁盘恢复。**这是"实时"的本质：内存是真相，磁盘是镜像，两者每次变更都同步。**

### 含义 3：前端每次操作后重新拉取（refresh）

前端不会在前端维护"当前棋局"——它每次走完棋都重新 `loadConfigs()` 全量拉一次，见 [app.js#L3009-L3017](file:///workspace/xiangqi/static/app.js#L3009-L3017)（处理完自然语言指令后）：

```javascript
await this.loadConfigs();
this.renderBoard();
this.renderPieces();
this.updateTurnIndicator();
this.updateActiveRules();
...
```

这是一种「**笨但稳**」的策略：因为后端可能不仅改了 `board_state`，还可能改了 `pieces_red`（棋子规则）甚至 `board`（棋盘几何）。前端不知道改了啥，干脆全量重拉、全量重渲染。代价是流量稍大，好处是逻辑极其简单、不会出现前后端状态不一致。

> ⚠️ 注意：本项目**没有用 WebSocket**。"实时"不是"推送"，而是"前端频繁轮询/重拉"。AI 思考过程中前端用 `setInterval` 轮询 `/api/thinking_status`（[app.js#L3083-L3105](file:///workspace/xiangqi/static/app.js#L3083-L3105)），这是另一种"实时"。

---

## 六、游戏逻辑的 4 个引擎

### 6.1 RuleEngine —— 用 JSON 描述棋子怎么走

这是整个项目最巧妙的设计。**棋子走法不是硬编码的 `if piece.type == 'horse'`，而是用一套 DSL（领域特定语言）写在 JSON 里**，引擎负责解释执行。

核心结构在 [rule_engine.py#L9-L32](file:///workspace/xiangqi/rule_engine.py#L9-L32)。每个 `move_def` 只有两种"原子"：

| 原子 | 含义 | 关键字段 |
|---|---|---|
| `jump` | 跳到固定偏移的位置 | `to`（偏移量）、`block`（必须为空的"腿"）、`land`（落点要求：empty/enemy/any） |
| `ray` | 沿方向射线滑动 | `dir`（方向）、`max`（最大步数，-1=无限）、`screens`（必须跨过的"炮架"数量） |

再叠加 3 个修饰符：
- `sym`：对称展开（`rotate4`/`rotate4_mirror`/`mirror_x`/`none`），让一个定义覆盖多个方向
- `where`：条件表达式（`in_region`/`crossed_river`/`at_row`...），支持 `and`/`or`/`not` 嵌套
- `$forward`：特殊变量，红方 `to=[0,-1]`、黑方 `to=[0,1]`，自动按阵营取反

举例：**马**的走法 [configs/pieces_red.json#L84-L103](file:///workspace/xiangqi/configs/pieces_red.json#L84-L103)

```json
"horse": {
  "moves": [{
    "kind": "jump", "to": [1, 2], "block": [[0, 1]],
    "land": "any", "sym": "rotate4_mirror"
  }]
}
```

读法：「跳到 (±1, ±2) 或 (±2, ±1) 这 8 个位置，但 `[0,1]`（马的'腿'）那格必须没棋子」。`rotate4_mirror` 把一个 `[1,2]` 展开成 8 个方向——这就是"马走日+蹩马腿"的完整描述。

[rule_engine.py#L33-L63](file:///workspace/xiangqi/rule_engine.py#L33-L63) 是入口：

```python
def get_valid_moves(self, piece, board_state):
    move_defs = self._get_move_definitions(piece_type, piece.get("side"))
    all_moves = []
    for move_def in move_defs:
        expanded = self._expand_symmetry(move_def)   # 展开对称
        for exp_def in expanded:
            moves = self._execute_move_def(exp_def, piece, board_state)
            all_moves.extend(moves)
    return list({tuple(m): m for m in all_moves}.values())  # 去重
```

> 💡 这种设计的好处：**新增一种棋子只要改 JSON，不用改代码**。AI 想把"兵"变成能后退的兵，只要发一个 JSON Patch 改 `to` 字段，规则引擎立刻就能算出新的合法走法。

### 6.2 MechanismEngine —— 处理"作弊机制"

普通象棋只有"轮流走"一条规则。本项目要支持"冻结对方 2 回合"、"AI 接管红方 3 回合"、"随机走棋 5 步"、"额外回合"、"多步行走"等机制，这些状态都存在 `board_state.json` 的 `mechanisms` 字段里（见 [configs/board_state.json#L401-L408](file:///workspace/xiangqi/configs/board_state.json#L401-L408)）：

```json
"mechanisms": {
  "skip_turns": [], "ai_control": [], "player_control": [],
  "random_moves": [], "extra_turns": [], "move_limits": []
}
```

机制引擎在两个时机介入（[mechanism_engine.py#L42-L154](file:///workspace/xiangqi/mechanism_engine.py#L42-L154)）：

1. **回合开始前** `apply_pre_turn_mechanisms`：检查是否被冻结、是否被 AI 接管
2. **走棋后** `apply_post_move_mechanisms`：消耗随机走棋次数、判断是否切换回合（额外回合不切换）、消耗 AI 接管次数

[main.py#L321-L348](file:///workspace/xiangqi/main.py#L321-L348) 演示了机制引擎如何嵌入走棋流程：

```python
# 走棋后机制处理
switch_turn = True
if state.mechanism_engine:
    board, post_info = state.mechanism_engine.apply_post_move_mechanisms(board, current_turn)
    switch_turn = post_info.get("switch_turn", True)

if switch_turn:
    board["current_turn"] = "black" if current_turn == "red" else "red"
    # 检查下一回合是否被跳过，如果被跳过，继续切换
    while state.mechanism_engine and state.mechanism_engine.should_skip_turn(board, board["current_turn"]):
        board, skip_info = state.mechanism_engine.apply_pre_turn_mechanisms(board, board["current_turn"])
        ...
        board["current_turn"] = "black" if board["current_turn"] == "red" else "red"
```

> 💡 注意机制也是 **JSON 驱动**的：AI 想冻结对方 2 回合，只要往 `mechanisms.skip_turns` 数组里 push 一个 `{"side":"red","remaining":2,"reason":"冰冻术"}`，机制引擎下次循环就会自动识别。

### 6.3 ChessAI —— Minimax + Alpha-Beta

AI 走棋用经典的极小极大搜索 + Alpha-Beta 剪枝，[chess_ai.py#L23-L63](file:///workspace/xiangqi/chess_ai.py#L23-L63)。难度对应搜索深度（在 `rules.json` 里配置）：

```json
"ai_difficulty": {
  "current": "medium",
  "levels": {
    "easy":   { "depth": 2, "randomness": 0.3 },
    "medium": { "depth": 3, "randomness": 0.1 },
    "hard":   { "depth": 4, "randomness": 0.0 }
  }
}
```

关键点：**ChessAI 也依赖 RuleEngine 算合法走法**——也就是说，如果 AI 改了棋子规则，下一秒它自己搜出来的走法也会跟着变。这是"无限制"玩法的闭环。

### 6.4 AIOrchestrator —— 把自然语言翻译成 JSON Patch

这是最"AI"的部分。玩家输入"让我的马可以斜着走"后，[ai_orchestrator.py#L278-L320](file:///workspace/xiangqi/ai_orchestrator.py#L278-L320) 走两步：

1. **意图解析**：调 DeepSeek LLM，把自然语言变成结构化意图（要改哪个配置、改成什么样）
2. **代码生成**：再调一次 LLM，生成 RFC 6902 标准 **JSON Patch** 列表

JSON Patch 长这样（[shared/json_patch_utils.py#L132-L188](file:///workspace/shared/json_patch_utils.py#L132-L188) 实现了 5 种操作）：

```json
[
  { "op": "replace",
    "path": "/pieces/soldier/moves/0/to",
    "value": [0, -1] }
]
```

意思是：把 `pieces_red.json` 里 `pieces.soldier.moves[0].to` 这个字段的值替换成 `[0,-1]`。应用后兵就能后退了。

[main.py#L229-L251](file:///workspace/xiangqi/main.py#L229-L251) 处理玩家指令时，如果 LLM 成功返回了修改，就调用 `state.apply_config_update(modified)`——这个方法（[main.py#L93-L109](file:///workspace/xiangqi/main.py#L93-L109)）会：

1. 把旧配置压入撤销栈（支持"撤回 AI 修改"）
2. 用新配置覆盖内存
3. **落盘保存**
4. **`_rebuild_engines()` 重建所有引擎**——这一步至关重要，让 RuleEngine/ChessAI 立刻用上新规则

---

## 七、完整数据流：玩家点一下棋子的端到端旅程

把上面所有零件串起来，一次"点击红车走到 (0,5)"的全过程：

```
[1] 玩家点击红车
    ↓ app.js: onPieceClick(piece)
[2] 前端 POST /api/valid_moves  {piece_id: "r_chariot_1", to: [0,9]}
    ↓ main.py: get_valid_moves()
    ↓ RuleEngine.get_valid_moves(piece, board_state)
    ↓ 返回 [[0,5],[0,6],[0,7],[0,8], ...] 等合法落点
[3] 前端 showValidMoves() 在棋盘上画绿点
[4] 玩家点击 (0,5) 绿点
    ↓ app.js: executeMove("r_chariot_1", [0,5])
[5] 前端 POST /api/move  {piece_id: "r_chariot_1", to: [0,5]}
    ↓ main.py: make_move()
    ├─ 检查 game_status 是否 ended
    ├─ 检查 mechanism_engine.is_ai_controlled / is_player_controlled
    ├─ rule_engine.get_valid_moves() 验证 [0,5] 确实在合法列表里
    ├─ 修改 board_state.pieces 里 r_chariot_1 的 position
    ├─ 如果有目标棋子，把它的 is_alive 置 false
    ├─ board_state.move_history.push(...)
    ├─ rule_engine.is_general_captured() 检查胜负
    ├─ mechanism_engine.apply_post_move_mechanisms() 处理走棋后机制
    ├─ 切换 current_turn: red → black
    ├─ 循环检查 should_skip_turn（被冻结就继续切）
    └─ rule_engine.is_checkmate() 检查将死
    ↓ state.save_config("board_state")  ← 落盘！
    ↓ 返回 {success: true, board_state: {...}, mechanisms: [...]}
[6] 前端收到响应
    ├─ this.boardState = data.board_state
    ├─ renderPieces() 重画棋子
    ├─ updateTurnIndicator() 回合指示变"黑方回合"
    ├─ updateMechanisms() 刷新机制面板
    └─ await sleep(800); await makeAIMove()
[7] 前端 POST /api/ai_move  {}
    ↓ main.py: ai_move()
    ├─ mechanism_engine.is_ai_controlled 判断是否 AI 回合
    ├─ chess_ai.get_best_move(board)  ← Minimax 搜索
    ├─ 执行移动（同 [5] 的修改逻辑）
    └─ state.save_config("board_state")
    ↓ 返回 {success: true, board_state, ai_move, is_random, mechanisms}
[8] 前端重渲染，回合切回红方，等待玩家下一步
```

整个流程里，**前端只负责发请求和画界面，所有游戏逻辑都在后端**。前端甚至不知道"马走日"这种规则——它只知道"后端说哪些绿点是合法的，我就画哪些绿点"。

---

## 八、最小可运行示例

下面是一个**最小化复刻**本项目核心思想的示例。它剥掉所有 AI / 机制 / 自定义元素，只保留"前后端分离 + JSON 驱动 + 实时落盘"这三件事，方便你理解本质。

### 8.1 目录结构

```
mini_xiangqi/
├── configs/
│   └── board_state.json     # 唯一的状态文件
├── static/
│   └── index.html           # 前端（一个文件搞定）
└── main.py                  # 后端（FastAPI）
```

### 8.2 `configs/board_state.json`

```json
{
  "current_turn": "red",
  "pieces": [
    { "id": "r_pawn", "type": "pawn", "side": "red", "position": [4, 6], "is_alive": true },
    { "id": "b_general", "type": "general", "side": "black", "position": [4, 0], "is_alive": true }
  ]
}
```

### 8.3 `main.py`

```python
import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()
CONFIG_PATH = Path(__file__).parent / "configs" / "board_state.json"
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# 模拟 RuleEngine：兵只能向前走 1 格
def get_valid_moves(piece, board_state):
    if piece["type"] == "pawn":
        dx, dy = 0, -1 if piece["side"] == "red" else 1
        nx, ny = piece["position"][0] + dx, piece["position"][1] + dy
        if 0 <= ny < 10:
            # 检查目标格有没有自己的棋子
            for p in board_state["pieces"]:
                if p["is_alive"] and p["position"] == [nx, ny] and p["side"] == piece["side"]:
                    return []
            return [[nx, ny]]
    return []

class MoveRequest(BaseModel):
    piece_id: str
    to: list  # [x, y]

def load_state():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_state(state):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

@app.get("/")
def index():
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))

@app.get("/api/state")
def get_state():
    return load_state()  # 每次实时从内存返回（演示用，正式项目应缓存）

@app.post("/api/valid_moves")
def valid_moves(req: MoveRequest):
    state = load_state()
    for p in state["pieces"]:
        if p["id"] == req.piece_id and p["is_alive"]:
            return {"moves": get_valid_moves(p, state)}
    return {"moves": []}

@app.post("/api/move")
def move(req: MoveRequest):
    state = load_state()
    # 找棋子
    piece = next((p for p in state["pieces"] if p["id"] == req.piece_id and p["is_alive"]), None)
    if not piece:
        return {"success": False, "message": "棋子不存在"}
    if piece["side"] != state["current_turn"]:
        return {"success": False, "message": "不是该方回合"}
    # 校验合法性
    if req.to not in get_valid_moves(piece, state):
        return {"success": False, "message": "非法移动"}
    # 执行移动
    target = next((p for p in state["pieces"] if p["position"] == req.to and p["is_alive"]), None)
    piece["position"] = req.to
    if target:
        target["is_alive"] = False
    # 切换回合
    state["current_turn"] = "black" if state["current_turn"] == "red" else "red"
    # 落盘！这就是"实时调取 JSON"的写入端
    save_state(state)
    return {"success": True, "state": state}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 8.4 `static/index.html`

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>迷你象棋</title></head>
<body>
  <h3 id="turn">加载中...</h3>
  <div id="board" style="position:relative;width:360px;height:400px;border:1px solid #000;"></div>
  <p id="msg"></p>
<script>
const W = 9, H = 10; // 9列10行
let state = null, selected = null, validMoves = [];

async function loadState() {
  const r = await fetch('/api/state', { cache: 'no-store' });
  state = await r.json();
  document.getElementById('turn').textContent = state.current_turn === 'red' ? '红方回合' : '黑方回合';
  render();
}

function render() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  // 画棋子
  state.pieces.forEach(p => {
    if (!p.is_alive) return;
    const el = document.createElement('div');
    el.textContent = p.type === 'pawn' ? '兵' : '将';
    el.style.cssText = `position:absolute;width:36px;height:36px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;cursor:pointer;
      color:${p.side === 'red' ? 'red' : 'black'};
      left:${p.position[0] * 40 + 2}px;top:${p.position[1] * 40 + 2}px;
      border:1px solid ${p.side === 'red' ? 'red' : 'black'};`;
    el.onclick = () => onPieceClick(p);
    board.appendChild(el);
  });
  // 画合法落点
  validMoves.forEach(([x, y]) => {
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;width:10px;height:10px;border-radius:50%;
      background:#39ff14;left:${x * 40 + 15}px;top:${y * 40 + 15}px;cursor:pointer;`;
    dot.onclick = () => executeMove(selected.id, [x, y]);
    board.appendChild(dot);
  });
}

async function onPieceClick(piece) {
  if (piece.side !== state.current_turn) return;
  selected = piece;
  const r = await fetch('/api/valid_moves', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ piece_id: piece.id, to: piece.position })
  });
  const data = await r.json();
  validMoves = data.moves;
  render();
}

async function executeMove(pieceId, to) {
  const r = await fetch('/api/move', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ piece_id: pieceId, to })
  });
  const data = await r.json();
  document.getElementById('msg').textContent = data.success ? '' : data.message;
  validMoves = []; selected = null;
  await loadState(); // 重新拉取最新状态——这就是"实时调取"
}

loadState();
</script>
</body>
</html>
```

### 8.5 运行

```bash
pip install fastapi uvicorn
cd mini_xiangqi
python main.py
# 浏览器打开 http://localhost:8000
```

这个示例只有 ~150 行，但完整复现了原项目的 3 个核心思想：

1. **前后端分离**：前端只 fetch JSON，后端只返回 JSON
2. **JSON 驱动**：游戏状态全在 `board_state.json` 里
3. **实时调取**：每次走棋后 `loadState()` 重新拉取，后端 `save_state()` 落盘

---

## 九、常见误区

### 误区 1：「实时调取 JSON」=前端定时轮询

❌ 错。本项目里前端**只在事件触发时**（走棋、指令、悔棋）才拉取 JSON，**没有定时轮询棋盘状态**。唯一的轮询是 AI 思考阶段轮询 `/api/thinking_status`，那是显示"思考中..."动画用的，不是棋盘状态。

✅ 正确理解：实时 = 每次操作后立即 pull 一次最新状态 + 后端每次变更立即 push 到磁盘。

### 误区 2：前端应该缓存棋盘状态，减少请求

❌ 在本项目里**不要这么做**。因为后端可能因为 AI 指令改了 `pieces_red.json`（规则变了）甚至 `board.json`（棋盘大小变了），前端缓存必然不一致。

✅ 正确做法：每次操作后全量 `loadConfigs()` 重拉 + 全量重渲染。简单粗暴但绝对正确。

### 误区 3：游戏规则应该写在代码里

❌ 这是新手看 `if piece.type == 'horse'` 写惯了的思路。本项目的核心创新就是**规则也用 JSON 描述**，所以 AI 才能动态修改规则。

✅ 正确做法：把规则抽象成 DSL（本项目的 jump/ray + sym + where），写进 JSON，引擎负责解释。

### 误区 4：`board_state.json` 和 `pieces_red.json` 是一回事

❌ 它们职责完全不同：
- `pieces_red.json` = 红方棋子的**类型定义**（general/advisor/.../各怎么走）—— 静态
- `board_state.json` = 当前对局里**所有棋子实例**的位置和存活状态 —— 动态

类比：`pieces_red.json` 是"棋子说明书"，`board_state.json` 是"当前棋盘照片"。

### 误区 5：AI 改完规则后引擎会自动生效

❌ 不会自动生效。看 [main.py#L93-L109](file:///workspace/xiangqi/main.py#L93-L109)，`apply_config_update` 末尾**必须显式调用** `_rebuild_engines()`，重新构造 `RuleEngine` 和 `ChessAI`。否则引擎还拿着旧规则用。

✅ 教训：JSON 改了之后，所有依赖 JSON 的对象都要重建。本项目用 `GameState` 单例集中管理这个副作用。

### 误区 6：走棋校验可以放在前端做

❌ **绝对不行**。前端是用户能改的，所有合法性校验必须后端做。看 [main.py#L289-L291](file:///workspace/xiangqi/main.py#L289-L291)：

```python
valid_moves = state.rule_engine.get_valid_moves(piece, board)
if req.to not in valid_moves:
    return {"success": False, "message": "非法移动"}
```

前端画的绿点只是 UX 提示，**真正的合法性以后端这次校验为准**。

### 误区 7：JSON 文件可以并发读写

❌ 本项目**没有加文件锁**，因为它是单进程单玩家本地游戏。如果你要改成多玩家/多进程，`json.dump` 和 `json.load` 在并发下会撕裂。

✅ 改造方向：用数据库（SQLite 就够）或加 `asyncio.Lock` + 文件锁。

---

## 十、最佳实践

### 实践 1：用 Schema 校验 AI 生成的 JSON

AI 生成的 JSON Patch 可能格式错误。本项目用 [shared/schema_validator.py](file:///workspace/shared/schema_validator.py) + JSON Schema 校验，[ai_orchestrator.py](file:///workspace/xiangqi/ai_orchestrator.py) 里还有"校验失败重试"机制。

→ 永远不要信任 LLM 输出，校验是必须的。

### 实践 2：用撤销栈保护用户

AI 改规则可能改坏（比如把将的走法改没了，游戏直接卡死）。本项目在 [main.py#L93-L120](file:///workspace/xiangqi/main.py#L93-L120) 实现了 `undo_stack`，每次 AI 修改前 deepcopy 旧配置压栈，前端有"撤回 AI 修改"按钮。

→ 任何"AI 改东西"的功能都要提供撤销。

### 实践 3：把"初始状态"备份成 `.initial` 文件

看 [configs/initial/](file:///workspace/xiangqi/configs/initial)，每个 JSON 都有对应的 `.json.initial` 备份。重置游戏时 [main.py#L122-L135](file:///workspace/xiangqi/main.py#L122-L135) 从备份恢复：

```python
def reset_board(self):
    initial_dir = CONFIGS_DIR / "initial"
    for name in CONFIG_FILES:
        initial_path = initial_dir / f"{name}.json.initial"
        if initial_path.exists():
            with open(initial_path, "r", encoding="utf-8") as f:
                self.configs[name] = json.load(f)
```

→ 不要用代码硬编码"初始棋盘"，备份成文件可读性更好，也方便改初始局面。

### 实践 4：前端用 `cache: 'no-store'` 强制不缓存

[app.js#L2305](file:///workspace/xiangqi/static/app.js#L2305)：

```javascript
const resp = await fetch(`${this.apiBase}/api/config/all`, { cache: 'no-store' });
```

→ 游戏状态接口默认会被浏览器缓存，必须显式禁用。

### 实践 5：引擎对象跟着配置一起重建

`GameState._rebuild_engines()`（[main.py#L76-L91](file:///workspace/xiangqi/main.py#L76-L91)）在每次配置变更后重建 `RuleEngine` / `ChessAI` / `MechanismEngine`，确保引擎不持有过期引用。

→ 如果引擎只在构造时读一次配置，配置变了它就"瞎"了。

### 实践 6：前端纯渲染、零业务逻辑

前端 `renderBoard()` / `renderPieces()` 等方法都是纯函数式从 `this.configs` 画 DOM。**不要在前端写"马走日"这种规则**。

→ 好处：规则改了前端不用改一行代码；坏处：网络断了就没法玩（但本来就在线游戏）。

### 实践 7：用 JSON Patch 而不是全量替换

本项目 AI 修改配置时优先用 RFC 6902 JSON Patch（`add/remove/replace/copy/move`），而不是发整份新 JSON。好处：
- 流量小（只传 diff）
- 可读性强（日志里能看到"改了哪个字段"）
- 可审计（[ai_orchestrator.py#L250-L276](file:///workspace/xiangqi/ai_orchestrator.py#L250-L276) 记录每次 patch 操作）

实现见 [shared/json_patch_utils.py#L191-L226](file:///workspace/shared/json_patch_utils.py#L191-L226)。

---

## 十一、速查表

| 想理解... | 看哪里 |
|---|---|
| 前后端怎么通信 | [main.py#L186-L251](file:///workspace/xiangqi/main.py#L186-L251) + [app.js#L2304-L2310](file:///workspace/xiangqi/static/app.js#L2304-L2310) |
| JSON 文件怎么加载 | [main.py#L56-L69](file:///workspace/xiangqi/main.py#L56-L69) |
| 走棋完整流程 | [main.py#L254-L359](file:///workspace/xiangqi/main.py#L254-L359) |
| 棋子规则怎么定义 | [configs/pieces_red.json](file:///workspace/xiangqi/configs/pieces_red.json) |
| 规则引擎怎么解释 JSON | [rule_engine.py#L33-L262](file:///workspace/xiangqi/rule_engine.py#L33-L262) |
| AI 怎么改规则 | [ai_orchestrator.py#L278-L320](file:///workspace/xiangqi/ai_orchestrator.py#L278-L320) |
| JSON Patch 怎么实现 | [shared/json_patch_utils.py#L132-L226](file:///workspace/shared/json_patch_utils.py#L132-L226) |
| 机制（冻结/AI接管）怎么实现 | [mechanism_engine.py#L42-L154](file:///workspace/xiangqi/mechanism_engine.py#L42-L154) |
| 配置变更后引擎怎么重建 | [main.py#L76-L109](file:///workspace/xiangqi/main.py#L76-L109) |
| 前端怎么处理 AI 思考动画 | [app.js#L3083-L3105](file:///workspace/xiangqi/static/app.js#L3083-L3105) |

---

## 十二、一句话总结

> **本项目把"象棋"拆成了 6 份 JSON + 4 个引擎 + 1 个 HTTP 层。前端只画 JSON，后端只改 JSON，AI 只生成 JSON Patch。所有"游戏逻辑"都是 JSON 的解释器。这就是"前后端分离 + JSON 驱动"的极致形态。**

理解了这一点，再看 [xiangqi/](file:///workspace/xiangqi) 下的任何文件都不会迷路。
