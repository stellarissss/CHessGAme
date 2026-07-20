# 棋圣 (ChessSage) — 无限制棋类 RPG

> **以作弊取胜的剧情向棋类 RPG**：玩家扮演觉醒了「棋圣系统」的少年，通过自然语言改写棋局规则、操控对手认知，在没人察觉的情况下登顶棋圣。
>
> 三种传统棋类（中国象棋 / 五子棋 / 围棋）被包装为 RPG 关卡，所有「作弊能力」由二级 AI 协作流水线（意图解析 + 代码生成）现场实现——这是项目「灵活编码」最高纲领的体现。

**版本**：v0.3（RPG Demo 骨架）
**最后更新**：2026-07-18

---

## 📐 顶层目录结构

```
棋圣/  (workspace root)
├── README.md                       ← 你正在看的文件：架构总览
├── 项目计划书_RPG大游戏.md          ← 必读：后续开发路线图
├── 执行方案.md                      ← 历史执行蓝图（技术细节参考）
├── requirements.txt                ← 整体 Python 依赖
│
├── shared/                         ← 跨子项目共享层
│   ├── schema_validator.py         ← JSON Schema 校验器（Draft7）
│   ├── json_patch_utils.py         ← RFC 6902 JSON Patch 工具
│   ├── schemas/                    ← 共享 JSON Schema（board/pieces/rules/ui_config）
│   ├── assets/
│   │   └── characters/{boy,robot}/ ← 主角 + 棋圣系统立绘（各 17-18 张表情）
│   │       └── generate_all.py     ← Seedream 像素资产生成脚本
│   └── rpg/                        ← ✨ RPG 外壳层（端口 80）
│       ├── rpg_server.py           ← RPG 主后端（688 行，12 条路由）
│       ├── rpg_shell.html          ← RPG 外壳页面
│       ├── rpg_shell.js            ← 章节管理 / Web Component 动态加载 / 状态同步
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
│       ├── ch01_tutorial_wuziqi.json ← 第 0 章·教程（2 场景 19 节点，骨架）
│       ├── ch02_city_xiangqi.json  ← 第 1 章·入门（2 场景 15 节点，骨架）
│       ├── ch03_go_intro.json      ← 第 2 章·进阶（围棋，降级骨架）
│       ├── ch04_boss_wuziqi.json   ← 第 3 章·BOSS战（骨架）
│       ├── ch05_final_xiangqi.json ← 第 4 章·终极对决（骨架）
│       └── ch06_finale_go.json     ← 第 5 章·终局（围棋，降级骨架）
│
├── xiangqi/                        ← 子项目①：无限制象棋（9×10 棋盘，端口 8000）
│   ├── main.py                     ← FastAPI 入口（含 /api/rpg/* 代理 + dry_run）
│   ├── ai_orchestrator.py          ← 二级 AI 编排（已透传 cost_energy）
│   ├── rule_engine.py              ← jump/ray 双原子规则引擎
│   ├── chess_ai.py                 ← ChessAI（Minimax + Alpha-Beta）
│   ├── mechanism_engine.py         ← 5 种机制原语 + AI 性格系统
│   ├── prompts.py                  ← DeepSeek 提示词（已加 cost_energy 字段）
│   ├── configs/                    ← 象棋 JSON 配置
│   ├── static/                     ← 象棋前端（Web Component `<xiangqi-board>`）
│   └── api密钥.txt                 ← DeepSeek API Key
│
├── wuziqi/                         ← 子项目②：无限制五子棋（15×15 棋盘，端口 8001）
│   ├── (结构与 xiangqi 一致)
│   └── main.py                     ← 端口已改为 8001
│
├── go/                             ← 子项目③：简化围棋 9×9（端口 8002）
│   └── ❌ 尚未创建（rpg_server 已预留接入点，ch03/ch06 自动降级）
│
└── story-editor/                   ← 子项目④：剧情 / Galgame 编辑器（端口 8003，开发用）
    ├── modules/preview.js          ← VN 引擎源头（已被复制到 shared/rpg/vn_player/）
    ├── modules/variable-manager.js ← 变量管理源头
    └── docs/integration_guide.md   ← 集成指南
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
| 第 2 章·进阶 | 10 min | 围棋 9×9 | vs 云子老人（围棋服务未就绪时降级） |
| 第 3 章·BOSS战 | 10 min | 五子棋 | vs 夜枭（规则变体） |
| 第 4 章·终极对决 | 15 min | 象棋 | vs 棋圣真身 |
| 第 5 章·终局 | 8 min | 围棋 9×9 | vs 执念化身 + 结局判定 |
| 终章·结局 | 2 min | — | 根据识破状态显示结局 |

---

## 🏗️ 技术架构

### Web Components + ES Modules 模块化架构

```
┌──────────────────────────────────────────────────────────┐
│              浏览器 / RPG 外壳 (localhost:80)              │
│  ┌────────────┐  ┌──────────────────────────────────┐    │
│  │  RpgShell  │  │  <xiangqi-board> / <wuziqi-board> │    │
│  │  • 章节管理 │  │  / <go-board>  Web Component       │    │
│  │  • 能量/识破│  │  + 棋圣系统作弊侧栏              │    │
│  │  • VN 故事层│  │  + 能量条 / 回合数               │    │
│  └────────────┘  └──────────────────────────────────┘    │
│         │ 直接方法调用 + CustomEvent                       │
│         │ applyCheatPatch() / getBoardSnapshot()           │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP fetch
┌──────────────────────▼───────────────────────────────────┐
│                RPG 后端 (FastAPI, port 80)                 │
│  12 条路由：章节 / 对战 / 作弊 / 状态 / VN / API Key       │
│  转发到 → xiangqi:8000 / wuziqi:8001 / go:8002            │
└──────────────────────────────────────────────────────────┘
```

**为何选 Web Components**：
- **Shadow DOM 样式隔离**：RPG 外壳与棋盘 CSS 互不污染，替代 iframe 天然隔离
- **直接方法调用**：`boardEl.applyCheatPatch(patch)` 零序列化通信，替代 postMessage 往返
- **统一请求上下文**：RPG 外壳统一管理 fetch，状态同步无歧义
- **轻量高效**：Web Component 是普通 DOM 元素，无 iframe 完整浏览器上下文开销
- **桌面打包友好**：纯 ES Module 相对路径加载，无 iframe 本地路径沙箱/跨域问题

#### Web Component 接口契约

三个棋类组件（`<xiangqi-board>` / `<wuziqi-board>` / `<go-board>`）遵循统一接口：

| 类别 | 名称 | 说明 |
|---|---|---|
| 属性 | `api-base` | 棋类后端 base URL（RPG 模式下设为 `http://localhost:800x`） |
| 属性 | `player-side` | 玩家方（red/black） |
| 属性 | `rpg-mode` | 存在即隐藏 side-panel/input-section 等 standalone UI |
| 方法 | `init()` | 加载配置并渲染（幂等） |
| 方法 | `applyCheatPatch(configs)` | 重新拉取后端配置并重渲染 |
| 方法 | `getBoardSnapshot()` | 返回当前棋盘状态快照 |
| 方法 | `destroy()` | 清理定时器/监听器，防止内存泄漏 |
| 事件 | `ready` | 初始化完成 |
| 事件 | `move` | 走棋完成（含 captured/mover/game_ended 等） |
| 事件 | `gameend` | 游戏结束（含 winner） |
| 事件 | `error` | 错误通知 |

### 端口分配

| 服务 | 端口 | 用途 | 状态 |
|---|---|---|---|
| RPG 主服务 | 80 | RPG 外壳 + API 网关 | ✅ |
| 象棋服务 | 8000 | 象棋对战 | ✅ |
| 五子棋服务 | 8001 | 五子棋对战 | ✅ |
| 围棋服务 | 8002 | 围棋对战 | ❌ 未实现 |
| 剧情编辑器 | 8003 | 剧情 JSON 编辑（开发用） | ✅ |

---

## 🚀 快速开始

### 安装依赖

```bash
pip install -r requirements.txt
# 含 fastapi / uvicorn / httpx / pydantic / openai 等
```

### 启动服务

```bash
# 终端 1：象棋服务
cd /workspace/xiangqi && python main.py  # 端口 8000

# 终端 2：五子棋服务
cd /workspace/wuziqi && python main.py   # 端口 8001

# 终端 3：RPG 主服务
cd /workspace/shared/rpg && python rpg_server.py  # 端口 80
```

打开浏览器访问 `http://localhost/`，开始游戏。

> 围棋服务（端口 8002）未实现时，第 2 章 / 第 5 章会自动降级为纯 VN 跳过。

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
| RPG 外壳 | `shared/rpg/rpg_shell.html/js` | 章节/能量/识破 UI，Web Component 动态加载，CustomEvent 通信 |
| 作弊面板 | `shared/rpg/cheat_panel.js` | 评估消耗 → 确认执行 → 对手台词触发 |
| VN 故事层 | `shared/rpg/story_layer.js` + `vn_player/` | 封装 Preview.playStory，11 种节点类型 |
| 棋类组件 | `xiangqi/wuziqi/go/static/app.js` | Web Components（Shadow DOM 隔离 + ES Module 导出） |
| 章节剧情 | `rpg_data/chapters/ch00-ch06` | 7 个章节 JSON（ch00 完整，其余骨架） |
| 对手台词 | `shared/rpg/dialogue_templates.json` | 6 类 × 4 条 = 24 条认知扭曲台词 |
| 象棋子项目 | `xiangqi/` | jump/ray 引擎 + 二级 AI + 机制原语 + cost_energy + dry_run |
| 五子棋子项目 | `wuziqi/` | 五连检测 + GomokuAI + cost_energy + dry_run |
| 角色立绘 | `shared/assets/characters/{boy,robot}` | 主角 18 张 + 棋圣系统 17 张表情 |
| 共享工具 | `shared/{schema_validator,json_patch_utils}.py` | JSON Schema 校验 + RFC 6902 Patch |

### ❌ 未完成（详见 [项目计划书](./项目计划书_RPG大游戏.md)）

| 待办 | 优先级 | 说明 |
|---|---|---|
| 围棋子项目 `go/` | 高 | 9×9 简化围棋引擎 + AI + 前端 |
| 像素画资产 | 高 | 15 个背景/图标/UI 资产（Seedream 生成） |
| 标题屏 + 加载遮罩 | 高 | `rpg_extras.js` + 标题屏 UI + 粒子动画 |
| 游玩文档模态框 | 中 | 内置游戏教程 + 玩法说明页面 |
| 教程章节扩展 | 中 | ch01 扩展为完整剧情化系统教学（6 场景） |
| 章节背景图片化 | 中 | 7 个章节背景从 solid 纯色改为像素画 PNG |
| ch03-ch06 完整剧情 | 中 | 从骨架扩展为完整 VN 内容 |
| 端到端测试脚本 | 中 | Playwright 视觉测试 + 服务器端验证 |
| 存档系统 | 低 | JSON 文件存档（多槽位） |
| BGM / 音效 | 低 | 章节主题曲 + 作弊/识破音效 |

---

## 📚 重要文档

| 文档 | 内容 |
|---|---|
| [项目计划书_RPG大游戏.md](./项目计划书_RPG大游戏.md) | **必读**：后续开发路线图，含真实状态清单与优先级 |
| [执行方案.md](./执行方案.md) | 历史执行蓝图：Option A 架构、postMessage 协议、作弊执行流程 |
| [.trae/documents/](./.trae/documents/) | 历史实施记录（实现计划 / 收尾计划 / 测试计划） |
| [无限制象棋_完整计划书_v4.0.md](./无限制象棋_完整计划书_v4.0.md) | v4 历史计划书：二级 AI 协作、机制引擎、AI 性格系统 |
| [story-editor/docs/integration_guide.md](./story-editor/docs/integration_guide.md) | VN 引擎集成指南：11 种节点类型、VisualNovelPlayer API |
| [shared/assets/generate_all.py](./shared/assets/generate_all.py) | Seedream 像素资产生成器 |

---

## 🛣️ 路线图

| 阶段 | 目标 | 状态 |
|---|---|---|
| v1 单一象棋 | 自然语言指令 + 二级 AI + jump/ray 引擎 | ✅ 完成 |
| v2 多元引擎 | 拆分为象棋 / 五子棋 / 剧情编辑器子项目 | ✅ 完成 |
| v3 RPG 骨架 | RPG 外壳 + iframe + 7 章节骨架 + 作弊链路 | ✅ 完成（当前） |
| v3.1 视觉打磨 | 像素资产 + 标题屏 + 文档模态框 + 教程扩展 | 🚧 进行中 |
| v3.2 围棋接入 | 9×9 围棋引擎 + AI + 前端 | 📅 计划中 |
| v3.3 内容补全 | ch03-ch06 完整剧情 + 端到端测试 | 📅 计划中 |
| v4 大游戏 | 完整 RPG 主线 + 多结局 + BOSS 战 + 棋圣称号 | 📅 长远目标 |

---

## 📜 许可证

MIT License
