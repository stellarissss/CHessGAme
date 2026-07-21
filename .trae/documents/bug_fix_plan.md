# 棋圣 RPG Bug 修复计划

## 问题分析

### Bug 1: 序章(觉醒)加载不出来，始终显示"棋盘加载中"

**根本原因**：
1. 在 `rpg_shell.js` 的 `loadChapter()` 函数中，当处理纯 VN 章节（`!chessType`）时，调用了 `_unmountBoard()` 但没有调用 `_hideBoard()` 来显示正确的占位符状态
2. `_playChapterStory()` 调用 `StoryLayer.playChapter()`，但如果 `StoryLayer.show()` 执行后 `Preview.playStory()` 没有正确播放，VN 舞台不会显示
3. `battlePlaceholder` 默认显示"正在进入剧情……"，但由于 `vn-stage` 的 z-index 为 300，理论上应该能覆盖，但如果 `StoryLayer.show()` 没有被正确调用，占位符会持续显示

**关键代码位置**：
- [rpg_shell.js:162-172](file:///workspace/shared/rpg/rpg_shell.js#L162-L172) - 纯 VN 章节处理逻辑
- [rpg_shell.js:256-261](file:///workspace/shared/rpg/rpg_shell.js#L256-L261) - `_hideBoard()` 函数
- [story_layer.js:63-91](file:///workspace/shared/rpg/story_layer.js#L63-L91) - `playChapter()` 函数

### Bug 2: API Key 无法自动读取和保存

**根本原因**：
1. `rpg_server.py` 的 `_load_default_api_key()` 方法虽然实现了从 `config.json` 读取，但前端 `openSettings()` 没有调用 `/api/rpg/apikey` 获取当前状态
2. 设置界面的状态检查逻辑缺失——`rpg-settings-status` 始终显示"检查中…"但没有实际的 API 调用

**关键代码位置**：
- [rpg_server.py:158-189](file:///workspace/shared/rpg/rpg_server.py#L158-L189) - `_load_default_api_key()`
- [rpg_shell.js:462-465](file:///workspace/shared/rpg/rpg_shell.js#L462-L465) - `openSettings()` 函数
- [rpg_shell.html:156-158](file:///workspace/shared/rpg/rpg_shell.html#L156-L158) - 设置状态 HTML

### Bug 3: 能量条始终为零

**根本原因**：
1. `rpg_server.py` 的 `RpgState.__init__()` 中 `self.energy = 0`，且 `reset_battle()` 也设置 `self.energy = 0`
2. 但前端 `refreshState()` 从 `/api/rpg/state` 获取状态后，应该能更新能量值
3. 问题可能在于：初始状态获取时 `has_api_key` 为 `false`，或者能量更新逻辑没有正确触发

**关键代码位置**：
- [rpg_server.py:142](file:///workspace/shared/rpg/rpg_server.py#L142) - `self.energy = 0`
- [rpg_server.py:209](file:///workspace/shared/rpg/rpg_server.py#L209) - `reset_battle()` 中的能量重置
- [rpg_shell.js:97-107](file:///workspace/shared/rpg/rpg_shell.js#L97-L107) - `refreshState()` 函数

### Bug 4: 五子棋棋盘无法落子

**根本原因**：
1. 在 `wuziqi/static/app.js` 的 `onPieceClick()` 中，`_isCurrentTurnPlayerControlled()` 判断当前回合是否由玩家控制
2. 初始状态下 `board_state.current_turn` 为 `black`，但 `player_side` 也是 `black`（在 RPG 模式下通过属性传递）
3. 问题可能在于：`board_state.player_side` 初始值与 `playerSide` 属性不一致，或者 `_isCurrentTurnPlayerControlled()` 逻辑有问题

**关键代码位置**：
- [wuziqi/static/app.js:2509-2543](file:///workspace/wuziqi/static/app.js#L2509-L2543) - `onPieceClick()`
- [wuziqi/static/app.js:2761-2777](file:///workspace/wuziqi/static/app.js#L2761-L2777) - `_isCurrentTurnPlayerControlled()`
- [wuziqi/main.py:234-235](file:///workspace/wuziqi/main.py#L234-L235) - `make_move()` 中的玩家判断

---

## 修复步骤

### 阶段 A：修复序章加载问题（Bug 1）

**A1. 修改 `rpg_shell.js` 的 `loadChapter()` 函数**

- 文件：[shared/rpg/rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js)
- 改动：在纯 VN 章节分支中，调用 `_hideBoard()` 替代 `_unmountBoard()`，确保正确显示占位符

**A2. 修改 `_playChapterStory()` 函数**

- 文件：[shared/rpg/rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js)
- 改动：确保 `StoryLayer.show()` 被正确调用，添加错误处理

**A3. 验证 `StoryLayer.playChapter()` 流程**

- 文件：[shared/rpg/story_layer.js](file:///workspace/shared/rpg/story_layer.js)
- 改动：添加调试日志，确保 `Preview.playStory()` 正确执行

---

### 阶段 B：修复 API Key 读取和保存问题（Bug 2）

**B1. 修改 `rpg_shell.js` 的 `openSettings()` 函数**

- 文件：[shared/rpg/rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js)
- 改动：打开设置时调用 `/api/rpg/apikey` 获取当前状态并显示

**B2. 添加设置状态更新逻辑**

- 文件：[shared/rpg/rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js)
- 改动：在 `_onSaveSettings()` 成功后更新状态显示

**B3. 验证后端 API**

- 文件：[shared/rpg/rpg_server.py](file:///workspace/shared/rpg/rpg_server.py)
- 改动：确保 `_load_default_api_key()` 正确从 `config.json` 读取

---

### 阶段 C：修复能量条显示问题（Bug 3）

**C1. 修改 `rpg_server.py` 的初始能量值**

- 文件：[shared/rpg/rpg_server.py](file:///workspace/shared/rpg/rpg_server.py)
- 改动：调整初始能量值，确保非零显示

**C2. 验证前端状态刷新**

- 文件：[shared/rpg/rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js)
- 改动：确保 `refreshState()` 正确更新能量条 UI

**C3. 验证 move_complete 能量奖励**

- 文件：[shared/rpg/rpg_server.py](file:///workspace/shared/rpg/rpg_server.py)
- 改动：确保走棋完成后能量增加逻辑正确

---

### 阶段 D：修复五子棋落子问题（Bug 4）

**D1. 修改 `wuziqi/static/app.js` 的 `_isCurrentTurnPlayerControlled()`**

- 文件：[wuziqi/static/app.js](file:///workspace/wuziqi/static/app.js)
- 改动：确保在 RPG 模式下正确判断玩家回合

**D2. 修改 `wuziqi/main.py` 的 `make_move()`**

- 文件：[wuziqi/main.py](file:///workspace/wuziqi/main.py)
- 改动：确保 `player_side` 的获取逻辑正确

**D3. 验证 RPG 模式下的玩家设置**

- 文件：[shared/rpg/rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js)
- 改动：确保 `_mountBoard()` 正确传递 `player-side` 属性

---

## 验证步骤

### 单元验证

1. **Bug 1 验证**：
   - 启动服务，点击"开始游戏"
   - 验证序章 VN 正常显示，不再显示"棋盘加载中"

2. **Bug 2 验证**：
   - 打开设置界面，验证 API Key 状态正确显示
   - 输入 API Key 并保存，验证保存成功

3. **Bug 3 验证**：
   - 进入对战章节，验证能量条显示非零初始值
   - 走棋后验证能量增加

4. **Bug 4 验证**：
   - 进入第0章五子棋对战，验证玩家可以落子
   - 验证 AI 自动回应对手

### 端到端验证

- 完整流程：标题屏 → 序章 VN → 第0章对战 → 落子 → 能量变化 → 下一章

---

## 风险与应对

| 风险 | 等级 | 应对 |
|---|---|---|
| 序章 VN 仍无法显示 | 高 | 添加详细调试日志，检查 Preview 初始化和故事数据加载 |
| API Key 广播失败 | 中 | 增加错误处理和重试机制 |
| 能量计算错误 | 低 | 添加单元测试验证能量公式 |
| 五子棋落子逻辑复杂 | 中 | 简化玩家回合判断逻辑，确保 RPG 模式下优先使用 `playerSide` 属性 |

---

## 文件变更清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| shared/rpg/rpg_shell.js | 修改 | 修复序章加载、API Key 状态、能量刷新 |
| shared/rpg/story_layer.js | 修改 | 添加调试日志 |
| shared/rpg/rpg_server.py | 修改 | 修复初始能量、API Key 读取 |
| wuziqi/static/app.js | 修改 | 修复玩家回合判断 |
| wuziqi/main.py | 修改 | 修复 player_side 判断 |
