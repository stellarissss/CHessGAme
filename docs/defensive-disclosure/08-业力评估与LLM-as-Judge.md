# 08 业力评估与 LLM-as-Judge

## 摘要

本分册描述本项目「业力（karma）评估」子系统的设计与实现。该系统以「大语言模型作裁判（LLM-as-Judge）」的方式，对玩家用自然语言提出的「作弊」指令打出一个整数分值（业障值），累加到关卡业力上。需要强调：LLM 在这里的角色是裁判，输出的是一个整数分值，不是棋的走法；走棋由传统搜索算法（象棋 / 黑白棋 minimax、围棋 MCTS）完成。本分册给出评估对象、提示词结构、调用参数、输出解析方式、价目表、技能折扣、降级兜底路径，以及双套实现的事实。

## 1 背景与问题定义

系统允许玩家输入自然语言指令修改规则。并非所有指令都「同样恶劣」：把棋盘背景改成红色（D 类）与凭空造一个会飞的棋子（C+ 类）对游戏平衡的破坏程度不同。系统需要把每一条指令映射为一个可累加的「业障值」，使得：

- 业力初始为 50，安全阈值为 120，单条指令增量上限 120（超出直接拦截，业力不变）；
- 业力超出阈值的部分（溢出量）会非线性抬高「被天道识破」的概率（公式见 09 分册）；
- 不同意图分类有不同价目区间，且受强度倍数、局势、技能折扣影响。

问题定义：如何对自由形式的自然语言作弊指令，稳定地给出一个 1–120 的整数分值，并在 LLM 不可用或输出异常时仍能给出可接受的兜底值。

## 2 相关做法与本方案的区别

通用的 LLM-as-Judge 多用结构化输出（JSON，含理由与分值）做可解释的评分。本方案的区别在于：

- 评估对象是「自然语言作弊指令」本身（含意图分类、当前局势摘要），不是棋风，也不是叙事善恶。
- 输出刻意设计为**裸整数**：提示词末尾要求「输出一个整数，不要任何解释」（`shared/karma_assessor_base.py:106`），代码再以 `int(content)` 强转（`shared/karma_assessor_base.py:240`）。这牺牲了可解释性以换取解析简单与低延迟。
- 由于裸整数不可解析的风险，系统在异常或无 API key 时回退到**静态价目表**（`shared/karma_assessor_base.py:270-279`），而非重试或报错。

## 3 技术方案

### 3.1 评估对象与输入

评估器定义为「评估玩家作弊指令产生的业障值」（`shared/karma_assessor_base.py:60`）。输入字段由 `_build_prompt` 组装（`shared/karma_assessor_base.py:189-198`）：

- `game_type`：棋种标识；
- `instruction`：玩家作弊指令原文；
- `intent_class`：意图分类，取值 A / B / C / C+ / D / E / F；
- `board_summary`：当前局势摘要；
- `karma` / `max_karma` / `max_single`：当前业力、安全阈值、单次上限。

E 类（闲聊 / 搞笑）在入口直接返回固定 1 点，不调用模型（`shared/karma_assessor_base.py:210-211`）。

### 3.2 提示词结构

提示词由三段拼接（`shared/karma_assessor_base.py:179-187`）：公共头部 `_PROMPT_HEAD`（含背景与价目表）、棋类专属示例 `EXAMPLES_TEXT`、公共尾部 `_PROMPT_TAIL`（边界约束与输出指令）。价目表与倍数位于头部（`:79-98`）：

- 基础分类价目：E=1（固定）；D 8–23；A 30–60；B 23–53；C 45–90；C+ 75–120。
- 强度倍数：改 1 项 ×1.0，改 2 项 ×2.0，改 3 项及以上 ×3.0（`:87-90`）。
- 局势调整：玩家大优（优势 >50%）×1.2，劣势（优势 <30%）×0.9（`:94-98`）。

边界约束：最低 1 点，最高 120 点，超出单次上限的指令直接拦截（`:101-107`）。

### 3.3 模型调用与输出解析

模型调用走 DeepSeek 兼容的 `chat/completions` 接口（`shared/karma_assessor_base.py:222-236`，设计书 §3.3 亦记为「调用 DeepSeek 评估」），参数为：

- `temperature=0.3`；
- `**get_no_think_params()`：关闭推理链（源码注释实测开启推理时延约 21s 且 `content` 常为空，关闭后约 0.65s）；
- `max_tokens=512`。

输出为裸文本，代码以 `int(content)` 解析；最终以 `amount = max(1, min(amount, 120))` 夹取到 1–120（`shared/karma_assessor_base.py:240`、`:257`）。

### 3.4 技能折扣与道级折扣

解析后依次施加折扣（`shared/karma_assessor_base.py:244-255`）：

- `efficiency_fraud`：以 30% 概率将数值 ×0.7（判定函数 `_should_discount` 返回 `random.random() < 0.3`，`:245-246`、`:281-282`）。
- 处于 `hell` / `hungry` 道且 `hell_hungry_discount` 为真：×0.75（`:248-250`）。
- 处于 `heaven` / `asura` 道且 `heaven_asura_discount` 为真：×0.75（`:251-252`）。
- 棋类专属钩子 `_post_assess_hook`：动物棋在畜生道且分类为 C / C+ 时额外 +20（`:254-255`、`:261-268`；服务端版本 `samsara/karma_assessor.py:180-182`）。

### 3.5 降级兜底

当 `api_key` 为空（`:217-218`）或调用抛异常（`:241-242`）时，走 `_fallback_assess` 静态价目表（`shared/karma_assessor_base.py:270-279`）：E=1、D=10、A=30、B=25、C=40、C+=80。即系统**不依赖 LLM 也能运行**。

### 3.6 生效路径

评估得到的 `amount` 经 `increase_karma` 累加（`:284-309`）；若超过阈值则产生溢出量 `overshoot`，再经 `calculate_detection_delta`（`:333-355`）计算识破概率增量，经 `handle_overdraft`（`:357-422`）掷骰判定；若 `roll < 当前识破概率` 则识破，返回文案「天道识破 · 妄改天规者，罚入轮回」（`:415`）。消业事件由 `configs/karma_events.json` 按棋种定义（如象棋 `checkmate` 35 / `check` 20 / `capture_pawn` 8），且受 `karma_recover_multiplier`（「业力潮汐」技能 +30%）影响（`decrease_karma`，`:311-319`）。关卡重置公式 `level_karma = max(0, 50 - initial_karma_reduction) + carryover`（`:424-435`）。

## 4 本项目实现

- 评估器基类：`shared/karma_assessor_base.py`，定义见 `:60`，提示词见 `:59-107`，输入组装 `:189-198`，模型调用 `:222-236`，裸整数解析 `:240`、`:257`，价目表 `:79-98`，折扣 `:244-255`，动物棋加价钩子 `:261-268`，静态兜底 `:270-279`，生效与识破判定 `:284`、`:333-355`、`:357-422`，关卡重置 `:424-435`。
- 服务端权威版：`samsara/karma_assessor.py`，构造需 `SamsaraState`（`:77`），棋类示例字典 `_get_game_examples` 位于 `:90-128`，调用参数 `:159-171`，蓄生道加价 `:180-182`，静态兜底 `:193-202`。
- 两套实现并存：棋类侧 `KarmaAssessorBase`（进程内镜像，含一次性技能 `stealth_t2a` / `stealth_t3a` 的进程内消耗记录 `:373-408`）；服务端权威版 `samsara/karma_assessor.py`（以 `SamsaraState` 为唯一状态真源）。

## 5 验证情况

- 价目表、强度倍数、局势调整、边界约束、输出指令、静态兜底价目表、识破文案，均已对照源码复核（见第 4 节行号）。
- 本分册未运行真实模型调用进行实测；裸整数解析在 LLM 返回非数字文本时的失败率、以及不同模型 / 不同 `temperature` 下的打分分布，**未验证**。

## 6 局限性

- **输出不可复现**：评分依赖 LLM 采样（`temperature=0.3`），同一指令在不同次调用可能得到不同整数；这是裸整数 + 采样不确定性的固有代价。
- **解析脆弱**：输出为裸整数，仅靠 `int()` 强转与 `max(1, min(.,120))` 夹取兜底；若模型返回无法解析的文本（如带前缀），`int()` 会抛异常从而落入静态兜底，评分结果可能与设计意图偏差较大。
- **双源一致性风险**：存在两套 karma 实现（进程内镜像 `KarmaAssessorBase` 与服务端 `samsara/karma_assessor.py`）。二者逻辑由人工同步，双源一旦漂移无法在编译期发现，是已知工程风险。
- **价目表主观**：各分类的上下限为设计取值，无标定实验支撑其「公平性」。

## 7 参考文献

[1] 项目作者. CHessGAme 源代码: shared/karma_assessor_base.py[CP/OL]. (2026)[2026-10-11]. /workspace/CHessGAme/shared/karma_assessor_base.py.

[2] 项目作者. CHessGAme 源代码: samsara/karma_assessor.py[CP/OL]. (2026)[2026-10-11]. /workspace/CHessGAme/samsara/karma_assessor.py.

[3] 项目作者. CHessGAme 配置: configs/karma_events.json[CP/OL]. (2026)[2026-10-11]. /workspace/CHessGAme/configs/karma_events.json.

[4] 项目作者. 六道轮回_整体设计书_v3.1.md[EB/OL]. (2026)[2026-10-11]. /workspace/CHessGAme/六道轮回_整体设计书_v3.1.md.
