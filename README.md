# 棋圣 · 六道轮回

> **SAMSARA · 六重棋境，一念改规**
>
> 以六种棋类为战斗场景、"AI 作弊"为核心玩法的 Roguelike 大游戏。
> 业力为媒，规则为网，在轮回中修行，在棋局中悟道。

---

## 🎮 核心玩法

你是一缕在六道中轮回的灵魂。每一轮穿越六界——地狱道（黑白棋）、饿鬼道（跳棋）、畜生道（动物棋）、人道（象棋）、阿修罗道（围棋）、天道（五子棋）——每界有 5-6 个预制关卡。

你可以用**自然语言作弊改规则**，但每次作弊都消耗**业力**：

- ✅ **正常使用业力，不增加识破概率**（放心作弊，只要有业力）
- ⚠️ **业力不够可以透支**——但溢出越多，识破概率涨得越疯
- 💀 **被识破 = 游戏结束**，轮回重来（技能点永久保留）
- 🎯 业力靠**正常下棋事件**回复（吃子、将军、连跳…）
- ⏱️ 每局 **20 回合内**完成（围棋 40 回合）
- 👑 每道最后一关 = **守道者 Boss**，各有专属反作弊技能

> **核心循环**：下好棋赚业力 → 花业力作弊 → 作弊帮你赢 → 透支涨识破 → 被识破就轮回

---

## 🌟 特色系统

### 业力系统
- 上限 150 点，单次上限 80 点
- 作弊消耗由 AI 动态评估（C+ 类最贵，D 类最便宜）
- 事件驱动回复：吃子/将军/成五/连跳/提子…

### 识破概率
- **仅在透支业力时增长**，正常作弊零风险
- 非线性增长：`Δ = C × O^α`（α=1.8），小透支可控，大透支几乎必死
- 技能树可降低惩罚系数，甚至提供"金蝉脱壳"复活

### 六道关卡
| 道 | 棋类 | 主题 | 守道者 |
|:--:|------|------|--------|
| ☯ 地狱道 | 黑白棋 | 痛苦·翻转 | 翻覆者 |
| 👹 饿鬼道 | 跳棋 | 贪婪·无尽之路 | 饕餮者 |
| 🐅 畜生道 | 动物棋 | 愚痴·等级秩序 | 秩序者 |
| 🧠 人道 | 象棋 | 算计·平衡 | 算计者 |
| ⚔️ 阿修罗道 | 围棋 | 战斗·混沌 | 狂乱者 |
| ☸️ 天道 | 五子棋 | 禅定·五连登仙 | 禅定者 |

### 技能树（4 分支 × 3 层）
- **业力掌控**：扩容、回复、透支缓冲、初始业力
- **隐匿之术**：降低识破、首次透支免判、金蝉脱壳
- **作弊精通**：自定义棋子、效率欺诈、白嫖
- **六道悟道**：道域专精、守道者之隙、超脱之种

### 多样化胜利条件
11 种目标类型：将死、吃子数、回合限制、撤离、棋盘覆盖率、阵型达成、颜色覆盖率、生存、刺杀、护送、复合条件。

---

## 🏗️ 架构

### 整体架构

```
                    ┌──────────────────┐
                    │  轮回之门（Hub）   │
                    │   hub/index.html │
                    └────────┬─────────┘
                             │ FastAPI
                    ┌────────┴─────────┐
                    │  samsara/ 核心引擎 │
                    │  业力·识破·技能·关卡│
                    └────────┬─────────┘
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

### 每棋类统一架构

每个棋类独立进程，共享"灵活编码"统一骨架：

```
{棋类}/
├── main.py                  # FastAPI 路由（走棋/指令/配置）
├── ai_orchestrator.py       # 两级 AI 编排器（意图解析 + 代码生成）
├── chess_ai.py              # AI 走棋（Minimax + Alpha-Beta）
├── rule_engine.py           # 规则引擎（jump/ray 原语解析）
├── mechanism_engine.py      # 机制引擎（A2 类运行时机制）
├── prompts.py               # System Prompts
├── configs/                 # 6 个 JSON 配置（全部可 AI 实时修改）
│   ├── board_state.json
│   ├── board.json
│   ├── pieces_red.json
│   ├── pieces_black.json
│   ├── rules.json
│   └── ui_config.json
└── static/                  # 前端（Web Components + Shadow DOM）
```

### 灵活编码核心

- **两级 AI 流水线**：意图解析器 → 代码生成器 → JSON Patch → Schema 校验 → 应用配置
- **规则原语**：`jump`（离散跳跃）+ `ray`（射线滑行）+ `where` 条件表达式
- **地形棋子原语**：`category: "terrain"` 支持陷阱等动态场地效果
- **机制原语**：`skip_turns` / `ai_control` / `random_moves` / `extra_turns` 等运行时机制
- **修改协议**：RFC 6902 JSON Patch + JSON Schema 校验

---

## 🚀 快速开始

### 环境要求

- Python 3.10+
- DeepSeek API Key（或兼容 OpenAI 格式的模型服务）

### 安装

```bash
# 克隆仓库
cd /workspace

# 安装依赖
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
# 启动主服务（同时拉起六道棋类子进程）
python main.py
```

启动后访问：
- **轮回之门（Hub）**：http://localhost:8000/
- **人道·象棋**：http://localhost:8000/xiangqi/
- **天道·五子棋**：http://localhost:8000/wuziqi/
- **阿修罗·围棋**：http://localhost:8000/weiqi/
- **畜生·动物棋**：http://localhost:8000/dongwuqi/
- **饿鬼·跳棋**：http://localhost:8000/tiaoqi/
- **地狱·黑白棋**：http://localhost:8000/heibaiqi/

---

## 📁 项目结构

```
workspace/
├── main.py                      # 统一启动器 + Hub 后端
├── config.json                  # API 密钥配置
├── requirements.txt
│
├── hub/                         # 六道众生总坛（轮回之门）
│   ├── index.html               # 首页（六道转轮 + 关卡选择 + 技能树）
│   ├── achievements.html        # 成就殿堂
│   ├── app.js
│   └── style.css
│
├── shared/                      # 共享模块
│   ├── json_patch_utils.py      # RFC 6902 JSON Patch
│   ├── schema_validator.py      # JSON Schema 校验
│   └── achievement_checker.js   # 成就检测
│
├── samsara/                     # 六道轮回核心引擎
│   ├── api.py                   # FastAPI 路由
│   ├── state.py                 # 轮回元状态管理
│   ├── karma.py                 # 业力系统
│   ├── karma_assessor.py        # AI 业力评估
│   ├── detection.py             # 识破概率系统
│   ├── bosses.py                # Boss 技能系统
│   ├── skills.py                # 技能树系统
│   ├── progression.py           # 升降道与技能点获取
│   ├── levels.py                # 关卡管理
│   ├── objectives.py            # 多样化目标判定
│   └── turn_limit.py            # 回合限制系统
│
├── configs/                     # 全局配置
│   ├── samsara_state.json       # 轮回存档
│   ├── boss_definitions.json    # Boss 定义
│   ├── skill_tree.json          # 技能树
│   ├── karma_events.json        # 业力事件映射
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

## 🧠 API

### 轮回元状态 API（/api/samsara/*）

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | `/api/samsara/state` | 获取当前轮回状态 |
| POST | `/api/samsara/state/reset` | 重置轮回（保留技能点） |
| POST | `/api/samsara/skill/unlock` | 解锁技能 |
| POST | `/api/samsara/karma/add` | 增加业力 |
| POST | `/api/samsara/karma/consume` | 消耗业力（含透支判定） |
| POST | `/api/samsara/detection/roll` | 触发识破判定 |
| POST | `/api/samsara/level/complete` | 完成当前关卡 |
| GET | `/api/samsara/levels` | 获取当前道的关卡列表 |

### 棋类 API（每棋类独立）

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | `/api/state` | 获取棋盘状态 |
| POST | `/api/move` | 走一步棋 |
| POST | `/api/ai/move` | AI 走棋 |
| POST | `/api/command` | 发送自然语言作弊指令 |
| GET | `/api/config/{file}` | 获取配置文件 |
| POST | `/api/reset` | 重置棋局 |

---

## 📖 更多文档

- [整体设计书 v1.0](docs/六道轮回_整体设计书_v1.0.md) — 完整的设计文档
- [Roguelike 设计 v4](六道轮回_roguelike设计_v4.md) — 早期设计文档

---

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 前端 | 原生 Web Components + Shadow DOM |
| 后端 | FastAPI + Uvicorn（多进程架构） |
| AI | DeepSeek（deepseek-chat），两级流水线 |
| 配置修改 | RFC 6902 JSON Patch + JSON Schema |
| 存档 | JSON 文件持久化 |

---

## 📜 License

MIT
