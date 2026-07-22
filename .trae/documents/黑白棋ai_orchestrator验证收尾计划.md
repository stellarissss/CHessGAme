# 计划：完成 `/workspace/heibaiqi/ai_orchestrator.py` 验证收尾

## 背景

主任务（将 `/workspace/xiangqi/ai_orchestrator.py` 改造为黑白棋版）的文件写入工作已在之前的会话中完成。本计划仅处理用户明确要求的"验证（必须执行）"环节与最终交付摘要。

## 当前状态分析（Phase 1 探索结论）

通过只读检查已确认：

1. **文件已存在**：`/workspace/heibaiqi/ai_orchestrator.py`，**2599 行**（源文件 2378 行）。
2. **Python 语法检查通过**：`python -m py_compile ai_orchestrator.py` → `SYNTAX_OK`。
3. **全部 33 个方法签名齐全**，包括用户要求保留的所有方法：
   - `__init__` / `set_api_key` / `set_rule_engine`（新增）/ `_record_token_usage`
   - `_call_deepseek` / `_extract_json` / `_extract_json_patch` / `_apply_patch_or_diff`
   - `process_command` / `_execute_action` / `_merge_action_results` / `_deep_merge_board_state`
   - `_parse_intent_with_log` / `_handle_action_a` / `_handle_a1_hardcoded` / `_handle_a2_mechanism`
   - `_handle_action_b_with_log` / `_handle_action_c_with_log` / `_handle_action_cp_with_log`
   - `_handle_action_d_with_log` / `_handle_action_d2_with_log`
   - `_validate_board` / `_validate_rules` / `_validate_rule_change`
   - `_call_code_ai_with_validation` / `_hard_validate_config` / 等
4. **关键黑白棋改造点已落实**：
   - `_get_board_summary`（625-704）：8×8 矩阵 + ●/○/. 符号 + 棋子统计 + 合法落子点 + 游戏状态 + 机制
   - `_compute_valid_placements`（706-718）+ `_fallback_valid_placements`（720-769）：优先用 rule_engine，否则内置 8 方向夹吃检测
   - `_handle_a1_hardcoded`（874-993）：undo_move 恢复 flipped 棋子 side + 删除新增 disc + black/white/red 回合切换；set_winner 默认 black，支持 draw，label 映射 {black:黑方, white:白方, red:黑方}
   - `_handle_a2_mechanism`（995+）：机制原语使用 black|white 而非 red|black
   - `_validate_rule_change`（2265-2336）：完全重写，移除 side_overrides 校验，校验 move.kind ∈ {jump, ray, flip}，比较 custom_pieces 列表
   - `_validate_rules`（2260-2263）：docstring 标注 most_discs/no_valid_moves_both/board_full
   - `_call_code_ai_with_validation`（2438）：`pieces_config_names = ("pieces", "pieces_black", "pieces_white", "pieces_red")` 纳入规则变化检查
   - `set_rule_engine`（103-105）：供 main.py 注入 rule_engine
5. **依赖项全部解析**：
   - `prompts.py`：7 个常量全部存在（INTENT_PARSER_SYSTEM / RULE_MODIFIER_SYSTEM / BOARD_TRANSFORMER_SYSTEM / UI_MODIFIER_SYSTEM / FUN_RESPONSE_SYSTEM / PIECE_CREATOR_SYSTEM / MECHANISM_MODIFIER_SYSTEM）
   - `shared/schema_validator.py`：5 个函数全部存在（validate_board_state / validate_pieces / validate_rules / validate_ui_config / validate_board）
   - `shared/json_patch_utils.py`：3 个函数全部存在（apply_patch / generate_diff / is_valid_patch）
6. **残留中文术语检查**：仅 4 处 `象棋/checkmate` 字样，均位于注释/docstring 中用作"对比说明"（如"无 checkmate/general_captured 相关校验"、"不含象棋的 side_overrides 字段"），非功能性残留，符合预期。

## 待执行步骤

### 步骤 1：运行验证命令（用户明确要求）

执行用户指定的验证命令：

```bash
cd /workspace/heibaiqi && python -c "from ai_orchestrator import AIOrchestrator; o=AIOrchestrator(); print('OK')"
```

**预期结果**：输出 `OK` 且退出码为 0。

**该操作的安全性**：`AIOrchestrator.__init__` 仅读取 `configs/token_stats.json`（若存在），不写入任何文件，无副作用。

### 步骤 2：若验证失败则修复

若步骤 1 报错，根据错误类型修复：

- **ImportError**：检查 prompts.py / schema_validator.py / json_patch_utils.py 的导出
- **AttributeError**：检查方法签名或 self 属性初始化
- **FileNotFoundError**：检查 `configs/token_stats.json` 路径处理
- **其他异常**：根据 traceback 定位并修复

修复后重新执行步骤 1，直到输出 `OK`。

### 步骤 3：返回最终交付摘要

按用户"输出要求"返回：
- 实际写入的文件路径：`/workspace/heibaiqi/ai_orchestrator.py`
- 行数：2599（以 `wc -l` 实际输出为准）
- 关键改动点摘要（见上方"当前状态分析"第 4 点）
- 验证命令输出（步骤 1 的实际输出）

## 假设与决策

- **假设**：文件写入已完成且无需大规模重写。探索阶段已通过语法检查、方法签名核对、依赖项解析核对三重验证，置信度高。
- **决策**：不重复执行文件写入，仅做最终验证与摘要返回，避免无谓改动。
- **决策**：若验证一次通过，不再追加额外测试（用户只要求实例化 OK）。
- **决策**：不修改 main.py（用户未要求；`set_rule_engine` 方法已就绪，main.py 后续可按需调用注入）。

## 验证标准

- `python -c "from ai_orchestrator import AIOrchestrator; o=AIOrchestrator(); print('OK')"` 输出 `OK`，退出码 0。
