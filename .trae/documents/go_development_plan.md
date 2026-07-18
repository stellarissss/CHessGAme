# 无限制围棋 - 完整开发计划

## 一、项目概述

基于"无限制象棋"的架构，开发"无限制围棋"游戏。围棋与象棋的核心区别在于：
- 棋盘：19×19网格，带星位
- 棋子：只有黑子和白子，无移动规则
- 规则：落子、气的计算、提子、打劫、禁手、五连获胜

## 二、项目结构

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
│   ├── board.json
│   ├── board_state.json
│   ├── pieces_black.json
│   ├── pieces_red.json
│   ├── rules.json
│   └── ui_config.json
├── static/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── ai_orchestrator.py      # 复用象棋（需修改导入的prompts）
├── chess_ai.py            # 重写为围棋AI
├── main.py                # 修改API端点为落子逻辑
├── mechanism_engine.py    # 复用象棋
├── prompts.py             # 重写为围棋版本
├── requirements.txt       # 复用象棋
├── rule_engine.py         # 重写为围棋规则引擎
└── README.md
```

## 三、核心修改方案

### 3.1 规则引擎 (rule_engine.py)

围棋规则引擎需要实现：
- `get_valid_moves(board_state, side)` - 获取所有合法落子位置
- `place_stone(board_state, x, y, side)` - 落子并处理提子
- `calculate_liberties(board_state, x, y)` - 计算棋串气数
- `remove_group(board_state, x, y)` - 移除无气棋串
- `is_ko(board_state, x, y, side)` - 检查是否为打劫
- `is_forbidden(board_state, x, y, side)` - 检查是否为禁手（仅黑方）
- `check_five_in_a_row(board_state)` - 检查五连获胜

### 3.2 AI引擎 (chess_ai.py)

围棋AI需要实现：
- Minimax + Alpha-Beta剪枝
- 启发式评估函数：
  - 位置价值表（角、边、中央）
  - 气数评估
  - 连接性评估
  - 领地控制评估

### 3.3 主服务器 (main.py)

主要修改：
- `/api/move` - 从移动棋子改为落子
- `/api/valid_moves` - 返回空位置而非棋子的移动位置
- 移除与棋子移动相关的逻辑

### 3.4 提示词 (prompts.py)

完全重写为围棋版本：
- INTENT_PARSER_SYSTEM - 围棋意图解析
- RULE_MODIFIER_SYSTEM - 围棋规则修改
- BOARD_TRANSFORMER_SYSTEM - 棋盘状态管理
- 移除象棋特有的棋子类型和移动规则说明

### 3.5 前端文件

修改前端以适配围棋：
- index.html - 修改标题、提示示例
- app.js - 修改棋盘渲染（19×19网格、星位）、棋子渲染（圆形黑白棋子）、交互逻辑（点击落子）
- style.css - 修改棋盘背景、棋子样式

### 3.6 配置文件

重写所有配置文件：
- board.json - 19×19网格、星位配置
- board_state.json - 空棋盘初始状态、ko_state、captures
- pieces_red.json / pieces_black.json - 简化为只有"stone"类型
- rules.json - 围棋规则（五连获胜、打劫、禁手）
- ui_config.json - 围棋主题颜色

## 四、详细开发步骤

### 步骤1：创建文件夹结构并复制可复用文件
- 创建 go/ 目录
- 复制 ai_orchestrator.py, mechanism_engine.py, requirements.txt
- 创建 configs/ 和 static/ 子目录

### 步骤2：创建围棋配置文件
- board.json - 19×19棋盘、星位
- board_state.json - 初始空棋盘
- pieces_red.json / pieces_black.json - 简化配置
- rules.json - 围棋规则
- ui_config.json - 围棋主题

### 步骤3：重写规则引擎
- 实现气数计算
- 实现提子逻辑
- 实现打劫规则
- 实现禁手规则
- 实现五连检测

### 步骤4：重写围棋AI引擎
- Minimax算法
- 启发式评估函数
- 位置价值表

### 步骤5：创建main.py
- 修改API端点
- 落子逻辑
- AI走棋

### 步骤6：重写提示词
- 围棋版本的所有提示词

### 步骤7：创建前端文件
- 19×19棋盘渲染
- 圆形黑白棋子
- 星位显示

### 步骤8：测试验证
- 启动服务
- 验证基本落子
- 验证提子
- 验证打劫
- 验证五连获胜

## 五、技术难点与解决方案

### 5.1 气数计算
- 使用BFS/DFS查找连通棋串
- 计算棋串周围的空格数

### 5.2 打劫规则
- 在board_state中记录上一步提子状态
- 落子前检查是否形成打劫局面

### 5.3 禁手规则
- 检测三三禁手（黑方）
- 检测四四禁手（黑方）
- 检测长连禁手（黑方）

### 5.4 AI搜索空间大
- 剪枝优化
- 启发式评估函数
- 限制搜索深度

### 5.5 前端渲染性能
- 19×19棋盘共有361个交叉点
- 使用SVG渲染网格线和星位
- DOM操作优化

## 六、文件修改对照表

| 文件 | 状态 | 修改内容 |
|------|------|----------|
| ai_orchestrator.py | 复用 | 修改prompts导入路径 |
| mechanism_engine.py | 复用 | 无需修改 |
| requirements.txt | 复用 | 无需修改 |
| rule_engine.py | 重写 | 围棋规则引擎 |
| chess_ai.py | 重写 | 围棋AI引擎 |
| main.py | 修改 | 落子API端点 |
| prompts.py | 重写 | 围棋提示词 |
| configs/board.json | 重写 | 19×19棋盘 |
| configs/board_state.json | 重写 | 空棋盘、ko_state |
| configs/pieces_red.json | 简化 | 仅stone类型 |
| configs/pieces_black.json | 简化 | 仅stone类型 |
| configs/rules.json | 重写 | 围棋规则 |
| configs/ui_config.json | 重写 | 围棋主题 |
| static/index.html | 修改 | 标题、提示 |
| static/app.js | 修改 | 棋盘渲染、交互 |
| static/style.css | 修改 | 棋盘、棋子样式 |

## 七、测试验证清单

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
- [ ] 棋盘渲染（19×19、星位）
- [ ] 棋子渲染（黑白圆形）
- [ ] 落子动画
- [ ] 最后落子标记
- [ ] 游戏结束界面
- [ ] 响应式布局

## 八、完成标准

1. 围棋项目文件夹创建完成
2. 所有配置文件创建完成
3. 规则引擎实现围棋核心规则
4. AI引擎实现围棋对弈
5. 前端界面完整可用
6. 基本功能测试通过

---

*计划版本：v1.0*
*创建日期：2024年*
