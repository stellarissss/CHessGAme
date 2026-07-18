# 棋圣 RPG 项目 — 继任开发计划

> **本计划基于 Phase 1 真实代码核查**，与磁盘状态一致。
> 关键发现：[项目计划书_RPG大游戏.md](file:///workspace/项目计划书_RPG大游戏.md) v2.0 的「真实状态」清单已严重过时——前一位 AI 声明未完成的大部分高优先级任务（U2/U3/U4/U5）实际上已完成，但有几个关键 BUG 和遗漏需处理。

**日期**：2026-07-19
**继任者**：GLM-5.2（接手前一位 AI 的工作）

---

## 1. 当前真实状态核查（与计划书 v2.0 对照）

### 1.1 计划书声明 vs 实际状态

| 项 | 计划书 v2.0 声明 | 实际状态 | 差异 |
|---|---|---|---|
| Git 远端 | 需拉取最新代码 | `main` 分支干净，与 origin/main 同步（最近提交 `f0ff209` PR #3 合并） | ✅ 无需拉取 |
| `go/` 目录 | ❌ 不存在 | ✅ 已存在（含 main.py / chess_ai.py / ai_orchestrator.py / mechanism_engine.py / rule_engine.py / prompts.py / configs/ / static/） | ✅ 已有 |
| `go/main.py` 端口 | 应为 8002 | ❌ 实际 `port=8000`（[go/main.py:698](file:///workspace/go/main.py#L698)） | 🔴 BUG |
| `go/static/index.html` 引入 rpg_adapter.js | 应有 | ❌ 未引入（[go/static/index.html:188](file:///workspace/go/static/index.html#L188) 只有 `/static/app.js`） | 🔴 缺失 |
| `go/main.py` 的 `/api/rpg/*` 路由 | 应有（支持作弊） | ❌ 无 apply_patch / apply_rules / reset_battle 路由 | 🟡 缺失（影响作弊） |
| 15 个像素资产 | ❌ 不存在 | ✅ 全部生成，[shared/rpg/assets/manifest.json](file:///workspace/shared/rpg/assets/manifest.json) 显示 15/15 `ok=true` | ✅ 已完成 |
| `rpg_extras.js` | ❌ 不存在 | ✅ 已存在（355 行，含标题屏/粒子/文档模态框/帮助按钮/教程按钮） | ✅ 已完成 |
| `rpg_shell.html` 标题屏 + 文档模态框 | ❌ 未实现 | ✅ 已存在（[rpg_shell.html:121-134](file:///workspace/shared/rpg/rpg_shell.html#L121-L134) 标题屏 + [rpg_shell.html:168-258](file:///workspace/shared/rpg/rpg_shell.html#L168-L258) 完整 7 段文档） | ✅ 已完成 |
| `rpg_shell.js` init() 标题屏守卫 | 应有 | ✅ 已有（[rpg_shell.js:72-74](file:///workspace/shared/rpg/rpg_shell.js#L72-L74)） | ✅ 已完成 |
| `rpg_shell.js` loadChapter() 守卫 | 应有（用户新决策） | ❌ 未有，仍依赖 [rpg_extras.js:318-338](file:///workspace/shared/rpg/rpg_extras.js#L318-L338) 的 monkey-patch | 🟡 需重构 |
| ch01 扩展 | 2 场景 19 节点 | ✅ 已扩展为 6 场景（scene_1-6，含 accept/refuse 分支） | ✅ 已完成 |
| 章节背景图片化（U6） | 全部 solid | ⚠️ 仅 ch00/ch01 主背景改 image；ch02-ch06 仍 solid；ch01 棋盘副背景仍 solid | 🟡 需补全 |
| ch03/ch06 剧情 | 降级骨架 | ❌ 仍 1 场景 7 节点 + 「围棋局暂缺」文本 | 🔴 需完整扩展 |
| ch02/ch04/ch05 剧情 | 骨架 | ❌ 仍骨架 | 🟡 用户未要求扩展，留作后续 |
| Seedream API Key | 环境变量 `ARK_API_KEY` | ⚠️ 在 [api密钥.txt](file:///workspace/api密钥.txt) 明文（key: `3d8d99b6-...`），未设环境变量 | ℹ️ 资产已生成，不再需要 |
| DeepSeek API Key | `xiangqi/api密钥.txt` | ✅ 存在（key: `sk-5b5e969e...`） | ✅ 已有 |

### 1.2 用户决策（已澄清）

1. **Git 拉取策略**：跳过 git pull，直接修复（工作树已是最新合并状态）
2. **U3 重构**：执行（按用户提示词新决策，移除 monkey-patch，直接改 rpg_shell.js 源码）
3. **围棋章节范围**：完整扩展为 U7 标准章节（约 30+ 节点，含战前/战中/战后分支）

---

## 2. 待办任务清单（按执行顺序）

### 阶段 A：修复 go/ 集成 BUG（U1 关键修复）

**目标**：让围棋服务能在 RPG 框架下正常运行。

#### A1. 修复 go/main.py 端口

- **文件**：[go/main.py](file:///workspace/go/main.py)
- **改动**：第 698 行 `port=8000` → `port=8002`；第 706 行打印信息 `http://localhost:8000` → `http://localhost:8002`
- **理由**：rpg_server.py 的 `CHESS_PORTS = {"go": 8002}` 期望 go 在 8002 端口；当前 8000 与 xiangqi 冲突

#### A2. go/static/index.html 引入 rpg_adapter.js

- **文件**：[go/static/index.html](file:///workspace/go/static/index.html)
- **改动**：在第 188 行 `<script src="/static/app.js"></script>` 之后插入一行：
  ```html
  <script src="http://localhost:80/shared/rpg/rpg_adapter.js"></script>
  ```
- **理由**：与 [xiangqi/static/index.html:197](file:///workspace/xiangqi/static/index.html#L197) 保持一致；rpg_adapter.js 仅在 URL 含 `?rpg=1` 时启用，零副作用

#### A3. go/main.py 添加 /api/rpg/* 路由（支持围棋章节作弊）

- **文件**：[go/main.py](file:///workspace/go/main.py)
- **改动**：在文件末尾 `if __name__ == "__main__"` 之前，复制 [xiangqi/main.py:661-698](file:///workspace/xiangqi/main.py#L661-L698) 的 3 个路由：
  - `POST /api/rpg/apply_patch` — 应用 JSON Patch 到指定配置
  - `POST /api/rpg/apply_rules` — 应用规则覆盖（target 强制 rules）
  - `POST /api/rpg/reset_battle` — RPG 每局开始重置棋盘
- **依赖**：需 `from json_patch_utils import apply_patch as _rpg_apply_patch`（[shared/json_patch_utils.py](file:///workspace/shared/json_patch_utils.py) 已在 sys.path）
- **理由**：用户要求「完整扩展为 U7 标准章节」；围棋章节若不支持作弊，玩家在 ch03/ch06 无法使用棋圣系统，违反「作弊即玩法」核心理念

#### A4. 验证 go/ 集成（启动 + 健康探活）

- **命令**：`cd /workspace/go && python main.py` 启动后，curl 验证：
  - `curl http://localhost:8002/` 返回 HTML
  - `curl http://localhost:80/api/rpg/health/go` 返回 `{"up": true}`
  - `curl -X POST http://localhost:8002/api/rpg/reset_battle` 返回 `{"success": true, ...}`

---

### 阶段 B：U3 重构 — 直接修改 rpg_shell.js（用户明确要求）

**目标**：按用户提示词新决策，移除 rpg_extras.js 的 monkey-patch，把守卫直接写入 rpg_shell.js 源码。

#### B1. rpg_shell.js 添加 loadChapter 守卫

- **文件**：[shared/rpg/rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js)
- **改动**：在 [rpg_shell.js:125](file:///workspace/shared/rpg/rpg_shell.js#L125) `async function loadChapter(chapterId) {` 内部第一行插入：
  ```javascript
  if (window.__RPG_TITLE_ACTIVE) {
      // 标题屏激活期间挂起章节加载请求
      window.__RPG_PENDING_CHAPTER = chapterId;
      return;
  }
  ```
- **保留**：[rpg_shell.js:72-74](file:///workspace/shared/rpg/rpg_shell.js#L72-L74) init() 内的 `if (!window.__RPG_TITLE_ACTIVE)` 守卫已正确，无需改动
- **理由**：用户提示词明确指出 monkey-patch 无法拦截闭包内部的 `_goNextChapter` 调用；直接改源码是唯一可靠方案

#### B2. rpg_extras.js 移除 monkey-patch 逻辑

- **文件**：[shared/rpg/rpg_extras.js](file:///workspace/shared/rpg/rpg_extras.js)
- **改动**：
  1. 删除 `_monkeyPatchLoadChapter` 函数（[rpg_extras.js:318-338](file:///workspace/shared/rpg/rpg_extras.js#L318-L338)）
  2. 删除 init() 中 `setTimeout(() => { _monkeyPatchLoadChapter(); ... }, 0)` 调用（[rpg_extras.js:55-58](file:///workspace/shared/rpg/rpg_extras.js#L55-L58)），保留 `_bindSettingsStatus()`
  3. `_onStartGame`（[rpg_extras.js:92-106](file:///workspace/shared/rpg/rpg_extras.js#L92-L106)）改为：
     - 设置 `window.__RPG_TITLE_ACTIVE = false` 后，调用 `RpgShell.loadChapter(ch)`
     - 由于 B1 已加守卫，loadChapter 现在能正常执行（因为标志已置 false）
  4. `_onTutorialFromTitle`、`_bindTutorialButton` 中的 `titleScreenActive = false; window.__RPG_TITLE_ACTIVE = false;` 保留不变（仍需在调用 loadChapter 前关闭标题屏）
- **保留**：所有 UI 逻辑（标题屏菜单、文档模态框、粒子动画、章节背景切换、设置状态显示）不动

#### B3. 更新 rpg_shell.html 注释

- **文件**：[shared/rpg/rpg_shell.html](file:///workspace/shared/rpg/rpg_shell.html)
- **改动**：[rpg_shell.html:271-272](file:///workspace/shared/rpg/rpg_shell.html#L271-L272) 的注释从「rpg_extras 必须在 rpg_shell 之前加载，以便 monkey-patch RpgShell.loadChapter」改为「rpg_extras 必须在 rpg_shell 之前加载，以设置 `window.__RPG_TITLE_ACTIVE = true` 阻止 init() 自动加载序章」
- **理由**：注释与新决策对齐

---

### 阶段 C：U6 章节背景图片化（ch02-ch06）

**目标**：把剩余 5 个章节的主背景从 `type:"solid"` 改为 `type:"image"`，引用已生成的像素 PNG。

#### C1. 批量修改章节 JSON

- **文件**：
  - [rpg_data/chapters/ch02_city_xiangqi.json](file:///workspace/rpg_data/chapters/ch02_city_xiangqi.json) — `bg_street` solid → image，引用 `/shared/rpg/assets/bgs/ch02_city_xiangqi.png`
  - [rpg_data/chapters/ch03_go_intro.json](file:///workspace/rpg_data/chapters/ch03_go_intro.json) — `bg_mountain` solid → image，引用 `/shared/rpg/assets/bgs/ch03_go_intro.png`
  - [rpg_data/chapters/ch04_boss_wuziqi.json](file:///workspace/rpg_data/chapters/ch04_boss_wuziqi.json) — `bg_night` solid → image，引用 `/shared/rpg/assets/bgs/ch04_boss.png`
  - [rpg_data/chapters/ch05_final_xiangqi.json](file:///workspace/rpg_data/chapters/ch05_final_xiangqi.json) — `bg_temple` solid → image，引用 `/shared/rpg/assets/bgs/ch05_final.png`
  - [rpg_data/chapters/ch06_finale_go.json](file:///workspace/rpg_data/chapters/ch06_finale_go.json) — `bg_void` solid → image，引用 `/shared/rpg/assets/bgs/ch06_finale.png`
- **保留**：副背景 `bg_board`（棋盘）保持 solid，因为棋盘章节进入对战后不显示 VN 背景
- **格式参考**：[ch00_prologue.json:36-38](file:///workspace/rpg_data/chapters/ch00_prologue.json#L36-L38) 已是正确格式：`{ "id": "bg_xxx", "name": "xxx", "type": "image", "image": "/shared/rpg/assets/bgs/xxx.png" }`

---

### 阶段 D：U7 完整扩展 ch03 / ch06 围棋章节

**目标**：把 ch03_go_intro 和 ch06_finale_go 从 1 场景 7 节点的降级骨架扩展为 3-4 场景 30+ 节点的标准章节，与 ch00/ch01 质量对齐。

#### D1. ch03_go_intro.json 完整扩展

- **文件**：[rpg_data/chapters/ch03_go_intro.json](file:///workspace/rpg_data/chapters/ch03_go_intro.json)
- **当前状态**：1 场景 7 节点，n7 文本「本章围棋局暂缺，可点击跳过本章继续」
- **目标结构**（参考 ch01 的 6 场景模式）：
  - **scene_1 · 云子山·初遇**（约 8 节点）— 少年登山遇云子老人，老人原本推辞，被少年的执念打动
  - **scene_2 · 围棋之道**（约 7 节点）— 老人讲解 9×9 围棋基础规则（黑先、提子、禁着点、终局数子）
  - **scene_3 · 战前对话**（约 6 节点）— 老人的人格设定（沉稳、远见），少年的决心
  - **scene_4 · 开局**（约 4 节点）— VN 结束，进入围棋 iframe 对战
  - 战后胜负旁白仍由 [rpg_shell.js:336-348](file:///workspace/shared/rpg/rpg_shell.js#L336-L348) 的 `_playOutcomeStory` 通用模板处理
- **角色**：
  - boy（少年）— 4 个表情（neutral/thinking/surprised/determined）
  - robot 重命名为「云子老人」— 4 个表情（front_idle/thinking/scheming/surprised）
- **背景**：
  - `bg_mountain` → image `/shared/rpg/assets/bgs/ch03_go_intro.png`（已在阶段 C1 改）
- **删除**：n7 的「围棋局暂缺」文本，改为正常 `jump` 节点或直接 `end`（由 rpg_shell 自动进入对战）
- **教学关键词**（可选覆盖）：围棋、9×9、提子、禁着、终局数子

#### D2. ch06_finale_go.json 完整扩展

- **文件**：[rpg_data/chapters/ch06_finale_go.json](file:///workspace/rpg_data/chapters/ch06_finale_go.json)
- **当前状态**：1 场景 7 节点，n7 文本「本章围棋局暂缺，可点击跳过本章查看结局」
- **目标结构**：
  - **scene_1 · 执念之渊**（约 8 节点）— 少年坠入虚空，执念化身现身
  - **scene_2 · 最终对白**（约 7 节点）— 执念化身揭示身份（少年的另一面），发起围棋终极战
  - **scene_3 · 终局之战**（约 4 节点）— VN 结束，进入围棋对战
  - 战后由 rpg_server.py 的 `determine_ending()`（[rpg_server.py:255](file:///workspace/shared/rpg/rpg_server.py#L255)）判定结局
- **角色**：
  - boy（少年）— 4 个表情（neutral/determined/surprised/victory）
  - robot 重命名为「执念化身」— 4 个表情（front_idle/scheming/angry/defeat）
- **背景**：
  - `bg_void` → image `/shared/rpg/assets/bgs/ch06_finale.png`（已在阶段 C1 改）
- **关键差异**：ch06 是终章，对战后由 rpg_server 自动判定 ending（good/bad/secret），无需在 VN 中写死后结局文本；rpg_shell.js 的 `_showFinalEnding()` 会显示结局
- **删除**：n7 的「围棋局暂缺」文本

---

### 阶段 E：U8 端到端测试（webapp-testing skill）

**目标**：启动 4 个服务跑 Playwright 测试，验证全流程可玩。

#### E1. 启动多服务

- 使用 `webapp-testing` skill 的 `with_server.py` 启动：
  ```bash
  python /webapp-testing/scripts/with_server.py \
    --server "cd /workspace/xiangqi && python main.py" --port 8000 \
    --server "cd /workspace/wuziqi && python main.py" --port 8001 \
    --server "cd /workspace/go && python main.py" --port 8002 \
    --server "cd /workspace/shared/rpg && python rpg_server.py" --port 80 \
    -- python e2e_test.py
  ```
- 先 `python /webapp-testing/scripts/with_server.py --help` 确认用法

#### E2. Playwright 测试脚本

- **新建文件**：`/workspace/.trae/documents/e2e_test.py`（测试脚本，非项目代码）
- **测试用例**：
  1. 标题屏显示，「开始游戏」按钮可点击
  2. 点击「开始游戏」→ 标题屏消失，序章 VN 开始
  3. 序章 VN 播完 → 自动进入 ch01 教程
  4. 顶栏「?」按钮 → 文档模态框打开
  5. 文档模态框 Esc 关闭
  6. 章节抽屉 → 列表显示 7 个章节
  7. 切换到 ch03_go_intro → 验证不再显示「围棋局暂缺」文本
  8. 切换到 ch06_finale_go → 验证不再显示「围棋局暂缺」文本
  9. 进入 ch03 对战 → iframe 加载 `http://localhost:8002/?rpg=1`，postMessage `RPG_READY` 收到
  10. ch03 围棋落子 → `RPG_MOVE_COMPLETE` 消息收到，能量条更新
- **关键技术点**：`wait_for_load_state('networkidle')` 等待 iframe 加载；`frame_locator` 访问 iframe 内部

#### E3. 测试报告

- 截图保存到 `/workspace/.trae/documents/screenshots/`
- 测试失败时打印详细错误（含堆栈、DOM 快照）

---

### 阶段 F：更新计划书 v2.0

**目标**：把 [项目计划书_RPG大游戏.md](file:///workspace/项目计划书_RPG大游戏.md) 的过时状态清单和变更记录补齐。

#### F1. 更新第 1.1 节「已完成且可用」

- 加 `go/` 子项目一行（端口 8002，含 rpg_adapter.js，含 /api/rpg/* 路由）
- 加 `rpg_extras.js`（355 行）一行
- 加 `shared/rpg/assets/` 15 个 PNG 资产一行
- 加 `rpg_shell.html` 标题屏 + 文档模态框一行
- 把 ch01 的状态从「骨架」改为「完整（6 场景）」
- 把 ch03/ch06 的状态从「降级骨架」改为「完整（X 场景 Y 节点）」
- 把章节背景从「solid 纯色」改为「image 像素画」

#### F2. 更新第 1.2 节「未完成」

- 标记 U1（围棋接入）✅ 完成
- 标记 U2（像素资产）✅ 完成
- 标记 U3（标题屏 + rpg_extras.js）✅ 完成（采用直接改 rpg_shell.js 源码方案）
- 标记 U4（游玩文档模态框）✅ 完成
- 标记 U5（ch01 扩展）✅ 完成
- 标记 U6（章节背景图片化）✅ 完成
- 标记 U7 ch03/ch06 ✅ 完成；ch02/ch04/ch05 ⚠️ 仍骨架（用户未要求扩展）
- 标记 U8（端到端测试）✅ 完成

#### F3. 更新第 7.2 节「U3 实现方式」

- 把「Monkey-patch `RpgShell.loadChapter`」改为「直接修改 rpg_shell.js 源码，在 init() 和 loadChapter() 入口加 `window.__RPG_TITLE_ACTIVE` 守卫」
- 把 D7 决策改为 D7-revised

#### F4. 第 9 章变更记录新增一行

```
| 2026-07-19 | v2.1 | 1.1/1.2/7.2/9 | 继任 AI 接手：修复 go/ 端口 8000→8002 与 rpg_adapter.js 缺失；U3 重构为直接改 rpg_shell.js；U6 补全 ch02-ch06 背景图片化；U7 完整扩展 ch03/ch06；U8 端到端测试 |
```

---

## 3. 关键技术约束（Phase 1 已确认）

1. **rpg_adapter.js 启用条件**：URL 含 `?rpg=1` 才启用（[rpg_adapter.js:11](file:///workspace/shared/rpg/rpg_adapter.js#L11)）；rpg_shell.js 加载 iframe 时通过 `chapter.iframe_url` 传参
2. **rpg_adapter.js 依赖**：go/static/app.js 需暴露 `window.app.loadConfigs()` 或 `window.app.refresh()` 用于作弊后刷新棋盘（[rpg_adapter.js:73-83](file:///workspace/shared/rpg/rpg_adapter.js#L73-L83)）
3. **rpg_adapter.js fetch hook**：拦截 `/api/move` 和 `/api/ai_move` 响应推导 captured/game_ended（[rpg_adapter.js:100](file:///workspace/shared/rpg/rpg_adapter.js#L100)）；go/main.py 必须返回 `board_state.move_history` 和 `board_state.game_status` 字段
4. **章节 JSON 节点类型**（8 种）：`bg` / `narration` / `show_char` / `hide_char` / `dialogue` / `choice` / `jump` / `end`
5. **跨场景跳转**：`choice` 和 `jump` 节点用 `next_scene_id` + `next_node_id`（或 `target_scene_id` + `target_node_id`），参考 [ch01:101-102](file:///workspace/rpg_data/chapters/ch01_tutorial_wuziqi.json#L101-L102)
6. **ch06 结局判定**：rpg_server.py 在 `chapter_id == "ch06_finale_go"` 时调用 `determine_ending()`（[rpg_server.py:255](file:///workspace/shared/rpg/rpg_server.py#L255)），结局由 `cheats_used` 和 `was_detected` 决定，VN 无需写死
7. **像素资产已生成**：[shared/rpg/assets/manifest.json](file:///workspace/shared/rpg/assets/manifest.json) 显示 15 个 PNG 全部 `ok=true`，总大小约 50MB
8. **z-index 层级**：drawer=200 / modal=300 / toast=400 / title-screen=500 / loading=600 / manual-modal=800（来自 rpg_extras.js 注释，需在 rpg_style.css 确认）
9. **API Key 已就绪**：DeepSeek Key 在 [api密钥.txt](file:///workspace/api密钥.txt)，rpg_server 启动时自动读取 [xiangqi/api密钥.txt](file:///workspace/xiangqi/api密钥.txt)（[rpg_server.py:26](file:///workspace/shared/rpg/rpg_server.py#L26)）

---

## 4. 假设与决策

### 4.1 假设

1. **go/ 子项目功能完整**：仅核查了 [go/main.py:1-50](file:///workspace/go/main.py#L1-L50) 和端口配置，假定围棋引擎（chess_ai.py / rule_engine.py / mechanism_engine.py）可正常工作，待阶段 E 测试验证
2. **rpg_server.py 章节配置无需改动**：[rpg_server.py:83-114](file:///workspace/shared/rpg/rpg_server.py#L83-L114) 已正确把 ch03/ch06 配置为 `chess_type: "go"`、`player_side: "black"`，无需改动
3. **现有像素资产 URL 路径正确**：rpg_extras.js 的 `CHAPTER_BG_MAP`（[rpg_extras.js:26-34](file:///workspace/shared/rpg/rpg_extras.js#L26-L34)）已配置所有 7 个章节背景 URL
4. **ch02/ch04/ch05 不在本次范围**：用户明确要求只扩展 ch03/ch06，ch02/ch04/ch05 仍骨架留作后续

### 4.2 决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 跳过 git pull | 工作树已与 origin/main 同步，无需无意义操作 |
| D2 | U3 重构（直接改 rpg_shell.js） | 用户明确要求新决策；monkey-patch 在闭包场景下不可靠 |
| D3 | go/main.py 添加 /api/rpg/* 路由 | 用户要求「完整扩展为 U7 标准章节」；围棋章节必须支持作弊 |
| D4 | ch03/ch06 战后仍用通用 _playOutcomeStory 模板 | 与 ch01/ch02/ch04/ch05 一致；只有 ch06 结局由 rpg_server 判定 |
| D5 | ch02/ch04/ch05 不扩展 | 用户未要求；保证已扩展章节稳定性优先 |
| D6 | 测试脚本放 .trae/documents/ | 测试脚本属开发产物，不污染项目根目录 |

---

## 5. 验证步骤

### 5.1 单元验证（每个阶段完成后）

- **阶段 A 后**：
  - `python /workspace/go/main.py` 启动无报错，监听 8002
  - `curl http://localhost:8002/` 返回 HTML
  - `curl -X POST http://localhost:8002/api/rpg/reset_battle` 返回 `{"success": true}`
- **阶段 B 后**：
  - 在浏览器加载 `http://localhost/`，标题屏显示
  - 点击「开始游戏」→ 标题屏消失，序章 VN 开始（验证 loadChapter 守卫生效）
  - 控制台无 `[RpgExtras] _monkeyPatchLoadChapter` 相关日志
- **阶段 C 后**：
  - 切换到 ch02-ch06 章节，VN 背景显示为图片（不是纯色）
- **阶段 D 后**：
  - ch03/ch06 VN 播完不再显示「围棋局暂缺」
  - ch03/ch06 自动进入围棋对战（iframe 加载 8002 端口）

### 5.2 端到端验证（阶段 E）

- 启动 4 服务全跑通
- Playwright 测试 10 个用例全部通过
- 截图证明：标题屏 / 序章 / ch01 教程 / ch03 围棋 / ch06 终局 / 文档模态框 / 章节抽屉

### 5.3 文档验证（阶段 F）

- 计划书 v2.1 第 1.1 节列出 go/、rpg_extras.js、像素资产等已完成项
- 第 1.2 节 U1-U8 状态正确
- 第 9 章变更记录新增 2026-07-19 条目

---

## 6. 风险与应对

| 风险 | 等级 | 应对 |
|---|---|---|
| go/ 围棋引擎实际有 BUG（chess_ai/rule_engine 不工作） | 中 | 阶段 A4 启动验证 + 阶段 E 落子测试；若失败回退到降级骨架 |
| rpg_shell.js 加守卫后 init() 时序变化 | 低 | init() 已有 `if (!window.__RPG_TITLE_ACTIVE)` 守卫，loadChapter 守卫是其补充；测试验证 |
| ch03/ch06 VN 扩展后节点 ID 冲突 | 低 | 严格使用 s2_n1 / s3_n1 等前缀命名，参考 ch01 模式 |
| Playwright 测试 iframe 跨域问题 | 中 | rpg_adapter.js 已用 `postMessage('*')`，应可通；若失败用 `frame_locator` 替代 |
| 像素资产 URL 404 | 低 | manifest.json 显示 15/15 ok=true；rpg_server.py 已 mount `/shared` 静态目录 |
| go/main.py 加 /api/rpg/* 路由后与现有路由冲突 | 低 | xiangqi/main.py 同样位置加路由无冲突，go/ 结构一致 |

---

## 7. 执行顺序总览

```
阶段 A (修复 go/) ──→ 阶段 B (U3 重构) ──→ 阶段 C (U6 背景图)
                                              │
                                              ↓
阶段 F (更新文档) ←── 阶段 E (端到端测试) ←── 阶段 D (U7 ch03/ch06 扩展)
```

每个阶段完成后立即验证，发现问题回头修复，不积压到末尾。

---

## 8. 不在本次范围

- ch02/ch04/ch05 完整剧情扩展（用户未要求）
- U9 存档系统 / U10 BGM / U11 设置扩展 / U12 章节切换动画（低优先级）
- 重新生成像素资产（已全部生成）
- git push 到远端（用户未要求）
- 创建新的 README/文档（用户未要求）

---

*本计划基于 2026-07-19 真实代码核查。执行过程中如发现新问题，及时更新本计划。*
