# 棋圣 (ChessSage) - 项目计划书：RPG 大游戏

> **本文档是后续开发的活路线图**：基于当前真实代码状态，给出清晰的待办清单、优先级与技术约束。

**版本**：v3.0（Web Components 架构）
**日期**：2026-07-20
**前置阅读**：[README.md](./README.md)

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

> 以下清单基于 2026-07-20 的代码核查，**与实际磁盘状态一致**。

### 1.1 ✅ 已完成且可用

#### RPG 外壳层（`shared/rpg/`）

| 文件 | 行数 | 说明 |
|---|---|---|
| [rpg_server.py](file:///workspace/shared/rpg/rpg_server.py) | 688 | FastAPI 端口 8080，12 条路由，RpgState 状态管理，识破公式，结局判定 |
| [rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js) | ~500 | 章节管理 / Web Components 动态加载 / 状态同步 / 标题屏守卫 |
| [rpg_shell.html](file:///workspace/shared/rpg/rpg_shell.html) | 281 | 顶栏 + 主区 + VN 舞台 + 章节抽屉 + 设置模态框 + 标题屏 + 加载遮罩 + 文档模态框 |
| [rpg_style.css](file:///workspace/shared/rpg/rpg_style.css) | 426 | 像素风样式（顶栏/能量条/按钮/模态框/Toast/响应式） |
| [rpg_extras.js](file:///workspace/shared/rpg/rpg_extras.js) | 336 | 标题屏 / 加载遮罩 / 游玩文档 / 教程入口 / 章节背景切换 / 设置状态显示 |
| [cheat_panel.js](file:///workspace/shared/rpg/cheat_panel.js) | 184 | 评估消耗 → 确认执行 → 对手台词触发 |
| [story_layer.js](file:///workspace/shared/rpg/story_layer.js) | 311 | 封装 Preview.playStory，章节剧情/对手台词/系统消息 |
| [dialogue_templates.json](file:///workspace/shared/rpg/dialogue_templates.json) | — | 6 类 × 4 条 = 24 条对手「认知扭曲」台词 |
| [vn_player/preview.js](file:///workspace/shared/rpg/vn_player/preview.js) | 566 | VN 引擎，11 种节点类型 |
| [vn_player/variable_manager.js](file:///workspace/shared/rpg/vn_player/variable_manager.js) | 55 | 最小变量管理实现 |
| [vn_player/vn_style.css](file:///workspace/shared/rpg/vn_player/vn_style.css) | 132 | VN 舞台样式 |

#### RPG 后端路由（12 条）

```
GET  /                                → RPG 外壳页面
GET  /api/rpg/chapters                → 7 个章节列表
GET  /api/rpg/chapter/{chapter_id}    → 章节元信息（chess_type + story_id + service_up）
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

#### 棋类子项目（Web Components 架构）

| 子项目 | 端口 | 自定义元素 | 模块路径 | 状态 |
|---|---|---|---|---|
| [xiangqi/](file:///workspace/xiangqi/) | 8000 | `<xiangqi-board>` | `/xiangqi/static/app.js` | ✅ 完整可用 |
| [wuziqi/](file:///workspace/wuziqi/) | 8001 | `<wuziqi-board>` | `/wuziqi/static/app.js` | ✅ 完整可用 |
| [go/](file:///workspace/go/) | 8002 | `<go-board>` | `/go/static/app.js` | ✅ 完整可用（9×9 简化围棋） |

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
| U1 | ~~围棋子项目 `go/`~~ | ✅ **已完成**：端口 8002，9×9 简化围棋 + 启发式 AI + Web Component |
| U2 | ~~像素画资产~~ | ✅ **已完成**：15 个 PNG 全部生成（8 bgs + 5 icons + 2 ui） |
| U3 | ~~标题屏 + 加载遮罩~~ | ✅ **已完成**：rpg_extras.js 336 行 |
| U4 | ~~游玩文档模态框~~ | ✅ **已完成**：7 段内置文档 + 顶栏 ? 按钮 + Esc 关闭 |

#### 中优先级（影响完整度）

| # | 待办 | 说明 |
|---|---|---|
| U5 | ~~教程章节扩展~~ | ✅ **已完成**：ch01 扩展为 6 场景 46 节点剧情化系统教学 |
| U6 | ~~章节背景图片化~~ | ✅ **已完成**：ch00-ch06 主背景 solid → image，引用像素画 PNG |
| U7 | **ch02-ch06 完整剧情** | 🟡 **部分完成**：ch03（4场景33节点）/ ch06（3场景24节点）已完成；ch02/ch04/ch05 仍为骨架 |
| U8 | ~~端到端测试脚本~~ | ✅ **已完成**：e2e_test.py |

#### 低优先级（锦上添花）

| # | 待办 | 说明 |
|---|---|---|
| U9 | 存档系统 | JSON 文件存档（多槽位），当前仅内存状态 |
| U10 | BGM / 音效 | 章节主题曲 + 作弊/识破音效 |
| U11 | 设置菜单扩展 | 难度切换、音量控制 |
| U12 | 章节切换动画 | VN 过渡效果增强 |

### 1.3 已知技术约束（核查确认）

1. **preview.js 的两个补丁已应用**：`preview-stage`→`vn-stage` id；内联最小 VariableManager
2. **Web Components 架构已完成**：三个棋类均已封装为自定义元素，使用 Shadow DOM 和 ES Modules
3. **CORS 已开启**：`allow_origins=["*"]`
4. **API Key 自动读取**：`xiangqi/api密钥.txt` 存在时 rpg_server 启动自动加载
5. **端口调整**：RPG 主服务端口从 80 改为 8080（避免系统占用）

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

### 3.3 主线剧情大纲

#### 序章·觉醒（ch00，已完成）
- 场景：少年房间，深夜
- 剧情：少年研究残局困倦入睡 → 梦境中棋圣系统现身 → 选择接受/拒绝 → 醒来耳边回响低语
- 4 场景 25 节点，纯 VN

#### 第 0 章·教程（ch01，已完成）
- 场景：棋圣空间（数据虚空）
- 剧情：棋圣系统讲解能量条/作弊指令/识破概率 → 进入五子棋实战
- 6 场景 46 节点完整教学

#### 第 1 章·入门（ch02，骨架）
- 场景：街亭
- 剧情：少年来到街亭，遇街亭棋客摆擂 → 象棋首战
- 待扩展为完整战前 + 战后分支

#### 第 2 章·进阶（ch03，已完成）
- 场景：云子山
- 剧情：vs 云子老人（围棋 9×9）
- 4 场景 33 节点，完整对战

#### 第 3 章·BOSS战（ch04，骨架）
- 场景：夜枭塔
- 剧情：vs 夜枭（五子棋，规则变体）
- 待扩展

#### 第 4 章·终极对决（ch05，骨架）
- 场景：棋圣殿
- 剧情：vs 棋圣真身（象棋，BOSS 也会作弊）
- 待扩展

#### 第 5 章·终局（ch06，已完成）
- 场景：执念之渊
- 剧情：vs 执念化身（围棋）+ 结局判定
- 3 场景 24 节点，完整结局

### 3.4 多结局设计

| 结局 | 触发条件 | 描述 |
|---|---|---|
| Good Ending | `was_detected == False` 且 `cheats_used > 0` | 完美棋圣 |
| Bad Ending | `was_detected == True` | 胜利后对手们联合揭发，主角被驱逐 |
| 真结局（隐藏） | `cheats_used == 0` | 全程不使用任何作弊，展现真正的棋艺 |

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

---

## 5. 技术架构

### 5.1 Web Components + ES Modules 架构

```
┌──────────────────────────────────────────────────────────┐
│              浏览器 / RPG 外壳 (localhost:8080)            │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │  RpgShell (rpg_shell.js)                          │    │
│  │                                                  │    │
│  │  • 章节管理 / 能量/识破 / VN 故事层                │    │
│  │  • CheatPanel (作弊面板)                          │    │
│  │                                                  │    │
│  │  ┌──────────────────────────────────────────┐    │    │
│  │  │  Shadow DOM: <xiangqi-board>             │    │    │
│  │  │  (Web Component, ES Module 动态导入)       │    │    │
│  │  │  • 棋盘渲染 / 棋子交互 / AI 走棋           │    │    │
│  │  │  • 公开方法：applyCheatPatch() 等         │    │    │
│  │  │  • 自定义事件：move / gameend             │    │    │
│  │  └──────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP fetch（跨域 CORS 已开启）
┌──────────────────────▼───────────────────────────────────┐
│                后端服务群（FastAPI）                       │
│                                                           │
│  rpg_server:8080  →  代理转发  →  xiangqi:8000 / wuziqi:8001│
│  go:8002                                                  │
└──────────────────────────────────────────────────────────┘
```

### 5.2 棋类 Web Component 设计规范

#### 自定义元素命名

| 棋类 | 元素名 | 模块路径 |
|---|---|---|
| 中国象棋 | `<xiangqi-board>` | `/xiangqi/static/app.js` |
| 五子棋 | `<wuziqi-board>` | `/wuziqi/static/app.js` |
| 围棋 | `<go-board>` | `/go/static/app.js` |

#### 公开属性 (Attributes)

| 属性名 | 类型 | 说明 |
|---|---|---|
| `api-base` | string | API 基础路径（如 `http://localhost:8000`） |
| `player-side` | string | 玩家方：`red` / `black` |
| `rpg-mode` | boolean | RPG 模式，隐藏原生侧栏和输入区 |

#### 公开方法 (Methods)

| 方法名 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `init()` | 无 | `Promise<void>` | 初始化组件（加载配置、渲染棋盘） |
| `applyCheatPatch(modifiedConfigs)` | `{[name: string]: object}` | `Promise<void>` | 应用作弊补丁，重新加载配置并重渲染 |
| `getBoardSnapshot()` | 无 | `{ boardState, configs }` | 获取当前棋盘完整状态快照 |
| `resetBoard()` | 无 | `Promise<void>` | 重置棋盘到初始状态 |
| `destroy()` | 无 | `void` | 清理资源（移除事件监听、清除定时器、断开引用） |

#### 自定义事件 (Custom Events)

| 事件名 | `detail` 字段 | 触发时机 |
|---|---|---|
| `move` | `{ captured, mover, is_check, game_ended, winner, is_five_in_a_row, go_captures }` | 每次走棋完成 |
| `gameend` | `{ winner, win_condition }` | 游戏结束时 |
| `ready` | `{}` | 组件初始化完成 |
| `error` | `{ message }` | 发生错误时 |

### 5.3 组件挂载流程

1. 调用 `loadChapter()` 加载章节元信息
2. 章节 VN 播放结束后，调用 `_startBattle(chapter)`
3. `_startBattle` 中：
   - 调用 `POST /api/rpg/battle/start`（后端重置棋类配置）
   - 动态 import 对应棋类模块（`loadChessComponent()`）
   - 创建自定义元素实例，设置属性
   - 挂载到 `#rpg-battle-container`
   - 监听组件的 `move` 和 `gameend` 事件
   - 调用组件的 `init()` 方法

### 5.4 技术栈

| 层 | 技术 | 理由 |
|---|---|---|
| RPG 前端 | 原生 HTML/CSS/JS + ES Modules | 与项目「AI 灵活编码」理念一致，避免构建工具链 |
| RPG 后端 | Python FastAPI | 沿用现有棋类后端，新增 RPG 路由 |
| 棋类对战 | Web Components（Shadow DOM） | 样式隔离，直接方法调用，性能优于 iframe |
| VN 演出 | shared/rpg/vn_player/preview.js | 11 种节点类型，从 story-editor 复制并打补丁 |
| AI 层 | DeepSeek API | 棋圣系统作弊直接调用现有 ai_orchestrator |
| 存储 | JSON 文件 + 内存状态 | 简单可靠，与现有架构一致 |

---

## 6. 后续开发路线图

### 阶段 v4：Web Components 架构（已完成）

**目标**：从 iframe + postMessage 架构重构为 Web Components + ES Modules。

| 任务 | 状态 |
|---|---|
| 象棋 Web Component | ✅ |
| 五子棋 Web Component | ✅ |
| 围棋 Web Component | ✅ |
| RPG 外壳组件加载逻辑 | ✅ |
| 作弊面板方法调用 | ✅ |
| 统一启动器 | ✅ |

### 阶段 v4.1：内容补全

**目标**：补齐所有章节完整剧情 + 端到端测试。

| 任务 | 优先级 | 说明 |
|---|---|---|
| U7 ch02 完整剧情（战前 + 战后分支） | 中 | 象棋首战 vs 街亭棋客 |
| U7 ch04 完整剧情（BOSS 战 + 规则变体） | 中 | 五子棋 vs 夜枭 |
| U7 ch05 完整剧情（终极对决 + BOSS 作弊） | 中 | 象棋 vs 棋圣真身 |

### 阶段 v5：长远扩展

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

### 7.1 U7：ch02/ch04/ch05 完整剧情

**目标**：将三个章节骨架扩展为完整 VN 内容。

#### ch02_city_xiangqi（第 1 章·入门）

| 场景 | 节点数 | 内容 |
|---|---|---|
| 战前·街亭相遇 | 8 | 少年来到街亭，棋客摆擂，对话交锋 |
| 对战·象棋首战 | — | 棋盘对战（通过 Web Component） |
| 战后·初胜 | 7 | 胜利后棋客认知扭曲台词，能量结算 |

#### ch04_boss_wuziqi（第 3 章·BOSS战）

| 场景 | 节点数 | 内容 |
|---|---|---|
| 战前·夜枭塔 | 10 | 进入夜枭塔，BOSS 登场，规则变体说明（六连赢） |
| 对战·BOSS战 | — | 五子棋对战（规则变体） |
| 战后·破塔 | 8 | 胜利后夜枭认知扭曲，解锁新机制 |

#### ch05_final_xiangqi（第 4 章·终极对决）

| 场景 | 节点数 | 内容 |
|---|---|---|
| 战前·棋圣殿 | 12 | 到达棋圣殿，棋圣真身现身，BOSS 作弊规则说明 |
| 对战·终极对决 | — | 象棋对战（BOSS 也会作弊） |
| 战后·抉择 | 10 | 胜利后识破判定，走向终章 |

---

## 8. 风险与决策

### 8.1 技术风险

| 风险 | 等级 | 应对 |
|---|---|---|
| AI 调用延迟影响对战体验 | 高 | 异步处理；UI 显示「棋圣系统思考中...」；30s 超时降级 |
| Token 成本控制 | 中 | 沿用 token_stats 监控；难度调节限制调用次数 |
| Web Components 兼容性 | 低 | 目标浏览器为现代 Chrome/Edge，Shadow DOM 支持完善 |
| 组件内存泄漏 | 中 | 实现完整的 `destroy()` 方法，`disconnectedCallback` 中调用 |

### 8.2 设计风险

| 风险 | 等级 | 应对 |
|---|---|---|
| 作弊玩法可能让游戏太简单 | 高 | 引入「识破」机制；BOSS 也会作弊；能量透支惩罚 |
| 多种棋类学习成本 | 中 | 每章引入一种新棋类；教程章节充分 |
| 剧情与玩法的平衡 | 中 | 章节制控制节奏；剧情可跳过 |

### 8.3 关键决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 围棋可降级为纯 VN | go/ 目录不存在时 ch03/ch06 自动跳过，不阻塞主线 |
| D2 | 对手台词严格用预脚本模板 | 执行方案第 3.1 节明确要求稳定性，不用 AI 生成 |
| D3 | 章节剧情 JSON 复用 story-editor 格式 | preview.js 原生支持 |
| D4 | RPG 全局状态存内存 dict | 与现有棋类 GameState 模式一致 |
| D5 | cost_energy 由 AI 评估 | 扩展 INTENT_PARSER_SYSTEM prompt，AI 返回 0-10 |
| D6 | dry_run 仅跳过 apply_config_update | rpg_server.cheat_assess 依赖返回字段 |
| D7-revised | 标题屏通过直接修改 rpg_shell.js 源码实现 | 原 D7 monkey-patch 方案因 RpgShell 是 IIFE 闭包 const 而失效 |
| D8 | 像素资产通过 CSS 自定义属性注入背景 | 避免直接修改 ::before 伪元素 |
| D9 | 架构从 iframe 迁移到 Web Components | 通信链路短、性能好、样式隔离彻底 |

---

## 9. 变更记录

| 日期 | 版本 | 位置 | 改动 |
|---|---|---|---|
| 2026-07-20 | v3.0 | 全文 | 架构升级为 Web Components + ES Modules：更新技术架构章节（5.1-5.4）、端口调整（80→8080）、棋类子项目状态更新、新增统一启动器说明 |
| 2026-07-19 | v2.1 | 全文 | 继任开发者 GLM-5.2 完成阶段 A-F 全部任务 |
| 2026-07-18 | v2.0 | 全文 | 基于真实代码核查重写，删除已废弃的 v1.0 内容 |

---

## 附录 A：快速启动指南

### 启动全部服务

**方式一：统一启动器（推荐）**

```bash
cd /workspace
python main.py
```

**方式二：手动启动**

```bash
cd /workspace/xiangqi && python main.py   # 端口 8000
cd /workspace/wuziqi && python main.py    # 端口 8001
cd /workspace/shared/rpg && python rpg_server.py  # 端口 8080
```

### 访问

打开浏览器访问 `http://localhost:8080/`，开始游戏。

---

## 附录 B：端口分配

| 服务 | 端口 | 用途 | 状态 |
|---|---|---|---|
| RPG 主服务 | 8080 | RPG 外壳 + API 网关 | ✅ |
| 象棋服务 | 8000 | 象棋对战 | ✅ |
| 五子棋服务 | 8001 | 五子棋对战 | ✅ |
| 围棋服务 | 8002 | 围棋对战 | ✅ |
| 剧情编辑器 | 8003 | 剧情 JSON 编辑（开发用） | ✅ |

---

## 附录 C：与历史文档的关系

| 文档 | 角色 | 状态 |
|---|---|---|
| **本文档（v3.0）** | 后续开发活路线图 | ✅ 当前权威 |
| [README.md](./README.md) | 架构总览 + 快速开始 | ✅ 当前权威 |
| [执行方案.md](./执行方案.md) | 历史执行蓝图（技术细节参考） | 📦 归档 |
| [.trae/documents/webcomponents_refactor_plan.md](./.trae/documents/webcomponents_refactor_plan.md) | Web Components 重构计划 | 📦 归档 |

---

*本计划书版本 v3.0。后续随开发进展迭代更新，请在「变更记录」表中记录每次改动。*