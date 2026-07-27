# 棋圣 · 六道轮回（ChessSage · SAMSARA）

> **六重棋境，一念改规。业力为媒，规则为网，在轮回中修行，在棋局中悟道。**

以六种棋类为战斗场景、"AI 作弊改规"为核心玩法的 Roguelike 大游戏。玩家以自然语言驱动 AI 实时改写棋盘、棋子、规则、UI 与机制，在六道关卡中一路轮回，直到天道识破或悟道超脱。

---

## 一、核心玩法

玩家是一缕在六道中轮回的灵魂，从地狱道逐级向上轮转至天道，每道由 5-6 个预制关卡组成，最后一关为守道者 Boss。玩家通过正常下棋推进局势，必要时用自然语言向 AI 发出"作弊指令"以修改棋盘、规则或棋子，从而打开局面。

### 核心循环

```
下好棋消业 → 积累业力空间 → 花业力作弊 → 改写局势取胜 → 通关获技能点 → 下一关
                ↑                                            │
                └──────────── 胜/负都把业力溢出叠加给下一关 ────┘
```

### 一局流程

1. **关卡开始**：业力 = `max(0, 初始值 50 - 净身减免) + 本道溢出叠加`
2. **下棋消业**：吃子 / 将军 / 三连 / 翻转 / 跳子等事件减少业力
3. **作弊增业**：AI 评估作弊指令，在 1-120 区间产生业障增量
   - 评估值 ≤ 120：增加业力，可继续执行
   - 评估值 > 120：直接拦截，不予执行，业力不变
4. **溢出识破**：业力 > 安全阈值（120）的部分非线性增加本道识破概率
5. **关卡结束**：胜负都记录溢出量 = `max(0, 当前业力 - 安全阈值)`，叠加给本道下一关

---

## 二、业力系统（业障模型）

业力是**单局变量**，仅在关卡内独立生效，主页不显示。

| 参数 | 默认值 | 说明 |
|:----|:------:|:----|
| `initial_karma` | 50 | 关卡起始业力（受"净身"技能减免） |
| `karma_max` | 120 | 安全阈值；超出后识破概率非线性增长 |
| `karma_single_max` | 120 | 单次作弊业力增量上限；超出则拦截 |

### 增业（作弊）

- AI 评估作弊强度，输出 1-120 之间的整数
- E 类（闲聊 / 搞笑）固定 1 点
- D 类 5-15 / A 类 20-40 / B 类 15-35 / C 类 30-60 / C+ 类 50-100
- 强度倍数：改 1 项 ×1.0，改 2 项 ×2.0，改 3+ 项 ×3.0
- 评估值 > 单次上限：直接拦截，业力不变（等效未发生）

### 消业（下棋事件）

各棋类特定事件触发，每个事件减少对应业力：

| 棋类 | 事件类型 | 数值（点） |
|:----|:--------|:----------|
| **象棋** | capture_pawn / capture_medium / capture_rook | 8 / 15 / 25 |
|        | check / checkmate / pawn_cross / captured | 20 / 35 / 10 / 5 |
| **围棋** | capture_small / capture_large / life | 10 / 20 / 15 |
|        | captured / corner / endgame | 5 / 12 / 8 |
| **五子棋** | three / four / block_three / block_four | 10 / 20 / 8 / 18 |
|          | double_three / win | 15 / 35 |
| **动物棋** | capture_normal / capture_overrank / captured | 10 / 25 / 5 |
|          | approach / win | 12 / 35 |
| **跳棋** | jump_3 / jump_5 / home | 10 / 20 / 15 |
|        | single_move / all_home | 3 / 35 |
| **黑白棋** | flip_small / flip_medium / flip_large | 8 / 15 / 25 |
|          | corner / flipped / win | 20 / 5 / 35 |

消业数值受技能修饰符 `karma_recover_multiplier`（"业力潮汐" +30%）影响。

### 溢出叠加（章节=道）

- **章节定义**：六道轮回中的一个"道"为一个章节
- **关卡开始**：`level_karma = max(0, 初始值 - 净身减免) + 本道溢出叠加`
- **关卡结束**（胜负都执行）：`溢出叠加 = max(0, 关卡结束业力 - 安全阈值)`
- **换道**：溢出叠加清零，新章节重新从初始值开始
- **被识破**：溢出叠加清零，业力重置为初始值

### 退还机制

- 闲聊（E 类）增加 1 点业力，若 ChatAI 拒绝则全额退还
- 作弊修改失败（type=rejected/error）全额退还，业力不增加
- 单次上限拦截（karma_blocked）业力不变，等效未发生

---

## 三、识破概率系统

### 公式

```
Δ = C × O^α
```

- `O` = 业力超出安全阈值的部分（overshoot）
- `C = 0.1`（默认惩罚系数，可被"藏锋"技能降至 0.07）
- `α = 1.5`（默认非线性指数，可被"缓冲"技能降至 1.3）

### 校准

| 溢出量 O | Δ（默认 C=0.1, α=1.5） |
|:--------:|:----------------------:|
| 10 | 3.16% |
| 30 | 16.4% |
| 50 | 35.4% |
| 80 | 71.6% |
| 100 | **100%** |
| 150 | 183.7%（封顶 100%） |

**超出 100 点 = 识破概率增长 100%**。轻微透支可控，巨额透支几乎必死。

### 触发判定

每次业力溢出后，系统随机 roll（0-100），若 roll < 当前识破概率则被识破：
- **被识破**：所有非永久进度重置，但保留技能树、技能点、Boss 击败记录、已通关道、成就
- **金蝉脱壳**：识破后识破概率回退到触发前的 50%，免死一次

---

## 四、技能树（4 分支 × 3 层）

技能点通过通关获得（基础 +1，无作弊通关 +2，未透支 +1，首杀 Boss +1）。所有技能效果通过 `get_skill_modifiers()` 注入业力 / 识破 / 作弊各系统。

### 业力掌控 💫

| 层 | 技能 | 效果 |
|:--:|:-----|:-----|
| T1 | 安全阈值+20 | `karma_max_bonus += 20` |
| T2a | 单次上限+30 | `karma_single_max_bonus += 30` |
| T2b | 业力潮汐 | `karma_recover_multiplier = 1.3` |
| T3a | 缓冲 | `detection_alpha = 1.3`（非线性指数下降） |
| T3b | 净身 | `initial_karma_reduction = 25`（初始业力从 50 降至 25） |

### 隐匿之术 👻

| 层 | 技能 | 效果 |
|:--:|:-----|:-----|
| T1 | 藏锋 | `detection_coefficient = 0.07` |
| T2a | 首次透支免判 | `first_overdraft_skip = True`（每局一次） |
| T2b | 连续规避 | `consecutive_avoid = True`（连续 3 回合不作弊后透支惩罚减半） |
| T3a | 金蝉脱壳 | `golden_escape = True`（被识破后 1 次复活） |
| T3b | 迷雾 | `mist_fog = True`（识破概率 > 70% 时 30% 概率 Δ=0） |

### 作弊精通 🎲

| 层 | 技能 | 效果 |
|:--:|:-----|:-----|
| T1a | 自定义棋子 | 允许 C+ 类作弊 |
| T1b | 前端修改 | 允许 D 类作弊 |
| T2a | 效率欺诈 | `efficiency_fraud = True`（30% 概率降 30%） |
| T2b | 高级规则 | 允许修改胜利条件 / 核心规则 |
| T3a | 白嫖 | 每局 1 次不消耗业力 |
| T3b | 深层作弊 | `karma_single_max_bonus += 40` |

### 六道悟道 🔮

| 层 | 技能 | 效果 |
|:--:|:-----|:-----|
| T1a | 地狱之眼 | 地狱道 / 饿鬼道作弊业力消耗 -25% |
| T1b | 天道之耳 | 天道 / 阿修罗道透支惩罚 -25% |
| T2a | 守道者之隙 | Boss 技能触发概率 -30% |
| T2b | 轮回记忆 | 每次轮回开局自带 1 个随机临时 buff |
| T3a | 超脱之种 | 清业通关后全局透支惩罚系数 -0.05 |
| T3b | 六道轮转 | 升降道时额外 1 次免费作弊机会 |

> T1 默认解锁 `karma_capacity_t1` 和 `stealth_t1`，其余需技能点解锁。

---

## 五、六道关卡

| 道 | 棋类 | 主题 | 关卡数 | 守道者 | Boss 技能 |
|:--:|:----:|:----|:------:|:------|:----------|
| ☯ 地狱道 | 黑白棋 | 痛苦·翻转 | 5 | 翻覆者 | 修改规则 30% 概率被翻转效果 |
| 👹 饿鬼道 | 跳棋 | 贪婪·无尽之路 | 5 | 饕餮者 | 每作弊 2 次额外偷改 1 次 |
| 🐅 畜生道 | 动物棋 | 愚痴·等级秩序 | 5 | 秩序者 | 高等级棋子修改业力 +20 |
| 🧠 人道 | 象棋 | 算计·平衡 | 6 | 算计者 | 无（最公平的对决） |
| ⚔️ 阿修罗道 | 围棋 | 战斗·混沌 | 6 | 狂乱者 | 作弊后 25% 概率随机规则变化 |
| ☸️ 天道 | 五子棋 | 禅定·五连登仙 | 6 | 禅定者 | 每局 3 次清除最近 1 条修改 |

### 关卡类型

- `standard`：标准对局，回合限制 20（围棋 40）
- `puzzle`：预制残局，特定目标（吃子数 / 撤离 / 覆盖率等）
- `boss`：守道者战，附加 Boss 反作弊技能

### 胜利条件类型

11 种目标：`checkmate`（将死）/ `capture_count`（吃子数）/ `turn_limit`（竞速）/ `evacuation`（撤离）/ `board_coverage`（覆盖率）/ `color_coverage`（颜色覆盖率）/ `formation`（阵型）/ `survival`（生存）/ `assassination`（刺杀）/ `escort`（护送）/ `compound`（复合条件）。

### 升降道

- 通过一关：进入本道下一关
- 通关整道：解锁该道沙盒，升入下一道
- 无透支通关：跳级 +2（如地狱道 → 畜生道）
- 普通通关：升 1 级（如地狱道 → 饿鬼道）

---

## 六、架构

### 整体架构

```
                    ┌──────────────────┐
                    │  轮回之门（Hub）  │
                    │  hub/index.html  │   端口 8080
                    │  + samsara 引擎   │
                    └────────┬─────────┘
                             │ FastAPI
         ┌───────────────────┼───────────────────┐
         │                   │                   │
  ┌──────▼──────┐     ┌──────▼──────┐    ┌──────▼──────┐
  │ 人道·象棋    │     │ 天道·五子棋  │    │ 阿修罗·围棋  │
  │ xiangqi/    │     │  wuziqi/     │    │   weiqi/    │
  │ 端口 8000   │     │ 端口 8001    │    │ 端口 8002   │
  └─────────────┘     └──────────────┘    └─────────────┘
         │                   │                   │
  ┌──────▼──────┐     ┌──────▼──────┐    ┌──────▼──────┐
  │ 畜生·动物棋  │     │ 饿鬼·跳棋    │    │ 地狱·黑白棋  │
  │ dongwuqi/   │     │  tiaoqi/     │    │  heibaiqi/   │
  │ 端口 8003   │     │ 端口 8004    │    │ 端口 8005   │
  └─────────────┘     └──────────────┘    └─────────────┘
```

### 每棋类统一骨架

```
{棋类}/
├── main.py                  # FastAPI 路由（走棋 / 指令 / 配置 / 业力事件）
├── ai_orchestrator.py       # 两级 AI 编排器（意图解析 + 代码生成 + 业力拦截）
├── karma_assessor.py        # 本地业力评估 AI（与 ChatAI 并行调用）
├── chess_ai.py              # AI 走棋（Minimax + Alpha-Beta）
├── rule_engine.py           # 规则引擎（jump/ray 原语解析）
├── mechanism_engine.py      # 机制引擎（A2 类运行时机制）
├── prompts.py               # System Prompts
├── ai_config.py             # API Key 配置
├── configs/                 # 6 个 JSON 配置（全部可 AI 实时修改）
│   ├── board_state.json     # 棋盘运行时状态
│   ├── board.json           # 棋盘静态结构
│   ├── pieces_red.json      # 红方棋子定义
│   ├── pieces_black.json    # 黑方棋子定义
│   ├── rules.json           # 规则与机制
│   └── ui_config.json       # 前端 UI 配置
└── static/                  # 前端（Web Components + Shadow DOM）
```

### 灵活编码（Flexible Coding）核心

- **两级 AI 流水线**：意图解析器 → 代码生成器 → JSON Patch → Schema 校验 → 应用配置
- **规则原语**：`jump`（离散跳跃）+ `ray`（射线滑行）+ `where` 条件表达式
- **地形棋子原语**：`category: "terrain"` 支持陷阱等动态场地效果
- **机制原语**：`skip_turns` / `ai_control` / `random_moves` / `extra_turns` 等运行时机制
- **修改协议**：RFC 6902 JSON Patch + JSON Schema 校验
- **意图分类**：E（聊天）/ D（前端）/ A（机制）/ B（棋盘）/ C（规则）/ C+（新棋子）/ F（失败）

---

## 七、快速开始

### 环境要求

- Python 3.10+
- DeepSeek API Key（或兼容 OpenAI 格式的模型服务）

### 安装

```bash
cd /workspace
pip install -r requirements.txt
```

### 配置 API Key

在项目根目录创建 `config.json`：

```json
{
  "deepseek_api_key": "sk-xxxxxxxxxxxxxxxx",
  "deepseek_base_url": "https://api.deepseek.com/v1",
  "model": "deepseek-chat"
}
```

### 启动

```bash
python main.py
```

启动后访问：

| 入口 | URL |
|:-----|:---|
| 轮回之门（Hub） | http://localhost:8080/ |
| 人道·象棋 | http://localhost:8000/ |
| 天道·五子棋 | http://localhost:8001/ |
| 阿修罗·围棋 | http://localhost:8002/ |
| 畜生·动物棋 | http://localhost:8003/ |
| 饿鬼·跳棋 | http://localhost:8004/ |
| 地狱·黑白棋 | http://localhost:8005/ |

可选参数：`--no-browser` 不自动打开浏览器，`HUB_PORT=8080` 自定义 Hub 端口。

---

## 八、项目结构

```
workspace/
├── main.py                      # 统一启动器 + Hub 后端
├── config.json                  # API 密钥配置
├── requirements.txt
│
├── hub/                         # 六道众生总坛（轮回之门）
│   ├── index.html               # 首页（六道转轮 + 关卡选择 + 技能树）
│   ├── achievements.html        # 成就殿堂
│   ├── app.js                   # 前端逻辑（不显示业力，仅显示识破/境界/技能点）
│   └── style.css
│
├── shared/                      # 共享模块
│   ├── json_patch_utils.py      # RFC 6902 JSON Patch
│   ├── schema_validator.py      # JSON Schema 校验
│   └── achievement_checker.js   # 成就检测
│
├── samsara/                     # 六道轮回核心引擎
│   ├── api.py                   # FastAPI 路由（业力/识破/技能/关卡/进度）
│   ├── state.py                 # 轮回元状态管理（含 carryover 机制）
│   ├── karma.py                 # 业力系统（业障模型）
│   ├── karma_assessor.py        # samsara 端 AI 业力评估
│   ├── detection.py             # 识破概率系统（C×O^α 公式）
│   ├── bosses.py                # Boss 技能系统
│   ├── skills.py                # 技能树系统
│   ├── progression.py           # 升降道与技能点获取
│   ├── levels.py                # 关卡管理
│   ├── objectives.py            # 11 种目标判定
│   └── turn_limit.py            # 回合限制系统
│
├── configs/                     # 全局配置
│   ├── samsara_state.json       # 轮回存档（含 realm_overshoot_carryover）
│   ├── boss_definitions.json    # Boss 定义
│   ├── skill_tree.json          # 技能树
│   ├── karma_events.json        # 业力事件映射（各棋类消业数值）
│   ├── level_pools.json         # 六道预制关卡
│   ├── objective_types.json     # 胜利条件 Schema
│   ├── formations.json          # 阵型定义库
│   └── puzzles.json             # 预制残局数据库
│
├── xiangqi/                     # 人道·象棋（端口 8000）
├── wuziqi/                      # 天道·五子棋（端口 8001）
├── weiqi/                       # 阿修罗·围棋（端口 8002）
├── dongwuqi/                    # 畜生·动物棋（端口 8003）
├── tiaoqi/                      # 饿鬼·跳棋（端口 8004）
└── heibaiqi/                    # 地狱·黑白棋（端口 8005）
```

---

## 九、API

### Samsara API（挂载于 Hub `/samsara/*`）

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| GET | `/api/state` | 获取当前轮回状态（含 karma/detection/skill_modifiers/allowed_classifications） |
| GET | `/api/karma` | 获取业力状态（current/max/single_max/initial） |
| POST | `/api/karma/consume` | 作弊增加业力（业障模型，返回 overshoot 信息） |
| POST | `/api/karma/event` | 下棋消业事件（game_type + event_type → 自动减少业力） |
| POST | `/api/karma/refund` | 退还业力（作弊失败时全额退还） |
| POST | `/api/karma/assess` | 评估作弊业力消耗 |
| POST | `/api/karma/recover` | 旧版消业接口（兼容） |
| GET | `/api/detection` | 获取识破概率 |
| GET | `/api/skills` | 获取技能树 / 可用技能 / modifiers |
| POST | `/api/skills/unlock` | 解锁技能（消耗技能点） |
| GET | `/api/levels` | 获取当前道关卡列表与进度 |
| POST | `/api/levels/start` | 开始关卡（reset_level_state，使用 carryover） |
| POST | `/api/levels/advance` | 推进到下一关 |
| POST | `/api/levels/sandbox` | 进入沙盒模式 |
| GET | `/api/levels/realm/{realm}` | 获取指定道关卡列表 |
| GET | `/api/objectives` | 获取当前关卡目标 |
| POST | `/api/objectives/check` | 检查目标完成情况 |
| POST | `/api/turn/tick` | 推进回合 |
| GET | `/api/turn/status` | 获取回合状态 |
| GET | `/api/boss` | 获取当前道 Boss |
| POST | `/api/boss/trigger` | 触发 Boss 技能 |
| POST | `/api/progression/resolve` | 结算关卡（won/no_cheat/boss_defeated → rewards） |
| POST | `/api/progression/retreat` | 降道 |
| POST | `/api/cheat/record` | 记录作弊次数 + 触发 Boss 技能 |
| POST | `/api/detection/reset` | 被识破后重置进度 |
| GET | `/api/realms` | 获取六道列表 |
| POST | `/api/reset` | 重置轮回到地狱道第 1 关 |

### 棋类 API（每棋类独立端口）

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| GET | `/` | 返回棋类主页面 |
| GET | `/api/config/all` | 获取全部配置 |
| GET | `/api/config/{name}` | 获取单个配置（board_state / board / pieces_red / pieces_black / rules / ui_config） |
| POST | `/api/apikey` | 设置 API Key |
| GET | `/api/apikey/status` | 检查 API Key 状态 |
| POST | `/api/command` | 发送自然语言作弊指令（支持 dry_run=1 仅评估不写入） |
| POST | `/api/move` | 玩家走棋（触发消业事件） |
| POST | `/api/ai/move` | AI 走棋 |
| POST | `/api/valid_moves` | 获取棋子合法移动 |
| POST | `/api/reset` | 重置棋盘到初始状态（重置业力） |
| GET | `/api/logs` | 获取最近对话日志 |
| WebSocket | `/ws` | 实时事件推送（可选） |

### Hub API（端口 8080）

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| GET | `/` | 轮回之门首页 |
| GET | `/achievements` | 成就殿堂 |
| GET | `/api/games` | 获取六棋类列表（含端口和 URL） |
| GET | `/api/health` | 健康检查 |
| GET | `/api/samsara/realms` | 获取六道映射 |
| GET | `/api/achievements` | 获取成就列表 |
| POST | `/api/achievements/unlock` | 解锁成就 |
| GET | `/api/achievements/stats` | 获取成就统计 |
| POST | `/api/achievements/stats` | 更新成就统计 |

---

## 十、作弊指令分类与价目

| 分类 | 含义 | 业力区间 | 是否需技能解锁 | 示例 |
|:----:|:-----|:--------:|:--------------:|:-----|
| E | 闲聊 / 搞笑 | 1（固定） | 否 | "你好" / "讲个笑话" |
| D | 界面修改 / 外观 | 5-15 | 是（cheat_mastery_t1b） | "改棋盘背景颜色" |
| A | 机制修改 | 20-40 | 否 | "给对手加一个额外回合" |
| B | 棋盘变换 / 棋子位置 | 15-35 | 否 | "把我的车移到中线" |
| C | 规则修改 / 棋子走法 | 30-60 | 否 | "让我的马可以斜走" |
| C+ | 创建新棋子 | 50-100 | 是（cheat_mastery_t1a） | "创建一个能飞的狮" |
| F | 失败 / 拒绝 | 0 | - | AI 拒绝执行 |

**业力退还规则**：
- E 类被 ChatAI 拒绝：退还 1 点
- 修改失败（type=rejected/error）：全额退还
- 评估超出单次上限：直接拦截，业力不变

---

## 十一、技术栈

| 层 | 技术 |
|:---|:-----|
| 前端 | 原生 Web Components + Shadow DOM |
| 后端 | FastAPI + Uvicorn（多进程架构） |
| AI | DeepSeek（deepseek-chat / deepseek-v4-flash），两级流水线 |
| 配置修改 | RFC 6902 JSON Patch + JSON Schema |
| 存档 | JSON 文件持久化（`configs/samsara_state.json`） |

---

## 十二、更多文档

- [整体设计书 v2.0](六道轮回_整体设计书_v2.0.md) — 完整设计与机制详解

---

## License

MIT
