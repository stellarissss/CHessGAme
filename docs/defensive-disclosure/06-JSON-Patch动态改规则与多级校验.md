# JSON Patch 动态改规则与多级校验

## 摘要

本项目把"大语言模型改写规则"落实为一条安全中间表示：模型不直接重写整份配置，而是优先输出 RFC 6902 JSON Patch 数组，由补丁工具应用到原始配置；若抽取全量 JSON 失败，则退化为由新旧配置反推 diff 再应用。补丁在落盘前经过三层校验（解析、Schema 硬校验、实质性变化检查）与至多两次重试；落盘时保存快照入撤回栈，支持回滚与引擎热重建。D 类意图还存在第二种修改模态——按区段标记替换 `index.html` 的局部 DOM。本分册记录补丁工具、多级校验、落盘与回滚，以及 D2 区段替换的实现与源码落点。本文所有技术断言均可由所列 `文件:行号` 复核。

## 1 背景与问题定义

若允许模型直接输出整份配置并被采纳，任一格式或语义错误都会污染配置、破坏可玩性，且难以定位"改了哪里"。用增量补丁作为中间表示，可带来三点收益：补丁只描述"改了什么"，体积远小于全量；补丁可被独立校验（op 合法、路径存在、类型匹配）；补丁可逆——原始配置未变，撤回只需丢弃补丁结果。

由此要解决的问题：如何从一个非结构化的模型文本中可靠地取出补丁或全量 JSON；如何在落盘前拦截非法或无效的修改；如何在修改出错时安全回退。

## 2 相关做法与本方案的区别

对比"整文件重写"：本方案以 RFC 6902 增量补丁为主路径，仅在模型未给出合法 Patch 时退化到"全量 JSON → `generate_diff` 反推 Patch"（`shared/ai_orchestrator_base.py:822-830`），两种模态最终都统一到同一套 `apply_patch` 应用逻辑。

对比"无校验直接采纳"：本方案在应用前后各设关卡——抽取失败即重试、Schema 硬校验拒绝结构非法、实质性变化检查拒绝"改了等于没改"的空操作（对 C 类），三层全部通过才落盘。

对比"改后不可恢复"：落盘前保存深拷贝快照入 `undo_stack`（上限 10），提供 `undo_last_config_change` 单步回退与引擎重建。

## 3 技术方案

### 3.1 补丁抽取与应用

```
LLM 响应文本
   │
   ├─ _extract_json_patch → 是列表？
   │     ├─ 是 → is_valid_patch → 通过 → apply_patch（优先 jsonpatch 库，否则纯 Python）
   │     └─ 否 / 失败
   │
   └─ _extract_json（全量 JSON）
         └─ generate_diff(原始, 全量) → apply_patch
```

纯 Python 实现（`shared/json_patch_utils.py`）支持 `add` / `remove` / `replace` / `copy` / `move` 五种 op（`_apply_single_op`，`:132`），且对原始配置做深拷贝，不修改入参（`:134`、`:216`）。

### 3.2 三层校验与重试

```
_call_code_ai_with_validation（max_retries=2）
   │
   ├─ 第 1 层 解析：_apply_patch_or_diff 失败 → 重试（温度抬升）
   ├─ 第 2 层 Schema 硬校验：_hard_validate_config → validate_*（Draft-07）
   └─ 第 3 层 实质性变化：_validate_rule_change（仅 C 类规则配置）
   任一失败且未用尽重试 → _generate_retry_prompt 把错误列表回灌原提示词
```

### 3.3 落盘与回滚

```
new_config 校验通过
   │
   └─ apply_config_update → 深拷贝快照入 undo_stack（≤10）
        → save_config（写 configs/<name>.json）
        → mark_config_cache_fresh
        → _rebuild_engines（热重建）
```

### 3.4 D2 区段替换（第二种修改模态）

D 类意图含 `target_sections` 时进入 D2（`shared/ai_orchestrator_base.py:606-608`），按区段名定位 `index.html` 中的标记区域并替换其 DOM（`:2397` 起）。可用区段名包括 `thinking_overlay`、`settings_modal`、`logs_modal`、`header`、`board_section`、`side_panel`、`input_section`（`xiangqi/prompts.py:299-300`）。

## 4 本项目实现

### 4.1 补丁工具 `shared/json_patch_utils.py`

- 五种 op 的支持声明见文件头 docstring（`shared/json_patch_utils.py:4`），`is_valid_patch` 的合法 op 集合为 `{add, remove, replace, copy, move}`（`:242`）。
- JSON Pointer 解析：`_parse_pointer`（`:17`），处理 `~1`/`~0` 转义（`:27`）。
- 应用：`apply_patch`（`:191`）优先使用 `jsonpatch` 库（`HAS_JSONPATCH`，`:10-14`、`:208-214`），库不可用时走纯 Python `_apply_single_op`（`:132`，深拷贝不改原对象，`:134`、`:216`）。
- 合法性：`is_valid_patch`（`:229`）逐项检查 op、path、`value`/`from` 必填。
- 反推 diff：`generate_diff`（`:316`）递归比较新旧配置，生成 `replace`/`add`/`remove` op（`:280-313`）。

### 4.2 抽取与退化 `shared/ai_orchestrator_base.py:_apply_patch_or_diff`

`_apply_patch_or_diff`（`:788`）先 `_extract_json_patch`（`:809`）取补丁，经 `is_valid_patch` + `apply_patch` 应用（`:811-814`）；失败则 `_extract_json`（`:822`）取全量 JSON，经 `generate_diff` + `apply_patch` 退化应用（`:825-826`）。补丁来源即 LLM 的响应文本，并非外部给定。

### 4.3 三层校验 `shared/ai_orchestrator_base.py:_call_code_ai_with_validation`

- 函数入口 `:2739`；初始温度 `0.1`（`:2746`），`max_retries=2`（`:2767`），重试温度 `min(t+0.1, 0.3)`（`:2823`、`:2839`）。
- 第 1 层解析：`:2813` 调用 `_apply_patch_or_diff`，失败则 `:2819-2827` 重试或返回错误。
- 第 2 层 Schema 硬校验：`:2834` 调用 `_hard_validate_config`（`:1056`），后者按 config 名分派 `validate_board_state` / `validate_pieces` / `validate_rules` / `validate_ui_config` / `validate_board`（`:1067-1076`）。
- 第 3 层实质性变化：`:2851` 调用 `_validate_rule_change`，仅当 `config_name` 属于 `RULE_CHANGE_CONFIG_NAMES` 时启用。
- 重试提示：`_generate_retry_prompt`（`:1033`）把错误列表追加到原提示词末尾（`:1046-1054`）。

黑白棋对第 3 层有专属实现：`heibaiqi/ai_orchestrator.py:372-443` 的 `_validate_rule_change` 在结构完整性检查后，校验 `move.kind ∈ {jump, ray, flip}`（`:398-414`），再比较新旧 `pieces`/`custom_pieces` 是否发生实质性变化（`:416-443`）。

### 4.4 落盘与回滚 `shared/game_base.py`

- `apply_config_update`（`:376`）：先对被修改条目做深拷贝快照（`:382`），入 `undo_stack`（`:384`），超过 10 条则丢弃最旧（`:385-386`），随后逐条 `save_config`（`:390`）、`mark_config_cache_fresh`（`:392`）、`_rebuild_engines`（`:393`）。
- `undo_last_config_change`（`:395`）：弹出快照（`:399`）并写回（`:400-402`）、重建引擎（`:404`）。
- `save_config`（`:365`）把单份配置写入 `configs/<name>.json`。
- 调用点：`dongwuqi/main.py:220`、`heibaiqi/main.py:325`、`tiaoqi/main.py:220` 在主流程中调用 `state.apply_config_update(modified)`。
- 另一入口：`sandbox/xiangqi/main.py:685-700` 的 `POST /api/rpg/apply_patch` 校验 `target ∈ CONFIG_FILES` 后，调 `apply_patch` → `save_config` → `mark_config_cache_fresh` → `_rebuild_engines`；`POST /api/rpg/apply_rules`（`:704`）强制 `target="rules"`。

### 4.5 Schema 定义与加载 `shared/schema_validator.py`

- `CONFIG_SCHEMA_MAP`（`:18-27`）把配置名映射到 `shared/schemas/*.schema.json`（含 `board` / `board_state` / `pieces` / `rules` / `ui_config`）。
- `validate_config`（`:45`）以 `Draft7Validator`（`jsonschema`，`:10`、`:73`）校验；`:69` 先 `check_schema` 校验 schema 自身。
- 需如实说明：`game_base.py:342` 的 `load_configs` 仅从磁盘加载配置并调用 `_rebuild_engines`，**不**执行 schema 校验；Schema 校验只在第二级代码生成路径（`_hard_validate_config`）中被调用。

### 4.6 D2 区段替换

处理函数为 `_handle_action_d2_with_log`（`shared/ai_orchestrator_base.py:2397`）；从 `structured_instruction.target_sections` 取区段名（`:2403`），逐个定位并替换 `index.html` 的对应标记区域（`:2434` 起）。可用区段名见 `xiangqi/prompts.py:299-300`。

## 5 验证情况

本文结论基于源码静态核查：已核对补丁工具五种 op 与深拷贝行为、三级校验与重试的温度与行号、落盘/回滚的快照栈与上限、sandbox 入口与 schema 映射。运行时端到端验证（真实补丁应用、回滚、D2 替换效果）未做系统化回归，本文不作"已运行验证"声明；本节仅确认上述逻辑在代码中确实存在并按描述组织。

## 6 局限性

- **规则未完全数据驱动**：计划书 `xiangqi/无限制象棋_完整计划书_v4.0.md:764` 自承，`rules.json` 主要存储 AI 难度配置，胜利条件与特殊规则仍由规则引擎硬编码，未实现完全数据驱动。因此即使补丁修改了 `rules.json` 的相关字段，引擎未必解释执行。
- **输出约束非结构化解码**：补丁/全量 JSON 均依赖"提示词声明 + 后处理抽取"（见分册 05），存在解析失败概率；三层校验与重试是其兜底，而非零失败保证。
- **无流式、延迟较大**：单次请求固定 `timeout=120.0s`、`max_tokens=8192`，长指令延迟明显。
- **难度枚举与 Schema 冲突（运行时不报错）**：`shared/schemas/rules.schema.json:50` 把 `ai_difficulty.current` 的合法枚举限定为 `["easy","medium","hard"]`，但 `heibaiqi/configs/rules.json:49` 的 `current` 为 `"normal"`、`levels` 中还存在 `"master"`（`:55`、`:63`），且 `heibaiqi/main.py:71` 的 `DEFAULT_DIFFICULTY="normal"`（`:90` 读取 `current` 默认 `"normal"`）。由于 `load_configs`（`:342`）不执行 schema 校验，该不一致不会在运行时崩溃，但若对配置做严格 schema 校验则会被标记为非法。
- **配置冗余**：每个棋种在顶层目录与 `sandbox/` 下各有一份同名目录（共两份拷贝），`prompts.py` / `chess_ai.py` / `rule_engine.py` 等存在重复。

## 7 参考文献

[1] BRYANT D, et al. RFC 6902: JSON Patch[S]. IETF, 2013.

[2] BRYANT D, et al. RFC 6901: JSON Pointer[S]. IETF, 2013.

[3] HANDREWS H, WRIGHT A, WEBBER J. JSON Schema Validation: draft-handrews-json-schema-validation-01 (Draft-07)[S]. 2019.

[4] 无限制象棋_完整计划书_v4.0.md[EB/OL]. CHessGAme 项目仓库. （见 `xiangqi/无限制象棋_完整计划书_v4.0.md`）

[5] 共享层源码 `shared/json_patch_utils.py`、`shared/ai_orchestrator_base.py`、`shared/game_base.py`、`shared/schema_validator.py`、`sandbox/xiangqi/main.py`、`heibaiqi/ai_orchestrator.py`[CP/OL]. CHessGAme 项目仓库.
