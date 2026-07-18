# 棋圣 RPG Demo 收尾实施计划

> 本计划承接上下文丢失前的进度。阶段 A（后端骨架）、C（前端 RPG 层）、D（棋类适配器）已完成；阶段 G（cost_energy）部分完成但存在 P0 级 BUG；阶段 E/F/H 未开始。本计划聚焦**收尾剩余工作**，严格遵循原执行方案与三大优先级（稳定性 > 核心爽点 > 完成度）。

---

## 一、当前状态分析（Phase 1 探索结论）

### ✅ 已完成（无需改动）
| 模块 | 文件 | 状态 |
|---|---|---|
| RPG 后端 | `shared/rpg/rpg_server.py` | RpgState / CHAPTERS(7章) / 9 条路由 / 识破公式 / 结局判定 全部就位 |
| 棋类代理路由 | `xiangqi/main.py`、`wuziqi/main.py` | `/api/rpg/apply_patch`、`apply_rules`、`reset_battle` 就位；wuziqi 端口已改 8001 |
| 前端 RPG 层 | `shared/rpg/rpg_shell.html/js`、`rpg_style.css`、`story_layer.js`、`cheat_panel.js` | 全部就位 |
| VN 引擎 | `shared/rpg/vn_player/preview.js`、`variable_manager.js`、`vn_style.css` | 已从 story-editor 复制并打补丁（`vn-stage` id + `setOnEnd`） |
| 棋类适配器 | `shared/rpg/rpg_adapter.js` + 两棋类 `index.html` | `?rpg=1` 启用 / fetch hook / postMessage 协议就位 |

### ⚠️ 阶段 G 部分完成（含 P0 BUG）
1. **`xiangqi/ai_orchestrator.py`** — cost_energy 已加到 5 个返回点，**但提取位置错误**：第 373 行 `cost_energy = max(0, min(10, ...))` 位于 `if not intent.get("feasible")` 检查（第 353 行）**之后**，而第 366 行 feasible=False 分支已引用 `cost_energy` → 触发 `NameError`，导致任何「不可行」指令直接 500 崩溃。
2. **`wuziqi/ai_orchestrator.py`** — cost_energy **完全未添加**（5 个返回点全缺，无提取语句）。
3. **`xiangqi/prompts.py`、`wuziqi/prompts.py`** — `INTENT_PARSER_SYSTEM` **完全未提及 cost_energy 字段**，LLM 永不输出该值，`intent.get("cost_energy", 0)` 恒为 0 → 能量机制形同虚设。

### ⚠️ 阶段 A 遗留缺口
4. **`xiangqi/main.py`、`wuziqi/main.py` 的 `/api/command`** — 签名为 `async def process_command(req: PlayerCommand)`，**不接受 `dry_run` 参数**。而 `rpg_server.py` 第 485-489 行 `cheat_assess` 会发 `params={"dry_run": "1"}`。当前 dry_run 被静默忽略 → **「评估消耗」实际会完整执行作弊并写入配置**，破坏 cheat/assess 与 cheat/use 的分离设计。

### ❌ 阶段 F 完全未开始
5. `shared/rpg/dialogue_templates.json` — **不存在**，后端回退到单条默认台词（核心爽点失效）。
6. `rpg_data/chapters/` — 目录存在但**为空**，7 个章节 JSON 全缺 → `/api/rpg/vn/{story_id}` 全部 404，VN 无法播放。

### ❌ Go（围棋）子项目
7. `/workspace/go/` 目录**不存在**。按 D1 决策：跳过实现，rpg_server 的 `chess_health_check` 已能在 go 服务不可达时返回 False，rpg_shell.js 会提示「跳过本章」。ch03/ch06 两章按降级处理。

---

## 二、Story JSON 格式（Phase F 依据，已从 preview.js 验证）

`Preview.playStory(storyData, startSceneId, opts)` 期望的 `storyData` 结构：

```json
{
  "characters": [{"id": "boy", "name": "少年", "color": "#7dd3fc"}],
  "backgrounds": [{"id": "bg_1", "name": "主背景", "url": ""}],
  "variables": {},
  "start_scene_id": "scene_1",
  "scenes": [
    {
      "id": "scene_1",
      "start_node_id": "n1",
      "nodes": [
        {"id": "n1", "type": "bg", "data": {"bg_id": "bg_1", "transition": "fade", "next": "n2"}},
        {"id": "n2", "type": "show_char", "data": {"character_id": "boy", "expression": "normal", "position": "center", "next": "n3"}},
        {"id": "n3", "type": "dialogue", "data": {"character_id": "boy", "text": "……", "expression": "normal", "next": "n4"}},
        {"id": "n4", "type": "end", "data": {"ending_type": "neutral", "text": ""}}
      ]
    }
  ]
}
```

**节点类型与 data 字段**（preview.js 第 132-345 行）：
- `bg`：{bg_id, transition, next}
- `show_char`：{character_id, expression, position, transition, next}
- `hide_char`：{character_id, transition, next}
- `dialogue`：{character_id, text, expression, next}
- `narration`：{text, next}
- `choice`：{options: [{text, next_scene_id, next_node_id, condition?}]}
- `jump`：{target_scene_id, target_node_id}
- `condition`：{variable, operator, value, true_next, false_next}
- `set_var`：{variable, operation, value, next}
- `wait`：{duration_ms, next}
- `end`：{ending_type: "good"|"bad"|"neutral"|"secret", text}

**立绘路径**：`/shared/assets/characters/boy/*.png`（19 张）、`/shared/assets/characters/robot/*.png`（18 张）。背景无图片时 `url` 留空，由 CSS 渐变兜底。

---

## 三、待修改/新增文件清单与实施步骤

### 🔴 P0：阶段 G 修复（稳定性最优先）

#### 步骤 1：修复 `xiangqi/ai_orchestrator.py` 的 NameError BUG
- **文件**：`/workspace/xiangqi/ai_orchestrator.py`
- **改法**：将第 370-373 行的 cost_energy 提取语句块，**整体上移**到第 352 行 `# 不可行请求` 注释**之前**（即 `if not intent:` 空检查之后、`if not intent.get("feasible")` 之前）。
- **改动后顺序**：
  1. `if not intent:` 空检查（保持）
  2. `classification = intent.get("classification", "")`
  3. `log_entry["classification"] = classification`
  4. `cost_energy = max(0, min(10, int(intent.get("cost_energy", 0) or 0)))`
  5. `if not intent.get("feasible", False):` → 返回含 `"cost_energy": cost_energy`
- **5 个返回点保持现状**（已正确含 cost_energy）。
- **验证**：`python -m py_compile xiangqi/ai_orchestrator.py`

#### 步骤 2：为 `wuziqi/ai_orchestrator.py` 补齐 cost_energy
- **文件**：`/workspace/wuziqi/ai_orchestrator.py`
- **改法**：完全镜像 xiangqi 的结构：
  1. 在 `if not intent:` 空检查之后、`if not intent.get("feasible")` 之前，插入：
     ```python
     classification = intent.get("classification", "")
     log_entry["classification"] = classification
     cost_energy = max(0, min(10, int(intent.get("cost_energy", 0) or 0)))
     ```
  2. 5 个返回点逐一添加 `"cost_energy": cost_energy`（或 `result["cost_energy"] = cost_energy`）：
     - feasible=False rejected 返回
     - E 类 fun 返回
     - F 类 advanced 返回
     - A 类 mechanism：`result["cost_energy"] = cost_energy`
     - B/C/D 多 action：`result["cost_energy"] = cost_energy`
- **注意**：wuziqi 的 ai_orchestrator 与 xiangqi 结构高度相似，需先 Read 确认其行号与分支名一致。
- **验证**：`python -m py_compile wuziqi/ai_orchestrator.py`

#### 步骤 3：扩展 `xiangqi/prompts.py` 的 INTENT_PARSER_SYSTEM
- **文件**：`/workspace/xiangqi/prompts.py`
- **改法**：在 `INTENT_PARSER_SYSTEM` 字符串中：
  1. 在「输出字段说明」区域追加一行字段说明：
     `cost_energy (整数 0-10)：该作弊的能量消耗评估。0=无消耗（如纯搞笑/查询），3=轻度（改个 UI 文案），5=中度（改单枚棋子属性），8=重度（改规则/多棋子），10=颠覆性（直接获胜/大范围重写）。`
  2. 在输出 JSON 示例的**顶层**追加 `"cost_energy": <对应数值>`（与 feasible/classification 同级）。
  3. 在「不可行请求」的示例 JSON 中也保留 `"cost_energy": 0`。
- **验证**：`python -m py_compile xiangqi/prompts.py`；`grep -n cost_energy xiangqi/prompts.py` 应有 ≥3 处命中。

#### 步骤 4：扩展 `wuziqi/prompts.py` 的 INTENT_PARSER_SYSTEM
- **文件**：`/workspace/wuziqi/prompts.py`
- **改法**：与步骤 3 完全一致（两棋类 prompt 同步）。
- **验证**：同上。

---

### 🟡 P1：dry_run 支持（cheat assess/use 分离）

#### 步骤 5：`xiangqi/main.py` 的 `/api/command` 加 dry_run
- **文件**：`/workspace/xiangqi/main.py`（第 229-247 行）
- **改法**：
  1. 顶部确认已 `from fastapi import Query`（若无需补 import）
  2. 签名改为：`async def process_command(req: PlayerCommand, dry_run: str = Query(None)):`
  3. 在 `result = await state.ai_orchestrator.process_command(...)` 之后，将应用配置的逻辑改为条件触发：
     ```python
     is_dry_run = dry_run == "1"
     if (not is_dry_run) and result.get("success") and result.get("type") == "applied":
         modified = result.get("modified_configs", {})
         if modified:
             state.apply_config_update(modified)
     # dry_run 时仍返回 cost_energy/classification/feasible/message，但不写配置
     return result
     ```
- **验证**：`python -m py_compile xiangqi/main.py`

#### 步骤 6：`wuziqi/main.py` 的 `/api/command` 加 dry_run
- **文件**：`/workspace/wuziqi/main.py`（第 201-219 行附近）
- **改法**：与步骤 5 完全一致。
- **验证**：`python -m py_compile wuziqi/main.py`

---

### 🟡 P1：阶段 F 故事内容（核心爽点 + 可玩性）

#### 步骤 7：创建 `shared/rpg/dialogue_templates.json`
- **文件**：`/workspace/shared/rpg/dialogue_templates.json`（新建）
- **结构**：按 classification 分类的对手「认知扭曲台词」模板库。后端 `get_opponent_dialogue(classification)` 会按 key 取列表并随机一条。
- **分类与条数**（每类 4 条，共 24 条）：
  - `default`：通用合理化（对方未察觉异常时的自圆其说）
  - `A`：机制修改类（如「这步……应是定式变招，我竟未见过」）
  - `B`：棋子操作类（如「此子来路诡异，但落点倒也合乎棋理」）
  - `C`：规则类（如「规则本就是人定的，你只是看得更远罢了」）
  - `D`：UI/界面类（如「棋盘……似乎换了纹路，是我眼花了吗」）
  - `E`：搞笑类（如「哈哈，你这步……颇有童趣，但无伤大雅」）
- **风格约束**：每条 20-50 字，第二人称或自语，体现「认知扭曲」但**不点破作弊**，保持悬念。
- **示例**：
  ```json
  {
    "default": ["……这步棋……你说不上来哪里奇怪，但也说不上来哪里不对。", "嗯……是我疏忽了，此招确有道理。", "有趣，你竟走出此手，倒是出乎意料。", "……算了，棋局未定，不必多想。"],
    "A": ["这步……应是定式变招，我竟未见过，受教。", "机制如此，是我记错了古谱。", "此局规则我尚不熟，你倒精通。", "嗯……这便是新派下法，我老朽了。"]
  }
  ```

#### 步骤 8：创建章节 JSON —— ch00 序章（完整）
- **文件**：`/workspace/rpg_data/chapters/ch00_prologue.json`（新建）
- **章节**：序章·觉醒（无对战，纯 VN，约 4 分钟）
- **内容大纲**：
  - 场景 1（少年房间/夜）：少年（boy）研究残局困倦入睡
  - 场景 2（梦境）：棋圣系统（robot）现身，自述「我能让你看透棋局的另一面」
  - 场景 3（选择支）：少年选择「接受/拒绝」→ 均导向场景 4（拒绝则 robot 说「你会回来的」）
  - 场景 4：少年醒来，耳边回响棋圣的低语 → end（ending_type: neutral）
- **技术要求**：
  - characters: boy(少年) + robot(棋圣系统)
  - backgrounds: 2-3 个（可用空 url，CSS 渐变兜底）
  - nodes: bg/show_char/dialogue/choice/jump/end 混用，≥15 个节点
  - start_scene_id 设为 scene_1

#### 步骤 9：创建章节 JSON —— ch01 五子棋教程（完整）
- **文件**：`/workspace/rpg_data/chapters/ch01_tutorial_wuziqi.json`（新建）
- **章节**：第 0 章·教程（五子棋，棋圣系统教作弊，约 8 分钟）
- **内容大纲**：
  - 场景 1：棋圣系统（robot）讲解「能量」与「作弊指令」用法（教学）
  - 场景 2：进入对战前对话 → end（ending_type: neutral，触发 rpg_shell.js 调 `_startBattle`）
  - 对战由 iframe 承载，VN 在对战前后播放
- **注意**：本章 story_id 与 chapter_id 均为 `ch01_tutorial_wuziqi`，chess_type=wuziqi，player_side=black。VN 只需覆盖「战前教学 + 战后收尾」两部分；战前 VN 的 end 节点结束后 rpg_shell.js 自动加载 iframe。

#### 步骤 10：创建章节 JSON —— ch02 象棋首战（完整）
- **文件**：`/workspace/rpg_data/chapters/ch02_city_xiangqi.json`（新建）
- **章节**：第 1 章·入门（象棋首战 vs 街亭棋客，约 8 分钟）
- **内容大纲**：
  - 场景 1：少年来到街亭，遇街亭棋客（robot 立绘）摆擂
  - 场景 2：战前对话 → end（触发对战）
  - （对战胜负 VN 由 rpg_shell.js 在 RPG_GAME_END 后调用 playChapter 同文件续播，或在 battle/end 路由返回后由前端二次拉取——按现有 rpg_shell.js 实现，胜/负 VN 应作为同 story 的后续 scene，通过 jump 节点衔接。**实施时 Read rpg_shell.js 的 RPG_GAME_END 处理逻辑确认衔接方式**）
- **技术要求**：≥2 个 scene，含战前 + 战后分支。

#### 步骤 11：创建章节 JSON —— ch03 围棋进阶（骨架，降级）
- **文件**：`/workspace/rpg_data/chapters/ch03_go_intro.json`（新建）
- **章节**：第 2 章·进阶（围棋 vs 云子老人，go 服务不存在）
- **内容**：纯 VN 骨架（无对战），说明「云子老人远游，围棋局暂缺，少年继续前行」→ end。rpg_shell.js 加载本章时 chess_health_check(go) 返回 False，应直接播 VN 跳过。
- **节点数**：≥6 个（bg + 2 dialogue + narration + end）

#### 步骤 12：创建章节 JSON —— ch04 BOSS战五子棋（骨架）
- **文件**：`/workspace/rpg_data/chapters/ch04_boss_wuziqi.json`（新建）
- **章节**：第 3 章·BOSS战（五子棋 vs 夜枭）
- **内容**：战前 VN 骨架（≥8 节点），end 后触发对战。战后 VN 可精简。

#### 步骤 13：创建章节 JSON —— ch05 终极对决象棋（骨架）
- **文件**：`/workspace/rpg_data/chapters/ch05_final_xiangqi.json`（新建）
- **章节**：第 4 章·终极对决（象棋 vs 棋圣真身）
- **内容**：战前 VN 骨架（≥8 节点）。

#### 步骤 14：创建章节 JSON —— ch06 终局围棋（骨架，降级）
- **文件**：`/workspace/rpg_data/chapters/ch06_finale_go.json`（新建）
- **章节**：第 5 章·终局（围棋 vs 执念化身，go 不存在）
- **内容**：纯 VN 骨架，导向结局判定。rpg_shell.js 在本章结束时应触发 `_computeEnding` 并播放对应结局 VN（good/bad/secret）。**实施时 Read rpg_shell.js 终章处理逻辑，确认结局 VN 是否需要单独 story 或在同文件内用 condition 分支。**

---

### 🟢 P2：阶段 H 端到端测试

#### 步骤 15：语法校验
- `python -m py_compile` 校验所有改动的 .py：
  - `xiangqi/ai_orchestrator.py`、`wuziqi/ai_orchestrator.py`
  - `xiangqi/prompts.py`、`wuziqi/prompts.py`
  - `xiangqi/main.py`、`wuziqi/main.py`
  - `shared/rpg/rpg_server.py`（未改但一并校验）
- JSON 校验：`python -c "import json; json.load(open('...'))"` 校验所有新建 JSON。

#### 步骤 16：启动服务
- 后台启动 3 个服务（go:8002 不启动）：
  - `cd /workspace/xiangqi && python main.py`（端口 8000）
  - `cd /workspace/wuziqi && python main.py`（端口 8001）
  - `cd /workspace/shared/rpg && python rpg_server.py`（端口 80）
- 用 `curl http://localhost:80/api/rpg/health/xiangqi` 与 `/health/wuziqi` 验证连通；`/health/go` 应返回 `up: false`。

#### 步骤 17：9 项自测（执行方案验证标准）
1. `python -m py_compile` 所有 .py 无语法错误 ✅
2. 启动 4 服务（go 不可达，记为预期降级）✅
3. 访问 http://localhost/ 能进入序章
4. 序章 VN（ch00）能播放（点击推进、选择支生效）
5. 第 0 章五子棋教程能进入对战（iframe 加载 8001）
6. 棋圣系统能评估作弊（cheat/assess 返回 cost_energy ≥0，且 dry_run 不写配置）
7. 作弊后能触发对手合理化台词（cheat/use 返回 opponent_dialogue，前端 StoryLayer.playOpponentDialogue 播放）
8. 能量条正确扣减（use 后 energy 减少 cost_energy）与吃子加成（move_complete 后 +10/+5）
9. 端到端能从序章打到第 1 章首战（ch00 → ch01 → ch02 象棋对战启动）

---

## 四、假设与决策

| 编号 | 决策 | 依据 |
|---|---|---|
| D1 | Go（围棋）跳过实现，ch03/ch06 降级为纯 VN | go/ 目录不存在，用户明确「等你提供 go/ 文件夹」 |
| D2 | ch00/ch01/ch02 为完整内容，ch03-ch06 为骨架 | 原 MVP 优先 + 框架完整决策 |
| D3 | 对手台词严格用 dialogue_templates.json 预脚本，不用 AI 生成 | 三大优先级之「核心爽点」必须稳定触发 |
| D4 | dry_run 仅跳过 `apply_config_update`，仍返回完整 result（含 cost_energy/classification） | rpg_server.cheat_assess 依赖返回字段 |
| D5 | cost_energy 提取位置必须在 feasible 检查之前 | 修复 NameError BUG，保证 rejected 分支可用 |
| D6 | Story JSON 严格遵循 preview.js 节点格式（第二节已列） | 已从 preview.js 第 132-345 行验证 |
| D7 | 立绘用 boy/robot 两个角色，背景无图时 url 留空走 CSS 兜底 | shared/assets 现有资源 |
| D8 | 战后 VN 衔接方式：实施时 Read rpg_shell.js 的 RPG_GAME_END 处理确认 | 避免假设错误导致战后黑屏 |

---

## 五、变更记录（相对原执行方案）

| 日期 | 位置 | 原因 | 改动 |
|---|---|---|---|
| 2026-07-18 | 阶段 G | xiangqi/ai_orchestrator.py cost_energy 提取位置在 feasible 检查之后，导致 NameError | 将提取语句上移到 feasible 检查之前 |
| 2026-07-18 | 阶段 A | 两棋类 /api/command 不支持 dry_run，cheat/assess 会误执行作弊 | 加 dry_run 查询参数，条件触发 apply_config_update |
| 2026-07-18 | 阶段 F | go/ 不存在，ch03/ch06 无法对战 | 两章降级为纯 VN 跳过 |

---

## 六、实施顺序（建议按依赖关系串行）

1. **P0 修复**（步骤 1-4）：先修 BUG 再补功能，保证 cost_energy 链路可用
2. **P1 dry_run**（步骤 5-6）：依赖 cost_energy 返回，可与 P0 并行但建议其后
3. **P1 故事内容**（步骤 7-14）：dialogue_templates 优先（核心爽点），章节 JSON 按 ch00→ch01→ch02→其余顺序
4. **P2 测试**（步骤 15-17）：全链路验证

**关键路径**：步骤 1（修 BUG）→ 步骤 3/4（prompt）→ 步骤 7（台词库）→ 步骤 8/9/10（三章完整内容）→ 步骤 17（端到端自测）。
