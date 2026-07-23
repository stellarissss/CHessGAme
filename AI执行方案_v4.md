# 棋圣 · 六道轮回 Roguelike · AI 执行方案

> **v4.0 · 识破重构与节奏压缩版**
> 将 v4.0 设计文档落地为可运行的代码。

---

## 一、执行前必读（给 AI Agent 的提示词）

```
你是负责实现"棋圣 · 六道轮回 Roguelike"大游戏的 AI Agent。

在开始任何编码工作之前，你必须：

1. **阅读项目 README.md**（/workspace/README.md），理解项目整体架构、6 个棋类的关系、"灵活编码"原则。
2. **阅读 v4.0 设计文档**（/workspace/docs/design/六道轮回_roguelike设计_v4.md），完全理解所有机制。
3. **阅读项目架构说明**（/workspace/xiangqi/无限制象棋_完整计划书_v4.0.md 的第 1-3 章），理解统一骨架、规则引擎、AI 编排器、机制引擎。
4. **阅读各棋类的 configs/ 和 main.py**，理解现有数据结构。

**"灵活编码"原则**是项目的灵魂——玩家用自然语言指令，AI 现场生成代码改规则。你实现的所有新系统都必须兼容这个核心机制。

**（必须特别注意）**：
1. **识破概率只在业力透支时才增加**——正常使用业力（消耗 ≤ 当前业力）不增加识破概率
2. **业力消耗回复量均大**——参考示例：改一个马为炮=40点，改两个马为炮=80点
4. **关卡完全预制**——不使用 AI 生成，从数据库/网上搜索获取残局
5. **每道至少 3 个正常棋局**——由易到难排列

**你的工作分阶段进行**：
- Phase 1：基础设施（samsara/ 目录 + 核心系统）
- Phase 2：数据配置（关卡池 + 残局数据库 + 目标 Schema）
- Phase 3：规则引擎扩展（win_conditions + board appearance）
- Phase 4：各棋类集成（业力事件钩子 + 目标判定钩子 + 20 回合限制）
- Phase 5：前端改造
- Phase 6：测试与调优

**严禁**：
- 不阅读文档就开始编码
- 修改各棋类的核心引擎逻辑（rule_engine.py, chess_ai.py, ai_orchestrator.py）
- 遗漏任何棋类（6 个都要改）
- 遗漏任何关卡（每道至少 5 关，3 个正常棋局）
- 使用 AI 生成残局（必须从数据库/网上搜索获取）

**每完成一个模块，你必须**：
1. 自测验证
2. 记录完成情况
```

---

## 二、工作清单（总览）

### Phase 1：基础设施（约 40% 工作量）

| # | 工作项 | 文件/目录 | 优先级 | 依赖 |
|:-:|:-|:-|:-:|-|
| 1.1 | 创建 `samsara/` 目录结构 | `samsara/` | 高 | 无 |
| 1.2 | 实现轮回元状态管理 | `samsara/state.py` | 高 | 1.1 |
| 1.3 | 实现业力系统（计算/事件回复/透支/退还） | `samsara/karma.py` | 高 | 1.1 |
| 1.4 | 实现 AI 业力评估模块（含具体示例 prompt） | `samsara/karma_assessor.py` | 高 | 1.1 |
| 1.5 | 实现识破概率系统（**仅透支时增加**） | `samsara/detection.py` | 高 | 1.1 |
| 1.6 | 实现 Boss 技能系统 | `samsara/bosses.py` | 高 | 1.1 |
| 1.7 | 实现技能树系统 | `samsara/skills.py` | 高 | 1.1 |
| 1.8 | 实现升降道与技能点获取 | `samsara/progression.py` | 高 | 1.2-1.7 |
| 1.9 | 实现关卡管理（全预制，无随机） | `samsara/levels.py` | 高 | 1.1 |
| 1.10 | 实现多样化目标判定引擎 | `samsara/objectives.py` | 高 | 1.1 |
| 1.11 | 实现 20 回合限制系统 | `samsara/turn_limit.py` | 高 | 1.1 |
| 1.12 | 实现 FastAPI 路由 | `samsara/api.py` | 高 | 1.2-1.11 |
| 1.13 | 挂载到总坛 hub | `samsara/main.py` | 高 | 1.12 |

### Phase 2：数据配置（约 20% 工作量）

| # | 工作项 | 文件/目录 | 优先级 | 依赖 |
|:-:|:-|:-|:-:|-|
| 2.1 | 创建 `configs/samsara_state.json` 模板 | `configs/` | 中 | 1.2 |
| 2.2 | 创建 `configs/boss_definitions.json` | `configs/` | 中 | 1.6 |
| 2.3 | 创建 `configs/skill_tree.json` | `configs/` | 中 | 1.7 |
| 2.4 | 创建 `configs/karma_events.json`（**提高后的值**） | `configs/` | 中 | 1.3 |
| 2.5 | 创建 `configs/level_pools.json`（**六道预制关卡定义**） | `configs/` | 高 | 1.9 |
| 2.6 | 创建 `configs/objective_types.json`（胜利条件 Schema） | `configs/` | 高 | 1.10 |
| 2.7 | 创建 `configs/formations.json`（阵型定义库） | `configs/` | 中 | 1.10 |
| 2.8 | **创建 `configs/puzzles.json`（预制残局数据库）** | `configs/` | 高 | 1.9 |

### Phase 3：规则引擎扩展（约 10% 工作量）

| # | 工作项 | 文件/目录 | 优先级 | 依赖 |
|:-:|:-|:-|:-:|-|
| 3.1 | 扩展 `rules.json` 支持 `win_conditions` 字段 | 各棋 `configs/rules.json` | 高 | 2.6 |
| 3.2 | 扩展 `board.json` 支持 `appearance` 字段（暗格/亮格） | 各棋 `configs/board.json` | 中 | 2.6 |
| 3.3 | 为每个棋类定义基础胜利条件（含 20 回合限制） | 6 棋 configs/ | 高 | 3.1 |
| 3.4 | 为关卡池中的特殊目标配置胜利条件 | `configs/level_pools.json` | 高 | 2.5, 3.1 |

### Phase 4：各棋类集成（约 25% 工作量）

**注意：6 个棋类都要改，一个都不能漏！每道至少 3 个正常棋局！**

对每个棋类（象棋/五子棋/围棋/动物棋/跳棋/黑白棋），需要：

| # | 工作项 | 说明 |
|:-:|:-|:-|
| 4.1 | **添加业力事件钩子** | 在吃子/将军/获胜等事件中调用 `samsara.karma.recover()`，**使用提高后的值** |
| 4.2 | **添加目标判定钩子** | 在每回合结束时调用 `samsara.objectives.check()` |
| 4.3 | **添加 20 回合限制钩子** | 在每回合开始时检查回合数，超限则失败 |
| 4.4 | **添加结算回调** | 游戏结束时调用 `samsara.progression.resolve()` |
| 4.5 | **修改 main.py** | 集成 samsara API，加载关卡配置 |
| 4.6 | **前端改造** | 添加业力条/识破概率条/目标进度条/Boss 技能图标/作弊预览/20 回合倒计时 |

### Phase 5：前端改造（约 15% 工作量）

| # | 工作项 | 文件/目录 | 优先级 | 依赖 |
|:-:|:-|:-|:-:|-|
| 5.1 | 改造 `hub/index.html` 为轮回之门 | `hub/` | 高 | 1.2-1.13 |
| 5.2 | 添加六道转轮图 | `hub/` | 中 | 5.1 |
| 5.3 | 添加关卡选择界面（全预制） | `hub/` | 高 | 5.1 |
| 5.4 | 添加业力条/识破概率条显示 | 各棋前端 | 高 | 1.3, 1.5 |
| 5.5 | 添加目标进度条 | 各棋前端 | 高 | 1.10 |
| 5.6 | **添加 20 回合倒计时** | 各棋前端 | 高 | 1.11 |
| 5.7 | 添加识破判定动画 | 各棋前端 | 中 | 1.5 |
| 5.8 | 添加目标达成动画 | 各棋前端 | 中 | 1.10 |
| 5.9 | 创建技能树可视化界面 | `hub/skills.html` | 中 | 1.7 |
| 5.10 | 添加作弊预览 UI | 各棋前端 | 高 | 1.4 |

### Phase 6：测试与调优（约 5% 工作量）

| # | 工作项 | 说明 |
|:-:|:-|:-|
| 6.1 | 测试业力评估 | 验证 AI 评估的稳定性，确保改一个马为炮≈40点 |
| 6.2 | 测试识破概率公式 | **验证正常使用业力不增加识破概率，只有透支时才增加** |
| 6.3 | 测试关卡加载 | 验证全预制关卡正确加载 |
| 6.4 | 测试 20 回合限制 | 验证超时判定 |
| 6.5 | 测试多样化目标判定 | 每种目标类型至少测试 1 次 |
| 6.6 | 测试 Boss 技能 | 每道 Boss 至少测试 1 次 |
| 6.7 | 测试技能树 | 验证技能效果 |
| 6.8 | 测试无 AI 通关奖励 | 验证 0 作弊检测 |
| 6.9 | 测试业力退还 | 验证失败时退还 |
| 6.10 | 测试轮回存档 | 验证跨轮回保留 |

---

## 三、技术架构详解

### 3.1 新增模块职责

```
samsara/
├── state.py           # 轮回元状态：当前道/关卡/业力/识破概率/技能点/技能树/存档读写
├── karma.py           # 业力系统：消耗计算/事件回复（提高后的值）/透支处理/退还逻辑
├── karma_assessor.py  # AI业力评估：含具体示例prompt，确保评估一致性
├── detection.py       # 识破系统：**仅透支时增加**/判定逻辑/动画触发
├── bosses.py          # Boss系统：六道Boss技能定义/触发条件/效果应用
├── skills.py          # 技能树：技能定义/效果应用/技能点管理/不可洗点逻辑
├── progression.py     # 进程系统：升降道/技能点获取/通关判定/New Game+
├── levels.py          # 关卡系统：全预制关卡管理/关卡状态
├── objectives.py      # 目标引擎：多样化目标判定/进度跟踪/复合条件
├── turn_limit.py      # 回合限制系统：20回合倒计时/超时判定
├── api.py             # FastAPI路由：所有对外接口
└── main.py            # 入口：挂载到hub服务
```

### 3.2 关键接口定义

**业力系统接口**（`karma.py`）：
```python
class KarmaSystem:
    def recover(self, event_type: str, event_data: dict) -> int:
        """根据事件回复业力，使用提高后的值，返回回复量"""
    
    def consume(self, amount: int, allow_overdraft: bool = True) -> tuple[int, bool, float]:
        """消耗业力，返回(实际消耗, 是否透支, 透支量)"""
    
    def refund(self, amount: int) -> None:
        """退还业力（修改失败时）"""
    
    def get_state(self) -> dict:
        """返回当前业力状态"""
```

**识破系统接口**（`detection.py`）：
```python
class DetectionSystem:
    def calculate_delta(self, overdraft_amount: float) -> float:
        """计算识破概率增量，仅当透支时 > 0"""
    
    def check(self, current_detection: float) -> bool:
        """识破判定，返回是否被识破"""
```

**回合限制接口**（`turn_limit.py`）：
```python
class TurnLimitSystem:
    def tick(self) -> bool:
        """回合+1，返回是否超时"""
    
    def get_remaining(self) -> int:
        """返回剩余回合数"""
    
    def reset(self, limit: int = 20) -> None:
        """重置回合数（围棋传40）"""
```

---

## 四、各棋类具体修改清单

### 4.1 象棋（xiangqi/）

**业力事件钩子**（提高后的值）：
- 吃子（兵/卒）→ `karma.recover("capture", {"piece": "pawn", "value": 8})`
- 吃子（马/炮/士/象）→ `karma.recover("capture", {"piece": "medium", "value": 15})`
- 吃子（车）→ `karma.recover("capture", {"piece": "rook", "value": 25})`
- 将军 → `karma.recover("check", {})` → 20 点
- 将死 → `karma.recover("checkmate", {})` → 35 点
- 兵过河 → `karma.recover("pawn_cross", {})` → 10 点

### 4.2 五子棋（wuziqi/）

**业力事件钩子**：
- 成三 → `karma.recover("three", {})` → 10 点
- 成四 → `karma.recover("four", {})` → 20 点
- 堵三 → `karma.recover("block_three", {})` → 8 点
- 堵四 → `karma.recover("block_four", {})` → 18 点
- 获胜 → `karma.recover("win", {})` → 35 点

### 4.3 围棋（weiqi/）

**业力事件钩子**：
- 提子（1-3）→ `karma.recover("capture", {"count": 3})` → 10 点
- 提子（4+）→ `karma.recover("capture", {"count": 4})` → 20 点
- 做活 → `karma.recover("life", {})` → 15 点
- 占角 → `karma.recover("corner", {})` → 12 点

**特殊**：回合限制为 40 回合

### 4.4 动物棋（dongwuqi/）

**业力事件钩子**：
- 吃子（同级/低级）→ `karma.recover("capture", {"piece": "normal", "value": 10})`
- 吃子（越级）→ `karma.recover("capture", {"piece": "overrank", "value": 25})`
- 进入兽穴附近 → `karma.recover("approach", {})` → 12 点

### 4.5 跳棋（tiaoqi/）

**业力事件钩子**：
- 连跳 3 步 → `karma.recover("jump", {"steps": 3})` → 10 点
- 连跳 5+ → `karma.recover("jump", {"steps": 5})` → 20 点
- 入营 → `karma.recover("home", {})` → 15 点

### 4.6 黑白棋（heibaiqi/）

**业力事件钩子**：
- 翻转 1-2 → `karma.recover("flip", {"count": 2})` → 8 点
- 翻转 3-4 → `karma.recover("flip", {"count": 4})` → 15 点
- 翻转 5+ → `karma.recover("flip", {"count": 5})` → 25 点
- 占角 → `karma.recover("corner", {})` → 20 点

---

## 五、关键实现细节

### 5.1 业力评估 Prompt（含具体示例）

```python
KARMA_ASSESS_PROMPT = """
棋类:{game_type}
作弊指令:"{instruction}"
意图分类:{intent_class}
当前局势:{board_summary}
当前业力:{karma}/{max_karma}
单次使用上限:{max_single}

请评估此次作弊的业力消耗（1~150的整数）。

## 评估标准（必须严格遵守）

### 基础分类价目表
- E 类（聊天/搞笑）：0-5 点
- D 类（界面修改/外观）：5-15 点
- A 类（机制修改）：20-40 点
- B 类（棋盘变换/棋子位置）：15-35 点
- C 类（规则修改/棋子走法）：30-60 点
- C+ 类（创建新棋子）：50-100 点

### 强度倍数（乘以基础价）
- 改 1 个棋子/1 条规则：×1.0
- 改 2 个棋子/2 条规则：×2.0
- 改 3 个及以上：×3.0

### 具体示例（必须参考）
- "把我的一个马改成炮"：40 点（C 类 ×1.0）
- "把我的两个马都改成炮"：80 点（C 类 ×2.0）
- "让我的马可以斜着走"：35 点（C 类 ×1.0，强度较低）
- "给我加一个额外回合"：50 点（A 类，高强度）
- "让对手跳过下一回合"：45 点（A 类）
- "改棋盘背景颜色"：10 点（D 类）
- "创建一个能飞的象"：80 点（C+ 类）
- "让我的车可以穿墙"：50 点（C 类，高强度）

### 局势调整
- 玩家大优时（优势 >50%）：×1.2（更贵）
- 玩家劣势时（优势 <30%）：×0.9（稍便宜）

### 守道者加价（如果有）
- 畜生道：改高等级棋子额外 +20 点

输出一个整数，不要任何解释。
"""
```

### 5.2 识破概率公式实现（仅透支时增加）

```python
def calculate_detection_delta(overdraft_amount: float) -> float:
    """计算识破概率增量，仅当透支时 > 0"""
    if overdraft_amount <= 0:
        return 0.0  # 正常使用业力，不增加识破概率
    C = 0.5
    alpha = 1.8
    return C * (overdraft_amount ** alpha)
```

### 5.3 关卡加载算法（全预制）

```python
def load_level(realm: str, level_index: int) -> dict:
    """加载指定道的第N关（全预制）"""
    pool = LEVEL_POOLS[realm]
    return pool["levels"][level_index]
```

### 5.4 残局数据库格式

```json
{
  "xiangqi": [
    {
      "id": "puzzle_xiangqi_001",
      "name": "绝杀",
      "description": "红方先行，20回合内将死黑方",
      "board_state": "...",
      "difficulty": 4,
      "source": "经典残局库"
    }
  ],
  "wuziqi": [...],
  "weiqi": [...],
  "dongwuqi": [...],
  "tiaoqi": [...],
  "heibaiqi": [...]
}
```

---

## 六、潜在遗漏提醒

### 6.1 高风险遗漏项

| 风险 | 说明 | 预防措施 |
|:-|:-|:-|
| **正常作弊增加了识破概率** | 违反 v4.0 核心设计 | 单元测试：正常消耗时 Δ识破概率=0 |
| **漏改棋类** | 只改了 5 个 | checklist 强制检查 |
| **漏配置正常棋局** | 某道不足 3 个正常棋局 | 每道至少配置 3 个 |
| **AI 生成了残局** | 违反"预制"要求 | 从数据库加载，不调用 LLM |
| **忘记 20 回合限制** | 关卡无时间限制 | 每关默认 20 回合（围棋 40） |
| **业力回复使用了旧值** | 未使用提高后的值 | 对照 karma_events.json 逐一验证 |

### 6.2 中风险遗漏项

| 风险 | 说明 | 预防措施 |
|:-|:-|:-|
| **业力评估不稳定** | 同样作弊不同消耗 | prompt 含具体示例 + 缓存 |
| **前端遗漏** | 只改了 1 个棋的前端 | 6 棋前端统一检查 |
| **存档遗漏** | 轮回状态没有持久化 | 测试存档/读档 |
| **技能效果遗漏** | 某个技能买了但没效果 | 每个技能至少测试 1 次 |
| **退还逻辑遗漏** | 某些失败路径没退还业力 | 所有失败路径统一处理 |

### 6.3 常见陷阱

1. **修改了棋类核心引擎** → 应该只添加钩子，不修改 rule_engine.py
2. **业力透支后没有禁用作弊** → 业力为负时应该禁止新作弊
3. **残局难度不适中** → 人工审核精选
4. **复合条件的顺序逻辑错误** → SEQUENCE 需要严格按顺序检查
5. **围棋忘记 40 回合限制** → 特殊处理围棋

---

## 七、质量检查清单

完成所有工作后，逐项检查：

- [ ] `samsara/` 目录存在且所有 13 个文件都已实现
- [ ] `configs/` 下 8 个配置文件都已创建（含 `puzzles.json`）
- [ ] 6 个棋类的 `main.py` 都已集成 samsara
- [ ] 6 个棋类的前端都已添加业力/识破/目标进度/20 回合倒计时
- [ ] **每道至少 3 个正常棋局**已配置
- [ ] **残局全部预制**，未使用 AI 生成
- [ ] **正常使用业力不增加识破概率**（单元测试通过）
- [ ] **透支时识破概率非线性增加**（单元测试通过）
- [ ] **业力评估示例验证**：改一个马为炮≈40点（测试通过）
- [ ] **20 回合限制**每关都有（围棋 40）
- [ ] 11 种目标类型至少各测试 1 次
- [ ] 6 道 Boss 技能至少各测试 1 次
- [ ] 技能树 4 分支 × 3 层所有技能至少各测试 1 次
- [ ] 无 AI 通关奖励测试通过
- [ ] 业力退还测试通过
- [ ] 轮回存档/读档测试通过

---

*v4.0 · 2026-07-23 · AI 执行方案*
