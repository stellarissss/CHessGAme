"""
AI编排器 - 协调多级AI工作流（带完整日志）
"""
import json
import re
import copy
import sys
import httpx
import asyncio
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

# 自动注入 shared/ 到 sys.path（兼容直接执行与被 main.py 导入两种场景）
_SHARED = Path(__file__).resolve().parent.parent.parent / "shared"  # sandbox 比顶层深一层
if _SHARED.exists() and str(_SHARED) not in sys.path:
    sys.path.insert(0, str(_SHARED))

from shared.ai_orchestrator_base import AIOrchestratorBase
from prompts import (
    INTENT_PARSER_SYSTEM,
    RULE_MODIFIER_SYSTEM,
    BOARD_TRANSFORMER_SYSTEM,
    UI_MODIFIER_SYSTEM,
    FUN_RESPONSE_SYSTEM,
    PIECE_CREATOR_SYSTEM,
    MECHANISM_MODIFIER_SYSTEM,
)
from schema_validator import validate_board_state, validate_pieces, validate_rules, validate_ui_config, validate_board
from json_patch_utils import apply_patch, generate_diff, is_valid_patch


# 静态文件目录
STATIC_DIR = Path(__file__).parent / "static"
BASE_DIR = Path(__file__).parent


class AIOrchestrator(AIOrchestratorBase):
    # sandbox 使用 deepseek-chat（顶层用 deepseek-v4-flash）
    DEFAULT_MODEL = "deepseek-chat"
    """AI编排器，协调第一级和第二级AI"""

    def __init__(self, api_key: str = ""):
        # 公共基础设施（logger/token_stats/base_url 等）由基类初始化
        super().__init__(base_dir=BASE_DIR, api_key=api_key)

    def set_api_key(self, api_key: str):
        self.api_key = api_key

    async def process_command(
        self, command: str, context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        处理玩家指令的主流程

        返回:
            {
                "success": bool,
                "type": str,  # "applied" | "rejected" | "fun" | "error"
                "message": str,
                "modified_configs": dict,  # 修改后的配置文件
                "classification": str,
                "log_id": int,  # 日志ID
            }
        """
        if not self.api_key:
            return {
                "success": False,
                "type": "error",
                "message": "未设置API密钥，请先在设置中输入DeepSeek API Key",
            }

        self.current_thinking = True
        log_entry = {
            "user_input": command,
            "stage": "started",
            "intent_analysis": {},
            "code_generation": {},
            "final_result": {},
            "errors": [],
        }

        # 加载当前配置
        configs = context.get("configs", {})

        # 步骤1：意图解析
        self.thinking_stage = "intent"
        try:
            intent, intent_time, intent_raw = await self._parse_intent_with_log(command, context)
            log_entry["intent_analysis"] = {
                "success": True,
                "elapsed_time": intent_time,
                "raw_output": intent_raw,
                "parsed_result": intent,
            }
        except Exception as e:
            log_entry["intent_analysis"] = {
                "success": False,
                "error": str(e),
            }
            log_entry["errors"].append(f"意图解析失败: {e}")
            self.logger.add_log(log_entry)
            self.current_thinking = False
            self.thinking_stage = ""
            return {
                "success": False,
                "type": "error",
                "message": f"意图解析失败: {str(e)}",
                "log_id": len(self.logger.logs) - 1,
            }

        if not intent:
            log_entry["errors"].append("意图解析失败：无法解析AI响应")
            self.logger.add_log(log_entry)
            self.current_thinking = False
            self.thinking_stage = ""
            return {
                "success": False,
                "type": "error",
                "message": "意图解析失败：无法解析AI响应",
                "log_id": len(self.logger.logs) - 1,
            }

        classification = intent.get("classification", "")
        log_entry["classification"] = classification
        # 提取 cost_energy（RPG 用，0-10 整数，clamp）
        # 注意：必须在 feasible 检查之前提取，rejected 分支也会引用此值
        cost_energy = max(0, min(10, int(intent.get("cost_energy", 0) or 0)))

        # 不可行请求
        if not intent.get("feasible", False):
            log_entry["final_result"] = {
                "type": "rejected",
                "reason": intent.get("reasoning", ""),
            }
            self.logger.add_log(log_entry)
            self.current_thinking = False
            self.thinking_stage = ""
            return {
                "success": False,
                "type": "rejected",
                "message": intent.get("response_to_player", "该操作无法实现"),
                "classification": classification,
                "cost_energy": cost_energy,
                "log_id": len(self.logger.logs) - 1,
            }

        # E类搞笑
        if classification == "E":
            log_entry["final_result"] = {
                "type": "fun",
                "response": intent.get("response_to_player", ""),
            }
            self.logger.add_log(log_entry)
            self.current_thinking = False
            self.thinking_stage = ""
            return {
                "success": True,
                "type": "fun",
                "message": intent.get("response_to_player", ""),
                "classification": "E",
                "cost_energy": cost_energy,
                "log_id": len(self.logger.logs) - 1,
            }

        # A类机制修改 - 混合处理（A1硬编码 + A2灵活编码）
        if classification == "A":
            result = await self._handle_action_a(intent, configs, log_entry)
            log_entry["final_result"] = result
            self.logger.add_log(log_entry)
            self.current_thinking = False
            self.thinking_stage = ""
            result["log_id"] = len(self.logger.logs) - 1
            result["cost_energy"] = cost_energy
            return result

        # F类高级功能 - 直接标记不可行
        if classification == "F":
            log_entry["final_result"] = {
                "success": False,
                "type": "error",
                "message": "无法实现高级功能",
            }
            self.logger.add_log(log_entry)
            self.current_thinking = False
            self.thinking_stage = ""
            return {
                "success": False,
                "type": "error",
                "message": "该功能需要修改核心引擎代码，暂时无法实现",
                "classification": "F",
                "cost_energy": cost_energy,
                "log_id": len(self.logger.logs) - 1,
            }

        # B/C/D类 - 多action并行处理
        self.thinking_stage = "code"
        actions = intent.get("actions", [])
        
        if not actions:
            # 兼容旧格式：从structured_instruction构建单action
            instruction = intent.get("structured_instruction", {})
            next_prompt = intent.get("next_ai_prompt", "")
            target_files = intent.get("target_files", [])
            
            if classification.startswith("D"):
                if instruction.get("target_sections"):
                    actions = [{
                        "type": "D",
                        "target_files": target_files,
                        "instruction": instruction,
                        "prompt": next_prompt,
                    }]
                else:
                    actions = [{
                        "type": "D",
                        "target_files": target_files,
                        "instruction": instruction,
                        "prompt": next_prompt,
                    }]
            elif classification == "C+":
                actions = [{
                    "type": "C+",
                    "target_files": target_files,
                    "instruction": instruction,
                    "prompt": next_prompt,
                }]
            elif classification.startswith("B") or classification.startswith("C"):
                actions = [{
                    "type": classification[0],
                    "target_files": target_files,
                    "instruction": instruction,
                    "prompt": next_prompt,
                }]
        
        if not actions:
            result = {
                "success": False,
                "type": "error",
                "message": f"未知分类: {classification}",
            }
        else:
            # 并行执行所有actions
            results = await asyncio.gather(
                *[self._execute_action(action, configs, log_entry) for action in actions]
            )
            
            # 合并结果
            result = self._merge_action_results(results, intent)

        log_entry["final_result"] = result
        self.logger.add_log(log_entry)
        self.current_thinking = False
        self.thinking_stage = ""
        result["log_id"] = len(self.logger.logs) - 1
        result["cost_energy"] = cost_energy
        return result

    async def _execute_action(
        self, action: dict, configs: dict, log_entry: dict
    ) -> Dict[str, Any]:
        """执行单个action"""
        action_type = action.get("type", "")
        instruction = action.get("instruction", {})
        prompt = action.get("prompt", "")
        
        # 将action包装为兼容旧格式的intent
        action_intent = {
            "structured_instruction": instruction,
            "next_ai_prompt": prompt,
            "target_files": action.get("target_files", []),
            "side": action.get("side", None),
        }
        
        if action_type == "B":
            return await self._handle_action_b_with_log(action_intent, configs, log_entry)
        elif action_type == "C":
            return await self._handle_action_c_with_log(action_intent, configs, log_entry)
        elif action_type == "C+":
            return await self._handle_action_cp_with_log(action_intent, configs, log_entry)
        elif action_type == "D":
            if instruction.get("target_sections"):
                return await self._handle_action_d2_with_log(action_intent, configs, log_entry)
            else:
                return await self._handle_action_d_with_log(action_intent, configs, log_entry)
        else:
            return {
                "success": False,
                "type": "error",
                "message": f"未知action类型: {action_type}",
            }

    async def _parse_intent_with_log(
        self, command: str, context: Dict[str, Any]
    ) -> Tuple[Optional[dict], float, str]:
        """意图解析（带日志）"""
        configs = context.get("configs", {})
        board = configs.get("board_state", {})
        pieces_summary = self._get_board_summary(board)
        active_rules = board.get("game_status", {}).get("custom_rules_active", [])

        user_prompt = f"""当前游戏状态：
- 当前回合：{board.get('current_turn', 'red')}
- 棋盘概况：{pieces_summary}
- 已激活的自定义规则：{', '.join(active_rules) if active_rules else '无'}

玩家输入："{command}"

请分析并输出JSON。"""

        resp, elapsed = await self._call_deepseek(
            INTENT_PARSER_SYSTEM, user_prompt, temperature=0.3
        )

        return self._extract_json(resp), elapsed, resp

    def _get_board_summary(self, board: dict) -> str:
        """生成棋盘摘要"""
        pieces = board.get("pieces", [])
        alive = [p for p in pieces if p.get("is_alive", True)]
        red_count = len([p for p in alive if p["side"] == "red"])
        black_count = len([p for p in alive if p["side"] == "black"])
        return f"红方{red_count}子, 黑方{black_count}子"

    async def _handle_action_a(
        self, intent: dict, configs: dict, log_entry: dict = None
    ) -> Dict[str, Any]:
        """A类：机制修改（A1硬编码 + A2灵活编码混合模式）

        A1子类: 悔棋/设定输赢 - 硬编码实现（保留原有功能）
        A2子类: 机制修改/AI性格修改 - 灵活编码实现（通过CodeAI修改JSON）
        """
        if log_entry is None:
            log_entry = {}

        actions = intent.get("actions", [])

        # 兼容旧格式：没有actions时构建单个action
        if not actions:
            instruction = intent.get("structured_instruction", {})
            target_files = intent.get("target_files", [])
            actions = [{
                "type": "A",
                "subtype": "A1",
                "target_files": target_files,
                "instruction": instruction,
                "prompt": intent.get("next_ai_prompt", ""),
            }]

        # 分类处理actions
        a1_actions = []
        a2_actions = []
        for act in actions:
            if act.get("type") == "A":
                subtype = act.get("subtype", "")
                instruction = act.get("instruction", {})
                action_name = instruction.get("action", "")
                # 自动判断子类
                if subtype == "A2" or action_name in ("modify_personality", "add_mechanism", "set_ai_personality",
                                                        "freeze_ai", "ai_takeover", "random_move",
                                                        "skip_turn", "extra_turn", "modify_mechanism",
                                                        "player_control"):
                    a2_actions.append(act)
                else:
                    a1_actions.append(act)

        all_results = []
        modified_configs_all = {}

        # 处理A1硬编码动作
        for act in a1_actions:
            result = self._handle_a1_hardcoded(act, configs, intent)
            all_results.append(result)
            if result.get("modified_configs"):
                for k, v in result["modified_configs"].items():
                    if k == "board_state" and k in modified_configs_all:
                        self._deep_merge_board_state(modified_configs_all[k], v)
                    else:
                        modified_configs_all[k] = v

        # 处理A2灵活编码动作（并行）
        if a2_actions:
            self.thinking_stage = "code"
            a2_results = await asyncio.gather(
                *[self._handle_a2_mechanism(act, configs, log_entry) for act in a2_actions]
            )
            for result in a2_results:
                all_results.append(result)
                if result.get("modified_configs"):
                    for k, v in result["modified_configs"].items():
                        if k == "board_state" and k in modified_configs_all:
                            self._deep_merge_board_state(modified_configs_all[k], v)
                        else:
                            modified_configs_all[k] = v

        # 合并结果
        success_count = sum(1 for r in all_results if r.get("success"))
        error_count = sum(1 for r in all_results if not r.get("success") and r.get("type") != "rejected")

        if success_count > 0 and error_count == 0:
            return {
                "success": True,
                "type": "applied",
                "message": intent.get("response_to_player", "机制修改已应用"),
                "modified_configs": modified_configs_all,
                "classification": "A",
                "action_results": all_results,
            }
        elif success_count > 0 and error_count > 0:
            return {
                "success": True,
                "type": "partial",
                "message": intent.get("response_to_player", "部分修改成功"),
                "modified_configs": modified_configs_all,
                "classification": "A",
                "action_results": all_results,
            }
        else:
            messages = [r.get("message", "") for r in all_results if r.get("message")]
            return {
                "success": False,
                "type": "rejected" if error_count == 0 else "error",
                "message": "\n".join(messages) if messages else "操作失败",
                "classification": "A",
                "action_results": all_results,
            }

    def _handle_a1_hardcoded(
        self, action: dict, configs: dict, intent: dict
    ) -> Dict[str, Any]:
        """A1子类：硬编码处理（悔棋/设定输赢）"""
        instruction = action.get("instruction", {})
        action_name = instruction.get("action", "")
        params = instruction.get("parameters", {})

        board = copy.deepcopy(configs.get("board_state", {}))

        if action_name == "undo_move":
            steps = params.get("steps", 1)
            history = board.get("move_history", [])
            if len(history) < steps:
                return {
                    "success": False,
                    "type": "rejected",
                    "message": f"没有足够的步数可悔（当前历史{len(history)}步）",
                }
            for _ in range(steps):
                if not history:
                    break
                last = history.pop()
                piece = self._find_piece(board, last["piece_id"])
                if piece:
                    piece["position"] = last["from"]
                if last.get("captured"):
                    cap = self._find_piece(board, last["captured"])
                    if cap:
                        cap["is_alive"] = True
                board["current_turn"] = "red" if board["current_turn"] == "black" else "black"
            board["move_history"] = history
            return {
                "success": True,
                "type": "applied",
                "message": intent.get("response_to_player", f"已悔{steps}步棋"),
                "modified_configs": {"board_state": board},
                "classification": "A",
                "subtype": "A1",
            }

        elif action_name == "set_winner":
            winner = params.get("winner", "red")
            game_status = board.setdefault("game_status", {})
            game_status["state"] = "ended"
            game_status["winner"] = winner
            game_status["win_condition"] = "玩家指令"
            game_status.setdefault("custom_rules_active", [])
            return {
                "success": True,
                "type": "applied",
                "message": intent.get("response_to_player", f"已设置{winner}方获胜"),
                "modified_configs": {"board_state": board},
                "classification": "A",
                "subtype": "A1",
            }

        return {
            "success": False,
            "type": "rejected",
            "message": f"无法识别的A1操作: {action_name}",
            "classification": "A",
            "subtype": "A1",
        }

    async def _handle_a2_mechanism(
        self, action: dict, configs: dict, log_entry: dict
    ) -> Dict[str, Any]:
        """A2子类：灵活编码机制修改（通过CodeAI修改JSON）

        支持修改：
        - board_state.json 的 mechanisms 字段（添加/修改机制原语）
        - rules.json 的 ai_difficulty.personality 字段（修改AI性格）
        """
        code_gen_log = log_entry.setdefault("code_generation", {})

        instruction = action.get("instruction", {})
        next_prompt = action.get("prompt", "")
        target_files = action.get("target_files", [])
        action_name = instruction.get("action", "")
        params = instruction.get("parameters", {})

        # 判断需要修改哪些配置文件
        needs_board_state = False
        needs_rules = False

        for f in target_files:
            if "board_state" in f:
                needs_board_state = True
            if "rules" in f:
                needs_rules = True

        # 根据action类型自动判断
        if action_name in ("modify_personality", "set_ai_personality"):
            needs_rules = True
        if action_name in ("add_mechanism", "freeze_ai", "ai_takeover", "random_move",
                           "skip_turn", "extra_turn", "modify_mechanism", "player_control"):
            needs_board_state = True

        # 默认至少修改board_state
        if not needs_board_state and not needs_rules:
            needs_board_state = True

        board_state = copy.deepcopy(configs.get("board_state", {}))
        rules = copy.deepcopy(configs.get("rules", {}))

        # 构建用户提示词
        targets_desc = []
        if needs_board_state:
            targets_desc.append("board_state.json（mechanisms机制字段）")
        if needs_rules:
            targets_desc.append("rules.json（ai_difficulty.personality性格字段）")

        user_prompt = f"""## 修改任务
{next_prompt}

## 具体操作
- 动作: {action_name}
- 目标: {instruction.get('target', '')}
- 参数: {json.dumps(params, ensure_ascii=False)}
- 修改文件: {', '.join(targets_desc)}

## 机制原语说明（用于修改 board_state.json 的 mechanisms 字段）
你可以组合使用以下原语来实现各种游戏机制效果：

### skip_turns - 跳过回合（冻结）
格式: {{"side": "red|black", "remaining": 回合数, "reason": "说明"}}
效果：指定方跳过N回合（无法走棋）

### ai_control - AI接管
格式: {{"side": "red|black", "remaining": 回合数, "reason": "说明"}}
效果：指定方的N回合由AI代为走棋

### random_moves - 随机走棋
格式: {{"side": "red|black", "remaining": 步数, "reason": "说明"}}
效果：指定方接下来N步棋随机选择合法走法

### extra_turns - 额外回合
格式: {{"side": "red|black", "remaining": 回合数, "reason": "说明"}}
效果：指定方获得N次额外回合（连续走棋）

### move_limits - 每回合步数限制
格式: {{"side": "red|black", "limit": 步数}}
效果：指定方每回合可以走N步

## AI性格配置说明（用于修改 rules.json 的 ai_difficulty.personality 字段）
预设性格类型：
- normal: 正常平衡型
- aggressive: 激进进攻型（重视进攻，中心控制）
- defensive: 保守防守型（重视防守，将帅安全）
- random: 随机瞎下型（低搜索深度，高随机度）
- custom: 自定义型

性格参数：
- type: 预设性格类型
- aggressiveness: 进攻倾向 0.0-1.0
- conservatism: 保守程度 0.0-1.0
- randomness_override: 覆盖随机度 null或0.0-1.0
- depth_override: 覆盖搜索深度 null或正整数
- value_biases: 棋子价值偏差 {{piece_type: bias_multiplier}}
- custom_prompt: 自定义提示词（字符串或null）

## 当前 board_state.json 的 mechanisms 字段
```json
{json.dumps(board_state.get("mechanisms", {}), ensure_ascii=False, indent=2)}
```

## 当前 rules.json 的 ai_difficulty.personality 字段
```json
{json.dumps(rules.get("ai_difficulty", {}).get("personality", {}), ensure_ascii=False, indent=2)}
```

## 要求
0. **优先输出 JSON Patch 数组**（RFC 6902 格式），仅描述需要修改的字段。
   你可以同时修改 board_state.json 和 rules.json，用以下格式输出：
   {{
     "board_state_patch": [ ... ],
     "rules_patch": [ ... ]
   }}
   如果无法生成 patch，再输出完整 JSON 对象。
1. 只修改需要修改的部分，保持其他部分不变
2. 确保JSON格式正确
3. 只输出JSON，不要输出其他内容"""

        # 调用CodeAI
        try:
            resp, elapsed = await self._call_deepseek(
                MECHANISM_MODIFIER_SYSTEM, user_prompt, temperature=0.2
            )
            code_gen_log["success"] = True
            code_gen_log["elapsed_time"] = elapsed
            code_gen_log["raw_output"] = resp
        except Exception as e:
            code_gen_log["success"] = False
            code_gen_log["error"] = str(e)
            return {
                "success": False,
                "type": "error",
                "message": f"AI生成失败: {e}",
                "classification": "A",
                "subtype": "A2",
            }

        # 解析输出
        parsed = self._extract_json(resp)
        if not parsed:
            return {
                "success": False,
                "type": "error",
                "message": "AI输出解析失败：无法解析为JSON",
                "classification": "A",
                "subtype": "A2",
            }

        modified_configs = {}

        # 处理 board_state 修改
        if needs_board_state:
            board_patch = parsed.get("board_state_patch")
            if board_patch and isinstance(board_patch, list):
                try:
                    valid, err = is_valid_patch(board_patch)
                    if valid:
                        board_state = apply_patch(board_state, board_patch)
                        modified_configs["board_state"] = board_state
                    else:
                        return {"success": False, "type": "error",
                                "message": f"board_state_patch格式错误: {err}",
                                "classification": "A", "subtype": "A2"}
                except Exception as e:
                    return {"success": False, "type": "error",
                            "message": f"应用board_state_patch失败: {e}",
                            "classification": "A", "subtype": "A2"}
            elif "board_state" in parsed and isinstance(parsed["board_state"], dict):
                # 全量模式
                diff_patch = generate_diff(board_state, parsed["board_state"])
                board_state = apply_patch(board_state, diff_patch)
                modified_configs["board_state"] = board_state

        # 处理 rules 修改
        if needs_rules:
            rules_patch = parsed.get("rules_patch")
            if rules_patch and isinstance(rules_patch, list):
                try:
                    valid, err = is_valid_patch(rules_patch)
                    if valid:
                        rules = apply_patch(rules, rules_patch)
                        modified_configs["rules"] = rules
                    else:
                        return {"success": False, "type": "error",
                                "message": f"rules_patch格式错误: {err}",
                                "classification": "A", "subtype": "A2"}
                except Exception as e:
                    return {"success": False, "type": "error",
                            "message": f"应用rules_patch失败: {e}",
                            "classification": "A", "subtype": "A2"}
            elif "rules" in parsed and isinstance(parsed["rules"], dict):
                diff_patch = generate_diff(rules, parsed["rules"])
                rules = apply_patch(rules, diff_patch)
                modified_configs["rules"] = rules

        # 如果两个都没改到，尝试解析为单文件patch
        if not modified_configs and isinstance(parsed, list):
            # 单文件patch模式，默认修改board_state
            try:
                valid, err = is_valid_patch(parsed)
                if valid:
                    if needs_board_state:
                        board_state = apply_patch(board_state, parsed)
                        modified_configs["board_state"] = board_state
                    elif needs_rules:
                        rules = apply_patch(rules, parsed)
                        modified_configs["rules"] = rules
            except Exception:
                pass

        if not modified_configs:
            return {
                "success": False,
                "type": "error",
                "message": "未检测到有效的修改操作",
                "classification": "A",
                "subtype": "A2",
            }

        # 验证
        if "board_state" in modified_configs:
            valid, err = validate_board_state(modified_configs["board_state"])
            if not valid:
                return {"success": False, "type": "error",
                        "message": f"board_state验证失败: {err}",
                        "classification": "A", "subtype": "A2"}

        if "rules" in modified_configs:
            valid, err = validate_rules(modified_configs["rules"])
            if not valid:
                return {"success": False, "type": "error",
                        "message": f"rules验证失败: {err}",
                        "classification": "A", "subtype": "A2"}

        # 记录patch信息到日志
        total_ops = 0
        if needs_board_state and parsed.get("board_state_patch"):
            total_ops += len(parsed["board_state_patch"])
        if needs_rules and parsed.get("rules_patch"):
            total_ops += len(parsed["rules_patch"])
        if total_ops > 0:
            code_gen_log["patch_mode"] = "patch"
            code_gen_log["patch_operations"] = total_ops
        else:
            code_gen_log["patch_mode"] = "diff"

        return {
            "success": True,
            "type": "applied",
            "message": "机制修改已应用",
            "modified_configs": modified_configs,
            "classification": "A",
            "subtype": "A2",
        }

    async def _handle_action_b_with_log(
        self, intent: dict, configs: dict, log_entry: dict
    ) -> Dict[str, Any]:
        """B类：棋盘变换（带日志）"""
        board_state = configs.get("board_state", {})
        instruction = intent.get("structured_instruction", {})
        next_prompt = intent.get("next_ai_prompt", "")
        action_str = instruction.get("action", "")
        
        # 相关性检查：如果action与棋盘变换无关，拒绝处理
        b_actions = {"add", "remove", "move", "rotate", "transform", "modify", 
                     "copy", "duplicate", "teleport", "swap", "flip", "create"}
        if action_str and not any(act in action_str.lower() for act in b_actions):
            return {
                "success": False,
                "type": "rejected",
                "message": f"B类不处理此动作: {action_str}",
                "classification": "B",
            }

        action_type = self._detect_action_type(action_str)
        log_entry.setdefault("validation", {})["action_type"] = action_type

        # 跳棋只有一种棋子类型 "piece"，纠正ChatAI可能使用的错误名称
        type_mapping = {
            "pawn": "piece",
            "rook": "piece",
            "knight": "piece",
            "bishop": "piece",
            "queen": "piece",
            "king": "piece",
            "soldier": "piece",
            "chariot": "piece",
            "horse": "piece",
            "elephant": "piece",
            "advisor": "piece",
            "general": "piece",
            "cannon": "piece",
        }

        # 检查并纠正instruction中的type名称
        params = instruction.get("parameters", {})
        if "new_type" in params:
            original_type = params["new_type"]
            corrected_type = type_mapping.get(original_type.lower(), original_type)
            if corrected_type != original_type:
                params["new_type"] = corrected_type
                log_entry["type_correction"] = f"{original_type} -> {corrected_type}"

        # 根据操作类型生成动态强调提示
        action_type_emphasis = ""
        if action_type == "add":
            action_type_emphasis = """
## ⚠️ 操作类型特别提醒（添加棋子）
- 绝对不能修改或删除已有棋子，只能添加新棋子
- 所有原有棋子必须完整保留，包括它们的ID、type、side、name、position等所有属性
- 新棋子必须添加到空位置，不能与现有存活棋子位置重叠
"""
        elif action_type == "remove":
            action_type_emphasis = """
## ⚠️ 操作类型特别提醒（删除棋子）
- 使用is_alive=false标记删除，不从数组中移除棋子对象
- 棋子的其他所有属性（id、type、side、name、position等）必须保持不变
- 不能从pieces数组中删除任何棋子对象
"""
        elif action_type == "move":
            action_type_emphasis = """
## ⚠️ 操作类型特别提醒（移动棋子）
- 只修改position字段，其他属性保持不变
- 棋子的id、type、side、name、is_alive等核心属性绝对不能修改
- 不能添加或删除任何棋子
"""
        elif action_type == "rotate":
            action_type_emphasis = """
## ⚠️ 操作类型特别提醒（旋转棋盘）
- 跳棋棋盘为六角星形，旋转操作需谨慎处理六向对称性
- 必须同时修改board配置和棋子坐标，不能只改棋子
- 所有棋子的[row, col]坐标都需要按相同旋转规则进行转换
- 棋子的其他属性（id、type、side、name、is_alive等）保持不变
"""
        elif action_type == "transform":
            action_type_emphasis = """
## ⚠️ 操作类型特别提醒（棋子类型变换）
- 跳棋只有一种棋子类型 "piece"，类型变换通常无意义
- 如必须变换，type字段只能使用 "piece"，name字段保持红方"红"/黑方"黑"
- id、side、position、is_alive 等核心属性绝对不能修改
- 棋子数量不能变化（不能新增也不能删除棋子）
- 使用 replace 操作修改 /pieces/{index}/type 和 /pieces/{index}/name
- 注意：数组索引从 0 开始
"""

        # 构建详细提示词，包含完整JSON和明确指令
        user_prompt = f"""## 修改任务
{next_prompt}

## 具体操作
- 动作: {instruction.get('action', '')}
- 目标: {instruction.get('target', '')}
- 参数: {json.dumps(params, ensure_ascii=False)}
- 约束: {json.dumps(instruction.get('constraints', []), ensure_ascii=False)}
- 操作类型: {action_type}
{action_type_emphasis}
## ⚠️ 重要提醒
跳棋只有一种棋子类型，type字段必须使用 "piece"。
- 红方棋子name字段为 "红"
- 黑方棋子name字段为 "黑"

跳棋棋盘为六角星形（hexagonal_star），坐标使用双倍列系统：
- row范围: 0-16
- col范围: 0-24（偶数行col为偶数，奇数行col为奇数）
- 红方营区: rows 0-3（顶部三角）
- 黑方营区: rows 13-16（底部三角）

绝对禁止使用 pawn、rook、bishop、knight、king、queen、soldier、chariot 等象棋术语！

## 当前board_state.json完整内容
```json
{json.dumps(board_state, ensure_ascii=False, indent=2)}
```

## 要求
0. **优先输出 JSON Patch 数组**（RFC 6902 格式），仅描述需要修改的字段，避免输出完整棋盘。格式示例：
   [{{"op": "replace", "path": "/pieces/0/position", "value": [4, 5]}}]
   如果无法生成 patch，再输出完整 JSON。
1. 请根据上述任务修改board_state.json
2. 输出修改后的完整board_state.json（包含所有棋子，不要省略任何棋子）
3. 只修改需要修改的部分，保持其他部分不变
4. 确保JSON格式正确
5. 只输出JSON，不要输出其他内容"""

        new_board, error_msg = await self._call_code_ai_with_validation(
            BOARD_TRANSFORMER_SYSTEM,
            user_prompt,
            "board_state",
            board_state,
            log_entry,
            initial_temperature=0.1,
            action_type=action_type,
        )

        if new_board is None:
            return {
                "success": False,
                "type": "error",
                "message": error_msg or "AI生成失败",
            }

        valid, err = self._validate_board(new_board, board_state, action_type)
        if not valid:
            log_entry.setdefault("validation", {})["schema_error"] = err
            return {
                "success": False,
                "type": "error",
                "message": f"验证失败: {err}",
            }

        old_pieces = len([p for p in board_state.get("pieces", []) if p.get("is_alive", True)])
        new_pieces = len([p for p in new_board.get("pieces", []) if p.get("is_alive", True)])
        if new_pieces != old_pieces:
            warning = f"棋子数量变化: 原{old_pieces}个，现{new_pieces}个"
            if "warnings" not in log_entry:
                log_entry["warnings"] = []
            log_entry["warnings"].append(warning)

        return {
            "success": True,
            "type": "applied",
            "message": intent.get("response_to_player", "棋盘已变换"),
            "modified_configs": {"board_state": new_board},
            "classification": "B",
        }

    async def _handle_action_c_with_log(
        self, intent: dict, configs: dict, log_entry: dict
    ) -> Dict[str, Any]:
        """C类：规则修改（带日志）"""
        side = intent.get("side")
        target_files = intent.get("target_files", [])

        if side == "red" or "pieces_red.json" in target_files:
            target_config_name = "pieces_red"
        elif side == "black" or "pieces_black.json" in target_files:
            target_config_name = "pieces_black"
        else:
            target_config_name = "pieces_red"

        pieces = copy.deepcopy(configs.get(target_config_name, {}))
        instruction = intent.get("structured_instruction", {})
        next_prompt = intent.get("next_ai_prompt", "")
        action_str = instruction.get("action", "")
        
        # 相关性检查：如果action与规则修改无关，拒绝处理
        c_actions = {"modify_rule", "change_move", "add_ability", "create_custom_piece",
                     "alter_movement", "modify_piece", "change_rule", "update_rule",
                     "add_move", "remove_move", "change_capture", "modify_screens"}
        if action_str and not any(act in action_str.lower() for act in c_actions):
            return {
                "success": False,
                "type": "rejected",
                "message": f"C类不处理此动作: {action_str}",
                "classification": "C",
            }

        rule_change_emphasis = """
## ⚠️ 规则修改强约束
1. 你必须对规则进行实质性修改，不能输出与输入相同的规则
2. 如果用户要求修改某方的棋子（如"红方的马"），直接修改当前文件
3. 如果用户要求"可以移动到任意一格"，可以在moves中添加自由移动
4. 修改后必须确保规则与修改前不同
5. 如果规则未变化，校验层会检测到并触发重试
"""

        side_label = "红方" if target_config_name == "pieces_red" else "黑方"
        config_filename = f"{target_config_name}.json"

        # 构建详细提示词
        user_prompt = f"""## 修改任务
{next_prompt}

## 具体操作
- 动作: {instruction.get('action', '')}
- 目标: {instruction.get('target', '')}
- 参数: {json.dumps(instruction.get('parameters', {}), ensure_ascii=False)}
- 约束: {json.dumps(instruction.get('constraints', []), ensure_ascii=False)}

{rule_change_emphasis}

## 当前{side_label}{config_filename}完整内容
```json
{json.dumps(pieces, ensure_ascii=False, indent=2)}
```

## 要求
0. **优先输出 JSON Patch 数组**（RFC 6902 格式），仅描述需要修改的字段，避免输出完整规则。格式示例：
   [{{"op": "replace", "path": "/pieces/elephant/moves/0/where", "value": []}}]
   如果无法生成 patch，再输出完整 JSON。
1. 请根据上述任务修改{config_filename}
2. 输出修改后的完整{config_filename}（包含所有棋子规则，不要省略）
3. 只修改需要修改的部分，保持其他部分不变
4. 确保JSON格式正确
5. 只输出JSON，不要输出其他内容"""

        new_pieces, error_msg = await self._call_code_ai_with_validation(
            RULE_MODIFIER_SYSTEM,
            user_prompt,
            target_config_name,
            pieces,
            log_entry,
            initial_temperature=0.1,
            rule_change_check=True,
            target_type=instruction.get("target", None),
        )

        if new_pieces is None:
            return {
                "success": False,
                "type": "error",
                "message": error_msg or "AI生成失败",
            }

        # 更新自定义规则记录
        board = copy.deepcopy(configs.get("board_state", {}))
        action_desc = intent.get("structured_instruction", {}).get("action", "")
        if action_desc and board.get("game_status"):
            board["game_status"].setdefault("custom_rules_active", []).append(
                f"[{side_label}]{action_desc}"
            )

        return {
            "success": True,
            "type": "applied",
            "message": intent.get("response_to_player", f"{side_label}规则已修改"),
            "modified_configs": {
                target_config_name: new_pieces,
                "board_state": board,
            },
            "classification": "C",
        }

    async def _handle_action_cp_with_log(
        self, intent: dict, configs: dict, log_entry: dict
    ) -> Dict[str, Any]:
        """C+类：自定义棋子创建（带日志）

        遵循灵活编码原则：AI基于 jump/ray 原语组合生成新棋子规则。
        CodeAI同时生成 pieces 的 custom_pieces 条目 和 board_state 的棋子实例。
        """
        code_gen_log = log_entry.setdefault("code_generation", {})

        side = intent.get("side")
        target_files = intent.get("target_files", [])

        if side == "red" or "pieces_red.json" in target_files:
            target_config_name = "pieces_red"
        elif side == "black" or "pieces_black.json" in target_files:
            target_config_name = "pieces_black"
        else:
            target_config_name = "pieces_red"

        pieces = copy.deepcopy(configs.get(target_config_name, {}))
        board_state = copy.deepcopy(configs.get("board_state", {}))

        instruction = intent.get("structured_instruction", {})
        next_prompt = intent.get("next_ai_prompt", "")
        action_str = instruction.get("action", "")
        
        # 相关性检查：如果action不是创建新棋子，拒绝处理
        cp_actions = {"create_custom_piece", "create", "invent", "make", "add_new_piece", "new_piece"}
        if action_str and not any(act in action_str.lower() for act in cp_actions):
            return {
                "success": False,
                "type": "rejected",
                "message": f"C+类不处理此动作: {action_str}",
                "classification": "C+",
            }

        params = instruction.get("parameters", {})

        # 跳棋只有一种预定义棋子类型 "piece"
        predefined_types = {"piece"}

        side_label = "红方" if target_config_name == "pieces_red" else "黑方"
        config_filename = f"{target_config_name}.json"

        user_prompt = f"""## 创建任务
{next_prompt}

## 具体操作
- 动作: {instruction.get('action', '')}
- 目标: {instruction.get('target', '')}
- 参数: {json.dumps(params, ensure_ascii=False)}
- 约束: {json.dumps(instruction.get('constraints', []), ensure_ascii=False)}

## 当前 {side_label}{config_filename} 完整内容
```json
{json.dumps(pieces, ensure_ascii=False, indent=2)}
```

## 当前 board_state.json 摘要
- 棋盘类型: 六角星形（hexagonal_star）
- 棋盘坐标系统: 双倍列（doubled_column）
- row范围: 0-16, col范围: 0-24
- 偶数行col为偶数, 奇数行col为奇数
- 现有棋子数量: {len([p for p in board_state.get('pieces', []) if p.get('is_alive', True)])}

## 已存在的棋子类型（新棋子type不能与这些冲突）
{', '.join(sorted(predefined_types | {cp.get('type', '') for cp in pieces.get('custom_pieces', [])}))}

## 跳棋移动原语（创建新棋子时必须基于以下原语组合）
- step: 向相邻空位移动一格
  - 字段: {{"kind": "step", "land": "empty", "sym": "hex6"}}
  - land: empty（仅落到空位）或 any（可落到任何位置）
  - sym: hex6（六向展开）或 none（不展开）
- hop: 隔子跳跃，chain=true可连续跳跃
  - 字段: {{"kind": "hop", "land": "empty", "chain": true, "sym": "hex6"}}
  - chain: true（可连续跳跃）或 false（单次跳跃）
  - 跳过的棋子不被吃掉，仍保留在原位

## 要求
1. 根据玩家描述创建新棋子，输出包含 pieces_patch 和 board_state_patch 两个字段的JSON对象
2. 新棋子的 type 字段必须是英文标识符，不能与已存在的类型冲突（不能是 "piece"）
3. 移动规则必须基于 step/hop 原语组合生成
4. 复合移动能力使用多个move定义
5. 棋子位置必须在棋盘范围内（row 0-16, col 0-24）且不与现有棋子重叠
6. 新棋子位置必须是六角星棋盘上的合法位置（参考board.json的positions字段）
7. 只输出JSON对象，不要输出其他内容"""

        # 调用CodeAI（不使用_call_code_ai_with_validation，因为输出格式特殊）
        self.thinking_stage = "code"
        try:
            resp, elapsed = await self._call_deepseek(
                PIECE_CREATOR_SYSTEM, user_prompt, temperature=0.1
            )
            code_gen_log["success"] = True
            code_gen_log["elapsed_time"] = elapsed
            code_gen_log["raw_output"] = resp
        except Exception as e:
            code_gen_log["success"] = False
            code_gen_log["error"] = str(e)
            return {
                "success": False,
                "type": "error",
                "message": f"AI生成失败: {e}",
                "classification": "C+",
            }

        # 解析输出：期望 {"pieces_patch": [...], "board_state_patch": [...]}
        parsed = self._extract_json(resp)
        if not parsed or not isinstance(parsed, dict):
            code_gen_log["parse_error"] = "无法解析为JSON对象"
            return {
                "success": False,
                "type": "error",
                "message": "AI输出解析失败：期望包含 pieces_patch 和 board_state_patch 的JSON对象",
                "classification": "C+",
            }

        pieces_patch = parsed.get("pieces_patch")
        board_state_patch = parsed.get("board_state_patch")

        if not isinstance(pieces_patch, list) or not isinstance(board_state_patch, list):
            code_gen_log["parse_error"] = f"patch字段类型错误: pieces_patch={type(pieces_patch).__name__}, board_state_patch={type(board_state_patch).__name__}"
            return {
                "success": False,
                "type": "error",
                "message": "AI输出格式错误：pieces_patch 和 board_state_patch 必须是数组",
                "classification": "C+",
            }

        code_gen_log["patch_mode"] = "patch"
        code_gen_log["pieces_patch_operations"] = len(pieces_patch)
        code_gen_log["board_state_patch_operations"] = len(board_state_patch)
        code_gen_log["patch_operations_detail"] = pieces_patch + board_state_patch

        # 应用patch
        try:
            from json_patch_utils import apply_patch, is_valid_patch

            valid_pr, err_pr = is_valid_patch(pieces_patch)
            if not valid_pr:
                code_gen_log["patch_apply_error"] = f"pieces_patch格式错误: {err_pr}"
                return {
                    "success": False,
                    "type": "error",
                    "message": f"pieces_patch格式错误: {err_pr}",
                    "classification": "C+",
                }

            valid_bs, err_bs = is_valid_patch(board_state_patch)
            if not valid_bs:
                code_gen_log["patch_apply_error"] = f"board_state_patch格式错误: {err_bs}"
                return {
                    "success": False,
                    "type": "error",
                    "message": f"board_state_patch格式错误: {err_bs}",
                    "classification": "C+",
                }

            new_pieces = apply_patch(pieces, pieces_patch)
            new_board_state = apply_patch(board_state, board_state_patch)
        except Exception as e:
            code_gen_log["patch_apply_error"] = str(e)
            return {
                "success": False,
                "type": "error",
                "message": f"应用patch失败: {e}",
                "classification": "C+",
            }

        # 校验新增的 custom_pieces 条目
        new_custom_pieces = new_pieces.get("custom_pieces", [])
        old_custom_pieces = pieces.get("custom_pieces", [])
        added_pieces = new_custom_pieces[len(old_custom_pieces):] if len(new_custom_pieces) > len(old_custom_pieces) else new_custom_pieces

        validation_errors = []
        for cp in added_pieces:
            cp_type = cp.get("type", "")
            cp_moves = cp.get("moves", [])

            if cp_type in predefined_types:
                validation_errors.append(f"新棋子type '{cp_type}' 与预定义类型冲突")

            for move in cp_moves:
                kind = move.get("kind", "")
                if kind not in ("step", "hop"):
                    validation_errors.append(f"新棋子 '{cp_type}' 的 move.kind '{kind}' 不是合法值（合法值: step/hop）")

        # 校验新增的棋子实例
        new_board_pieces = new_board_state.get("pieces", [])

        existing_ids = {p.get("id") for p in board_state.get("pieces", [])}
        added_instances = [p for p in new_board_pieces if p.get("id") not in existing_ids]

        alive_positions = {
            tuple(p["position"]) for p in board_state.get("pieces", []) if p.get("is_alive", True)
        }

        for inst in added_instances:
            inst_type = inst.get("type", "")
            inst_position = inst.get("position", [])

            all_valid_types = predefined_types | {cp.get("type") for cp in new_custom_pieces}
            if inst_type not in all_valid_types:
                validation_errors.append(f"新棋子实例 type '{inst_type}' 未在 custom_pieces 中定义")

            if len(inst_position) != 2:
                validation_errors.append(f"新棋子实例 '{inst.get('id')}' 的 position 格式错误")
            else:
                x, y = inst_position  # x=row, y=col
                if not (0 <= x <= 16 and 0 <= y <= 24):
                    validation_errors.append(f"新棋子实例 '{inst.get('id')}' 的位置 [{x},{y}] 超出棋盘范围 (row 0-16, col 0-24)")

                if tuple(inst_position) in alive_positions:
                    validation_errors.append(f"新棋子实例 '{inst.get('id')}' 的位置 [{x},{y}] 与现有棋子重叠")

            if len(inst_position) == 2:
                alive_positions.add(tuple(inst_position))

        if validation_errors:
            log_entry.setdefault("validation", {})["errors"] = validation_errors
            log_entry.setdefault("validation", {})["success"] = False
            return {
                "success": False,
                "type": "error",
                "message": "校验失败: " + "; ".join(validation_errors),
                "classification": "C+",
            }

        valid_board, err_board = self._validate_board(new_board_state, board_state, "add")
        if not valid_board:
            log_entry.setdefault("validation", {})["schema_error"] = err_board
            return {
                "success": False,
                "type": "error",
                "message": f"棋盘验证失败: {err_board}",
                "classification": "C+",
            }

        log_entry.setdefault("validation", {})["success"] = True

        action_desc = instruction.get("action", "")
        if action_desc and new_board_state.get("game_status"):
            new_board_state["game_status"].setdefault("custom_rules_active", []).append(
                f"[{side_label}]{action_desc}"
            )

        return {
            "success": True,
            "type": "applied",
            "message": intent.get("response_to_player", f"{side_label}新棋子已创建"),
            "modified_configs": {
                target_config_name: new_pieces,
                "board_state": new_board_state,
            },
            "classification": "C+",
        }

    def _ensure_side_overrides(self, rules: dict) -> bool:
        """
        确保 piece_rules 中包含完整的 side_overrides 结构。

        如果 side_overrides 缺失或结构不正确，会补全为 {"red": {}, "black": {}}。
        原地修改 rules 字典。

        Returns:
            True 表示进行了补全/修复，False 表示结构已完整无需修改。
        """
        fixed = False
        so = rules.get("side_overrides")
        if not isinstance(so, dict):
            rules["side_overrides"] = {"red": {}, "black": {}}
            return True
        if "red" not in so or not isinstance(so.get("red"), dict):
            so["red"] = {}
            fixed = True
        if "black" not in so or not isinstance(so.get("black"), dict):
            so["black"] = {}
            fixed = True
        return fixed

    async def _handle_action_d_with_log(
        self, intent: dict, configs: dict, log_entry: dict
    ) -> Dict[str, Any]:
        """D类：界面修改（带日志）"""
        instruction = intent.get("structured_instruction", {})
        next_prompt = intent.get("next_ai_prompt", "")
        target_files = intent.get("target_files", [])
        target = instruction.get("target", "")
        action = instruction.get("action", "")
        parameters = instruction.get("parameters", {})
        
        # 相关性检查：如果action与界面修改无关，拒绝处理
        d_actions = {"change_color", "modify_style", "change_theme", "modify_layout",
                     "update_appearance", "change_font", "modify_board", "customize",
                     "update_ui", "style_change", "appearance"}
        if action and not any(act in action.lower() for act in d_actions):
            # 检查target是否与界面相关
            d_targets = {"board", "ui", "theme", "style", "layout", "appearance", 
                         "color", "font", "background", "visual", "display"}
            if target and not any(t in target.lower() for t in d_targets):
                return {
                    "success": False,
                    "type": "rejected",
                    "message": f"D类不处理此动作/目标: {action} / {target}",
                    "classification": "D",
                }

        # 检测目标配置文件
        target_config_name = "ui_config"
        if "board.json" in target_files or "board" in target.lower() or "board_layout" in target.lower():
            target_config_name = "board"

        config_data = configs.get(target_config_name, {})
        config_filename = f"{target_config_name}.json"

        # 检测是否涉及棋盘尺寸修改（跳棋六角星棋盘尺寸修改较复杂，不自动同步board_state）
        board_size_keywords = [
            "add_column", "add_row", "expand_board", "remove_column", "remove_row",
            "widen", "narrow", "resize", "change_size", "拓宽", "增加行", "增加列",
            "减少行", "减少列", "扩大", "缩小"
        ]
        is_board_size_change = any(kw in action.lower() for kw in board_size_keywords) or \
                               any(kw in str(next_prompt).lower() for kw in ["拓宽", "增加一竖", "增加一行", "增加列", "增加行", "board_width", "board_height", "grid_columns", "grid_rows"])

        # 跳棋六角星棋盘不支持简单尺寸修改（坐标系统和邻接表是程序生成的）
        # 仅在视觉配置层面修改 appearance
        auto_board_state_update = None

        # 构建详细提示词
        size_change_note = ""
        if is_board_size_change:
            size_change_note = f"""
## ⚠️ 重要提醒：跳棋棋盘尺寸修改
跳棋使用六角星形棋盘，坐标系统和邻接表是程序生成的。
- board.json 的 appearance 字段包含视觉配置（layout.viewbox_* 等）
- 修改尺寸主要影响视觉表现（如缩放、padding）
- 不能简单增减 geometry.rows 或 max_col（会破坏邻接关系）
- **不要输出空的 patch 数组！至少要输出一个操作（即使只是保持原值的 replace）**
"""

        user_prompt = f"""## 修改任务
{next_prompt}

## 具体操作
- 动作: {action}
- 目标: {target}
- 参数: {json.dumps(parameters, ensure_ascii=False)}
{size_change_note}
## 当前{config_filename}完整内容
```json
{json.dumps(config_data, ensure_ascii=False, indent=2)}
```

## 要求
0. **优先输出 JSON Patch 数组**（RFC 6902 格式），仅描述需要修改的字段，避免输出完整配置。格式示例：
   [{{"op": "replace", "path": "/appearance/background_color", "value": "#abcdef"}}]
   如果无法生成 patch，再输出完整 JSON。
1. 请根据上述任务修改{config_filename}
2. 输出修改后的完整{config_filename}
3. 只修改需要修改的部分，保持其他部分不变
4. 确保JSON格式正确
5. 只输出JSON，不要输出其他内容"""

        new_config, error_msg = await self._call_code_ai_with_validation(
            UI_MODIFIER_SYSTEM,
            user_prompt,
            target_config_name,
            config_data,
            log_entry,
            initial_temperature=0.2,
        )

        if new_config is None:
            return {
                "success": False,
                "type": "error",
                "message": error_msg or "AI生成失败",
            }

        modified_configs = {target_config_name: new_config}
        if auto_board_state_update is not None:
            modified_configs["board_state"] = auto_board_state_update

        return {
            "success": True,
            "type": "applied",
            "message": intent.get("response_to_player", "界面已修改"),
            "modified_configs": modified_configs,
            "classification": "D",
        }

    async def _handle_action_d2_with_log(
        self, intent: dict, configs: dict, log_entry: dict
    ) -> Dict[str, Any]:
        """处理D2类：HTML结构修改（通过区段替换 index.html）"""
        code_gen_log = log_entry.setdefault("code_generation", {})
        instruction = intent.get("structured_instruction", {})
        target_sections = instruction.get("target_sections", [])
        user_command = intent.get("response_to_player", "")
        next_prompt = intent.get("next_ai_prompt", "")
        action = instruction.get("action", "")
        
        # 相关性检查：如果action与HTML修改无关，拒绝处理
        d2_actions = {"modify_html", "add_element", "remove_element", "update_html",
                      "change_html", "edit_section", "modify_structure", "add_button",
                      "add_panel", "update_ui"}
        if action and not any(act in action.lower() for act in d2_actions):
            return {
                "success": False,
                "type": "rejected",
                "message": f"D2类不处理此动作: {action}",
                "classification": "D",
            }

        # 读取当前index.html
        html_path = STATIC_DIR / "index.html"
        if not html_path.exists():
            return {
                "success": False,
                "type": "error",
                "message": "index.html 文件不存在",
                "classification": "D",
            }

        html_content = html_path.read_text(encoding="utf-8")

        # 提取目标区段的当前内容
        sections = {}
        for section_name in target_sections:
            pattern = rf"<!-- SECTION: {re.escape(section_name)} -->(.*?)<!-- END: {re.escape(section_name)} -->"
            match = re.search(pattern, html_content, re.DOTALL)
            if match:
                sections[section_name] = match.group(1).strip()

        if not sections:
            log_entry["errors"] = log_entry.get("errors", [])
            log_entry["errors"].append(
                f"未找到目标区段：{target_sections}"
            )
            return {
                "success": False,
                "type": "error",
                "message": f"未找到目标HTML区段：{', '.join(target_sections)}",
                "classification": "D",
            }

        # 构造CodeAI prompt
        user_prompt = f"""## 修改任务
{next_prompt}

## 用户请求
{user_command}

## 具体操作
- 动作: {instruction.get('action', '')}
- 目标: {instruction.get('target', '')}
- 参数: {json.dumps(instruction.get('parameters', {}), ensure_ascii=False)}

## 需要修改的HTML区段：
"""
        for name, content in sections.items():
            user_prompt += f"\n--- 区段: {name} ---\n{content}\n"

        user_prompt += """

## 要求
请输出修改后的区段内容。格式为JSON对象：
```json
{
  "section_name": "修改后的完整HTML内容",
  ...
}
```
只输出需要修改的区段，不需要修改的区段不要输出。不需要包含 <!-- SECTION --> 和 <!-- END --> 注释标记（系统会自动包裹）。"""

        # 调用CodeAI
        try:
            response, elapsed = await self._call_deepseek(
                UI_MODIFIER_SYSTEM, user_prompt, temperature=0.2
            )
        except Exception as e:
            code_gen_log["success"] = False
            code_gen_log["error"] = str(e)
            return {
                "success": False,
                "type": "error",
                "message": f"AI生成失败: {e}",
                "classification": "D",
            }

        code_gen_log["success"] = True
        code_gen_log["elapsed_time"] = elapsed
        code_gen_log["raw_output"] = response

        # 解析输出
        modified_sections = self._extract_json(response)
        if not modified_sections or not isinstance(modified_sections, dict):
            code_gen_log["parse_error"] = "无法解析为JSON对象"
            return {
                "success": False,
                "type": "error",
                "message": "AI输出解析失败：期望JSON对象",
                "classification": "D",
            }

        code_gen_log["parsed_sections"] = list(modified_sections.keys())
        code_gen_log["modified_sections_detail"] = modified_sections

        # 应用替换：将新内容替换回 index.html 的对应区段
        for section_name, new_content in modified_sections.items():
            if not isinstance(new_content, str):
                continue
            # 清理AI可能误加的 SECTION/END 标记
            cleaned = re.sub(
                rf"<!-- SECTION: {re.escape(section_name)} -->\s*",
                "",
                new_content,
            )
            cleaned = re.sub(
                rf"\s*<!-- END: {re.escape(section_name)} -->",
                "",
                cleaned,
            ).strip()
            pattern = rf"(<!-- SECTION: {re.escape(section_name)} -->)(.*?)(<!-- END: {re.escape(section_name)} -->)"
            # 使用函数替换，避免 new_content 中的反斜杠被当作反向引用
            html_content = re.sub(
                pattern,
                lambda m, c=cleaned: f"{m.group(1)}\n{c}\n{m.group(3)}",
                html_content,
                flags=re.DOTALL,
            )

        # 保存修改后的 index.html
        html_path.write_text(html_content, encoding="utf-8")

        return {
            "success": True,
            "type": "applied",
            "message": f"已修改HTML区段：{', '.join(modified_sections.keys())}，请刷新页面查看",
            "modified_configs": {},
            "classification": "D",
            "refresh_page": True,
        }

    def _validate_board(
        self, new_board: dict, old_board: dict, action_type: str = "unknown"
    ) -> Tuple[bool, str]:
        valid, err = validate_board_state(new_board)
        if not valid:
            return False, err

        old_pieces = old_board.get("pieces", [])
        new_pieces = new_board.get("pieces", [])

        old_piece_map = {p["id"]: p for p in old_pieces}
        new_piece_map = {p["id"]: p for p in new_pieces}

        core_attrs = ["id", "type", "side", "name"]

        if action_type == "add":
            old_alive_ids = [p["id"] for p in old_pieces if p.get("is_alive", True)]
            missing = [pid for pid in old_alive_ids if pid not in new_piece_map]
            if missing:
                return False, f"棋子丢失: {', '.join(missing)}"

            for pid in old_alive_ids:
                old_p = old_piece_map[pid]
                new_p = new_piece_map[pid]
                for attr in core_attrs:
                    if old_p.get(attr) != new_p.get(attr):
                        return False, f"棋子属性被篡改: {pid}的{attr}从{old_p.get(attr)}变为{new_p.get(attr)}"

            old_count = len(old_alive_ids)
            new_count = len([p for p in new_pieces if p.get("is_alive", True)])
            if new_count < old_count:
                return False, f"棋子数量减少: 原{old_count}个，现{new_count}个"

        elif action_type == "remove":
            old_ids = [p["id"] for p in old_pieces]
            missing = [pid for pid in old_ids if pid not in new_piece_map]
            if missing:
                return False, f"棋子丢失: {', '.join(missing)}"

            for pid in old_ids:
                old_p = old_piece_map[pid]
                new_p = new_piece_map[pid]
                for attr in core_attrs:
                    if old_p.get(attr) != new_p.get(attr):
                        return False, f"棋子属性被篡改: {pid}的{attr}从{old_p.get(attr)}变为{new_p.get(attr)}"

        elif action_type == "move":
            old_ids = [p["id"] for p in old_pieces]
            missing = [pid for pid in old_ids if pid not in new_piece_map]
            if missing:
                return False, f"棋子丢失: {', '.join(missing)}"

            for pid in old_ids:
                old_p = old_piece_map[pid]
                new_p = new_piece_map[pid]
                for attr in core_attrs:
                    if old_p.get(attr) != new_p.get(attr):
                        return False, f"棋子属性被篡改: {pid}的{attr}从{old_p.get(attr)}变为{new_p.get(attr)}"

        elif action_type == "rotate":
            old_ids = [p["id"] for p in old_pieces]
            missing = [pid for pid in old_ids if pid not in new_piece_map]
            if missing:
                return False, f"棋子丢失: {', '.join(missing)}"

            for pid in old_ids:
                old_p = old_piece_map[pid]
                new_p = new_piece_map[pid]
                for attr in core_attrs:
                    if old_p.get(attr) != new_p.get(attr):
                        return False, f"棋子属性被篡改: {pid}的{attr}从{old_p.get(attr)}变为{new_p.get(attr)}"

        elif action_type == "modify":
            old_ids = [p["id"] for p in old_pieces]
            missing = [pid for pid in old_ids if pid not in new_piece_map]
            if missing:
                return False, f"棋子丢失: {', '.join(missing)}"

        elif action_type == "transform":
            old_ids = [p["id"] for p in old_pieces]
            missing = [pid for pid in old_ids if pid not in new_piece_map]
            if missing:
                return False, f"棋子丢失: {', '.join(missing)}"

            old_count = len([p for p in old_pieces if p.get("is_alive", True)])
            new_count = len([p for p in new_pieces if p.get("is_alive", True)])
            if old_count != new_count:
                return False, f"棋子数量变化: 原{old_count}个，现{new_count}个"

            for pid in old_ids:
                old_p = old_piece_map[pid]
                new_p = new_piece_map[pid]
                if old_p.get("id") != new_p.get("id"):
                    return False, f"棋子ID被篡改: {pid}的id从{old_p.get('id')}变为{new_p.get('id')}"
                if old_p.get("side") != new_p.get("side"):
                    return False, f"棋子阵营被篡改: {pid}的side从{old_p.get('side')}变为{new_p.get('side')}"
                if old_p.get("position") != new_p.get("position"):
                    return False, f"棋子位置被改变（transform只改变类型，不改变位置）: {pid}"
                if old_p.get("is_alive") != new_p.get("is_alive"):
                    return False, f"棋子存活状态被改变: {pid}"

        elif action_type == "unknown":
            old_ids = [p["id"] for p in old_pieces]
            missing = [pid for pid in old_ids if pid not in new_piece_map]
            if missing:
                return False, f"棋子丢失: {', '.join(missing)}"

            for pid in old_ids:
                old_p = old_piece_map[pid]
                new_p = new_piece_map[pid]
                if old_p.get("id") != new_p.get("id"):
                    return False, f"棋子ID被篡改: {pid}的id从{old_p.get('id')}变为{new_p.get('id')}"
                if old_p.get("side") != new_p.get("side"):
                    return False, f"棋子阵营被篡改: {pid}的side从{old_p.get('side')}变为{new_p.get('side')}"

        return True, ""

    def _validate_rules(self, rules: dict) -> Tuple[bool, str]:
        """验证棋子配置"""
        return validate_pieces(rules)

    def _validate_rule_change(self, old_rules: dict, new_rules: dict, target_type: str = None) -> Tuple[bool, str]:
        """
        检测规则是否发生了实质性变化，并验证结构完整性
        
        Args:
            old_rules: 修改前的规则
            new_rules: 修改后的规则
            target_type: 目标棋子类型（可选，如果指定则只检查该类型）
        
        Returns:
            (valid, message) - valid=True表示规则发生了变化且结构完整，valid=False表示规则未变化或结构不完整
        """
        if "side_overrides" not in new_rules:
            return False, "缺少 side_overrides 字段，该字段必须保留"

        new_side_overrides = new_rules.get("side_overrides")
        if not isinstance(new_side_overrides, dict):
            return False, "side_overrides 必须是对象类型"

        if "red" not in new_side_overrides:
            return False, "side_overrides 缺少 red 字段，必须保留 red 和 black 两个子对象"

        if "black" not in new_side_overrides:
            return False, "side_overrides 缺少 black 字段，必须保留 red 和 black 两个子对象"

        if not isinstance(new_side_overrides.get("red"), dict):
            return False, "side_overrides.red 必须是对象类型"

        if not isinstance(new_side_overrides.get("black"), dict):
            return False, "side_overrides.black 必须是对象类型"

        old_rules_dict = old_rules.get("pieces", {})
        new_rules_dict = new_rules.get("pieces", {})
        
        if target_type:
            old_rule = old_rules_dict.get(target_type, {})
            new_rule = new_rules_dict.get(target_type, {})
            
            old_movement = old_rule.get("moves", [])
            new_movement = new_rule.get("moves", [])
            old_custom = old_rule.get("custom_modifiers", [])
            new_custom = new_rule.get("custom_modifiers", [])
            
            if old_movement == new_movement and old_custom == new_custom:
                old_overrides = old_rules.get("side_overrides", {})
                new_overrides = new_rules.get("side_overrides", {})
                for side in ["red", "black"]:
                    old_side_rules = old_overrides.get(side, {}).get(target_type, {})
                    new_side_rules = new_overrides.get(side, {}).get(target_type, {})
                    if old_side_rules != new_side_rules:
                        return True, f"阵营规则{side}.{target_type}发生变化"
                
                return False, f"规则{target_type}未发生实质性变化"
            
            return True, f"规则{target_type}发生变化"
        
        else:
            if old_rules_dict != new_rules_dict:
                return True, "规则发生变化"
            
            old_overrides = old_rules.get("side_overrides", {})
            new_overrides = new_rules.get("side_overrides", {})
            if old_overrides != new_overrides:
                return True, "阵营规则发生变化"
            
            return False, "规则未发生实质性变化"

    async def _call_code_ai_with_validation(
        self,
        system_prompt: str,
        user_prompt: str,
        config_name: str,
        original_config: dict,
        log_entry: dict,
        initial_temperature: float = 0.1,
        action_type: str = "unknown",
        rule_change_check: bool = False,
        target_type: str = None,
    ) -> Tuple[Optional[dict], Optional[str]]:
        """
        调用CodeAI并进行校验和重试

        Args:
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            config_name: 配置名称
            original_config: 原始配置
            log_entry: 日志条目
            action_type: 操作类型（add/remove/move/rotate/modify/unknown）
            rule_change_check: 是否检查规则变化（仅适用于C类规则修改）
            target_type: 目标棋子类型（规则变化检查时使用）

        Returns:
            (new_config, error_msg)
        """
        max_retries = 2
        code_gen_log = log_entry.setdefault("code_generation", {})
        validation_log = log_entry.setdefault("validation", {
            "success": False,
            "elapsed_time": 0.0,
            "errors": [],
            "warnings": [],
            "retry_count": 0,
        })

        current_prompt = user_prompt
        current_temp = initial_temperature
        all_errors: List[str] = []
        all_warnings: List[str] = []
        total_validation_time = 0.0
        retry_count = 0
        last_resp = ""
        last_elapsed = 0.0

        for attempt in range(max_retries + 1):
            self.thinking_stage = "code"

            try:
                resp, elapsed = await self._call_deepseek(
                    system_prompt, current_prompt, temperature=current_temp
                )
                last_resp = resp
                last_elapsed = elapsed
            except Exception as e:
                if attempt == 0:
                    code_gen_log["success"] = False
                    code_gen_log["error"] = str(e)
                return None, f"AI生成失败: {e}"

            if attempt == 0:
                code_gen_log["success"] = True
                code_gen_log["elapsed_time"] = elapsed
                code_gen_log["raw_output"] = resp
            else:
                code_gen_log[f"retry_{attempt}_raw_output"] = resp
                code_gen_log[f"retry_{attempt}_elapsed_time"] = elapsed

            # 无论校验是否通过，都尝试提取 patch/diff 操作记录到日志（用于前端显示）
            try:
                self._log_code_diff_for_display(resp, code_gen_log, attempt)
            except Exception as log_err:
                code_gen_log.setdefault("log_display_error", str(log_err))

            # 应用 patch/diff
            try:
                new_config, parse_err = self._apply_patch_or_diff(
                    original_config, resp, config_name, log_entry
                )
            except Exception as parse_exc:
                new_config = None
                parse_err = f"解析过程异常: {parse_exc}"
            if new_config is None:
                all_errors.append(f"输出解析失败: {parse_err}")
                if attempt < max_retries:
                    retry_count += 1
                    current_temp = min(current_temp + 0.1, 0.3)
                    current_prompt = self._generate_retry_prompt(
                        current_prompt, [f"输出解析失败: {parse_err}"]
                    )
                    continue
                else:
                    validation_log["success"] = False
                    validation_log["errors"] = all_errors
                    return None, f"重试{max_retries}次后仍失败: {parse_err}"

            # Schema 硬检查
            schema_valid, schema_err = self._hard_validate_config(config_name, new_config)
            if not schema_valid:
                all_errors.append(f"Schema校验失败: {schema_err}")
                if attempt < max_retries:
                    retry_count += 1
                    current_temp = min(current_temp + 0.1, 0.3)
                    current_prompt = self._generate_retry_prompt(
                        current_prompt, [f"Schema校验失败: {schema_err}"]
                    )
                    continue
                else:
                    validation_log["success"] = False
                    validation_log["errors"] = all_errors
                    validation_log["retry_count"] = retry_count
                    return None, f"Schema校验失败，重试{max_retries}次后仍有错误: {schema_err}"

            # 规则变化检查（仅C类规则修改）
            if rule_change_check and config_name == "pieces":
                rule_changed, change_msg = self._validate_rule_change(
                    original_config, new_config, target_type
                )
                if not rule_changed:
                    all_errors.append(change_msg)
                    if attempt < max_retries:
                        retry_count += 1
                        current_temp = min(current_temp + 0.1, 0.3)
                        current_prompt = self._generate_retry_prompt(
                            current_prompt, [change_msg]
                        )
                        continue
                    else:
                        validation_log["success"] = False
                        validation_log["errors"] = all_errors
                        return None, f"规则未发生实质性变化，重试{max_retries}次后仍未修改"

            validation_log["success"] = True
            validation_log["elapsed_time"] = total_validation_time
            validation_log["errors"] = all_errors
            validation_log["warnings"] = all_warnings
            validation_log["retry_count"] = retry_count
            code_gen_log["parsed_json"] = new_config
            return new_config, None

        return None, "未知错误"
