# 计划: 棋圣解谜模式设计文档 (Puzzle Mode Design)

> 目标产出物: `docs/design/puzzle-mode.md`(单一设计文档,合并"点数改写 + 多目标谜题")
> 本计划文件描述该设计文档的结构与全部确认内容,执行阶段据此落盘。

---

## 一、Summary 摘要

把"棋圣 ChessSage"从自由对战平台改造为 **Baba is You 式单机解谜游戏**。核心是给现有「灵活编码/AI 作弊」机制套上一层**点数预算 + 多目标谜题**框架:

1. **点数改写配额制 (Rewrite Budget, RP)** — 元引擎:每关给 RP 预算,玩家花 RP 雇 AI 改规则/棋盘/棋子。纯棋艺零消耗解 = 高手额外奖励(三星评级)。
2. **多目标谜题库 (Objective Library)** — 内容层:把"胜负"泛化为可量化目标(覆盖率/吃子数/竞速/撤离/摆放/颜色占比/残局解锁)。最优解常是"让 AI 直接改配置",反向教育灵活编码哲学。

两个设计互补:RP 引擎做骨架,目标库 + 示例关卡做内容。属于游戏创作者大赛作品,以趣味/创新/实验性为纲,不商业化。

---

## 二、Current State Analysis 现状分析(基于 Phase 1 探索)

### 已有可复用基础设施
- **意图分类体系**: A1/A2/B/C/C+/D1/D2/E/F — 直接映射为 RP 定价档位
- **机制原语**: skip_turns / ai_control / random_moves / extra_turns / move_limits / player_control(已硬编码,机制引擎执行)
- **移动原语**: jump + ray + where 条件表达式 — 规则可重写的天然基础(Baba-is-You 式)
- **token_stats.json**: 已统计 token 消耗,可作 RP 计费底层
- **rules.json.win_conditions**: 已是数据驱动结构,但未完全利用 — 可扩展为 `objectives`
- **board.json.appearance + regions**: 颜色/区域配置已就绪,支持 D1 涂色解法
- **board_state.json.mechanisms**: 运行时机制字段已存在
- **六道众生叙事**: 人/天/阿修罗/畜生/饿鬼/地狱六道,可直接做章节化
- **37 个成就系统**: 已有成就检测前端 + 存档,可扩展解谜成就
- **JSON Patch + Schema 校验**: 修改可追溯/可撤销,适合解谜的"试错-撤销"循环

### 现有不足(本设计要补的)
- 无关卡系统
- 无点数/预算机制
- 无"非胜负"目标(只有 checkmate/general_captured/stalemate)
- rules.json 胜利条件未完全数据驱动
- 无染色/覆盖率状态字段

### 关键文件路径(执行阶段会动到的)
- 新建: `/workspace/docs/design/puzzle-mode.md`(本设计文档本体)
- 后续实现参考(本次只写设计文档,不改代码):
  - `/workspace/xiangqi/configs/rules.json` — 扩展 objectives 字段
  - `/workspace/xiangqi/configs/board_state.json` — 扩展 painted_cells
  - `/workspace/shared/schema_validator.py` + schemas — 校验新字段
  - `/workspace/xiangqi/mechanism_engine.py` — RP 计费钩子
  - `/workspace/xiangqi/rule_engine.py` — check_objective()
  - `/workspace/main.py` — 解谜模式成就定义

---

## 三、Proposed Changes 设计文档内容(写入 docs/design/puzzle-mode.md)

设计文档分 7 节,内容全部已与用户确认:

### 节 1 · 设计哲学与定位
- 一句话定位:"Baba is You 式规则重写解谜 × 棋圣灵活编码哲学"
- 三原则:(1) 配置即真相 (2) 双解路并存 (3) 高手有奖
- 大赛导向:趣味/创新/实验性优先,不商业运营

### 节 2 · 点数改写配额制 (RP 引擎)

**2.1 RP 定价表(已确认采用)**:

| 指令类型 | RP 消耗 | 设计理由 |
|---|---|---|
| A1 硬编码(直接判胜/悔棋) | **禁用** | 解谜模式引擎层硬拒,防绕过谜题 |
| A2 机制原语(冻结/AI接管/随机/额外回合/限步) | 3 / 个 | 组合性强,中等价 |
| B 棋盘变换(增删/移动/变型棋子) | 5 / 次 | 最粗暴,最贵 |
| C 规则修改(改走法/吃子规则) | 2 / 字段 | 规则层巧解,便宜 |
| C+ 自定义棋子创建 | 4 / 个 | 创造性强 |
| D1 界面/颜色修改 | **1 / 字段** | **最便宜** → 鼓励涂色解法 |
| D2 HTML 结构修改 | 6 / 区段 | 最贵,少用 |
| E 搞笑 | 0 | 不解题不扣点 |

**2.2 双解路 + 三星评级**:
关卡元数据三字段:
```json
{
  "budget": 5,              // RP 上限
  "skill_solution": true,   // 是否存在纯棋艺解
  "skill_bonus": "achievement_id"  // 纯解奖励(成就 id)
}
```
评级:
- ★☆☆ 用满预算勉强过
- ★★☆ 用 < 50% 预算过
- ★★★ 0 点纯棋艺硬解(仅 skill_solution=true 关卡有此档)

**2.3 反作弊**: 解谜模式引擎层硬拒 A1"直接判胜"类指令(意图解析返回 F 类拒绝);胜利只认 `rules.json.objectives`,不认 `board_state.game_status.state="ended"`。

**2.4 存档与进度**:
- 每关固定预算,不累计(防刷点)
- 通关获"悟性点 Insight"解锁 meta 技能(预览 AI 修改结果/撤销免费一次等)
- 新建 `progress.json` 或扩展 `achievements.json` 存档

### 节 3 · 多目标谜题库 (Objective Library)

**3.1 目标类型库(数据驱动,扩展 rules.json)**:

| 类型 | 编码 | 纯棋艺解(难) | AI 改写解(优雅·点数) |
|---|---|---|---|
| 覆盖率 | `coverage` | 走遍染色 | D1 改 board.json 区域上色(1点) |
| 吃子数 | `captures` | N 步吃够 K 子 | 改 AI 性格为自送 / 加棋子 |
| 竞速 | `speedrun` | 最少步数达标 | 改 move_limits 多步/回合 |
| 撤离 | `evacuate` | 指定子走到出口 | 改该子走法为 region 瞬移 |
| 摆放 | `arrangement` | 移成目标阵型 | B 类直接摆放 |
| 颜色占比 | `color_ratio` | 走过染色 | D1 改 background_color |
| 残局解锁 | `endgame_unlock` | 正常破局 | 改一条规则打破僵局 |

**3.2 rules.json.objectives 扩展结构示例**:
```json
{
  "objectives": {
    "primary": {
      "type": "coverage",
      "params": {"color": "red", "target_ratio": 0.6},
      "max_turns": 30
    },
    "secondary": [
      {"type": "captures", "params": {"count": 3}, "optional": true}
    ]
  },
  "puzzle_meta": {
    "budget": 5,
    "skill_solution": false,
    "skill_bonus": null
  }
}
```

**3.3 染色机制技术实现**:
- `board_state.json` 增 `painted_cells: {"red": [[x,y]...], "blue": [...]}` 字段
- 每步落点染当前方色;吃子格被对方覆盖
- `rule_engine` 增 `check_objective()` 方法,每步后检查 objectives 达成
- `board.json.regions` 可被 D1 直接染色(整片区域上色 = 1 点)

### 节 4 · 三个示例关卡(已确认)

**关卡「满江红」(覆盖率·人界)** — 教"改配置比走棋高效千倍"
- 目标: 60% 格染红 / 预算 5RP / skill_solution=false
- 纯棋艺: 走遍棋盘~50 步(几乎不可能)
- 优雅解(1 点): "把红方半边棋盘染红" → D1 改 regions,瞬间 50% 达标,再走几步补足
- 教学意图: 让玩家发现"改配置比走棋高效千倍"

**关卡「五子登科」(摆放·天界)** — 教"摆放类天然指向改写"
- 目标: 5 红子排中央十字 / 预算 4RP
- 纯棋艺: 五子棋走法难精确摆十字
- 优雅解(2 点): C 改某子走法为瞬移 + 走过去;或 B 直接摆放(5 点超预算)→ 迫使选规则改写
- 教学意图: 摆放类目标天然指向 B/C 改写

**关卡「色即是空」(颜色占比·地狱界)** — 灵活编码哲学最佳隐喻
- 目标: 黑色占 70% / 预算 3RP
- 题面诱导"翻转棋子"(慢)
- 优雅解(1 点): D1 改 background_color + regions 直接涂黑
- 教学意图: 题面诱导"翻转棋子",最优解"改棋盘颜色"——灵活编码哲学的最佳隐喻

### 节 5 · 关卡多样性指导(满足用户"灵活多样"要求)

明确关卡类型矩阵:
- **按棋局形态**: 正常开局 / 残局(少子) / 特殊棋局(自定义初始)
- **按目标类型**: 上节 3.1 七类目标交错使用
- **按 RP 预算张力**: 0 预算纯解关 / 紧预算关 / 宽预算关
- **按六道分章**: 人界象棋残局 / 天界五子摆放 / 阿修罗围棋领地 / 畜生界斗兽撤离 / 饿鬼界跳棋竞速 / 地狱界黑白涂色

### 节 6 · 扩展接口(预留 future 方向)

为头脑风暴剩余方向预留接入点(本次不实现):
- `endgame_unlock` 目标类型 → 方向 2 残局密码
- `speedrun`/`evacuate` 目标类型 → 方向 4 竞速撤离
- 未来 `rule_archaeology` 目标类型 → 方向 5 规则考古
- 六道叙事分章 → 方向 6 六道试炼

### 节 7 · 实现路线建议(大赛版最小闭环)

仅做设计文档,但给出后续实现优先级:
1. P0: RP 计费钩子(mechanism_engine/ai_orchestrator) + A1 硬拒
2. P0: rules.json.objectives 扩展 + rule_engine.check_objective()
3. P1: board_state.painted_cells + 染色逻辑
4. P1: progress.json 存档 + 三星评级
5. P2: 3 个示例关卡数据
6. P3: meta 技能系统

---

## 四、Assumptions & Decisions 假设与决策

### 已确认决策(用户已选)
1. **合并为单一文档** `docs/design/puzzle-mode.md`(非分两文档)
2. **采用提议 RP 定价**(D1=1/B=5/C=2/C+=4/A2=3/D2=6/A1禁用/E=0)
3. **重点展开方向 1 + 方向 3**(其余方向作 future 扩展接口)

### 设计假设
- 本任务**只写设计文档**,不改任何代码/配置(Plan Mode 后执行阶段仅落盘 markdown)
- 设计以"简明但创新"为纲,机制不过度复杂,保持策略深度
- 大赛作品性质:不商业运营,实验性玩法优先
- 复用现有基础设施(intent 分类/机制原语/移动原语/六道叙事/成就系统),不重造轮子

### 取舍说明
- RP 不累计、不跨关:防刷点,保证每关独立难度
- A1 直接判胜在解谜模式硬拒:防绕过谜题核心张力
- D1 颜色修改定价最便宜(1点):刻意引导涂色解法,服务灵活编码教学
- skill_solution=false 的关卡也有 ★★ 档:仍奖励低消耗解

---

## 五、Verification 验证步骤

文档落盘后自检:
1. `docs/design/puzzle-mode.md` 存在且为合法 markdown
2. 文档包含全部 7 节(哲学/RP引擎/目标库/3关卡/多样性/扩展接口/路线)
3. RP 定价表 8 类齐全且与用户确认版一致
4. 3 个示例关卡(满江红/五子登科/色即是空)描述完整(目标/预算/双解/教学意图)
5. rules.json.objectives 扩展结构有 JSON 示例
6. 扩展接口明确预留残局密码/竞速撤离/规则考古/六道试炼四个 future 方向
7. 所有引用的文件路径基于 Phase 1 实际探索(非臆造)

---

## 六、执行步骤(Plan 批准后)

1. 读本计划刷新上下文
2. 创建 `/workspace/docs/design/` 目录(若不存在)
3. Write `docs/design/puzzle-mode.md`,按第三节 7 节结构落盘全部内容
4. 自检第四节验证清单
5. 返回最终响应(不调用 NotifyUser)
