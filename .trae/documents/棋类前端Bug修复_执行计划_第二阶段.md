# 棋圣 ChessSage · 棋类前端 Bug 修复 · 执行计划（第二阶段）

## 一、执行上下文与研究结论

### 1.1 已完成的后端 / 总坛改造（前序阶段）
根据主计划 `游戏逻辑Bug修复计划.md`，下述部分已落地（Todo a–f / i 标记为完成）：

| 子项 | 改动文件 | 已完成 |
|---|---|---|
| TDD 红测试 | `tests/test_bugfixes_samsara.py` | ✅ |
| `reset_all(soft/hard)` + 备份回滚 | `samsara/state.py` | ✅ |
| `/api/reset` 双档 + `/progression/resolve` 返回 `next_level` | `samsara/api.py` | ✅ |
| 默认 `_after_reset_board` 同步本地 karma | `shared/game_base.py` | ✅ |
| 成就 no-store 头 + `.bak` + `/achievements/reset` | `main.py` | ✅ |
| 总坛 hub 事件驱动刷新 + 重置按钮 + BroadcastChannel | `hub/app.js` + `hub/index.html` | ✅ |
| `achievement_checker.js` 跨页广播 Toast | `shared/achievement_checker.js` | ✅ |

### 1.2 仍然存在的玩家侧 Bug（待本阶段修复）
按照 Todo g / h，12 份棋类前端（6 主模式 + 6 沙盒）还**未**应用：
1. **胜负页「三件套」**：目前仅「再来一局」1 个按钮，缺「下一关 / 返回总坛」，且胜利后 API 推进了 level，但前端未重置本地 karma / 棋盘 / 规则到下一关初始值。
2. **启动流程**：未调用 `POST /api/rpg/reset_battle` + `/api/level/apply`，导致第二关开始时棋盘/棋子/规则仍是上一局修改过的；本地 `karma_assessor` 仍是上一局残留。
3. **`restart()` / `btn-restart` / `btn-reset-configs`**：仅重置了棋盘配置，未同步调用 Samsara 的当前关变量重置（`reset_level_state` / `POST /samsara/api/levels/start` 同级能力），也未再 `loadConfigs` → `apply_level_config` → `reset_battle` 三件套。
4. **业力轮询**：仍在 `setInterval 5s` 跑，违反用户决策「纯事件驱动 + visibility/focus 兜底」。
5. **Cache**：棋页所有 `fetch` 未统一加 `cache: "no-store"` / `Pragma` 头，且页面 `<meta>` 缺 no-store。
6. **跨页广播同步**：棋页未订阅 BroadcastChannel。例如总坛发 `reset-issued`，棋页不会立即重置业力条；Samsara `karma-updated` 其他页触发，本页不会同步。
7. **胜负模态**：缺「最终业力 / 识破概率 / 奖励 / 下一关存在性」信息。
8. **沙盒遮罩**：沙盒模态的下一关 / 返回总坛按钮应禁用（沙盒不推进道与关）。

### 1.3 决策点（延续主计划，用户已在前一轮对齐）
沿用主计划 §「关键决策点」四项：
- **重置档位**：软重置（保留成就/技能树/结局）+ 预留 hard。
- **胜负页 UI**：标准三件套 + 结算信息（最终业力/识破/技能点/关卡描述）。
- **业力刷新**：纯事件驱动（响应体 `state` → 立即渲染；BroadcastChannel；visibility / focus 兜底 1 次）。
- **成就跨页 Toast**：所有页都弹。

> 本计划不再对用户追加决策问题，**除非**在落地中遇到与现有契约冲突的新歧义（例如 `/api/level/complete` 返回结构字段名与 `showVictoryReward` 不一致时才询问）。

---

## 二、文件与模块改动清单

### A. 棋类主模式（6 份 `static/app.js`）
逐个文件就地修改，避免架构性抽取造成回归：

1. `/workspace/CHessGAme/xiangqi/static/app.js`
2. `/workspace/CHessGAme/wuziqi/static/app.js`
3. `/workspace/CHessGAme/weiqi/static/app.js`
4. `/workspace/CHessGAme/tiaoqi/static/app.js`
5. `/workspace/CHessGAme/heibaiqi/static/app.js`
6. `/workspace/CHessGAme/dongwuqi/static/app.js`

### B. 沙盒模式（6 份 `sandbox/*/static/app.js`）
7. `/workspace/CHessGAme/sandbox/xiangqi/static/app.js`
8. `/workspace/CHessGAme/sandbox/wuziqi/static/app.js`
9. `/workspace/CHessGAme/sandbox/weiqi/static/app.js`
10. `/workspace/CHessGAme/sandbox/tiaoqi/static/app.js`
11. `/workspace/CHessGAme/sandbox/heibaiqi/static/app.js`
12. `/workspace/CHessGAme/sandbox/dongwuqi/static/app.js`

### C. 共享 & 后端补齐
13. `shared/game_base.py`：
    - `rpg_reset_battle()` 响应追加 `karma_detection_state` 与 `state`（Samsara 代理 state），给前端 UI 一次性刷新。
    - `apply_level_config()` 成功后再 `state.reset_board()`，确保本关**开局棋盘干净**（对应 Bug 2「第二关规则/棋子不恢复」）。
    - `/api/restart` / `/api/reset_configs` 响应追加 `karma_detection_state` 与 `state` 字段。
    - `/api/karma_detection` 字段对齐 `karma.get_state()`，追加 `single_max`、`initial`。
14. `samsara/api.py`（必要补充）：
    - `/api/levels/advance` 成功时返回 `next_level` 对象，便于前端单独点下一关时复用。
    - 若棋类端口访问 samsara 的 `/api/state`，确认 CORS / 代理无问题（当前棋页以 `/samsara/api/state` 直连同域总坛，OK）。
15. `shared/achievement_checker.js`（核对）：已写入 broadcast 与 localStorage 兜底，检查 fetch header `cache:"no-store"`。
16. `hub/app.js`（核对）：重置按钮广播 `reset-issued`，确认棋页收到后也刷新。

---

## 三、实施步骤（依赖序）

### Step 1 · 先做共享后端补齐（C13–15）
- 改 `shared/game_base.py` 中 4 个路由：`rpg_reset_battle` / `apply_level_config` / `restart` / `reset_configs` / `karma_detection`。
- 改 `samsara/api.py` `/api/levels/advance` 返回值 `next_level`。
- 核对 `shared/achievement_checker.js` fetch 头。

### Step 2 · 抽象改造模板（TDD 行为在测试用例中已覆盖后端）
先集中编写一份「改造点清单」以手改一份棋类 xiangqi/app.js 跑通为模板，内容包括：

#### 2a. 启动 init() 末尾，插入关卡准备三连：
```
1) POST /api/level/apply        // ← 拉当前关并设难度/回合
2) POST /api/rpg/reset_battle   // ← 触发 reset_board → _after_reset_board → 同步本地 karma
3) GET  /api/karma_detection    // ← UI 立即渲染到正确初始值
```
并禁用 `startKarmaPolling()`（改为事件驱动 + visibility/focus）。

#### 2b. 新增 BroadcastChannel 订阅 `game-events`：
- `karma-updated` / `reset-issued` / `level-advanced` → `loadLocalKarmaDetection()` + `loadSamsaraState()`。
- `achievement-unlocked` → 同样弹 Toast（若棋页尚无成就弹层能力，则复用 hub 的 toast DOM 或简化为浮层提示）。

#### 2c. visibility / focus 兜底：
- `visibilitychange`(visible) / `window focus` → 1 次 `loadLocalKarmaDetection()` + `loadSamsaraState()`。

#### 2d. `showGameOver()` 替换：
- 胜负模态改为三按钮：
  - 🔁 再来一次 → `rpgResetBattleAndApply()`（三件套后刷新所有 UI）。
  - ➡️ 下一关（胜利且 `next_level != null` 才启用，否则灰）→ 流程：
    1. `POST /samsara/api/levels/advance`（后端已 reset_level_state 并返回 next_level）
    2. `POST /api/level/apply`
    3. `POST /api/rpg/reset_battle`
    4. 重绘棋盘 / 规则 / 目标 / 业力条 / 识破条 / 关卡名
  - 🏠 返回总坛 → `window.location.href = "/hub/index.html"`（走同域）。
- 显示结算信息：
  - `rewards.rewards`（skill_points / bonus_reasons / realm_advance / next_level.level.name 等）
  - 本局最终业力 / 识破 / 奖励。
- **showVictoryReward 合并**：为避免胜利后两次弹窗（奖励一次、胜负一次），合并进胜负模态统一显示（或胜负模态优先显示奖励，再来一局/下一关在模态底部）。

#### 2e. `restart()` 与 btn-restart：
- 改为 `rpgResetBattleAndApply()` 三件套（而不仅仅是 `/api/restart`）。

#### 2f. `btn-reset-configs`：
- 保持「重置棋类初始配置」功能，成功后**额外**：
  1. `POST /samsara/api/reset { mode: "soft" }` 以重置当前道/关/业力变量（仅在**主模式**下，沙盒跳过）。
  2. BroadcastChannel 广播 `reset-issued`。
  3. 再 `rpgResetBattleAndApply()`。

#### 2g. fetch 统一加 no-store：
- 对每处 `fetch` 加 `{ cache: "no-store", headers: { "Pragma": "no-cache" } }`（涉及 `apiBase` 与 `/samsara/` 前缀的所有请求）。

#### 2h. 业力条更新全部走 `samsaraState`：
- 所有 consume / recover / refund 等 API 返回后，若体含 `karma_detection_state` 或 `state`，直接覆盖 `this.samsaraState` 并 `updateSamsaraUI()`。

### Step 3 · 跑通 xiangqi 主模式（一份） + 手动验证
- 浏览器手动过一遍：关 0 胜 → 胜负页「下一关」按钮亮起 → 点击后 level_index=1，业力条初始值等于 samsara `initial_karma - reduction + carryover`，棋盘是新关初始布局，AI 难度正确；再「重新开始 / 重置所有配置」，业力与关卡立即归零。
- 切总坛解锁成就 → 棋页弹 Toast，成就数 UI 立即更新。

### Step 4 · 以 xiangqi 为参照，对其余 5 主模式逐文件应用同样 patch
- 顺序：wuziqi → weiqi → tiaoqi → heibaiqi → dongwuqi。
- 每改完一份做 1 次冒烟：启动各自端口，fetch `/static/app.js` 含三按钮 + `BroadcastChannel`（关键字 grep 验证）。

### Step 5 · 沙盒 6 份
- 复用 Step 2 模板，但沙盒要「遮罩」：
  - 主模式/沙盒开关：前端在 `init()` 里 GET `/api/level/info`，若 `current_level?.game_type == "sandbox"` 或 URL 段匹配 `sandbox/`，设 `this.isSandbox = true`。
  - `showGameOver()` 隐藏「下一关 / 返回总坛」，沙盒胜负页只显示「再来一次」+「关闭返回沙盒总坛」（链接 `/hub/sandbox.html`）。
  - `btn-reset-configs` 不调用 `/samsara/api/reset`（沙盒没有关/业力 RPG 要素）。
  - 业力条显示 0 或隐藏（按沙盒现有设计不变）。

### Step 6 · TDD 绿 + 回归
- 运行 `pytest tests/test_bugfixes_samsara.py`（后端已跑通，前端不改后端契约）。
- 新增一个轻量 API 冒烟测试（或在现有 test 文件末尾追加）：
  - `apply_level_config` 返回体含 success:true + level。
  - `rpg_reset_battle` 返回体含 `karma_detection_state.karma.current`。
- 对 `xiangqi/main.py` / `shared/game_base.py` 启动后 curl 4 个端点走通。

### Step 7 · 发版（Todo k）
- 本批前端改动全部 `git add` → commit（独立一条，不与后端混）。
- 构建：`python3 build_game.py`（复用上次 Wine 流程，如有需要 `--skip-pyi` 直接复制数据目录生成发布）。
- 压缩：`7z a -mx=9 -myx=9 chesssage_v1.1.0.7z dist/chesssage/*`，体积目标 ≤ 上次（431 MB），这次只改 JS/HTML/CSS/PY，预期持平或更低。
- 通过 GitHub 连接器：`trae-remote-official:github` → create release `v1.1.0`，上传 7z 资产。
- 备份旧发行版说明：body 写「Bugfix 版本：修复业力跳变 / 缺少下一关按钮 / 重置无效 / 缓存影响视觉」四项 + 附带改动文件清单。

---

## 四、注意事项 / 依赖与风险

1. **12 份 JS 重复改造偏差控制**：
   - 先写出 `xiangqi` 一份「可运行 patch 片段列表」（按函数名定位），然后对其它 11 份复用同一片段；用 `diff` + `grep showGameOver / restart / startKarmaPolling / btn-reset-configs / init` 检查每处是否都被覆盖。
   - 任何棋类若 `showGameOver` / `restart` 等命名差异（如部分沙盒可能不同），**单独按语义适配**，不假设字段名一致。
2. **接口契约保护**：
   - 所有新增响应字段用「追加式」，旧前端若未升级也能正常显示（undefined 跳过）。
   - 不修改已有字段名含义，例如 `data.skill_points`、`data.bonus_reasons`、`data.success` 保持不变。
3. **沙盒模式不破坏**：
   - 沙盒 `main.py` 未走 `BaseGameState`，`/api/rpg/reset_battle` 可能不存在 → 前端 `isSandbox=true` 时跳过 `/api/level/apply` 与 `/api/rpg/reset_battle`，回退到原 `/api/restart`。
   - 若沙盒有独立实现 `rpg_reset_battle` 则复用，否则就走 `restart + loadConfigs`。
4. **浏览器缓存兜底**：
   - 在棋类的 `index.html` `<head>` 中加：
     ```html
     <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">
     <meta http-equiv="Pragma" content="no-cache">
     <meta http-equiv="Expires" content="0">
     ```
   - 对 `<script src=".../app.js">` 加 `?v=1.1.0` 时间戳/版本号，防止本地残留缓存。
5. **风险**：
   - **棋页 BroadcastChannel 与 hub 同域互发**：已确保同源（总坛 8080 提供静态），OK。
   - **切关误推进**：失败时不调用 `/levels/advance`，「下一关」按钮灰掉，避免错误推进到下一关。
   - **完整存档硬档误操作**：按钮仍为 soft 路径；hard 仅在 API 上预留，不在本次 UI 暴露。

---

## 五、验证（端到端 Playtest 清单）

### 5.1 单元 / API 级
- [ ] TDD：`tests/test_bugfixes_samsara.py` 全部 PASS。
- [ ] TDD 新增：`rpg_reset_battle` 返回体含 `karma_detection_state.karma.current`。
- [ ] TDD 新增：`apply_level_config` 成功后 `reset_board` 触发且 `board_state.game_status.state == "playing"`。

### 5.2 玩家视角冒烟
- [ ] **启动关卡**：开 xiangqi 8000 → 初始业力条 = samsara `initial_karma + carryover`（非 0 非上一局残留）。
- [ ] **过一关**：通过 API 模拟 win → 胜负页弹出三按钮；奖励 / 下一关信息显示；点「下一关」→ level_index 自增，棋盘/规则/回合限制/AI 难度全部回到新关初始值，业力归零（或 initial + carryover）。
- [ ] **重新开始**：胜后点「再来一局」→ 当前关保持不变，业力回到本关初值，棋盘干净。
- [ ] **重置所有配置**：二次确认 → 业力条回到 `initial_karma + carryover`，关卡号变为 0，棋盘恢复 initial，成就计数保留（soft 档）。切回总坛刷新，数字立即对得上。
- [ ] **成就缓存**：棋页解锁一个成就 → 总坛已打开的 tab 成就数 +1 并弹 Toast；不需要刷新页面。
- [ ] **跨业力同步**：总坛开一个技能（消耗技能点，可能减 initial_karma 减免）→ 切回棋页 tab（触发 focus / visibility）→ 业力条立即更新。
- [ ] **沙盒遮罩**：开 sandbox/xiangqi → 胜负页只有「再来一次」+「返回沙盒总坛」；无下一关按钮；重置按钮不触发 Samsara 存档变动。

### 5.3 发版验证
- [ ] `git status` 干净，主分支 commit message 清晰分条（前端三按钮 / 事件驱动 / 沙盒遮罩 / 后端补齐）。
- [ ] GitHub Release `v1.1.0` 草稿创建，资产 `chesssage_v1.1.0.7z` 下载解压后 `棋圣.exe` 可正常启动（至少启动器 splash 可点，服务启动无异常日志）。

---

## 六、已锁定的执行决策（AskUserQuestion 被跳过，按推荐值锁死）

本次执行遵循以下「推荐值」并**不再**追加确认；若用户对任一结果不满意，可在验收阶段要求修改：

| # | 决策项 | 锁定选择 | 理由 / 影响 |
|---|---|---|---|
| A | 胜利后剧情联动 | **仅推进关卡，不自动弹剧情** | 改动最小、回归面最小；剧情入口保留在总坛 dialogue 页面（或 Samsara `dialogue.html`），后续可独立接入。 |
| B | 返回总坛按钮跳转 | **`/hub/index.html`（六道大厅）** | 符合玩家对「返回总坛」的直觉语义，不绕标题页，回到大厅即可继续选关 / 学技能。 |
| C | 棋页「重置所有配置」范围 | **只重置当前棋 + 当前关**（不触发六道 soft 档全局重置） | 与 hub 已有「完整存档重置」能力解耦：danger 按钮 = 清本棋棋盘/规则/AI 难度 + Samsara 当前关变量（level_karma / current_turn / cheat_count / no_cheat_this_level），但不换道、不回 level_index。六道级全局重置只在 hub 操作，避免玩家误点丢周目进度。 |

> 执行承诺：若遇到上述以外的**新歧义**（例如现有 API 字段名与计划冲突、沙盒缺某个端点），再立即通过 AskUserQuestion 询问，否则不中断执行。收到用户审批后直接进入 Step 1 → Step 7 的顺序执行。
