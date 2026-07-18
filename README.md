# 棋圣 (ChessSage) — 无限制棋类元引擎

> **一个用自然语言重塑棋类游戏规则的多元引擎**：从中国象棋到五子棋，从剧情到 RPG，所有玩法都被"灵活编码"理念贯穿。

本仓库最初是单一项目「无限制象棋」，现已重构为 **多元棋类元引擎** 架构：
主文件夹只承担 **架构分类与导航** 的职责，实际玩法与功能分散到各个独立子项目。
未来将沿 [`项目计划书_RPG大游戏.md`](./项目计划书_RPG大游戏.md) 的规划演进为一个有剧情、有大地图、可装载多种棋类的 RPG 大游戏。

---

## 📐 顶层目录结构

```
棋圣/  (workspace root)
├── README.md                       ← 你正在看的文件：架构总览
├── requirements.txt                ← 整体 Python 依赖（统一安装）
├── 项目计划书_RPG大游戏.md          ← 重要的下一步路线图（必读）
├── 无限制象棋_完整计划书_v4.0.md    ← v4 历史计划书（保留作技术参考）
│
├── shared/                         ← 跨子项目共享层（无业务逻辑）
│   ├── schema_validator.py         ← JSON Schema 校验器（Draft7）
│   ├── json_patch_utils.py         ← RFC 6902 JSON Patch 工具
│   ├── schemas/                    ← 共享 JSON Schema 文件
│   │   ├── board.schema.json
│   │   ├── board_state.schema.json
│   │   ├── pieces.schema.json
│   │   ├── rules.schema.json
│   │   └── ui_config.schema.json
│   └── assets/                     ← 共享角色立绘 / 像素资产
│       ├── characters/{boy,robot}/ ← 各角色多表情立绘
│       └── generate_all.py         ← 像素资产生成脚本（Seedream）
│
├── xiangqi/                        ← 子项目①：无限制象棋（9×10 棋盘）
│   ├── main.py                     ← FastAPI 入口（端口 8000）
│   ├── ai_orchestrator.py          ← 两级 AI 编排器
│   ├── rule_engine.py              ← jump/ray 双原子规则引擎
│   ├── chess_ai.py                 ← ChessAI（Minimax + Alpha-Beta）
│   ├── mechanism_engine.py         ← 5 种机制原语 + AI 性格系统
│   ├── prompts.py                  ← DeepSeek 提示词
│   ├── configs/                    ← 象棋 JSON 配置
│   ├── static/                     ← 象棋前端（HTML/JS/CSS）
│   └── api密钥.txt                 ← DeepSeek API Key（按需配置）
│
├── wuziqi/                         ← 子项目②：无限制五子棋（15×15 棋盘）
│   ├── main.py                     ← FastAPI 入口（端口 8000）
│   ├── ai_orchestrator.py          ← 五子棋专用 AI 编排器
│   ├── rule_engine.py              ← 五连珠胜利检测 + jump/ray 引擎
│   ├── chess_ai.py                 ← GomokuAI（棋型评分 + Zobrist 置换表）
│   ├── mechanism_engine.py         ← 机制引擎（与象棋同源）
│   ├── prompts.py                  ← 五子棋专用提示词
│   ├── configs/                    ← 五子棋 JSON 配置
│   └── static/                     ← 五子棋前端
│
└── story-editor/                   ← 子项目③：剧情 / Galgame 编辑器
    ├── main.py                     ← FastAPI 入口（端口 8001，独立运行）
    ├── scripts/
    │   └── character_generator.py  ← Seedream 生图 + rembg 抠图
    ├── modules/                    ← 编辑器前端 10 个 JS 模块
    │   ├── story-schema.js         ← 13 种节点类型定义
    │   ├── story-io.js             ← LocalStorage + 服务器 API
    │   ├── preview.js              ← VisualNovelPlayer（可嵌入游戏的播放引擎）
    │   ├── node-canvas.js          ← 节点画布（拖拽 + 连线）
    │   ├── inspector.js            ← 13 种节点属性编辑器
    │   ├── scene-tree.js / bg-manager.js / variable-manager.js
    │   ├── character-manager.js / character-creator.js
    ├── stories/                    ← 保存的剧情项目
    ├── docs/integration_guide.md   ← 详细集成指南
    ├── index.html / app.js / style.css
    └── README.md
```

---

## 🎯 设计理念

### 1. 灵活编码（最高纲领）

> 项目以"用 AI 现场生成代码实现大部分要求"为核心创新形式。
> 除已完成的硬编码部分外，所有新功能皆不可硬编码，必须用 AI 编码实现。
> 为此可以牺牲稳定性、Token 花销、速度——灵活编码是项目设立的初衷。

### 2. JSON 驱动架构

所有可变元素（规则、棋盘、棋子、剧情）都抽象为 JSON 数据。
游戏引擎从 JSON 读取配置，AI 只需修改 JSON 即可改变游戏行为。

### 3. jump + ray 双原子规则体系

所有棋子的移动规则被解构为两种底层原子：
- **jump**：离散跳跃（`to` 偏移 + `block` 关卡格 + `land` 落点要求）
- **ray**：射线滑行（`dir` 方向 + `max` 步数 + `screens` 屏障）

配合 `where` 条件表达式与 `sym` 对称展开，AI 能修改规则概念本身。
**这是元引擎跨棋类的核心保证**：象棋、五子棋、国际象棋、自定义棋类共用同一套规则描述语言。

### 4. 二级 AI 协作流水线

```
玩家自然语言指令
  ↓
[第一级] 意图解析 AI (deepseek-v4-flash, temp=0.3)
  → 分类 A / B / C / C+ / B+C / D / E / F
  ↓
[第二级] 代码生成 AI (deepseek-v4-pro, thinking)
  → 输出 RFC 6902 JSON Patch（或 HTML 区段替换）
  ↓
JSON Schema 校验 + 业务规则验证
  ↓ 应用 / 失败重试（最多 2 次）
```

### 5. 机制原语（5 种硬编码 + AI 组合）

`skip_turns` / `ai_control` / `random_moves` / `extra_turns` / `move_limits` ——
AI 通过 JSON Patch 自由组合这些原语实现"冻结 AI 两回合"、"AI 接管玩家两步"等任意机制。

---

## 🚀 快速开始

### 安装依赖

```bash
# 整体安装（覆盖所有子项目）
pip install -r requirements.txt

# 或单独为某子项目安装
pip install -r xiangqi/requirements.txt
```

### 启动各子项目

| 子项目 | 启动命令 | 访问地址 | 端口 |
|---|---|---|---|
| 无限制象棋 | `python xiangqi/main.py` | http://localhost:8000 | 8000 |
| 无限制五子棋 | `python wuziqi/main.py` | http://localhost:8000 | 8000 |
| 剧情编辑器 | `python story-editor/main.py` | http://localhost:8001 | 8001 |

> ⚠️ 象棋与五子棋默认都用 8000 端口；同时运行时请手动改一个。

### 配置 AI Key

- **DeepSeek**（象棋 / 五子棋的指令解析与代码生成）：首次运行后在游戏设置界面输入，或写入 `xiangqi/api密钥.txt`
- **火山方舟 ARK**（剧情编辑器的角色立绘生成）：环境变量 `ARK_API_KEY`

---

## 🧩 子项目之间的关系

```
                ┌──────────────────────────────────┐
                │  shared/  (schema + json_patch    │
                │           + assets + schemas)     │
                └────────────┬─────────────────────┘
                             │ (sys.path 自动注入)
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌──────────┐         ┌──────────┐         ┌──────────────┐
  │ xiangqi/ │         │ wuziqi/  │         │ story-editor/│
  │  象棋    │         │  五子棋  │         │  剧情编辑器   │
  │ main.py  │         │ main.py  │         │   main.py    │
  └──────────┘         └──────────┘         └──────┬───────┘
        │                    │                      │
        └────────────────────┴──────────────────────┘
                             │
                             ▼
                  (未来) 棋圣 RPG 主框架
                  嵌入象棋/五子棋 作为对战关卡
                  嵌入 VisualNovelPlayer 播放剧情
```

- 三个子项目**互不依赖**，可独立运行
- 都通过 `sys.path.insert(0, "../shared")` 自动复用共享代码
- 角色资产统一存放在 `shared/assets/characters/`，避免重复
- 计划书 [`项目计划书_RPG大游戏.md`](./项目计划书_RPG大游戏.md) 描述了如何将三者融合成 RPG 大游戏

---

## 📚 重要文档

| 文档 | 内容 |
|---|---|
| [项目计划书_RPG大游戏.md](./项目计划书_RPG大游戏.md) | **必读**：将项目改造为 RPG 大游戏的完整路线图 |
| [无限制象棋_完整计划书_v4.0.md](./无限制象棋_完整计划书_v4.0.md) | v4 历史计划书：象棋的二级 AI 协作、机制引擎、AI 性格系统等技术细节 |
| [story-editor/docs/integration_guide.md](./story-editor/docs/integration_guide.md) | 剧情编辑器集成指南：13 种节点类型、VisualNovelPlayer API、变量系统 |
| [shared/assets/generate_all.py](./shared/assets/generate_all.py) | 像素角色资产生成器（基于 Seedream） |

---

## 🛣️ 路线图概览

| 阶段 | 目标 | 状态 |
|---|---|---|
| v1 单一象棋 | 自然语言指令 + 二级 AI + jump/ray 引擎 | ✅ 完成 |
| v2 多元引擎 | 拆分为象棋 / 五子棋 / 剧情编辑器子项目 | ✅ 完成（本次重构） |
| v3 RPG 框架 | 大地图 + 剧情系统 + 对战关卡 + 棋圣系统世界观 | 🚧 计划中（详见计划书） |
| v4 大游戏 | 完整 RPG 主线 + 多结局 + BOSS 战 + 棋圣称号 | 📅 长远目标 |

---

## 📜 许可证

MIT License
