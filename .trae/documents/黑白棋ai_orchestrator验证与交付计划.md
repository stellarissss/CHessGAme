# 黑白棋 ai_orchestrator.py 验证与交付计划

## 背景与现状

原始任务：将 `/workspace/xiangqi/ai_orchestrator.py`（2378 行，象棋版）复制并改造为 `/workspace/heibaiqi/ai_orchestrator.py`（黑白棋版）。

经过 Phase 1 探索确认，**主体改造工作已完成**，关键事实如下：

| 检查项 | 状态 | 证据 |
|--------|------|------|
| `_get_board_summary` 重写 | ✅ 已完成 | 行 614-679，8×8 矩阵 + 棋子统计 + 合法落子点 + 游戏状态 + 激活机制 |
| `_compute_valid_placements` + `_builtin_valid_placements` | ✅ 已完成 | 行 681-768，8 方向夹吃检测 |
| `_handle_a1_hardcoded` | ✅ 已适配 | 行 873-957，undo_move（删落子+恢复翻转+切换回合）、set_winner（black/white/draw）|
| `_handle_a2_mechanism` | ✅ 已适配 | black/white 替换（grep 确认无残留红方逻辑）|
| `_validate_board` | ✅ 已适配 | 行 2091-2206，委托 `validate_board_state`，方法内无 9×10/九宫硬编码 |
| `_validate_rules` | ✅ 已适配 | 行 2208-2210，委托 `validate_pieces` |
| `_validate_rule_change` | ✅ 已适配 | 行 2212-2261，单阵营 pieces 结构，无 side_overrides |
| `_call_code_ai_with_validation` | ✅ 已适配 | max_retries=2、temp +0.1 cap 0.3、rule_change_check 用 `config_name == "pieces" or config_name.startswith("pieces_")` |
| `_hard_validate_config` | ✅ 已适配 | pieces 分支覆盖 pieces_black/pieces_white/pieces_red |
| 全局文本替换 | ✅ 已完成 | "象棋/红方/checkmate/九宫"仅存 3 处解释性注释；"red"仅 2 处向后兼容（与 rule_engine red→black 别名一致）|
| `prompts.py` | ✅ 已创建 | 7 个导入常量齐全，black/white、disc、jump/ray/flip 三原语、8×8 语义 |
| 验证（最近一次） | ⚠️ 待重跑 | builtin fallback 编辑后未重新验证 |

**关键依赖事实**：
- `rule_engine.py` 已存在（668 行），但其 `get_valid_placements` 是 `RuleEngine` 类方法（非模块级函数），故 `_compute_valid_placements` 中 `getattr(rule_engine, "get_valid_placements", None)` 恒为 None，**始终走内置 fallback**。这是安全的预期行为。
- `configs/initial/` 为空目录，`configs/token_stats.json` 不存在但被 `__init__` 用 `.exists()` 守卫，不影响实例化。
- 内置 fallback 对标准初始位（白[3,3]/[4,4]、黑[4,3]/[3,4]、黑先）产出的合法落子点集合为 `{[2,3],[3,2],[4,5],[5,4]}`（按 y→x 迭代顺序输出为 `[3,2] [2,3] [5,4] [4,5]`）。

## 剩余工作（本计划执行内容）

仅 3 项收尾工作，无需进一步改造代码：

### 步骤 1：重新运行验证命令

**目的**：确认 builtin fallback 编辑未破坏模块导入与实例化。

**命令**：
```bash
cd /workspace/heibaiqi && python -c "from ai_orchestrator import AIOrchestrator; o=AIOrchestrator(); print('OK')"
```

**预期输出**：`OK`

**若失败的处置**：根据报错定位（最可能为 prompts.py 常量缺失或语法错误），修复后重跑。不重试相同方法超过 2 次。

### 步骤 2：生成 `_get_board_summary` 示例输出

**目的**：用标准黑白棋初始局面验证 `_get_board_summary` 的实际输出格式。

**方法**：编写一次性 Python 脚本，构造样本 `board_state` 并调用方法，捕获 stdout。

**样本 board_state**：
```python
board_state = {
    "board": {"width": 8, "height": 8},
    "current_turn": "black",
    "game_status": {"state": "playing"},
    "mechanisms": {},
    "pieces": [
        {"id": "w1", "type": "disc", "side": "white", "position": [3, 3], "is_alive": True},
        {"id": "w2", "type": "disc", "side": "white", "position": [4, 4], "is_alive": True},
        {"id": "b1", "type": "disc", "side": "black", "position": [4, 3], "is_alive": True},
        {"id": "b2", "type": "disc", "side": "black", "position": [3, 4], "is_alive": True},
    ],
}
```

**脚本**（在 `/workspace/heibaiqi/ 下执行，确保能 import）：
```python
python -c "
import sys; sys.path.insert(0, '.')
from ai_orchestrator import AIOrchestrator
o = AIOrchestrator()
board = {
    'board': {'width': 8, 'height': 8},
    'current_turn': 'black',
    'game_status': {'state': 'playing'},
    'mechanisms': {},
    'pieces': [
        {'id': 'w1', 'type': 'disc', 'side': 'white', 'position': [3, 3], 'is_alive': True},
        {'id': 'w2', 'type': 'disc', 'side': 'white', 'position': [4, 4], 'is_alive': True},
        {'id': 'b1', 'type': 'disc', 'side': 'black', 'position': [4, 3], 'is_alive': True},
        {'id': 'b2', 'type': 'disc', 'side': 'black', 'position': [3, 4], 'is_alive': True},
    ],
}
print(o._get_board_summary(board))
"
```

**预期输出**（实际合法落子点顺序为 y→x 迭代：[3,2] [2,3] [5,4] [4,5]）：
```
当前回合：黑方
棋盘状态（8×8，●=黑 ○=白 .=空）：
  0 1 2 3 4 5 6 7
0 . . . . . . . .
1 . . . . . . . .
2 . . . . . . . .
3 . . . ○ ● . . .
4 . . . ● ○ . . .
5 . . . . . . . .
6 . . . . . . . .
7 . . . . . . . .

棋子统计：黑方 2 子，白方 2 子
合法落子点（当前方）：[3,2] [2,3] [5,4] [4,5]
游戏状态：playing
激活机制：无
```

### 步骤 3：撰写最终交付报告

**目的**：按用户要求返回「写入的文件路径 + 关键改动点摘要 + `_get_board_summary` 示例输出」。

**报告内容结构**：
1. 写入的文件路径：`/workspace/heibaiqi/ai_orchestrator.py`、`/workspace/heibaiqi/prompts.py`
2. 关键改动点摘要（基于 Phase 1 探索确认的实际改动）
3. `_get_board_summary` 实际示例输出（取自步骤 2 真实运行结果）

## 假设与决策

- **假设**：builtin fallback 编辑仅新增方法、未触碰导入语句与既有方法签名，因此验证失败概率极低。若失败，优先检查 prompts.py。
- **决策**：示例输出使用真实运行结果而非任务描述中的预期顺序（实际顺序为 `[3,2] [2,3] [5,4] [4,5]`，因内置 fallback 按 y→x 迭代）。落子点集合与预期完全一致，仅排列顺序不同——这是可接受的正确行为。
- **决策**：不修改 `rule_engine.py` 以暴露模块级 `get_valid_placements`——这超出本任务范围（rule_engine 改造是独立任务），且内置 fallback 已能正确工作。
- **决策**：不创建任何新文件（prompts.py 与 ai_orchestrator.py 已存在），仅运行验证与示例脚本。

## 验证步骤

1. 步骤 1 命令输出 `OK` → 模块可正常导入与实例化
2. 步骤 2 脚本输出符合预期格式（8×8 矩阵、4 子统计、4 个合法落子点、playing 状态、无机制）
3. 步骤 3 报告包含三项必需内容
