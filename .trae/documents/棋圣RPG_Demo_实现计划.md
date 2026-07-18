# 棋圣 (ChessSage) RPG Demo — 实现计划

> 基于「执行方案.md」阶段 A-H，结合代码探索结果与用户决策制定。
> 本计划为执行蓝图，经用户确认后由实施阶段严格遵循。

---

## 一、摘要

将现有「无限制象棋 / 五子棋 / 剧情编辑器」三子项目包装为一款带剧情的棋类 RPG demo。采用 **Option A 架构**：RPG 外壳（端口 80）+ iframe 嵌入棋类 + 严格 postMessage 协议。

**范围（用户确认）**：MVP 优先 + 框架完整。
- **必须稳定可玩**：序章·觉醒 → 第 0 章·五子棋教程 → 第 1 章·象棋首战（端到端）。
- **框架完整搭建**：rpg_server / rpg_adapter / 作弊评估执行链路 / VN 故事层 / 能量识破系统全部就位。
- **其余章节**：第 2-5 章剧情 JSON 与章节导航作为可运行骨架（内容精简），保证流程能走通。
- **围棋**：用户将单独提供 `go/` 文件夹。本计划不实现围棋引擎，但预留接入点；围棋服务未就绪时，RPG 外壳优雅降级（章节显示「围棋服务未提供」并允许跳过）。

**三大优先级**：稳定性 > 核心爽点（对手合理化台词）> 完成度。

---

## 二、当前状态分析（探索结论）

### 2.1 已存在且可复用

| 路径 | 状态 | 说明 |
|---|---|---|
| [xiangqi/main.py](file:///workspace/xiangqi/main.py) | ✅ 完整 | FastAPI 端口 8000，GameState 模式，`/api/move` `/api/ai_move` `/api/command` 齐全 |
| [wuziqi/main.py](file:///workspace/wuziqi/main.py) | ⚠️ 端口冲突 | 与象棋同用 8000，需改为 8001；结构与象棋一致 |
| [xiangqi/ai_orchestrator.py](file:///workspace/xiangqi/ai_orchestrator.py) | ✅ 完整 | 二级 AI 编排，返回 `classification`，**未返回 `cost_energy`**（需扩展） |
| [story-editor/modules/preview.js](file:///workspace/story-editor/modules/preview.js) | ⚠️ 依赖问题 | `Preview.playStory()` 可用；但依赖全局 `VariableManager`（来自 [story-editor/modules/variable-manager.js](file:///workspace/story-editor/modules/variable-manager.js)），且 `init()` 查找 `preview-stage` id（RPG 外壳用 `vn-stage`） |
| [shared/assets/characters/](file:///workspace/shared/assets/characters) | ✅ 完整 | boy 18 张 + robot 17 张立绘，两棋类已通过 `/assets` 挂载共用 |
| [shared/json_patch_utils.py](file:///workspace/shared/json_patch_utils.py) | ✅ 完整 | RFC 6902 apply_patch / generate_diff |
| [shared/schema_validator.py](file:///workspace/shared/schema_validator.py) | ✅ 完整 | board_state/pieces/rules 校验 |
| [story-editor/stories/sample-story.json](file:///workspace/story-editor/stories/sample-story.json) | ✅ 完整 | story JSON 格式参考 |
| [xiangqi/api密钥.txt](file:///workspace/xiangqi/api密钥.txt) | ✅ 存在 | DeepSeek Key，RPG 启动后可读取并下发 |

### 2.2 不存在 / 需新建

- **`/workspace/go/` 目录完全不存在**（已用 `find /` 全盘确认，仅匹配到 Go 编程语言安装目录）。用户表示将单独提供。本计划跳过围棋引擎实现，预留接入点。
- `shared/rpg/` 目录及全部文件（rpg_server.py / rpg_shell.html/js / cheat_panel.js / story_layer.js / rpg_adapter.js / dialogue_templates.json / vn_player/ / rpg_style.css）—— 全部新建。
- `rpg_data/chapters/` 7 个章节 JSON —— 全部新建。

### 2.3 关键技术约束（探索确认）

1. **`preview.js` 的两个隐患**（必须处理）：
   - 依赖全局 `VariableManager`（preview.js 第 258/312/323 行调用 `VariableManager.evaluateCondition` / `applyOperation`）。RPG 外壳需一并复制 [variable-manager.js](file:///workspace/story-editor/modules/variable-manager.js) 或内联最小实现。
   - `init()` 第 27 行用 `document.getElementById('preview-stage')` 注册点击继续；RPG 外壳预置的是 `vn-stage`。需把复制后的 preview.js 中 `preview-stage` 改为 `vn-stage`（或外壳额外给容器加 `preview-stage` id）。
2. **棋类 move 响应不含 `captured_piece`/`game_ended` 字段**：xiangqi/wuziqi 的 `/api/move` `/api/ai_move` 只返回 `{success, board_state, mechanisms}`。rpg_adapter.js 不能直接读这些字段，需从 `board_state.move_history[-1].captured` 与 `board_state.game_status` 推导。
3. **player_side 不一致**：象棋玩家=红方，五子棋玩家=黑方（`board_state.player_side`）。RPG 层判定 `mover` 必须按 `player_side` 而非硬编码。
4. **`ai_orchestrator.process_command` 返回值**已含 `classification`（A/B/C/C+/D/E），但无 `cost_energy`。阶段 G 需扩展 prompt + 透传。
5. **CONFIG_FILES 统一**：`["board_state", "board", "pieces_red", "pieces_black", "rules", "ui_config"]`，三个棋类共用此结构，rpg_server 转发逻辑可统一。
6. **CORS 已开启**（`allow_origins=["*"]`），跨域 fetch 无障碍。

---

## 三、关键决策与假设

### 决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 围棋引擎不实现，等用户提供 `go/` 文件夹 | 用户明确指示；`go/` 当前不存在 |
| D2 | wuziqi 端口 8000 → 8001 | 避免与象棋冲突；执行方案附录 B 已规定 |
| D3 | preview.js 复制到 `shared/rpg/vn_player/preview.js` 并打两处补丁（`preview-stage`→`vn-stage`；内联最小 `VariableManager`） | 复用而非改造；避免污染 story-editor 原文件 |
| D4 | rpg_adapter.js 从 `board_state.move_history[-1]` 与 `game_status` 推导吃子/胜负 | 棋类零改动；move 响应字段不足 |
| D5 | 对手合理化台词严格用预脚本模板库（`dialogue_templates.json`），不用 AI 生成 | 执行方案第 3.1 节明确要求稳定性 |
| D6 | 章节剧情 JSON 复用 story-editor 格式（characters/backgrounds/scenes/nodes） | preview.js 原生支持 |
| D7 | RPG 全局状态（能量/识破/章节/cheats_used/was_detected）存内存 dict + JSON 存档 | 与现有棋类 GameState 模式一致 |
| D8 | 不实现已删除机制（冷却/道具/经济/经验/大地图/现实扭曲/禁用作弊类型） | 执行方案第 2.3 节 |

### 假设

- 用户提供的 `go/` 文件夹将遵循 xiangqi/wuziqi 的目录结构与 API 路由约定（`/api/move` `/api/ai_move` `/api/command` `/api/config/*`），端口 8002。若不一致，接入时需小幅适配。
- DeepSeek API Key 在 `xiangqi/api密钥.txt` 可读，RPG 启动时加载并下发到三个棋类服务。
- 沙箱内 4 个端口（80/8000/8001/8002）可同时监听。

---

## 四、实施步骤（按执行方案阶段 A-H）

### 阶段 A：后端基础设施

**A1. 创建 `shared/rpg/` 目录与文件骨架**
- 新建目录：`shared/rpg/`、`shared/rpg/vn_player/`
- 新建空文件占位（后续步骤填充）：`rpg_server.py`、`rpg_shell.html`、`rpg_shell.js`、`cheat_panel.js`、`story_layer.js`、`rpg_adapter.js`、`rpg_style.css`、`dialogue_templates.json`、`vn_player/preview.js`、`vn_player/vn_style.css`
- 新建 `rpg_data/chapters/` 目录

**A2. 实现 `shared/rpg/rpg_server.py`**（FastAPI 端口 80）
- 全局状态 `rpg_state`：`{energy, detection, was_detected, cheats_used, turn_count, current_chapter, chess_type, player_side, api_key, chapter_progress}`
- 启动时尝试读取 `xiangqi/api密钥.txt` 作为默认 Key
- 路由（按执行方案 4.6 节）：
  - `GET /` → 返回 rpg_shell.html
  - `GET /shared/rpg/*` → 静态文件（JS/CSS/preview.js）
  - `GET /shared/assets/*` → 挂载共享立绘
  - `GET /api/rpg/chapter/{chapter_id}` → 返回章节元信息（chess_type + iframe_url + player_side + opponent）
  - `POST /api/rpg/battle/start` → 初始化能量=0、记录章节、重置 turn_count
  - `POST /api/rpg/cheat/assess` → 转发到对应棋类 `/api/command`（仅意图解析，取 `cost_energy`），返回 `{cost_energy, classification, feasible, message}`
  - `POST /api/rpg/cheat/use` → 检查能量≥30 或可透支 → 转发 `/api/command` 完整执行 → 扣能量、累加识破、掷骰 `was_detected` → 返回 `{success, energy, detection, opponent_dialogue, modified_configs}`
  - `POST /api/rpg/move_complete` → 接收 `{captured, mover, is_check, game_ended}`，按规则加能量（吃子+10/被吃+5/将军+3/五连+15/每5回合+2）
  - `POST /api/rpg/battle/end` → 结算章节进度
  - `GET /api/rpg/state` → 全局状态
  - `GET /api/rpg/vn/{story_id}` → 返回 `rpg_data/chapters/{story_id}.json`
  - `POST /api/rpg/apikey` → 设置并下发到三个棋类服务
- 棋类服务端口映射：`xiangqi→8000`、`wuziqi→8001`、`go→8002`（go 不可达时返回降级标记）
- 识破概率计算（执行方案 2.2 节）：`增量 = 2% + cost_energy×0.5% + max(0,-能量/10)×3%`，封顶 95%

**A3. xiangqi/main.py 与 wuziqi/main.py 添加 `/api/rpg/*` 代理路由**
- `POST /api/rpg/apply_patch`：接收 `{patch, target}`，用 `json_patch_utils.apply_patch` 应用到 `state.configs[target]` 并 `save_config` + `_rebuild_engines`
- `POST /api/rpg/apply_rules`：应用 rules_overrides（同上，target="rules"）
- `POST /api/rpg/reset_battle`：重置棋盘到初始状态（复用 `state.reset_board()`），供 RPG 每局开始调用
- **wuziqi/main.py 端口 8000 → 8001**（文件末尾 `uvicorn.run` 与启动打印）

### 阶段 B：围棋（跳过引擎实现，预留接入点）

**B1. 不创建 `go/` 目录**（用户将提供）
- rpg_server 的章节配置中，第 2 章（ch03_go_intro）与第 5 章（ch06_finale_go）的 `chess_type: "go"`、`iframe_url: "http://localhost:8002/?rpg=1"`
- go 服务不可达时：rpg_shell.js 在加载 iframe 前先 `fetch('http://localhost:8002/api/config/all')` 探活，失败则弹出 VN 提示「围棋服务未提供，请放置 go/ 文件夹后重启；本章已自动跳过」并标记章节完成
- 用户提供 `go/` 后，只需：启动 go:8002 → 无需改 RPG 代码即可接入（前提：go 遵循统一 API 路由约定，见假设）

### 阶段 C：前端 RPG 层

**C1. `shared/rpg/rpg_shell.html`**
- 顶部状态栏：`#rpg-chapter-title` / `#rpg-energy-display` / `#rpg-detection-display`（默认隐藏）
- `#rpg-battle-container > iframe#rpg-chess-iframe`
- `#rpg-cheat-panel`（棋圣系统面板，含能量条/输入框/评估按钮/确认按钮/取消按钮）
- `#vn-stage`（VN 故事层，预置 preview.js 期望的 9 个 DOM id：`#vn-bg` `#vn-chars` `#vn-dialog` `#vn-char-name` `#vn-text` `#vn-continue-hint` `#vn-choices` `#vn-effects`）
- `<script>` 引入 preview.js / rpg_shell.js / cheat_panel.js / story_layer.js

**C2. `shared/rpg/rpg_shell.js`**
- 章节/能量/识破状态管理（与 `/api/rpg/*` 交互）
- `loadChapter(chapterId)`：拉章节信息 → 若有 chess_type 则探活对应端口 → 加载 iframe（src 带 `?rpg=1`）→ 否则纯 VN
- postMessage 监听：`RPG_READY`（iframe 就绪，发 `RPG_INIT`）/ `RPG_MOVE_COMPLETE`（调用 `/api/rpg/move_complete` 加能量）/ `RPG_GAME_END`（调用 `/api/rpg/battle/end`）
- 能量条 UI 更新

**C3. `shared/rpg/cheat_panel.js`**
- 输入框 + 「评估消耗」按钮 → `POST /api/rpg/cheat/assess` → 显示 `cost_energy` 与 `classification`
- 「确认执行」按钮 → `POST /api/rpg/cheat/use` → 收到结果后：
  1. 更新能量/识破 UI
  2. 通过 postMessage 把 `modified_configs` 发给 iframe（`RPG_APPLY_CHEAT`）
  3. 调用 `StoryLayer.playOpponentDialogue(opponent_char_id, text)` 播放对手合理化台词
- 「取消」按钮：清空输入、禁用执行按钮

**C4. `shared/rpg/story_layer.js` + 复制 preview.js**
- 复制 [story-editor/modules/preview.js](file:///workspace/story-editor/modules/preview.js) → `shared/rpg/vn_player/preview.js`，打两处补丁：
  - `getElementById('preview-stage')` → `getElementById('vn-stage')`
  - 文件顶部内联最小 `VariableManager`（evaluateCondition / applyOperation），或额外复制 [variable-manager.js](file:///workspace/story-editor/modules/variable-manager.js) 并在 rpg_shell.html 引入
- 复制 [story-editor/style.css](file:///workspace/story-editor/style.css) 中 `.vn-*` 相关样式 → `shared/rpg/vn_player/vn_style.css`
- `StoryLayer` 模块：
  - `playChapter(storyId, sceneId)`：fetch `/api/rpg/vn/{storyId}` → `Preview.playStory(data, sceneId)`
  - `playOpponentDialogue(charId, text)`：动态构造临时 story JSON（1 dialogue + 1 end，见执行方案 3.3 节）→ `Preview.playStory`
  - `playSystemMessage(text)`：棋圣系统台词（character_id 指向 robot）
  - `onEnd` 回调：返回 RPG 外壳控制权

### 阶段 D：棋类 adapter

**D1. `shared/rpg/rpg_adapter.js`**（三种棋类共用）
- 检测 `?rpg=1` 启用 RPG 模式：隐藏原生 `.input-section`、把 `h3[data-num="01"]` 文案改为「棋圣系统」
- 监听 `RPG_INIT` → 回发 `RPG_READY`
- 监听 `RPG_APPLY_CHEAT` → `fetch('/api/rpg/apply_patch', {patch, target})`
- Hook `window.fetch`：拦截 `/api/move` `/api/ai_move` 响应，从 `board_state.move_history[-1]` 取 `captured`，从 `board_state.game_status` 取 `game_ended`/`winner`，按 `board_state.player_side` 判定 `mover`，回发 `RPG_MOVE_COMPLETE` / `RPG_GAME_END`
- `load` 事件回发 `RPG_READY`

**D2. 三棋类 index.html 各加一行**
- [xiangqi/static/index.html](file:///workspace/xiangqi/static/index.html)（在 `</body>` 前 `app.js` 之后）
- [wuziqi/static/index.html](file:///workspace/wuziqi/static/index.html)（同上）
- go/static/index.html（用户提供 go/ 后再加，或由用户自行加）
- 引用：`<script src="http://localhost:80/shared/rpg/rpg_adapter.js"></script>`

### 阶段 E：核心玩法端到端

**E1. `cheat_assess` + `cheat_use` 链路**
- assess：rpg_server 转发到棋类 `/api/command`，**但需要让 ai_orchestrator 支持「仅意图解析不应用」模式**。方案：在 ai_orchestrator 加 `dry_run` 参数，或 rpg_server 直接复用 ai_orchestrator 的 `_parse_intent_with_log`。简化做法：assess 阶段调用棋类 `/api/command` 但棋类先不应用（需 ai_orchestrator 支持 dry_run）。
  - **简化决策**：assess 阶段直接调用棋类 `/api/command` 完整流程，但不让棋类 `apply_config_update`。为此在 xiangqi/wuziqi 的 main.py 加查询参数 `?dry_run=1` 给 `/api/command`，dry_run 时返回 `cost_energy`/`classification` 但不调用 `state.apply_config_update`。use 阶段则正常调用（不带 dry_run）。
- use：检查能量 → 调用棋类 `/api/command`（完整执行）→ 棋类返回 `modified_configs` → rpg_server 扣能量、算识破、掷骰 → 返回 `opponent_dialogue`（从 dialogue_templates.json 按 classification 取随机模板）

**E2. 对手合理化台词触发**
- rpg_server 启动时加载 `dialogue_templates.json`（缺失用 default）
- `cheat_use` 返回中包含 `opponent_dialogue` 字段（已选中的台词文本）
- cheat_panel.js 收到后调用 `StoryLayer.playOpponentDialogue(current_opponent_id, text)`

### 阶段 F：剧情内容

**F1. `shared/rpg/dialogue_templates.json`**
- 按 execution 方案 3.2 节：`skip_turns`/`ai_control`/`random_moves`/`rule_modify`/`board_transform`/`piece_create`/`default` 各 3-5 条

**F2. 7 个章节 JSON（`rpg_data/chapters/`）**
- `ch00_prologue.json`（序章·觉醒，纯 VN，主角连输 13 把五子棋→觉醒棋圣系统）—— **完整内容**
- `ch01_tutorial_wuziqi.json`（第 0 章·教程，五子棋，棋圣系统教作弊）—— **完整内容**
- `ch02_city_xiangqi.json`（第 1 章·入门，象棋首战 vs aggressive NPC）—— **完整内容**
- `ch03_go_intro.json`（第 2 章·进阶，围棋首战）—— **精简骨架**（围棋服务未就绪时自动跳过）
- `ch04_boss_wuziqi.json`（第 3 章·BOSS 战，五子棋六连变体）—— **精简骨架**
- `ch05_final_xiangqi.json`（第 4 章·终极对决，象棋 vs 会作弊的 BOSS）—— **精简骨架**
- `ch06_finale_go.json`（第 5 章·终局 + 终章结局，围棋最终 BOSS + 三结局判定）—— **精简骨架 + 结局判定逻辑**
- 每个章节 JSON 复用 story-editor 格式，character_id 用 `boy`/`robot` + 章节专属对手（复用 boy/robot 立绘或用纯色块）

### 阶段 G：扩展 prompt 加 cost_energy

**G1. xiangqi/prompts.py 与 wuziqi/prompts.py**
- 在 `INTENT_PARSER_SYSTEM` 的输出格式说明中追加 `cost_energy` 字段说明（执行方案 6.1 节）
- 在所有示例 JSON 顶层追加 `"cost_energy": <对应数值>`

**G2. xiangqi/ai_orchestrator.py 与 wuziqi/ai_orchestrator.py**
- `process_command` 主返回与各 `_handle_action_*` 分支返回中追加 `"cost_energy": intent.get("cost_energy", 0)`
- AI 返回值 clamp 到 0-10

**G3. `/api/command` 支持 dry_run**
- xiangqi/main.py 与 wuziqi/main.py 的 `process_command` 接受 `dry_run` 查询参数，dry_run 时不调用 `state.apply_config_update`

### 阶段 H：端到端测试与优化

**H1. 自测清单**（对应验证标准）
1. `python -m py_compile` 所有新建 .py 无语法错误
2. 启动 rpg_server:80 / xiangqi:8000 / wuziqi:8001（go:8002 暂不启动，验证降级）
3. 访问 http://localhost/ 进入序章
4. 序章 VN 能播放（preview.js 补丁生效、VariableManager 可用）
5. 第 0 章五子棋教程能进行对战（iframe 加载、postMessage 通路）
6. 棋圣系统能评估并执行作弊（assess 显示 cost_energy，use 扣能量）
7. 作弊后能触发对手合理化台词（StoryLayer.playOpponentDialogue）
8. 能量条正确扣减与吃子加成（move_complete 链路）
9. 端到端序章 → 第 0 章 → 第 1 章首战胜利

**H2. 降级与容错**
- go 服务不可达：章节自动跳过 + VN 提示
- AI 调用超时（30s）：返回「棋圣系统思考中」，不阻塞棋局
- AI 返回非法 JSON：降级为「作弊失败，能量不扣除」
- preview.js 播放失败：fallback 为 `alert()` 显示台词
- 无 API Key：禁用作弊，纯棋类流程（可触发真结局）

---

## 五、变更记录（相对执行方案.md 的调整）

| 日期 | 位置 | 原因 | 改动 |
|---|---|---|---|
| 2026-07-18 | 阶段 B | 用户表示将单独提供 go/ 文件夹，当前沙箱无 go/ | 跳过围棋引擎实现，rpg_server 预留接入点 + 不可达降级 |
| 2026-07-18 | 阶段 E / assess | ai_orchestrator 无 dry_run 模式 | 在棋类 /api/command 加 ?dry_run=1 查询参数 |
| 2026-07-18 | 阶段 C4 / preview.js | preview.js 依赖 VariableManager 且用 preview-stage id | 复制时打补丁：内联最小 VariableManager + preview-stage→vn-stage |
| 2026-07-18 | 阶段 D1 / rpg_adapter | 棋类 move 响应不含 captured_piece/game_ended 字段 | adapter 从 board_state.move_history[-1] 与 game_status 推导 |
| 2026-07-18 | 阶段 F2 | MVP 优先策略 | ch00/ch01/ch02 完整内容；ch03-ch06 精简骨架 + 结局判定 |

---

## 六、文件清单（新建/修改）

### 新建
- `shared/rpg/rpg_server.py`
- `shared/rpg/rpg_shell.html` / `rpg_shell.js` / `cheat_panel.js` / `story_layer.js` / `rpg_adapter.js`
- `shared/rpg/rpg_style.css`
- `shared/rpg/dialogue_templates.json`
- `shared/rpg/vn_player/preview.js`（复制+补丁）/ `vn_style.css`（复制+裁剪）/ `variable_manager.js`（复制或内联）
- `rpg_data/chapters/ch00_prologue.json` … `ch06_finale_go.json`（7 个）
- `rpg_data/save_schema.json`

### 修改
- `wuziqi/main.py`（端口 8000→8001；加 `/api/rpg/*` 路由；`/api/command` 支持 dry_run）
- `xiangqi/main.py`（加 `/api/rpg/*` 路由；`/api/command` 支持 dry_run）
- `xiangqi/prompts.py` / `wuziqi/prompts.py`（INTENT_PARSER_SYSTEM 加 cost_energy）
- `xiangqi/ai_orchestrator.py` / `wuziqi/ai_orchestrator.py`（透传 cost_energy）
- `xiangqi/static/index.html` / `wuziqi/static/index.html`（加一行 rpg_adapter.js 引用）

### 不动
- `shared/schema_validator.py` / `json_patch_utils.py` / `schemas/` / `assets/`
- `story-editor/`（仅复制 preview.js / variable-manager.js / 部分 CSS，不修改原文件）
- `xiangqi/rule_engine.py` / `chess_ai.py` / `mechanism_engine.py`
- `wuziqi/rule_engine.py` / `chess_ai.py` / `mechanism_engine.py`

---

## 七、实施顺序建议（todo 列表）

1. 阶段 A（A1→A2→A3）：rpg_server 骨架 + 棋类代理路由 + wuziqi 端口
2. 阶段 C（C1→C4）：前端 RPG 层 + preview.js 复制补丁
3. 阶段 D（D1→D2）：rpg_adapter.js + 两棋类 index.html 引用
4. 阶段 G（G1→G3）：prompt 扩展 + orchestrator 透传 + dry_run（先做 G 才能测 E）
5. 阶段 E（E1→E2）：cheat 链路 + 对手台词触发
6. 阶段 F（F1→F2）：dialogue_templates + 7 章节 JSON（ch00/ch01/ch02 重点）
7. 阶段 H：端到端测试 + 降级容错
8. （用户提供 go/ 后）阶段 B 接入：启动 go:8002 + go/static/index.html 加 adapter 引用
