# 棋圣 ChessSage · 游戏逻辑 Bug 修复计划

## 仓库研究结论

### 业力 / 存档架构（Bug 1/3 根因）
游戏有 **两套独立的业力存储**，且各自都有缺陷：

| 层 | 存储位置 | 重置位置/时机 | 问题 |
|---|---|---|---|
| Samsara 服务端（六道总坛） | `configs/samsara_state.json` → `level_karma` | `reset_level_state()`：在 `/api/levels/start`、`/api/levels/advance`、`/api/reset` | `/api/reset` 只改 `current_realm/current_level`，**业力仅 `reset_level_state`**（不改 `initial_karma`、技能点、skill、alignment、playthrough、endings_unlocked、achievements 等——「重置所有配置」语义不一致） |
| 棋类 karma_assessor 本地副本 | 每个棋类 `karma_assessor._local_karma`（内存） | `_after_reset_board()` → `reset_level_karma()` | **Bug 1 的根因**：6 类棋中仅 `dongwuqi/main.py` 覆盖了 `_after_reset_board()` 钩子调用 `reset_level_karma()`，其余 5 类（xiangqi/wuziqi/weiqi/tiaoqi/heibaiqi）**从未**重置本地业力。前端轮询 `/api/karma_detection` 读的是本地副本，本地副本与 samsara 不同步 → 「从第二关开始业力突然消失/突然回复」。 |

补充：`/samsara/api/reset` 是 **极不彻底** 的部分重置，后端也没有完整的「全存档重置」API → 按钮点了等于没点（Bug 3）。

### 关卡推进（Bug 2 根因）
- 六道总坛 `/samsara/api/levels/start` → `startLevel()` → `window.open(url, "_blank")` 在**新标签页**打开棋类页面。
- 棋类结束（胜负）→ `POST /api/level/complete` → samsara `resolve` + `advance_level` → samsara 已推进。
- **但前端棋类页面无「下一关」按钮**；玩家只能手动关页，重新从总坛点同一个道 → 道的 modal 是按 `levels_passed` 标记当前可用关，理论可用 → 但 **棋类打开时仅在启动时调用一次 `/api/level/apply`（和 karma_assessor 重置），之后不再重置本地副本** → 第二关开始时棋盘/棋子/规则仍是上一局修改过的（业力也继承上一局）。
- 更底层：`rpg_reset_battle`（后端每局重置）只在 samsara 调用时才生效，但棋类页面**首次加载不会**请求这个路由，因此需要在棋类前端的页面启动 / 关卡变化时触发。

### 成就缓存（Bug 4 根因）
- 棋类页面 `achievement_checker.js` 用 HUB_URL 8080 解锁成就（OK），弹出窗口（OK）。
- **总坛 hub `index.html` 在 `init()` 时拉一次 `/api/achievements`** → 之后不再刷新，包括打开的成就殿堂页 `/achievements`（`achievements.js`）若也是静态一次拉取，也同样。
- 浏览器 HTTP 缓存：`/api/achievements`、`/static/*.js`、`/shared/*.js` 无 Cache-Control，可能被浏览器短期缓存 → 显示旧数量。
- 跨窗口无广播：棋类页（新标签）解锁成就后，已打开的总坛标签页不会自动刷新数字。

### 其他发现的不合理处
1. **前端轮询 6 个服务状态用 `mode: "no-cors"`** → status dot 永远显示 online，服务挂了也看不到断流 → 误判。
2. `/samsara/api/levels/start` 设置道后 `state.reset_level_state()` 正确推进，但 `turn_limit.reset()` 用的是 `samsara` 内部 turn_limit，棋类本地 app.js 不一定同步。
3. `achievements.json` 和 `samsara_state.json` 没有版本号自动重置时的备份保护，出现损坏无法回退。
4. `/api/karma_detection` 返回字段 `max` 与 `karma.get_state()` 结构不一致，前端可能读错上限。
5. 6 棋类前端中「重新开始 / 重置所有配置」按钮：调用 `/api/restart` → 后端 `reset_board()` → 但**不会重置 karma_assessor 本地副本、不会重置 turn、不会同步 Samsara 的 level_karma** → 前端视觉上配置没了但业力还是旧值。

---

## 关键决策点（用户已确认）

已通过 AskUserQuestion 与用户对齐，四项选择如下：
1. **重置档位 → 软重置（推荐档）**：保留成就/技能树/结局记录，清零当前进度：业力、关卡数、悟道/堕落值、记忆碎片、识破状态。同时后端也预留 `hard` 模式实现，但按钮不暴露。
2. **胜负结算页 → 标准三件套 + 结算信息**：弹窗显示本局最终业力/识破概率/奖励技能点/关卡描述；按钮：🔁 再来一次（重玩当前关）、➡️ 下一关（胜利可用，失败灰显）、🏠 返回总坛。
3. **业力/识破/成就 UI 刷新 → 纯事件驱动（完全不轮询）**：完全关闭定时拉取，通过三种事件源同步：
   - 玩家动作成功返回的响应体带 `state`，立即全量渲染；
   - BroadcastChannel `game-events` 多标签跨页广播（`karma-updated` / `achievement-unlocked` / `reset-issued` / `level-advanced`）；
   - 页面 `visibilitychange` 恢复可见时、窗口 `focus` 事件时，主动 GET `/samsara/api/state` 一次做兜底。
4. **成就跨页 Toast → 要，所有已打开页面都弹**：BroadcastChannel 广播 `achievement-unlocked`，收到的页面统一弹出成就 Toast（图标+名称+描述），并同步刷新成就计数/殿堂列表 DOM。

---

## 文件与模块改动

### A. 后端共享层（所有棋类受益）
1. **`shared/game_base.py`**
   - `BaseGameState._after_reset_board()` 默认实现改为 **同步重置本地 karma_assessor 副本**（读取 samsara `level_karma` / 技能 modifiers / carryover），并更新本地 detection。
   - `/api/restart`、`/api/reset_configs`、`/api/rpg/reset_battle` 响应里追加 `karma` 与 `state`（Samsara 完整 state + 本地副本），供前端立即刷新业力条。
   - `/api/karma_detection` 返回结构对齐 `karma.get_state()`（增加 `single_max`、`initial`）。
   - `/api/level/apply` 成功后额外调用 samsara `POST /api/levels/start` 以确保本关起点一致，再 reset 本地副本 + reset_board。

### B. 后端 Samsara（六道总坛）
2. **`samsara/state.py`**
   - 新增 `reset_all(full: bool = False)`：`full=False` 保留技能/成就/记忆碎片/结局，其余（current_realm/current_level/level_karma/alignment/...playthrough...）全重置；`full=True` 仅保留版本号，全部默认。保存前备份原文件为 `.bak`。
   - `set_realm()` 内也调用 `reset_level_state()` 保证换道立刻有新局业力。
   - `_init_defaults()` 在 STATE_FILE 损坏时自动回滚备份。
3. **`samsara/api.py`**
   - 重写 `/api/reset`，加 `body.mode`：`soft|hard`（soft = 保留技能成就，hard = 全重置）。返回完整 `_frontend_state`。
   - 新增 `/api/reset/achievements` 单独清成就（如需）。
   - `/api/progression/resolve` 内胜时返回 `next_level` 完整对象（包含游戏类型/关卡名），便于前端渲染下一关按钮。
4. **`samsara/progression.py`**
   - `advance_realm()` 换道时验证「本关最后一关是否真的过了」，否则回退 level_index。

### C. 主启动器成就 API
5. **`main.py`**
   - `/api/achievements`、`/api/achievements/unlock`、`/api/achievements/stats` 全部加 `Cache-Control: no-store, no-cache`。
   - 成就存档写入前生成 `.bak`；读取失败自动回退备份。
   - `/api/achievements/reset` 新 API（区分软/硬模式），与 Samsara 对齐。
   - `/static/*`、`/shared/*` 全局 `StaticFiles` 加响应头 `Cache-Control: no-cache, must-revalidate, max-age=0`（防止成就/业力 JS 被浏览器缓存），可在 dev 模式使用。

### D. 六道总坛前端（hub）
6. **`hub/index.html`**
   - 顶部业力条/境界/技能点 加 `ach-banner-progress` 刷新周期。
   - 加入「完整存档重置（两档：软/硬）」按钮，二次确认后 POST `/samsara/api/reset`。
6. **`hub/app.js`**
   - 合并 `loadSamsaraState()`、`loadRpgOverview()`、成就进度拉取 → 新增统一 `refreshHubStatus(force=false)`，**不再**使用 `setInterval` 定时器。
   - 页面启动时调一次 `refreshHubStatus()`；之后监听：
     1. `BroadcastChannel("game-events")`，处理 `karma-updated` / `achievement-unlocked` / `reset-issued` / `level-advanced` 消息 → 立即刷新对应 UI。
     2. `document.addEventListener("visibilitychange")` → `visibilityState==='visible'` 时调一次。
     3. `window.addEventListener("focus")` → 再调一次（兜底，切回标签页立即更新）。
   - 每次 `fetch` 加 `cache: "no-store"` + 请求头 `Pragma: no-cache`。
   - 新增 `BroadcastChannel` 订阅「成就解锁」：跨页收到 `achievement-unlocked` 时弹顶部 Toast 并刷新成就计数 / 成就殿堂 DOM（若当前页有成就列表容器）。
   - 道 modal `showRealmLevels()` 每次打开先**重新拉取**一次进度，关闭再打开时不缓存 DOM 旧值。
   - `updateStatuses(games)` 改用 `GET /`（无 no-cors）或加 `/api/health`（后端已有），真实判断服务存活。
   - `hub/index.html` 增加「完整存档重置」按钮，二次确认 → `POST /samsara/api/reset {mode:"soft"}`，成功 → BroadcastChannel 广播 `reset-issued` 所有页刷新。

### E. 棋类前端（共享改动 — 对 6 类棋 x 2 模式）
8. **`shared/achievement_checker.js`**
   - 解锁成就成功后写入 `localStorage["achievement-unlocked-timestamp"]` = 时间戳，触发 `storage` 跨页广播，再加 `BroadcastChannel("game-events")`。
   - 请求 HUB_URL `/api/achievements/unlock` 加 `cache: "no-store"`。
9. **6 棋类前端 `static/app.js` 共享行为修改**（通过统一逻辑：胜/负模态新增 3 按钮、游戏启动时调用 RPG 重置、重置按钮联动 Samsara）
   - **页面初始化（init 流程末尾）**：
     1. `POST /api/rpg/apply_level_config`
     2. `POST /api/rpg/reset_battle`（清空棋盘 + 重置本地业力）
     3. `GET /api/karma_detection` → 写入 UI 初始值。
   - **胜负结算模态**（原来只显示「胜/负」）：
     - 显示：本局业力最终值 / 获得技能点 / 识破概率 / 关卡描述 / 是否下一关存在。
     - 按钮：
       - `🔁 再来一次` → `POST /api/rpg/reset_battle` + `POST /api/level/apply` + 刷新 UI。
       - `➡️ 下一关` → `POST /samsara/api/levels/advance` 失败则灰掉；成功后调用 `POST /api/rpg/reset_battle` + `POST /api/level/apply` + 重置前端棋盘状态。
       - `🏠 返回总坛` → `window.location.href = "http://localhost:8080/hub"`。
   - **「重置所有配置」按钮**：二次确认 → `POST /api/reset_configs` → 成功后**再**同步调用 `POST /samsara/api/reset?mode=soft`（仅影响 Samsara 当前关变量：level_karma/current_turn/cheat_count），并重绘 UI。
   - **「重新开始」按钮**：同样 `POST /api/restart` → 成功后 `POST /api/level/apply` → 重绘 UI。
   - **业力/识破条 UI**：关闭定时轮询；每当：
     1. 玩家触发 consume/recover/reset 等 API 返回后用响应体 `state` 立即更新；
     2. BroadcastChannel `game-events` 收到 `karma-updated` / `reset-issued` / `level-advanced`；
     3. 页面 `visibilitychange` 变可见 / `window focus` 时；
     → `GET /api/karma_detection`（棋页）或 `GET /samsara/api/state`（总坛）各一次**兜底**同步。若检测到 Samsara 值与前端 UI 有差，以服务器为准覆盖。
   - **前端浏览器缓存**：
     - `app.js` 顶部 `fetch` 请求统一加 `cache: "no-store"` 封装。
     - 页面加 `<meta http-equiv="Cache-Control" content="no-store">`（仅 dev 友好）。

### F. 沙盒模式（sandbox）同步
10. 沙盒棋类与主模式前端逻辑一致；但沙盒模式下：
    - `/samsara/api/levels/sandbox` 已调用 `reset_level_state()`。
    - 胜负结算模态**跳过「下一关/返回总坛」**，只保留「再来一次」和「关闭/返回沙盒总坛」。
    - 沙盒没有业力/识破的 RPG 元素 → 若检测到 `current_level = sandbox` 类型时跳过 karma UI 刷新（或显示 0）。

### G. 额外合理性修复
11. 6 棋类 karma_assessor：`get_local_karma()` 在未初始化时**不能是 0**（如果 samsara state 已有值，应立即同步）→ 给 `KarmaAssessor` 增加 `sync_from_samsara(state)` 方法，在启动/重置时调用。
12. `/samsara/api/levels/realm/{realm}` 返回**最新** `realm_progress.completed`，总坛 card 进度「X/Y」每次进入 modal 前也刷新。
13. 所有棋类 static `index.html` `<script src="http://localhost:8080/shared/achievement_checker.js">` 改为带 `?v={version}` 或者动态版本查询，避免旧缓存。

---

## 实施步骤（按依赖排序）
1. 决策点用户确认（A1 全量重置档位 / A2 胜负页按钮 / A3 轮询周期 / A4 跨页 Toast）。
2. 后端 `samsara/state.py` 加 `reset_all()` + 备份回滚。
3. 后端 `samsara/api.py` 重写 `/api/reset`、增强 `/api/progression/resolve`。
4. 后端 `shared/game_base.py` 默认 `_after_reset_board` 同步 karma，改造 restart/reset/level 路由。
5. 后端 `main.py` 成就 API 防缓存头、`.bak`、`/api/achievements/reset`。
6. 前端 `hub/app.js` + `hub/index.html`：刷新周期、跨页通知、缓存 no-store、完整存档重置按钮。
7. 前端 `shared/achievement_checker.js`：`localStorage` + `BroadcastChannel` 通知。
8. 6 棋类 `static/app.js`（主模式）：启动流程改造、胜负模态 3 按钮、重置/重新开始联动、Samsara state 优先。
9. 6 sandbox 棋类 `static/app.js`：共享 UI 逻辑 + 沙盒禁用项遮罩。
10. karma_assessor 6 类共享 `sync_from_samsara()`（若能移入 shared 就做，否则就地加方法）。
11. Samsara 状态轮询在棋类页做漂移同步。
12. 手动端到端走一遍：关卡 1→2→3（看业力/棋盘/规则是否复位）、胜后点下一关、完整重置、解锁成就切回总坛看数字。

---

## 依赖与注意事项
- 6 棋类 `static/app.js` 有巨大重复代码，但本次**不做架构性抽出**，而是逐个文件就地改，**避免扩大回归面**。
- Sandbox 6 棋类 `main.py` 未用 `BaseGameState`，其对应路由需**单独复制相同** API（已有独立 `/api/reset_configs`，需追加 `/api/rpg/apply_level_config` 的空实现或忽略逻辑）。
- 所有后端改动**不打破现有字段名与 HTTP 路径契约**，新增字段用追加式，前端兼容旧值（undefined 即不显示）。
- 用户给的临时 key `sk-6f62ffd2002049f9b949181dcbedabd7` 是「用后即停」，**不要改动 git 中提交的 config.json**。
- 成就存档和 samsara_state 写入前会备份为 `<name>.json.bak`，损坏时读取失败自动加载 `.bak`。

---

## 验证
- **TDD 单元测试**：新增 tests/ 覆盖：
  1. `reset_level_state` 后 `karma_assessor._local_karma == samsara.level_karma`。
  2. `reset_all(soft=False)` 保留 achievements/skills，`full=True` 完全清零。
  3. `/api/level/apply` → 返回业力与初始值一致。
  4. 6 棋类 `/_after_reset_board` 调用后本地副本已同步。
  5. resolve_level → 返回 `next_level` 结构完整。
- **Playtest**（sandbox-pc-game-runner 环境可选，若 Xvfb 资源吃紧则改用启动器手动 curl）：
  1. 启动 main.py，GET /hub → 页面返回 200。
  2. `POST /samsara/api/levels/start {realm:human, level_index:0}`。
  3. `POST /samsara/api/karma/consume {amount:10}` → karma 变为 60，确认棋类页读到同值。
  4. `POST /samsara/api/progression/resolve {won:true, no_cheat:true, boss_defeated:false}` → 再 GET `/samsara/api/levels` → current_level=1。
  5. `POST /samsara/api/reset {mode:soft}` → karma = initial，current_level=0。
  6. `POST /api/achievements/unlock {achievement_id:palette, game:xiangqi}` → `GET /api/achievements` unlocked_count 立即 +1，带 no-store 头。

---

## 风险与处理
- **前端 12 份 JS 全量修改风险高**：先改一份 xiangqi 主模式跑通，再用脚本统一对 11 份剩余（5 主模式 + 6 sandbox）应用相同 patch 片段，降低手改偏差。最后逐个 diff。
- **karma_assessor 双副本状态漂移**：在所有「修改业力」的路径（consume/recover/refund/reset）都调用 `sync_from_samsara`。如果发生不一致，**Samsara 文件为准**覆盖本地副本。
- **完整存档误操作风险**：`reset_all(hard)` 前备份两份（时间戳 + .bak），并要求前端二次确认弹窗「此操作无法撤销」。
- **浏览器强缓存**：除了 Cache-Control head，还在 hub/index.html 加 `?v=` 时间戳给 `<script>`，强制刷新资源引用。
- **轮询性能开销**：用户选定「纯事件驱动（无轮询）」，只在窗口 focus / visibility 切回时发 1 次 API，对本地进程几乎无感；兜底一致性由 BroadcastChannel + focus/fetch 保证。
