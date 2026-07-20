# 棋圣 (ChessSage) — 无限制棋类 RPG

> **以作弊取胜的剧情向棋类 RPG**：玩家扮演觉醒了「棋圣系统」的少年，通过自然语言改写棋局规则、操控对手认知，在没人察觉的情况下登顶棋圣。
>
> 三种传统棋类（中国象棋 / 五子棋 / 围棋）被包装为 RPG 关卡，所有「作弊能力」由二级 AI 协作流水线（意图解析 + 代码生成）现场实现——这是项目「灵活编码」最高纲领的体现。

**版本**：v0.4（Web Components 架构）
**最后更新**：2026-07-20

---

## 📐 顶层目录结构

```
棋圣/  (workspace root)
├── README.md                       ← 你正在看的文件：架构总览
├── main.py                         ← ✨ 统一启动器（一键启动所有服务）
├── 项目计划书_RPG大游戏.md          ← 必读：后续开发路线图
├── requirements.txt                ← 整体 Python 依赖
│
├── shared/                         ← 跨子项目共享层
│   ├── schema_validator.py         ← JSON Schema 校验器（Draft7）
│   ├── json_patch_utils.py         ← RFC 6902 JSON Patch 工具
│   ├── schemas/                    ← 共享 JSON Schema（board/pieces/rules/ui_config）
│   ├── assets/
│   │   └── characters/{boy,robot}/ ← 主角 + 棋圣系统立绘（各 17-18 张表情）
│   └── rpg/                        ← ✨ RPG 外壳层（端口 8080）
│       ├── rpg_server.py           ← RPG 主后端（688 行，12 条路由）
│       ├── rpg_shell.html          ← RPG 外壳页面
│       ├── rpg_shell.js            ← 章节管理 / Web Components / 状态同步
│       ├── cheat_panel.js          ← 棋圣系统作弊面板
│       ├── story_layer.js          ← VN 故事层封装
│       ├── rpg_style.css           ← RPG 像素风样式（426 行）
│       ├── dialogue_templates.json ← 对手「认知扭曲」台词库（6 类 × 4 条）
│       └── vn_player/              ← VN 引擎（从 story-editor 复制并打补丁）
│           ├── preview.js          ← VisualNovelPlayer（566 行，11 种节点）
│           ├── variable_manager.js ← 最小变量管理实现
│           └── vn_style.css
│
├── rpg_data/                       ← ✨ RPG 章节剧情数据
│   └── chapters/
│       ├── ch00_prologue.json      ← 序章·觉醒（4 场景 25 节点，完整）
│       ├── ch01_tutorial_wuziqi.json ← 第 0 章·教程（6 场景 46 节点，完整）
│       ├── ch02_city_xiangqi.json  ← 第 1 章·入门（2 场景 15 节点，骨架）
│       ├── ch03_go_intro.json      ← 第 2 章·进阶（4 场景 33 节点，完整）
│       ├── ch04_boss_wuziqi.json   ← 第 3 章·BOSS战（1 场景 9 节点，骨架）
│       ├── ch05_final_xiangqi.json ← 第 4 章·终极对决（1 场景 9 节点，骨架）
│       └── ch06_finale_go.json     ← 第 5 章·终局（3 场景 24 节点，完整）
│
├── xiangqi/                        ← 子项目①：无限制象棋（9×10 棋盘，端口 8000）
│   ├── main.py                     ← FastAPI 入口
│   ├── ai_orchestrator.py          ← 二级 AI 编排
│   ├── rule_engine.py              ← jump/ray 双原子规则引擎
│   ├── chess_ai.py                 ← ChessAI（Minimax + Alpha-Beta）
│   ├── mechanism_engine.py         ← 5 种机制原语 + AI 性格系统
│   ├── prompts.py                  ← DeepSeek 提示词
│   ├── configs/                    ← 象棋 JSON 配置
│   └── static/                     ← 象棋前端（Web Component）
│       └── app.js                  ← XiangqiBoard 自定义元素
│
├── wuziqi/                         ← 子项目②：无限制五子棋（15×15 棋盘，端口 8001）
│   ├── (结构与 xiangqi 一致)
│   └── main.py                     ← 端口 8001
│
├── go/                             ← 子项目③：简化围棋 9×9（端口 8002）
│   └── main.py                     ← 端口 8002，9×9 简化围棋
│
└── story-editor/                   ← 子项目④：剧情 / Galgame 编辑器（端口 8003）
    └── modules/preview.js          ← VN 引擎源头
```

---

## 🎯 设计理念

### 1. 灵活编码（最高纲领）

> 项目以「用 AI 现场生成代码实现大部分要求」为核心创新形式。
> 除已完成的硬编码部分外，所有新功能皆不可硬编码，必须用 AI 编码实现。
> 为此可以牺牲稳定性、Token 花销、速度——灵活编码是项目设立的初衷。

### 2. JSON 驱动架构

所有可变元素（规则、棋盘、棋子、剧情）都抽象为 JSON 数据。游戏引擎从 JSON 读取配置，AI 只需修改 JSON 即可改变游戏行为。

### 3. jump + ray 双原子规则体系

所有棋子的移动规则被解构为两种底层原子：
- **jump**：离散跳跃（`to` 偏移 + `block` 关卡格 + `land` 落点要求）
- **ray**：射线滑行（`dir` 方向 + `max` 步数 + `screens` 屏障）

配合 `where` 条件表达式与 `sym` 对称展开，AI 能修改规则概念本身。**这是元引擎跨棋类的核心保证**：象棋、五子棋、围棋、自定义棋类共用同一套规则描述语言。

### 4. 二级 AI 协作流水线

```
玩家自然语言指令
  ↓
[第一级] 意图解析 AI (deepseek-v4-flash, temp=0.3)
  → 分类 A / B / C / C+ / D / E / F + 评估 cost_energy
  ↓
[第二级] 代码生成 AI (deepseek-v4-pro, thinking)
  → 输出 RFC 6902 JSON Patch（或 HTML 区段替换）
  ↓
JSON Schema 校验 + 业务规则验证
  ↓ 应用 / 失败重试（最多 2 次）
```

### 5. 机制原语（5 种硬编码 + AI 组合）

`skip_turns` / `ai_control` / `random_moves` / `extra_turns` / `move_limits` —— AI 通过 JSON Patch 自由组合这些原语实现「冻结 AI 两回合」、「AI 接管玩家两步」等任意机制。

### 6. 作弊即玩法（RPG 包装）

玩家的「作弊」被包装为「棋圣系统的超能力」：每次改写规则都消耗**能量**、累积**识破概率**。对手的「认知会被扭曲」——他们会合理化你的违规，认为本该如此。但一旦被看穿，结局将走向深渊。

---

## 🎮 RPG 核心机制

### 能量条（Energy）

| 参数 | 值 |
|---|---|
| 最大值 | 100 |
| 起始值 | 0（每局清空） |
| 使用门槛 | 30（**允许透支**） |
| 吃子加成 | +10（吃）/ +5（被吃）/ +3（将军）/ +15（五连）/ +8（围棋提子） |
| 被动回复 | 每 5 回合 +2 |

### 识破概率（Detection）

```
识破概率 = 累计识破值（全局，只增不减，0% 起步，封顶 95%）

每次作弊后结算：
  增量 = 2% + cost_energy × 0.5% + max(0, -能量/10) × 3%
  累计识破值 += 增量
  掷骰：if random() < 累计识破值 / 100:
      was_detected = True  （永久标记，当前对战继续）
```

- 玩家在游戏中**看不到识破概率**（保持悬念）
- 识破**不影响当前对战**，只在终章影响结局

### 三个结局

| 结局 | 触发条件 |
|---|---|
| Good Ending | 曾作弊且从未被识破 |
| Bad Ending | 曾作弊且被识破过 |
| 真结局（隐藏） | 全程零作弊通关 |

### 游戏流程（约 65 分钟，6 场对战）

| 章节 | 时长 | 棋类 | 内容 |
|---|---|---|---|
| 序章·觉醒 | 4 min | — | VN：少年觉醒棋圣系统 |
| 第 0 章·教程 | 8 min | 五子棋 | 棋圣系统手把手教作弊 |
| 第 1 章·入门 | 8 min | 象棋 | vs 街亭棋客（aggressive） |
| 第 2 章·进阶 | 10 min | 围棋 9×9 | vs 云子老人 |
| 第 3 章·BOSS战 | 10 min | 五子棋 | vs 夜枭（规则变体） |
| 第 4 章·终极对决 | 15 min | 象棋 | vs 棋圣真身 |
| 第 5 章·终局 | 8 min | 围棋 9×9 | vs 执念化身 + 结局判定 |
| 终章·结局 | 2 min | — | 根据识破状态显示结局 |

---

## 🏗️ 技术架构

### Web Components + ES Modules 架构

```
┌──────────────────────────────────────────────────────────┐
│              浏览器 / RPG 外壳 (localhost:8080)            │
│  ┌──────────────────────────────────────────────────┐    │
│  │  RpgShell (rpg_shell.js)                          │    │
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
│  后端服务群（FastAPI，零改动）                              │
│  rpg_server:8080  →  代理转发  →  xiangqi:8000 / wuziqi:8001│
└──────────────────────────────────────────────────────────┘
```

### 核心架构特点

| 特点 | 说明 |
|---|---|
| **Web Components** | 棋类前端封装为自定义元素（`<xiangqi-board>`, `<wuziqi-board>`, `<go-board>`） |
| **Shadow DOM** | 样式完全隔离，替代 iframe 的天然隔离 |
| **ES Modules** | 动态 import 棋类模块，按需加载 |
| **自定义事件** | `move` / `gameend` / `ready` / `error` 事件替代 postMessage |
| **方法调用** | 直接调用组件方法（`applyCheatPatch()`）替代 postMessage 通信 |
| **后端零改动** | Python 后端代码保持不变 |

### 棋类 Web Component 规范

| 属性 | 类型 | 说明 |
|---|---|---|
| `api-base` | string | API 基础路径（如 `http://localhost:8000`） |
| `player-side` | string | 玩家方：`red` / `black` |
| `rpg-mode` | boolean | RPG 模式，隐藏原生侧栏和输入区 |

| 方法 | 参数 | 说明 |
|---|---|---|
| `init()` | 无 | 初始化组件，加载配置并渲染棋盘 |
| `applyCheatPatch(modifiedConfigs)` | object | 应用作弊补丁，重新渲染棋盘 |
| `getBoardSnapshot()` | 无 | 获取当前棋盘完整状态 |
| `resetBoard()` | 无 | 重置棋盘到初始状态 |
| `destroy()` | 无 | 清理资源（定时器、事件监听） |

### 端口分配

| 服务 | 端口 | 用途 | 状态 |
|---|---|---|---|
| RPG 主服务 | 8080 | RPG 外壳 + API 网关 | ✅ |
| 象棋服务 | 8000 | 象棋对战 | ✅ |
| 五子棋服务 | 8001 | 五子棋对战 | ✅ |
| 围棋服务 | 8002 | 围棋对战 | ✅ |
| 剧情编辑器 | 8003 | 剧情 JSON 编辑（开发用） | ✅ |

---

## 🚀 快速开始

### 安装依赖

```bash
pip install -r requirements.txt
# 含 fastapi / uvicorn / httpx / pydantic / openai 等
```

### 启动服务

**方式一：使用统一启动器（推荐）**

```bash
cd /workspace
python main.py
```

一键启动所有服务，访问 `http://localhost:8080/` 开始游戏。

**方式二：手动启动**

```bash
# 终端 1：象棋服务
cd /workspace/xiangqi && python main.py  # 端口 8000

# 终端 2：五子棋服务
cd /workspace/wuziqi && python main.py   # 端口 8001

# 终端 3：RPG 主服务
cd /workspace/shared/rpg && python rpg_server.py  # 端口 8080
```

打开浏览器访问 `http://localhost:8080/`，开始游戏。

### 配置 AI Key

DeepSeek API Key 用于棋圣系统作弊（意图解析 + 代码生成）：
- 默认从 `xiangqi/api密钥.txt` 读取
- 或在 RPG 内点击「⚙ 设置」覆盖
- 无 Key 时作弊链路不可用，但仍可正常下棋通关（触发真结局）

---

## 📊 当前实现状态

### ✅ 已完成

| 模块 | 文件 | 说明 |
|---|---|---|
| RPG 后端 | `shared/rpg/rpg_server.py` | 12 条路由，RpgState 状态管理，识破公式，结局判定 |
| RPG 外壳 | `shared/rpg/rpg_shell.html/js` | 章节/能量/识破 UI，Web Components 动态加载 |
| 作弊面板 | `shared/rpg/cheat_panel.js` | 评估消耗 → 确认执行 → 对手台词触发 |
| VN 故事层 | `shared/rpg/story_layer.js` + `vn_player/` | 封装 Preview.playStory，11 种节点类型 |
| 章节剧情 | `rpg_data/chapters/ch00-ch06` | 7 个章节 JSON（ch00/ch01/ch03/ch06 完整） |
| 对手台词 | `shared/rpg/dialogue_templates.json` | 6 类 × 4 条 = 24 条认知扭曲台词 |
| 象棋子项目 | `xiangqi/` | Web Component + jump/ray 引擎 + 二级 AI + 机制原语 |
| 五子棋子项目 | `wuziqi/` | Web Component + 五连检测 + GomokuAI |
| 围棋子项目 | `go/` | Web Component + 9×9 简化围棋 + 启发式 AI |
| 统一启动器 | `main.py` | 一键启动所有服务 |
| 角色立绘 | `shared/assets/characters/{boy,robot}` | 主角 18 张 + 棋圣系统 17 张表情 |

### ❌ 未完成（详见 [项目计划书](./项目计划书_RPG大游戏.md)）

| 待办 | 优先级 | 说明 |
|---|---|---|
| ch02/ch04/ch05 完整剧情 | 中 | 从骨架扩展为完整 VN 内容 |
| 存档系统 | 低 | JSON 文件存档（多槽位） |
| BGM / 音效 | 低 | 章节主题曲 + 作弊/识破音效 |

---

## 📚 重要文档

| 文档 | 内容 |
|---|---|
| [项目计划书_RPG大游戏.md](./项目计划书_RPG大游戏.md) | **必读**：后续开发路线图，含真实状态清单与优先级 |
| [执行方案.md](./执行方案.md) | 历史执行蓝图（技术细节参考） |
| [.trae/documents/webcomponents_refactor_plan.md](./.trae/documents/webcomponents_refactor_plan.md) | Web Components 重构计划 |
| [story-editor/docs/integration_guide.md](./story-editor/docs/integration_guide.md) | VN 引擎集成指南 |

---

## 🛣️ 路线图

| 阶段 | 目标 | 状态 |
|---|---|---|
| v1 单一象棋 | 自然语言指令 + 二级 AI + jump/ray 引擎 | ✅ 完成 |
| v2 多元引擎 | 拆分为象棋 / 五子棋 / 剧情编辑器子项目 | ✅ 完成 |
| v3 RPG 骨架 | RPG 外壳 + iframe + 7 章节骨架 + 作弊链路 | ✅ 完成 |
| v4 Web Components | 架构重构为 Web Components + ES Modules | ✅ **当前** |
| v4.1 内容补全 | ch02-ch06 完整剧情 + 端到端测试 | 📅 计划中 |

---

## 📜 许可证

MIT License