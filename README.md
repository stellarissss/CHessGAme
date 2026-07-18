# 无限制象棋 - 项目说明文档

## 项目简介

**无限制象棋**是一款突破传统规则束缚的创新型中国象棋游戏。玩家可以通过自然语言指令，实时修改游戏规则、棋盘状态、棋子能力，甚至游戏界面本身。

这不是一款普通的象棋游戏，而是一个**规则可塑的、活的**游戏系统。

核心创新：采用 **jump + ray 双原子移动体系** + **where 条件表达式引擎**，将所有棋子的移动规则解构为底层可组合的原子操作，使 AI 能够真正修改规则概念本身。

---

## 核心特性

- **自然语言指令**：输入"让我的马可以斜着走"、"車变成两个"等指令，AI会自动修改游戏规则
- **实时生效**：修改无需重启，立即应用到游戏中
- **多级AI协作**：意图解析AI + 代码生成AI，精准理解玩家意图
- **安全稳定**：JSON驱动架构，Schema校验，确保修改安全
- **AI对战**：内置Minimax+Alpha-Beta剪枝算法，支持三档难度
- **AI性格系统**：5种性格（标准/激进/保守/随机/自定义），AI的风格由你定义
- **游戏机制修改**：冻结AI、AI接管、随机走棋、额外回合等原子化机制原语自由组合
- **自定义棋子**：支持创建全新棋子类型，定义独特的移动规则
- **可撤销**：所有AI修改都支持撤回，不怕改坏
- **Token统计**：实时追踪AI调用消耗的Token和费用

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端层    │  HTML5 + CSS3 + 原生 JavaScript (ES2022+)      │
├─────────────────────────────────────────────────────────────┤
│  后端层    │  Python 3.11 + FastAPI + Uvicorn               │
├─────────────────────────────────────────────────────────────┤
│  AI层      │  DeepSeek API (Chat + Code 双模式)             │
│           │  意图解析AI + 多类CodeAI（B/C/D/A2）            │
├─────────────────────────────────────────────────────────────┤
│  规则引擎  │  jump/ray 双原子体系 + where 条件表达式        │
├─────────────────────────────────────────────────────────────┤
│  机制引擎  │  5种原子原语 + AI性格系统                      │
│           │  (skip/ai_control/random/extra/move_limit)     │
├─────────────────────────────────────────────────────────────┤
│  存储层    │  内存状态 + JSON配置文件 + 撤销栈               │
└─────────────────────────────────────────────────────────────┘
```

---

## 文件结构

```
unlimited_chess/
├── main.py                  # FastAPI主服务器
├── ai_orchestrator.py       # AI编排器（核心）
├── rule_engine.py           # 象棋规则引擎（jump/ray原子体系）
├── chess_ai.py              # AI下棋引擎（Minimax + Alpha-Beta）
├── mechanism_engine.py      # 机制引擎（原子原语 + AI性格系统）
├── prompts.py               # AI提示词定义
├── schema_validator.py      # JSON Schema校验器
├── json_patch_utils.py      # JSON Patch工具
├── configs/                 # JSON配置文件
│   ├── board.json           # 棋盘几何定义与渲染配置
│   ├── pieces_red.json      # 红方棋子移动原语定义
│   ├── pieces_black.json    # 黑方棋子移动原语定义
│   ├── rules.json           # 游戏规则 + AI难度 + AI性格配置
│   ├── board_state.json     # 棋盘运行时状态 + 机制状态
│   ├── ui_config.json       # 界面配置
│   ├── initial/             # 初始备份（用于重置）
│   └── schemas/             # JSON Schema校验文件
├── static/                  # 前端文件
│   ├── index.html           # 主页面
│   ├── style.css            # 样式表
│   └── app.js               # 前端应用
├── tests/                   # 测试文件
└── requirements.txt         # Python依赖
```

---

## 安装指南

### 1. 环境要求

- Python 3.11+
- pip

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

或手动安装：

```bash
pip install fastapi uvicorn httpx jsonschema
```

### 3. 获取DeepSeek API Key

1. 访问 [DeepSeek官网](https://platform.deepseek.com/)
2. 注册账号并获取API Key
3. 首次运行游戏时，在设置中输入API Key

### 4. 启动游戏

```bash
cd unlimited_chess
python main.py
```

### 5. 访问游戏

打开浏览器访问：`http://localhost:8000`

---

## 使用说明

### 基本操作

1. **走棋**：点击棋子选中，再点击目标位置移动
2. **悔棋**：点击"悔棋"按钮回退一步（同时回退AI的一步）
3. **重新开始**：点击"重新开始"重置棋盘
4. **撤回AI修改**：如果对AI的修改不满意，点击"撤回AI修改"按钮

### 自然语言指令

在底部输入框输入指令，例如：

| 指令类型 | 示例 | 效果 |
|---------|------|------|
| 规则修改 | "让我的马可以斜着走" | 马增加斜向移动能力 |
| 规则修改 | "象可以过河" | 取消象的过河限制 |
| 规则修改 | "炮需要隔两个子才能吃" | 修改炮的炮架数量 |
| 规则修改 | "兵可以后退" | 兵增加后退能力 |
| 棋盘变换 | "复制一个車到[3,3]" | 在指定位置添加新車 |
| 棋盘变换 | "把[0,0]的車移到[4,4]" | 移动指定棋子 |
| 界面修改 | "把棋盘背景改成蓝色" | 修改棋盘颜色 |
| 创建棋子 | "创建一个可以斜走两格的棋子叫'象王'" | 创建全新自定义棋子 |
| AI性格 | "让AI变得更激进" | 切换AI到激进性格 |
| AI性格 | "让AI变成赌徒风格" | 创建自定义赌徒性格 |
| 游戏机制 | "冻结AI两回合" | AI跳过两回合 |
| 游戏机制 | "我的下两步棋由AI接管" | AI替玩家走两步 |
| 游戏机制 | "我这步棋随便下" | 本步随机走棋 |
| 娱乐 | "把棋盘掀了" | AI幽默回复 |

---

## 配置说明

### board.json — 棋盘几何与渲染

棋盘的几何定义和视觉渲染配置，包含：

- `geometry`：棋盘几何属性
  - `width` / `height`：棋盘行列数
  - `river_line`：河界位置
  - `palace`：九宫格定义（红方/黑方）
  - `regions`：自定义区域（如红方阵地、黑方阵地）
- `appearance`：视觉渲染配置
  - `grid`：网格线设置
  - `palace`：九宫格显示设置
  - `river`：楚河汉界设置
  - `layout`：布局边距、尺寸
  - `decorations`：装饰元素（边框、自定义线条等）

### pieces.json — 棋子移动原语

使用 **jump + ray** 两种原子移动原语定义所有棋子的移动规则：

- `pieces`：预定义棋子（general, advisor, elephant, horse, chariot, cannon, soldier）
  - `label`：棋子显示名称（红/黑）
  - `is_king`：是否为将帅类棋子
  - `moves`：移动规则数组
    - `kind`：`jump`（离散跳跃）或 `ray`（射线滑行）
    - `to`：jump的目标偏移（dx, dy）
    - `dir`：ray的方向向量（dx, dy）
    - `max`：ray的最大步数（-1为无限）
    - `screens`：ray需跳过的棋子数（炮架机制）
    - `block`：jump的关卡格（必须为空，如马腿、象眼）
    - `land`：落点要求（`empty`/`enemy`/`any`）
    - `sym`：对称展开（`none`/`rotate4`/`rotate4_mirror`/`mirror_x`）
    - `where`：条件表达式列表（额外约束）
- `custom_pieces`：自定义棋子数组
- `side_overrides`：阵营级规则覆盖（red/black）

### rules.json — 游戏规则 + AI性格

游戏胜利条件、特殊规则、AI难度、AI性格等：

- `win_conditions`：胜利条件（将死、困毙、吃帅等）
- `special_rules`：特殊规则（飞将等）
- `turn_rules`：回合规则
- `ai_difficulty`：AI难度设置（easy/medium/hard）
  - `level`：难度等级
  - `personality`：AI性格设置
    - `type`：性格类型（normal/aggressive/defensive/random/custom）
    - `aggressiveness`：进攻倾向 0.0-1.0
    - `conservatism`：保守程度 0.0-1.0
    - `randomness_override`：覆盖随机度
    - `depth_override`：覆盖搜索深度
    - `value_biases`：棋子价值偏差
    - `custom_prompt`：自定义提示词

### board_state.json — 运行时状态 + 机制状态

当前游戏的实时状态和激活的机制：

- `pieces`：所有棋子实例（id, type, name, side, position, is_alive）
- `current_turn`：当前回合（red/black）
- `move_history`：移动历史（用于悔棋）
- `game_status`：游戏状态（进行中/结束/胜者）
- `mechanisms`：激活的游戏机制
  - `skip_turns`：跳过回合列表
  - `ai_control`：AI接管列表
  - `random_moves`：随机走棋列表
  - `extra_turns`：额外回合列表
  - `move_limits`：每回合步数限制

### ui_config.json — 界面配置

- `theme`：颜色主题
- `custom_css`：自定义CSS
- `custom_js`：自定义JavaScript

---

## AI系统架构

### 第一级：意图解析AI

- **模型**: DeepSeek-V4-Flash
- **职责**: 理解玩家自然语言，分类意图，生成结构化指令
- **分类体系**:
  - **A类**：悔棋/输赢控制（硬代码实现）
  - **B类**：棋盘变换（修改棋子状态/位置）
  - **C类**：规则修改（修改棋子移动规则）
  - **C+类**：自定义棋子创建
  - **B+C类**：混合类型（棋盘变换+规则修改）
  - **D类**：界面修改（D1配置文件 / D2 HTML结构）
  - **E类**：纯搞笑/娱乐
  - **F类**：高级/不可行

### 第二级：代码生成AI

- **模型**: DeepSeek-V4-Pro（开启思考模式）
- **职责**: 根据结构化指令生成JSON Patch或HTML修改
- **分类专家**: 棋盘变换AI / 规则修改AI / 界面修改AI / 搞笑回复AI
- **输出格式**: 优先输出 RFC 6902 标准的 JSON Patch 数组

---

## 安全机制

1. **JSON Schema验证**：所有AI生成的JSON都经过Draft7 Schema校验
2. **字段保护**：关键字段（如`_metadata`）有额外保护
3. **范围检查**：坐标必须在棋盘范围内，棋子类型必须合法
4. **撤销机制**：所有AI修改都进入撤销栈，玩家可随时撤回
5. **重试机制**：AI输出格式错误时自动重试，最多3次

---

## 开发计划

- [x] 基础象棋功能
- [x] AI对战（Minimax + Alpha-Beta）
- [x] 自然语言指令解析
- [x] 规则修改系统（C类）
- [x] 棋盘变换系统（B类）
- [x] 界面修改系统（D类）
- [x] 自定义棋子创建（C+类）
- [x] JSON Patch 优先输出
- [x] Token消耗统计
- [x] jump/ray 双原子规则引擎
- [x] where 条件表达式引擎
- [ ] WebSocket实时通信
- [ ] 多人对战
- [ ] 更多棋子类型

---

## 许可证

MIT License

---

## 致谢

- [DeepSeek](https://deepseek.com/) - 提供AI能力
- [FastAPI](https://fastapi.tiangolo.com/) - Web框架
- 中国象棋 - 千年智慧
