# 二级 LLM 流水线与意图分类

## 摘要

本项目以"棋类游戏规则完全 JSON 数据化、由大语言模型实时改写规则"为核心。玩家输入自然语言指令（如"让我的马可以斜着走""把車变成两个"），系统经两级大语言模型处理：第一级做意图解析与分类，第二级做代码生成、输出 RFC 6902 配置补丁，经多级校验后应用到游戏配置并热重建引擎。必须明确：大语言模型在本流水线中产出的是配置补丁，不是走法；落子与合法走法枚举由传统搜索算法与规则引擎完成（见分册 03、本系列其他分册）。本分册记录两级流水线的调用链、意图分类体系、温度与超时策略，以及它们在源码中的具体落点。本文所有技术断言均可由所列 `文件:行号` 复核。

## 1 背景与问题定义

在把规则交给大语言模型改写的系统中，存在一类根本矛盾：自然语言指令自由度极高，而游戏配置必须结构正确、可被引擎解释执行。若让模型直接输出整份配置，稍有格式或语义错误即会破坏可玩性；若只允许模板化指令，又失去了"自然语言自由改写"的能力。

由此产生的问题可拆为三点：

1. 如何把自由的自然语言映射为有限、可枚举的修改意图，并使意图与下游修改目标（哪一份配置文件、用什么方式改）一一对应；
2. 如何把"一次意图"安全转化为对配置的最小、可校验改动，而不把整份配置交给模型重写；
3. 如何在没有人工审核的情况下，保证模型输出即使失败也不致崩溃，而是可重试、可回滚。

本分册聚焦第 1 点与第 2 点的前半段——意图解析、意图分类与两级分工。

## 2 相关做法与本方案的区别

常见的"LLM 下棋"方案让模型直接生成走法（落子坐标或走法序列），模型既是"理解者"也是"决策者"。本方案刻意把这两个角色分开：模型不参与走法决策，只负责把"改规则"的意图翻译成配置补丁，走法合法性由规则引擎的 `get_valid_moves` 枚举保证（见 `xiangqi/chess_ai.py:142`、`rule_engine.get_valid_moves`），决策由 minimax / MCTS 等传统搜索完成。

另一类做法是模板指令（如一组固定按钮对应固定规则修改）。模板安全但表达力受限。本方案用两级流水线的第一级做自由意图分类，把任意自然语言归入有限分类（A/B/C/C+/D/E/F），再用第二级按分类调用对应的代码生成提示词，兼顾表达力与可控性。

第三类做法是让模型重写整份规则文件。本方案改用 RFC 6902 增量补丁作为中间表示（见分册 06），把"改什么"与"改成什么样"解耦，配合多层级校验，降低单点失败的影响面。

## 3 技术方案

### 3.1 两级流水线结构

```
玩家自然语言指令
      │
      ▼
┌──────────────────────────────────────────┐
│ 第一级：意图解析（编排器）                  │
│  _parse_intent_with_log                    │
│   · 注入棋局上下文（摘要 / ASCII / 全量）   │
│   · 调用 LLM（temperature=0.3）            │
│   · 输出结构化意图 JSON（分类 + actions[]） │
└──────────────────────────────────────────┘
      │  分类结果 + actions[]
      ▼
┌──────────────────────────────────────────┐
│ 分派 _execute_action（按 type 路由）        │
│  A/A1/A2 · B · C · C+ · D · D2 · E · F     │
└──────────────────────────────────────────┘
      │  C / B / C+ / D / D2 / A2 等需改配置
      ▼
┌──────────────────────────────────────────┐
│ 第二级：代码生成（编排器）                  │
│  _call_code_ai_with_validation             │
│   · 注入目标配置全量 JSON                   │
│   · 调用 LLM（temperature 初始 0.1）        │
│   · 输出 RFC 6902 Patch 或全量 JSON         │
│   · 三层校验 + 重试                         │
└──────────────────────────────────────────┘
      │  校验通过的 new_config
      ▼
落盘（save_config）→ 快照入栈（undo_stack）→ 热重建引擎（_rebuild_engines）
```

### 3.2 意图分类体系

意图分类由第一级模型完成，分类枚举与处理方式如下表（来源：`xiangqi/无限制象棋_完整计划书_v4.0.md:140-161` 的 2.2 节分类体系详解，已与源码分派逻辑核对一致）：

| 分类 | 名称 | 处理方式 | 修改目标 |
|:--|:--|:--|:--|
| A | 机制修改 | A1 硬代码 + A2 代码生成 | board_state.json + rules.json |
| B | 棋盘变换 | 代码生成 | board_state.json |
| C | 规则修改 | 代码生成 | pieces.json |
| C+ | 自定义棋子 | 代码生成 | pieces.json + board_state.json |
| B+C | 棋盘 + 规则 | 代码生成 ×2 | board_state + pieces.json |
| D | 界面修改 | 代码生成 | board.json / ui_config.json / index.html |
| E | 搞笑闲聊 | 硬代码 | 无 |
| F | 高级功能 | 标记不可行 | — |

A 类子类：A1 为硬编码操作（悔棋 `undo_move`、判胜 `set_winner`）；A2 为机制修改（游戏机制原语 + AI 性格，原子化组合）。D 类子类判定：`structured_instruction` 中不含 `target_sections` → D1（改配置：board.json 棋盘外观 / ui_config.json 全局主题）；含 `target_sections` → D2（按区段标记替换 index.html 的 DOM 结构）。该判定逻辑落在分派代码中（见 4 节 `:606-610`）。

### 3.3 温度策略与超时

- 第一级意图解析固定 `temperature=0.3`（`shared/ai_orchestrator_base.py:1173`）；
- 第二级代码生成初始 `temperature=0.1`（`:2746`），每次重试按 `min(current+0.1, 0.3)` 抬升（`:2823`、`:2839`）；
- 单次请求 `httpx.AsyncClient(timeout=120.0)`（`:709`），`max_tokens=8192`（`:705`）；响应 `content` 为 `None` 时按空串处理（`:721-722`）。

### 3.4 输出约束方式

第一级与第二级的输出约束均不依赖结构化解码（constrained decoding），而是靠"提示词声明 + 后处理抽取"：提示词要求输出 JSON 并在末尾声明"只输出 JSON"，代码侧再用 `_extract_json`（`:725`）与 `_extract_json_patch`（`:755`）从文本中抽取。这一设计代价是存在解析失败的可能，因而在第二级配套了多层校验与重试（见分册 06）。

## 4 本项目实现

### 4.1 调用链（自上而下）

1. 入口：`POST /api/command` → `xiangqi/main.py:184` 调用 `state.ai_orchestrator.process_command(...)`。
2. `process_command`：`shared/ai_orchestrator_base.py:355`；若未配置 API 密钥，直接返回错误（`:371-376`）。
3. 第一步意图解析：`process_command` 调用 `_intent_and_karma_phase`（`:396`）。该函数在源码中存在两处定义：
   - 基类 / sandbox 版本 `:318-329`，仅调用 `_parse_intent_with_log` 并返回 `karma_state=None`；
   - RPG 版本 `:2967-2993`，并行执行意图解析与业力评估（`asyncio.gather`）。由于后者在类中后出现，对 RPG 子类而言它覆盖前者。
4. `_parse_intent_with_log`：`:1147`；组装意图层用户提示词（含已激活规则注入，`:1154`、`:1161`），调用 `_call_deepseek(self._get_prompt("INTENT_PARSER_SYSTEM"), ..., temperature=0.3)`（`:1172-1173`），再用 `_extract_json` 抽取（`:1176`）。
5. 分派：`_execute_action`（`:580`）按 `action_type` 路由（`:596-610`）：A → `_handle_action_a`（`:1261`），其中 A1 → `_handle_a1_hardcoded`（`:1361`，处理 `undo_move`:1371 与 `set_winner`:1398），A2 → `_handle_a2_mechanism`（`:1448`）；B → `_handle_action_b_with_log`（`:1717`）；C → `_handle_action_c_with_log`（`:1872`）；C+ → `_handle_action_cp_with_log`（`:1978`）；D 视是否含 `target_sections` 分入 D（`:2258`）或 D2（`:2397`）。
6. 第二级代码生成：C 类在 `:1930` 调用 `_call_code_ai_with_validation(self._get_prompt("RULE_MODIFIER_SYSTEM"), ...)`；该函数位于 `:2739`，初始温度 `0.1`（`:2746`），`max_retries=2`（`:2767`）。
7. 返回 `modified_configs` 后，由 `main.py` 写回配置并触发前端热重载。

### 4.2 提示词常量（实际命名）

各棋种 `prompts.py` 中以模块级常量承载系统提示词。经源码核对，象棋版的常量名均带 `_SYSTEM` 后缀（与编排器 `_get_prompt` 的 `getattr` 取用方式一致）：

- `INTENT_PARSER_SYSTEM`（`:205`）—— 第一级意图解析系统提示词，其前缀拼接 `PIECE_TYPE_MAP + PIECE_NAME_MAP + PIECE_PRIMITIVE_PRIMER + ATOMIC_CAPTURE_MODIFIERS`（`:209-213`）；
- `RULE_MODIFIER_SYSTEM`（`:721`）—— C 类规则修改；
- `BOARD_TRANSFORMER_SYSTEM`（`:823`）—— B 类棋盘变换；
- `UI_MODIFIER_SYSTEM`（`:925`）—— D 类界面修改；
- `FUN_RESPONSE_SYSTEM`（`:1018`）—— E 类搞笑回复；
- `PIECE_CREATOR_SYSTEM`（`:1034`）—— C+ 自定义棋子；
- `MECHANISM_MODIFIER_SYSTEM`（`:1234`）—— A2 机制修改。

另有规则原语类 primer 常量：`JSON_PATCH_PRIMER`（`:9-24`，说明 RFC 6902 与 op 取值）、`PIECE_PRIMITIVE_PRIMER`（`:60-172`）、`ATOMIC_CAPTURE_MODIFIERS`（`:175-198`）。围棋与黑白棋各自的 primer 见分册 05。

### 4.3 意图输出结构

黑棋（黑白棋）版的意图输出示例位于 `heibaiqi/prompts.py:255-281`，其字段为：

```
feasible, classification, cost_energy, reasoning,
response_to_player, actions[], structured_instruction, next_ai_prompt
```

需如实说明：该示例**不含** `confidence` 字段。象棋版的 A 类示例则包含 `confidence`（如 `xiangqi/prompts.py:642` 的 `"confidence": 0.95`）。两类棋种的意图输出结构并不完全一致，本文不作统一断言。分类字符串经 `_normalize_classification`（`:1178`）规整到 `{A,B,C,C+,D,E,F}` 合法集合，无法识别的输入一律归为 `E`（闲聊）。

### 4.4 关于"无流式输出"

指令处理链路中的 `_call_deepseek`（`:687`）使用 `client.post(...)` 一次性取回完整响应，不开启流式。`shared/` 目录下仅有的 `httpx.stream` 调用位于 `assets/` 下的视频 / 动画生成脚本（`shared/assets/generate_cg_videos.py:79`、`generate_anim_frames.py:180`），与 LLM 指令流水线无关。

## 5 验证情况

本文结论基于对本项目源码与配置的静态核查：已逐行核对上述调用链、行号、常量命名与分类分派逻辑，并与计划书 `xiangqi/无限制象棋_完整计划书_v4.0.md:140-161` 的分类表交叉比对一致。

端到端的运行时测试（真实调用 DeepSeek 接口、完整跑通"指令→补丁→热重建"）未在本项目内做系统化回归，本文不作"已运行验证"声明；本节结论仅基于静态代码与配置核查。

## 6 局限性

- **B+C 无独立合并处理器**：分类表列出 B+C（先 B 后 C，B 的结果传入 C），但 `_execute_action` 的分派逻辑（`:596-610`）只分别处理 B、C、C+、D、D2、A、A2。B+C 意图实际由第一级模型拆为多条独立 action，按顺序分别执行，而非由单一合并处理器统一处理。
- **意图解析依赖 LLM**：解析失败或分类错误可能；系统用 `_normalize_classification`（`:1178`）把无法识别的输入兜底为 E，但这只覆盖"无法分类"，不覆盖"分类正确但语义理解错误"。
- **无流式、延迟较大**：单次请求固定 `timeout=120.0s`、`max_tokens=8192`（`:709`、`:705`），长指令延迟明显。
- **配置冗余**：每个棋种在顶层目录与 `sandbox/` 下各有一份同名目录（共两份拷贝），其中 `prompts.py` / `chess_ai.py` / `rule_engine.py` 等存在重复维护成本。
- **跨分册局限**：象棋 `rules.json` 的胜负条件与特殊规则仍由规则引擎硬编码，未完全数据驱动（见 `xiangqi/无限制象棋_完整计划书_v4.0.md:764` 及分册 06）。

## 7 参考文献

[1] 无限制象棋_完整计划书_v4.0.md[EB/OL]. CHessGAme 项目仓库. （见 `xiangqi/无限制象棋_完整计划书_v4.0.md`）

[2] BRYANT D, et al. RFC 6902: JSON Patch[S]. IETF, 2013.

[3] HANDREWS H, WRIGHT A, WEBBER J. JSON Schema Validation: draft-handrews-json-schema-validation-01 (Draft-07)[S]. 2019.

[4] DeepSeek. DeepSeek API 文档[EB/OL]. https://api-docs.deepseek.com

[5] 六道轮回_整体设计书_v3.1.md[EB/OL]. CHessGAme 项目仓库.

[6] 共享层源码 `shared/ai_orchestrator_base.py`、`shared/ai_config.py`、`xiangqi/main.py`、`xiangqi/prompts.py`、`heibaiqi/prompts.py`、`heibaiqi/ai_orchestrator.py`[CP/OL]. CHessGAme 项目仓库.
