# 棋圣 (ChessSage) - 项目计划书：RPG 大游戏

> **本文档是后续开发的活路线图**：基于当前真实代码状态，给出清晰的待办清单、优先级与技术约束。
> 旧版 v1.0 计划书已过时（含已删除的道具/经济/大地图等机制），实际执行以本文为准。

**版本**：v2.1（继任开发阶段 A-F 全部完成）
**日期**：2026-07-19
**前置阅读**：[README.md](./README.md) · [执行方案.md](./执行方案.md)

---

## 目录

1. [当前真实状态](#1-当前真实状态)
2. [核心理念与设计哲学](#2-核心理念与设计哲学)
3. [世界观与剧情大纲](#3-世界观与剧情大纲)
4. [核心玩法机制](#4-核心玩法机制)
5. [技术架构](#5-技术架构)
6. [后续开发路线图](#6-后续开发路线图)
7. [详细任务清单](#7-详细任务清单)
8. [风险与决策](#8-风险与决策)
9. [变更记录](#9-变更记录)

---

## 1. 当前真实状态

> 以下清单基于 2026-07-18 的代码核查，**与实际磁盘状态一致**。

### 1.1 ✅ 已完成且可用

#### RPG 外壳层（`shared/rpg/`）

| 文件 | 行数 | 说明 |
|---|---|---|
| [rpg_server.py](file:///workspace/shared/rpg/rpg_server.py) | 688 | FastAPI 端口 80，12 条路由，RpgState 状态管理，识破公式，结局判定 |
| [rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js) | 496 | 章节管理 / iframe 加载 / postMessage 通信 / 状态同步 / 标题屏守卫 |
| [rpg_shell.html](file:///workspace/shared/rpg/rpg_shell.html) | 281 | 顶栏 + 主区 + VN 舞台 + 章节抽屉 + 设置模态框 + 标题屏 + 加载遮罩 + 文档模态框 |
| [rpg_style.css](file:///workspace/shared/rpg/rpg_style.css) | 426 | 像素风样式（顶栏/能量条/按钮/模态框/Toast/响应式） |
| [rpg_extras.js](file:///workspace/shared/rpg/rpg_extras.js) | 336 | 标题屏 / 加载遮罩 / 游玩文档 / 教程入口 / 章节背景切换 / 设置状态显示 |
| [cheat_panel.js](file:///workspace/shared/rpg/cheat_panel.js) | 184 | 评估消耗 → 确认执行 → 对手台词触发 |
| [story_layer.js](file:///workspace/shared/rpg/story_layer.js) | 311 | 封装 Preview.playStory，章节剧情/对手台词/系统消息 |
| [rpg_adapter.js](file:///workspace/shared/rpg/rpg_adapter.js) | 182 | 通用 iframe adapter，fetch hook 推导吃子/胜负 |
| [dialogue_templates.json](file:///workspace/shared/rpg/dialogue_templates.json) | — | 6 类 × 4 条 = 24 条对手「认知扭曲」台词 |
| [vn_player/preview.js](file:///workspace/shared/rpg/vn_player/preview.js) | 566 | VN 引擎，11 种节点类型 |
| [vn_player/variable_manager.js](file:///workspace/shared/rpg/vn_player/variable_manager.js) | 55 | 最小变量管理实现 |
| [vn_player/vn_style.css](file:///workspace/shared/rpg/vn_player/vn_style.css) | 132 | VN 舞台样式 |

#### RPG 后端路由（12 条）

```
GET  /                                → RPG 外壳页面
GET  /api/rpg/chapters                → 7 个章节列表
GET  /api/rpg/chapter/{chapter_id}    → 章节元信息（chess_type + iframe_url + service_up）
POST /api/rpg/battle/start            → 启动对战（重置能量=0，记录章节）
POST /api/rpg/cheat/assess            → 评估作弊消耗（转发到棋类 /api/command?dry_run=1）
POST /api/rpg/cheat/use               → 执行作弊（扣能量 + 算识破 + 掷骰 + 返回对手台词）
POST /api/rpg/move_complete           → 走棋完成（加能量：吃子+10/被吃+5/将军+3/五连+15/提子+8/每5回合+2）
POST /api/rpg/battle/end              → 对战结束（结算章节进度 + 结局判定）
GET  /api/rpg/state                   → RPG 全局状态
GET  /api/rpg/vn/{story_id}           → 章节剧情 JSON
POST /api/rpg/apikey                  → 设置并下发 DeepSeek API Key
GET  /api/rpg/health/{chess_type}     → 棋类服务健康探活
```

#### 章节剧情数据（`rpg_data/chapters/`）

| 章节 | 场景数 | 节点数 | 完整度 |
|---|---|---|---|
| ch00_prologue（序章·觉醒） | 4 | 25 | ✅ 完整 |
| ch01_tutorial_wuziqi（第 0 章·教程） | 6 | 46 | ✅ 完整（剧情化系统教学） |
| ch02_city_xiangqi（第 1 章·入门） | 2 | 15 | ⚠️ 骨架 |
| ch03_go_intro（第 2 章·进阶） | 4 | 33 | ✅ 完整（围棋对战 + 围棋之道讲解） |
| ch04_boss_wuziqi（第 3 章·BOSS战） | 1 | 9 | ⚠️ 骨架 |
| ch05_final_xiangqi（第 4 章·终极对决） | 1 | 9 | ⚠️ 骨架 |
| ch06_finale_go（第 5 章·终局） | 3 | 24 | ✅ 完整（围棋终局 + 多结局） |

#### 棋类子项目

| 子项目 | 端口 | cost_energy | dry_run | rpg_adapter | 状态 |
|---|---|---|---|---|---|
| [xiangqi/](file:///workspace/xiangqi/) | 8000 | ✅ 7 处 | ✅ 5 处 | ✅ 已引入 | 完整可用 |
| [wuziqi/](file:///workspace/wuziqi/) | 8001 | ✅ 7 处 | ✅ 5 处 | ✅ 已引入 | 完整可用 |
| [go/](file:///workspace/go/) | 8002 | ✅ 支持 | ✅ 支持 | ✅ 已引入 | 完整可用（9×9 简化围棋） |

#### 共享资产

- [shared/assets/characters/boy/](file:///workspace/shared/assets/characters/boy/) — 主角立绘 18 张表情
- [shared/assets/characters/robot/](file:///workspace/shared/assets/characters/robot/) — 棋圣系统立绘 17 张表情
- [shared/schema_validator.py](file:///workspace/shared/schema_validator.py) — JSON Schema 校验
- [shared/json_patch_utils.py](file:///workspace/shared/json_patch_utils.py) — RFC 6902 Patch 工具

#### 像素资产（`shared/rpg/assets/`）

- **8 张章节背景**：ch00_prologue / ch01_tutorial / ch02_city_xiangqi / ch03_go_intro / ch04_boss / ch05_final / ch06_finale / title_screen
- **5 个图标**：logo / energy_orb / detection_eye / menu_scroll / book_manual
- **2 个 UI**：border_ornate / vignette_overlay
- 共 15 个 PNG，`manifest.json` 15/15 ok=true

### 1.2 ❌ 未完成（明确清单）

#### 高优先级（影响核心体验）

| # | 待办 | 说明 |
|---|---|---|
| U1 | ~~围棋子项目 `go/`~~ | ✅ **已完成**：端口 8002，9×9 简化围棋 + 启发式 AI + 前端 + rpg_adapter + 3 个 RPG 代理路由 |
| U2 | ~~像素画资产~~ | ✅ **已完成**：15 个 PNG 全部生成（8 bgs + 5 icons + 2 ui），manifest 15/15 ok=true |
| U3 | ~~标题屏 + 加载遮罩~~ | ✅ **已完成**：rpg_extras.js 336 行，标题屏 / 加载遮罩 / 粒子动画 / 章节背景切换（D7-revised 决策） |
| U4 | ~~游玩文档模态框~~ | ✅ **已完成**：7 段内置文档 + 顶栏 ? 按钮 + Esc 关闭 |

#### 中优先级（影响完整度）

| # | 待办 | 说明 |
|---|---|---|
| U5 | ~~教程章节扩展~~ | ✅ **已完成**：ch01 扩展为 6 场景 46 节点剧情化系统教学 |
| U6 | ~~章节背景图片化~~ | ✅ **已完成**：ch00-ch06 主背景 solid → image，引用像素画 PNG |
| U7 | **ch02-ch06 完整剧情** | 🟡 **部分完成**：ch03（4场景33节点）/ ch06（3场景24节点）已完成；ch02/ch04/ch05 仍为骨架 |
| U8 | ~~端到端测试脚本~~ | ✅ **已完成**：e2e_test.py（10 用例覆盖标题屏/VN/文档/章节抽屉/ch03+ch06/go健康/RPG路由/资产可访问性） |

#### 低优先级（锦上添花）

| # | 待办 | 说明 |
|---|---|---|
| U9 | 存档系统 | JSON 文件存档（多槽位），当前仅内存状态 |
| U10 | BGM / 音效 | 章节主题曲 + 作弊/识破音效 |
| U11 | 设置菜单扩展 | 难度切换、音量控制 |
| U12 | 章节切换动画 | VN 过渡效果增强 |

### 1.3 已知技术约束（核查确认）

1. **preview.js 的两个补丁已应用**：`preview-stage`→`vn-stage` id；内联最小 VariableManager
2. **棋类 move 响应不含 `captured_piece`/`game_ended` 字段**：rpg_adapter.js 从 `board_state.move_history[-1]` 与 `game_status` 推导
3. **player_side 不一致**：象棋玩家=红方，五子棋玩家=黑方。RPG 层按 `board_state.player_side` 判定
4. **CORS 已开启**：`allow_origins=["*"]`
5. **API Key 自动读取**：`xiangqi/api密钥.txt` 存在时 rpg_server 启动自动加载

---

## 2. 核心理念与设计哲学

### 2.1 灵活编码（最高纲领）

> 所有新玩法（新棋类、新作弊技能、新对手规则）都尽量通过 AI 现场生成代码实现，而非硬编码。
> RPG 框架本身可以是硬编码，但**棋类内容与作弊实现保持灵活**。

### 2.2 作弊即玩法

玩家的「作弊」被包装为「棋圣系统的超能力」：
- 每次改写规则消耗**能量**（≥30 门槛，允许透支）
- 每次作弊累积**识破概率**（全局只增不减，封顶 95%）
- 对手的「认知会被扭曲」——合理化你的违规（预脚本台词，不用 AI 生成）

### 2.3 元引擎保证

任何棋类（象棋、五子棋、围棋、自定义棋）都能装载为关卡，规则可被 AI 现场改写。jump/ray 双原子规则体系是跨棋类的核心保证。

### 2.4 三大优先级（开发时牢记）

1. **稳定性** > 2. **核心爽点（对手合理化台词）** > 3. **完成度**
   - 宁可少做几个章节，也要保证已有的章节稳定可玩
   - 对手作弊后的「认知扭曲台词」是本项目最核心的爽点，必须稳定触发
   - 围棋是最大风险点，时间紧迫时可降级处理

---

## 3. 世界观与剧情大纲

### 3.1 主角设定

| 字段 | 设定 |
|---|---|
| 姓名 | 默认「林弈」（玩家可改） |
| 年龄 | 16 岁 |
| 身份 | 普通高中一年级学生 |
| 性格 | 倔强、好胜、但棋力平庸 |
| 背景 | 课间被同桌连虐十几把五子棋，气得晕倒，醒来觉醒棋圣系统 |
| 立绘 | `shared/assets/characters/boy/` 18 张表情 |

### 3.2 棋圣系统设定

寄宿在主角意识中的 AI 实体，外观为像素机器人（`shared/assets/characters/robot/` 17 张表情）。

| 能力 | 描述 | 对应模块 |
|---|---|---|
| 意识对话 | 作为「导师」与主角对话，提供建议、解说规则 | VisualNovelPlayer |
| 规则改写 | 「许愿」修改棋盘/棋子/规则 | B/C/C+ 类 CodeAI |
| 机制操控 | 冻结对手、AI 接管、随机走棋、额外回合、步数限制 | A2 类机制引擎 |
| AI 性格预判 | 分析对手的 AI 性格，给出克制建议 | AI 性格系统 |

### 3.3 主线剧情大纲

#### 序章·觉醒（ch00，已完成）

- 场景：少年房间，深夜
- 剧情：少年研究残局困倦入睡 → 梦境中棋圣系统现身 → 选择接受/拒绝 → 醒来耳边回响低语
- 4 场景 25 节点，纯 VN

#### 第 0 章·教程（ch01，待扩展）

- 场景：棋圣空间（数据虚空）
- 剧情：棋圣系统讲解能量条/作弊指令/识破概率 → 进入五子棋实战
- 当前 2 场景 19 节点（骨架），待扩展为 6 场景 46 节点完整教学

#### 第 1 章·入门（ch02，骨架）

- 场景：街亭
- 剧情：少年来到街亭，遇街亭棋客摆擂 → 象棋首战
- 待扩展为完整战前 + 战后分支

#### 第 2 章·进阶（ch03，降级骨架）

- 场景：云子山
- 剧情：vs 云子老人（围棋 9×9）
- 围棋服务未实现时自动降级为纯 VN 跳过

#### 第 3 章·BOSS战（ch04，骨架）

- 场景：夜枭塔
- 剧情：vs 夜枭（五子棋，规则变体：六连才算赢）
- 待扩展

#### 第 4 章·终极对决（ch05，骨架）

- 场景：棋圣殿
- 剧情：vs 棋圣真身（象棋，BOSS 也会作弊）
- 待扩展

#### 第 5 章·终局（ch06，降级骨架）

- 场景：执念之渊
- 剧情：vs 执念化身（围棋）+ 结局判定
- 围棋未实现时降级；结局判定逻辑已就位

### 3.4 多结局设计

| 结局 | 触发条件 | 描述 |
|---|---|---|
| Good Ending | `was_detected == False` 且 `cheats_used > 0` | 完美棋圣 |
| Bad Ending | `was_detected == True` | 胜利后对手们联合揭发，主角被驱逐 |
| 真结局（隐藏） | `cheats_used == 0` | 全程不使用任何作弊，展现真正的棋艺 |

> 结局判定逻辑已在 `rpg_server.py` 的 `_compute_ending()` 实现。

---

## 4. 核心玩法机制

### 4.1 能量条（Energy）

| 参数 | 值 | 说明 |
|---|---|---|
| 最大值 | 100 | 上限 |
| 起始值 | 0 | **每局对战开始时清空** |
| 使用门槛 | 30 | 低于 30 不能发起 AI 作弊（但允许透支） |
| 透支允许 | 是 | 可降至负值，透支越多识破惩罚越重 |

#### 能量获取（吃子加成）

| 事件 | 能量增量 | 理由 |
|---|---|---|
| 玩家吃对方子 | +10 | 主动进攻奖励 |
| 玩家被吃子 | +5 | 被动受挫补偿 |
| 玩家将军（仅象棋） | +3 | 战术奖励 |
| 围棋提子（仅围棋） | +8/子 | 围棋吃子更难 |
| 五子棋成五连（仅五子棋） | +15 | 即将获胜奖励 |
| 回合开始（每 5 回合） | +2 | 防止僵局 |

### 4.2 识破概率（Detection）

```
识破概率 = 累计识破值（全局，只增不减，0% 起步，封顶 95%）

每使用一次作弊后结算：
  增量 = 基础增量 + 烈度加成 + 透支惩罚
    基础增量 = 2%（固定）
    烈度加成 = cost_energy × 0.5%
    透支惩罚 = max(0, -当前能量 / 10) × 3%
  
  累计识破值 += 增量
  累计识破值 = min(累计识破值, 95%)
  
  掷骰：if random() < 累计识破值 / 100:
      was_detected = True  （永久标记，当前对战继续）
```

#### 关键规则

- `was_detected` 是**全局永久标记**，一旦为 True 不可逆转
- 识破**不影响当前对战**，玩家仍可继续作弊并获胜
- 识破**只在终章结算时影响结局**（触发 Bad Ending）
- 玩家在游戏中**看不到识破概率**（保持悬念）

### 4.3 作弊指令分类（AI 评估 cost_energy）

| 类型 | 说明 | cost_energy 范围 |
|---|---|---|
| A1 | 硬编码（undo_move / set_winner） | 8-10 |
| A2 | 机制原语（skip_turns / ai_control / random_moves / extra_turns / move_limits） | 2-4 |
| B | 棋盘变换（添加/移除棋子） | 5-8 |
| C | 规则修改 | 4-6 |
| C+ | 创造新棋子 | 8-10 |
| D | 界面美化 | 0 |
| E | 搞笑回复 | 0 |

### 4.4 已删除的机制（不要实现）

以下机制已从原 v1.0 计划书删除：

- ❌ 冷却回合（能量条机制足够）
- ❌ 道具系统（能量药剂/幸运币等）
- ❌ 经济系统（金币/棋魂）
- ❌ 经验/升级/属性点
- ❌ 商店
- ❌ 大地图自由探索（改为线性章节）
- ❌ 现实扭曲属性
- ❌ 被禁用作弊类型（改为 BOSS 战自然限制能量）

---

## 5. 技术架构

### 5.1 Option A：RPG 外壳 + iframe + postMessage 协议

```
┌──────────────────────────────────────────────────────────┐
│              浏览器 / RPG 外壳 (localhost:80)              │
│                                                           │
│  ┌─────────────┐  ┌──────────────────────────────────┐   │
│  │  RpgShell   │  │  对战区域（iframe）               │   │
│  │             │  │  xiangqi / wuziqi / go 前端       │   │
│  │ • 章节管理   │  │  + 棋圣系统作弊侧栏              │   │
│  │ • 能量/识破  │  │  + 能量条 / 回合数               │   │
│  │ • VN 故事层  │  └──────────────────────────────────┘   │
│  └─────────────┘                                          │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP + postMessage
┌──────────────────────▼───────────────────────────────────┐
│                RPG 后端 (FastAPI, port 80)                 │
│                                                           │
│  12 条路由 + RpgState 状态管理 + 识破公式 + 结局判定       │
│  转发到 → xiangqi:8000 / wuziqi:8001 / go:8002            │
└──────────────────────────────────────────────────────────┘
```

### 5.2 postMessage 协议（严格定义）

```
RPG 外壳 → iframe:
  { type: "RPG_INIT", chapter_id, player_side, chess_type }
  { type: "RPG_APPLY_CHEAT", patch, target_config }

iframe → RPG 外壳:
  { type: "RPG_READY" }
  { type: "RPG_MOVE_COMPLETE", captured, mover, is_check, game_ended, winner, is_five_in_a_row, go_captures }
  { type: "RPG_GAME_END", winner, moves_count }
```

### 5.3 技术栈

| 层 | 技术 | 理由 |
|---|---|---|
| RPG 前端 | 原生 HTML/CSS/JS + ES Modules | 与项目「AI 灵活编码」理念一致，避免构建工具链 |
| RPG 后端 | Python FastAPI | 沿用现有棋类后端，新增 RPG 路由 |
| 棋类对战 | iframe 嵌入 xiangqi/wuziqi/go | 故障隔离，零改动复用 |
| VN 演出 | shared/rpg/vn_player/preview.js | 11 种节点类型，从 story-editor 复制并打补丁 |
| AI 层 | DeepSeek API | 棋圣系统作弊直接调用现有 ai_orchestrator |
| 存储 | JSON 文件 + 内存状态 | 简单可靠，与现有架构一致 |
| 像素资产生成 | Seedream 5.0-lite API（火山方舟） | 像素画风格背景/图标/UI |

### 5.4 为何不引入 React/Vue/Phaser？

- 项目核心理念是「灵活编码」——AI 生成代码。React/Vue 的 JSX/SFC 模板对 AI 不友好
- 原生 JS + ES Modules 已足够实现 RPG（参考无数独立游戏）
- 避免构建工具链（webpack/vite）增加 AI 生成代码的门槛

---

## 6. 后续开发路线图

### 阶段 v3.1：视觉打磨（进行中）

**目标**：补齐视觉资产与前端增强，使外观对标大型 RPG 游戏。

| 任务 | 优先级 | 依赖 |
|---|---|---|
| U2 生成 15 个像素画资产（Seedream） | 高 | 火山方舟 API Key |
| U3 标题屏 + 加载遮罩 + `rpg_extras.js` | 高 | U2 |
| U4 游玩文档模态框（内置教程 + 说明） | 高 | 无 |
| U6 章节背景图片化（solid → image） | 中 | U2 |
| U5 教程章节 ch01 扩展为 6 场景完整教学 | 中 | 无 |

### 阶段 v3.2：围棋接入

**目标**：实现 9×9 简化围棋，补齐第 2 章 / 第 5 章对战。

| 任务 | 优先级 | 说明 |
|---|---|---|
| U1.1 `go/go_engine.py` | 高 | 9×9 棋盘，落子/提子/禁着点/计分 |
| U1.2 `go/go_ai.py` | 高 | 启发式：优先占角 → 优先提子 → 避免自杀 → 随机 |
| U1.3 `go/main.py` + 前端 | 高 | FastAPI 端口 8002，复用 ai_orchestrator/mechanism_engine |
| U1.4 go/static/index.html 引入 rpg_adapter.js | 高 | 一行代码 |
| U1.5 扩展 ch03/ch06 为完整对战章节 | 中 | 依赖 U1.1-U1.4 |

### 阶段 v3.3：内容补全

**目标**：补齐所有章节完整剧情 + 端到端测试。

| 任务 | 优先级 | 说明 |
|---|---|---|
| U7 ch02 完整剧情（战前 + 战后分支） | 中 | 象棋首战 |
| U7 ch04 完整剧情（BOSS 战 + 规则变体） | 中 | 五子棋六连 |
| U7 ch05 完整剧情（终极对决 + BOSS 作弊） | 中 | 象棋 vs 棋圣真身 |
| U8 Playwright 端到端测试脚本 | 中 | 视觉截图 + DOM 验证 |
| U8 服务器端完整性验证脚本 | 中 | 资源/API/DOM ID 一致性 |

### 阶段 v4：长远扩展

- 存档系统（多槽位 JSON）
- BGM / 音效
- 设置菜单扩展（难度/音量）
- 新棋类子项目（国际象棋、自定义棋）
- 多人对战模式（WebSocket）
- MOD 系统（玩家自定义章节）
- 移动端适配
- 国际化（多语言）

---

## 7. 详细任务清单

### 7.1 U2：生成 15 个像素画资产

**目标**：使用 Seedream 5.0-lite API 生成像素画风格的背景/图标/UI 资产。

**资产清单**：

| 类别 | 文件 | 用途 |
|---|---|---|
| 背景 | `bgs/title_screen.png` | 标题屏背景 |
| 背景 | `bgs/ch00_prologue.png` | 序章·觉醒 |
| 背景 | `bgs/ch01_tutorial.png` | 第 0 章·教程 |
| 背景 | `bgs/ch02_city_xiangqi.png` | 第 1 章·入门 |
| 背景 | `bgs/ch03_go_intro.png` | 第 2 章·进阶 |
| 背景 | `bgs/ch04_boss.png` | 第 3 章·BOSS战 |
| 背景 | `bgs/ch05_final.png` | 第 4 章·终极对决 |
| 背景 | `bgs/ch06_finale.png` | 第 5 章·终局 |
| 图标 | `icons/logo.png` | 游戏 LOGO |
| 图标 | `icons/energy_orb.png` | 能量图标 |
| 图标 | `icons/detection_eye.png` | 识破图标 |
| 图标 | `icons/menu_scroll.png` | 菜单图标 |
| 图标 | `icons/book_manual.png` | 文档图标 |
| UI | `ui/border_ornate.png` | 装饰边框 |
| UI | `ui/vignette_overlay.png` | 暗角叠加 |

**技术约束**：
- API：火山方舟 Seedream 5.0-lite（`doubao-seedream-5-0-260128`）
- 最小像素：3,686,400（即 2560×1440 或 2048×2048）
- 风格：像素画（pixel art）、仙侠×赛博朋克
- 存放：`shared/rpg/assets/{bgs,icons,ui}/`

**实现脚本**：参考 [shared/assets/generate_all.py](file:///workspace/shared/assets/generate_all.py)，新建 `shared/rpg/assets/generate_assets.py`。

### 7.2 U3：标题屏 + 加载遮罩 + `rpg_extras.js`

**目标**：实现 RPG 标题屏（开始游戏/教程/文档/设置），加载遮罩，章节背景切换。

**新建文件**：`shared/rpg/rpg_extras.js`（336 行）

**核心功能**：
- 标题屏激活标志 `window.__RPG_TITLE_ACTIVE`（在 rpg_shell.js 之前加载，阻止其 init() 自动加载序章）
- 标题屏菜单：开始游戏 / 教程 / 游玩文档 / 设置
- 加载遮罩：首屏资源就绪后淡出
- 粒子动画：标题屏背景粒子上升效果
- 章节背景切换：通过注入动态 `<style>` 覆盖 `#rpg-app::before` 背景
- 游玩文档模态框打开/关闭（Esc 关闭、遮罩点击关闭）
- 设置模态框状态显示（API Key / 章节 / 棋类 / 作弊次数）
- 教程入口：标题屏「教程」按钮 / 侧栏「重温教程」按钮，直接跳转 ch01

**修改文件**：
- `rpg_shell.html`：在 rpg_shell.js 之前引入 rpg_extras.js；新增标题屏/加载遮罩/文档模态框 DOM；顶栏新增 `?` 帮助按钮
- `rpg_shell.js`：`init()` 入口检查 `window.__RPG_TITLE_ACTIVE`，标题屏激活时跳过初始 loadChapter；`loadChapter()` 入口同样加守卫
- `rpg_style.css`：标题屏样式（z-index 500）、加载遮罩（z-index 600）、文档模态框（z-index 350）、Toast（z-index 400）

> **D7-revised 决策变更**：原 D7 决策为 monkey-patch `RpgShell.loadChapter`，但因 `RpgShell` 是 IIFE 返回的顶层 const（非 window 属性），内部 `_goNextChapter` 走闭包引用，monkey-patch 只能拦截外部调用（章节抽屉点击），无法拦截自动「下一章」。**新决策：直接修改 `rpg_shell.js` 源码**，在 `init()` 与 `loadChapter()` 入口添加 `__RPG_TITLE_ACTIVE` 守卫；`rpg_extras.js` 只负责 UI 与标志生命周期管理。

**关键时序**：
```
rpg_extras.js 加载 → 设置 __RPG_TITLE_ACTIVE = true
  ↓
rpg_shell.js 加载 → init() 检查标志，跳过 loadChapter
  ↓
用户点击「开始游戏」→ _dismissTitleScreen() → __RPG_TITLE_ACTIVE = false → loadChapter('ch00_prologue')
```

### 7.3 U4：游玩文档模态框

**目标**：内置游戏教程 + 玩法说明页面，介绍游戏理念、教玩家游玩。

**文档结构**（嵌入 `rpg_shell.html` 的 `#rpg-manual-modal`）：

1. ◆ 游戏理念 — 「打破规则」为核心爽点的棋类 RPG
2. ◆ 核心机制：能量条 — 起始 0，门槛 30，可透支，吃子加成
3. ◆ 核心机制：识破概率 — 隐藏数值，全局只增不减，封顶 95%
4. ◆ 作弊指令示例 — A/B/C/C+/D/E 类分类与示例
5. ◆ 三个结局 — Good / Bad / 真结局（隐藏）
6. ◆ 游戏流程 — 7 章节约 65 分钟
7. ◆ 操作要点 — 点击走棋 / 作弊流程 / Ctrl+Enter 快捷键

**入口**：
- 标题屏「游玩文档」按钮
- 顶栏「?」帮助按钮

### 7.4 U5：教程章节 ch01 扩展

**目标**：将 ch01 从 2 场景 19 节点扩展为 6 场景 46 节点的完整剧情化系统教学。

**扩展后的场景结构**：
1. 棋圣空间·初遇（10 节点）— 介绍五子棋
2. 教学·能量条（7 节点）— 能量条机制教学
3. 教学·棋圣系统（8 节点）— 作弊指令教学
4. 教学·识破概率（8 节点）— 识破概率 + 二选一选择
5. 抉择·实战之约（7 节点）— 操作提示
6. 开局（6 节点）— 进入实战

**教学关键词**（必须覆盖）：能量、门槛、棋圣系统、识破、作弊、评估消耗、执行作弊、Ctrl+Enter

### 7.5 U1：围棋子项目

**目标**：实现 9×9 简化围棋，补齐第 2 章 / 第 5 章对战。

**目录结构**（新建 `/workspace/go/`）：
```
go/
├── main.py              ← FastAPI 端口 8002
├── go_engine.py         ← 9×9 棋盘，落子/提子/禁着点/计分
├── go_ai.py             ← 启发式 AI
├── rule_engine.py       ← 简化版（无 jump/ray，但有 check_score）
├── ai_orchestrator.py   ← 复用象棋的（修改棋盘尺寸）
├── mechanism_engine.py  ← 复用象棋的
├── prompts.py           ← 围棋专用提示词
├── configs/             ← 围棋 JSON 配置
└── static/
    ├── index.html       ← 引入 rpg_adapter.js
    └── app.js
```

**简化规则**：
- 9×9 棋盘，黑白交替落子（黑先）
- 基础吃子：无气棋子被提
- 禁着点：自杀禁着
- **无劫争（ko）规则**（简化）
- 计分：终局数子法，黑方贴 3.75 子
- 终局：双方 pass 两次

**风险提示**：围棋是最大风险点，若时间紧迫可保持降级（纯 VN 跳过）。

---

## 8. 风险与决策

### 8.1 技术风险

| 风险 | 等级 | 应对 |
|---|---|---|
| AI 调用延迟影响对战体验 | 高 | 异步处理；UI 显示「棋圣系统思考中...」；30s 超时降级 |
| Token 成本控制 | 中 | 沿用 token_stats 监控；难度调节限制调用次数 |
| 围棋引擎实现复杂度 | 高 | 9×9 简化版；无劫争；启发式 AI；可降级为纯 VN |
| 像素资产生成失败 | 中 | 重试脚本；manifest 记录状态；CSS 渐变兜底 |
| iframe 通信复杂度 | 中 | 严格 postMessage 协议；rpg_adapter 统一处理 |

### 8.2 设计风险

| 风险 | 等级 | 应对 |
|---|---|---|
| 作弊玩法可能让游戏太简单 | 高 | 引入「识破」机制；BOSS 也会作弊；能量透支惩罚 |
| 多种棋类学习成本 | 中 | 每章引入一种新棋类；教程章节充分 |
| 剧情与玩法的平衡 | 中 | 章节制控制节奏；剧情可跳过 |
| AI 生成内容的质量参差 | 中 | 关键规则改动硬编码；剧情由人工撰写 |

### 8.3 关键决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 围棋可降级为纯 VN | go/ 目录不存在时 ch03/ch06 自动跳过，不阻塞主线 |
| D2 | 对手台词严格用预脚本模板 | 执行方案第 3.1 节明确要求稳定性，不用 AI 生成 |
| D3 | 章节剧情 JSON 复用 story-editor 格式 | preview.js 原生支持 |
| D4 | RPG 全局状态存内存 dict | 与现有棋类 GameState 模式一致 |
| D5 | cost_energy 由 AI 评估 | 扩展 INTENT_PARSER_SYSTEM prompt，AI 返回 0-10 |
| D6 | dry_run 仅跳过 apply_config_update | rpg_server.cheat_assess 依赖返回字段 |
| D7-revised | 标题屏通过直接修改 rpg_shell.js 源码实现 | 原 D7 monkey-patch 方案因 RpgShell 是 IIFE 闭包 const 而失效（内部 _goNextChapter 走闭包引用，不经过 RpgShell.loadChapter）。新方案：在 init() 与 loadChapter() 入口添加 __RPG_TITLE_ACTIVE 守卫，rpg_extras.js 只负责 UI 与标志生命周期 |
| D8 | 像素资产通过 CSS 自定义属性注入背景 | 避免直接修改 ::before 伪元素 |

---

## 9. 变更记录

| 日期 | 版本 | 位置 | 改动 |
|---|---|---|---|
| 2026-07-19 | v2.1 | 全文 | 继任开发者 GLM-5.2 完成阶段 A-F 全部任务：go/ 集成修复（端口 8002 + rpg_adapter + 3 个 RPG 路由）、U3 重构（D7-revised：直接改 rpg_shell.js 加守卫，移除 monkey-patch）、U6 章节背景图片化（ch00-ch06）、U7 ch03/ch06 完整剧情扩展、U8 E2E 测试脚本、1.1/1.2 节状态对齐磁盘、7.2 节 U3 更新、8.3 节 D7-revised |
| 2026-07-18 | v2.0 | 全文 | 基于真实代码核查重写：删除已废弃的 v1.0 内容（道具/经济/大地图/现实扭曲等）；新增真实状态清单（1.1/1.2）；重写后续开发路线图（第 6/7 章） |
| 2026-07-18 | v1.0 | 全文 | 初版创建 |

---

## 附录 A：快速启动指南

### 启动全部服务

```bash
# 终端 1：象棋服务
cd /workspace/xiangqi && python main.py  # 端口 8000

# 终端 2：五子棋服务
cd /workspace/wuziqi && python main.py   # 端口 8001

# 终端 3：RPG 主服务
cd /workspace/shared/rpg && python rpg_server.py  # 端口 80
```

### 访问

打开浏览器访问 `http://localhost/`，开始游戏。

### 配置 API Key

在 RPG 启动后，通过设置界面输入 DeepSeek API Key（用于棋圣系统作弊）。

---

## 附录 B：端口分配

| 服务 | 端口 | 用途 | 状态 |
|---|---|---|---|
| RPG 主服务 | 80 | RPG 外壳 + API 网关 | ✅ |
| 象棋服务 | 8000 | 象棋对战 | ✅ |
| 五子棋服务 | 8001 | 五子棋对战 | ✅ |
| 围棋服务 | 8002 | 围棋对战 | ❌ 未实现 |
| 剧情编辑器 | 8003 | 剧情 JSON 编辑（开发用） | ✅ |

---

## 附录 C：与历史文档的关系

| 文档 | 角色 | 状态 |
|---|---|---|
| **本文档（v2.0）** | 后续开发活路线图 | ✅ 当前权威 |
| [README.md](./README.md) | 架构总览 + 快速开始 | ✅ 当前权威 |
| [执行方案.md](./执行方案.md) | 历史执行蓝图（技术细节参考） | 📦 归档 |
| [.trae/documents/棋圣RPG_Demo_实现计划.md](./.trae/documents/棋圣RPG_Demo_实现计划.md) | 历史实施记录 | 📦 归档 |
| [.trae/documents/棋圣RPG_Demo_收尾实施计划.md](./.trae/documents/棋圣RPG_Demo_收尾实施计划.md) | 历史收尾记录 | 📦 归档 |
| [.trae/documents/棋圣RPG_Demo_P2端到端测试计划.md](./.trae/documents/棋圣RPG_Demo_P2端到端测试计划.md) | 历史测试记录 | 📦 归档 |
| [无限制象棋_完整计划书_v4.0.md](./无限制象棋_完整计划书_v4.0.md) | v4 历史计划书（象棋技术细节） | 📦 归档 |

---

*本计划书版本 v2.0。后续随开发进展迭代更新，请在「变更记录」表中记录每次改动。*
