# 五子棋 Bug 修复计划

## 问题分析

### Bug 1：玩家落子后AI无反应，且玩家可以连下好几个子

**根本原因**：

1. **前端落子逻辑与后端接口不匹配**：
   - 前端 `executeMove` 方法调用 `/api/move` 时传递 `{ piece_id, to: [x, y] }`
   - 后端 `/api/move` 接口期望 `{ to: [x, y] }`（五子棋是落子，不是移动已有棋子）
   - 导致请求参数错误，落子失败

2. **棋盘空白处点击未处理落子**：
   - `bindEvents` 中点击棋盘容器时，如果没有选中棋子且没有有效移动，只调用 `clearSelection()`
   - 五子棋不需要选中棋子，应该直接在空白处落子

3. **玩家回合检查缺失**：
   - 棋盘点击时没有检查当前是否是玩家回合，导致玩家可以连下

4. **AI走棋触发失败**：
   - 由于落子请求参数错误，`executeMove` 返回失败，`makeAIMove()` 不会被调用

### Bug 2：五连珠检测逻辑有误

**根本原因**：

`rule_engine.py` 的 `check_five_in_a_row` 方法只检查一个方向，没有检查反方向：

```python
# 当前错误逻辑
for dx, dy in directions:
    count = 1
    nx, ny = x + dx, y + dy
    while 0 <= nx < width and 0 <= ny < height and board.get((nx, ny)) == side:
        count += 1
        nx += dx
        ny += dy
    if count >= 5:
        return side
```

这个实现只从(x,y)向正方向检查，没有向反方向(-dx, -dy)检查，导致无法正确检测中间位置开始的五连珠。

## 修复方案

### 修改文件列表

| 文件 | 修改内容 | 优先级 |
|------|----------|--------|
| `wuziqi/rule_engine.py` | 修复 `check_five_in_a_row` 方法，双向检测五连珠 | 高 |
| `wuziqi/static/app.js` | 修复落子逻辑：添加空白处点击落子、修正API参数、添加回合检查 | 高 |

### 详细修改步骤

#### 步骤 1：修复 rule_engine.py 的五连珠检测

修改 `check_five_in_a_row` 方法，参考 `chess_ai.py` 中的 `_check_five_at` 实现，向两个方向检查。

**修改前**：
```python
def check_five_in_a_row(self, board_state: dict) -> Optional[str]:
    ...
    for dx, dy in directions:
        count = 1
        nx, ny = x + dx, y + dy
        while 0 <= nx < width and 0 <= ny < height and board.get((nx, ny)) == side:
            count += 1
            nx += dx
            ny += dy
        if count >= 5:
            return side
```

**修改后**：
```python
def check_five_in_a_row(self, board_state: dict) -> Optional[str]:
    ...
    for dx, dy in directions:
        count = 1
        # 正方向检查
        nx, ny = x + dx, y + dy
        while 0 <= nx < width and 0 <= ny < height and board.get((nx, ny)) == side:
            count += 1
            nx += dx
            ny += dy
        # 反方向检查
        nx, ny = x - dx, y - dy
        while 0 <= nx < width and 0 <= ny < height and board.get((nx, ny)) == side:
            count += 1
            nx -= dx
            ny -= dy
        if count >= 5:
            return side
```

#### 步骤 2：修复前端 app.js 的落子逻辑

**修改内容**：

1. **添加空白处落子处理**：修改 `bindEvents` 中棋盘点击事件，当点击空白格子时直接调用落子方法

2. **创建新的落子方法**：添加 `placeStone(x, y)` 方法，直接调用 `/api/move` 接口，参数为 `{ to: [x, y] }`

3. **添加回合检查**：在落子前检查当前是否是玩家回合

4. **修改 `executeMove` 方法**：修正API调用参数，移除 `piece_id`

**关键修改点**：

- 在 `bindEvents` 的棋盘点击事件中添加空白处落子逻辑
- 创建 `placeStone(x, y)` 方法，直接调用 `/api/move`
- 在落子前调用 `_isCurrentTurnPlayerControlled()` 检查

### 风险与注意事项

1. **兼容性风险**：修改 `executeMove` 方法可能影响其他调用方（如象棋），需要确保只修改五子棋的落子逻辑
2. **测试验证**：修复后需要测试：
   - 玩家落子后AI是否自动回应
   - 玩家是否只能在自己回合落子
   - 五连珠检测是否正确（横、竖、斜四个方向）
   - 游戏结束判定是否正确

## 验证方案

修复完成后，启动五子棋服务进行测试：

1. **启动服务**：`cd /workspace/wuziqi && python main.py`
2. **访问**：打开浏览器访问 `http://localhost:8001`
3. **测试用例**：
   - 玩家落子 → AI应自动回应
   - 玩家连续点击 → 只能在自己回合落子，AI回合时提示"当前不是您的回合"
   - 横向五连 → 游戏结束，正确方获胜
   - 纵向五连 → 游戏结束，正确方获胜
   - 斜向五连（两个方向）→ 游戏结束，正确方获胜
   - 不足五个连续子 → 游戏继续