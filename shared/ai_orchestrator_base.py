"""
AI 编排器 —— 共享基类（AIOrchestratorBase）。

────────────────────────────────────────────────────────────────────
【本文件的由来 —— 复用逻辑说明】

    本模块是从 12 份 ai_orchestrator.py（顶层 6 棋类 + sandbox 6 副本）
    中提取的公共基类。这些文件每个约 2500 行，经 difflib 方法级量化，
    有 17 个「纯基础设施」方法在所有 6 个顶层棋类中 100% 逐字节相同：

        ConversationLog（4 个方法）：对话日志记录器
        _record_token_usage / _get_headers / _call_deepseek：
            DeepSeek API 调用与 token 统计
        _extract_json / _extract_json_patch / _apply_patch_or_diff：
            AI 输出的 JSON / JSON Patch 解析与落盘
        _merge_action_results / _deep_merge_board_state：
            多 action 结果合并
        _find_piece / _detect_action_type：棋子查找与操作类型识别
        _generate_retry_prompt / _hard_validate_config：
            重试提示词构造与硬编码 Schema 校验
        _log_code_diff_for_display：前端展示用 diff 日志
        get_thinking_status / get_token_stats / get_logs：状态与统计查询

    这些方法与棋类无关、与业力无关，被原样复制 12 遍是纯重复。上移后，
    各棋类的 ai_orchestrator.py 仅需继承本基类并保留「棋类专属逻辑」
    （_get_board_summary、各类 action handler）与「业力/技能树逻辑」。

【与子类的边界】
    保留在子类（差异点）：
        - __init__：karma_assessor 初始化（顶层有 / sandbox 无）
        - set_api_key：是否同步 karma_assessor（顶层有 / sandbox 无）
        - process_command / _execute_action：业力评估与技能树门控
        - _parse_intent_with_log / _get_board_summary / 各类 _handle_action_*：
            棋类专属 prompt 与操作处理
        - _validate_board / _validate_rules / _validate_rule_change /
          _call_code_ai_with_validation：含棋类差异

【参数化点】
    DEFAULT_MODEL：顶层用 "deepseek-v4-flash"，sandbox 用 "deepseek-chat"。
    基类 __init__ 接收 base_dir（棋类目录），用于定位 configs/token_stats.json。

【行为等价性约束】
    除 BASE_DIR → self.base_dir、model 默认值 → DEFAULT_MODEL 两处参数化外，
    其余方法体与原 xiangqi 版本逐字节等价；任何棋类对外行为不得改变。
────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

# 共享模块的相对导入（调用方需先将 shared/ 加入 sys.path 或作为包导入）
try:
    from .json_patch_utils import apply_patch, generate_diff, is_valid_patch
    from .schema_validator import (
        validate_board,
        validate_board_state,
        validate_pieces,
        validate_rules,
        validate_ui_config,
    )
except ImportError:  # Fallback：shared/ 已在 sys.path 时
    from json_patch_utils import apply_patch, generate_diff, is_valid_patch  # type: ignore
    from schema_validator import (  # type: ignore
        validate_board,
        validate_board_state,
        validate_pieces,
        validate_rules,
        validate_ui_config,
    )


class ConversationLog:
    """对话日志记录器"""

    def __init__(self):
        self.logs: List[Dict[str, Any]] = []
        self.max_logs = 50

    def add_log(self, log_entry: Dict[str, Any]):
        """添加日志条目"""
        log_entry["timestamp"] = datetime.now().isoformat()
        self.logs.append(log_entry)
        if len(self.logs) > self.max_logs:
            self.logs.pop(0)

    def get_logs(self, count: int = 10) -> List[Dict[str, Any]]:
        """获取最近N条日志"""
        return self.logs[-count:]

    def get_last_log(self) -> Optional[Dict[str, Any]]:
        """获取最后一条日志"""
        return self.logs[-1] if self.logs else None

    def clear(self):
        """清空日志"""
        self.logs = []


class AIOrchestratorBase:
    """AI 编排器共享基类，承载与棋类/业力无关的基础设施方法。

    子类契约：
        1. __init__ 中先调用 super().__init__(base_dir=BASE_DIR, api_key=api_key)
        2. 再初始化棋类专属属性（如 karma_assessor）
        3. 实现 / 覆盖棋类专属方法（_get_board_summary、action handler 等）
    """

    # DeepSeek 模型：顶层用 v4-flash，sandbox 覆盖为 deepseek-chat。
    DEFAULT_MODEL: str = "deepseek-v4-flash"

    def __init__(self, base_dir: Path, api_key: str = ""):
        self.base_dir = Path(base_dir)
        self.api_key = api_key
        self.base_url = "https://api.deepseek.com/v1"
        self.configs_dir = "configs"
        self.logger = ConversationLog()
        self.current_thinking = False
        self.thinking_stage = ""  # "intent" | "code" | ""

        self.token_stats = {
            "total_prompt_tokens": 0,
            "total_completion_tokens": 0,
            "total_calls": 0,
            "daily_stats": {},
            "token_price_per_1k": 0.0015,
        }

        token_stats_path = self.base_dir / "configs" / "token_stats.json"
        if token_stats_path.exists():
            with open(token_stats_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
                # 浅合并顶层字段，但对 daily_stats 做深合并以避免丢失当日统计
                if "daily_stats" in saved and isinstance(saved["daily_stats"], dict):
                    merged_daily = dict(self.token_stats.get("daily_stats", {}))
                    merged_daily.update(saved["daily_stats"])
                    saved["daily_stats"] = merged_daily
                self.token_stats.update(saved)

    def _record_token_usage(self, usage: dict):
        """记录一次API调用的token消耗（供外部模块如 ChessAI 回调使用）

        从 _call_deepseek 的统计逻辑中抽取，避免重复代码。
        """
        prompt_tokens = usage.get('prompt_tokens', 0)
        completion_tokens = usage.get('completion_tokens', 0)
        today = datetime.now().strftime('%Y-%m-%d')

        self.token_stats["total_prompt_tokens"] += prompt_tokens
        self.token_stats["total_completion_tokens"] += completion_tokens
        self.token_stats["total_calls"] += 1

        if today not in self.token_stats["daily_stats"]:
            self.token_stats["daily_stats"][today] = {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "calls": 0,
            }
        self.token_stats["daily_stats"][today]["prompt_tokens"] += prompt_tokens
        self.token_stats["daily_stats"][today]["completion_tokens"] += completion_tokens
        self.token_stats["daily_stats"][today]["calls"] += 1

        token_stats_path = self.base_dir / "configs" / "token_stats.json"
        try:
            with open(token_stats_path, "w", encoding="utf-8") as f:
                json.dump(self.token_stats, f, ensure_ascii=False, indent=2)
        except Exception:
            pass  # 统计写入失败不影响主流程

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def _call_deepseek(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.3,
        model: Optional[str] = None,
    ) -> Tuple[str, float]:
        """调用DeepSeek API，返回(响应内容, 耗时秒数)。

        model 缺省时使用 DEFAULT_MODEL（顶层 v4-flash / sandbox chat）。
        """
        if model is None:
            model = self.DEFAULT_MODEL
        headers = self._get_headers()
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": 8192,  # 增大token限制，确保完整JSON输出
        }

        start_time = time.time()
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions", headers=headers, json=payload
            )
            resp.raise_for_status()
            data = resp.json()
            elapsed = time.time() - start_time

            if 'usage' in data:
                self._record_token_usage(data['usage'])

            content = data["choices"][0]["message"]["content"]
            if content is None:
                content = ""
            return content, elapsed

    def _extract_json(self, text: str) -> Optional[dict]:
        """从文本中提取JSON"""
        if not text or not isinstance(text, str):
            return None
        # 尝试直接解析
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            pass

        # 尝试提取 ```json 代码块
        pattern = r"```(?:json)?\s*\n?([\s\S]*?)\n?```"
        matches = re.findall(pattern, text)
        for m in matches:
            try:
                return json.loads(m.strip())
            except json.JSONDecodeError:
                continue

        # 尝试找到第一个 { 到最后一个 }
        first = text.find("{")
        last = text.rfind("}")
        if first != -1 and last != -1:
            try:
                return json.loads(text[first : last + 1])
            except json.JSONDecodeError:
                pass

        return None

    def _extract_json_patch(self, text: str) -> Optional[list]:
        """从文本中提取JSON Patch列表"""
        if not text or not isinstance(text, str):
            return None
        try:
            parsed = json.loads(text.strip())
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

        pattern = r"```(?:json)?\s*\n?([\s\S]*?)\n?```"
        matches = re.findall(pattern, text)
        for m in matches:
            try:
                parsed = json.loads(m.strip())
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                continue

        first = text.find("[")
        last = text.rfind("]")
        if first != -1 and last != -1:
            try:
                parsed = json.loads(text[first : last + 1])
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass

        return None

    def _apply_patch_or_diff(
        self,
        original_config: dict,
        ai_response: str,
        config_name: str,
        log_entry: dict,
    ) -> Tuple[Optional[dict], Optional[str]]:
        """
        尝试用JSON Patch模式或diff模式应用修改

        Args:
            original_config: 原始配置字典
            ai_response: AI响应文本
            config_name: 配置名称（用于日志和验证）
            log_entry: 日志条目（用于记录patch_mode）

        Returns:
            (修改后的配置或None, 错误信息或None)
        """
        code_gen_log = log_entry.get("code_generation", {})

        patch = self._extract_json_patch(ai_response)
        if patch is not None:
            valid, err = is_valid_patch(patch)
            if valid:
                try:
                    new_config = apply_patch(original_config, patch)
                    code_gen_log["patch_mode"] = "patch"
                    code_gen_log["patch_operations"] = len(patch)
                    code_gen_log["patch_operations_detail"] = patch
                    return new_config, None
                except Exception as e:
                    code_gen_log["patch_apply_error"] = str(e)

        full_json = self._extract_json(ai_response)
        if full_json is not None:
            try:
                diff_patch = generate_diff(original_config, full_json)
                new_config = apply_patch(original_config, diff_patch)
                code_gen_log["patch_mode"] = "diff"
                code_gen_log["diff_operations"] = len(diff_patch)
                code_gen_log["diff_operations_detail"] = diff_patch
                return new_config, None
            except Exception as e:
                code_gen_log["diff_apply_error"] = str(e)
                return None, f"应用diff失败: {e}"

        return None, "无法解析为JSON Patch或全量JSON"

    def _merge_action_results(
        self, results: List[Dict[str, Any]], intent: dict
    ) -> Dict[str, Any]:
        """合并多个action的执行结果"""
        success_count = sum(1 for r in results if r.get("success"))
        rejected_count = sum(1 for r in results if r.get("type") == "rejected")
        error_count = sum(1 for r in results if not r.get("success") and r.get("type") != "rejected")

        # 收集所有修改的配置
        modified_configs = {}
        all_messages = []

        for r in results:
            if r.get("modified_configs"):
                for key, value in r["modified_configs"].items():
                    if key == "board_state" and key in modified_configs:
                        # 深度合并board_state（特别是custom_rules_active数组）
                        self._deep_merge_board_state(modified_configs[key], value)
                    else:
                        modified_configs[key] = value
            if r.get("message"):
                all_messages.append(r["message"])

        if success_count > 0 and error_count == 0:
            result_type = "applied" if modified_configs else "success"
            return {
                "success": True,
                "type": result_type,
                "message": intent.get("response_to_player", "操作成功"),
                "modified_configs": modified_configs,
                "action_results": results,
            }
        elif success_count > 0 and error_count > 0:
            return {
                "success": True,
                "type": "partial",
                "message": intent.get("response_to_player", "部分操作成功"),
                "modified_configs": modified_configs,
                "action_results": results,
            }
        elif rejected_count == len(results):
            return {
                "success": False,
                "type": "rejected",
                "message": "所有操作均被拒绝",
                "action_results": results,
            }
        else:
            return {
                "success": False,
                "type": "error",
                "message": "\n".join(all_messages) if all_messages else "操作失败",
                "action_results": results,
            }

    def _deep_merge_board_state(self, base: dict, override: dict):
        """深度合并两个board_state配置（主要处理custom_rules_active数组合并）"""
        if not isinstance(base, dict) or not isinstance(override, dict):
            return
        for key, value in override.items():
            if key == "custom_rules_active" and isinstance(value, list):
                if key not in base or not isinstance(base[key], list):
                    base[key] = []
                base[key].extend(value)
            elif isinstance(value, dict) and key in base and isinstance(base[key], dict):
                self._deep_merge_board_state(base[key], value)
            else:
                base[key] = value

    def _find_piece(self, board: dict, piece_id: str) -> Optional[dict]:
        """在棋盘中查找棋子"""
        for p in board.get("pieces", []):
            if p["id"] == piece_id:
                return p
        return None

    def _detect_action_type(self, action_str: str) -> str:
        """根据关键词识别棋盘变换操作类型（transform/add/remove/move/rotate/modify）。"""
        if not action_str:
            return "unknown"
        action_lower = action_str.lower()

        transform_keywords_zh = ["变换", "变成", "变为", "变炮", "变车", "变马", "变种"]
        transform_keywords_en = ["transform", "mutate", "evolve", "change_type", "piece_type"]
        for kw in transform_keywords_zh:
            if kw in action_str:
                return "transform"
        for kw in transform_keywords_en:
            if kw in action_lower:
                return "transform"

        add_keywords_zh = ["添加", "新增", "增加", "放置", "填满", "补充"]
        add_keywords_en = ["add", "create", "spawn", "generate"]
        for kw in add_keywords_zh:
            if kw in action_str:
                return "add"
        for kw in add_keywords_en:
            if kw in action_lower:
                return "add"

        remove_keywords_zh = ["删除", "移除", "去掉", "消灭", "吃掉"]
        remove_keywords_en = ["remove", "delete", "destroy", "kill"]
        for kw in remove_keywords_zh:
            if kw in action_str:
                return "remove"
        for kw in remove_keywords_en:
            if kw in action_lower:
                return "remove"

        move_keywords_zh = ["移动", "移到", "挪到"]
        move_keywords_en = ["move", "shift", "relocate", "reposition"]
        for kw in move_keywords_zh:
            if kw in action_str:
                return "move"
        for kw in move_keywords_en:
            if kw in action_lower:
                return "move"

        rotate_keywords_zh = ["旋转", "翻转"]
        rotate_keywords_en = ["rotate", "flip", "turn"]
        for kw in rotate_keywords_zh:
            if kw in action_str:
                return "rotate"
        for kw in rotate_keywords_en:
            if kw in action_lower:
                return "rotate"

        modify_keywords_zh = ["修改", "改"]
        modify_keywords_en = ["modify", "change", "update", "edit"]
        for kw in modify_keywords_zh:
            if kw in action_str:
                return "modify"
        for kw in modify_keywords_en:
            if kw in action_lower:
                return "modify"

        return "unknown"

    def get_logs(self, count: int = 10) -> List[Dict[str, Any]]:
        """获取日志"""
        return self.logger.get_logs(count)

    def _generate_retry_prompt(
        self, original_prompt: str, errors: List[str]
    ) -> str:
        """
        生成重试提示词，将错误信息附加到原始提示词中

        Args:
            original_prompt: 原始用户提示词
            errors: 错误列表

        Returns:
            重试提示词
        """
        error_text = "\n".join([f"- {e}" for e in errors])
        return f"""{original_prompt}

## ⚠️ 重要：之前的输出存在以下错误，请修正后重新输出

错误列表：
{error_text}

请仔细检查并修正上述错误，确保输出符合所有要求。"""

    def _hard_validate_config(self, config_name: str, config_data: dict) -> Tuple[bool, str]:
        """
        对AI生成的配置执行硬编码Schema校验

        Args:
            config_name: 配置名称（board_state/pieces/rules/ui_config/board）
            config_data: 配置数据字典

        Returns:
            (是否通过, 错误信息)
        """
        if config_name == "board_state":
            return validate_board_state(config_data)
        elif config_name == "pieces":
            return validate_pieces(config_data)
        elif config_name == "rules":
            return validate_rules(config_data)
        elif config_name == "ui_config":
            return validate_ui_config(config_data)
        elif config_name == "board":
            return validate_board(config_data)
        return True, ""  # 未知类型跳过

    def _log_code_diff_for_display(self, resp: str, code_gen_log: dict, attempt: int):
        """无论校验是否通过，都尝试提取 CodeAI 输出中的 patch/diff 操作并记录到日志，供前端显示"""
        # 第一次尝试记录到主字段；重试记录到独立字段（retry_{attempt}_*），便于前端展示修正后的操作
        log_key_prefix = "" if attempt == 0 else f"retry_{attempt}_"

        patch = self._extract_json_patch(resp)
        if patch is not None:
            mode_key = f"{log_key_prefix}patch_mode"
            count_key = f"{log_key_prefix}patch_operations"
            detail_key = f"{log_key_prefix}patch_operations_detail"
            if mode_key not in code_gen_log:
                code_gen_log[mode_key] = "patch"
            if count_key not in code_gen_log:
                code_gen_log[count_key] = len(patch)
            if detail_key not in code_gen_log:
                code_gen_log[detail_key] = patch
            return

        full_json = self._extract_json(resp)
        if full_json is not None:
            mode_key = f"{log_key_prefix}patch_mode"
            detail_key = f"{log_key_prefix}diff_operations_detail"
            if mode_key not in code_gen_log:
                code_gen_log[mode_key] = "diff"
            # 对于全量JSON，记录前5个顶层键的变化摘要
            if detail_key not in code_gen_log:
                summary_keys = list(full_json.keys())[:5] if isinstance(full_json, dict) else []
                code_gen_log[detail_key] = [
                    {"op": "replace", "path": f"/{k}", "value": "..."} for k in summary_keys
                ]

    def get_thinking_status(self) -> Dict[str, Any]:
        """获取当前思考状态"""
        return {
            "thinking": self.current_thinking,
            "stage": self.thinking_stage,
        }

    def get_token_stats(self):
        """获取token消耗统计"""
        today = datetime.now().strftime('%Y-%m-%d')
        today_stats = self.token_stats.get("daily_stats", {}).get(today, {})

        total_tokens = self.token_stats["total_prompt_tokens"] + self.token_stats["total_completion_tokens"]
        today_tokens = today_stats.get("prompt_tokens", 0) + today_stats.get("completion_tokens", 0)

        price_per_1k = self.token_stats.get("token_price_per_1k", 0.0015)
        estimated_cost = total_tokens * price_per_1k / 1000
        today_cost = today_tokens * price_per_1k / 1000

        return {
            "total_prompt_tokens": self.token_stats["total_prompt_tokens"],
            "total_completion_tokens": self.token_stats["total_completion_tokens"],
            "total_tokens": total_tokens,
            "total_calls": self.token_stats["total_calls"],
            "today_prompt_tokens": today_stats.get("prompt_tokens", 0),
            "today_completion_tokens": today_stats.get("completion_tokens", 0),
            "today_tokens": today_tokens,
            "today_calls": today_stats.get("calls", 0),
            "estimated_cost_usd": round(estimated_cost, 4),
            "today_cost_usd": round(today_cost, 4),
            "token_price_per_1k_usd": price_per_1k,
        }


__all__ = ["AIOrchestratorBase", "ConversationLog"]
