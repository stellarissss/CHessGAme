# 修复五子棋白棋不显示 Bug

## 摘要

五子棋前端白棋（对方棋子）渲染时只显示发光边框，棋子本体透明不可见。根因是 [wuziqi/static/app.js](file:///workspace/wuziqi/static/app.js) 中的 CSS 选择器使用了从象棋项目残留的 `"red"` side 值，而五子棋代码库中白方 side 实际为 `"white"`，导致白子 DOM 元素不匹配任何着色规则。

## 当前状态分析

### Bug 复现路径

1. 后端 [wuziqi/configs/board_state.json](file:///workspace/wuziqi/configs/board_state.json) 中白子使用 `"side": "white"`（第 25 行）
2. [wuziqi/chess_ai.py](file:///workspace/wuziqi/chess_ai.py)、[wuziqi/mechanism_engine.py](file:///workspace/wuziqi/mechanism_engine.py)、[wuziqi/ai_orchestrator.py](file:///workspace/wuziqi/ai_orchestrator.py)、[wuziqi/prompts.py](file:///workspace/wuziqi/prompts.py)、[wuziqi/configs/pieces_red.json](file:///workspace/wuziqi/configs/pieces_red.json) 全部统一使用 `"white"` 标识白方
3. 前端 [wuziqi/static/app.js:2476](file:///workspace/wuziqi/static/app.js#L2476) 在 `createPieceElement()` 中执行 `el.dataset.side = piece.side;`，因此白子 DOM 元素属性为 `data-side="white"`
4. **但 CSS 只定义了两个选择器**：
   - [app.js:757](file:///workspace/wuziqi/static/app.js#L757) `.piece[data-side="black"]` → 黑色背景 ✅
   - [app.js:764](file:///workspace/wuziqi/static/app.js#L764) `.piece[data-side="red"]` → 白色背景 ❌（五子棋中没有 side="red" 的棋子）
5. 白子 DOM 元素 `data-side="white"` 不匹配任何 CSS 规则 → 没有 `background-color` → 元素透明
6. 用户看到的"发光边框"是 `.piece.last-moved` / `.piece.ai-moved` / `.piece.selected` 状态类的 `box-shadow`。这些类一旦被移除（例如新一轮落子后），白子就完全不可见

### 关键证据

| 文件:行 | 内容 | 含义 |
|---|---|---|
| `wuziqi/static/app.js:757` | `.piece[data-side="black"]` | 黑子样式正常 |
| `wuziqi/static/app.js:764` | `.piece[data-side="red"]` | **Bug 所在**：选择器不匹配实际 side 值 |
| `wuziqi/static/app.js:2476` | `el.dataset.side = piece.side;` | 直接使用后端 side 值，无转换 |
| `wuziqi/configs/board_state.json:25` | `"side": "white"` | 后端实际 side 值 |
| `wuziqi/configs/pieces_red.json:6` | `"side": "white"` | 文件名残留 `red`，但 side 已是 `white` |

全代码库 grep 确认：wuziqi 中白方 side 值统一为 `"white"`；`"red"` 仅在 [wuziqi/rule_engine.py:155](file:///workspace/wuziqi/rule_engine.py#L155)（五子棋无方向移动，属死代码）和 `app.js:764`（本 Bug）出现。

> 注：文件名 `pieces_red.json` 是从象棋项目迁移时遗留的命名（象棋对方为红方），但内容已改为白方。文件名不影响运行时，无需改动。

## 修复方案

### 修改文件
- `/workspace/wuziqi/static/app.js` 第 764 行

### 修改内容

将 CSS 选择器从 `[data-side="red"]` 改为同时匹配 `"red"` 和 `"white"`，既修复 Bug 又保留对遗留 `"red"` 值的兼容：

修改前（[app.js:764-769](file:///workspace/wuziqi/static/app.js#L764-L769)）：
```css
.piece[data-side="red"] {
    background-color: #ffffff;
    box-shadow:
        0 2px 6px rgba(0, 0, 0, 0.4),
        inset 0 1px 2px rgba(0, 0, 0, 0.1);
}
```

修改后：
```css
.piece[data-side="red"],
.piece[data-side="white"] {
    background-color: #ffffff;
    box-shadow:
        0 2px 6px rgba(0, 0, 0, 0.4),
        inset 0 1px 2px rgba(0, 0, 0, 0.1);
}
```

### 不采用的备选方案

- **仅改为 `[data-side="white"]`**：会丢失对 `"red"` 的兼容。虽然 wuziqi 当前不用 `"red"`，但 AI 灵活编码理念允许玩家/AI 现场改规则，保留兼容更稳妥
- **重写整个棋子渲染逻辑**：超出 Bug 修复范围，违反"最小改动"原则
- **改 `pieces_red.json` 文件名**：文件名不影响运行时，且后端代码（`ai_orchestrator.py:1242` 等）硬编码引用了 `pieces_red.json` 路径，改名牵连面大

## 假设与决策

- **假设**：白子应当显示为白色圆形（与 `pieces_red.json` 的 description "白方棋子规则（白子）" 一致）
- **决策**：采用兼容性方案（同时匹配 `red` 和 `white`），原因是 wuziqi 源自象棋架构迁移，`"red"` 字符串作为遗留值在多个文件中存在；项目核心理念是"AI 灵活编码"，玩家或 AI 可能创造出 side="red" 的自定义棋子，保留兼容可避免未来回归

## 验证步骤

1. 启动 wuziqi 服务：`cd /workspace/wuziqi && python main.py`（端口 8001）
2. 浏览器访问 `http://localhost:8001`
3. 在棋盘上落黑子（点击棋盘交叉点），触发 AI 走白子
4. **核心验证**：白子显示为白色圆形实心棋子（非透明、非仅发光边框）
5. 验证白子的 `.last-moved`（粉色发光）、`.ai-moved`（金色发光）、`.selected`（青色发光）状态类仍然能正常叠加显示
6. 验证黑子渲染不受影响（仍为黑色圆形）
7. （可选）通过 RPG 外壳 `http://localhost:8080` 进入第 0 章教程五子棋对战，确认在 RPG 模式下白子也正常显示
