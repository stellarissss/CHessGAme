# 无限制围棋开发计划

## 1. 项目概述

### 1.1 目标
基于"无限制象棋"的架构，开发"无限制围棋"项目。目标是打造一个AI自由修改规则的围棋引擎，支持自然语言指令修改规则、棋盘、机制等。

### 1.2 围棋与象棋的核心差异

| 维度 | 象棋 | 围棋 |
|------|------|------|
| 棋盘 | 9x10，有河界、九宫格 | 19x19（或9x9、13x13），纯网格 |
| 棋子 | 多种类型，可移动 | 只有黑/白两种，落子后不能移动 |
| 吃子 | 直接吃掉对方棋子 | 通过围杀提子 |
| 胜利条件 | 将死对方将帅 | 围地计分或提子数 |
| 核心机制 | 移动规则、将军、飞将 | 提子、打劫、禁手、气的计算 |

### 1.3 项目结构
```
/workspace/go/
├── configs/
│   ├── initial/          # 初始配置备份
│   ├── board.json        # 棋盘几何定义
│   ├── board_state.json  # 棋盘状态
│   ├── pieces_black.json # 黑方棋子规则（围棋中简化）
│   ├── pieces_red.json   # 白方棋子规则（围棋中简化）
│   ├── rules.json        # 游戏规则
│   └── ui_config.json    # UI配置
├── static/
│   ├── index.html        # 前端页面
│   ├── app.js            # 前端逻辑
│   └── style.css         # 样式
├── ai_orchestrator.py    # AI编排器（复用象棋）
├── chess_ai.py           # 围棋AI引擎（需重写）
├── main.py               # FastAPI入口（需修改）
├── mechanism_engine.py   # 机制引擎（复用象棋）
├── prompts.py            # AI提示词（需重写）
├── requirements.txt      # 依赖
├── rule_engine.py        # 规则引擎（需重写）
├── README.md             # 项目说明
└── 无限制围棋_完整计划书_v1.0.md  # 完整计划书
```

---

## 2. 开发步骤

### 步骤1：创建文件夹结构

复制xiangqi的核心文件到go文件夹，保留以下文件：
- `ai_orchestrator.py` - AI编排器（可复用）
- `mechanism_engine.py` - 机制引擎（可复用）
- `main.py` - 需要修改
- `chess_ai.py` - 需要重写为GoAI
- `rule_engine.py` - 需要重写
- `prompts.py` - 需要重写
- `requirements.txt` - 可复用
- `configs/` - 需要完全重写配置文件
- `static/` - 需要修改前端

### 步骤2：重写规则引擎 (rule_engine.py)

围棋规则引擎需要实现：
1. **落子验证**：检查位置是否为空、是否在棋盘内
2. **气的计算**：计算棋子或棋串的气数
3. **提子判定**：当棋串气数为0时提子
4. **打劫规则**：防止同形反复
5. **禁手规则**：三三禁手、四四禁手、长连禁手（针对黑方）
6. **自杀规则**：禁止自杀落子（除非能提子）
7. **胜利条件检查**：连续5子（简化版）或围地计分

核心方法：
```python
def get_valid_moves(self, board_state: dict, side: str) -> List[List[int]]:
    """获取所有合法落子位置"""

def place_stone(self, board_state: dict, x: int, y: int, side: str) -> dict:
    """落子并处理提子"""

def calculate_liberties(self, board_state: dict, x: int, y: int) -> int:
    """计算某个棋子所在棋串的气数"""

def remove_group(self, board_state: dict, x: int, y: int) -> int:
    """移除没有气的棋串，返回提子数"""

def is_ko(self, board_state: dict, x: int, y: int, side: str) -> bool:
    """检查是否为打劫"""

def is_forbidden(self, board_state: dict, x: int, y: int, side: str) -> bool:
    """检查是否为禁手"""

def check_win(self, board_state: dict) -> Optional[str]:
    """检查是否获胜"""
```

### 步骤3：重写围棋AI引擎 (chess_ai.py → GoAI)

围棋AI需要特殊处理：
1. 使用蒙特卡洛树搜索(MCTS)或Minimax + 启发式评估
2. 评估函数需要考虑：
   - 棋子位置价值（边角、星位、天元等）
   - 气的数量和稳定性
   - 领地控制
   - 连接性和影响力

### 步骤4：修改main.py

主要修改：
1. API端点修改：`/api/move` 改为落子而非移动棋子
2. 移除象棋特有的逻辑（将军、困毙等）
3. 添加围棋特有逻辑（提子、打劫、禁手）
4. 修改AI走棋逻辑

### 步骤5：重写提示词 (prompts.py)

针对围棋特点重写提示词：
1. **棋子类型**：简化为stone（黑/白）
2. **规则描述**：围棋规则（提子、打劫、气）
3. **修改操作**：修改棋盘大小、禁手规则、胜利条件等

### 步骤6：重写配置文件

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
    "star_point_color": "#5c3a1e"
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
      "description": "在任意方向连成五子"
    },
    "capture_limit": {
      "enabled": false,
      "display_name": "提子获胜",
      "description": "提子达到指定数量"
    }
  },
  "special_rules": {
    "ko_rule": { "enabled": true },
    "suicide_rule": { "enabled": true },
    "forbidden_moves": { "enabled": true }
  }
}
```

**pieces_red.json / pieces_black.json**：
简化为只有stone类型

**board_state.json**：
空棋盘，无初始棋子

### 步骤7：修改前端

**index.html**：
- 修改标题为"无限制围棋"
- 修改界面元素名称

**app.js**：
- 修改棋子渲染为圆形棋子（黑/白）
- 修改点击逻辑为落子而非移动
- 添加禁手提示、打劫提示
- 修改胜利显示

**style.css**：
- 修改棋盘样式为围棋风格
- 修改棋子样式为黑白圆形

---

## 3. 关键技术挑战

### 3.1 规则引擎设计
围棋的规则比象棋复杂，特别是气的计算和打劫规则。需要实现高效的连通分量算法来计算棋串的气。

### 3.2 AI引擎设计
围棋状态空间极大，传统Minimax难以应对。需要实现：
- MCTS（蒙特卡洛树搜索）
- 启发式评估函数
- 位置价值表

### 3.3 无限制规则扩展
支持通过AI修改围棋规则：
- 修改棋盘大小（9x9, 13x13, 19x19）
- 修改禁手规则
- 修改胜利条件（五连、七连、围地等）
- 添加特殊机制（如"超级棋"、"炸弹棋"等）

---

## 4. 开发时间表

| 阶段 | 内容 | 预计工作量 |
|------|------|-----------|
| 阶段1 | 创建文件夹结构，复制核心文件 | 1天 |
| 阶段2 | 重写规则引擎（落子、气、提子、打劫、禁手） | 2-3天 |
| 阶段3 | 重写围棋AI引擎（MCTS/启发式） | 2-3天 |
| 阶段4 | 修改main.py和API端点 | 1天 |
| 阶段5 | 重写提示词和配置文件 | 1天 |
| 阶段6 | 修改前端（HTML/JS/CSS） | 2天 |
| 阶段7 | 测试和调试 | 2天 |

---

## 5. 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| 规则引擎复杂度高 | 中 | 高 | 先实现基础规则（落子、提子），再逐步添加复杂规则（打劫、禁手） |
| AI性能不足 | 高 | 中 | 使用MCTS+启发式，限制搜索深度 |
| 前端交互复杂 | 低 | 中 | 参考象棋前端结构，简化围棋交互（点击落子） |
| 配置文件兼容性 | 低 | 低 | 严格按照JSON schema定义配置格式 |

---

## 6. 依赖关系

- **共享模块**：`shared/schema_validator.py`, `shared/json_patch_utils.py`
- **AI服务**：DeepSeek API（用于意图解析和代码生成）
- **前端技术**：HTML5, CSS3, JavaScript (ES6+)
- **后端技术**：FastAPI, Python 3.8+

---

## 7. 验证标准

1. ✅ 围棋基本规则正常运行（落子、提子、打劫）
2. ✅ AI能够自动下棋
3. ✅ 自然语言指令能够修改规则
4. ✅ 前端界面美观、交互流畅
5. ✅ 项目能够独立启动运行

---

## 8. 后续扩展

1. 实现完整的围棋规则（目数计算、终局判定）
2. 添加更多AI算法（AlphaZero风格）
3. 支持多人联机对战
4. 实现复盘和注释功能
5. 添加RPG元素（角色、剧情、地图）

---

*文档版本：v1.0*  
*创建日期：2025-01-01*