# 无限制围棋 - 完整开发计划 v1.0

## 一、项目概述

基于"无限制象棋"的架构，开发"无限制围棋"游戏。目标是打造一个AI自由修改规则的围棋引擎，支持自然语言指令修改规则、棋盘、机制等。

### 围棋与象棋的核心差异

| 维度 | 象棋 | 围棋 |
|------|------|------|
| 棋盘 | 9x10，有河界、九宫格 | 19x19（或9x9、13x13），纯网格 |
| 棋子 | 多种类型，可移动 | 只有黑/白两种，落子后不能移动 |
| 吃子 | 直接吃掉对方棋子 | 通过围杀提子 |
| 胜利条件 | 将死对方将帅 | 五连获胜（简化版）或围地计分 |
| 核心机制 | 移动规则、将军、飞将 | 气的计算、提子、打劫、禁手 |

### 项目结构

```
/workspace/go/
├── configs/
│   ├── initial/
│   │   ├── board.json.initial
│   │   ├── board_state.json.initial
│   │   ├── pieces_black.json.initial
│   │   ├── pieces_red.json.initial
│   │   ├── rules.json.initial
│   │   └── ui_config.json.initial
│   ├── board.json        # 棋盘几何定义（19x19网格、星位）
│   ├── board_state.json  # 棋盘状态（空棋盘、ko_state、captures）
│   ├── pieces_black.json # 黑方棋子规则（简化为stone）
│   ├── pieces_red.json   # 白方棋子规则（简化为stone）
│   ├── rules.json        # 围棋规则（五连获胜、打劫、禁手）
│   └── ui_config.json    # UI配置（围棋主题）
├── static/
│   ├── index.html        # 前端页面（围棋标题、提示）
│   ├── app.js            # 前端逻辑（落子交互、19x19棋盘渲染）
│   └── style.css         # 样式（围棋棋盘、黑白棋子）
├── ai_orchestrator.py    # AI编排器（复用象棋，修改导入路径）
├── chess_ai.py           # 围棋AI引擎（重写）
├── main.py               # FastAPI入口（修改API端点为落子逻辑）
├── mechanism_engine.py   # 机制引擎（复用象棋）
├── prompts.py            # AI提示词（重写为围棋版本）
├── requirements.txt      # 依赖（复用象棋）
├── rule_engine.py        # 规则引擎（重写为围棋规则）
├── README.md             # 项目说明
└── 无限制围棋_完整计划书_v1.0.md  # 完整计划书
```

---

## 二、核心修改方案

### 2.1 规则引擎 (rule_engine.py)

围棋规则引擎需要实现：

| 方法名 | 功能 | 参数 | 返回值 |
|--------|------|------|--------|
| `get_valid_moves(board_state, side)` | 获取所有合法落子位置 | board_state: 当前棋盘状态, side: 当前方(black/white) | List[List[int]] - 合法位置列表 |
| `place_stone(board_state, x, y, side)` | 落子并处理提子 | x, y: 落子坐标, side: 落子方 | dict - 更新后的棋盘状态 |
| `calculate_liberties(board_state, x, y)` | 计算棋串气数 | x, y: 棋子坐标 | int - 气数 |
| `remove_group(board_state, x, y)` | 移除无气棋串 | x, y: 棋子坐标 | int - 提子数 |
| `is_ko(board_state, x, y, side)` | 检查是否为打劫 | x, y: 落子坐标, side: 落子方 | bool - 是否为打劫 |
| `is_forbidden(board_state, x, y, side)` | 检查是否为禁手（仅黑方） | x, y: 落子坐标, side: 落子方 | bool - 是否为禁手 |
| `check_five_in_a_row(board_state)` | 检查五连获胜 | board_state: 当前棋盘状态 | Optional[str] - 获胜方 |

**气数计算算法**：
1. 使用BFS查找连通的同色棋子（棋串）
2. 统计棋串周围的空格数作为气数

**打劫规则**：
1. 在board_state中记录上一步的棋盘状态（ko_state）
2. 落子后检查是否与ko_state相同
3. 如果相同，判定为打劫，禁止落子

**禁手规则**（仅对黑方生效）：
1. 三三禁手：同时形成两个或更多的活三
2. 四四禁手：同时形成两个或更多的冲四或活四
3. 长连禁手：形成六子或更多的连续棋子

**五连检测**：
1. 检查落子位置的横、竖、两条对角线方向
2. 判断是否有连续五子

### 2.2 AI引擎 (chess_ai.py)

围棋AI需要实现：

| 方法名 | 功能 | 参数 | 返回值 |
|--------|------|------|--------|
| `get_best_move(board_state)` | 获取AI最佳落子 | board_state: 当前棋盘状态 | Optional[Dict] - 落子信息 |
| `_generate_all_moves(board_state, side)` | 生成所有合法落子 | board_state: 当前棋盘状态, side: 当前方 | List[Dict] - 合法落子列表 |
| `_simulate_move(board_state, move)` | 模拟落子 | board_state: 当前棋盘状态, move: 落子信息 | dict - 新棋盘状态 |
| `_evaluate(board_state, ai_side)` | 评估棋盘局面 | board_state: 当前棋盘状态, ai_side: AI方 | float - 评估分数 |
| `_minimax(board_state, depth, alpha, beta, is_max, ai_side)` | Minimax搜索 | board_state, depth, alpha, beta, is_max, ai_side | float - 评估分数 |

**启发式评估函数**：
1. **位置价值表**：角 > 边 > 星位 > 天元 > 其他
2. **气数评估**：棋串气数越多越稳定
3. **连接性评估**：棋子连接越多越强
4. **领地控制**：估算双方控制的领地

### 2.3 主服务器 (main.py)

主要修改：

| API端点 | 修改内容 |
|---------|----------|
| `/api/move` | 从移动棋子改为落子，接收位置坐标而非棋子ID |
| `/api/valid_moves` | 返回空位置而非棋子的移动位置 |
| `/api/ai_move` | AI落子逻辑 |
| `/api/undo` | 悔棋逻辑（移除棋子而非移动棋子） |

**落子API请求格式**：
```json
{
  "to": [x, y]
}
```

### 2.4 提示词 (prompts.py)

完全重写为围棋版本：

| 提示词变量 | 修改内容 |
|-----------|----------|
| `PIECE_TYPE_MAP` | 简化为只有"stone"类型 |
| `PIECE_NAME_MAP` | 简化为黑子/白子 |
| `PIECE_PRIMITIVE_PRIMER` | 移除象棋的jump/ray原语，改为围棋规则说明 |
| `INTENT_PARSER_SYSTEM` | 围棋意图解析 |
| `RULE_MODIFIER_SYSTEM` | 围棋规则修改 |
| `BOARD_TRANSFORMER_SYSTEM` | 棋盘状态管理（落子、提子） |
| `MECHANISM_MODIFIER_SYSTEM` | 机制修改（复用象棋机制） |

### 2.5 前端文件

**index.html修改**：
- 标题改为"无限制围棋"
- 修改提示示例（如"让黑子可以走两步"、"取消禁手规则"）

**app.js修改**：
- 棋盘渲染改为19x19网格、星位显示
- 棋子渲染改为圆形黑白棋子
- 交互逻辑改为点击落子而非移动棋子
- 添加禁手提示、打劫提示
- 修改胜利显示

**style.css修改**：
- 棋盘背景改为木质颜色（#dcb35c）
- 棋子样式改为纯黑/纯白圆形
- 星位样式

### 2.6 配置文件

**board.json**：
```json
{
  "geometry": {
    "width": 19,
    "height": 19,
    "star_points": [[3,3], [3,9], [3,15], [9,3], [9,9], [9,15], [15,3], [15,9], [15,15]]
  },
  "appearance": {
    "background_color": "#dcb35c",
    "line_color": "#5c3a1e",
    "star_point_color": "#5c3a1e",
    "grid": {
      "line_thickness": 0.02,
      "show_horizontal": true,
      "show_vertical": true
    },
    "layout": {
      "viewbox_padding_left": 0.5,
      "viewbox_padding_right": 0.5,
      "viewbox_padding_top": 0.5,
      "viewbox_padding_bottom": 0.5
    }
  }
}
```

**rules.json**：
```json
{
  "win_conditions": {
    "five_in_a_row": {
      "enabled": true,
      "display_name": "五连获胜",
      "icon": "⭐",
      "description": "在任意方向连成五子",
      "priority": 1,
      "category": "victory"
    },
    "capture_limit": {
      "enabled": false,
      "display_name": "提子获胜",
      "icon": "⚫",
      "description": "提子达到指定数量",
      "priority": 2,
      "category": "victory"
    }
  },
  "special_rules": {
    "ko_rule": { "enabled": true, "description": "禁止同形反复" },
    "suicide_rule": { "enabled": true, "description": "禁止自杀落子" },
    "forbidden_moves": { "enabled": true, "description": "黑方禁手（三三、四四、长连）" }
  },
  "turn_rules": { "turn_order": "alternating", "first_player": "black" },
  "ai_difficulty": {
    "current": "medium",
    "levels": {
      "easy": { "depth": 2, "randomness": 0.3 },
      "medium": { "depth": 3, "randomness": 0.1 },
      "hard": { "depth": 4, "randomness": 0.0 }
    },
    "personality": {
      "type": "normal",
      "aggressiveness": 0.5,
      "conservatism": 0.5,
      "randomness_override": null,
      "depth_override": null,
      "value_biases": {},
      "custom_prompt": null
    }
  }
}
```

**board_state.json**：
```json
{
  "_metadata": {
    "version": "1.0",
    "format": "go_standard"
  },
  "pieces": [],
  "current_turn": "black",
  "move_history": [],
  "ko_state": null,
  "captures": { "black": 0, "white": 0 },
  "game_status": {
    "state": "playing",
    "winner": null,
    "win_condition": null,
    "custom_rules_active": []
  },
  "mechanisms": {
    "skip_turns": [],
    "ai_control": [],
    "player_control": [],
    "random_moves": [],
    "extra_turns": [],
    "move_limits": []
  }
}
```

---

## 三、详细开发步骤

### 步骤1：创建文件夹结构并复制可复用文件

- 创建 go/ 目录
- 复制 ai_orchestrator.py, mechanism_engine.py, requirements.txt
- 创建 configs/ 和 static/ 子目录

### 步骤2：创建围棋配置文件

- board.json - 19x19棋盘、星位配置
- board_state.json - 初始空棋盘、ko_state、captures
- pieces_red.json / pieces_black.json - 简化配置（仅stone类型）
- rules.json - 围棋规则（五连获胜、打劫、禁手）
- ui_config.json - 围棋主题（木质棋盘、黑白棋子）
- initial/ 备份目录

### 步骤3：重写规则引擎

实现顺序：
1. 落子验证（位置是否为空、是否在棋盘内）
2. 气数计算（BFS连通分量）
3. 提子逻辑（无气棋串移除）
4. 打劫规则（同形检测）
5. 禁手规则（三三、四四、长连）
6. 五连检测

### 步骤4：重写围棋AI引擎

1. Minimax算法框架
2. 启发式评估函数
3. 位置价值表
4. 难度调节

### 步骤5：创建main.py

1. 修改API端点为落子逻辑
2. 移除象棋特有逻辑
3. 添加围棋特有逻辑（提子、打劫、禁手）

### 步骤6：重写提示词

1. 围棋版本的所有提示词
2. 简化棋子类型
3. 围棋规则说明

### 步骤7：创建前端文件

1. 19x19棋盘渲染（SVG网格、星位）
2. 圆形黑白棋子渲染
3. 点击落子交互
4. 围棋风格样式

### 步骤8：测试验证

1. 启动服务
2. 验证基本落子
3. 验证提子
4. 验证打劫
5. 验证禁手
6. 验证五连获胜

---

## 四、技术难点与解决方案

### 4.1 气数计算

**问题**：围棋的气数计算需要高效的连通分量算法

**解决方案**：
- 使用BFS查找同色连通棋子
- 统计棋串周围的空格数
- 缓存棋串气数，减少重复计算

### 4.2 打劫规则

**问题**：需要检测同形反复

**解决方案**：
- 在board_state中保存上一步的棋盘状态（hash值或完整状态）
- 落子后计算新状态的hash值
- 与上一步状态比较，相同则判定为打劫

### 4.3 禁手规则

**问题**：黑方禁手检测复杂（三三、四四、长连）

**解决方案**：
- 定义活三、冲四、活四的模式
- 落子后检查四个方向是否形成禁手模式
- 使用位运算或字符串匹配检测模式

### 4.4 AI搜索空间大

**问题**：19x19棋盘有361个交叉点，搜索空间极大

**解决方案**：
- 限制搜索深度（最多4层）
- 使用Alpha-Beta剪枝
- 启发式评估函数优化
- 优先搜索靠近现有棋子的位置

### 4.5 前端渲染性能

**问题**：19x19棋盘共有361个交叉点

**解决方案**：
- 使用SVG渲染网格线和星位
- DOM操作优化（批量创建元素）
- 棋子使用CSS定位

---

## 五、文件修改对照表

| 文件 | 状态 | 修改内容 |
|------|------|----------|
| ai_orchestrator.py | 复用 | 修改prompts导入路径 |
| mechanism_engine.py | 复用 | 无需修改 |
| requirements.txt | 复用 | 无需修改 |
| rule_engine.py | 重写 | 围棋规则引擎（落子、气、提子、打劫、禁手、五连） |
| chess_ai.py | 重写 | 围棋AI引擎（Minimax + 启发式评估） |
| main.py | 修改 | 落子API端点、移除象棋逻辑 |
| prompts.py | 重写 | 围棋提示词 |
| configs/board.json | 重写 | 19x19棋盘、星位 |
| configs/board_state.json | 重写 | 空棋盘、ko_state、captures |
| configs/pieces_red.json | 简化 | 仅stone类型（白子） |
| configs/pieces_black.json | 简化 | 仅stone类型（黑子） |
| configs/rules.json | 重写 | 围棋规则（五连、打劫、禁手） |
| configs/ui_config.json | 重写 | 围棋主题（木质棋盘、黑白棋子） |
| static/index.html | 修改 | 标题、提示示例 |
| static/app.js | 修改 | 棋盘渲染、落子交互 |
| static/style.css | 修改 | 围棋棋盘、棋子样式 |

---

## 六、测试验证清单

### 功能测试

- [ ] 玩家落子
- [ ] AI自动走棋
- [ ] 提子（吃子）
- [ ] 打劫禁止
- [ ] 自杀禁止
- [ ] 黑方禁手（三三、四四、长连）
- [ ] 五连获胜
- [ ] 悔棋
- [ ] 重新开始
- [ ] AI性格修改
- [ ] 机制引擎（冻结、AI接管等）

### API测试

- [ ] /api/move - 落子
- [ ] /api/ai_move - AI走棋
- [ ] /api/valid_moves - 合法位置
- [ ] /api/command - 自然语言指令
- [ ] /api/restart - 重新开始
- [ ] /api/undo - 悔棋

### UI测试

- [ ] 棋盘渲染（19x19、星位）
- [ ] 棋子渲染（黑白圆形）
- [ ] 落子动画
- [ ] 最后落子标记
- [ ] 游戏结束界面
- [ ] 响应式布局

---

## 七、完成标准

1. ✅ 围棋项目文件夹创建完成
2. ✅ 所有配置文件创建完成
3. ✅ 规则引擎实现围棋核心规则（落子、气、提子、打劫、禁手、五连）
4. ✅ AI引擎实现围棋对弈
5. ✅ 前端界面完整可用（19x19棋盘、黑白棋子、落子交互）
6. ✅ 基本功能测试通过

---

*计划版本：v1.0*
*创建日期：2025年*