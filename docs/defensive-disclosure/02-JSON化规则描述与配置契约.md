# JSON 化规则描述与配置契约

## 摘要

本项目把棋盘几何、棋子走法、胜负条件、特殊规则、AI 难度与界面主题全部外置为 JSON 配置文件，并用 JSON Schema（Draft-07）对其中若干文件做结构校验。本分册列出五类配置契约的字段结构、坐标系约定、出厂基线（`.initial`）机制，以及校验器在代码中的挂载位置与触发条件。所有断言均给出 `文件:行号` 或配置片段。

## 1 背景与问题定义

若让大语言模型实时改写规则，规则必须是一种可机器读写的稳定格式，而非散落在代码里的常量。本项目选择 JSON 作为统一载体，要求：同一棋种的全部可变规则能从文件读取、被外部改写、并在改写后能被结构化校验。随之而来的问题是：如何划分"哪些写进哪份文件"，以及"谁来保证改写后的文件仍然合法"。

## 2 相关做法与本方案的区别

许多棋类程序把规则参数（如棋盘尺寸、AI 深度）放进单一配置文件，但走法仍硬编码。本项目更进一步：走法、棋盘、胜负、界面各自独立成文件，且用独立 Schema 文件分别约束，而非一份大而全的校验规则。这种多文件、各配各 Schema 的划分，使 AI 可用 RFC 6902 JSON Patch 只改动某一类配置的一小段（见计划书 1.4 节"JSON Patch 优先"）。

## 3 技术方案

### 3.1 五类配置契约

校验映射在 `shared/schema_validator.py:18-27` 的 `CONFIG_SCHEMA_MAP` 中定义，键名到 Schema 文件的映射如下：`board_state→board_state.schema.json`、`board→board.schema.json`、`pieces`/`pieces_red`/`pieces_black`/`pieces_white`→`pieces.schema.json`、`rules→rules.schema.json`、`ui_config→ui_config.schema.json`。

各契约顶层字段（已核实）：

- **`board.json`**：`_metadata` + `geometry{width,height,river_line,palace,regions}` + `appearance{...}`。象棋为 `width:9, height:10, river_line:5`，含 `palace` 与 `regions`（`xiangqi/configs/board.json:7-32`）；围棋为 `width:19, height:19`，含 `star_points`（`weiqi/configs/board.json:7-9`）。
- **`pieces_red.json` / `pieces_black.json`**：`_metadata` + `side` + `pieces{}` + `custom_pieces[]`；每枚棋子含 `{label, is_king, moves[]}`（`label` 可为字符串，亦可为 `{red,black}`）。另有可选 `side_overrides` 对象，键对应阵营（象棋 `red/black`、围棋与五子棋 `white`），用于按阵营覆盖配置（该字段在 `wuziqi/configs/pieces_red.json:16` 出现为空 `{}`；`shared/ai_orchestrator_base.py:137` 的 `SIDE_OVERRIDE_KEYS` 说明其键随棋种为 `red/black` 或 `white`）。
- **`rules.json`**：顶层只有 5 个字段——`_metadata` / `win_conditions` / `special_rules` / `turn_rules` / `ai_difficulty`。棋盘几何与走法不在此文件，分别在 `board.json` 与 `pieces_*.json`。Schema 要求 `required:["win_conditions","special_rules"]`（`shared/schemas/rules.schema.json:110`）。示例见 `heibaiqi/configs/rules.json`。
- **`board_state.json`**（运行时）：`_metadata` + `pieces[]`（每项 `{id,type,name,side,position,is_alive,custom_properties}`）+ `current_turn` + `move_history` + `game_status{state,winner,win_condition,custom_rules_active:[]}` + `mechanisms`（回合级机制状态持久化）。Schema 的 `required` 为 `pieces/current_turn/game_status`（`shared/schemas/board_state.schema.json`）。
- **`ui_config.json`**：`theme{board,pieces,highlight}` + `layout` + `custom_css` + `custom_js`（Schema `required` 同此四项，`shared/schemas/ui_config.schema.json`）。

### 3.2 坐标系

坐标为 `[x,y]`：`x` 自左向右 `0..width-1`，`y` 自上向下 `0..height-1`；黑方在上（`y` 小），红方在下（`y` 大）。该约定由 `xiangqi/rule_engine.py` 的 `_crossed_river`（`:494`）、`_in_palace`（`:476`）等按 `river_line` 与 `palace` 推导，并在棋子配置中体现为红方 `$forward` 为 `[0,-1]`、黑方为 `[0,1]`。

### 3.3 出厂基线 `.initial`

每个棋种在自身的 `configs/initial/` 目录下保存 `<name>.json.initial`（全项目共 72 份），作为不可变出厂基线。`shared/game_base.py:407` 的 `reset_board()` 从这些文件重载全部配置（`:412-417`，仅当文件存在时），随后 `undo_stack.clear()`（`:419`）、`mark_config_cache_fresh()`、`_rebuild_engines()`（`:421`）、`save_all()`（`:422`）。基线文件本身不被运行时代码修改。

### 3.4 校验架构

校验器 `shared/schema_validator.py` 提供：`validate_config(config_name, config_data)`（`:45`）用 `Draft7Validator` 返回 `(bool,msg)`；`validate_rules(rules)`（`:124`）专校验规则文件；`validate_board_state`、`validate_board`、`validate_ui_config` 为各契约封装。`rules.schema.json` 共 111 行，关键约束：`win_conditions`/`special_rules` 的 `additionalProperties` 要求含 `enabled`；`category` 枚举 `victory/draw/special`；`turn_rules.first_player` 枚举 `red/black`；`ai_difficulty.current` 枚举 `easy/medium/hard`；`personality.type` 枚举 `normal/aggressive/defensive/random/custom`（`:24,44,50,68`）。`dongwuqi/schemas/rules.schema.json` 与 shared 版仅差 `title`/`description` 及两条字段 `description`，约束完全相同（diff 仅 3 处）。

## 4 本项目实现（证据）

- 映射与校验函数：`shared/schema_validator.py:18-27`（`CONFIG_SCHEMA_MAP`）、`:45`（`validate_config`，内部 `Draft7Validator.check_schema` 先验证 Schema 自身有效性，`:69`）、`:124`（`validate_rules`）。
- Schema 约束：`shared/schemas/rules.schema.json:13-109`（含 `required:["win_conditions","special_rules"]` 于 `:110`）。
- 触发点：唯一硬性校验入口为 `shared/ai_orchestrator_base.py:1056` 的 `_hard_validate_config()`，唯一调用处在 `:2834`（AI 生成配置后的重试循环内）。
- 非校验路径：`shared/game_base.py:342` 的 `load_configs()` 仅做 `json.load`（`:353`），不调用任何 Schema 校验，直接 `_rebuild_engines()`（`:355`）。
- 基线重载：`shared/game_base.py:407-422` 的 `reset_board()`。

## 5 验证情况

已通过阅读源码与 Schema 文件确认：五类契约的字段结构、坐标系、`.initial` 机制与校验函数挂载位置均如上所述。Schema 与配置文件的字段一致性已做静态核对（如 `dongwuqi/schemas` 与 shared 版 diff）。

针对"运行期加载是否强制校验"这一点的行为已核实：`load_configs()` 不校验，只有 AI 改写重试路径才校验。配置被 AI 改写后能否通过 Schema，取决于该重试循环是否执行到产出合规配置为止，本项目未提供独立的、覆盖全部棋种配置的全量校验测试，本文不作"已验证"声明。

## 6 局限性

- **加载路径不校验**：`shared/game_base.py:342` 的 `load_configs()` 只 `json.load`，不触发 Schema 校验；因此手写或被其他途径改坏的配置可能在加载时不被发现，直到 AI 重试路径才暴露。
- **`heibaiqi` 与 shared Schema 冲突**：`heibaiqi/configs/rules.json` 的 `ai_difficulty.levels` 使用键 `easy/normal/hard/master`，且 `current` 值为 `normal`；而 `shared/schemas/rules.schema.json:50` 规定 `current` 枚举为 `easy/medium/hard`。即 `heibaiqi` 既缺少 `medium`、多出 `master`，其 `current` 值也不在枚举内。若对该文件执行 Schema 校验将不通过。
- **`category` 取值越界**：`heibaiqi` 的 `win_conditions` 用 `category:"standard"`，而 Schema 枚举为 `victory/draw/special`（`:24`）。
- **`pieces` Schema 的 `side` 枚举局限**：`shared/schemas/pieces.schema.json` 规定 `side` 枚举为 `red/black`，但 `heibaiqi` 使用 `white` 阵营（`pieces_white.json`），若对其校验同样越界。
- **`side_overrides` 合并语义未核实**：计划书称其为"dict 递归合并、list/标量整体替换"，但源码中仅见其在 `rules` 层由 `_ensure_side_overrides`（`shared/ai_orchestrator_base.py:2237`）按 `SIDE_OVERRIDE_KEYS` 补全空结构，未在棋子配置加载路径发现相应的递归合并实现；其实际合并策略以代码为准，本文不据此断言。
- 计划书 `xiangqi/无限制象棋_完整计划书_v4.0.md:764` 自承："当前 `rules.json` 主要存储 AI 难度配置，胜利条件和特殊规则仍由规则引擎硬编码，未实现完全数据驱动"；`:806` 该目标仍以未勾选状态存在。

## 7 参考文献

[1] JSON Schema Draft-7 Specification[EB/OL]. 2018[2026-10-11]. https://json-schema.org/specification-links.html#draft-7

[2] BRYAN P, KELLOGG G, NOTTINGHAM M. RFC 6902: JavaScript Object Notation (JSON) Patch[S]. IETF, 2013.

[3] BRYAN P, KELLOGG G, NOTTINGHAM M. RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format[S]. IETF, 2017.

[4] 无限制象棋_完整计划书_v4.0.md[EB/OL]. CHessGAme 项目仓库.（见 `xiangqi/无限制象棋_完整计划书_v4.0.md`）
