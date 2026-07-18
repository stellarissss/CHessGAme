"""
AI编排器 - 无限制围棋版

双层AI协作管线：
  第一层（意图解析）：解析用户自然语言指令，输出动作清单
  第二层（代码生成）：将动作清单转成 JSON Patch，应用到配置

围棋版特点：
  - 棋子术语：黑/白、子、棋、棋组、气、眼、劫
  - 规则原语：place（落子）/ capture（提子）/ liberty（气）
  - 棋盘：19×19路，星位，天元
  - 胜负：数子、数目、双虚手终局、认输
"""

import os
import json
import copy
from typing import List, Dict, Any, Optional, Tuple


class IntentParser:
    """第一层AI：意图解析器

    输入：用户自然语言指令 + 当前配置快照
    输出：IntentResult { intent, entities, confidence }
    """

    VALID_INTENTS = [
        "create_piece",
        "modify_piece",
        "delete_piece",
        "add_rule",
        "modify_rule",
        "change_board",
        "ai_move",
        "add_mechanism",
        "query",
        "explanation",
        "unknown",
    ]

    def __init__(self, llm_client=None):
        """
        Args:
            llm_client: LLM客户端对象，需有 chat(messages, temperature, max_tokens) 方法
                        为 None 时使用 mock 模式（离线测试用）
        """
        self.llm = llm_client

    def parse(self, user_input: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """解析用户指令

        Args:
            user_input: 用户自然语言输入
            context: 上下文，包含 pieces、board、rules 等配置快照

        Returns:
            {
                "intent": str,           # 意图类型
                "entities": dict,        # 提取的实体
                "confidence": float,     # 置信度
                "raw_thinking": str,     # 原始思考过程（用于可解释性）
            }
        """
        prompt = f"""你是"无限制围棋"游戏的意图解析AI。

请分析玩家输入，识别其意图，并提取关键实体。

【有效意图列表】
- create_piece: 创建新棋种/棋子类型
- modify_piece: 修改已有棋子的规则
- delete_piece: 删除某个棋子类型
- add_rule: 添加新规则（游戏规则类）
- modify_rule: 修改已有规则
- change_board: 修改棋盘（大小、形状、颜色等）
- ai_move: 要求AI走棋/落子
- add_mechanism: 添加游戏机制（冻结回合、随机走棋等）
- query: 查询/询问信息
- explanation: 请求解释
- unknown: 无法识别

【当前配置快照】
棋盘大小: {context.get('board', {}).get('geometry', {}).get('width', 19)} × {context.get('board', {}).get('geometry', {}).get('height', 19)} 路
现有棋种: {list(context.get('pieces', {}).keys())}

【玩家输入】
{user_input}

【输出格式】
请输出一个JSON对象：
{{
  "intent": "意图类型",
  "entities": {{ 提取的实体键值对 }},
  "confidence": 置信度0-1
}}

只输出JSON，不要其他文字。"""

        if self.llm is None:
            return self._mock_parse(user_input, context)

        try:
            messages = [{"role": "user", "content": prompt}]
            response = self.llm.chat(
                messages=messages,
                temperature=0.3,
                max_tokens=2048,
            )

            return self._parse_intent_response(response)
        except Exception as e:
            return {
                "intent": "unknown",
                "entities": {},
                "confidence": 0.0,
                "raw_thinking": f"LLM调用失败: {e}",
            }

    def _parse_intent_response(self, response: str) -> Dict[str, Any]:
        """解析LLM返回的意图结果"""
        try:
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                data = json.loads(json_str)
                intent = data.get("intent", "unknown")
                if intent not in self.VALID_INTENTS:
                    intent = "unknown"
                return {
                    "intent": intent,
                    "entities": data.get("entities", {}),
                    "confidence": float(data.get("confidence", 0.5)),
                    "raw_thinking": response,
                }
        except Exception:
            pass

        return {
            "intent": "unknown",
            "entities": {},
            "confidence": 0.0,
            "raw_thinking": response,
        }

    def _mock_parse(self, user_input: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """mock模式：简单的关键词匹配，用于无LLM时的测试"""
        text = user_input.lower()

        if any(k in text for k in ["加一个", "增加", "新增", "创建", "造一个", "添加"]):
            if any(k in text for k in ["子", "棋", "棋种", "新棋"]):
                return {
                    "intent": "create_piece",
                    "entities": {"piece_name": "新棋", "side": "both"},
                    "confidence": 0.6,
                    "raw_thinking": "mock: 关键词匹配 create_piece",
                }
            if any(k in text for k in ["规则", "机制"]):
                return {
                    "intent": "add_rule",
                    "entities": {"rule_desc": user_input},
                    "confidence": 0.5,
                    "raw_thinking": "mock: 关键词匹配 add_rule",
                }

        if any(k in text for k in ["修改", "改一下", "调整", "变强", "变弱"]):
            return {
                "intent": "modify_piece",
                "entities": {},
                "confidence": 0.5,
                "raw_thinking": "mock: 关键词匹配 modify_piece",
            }

        if any(k in text for k in ["棋盘", "大小", "尺寸", "路数"]):
            return {
                "intent": "change_board",
                "entities": {},
                "confidence": 0.5,
                "raw_thinking": "mock: 关键词匹配 change_board",
            }

        if any(k in text for k in ["ai走", "电脑走", "你走", "下一步", "落子"]):
            return {
                "intent": "ai_move",
                "entities": {},
                "confidence": 0.7,
                "raw_thinking": "mock: 关键词匹配 ai_move",
            }

        if any(k in text for k in ["什么", "怎么", "为什么", "解释", "说明", "介绍"]):
            return {
                "intent": "query",
                "entities": {},
                "confidence": 0.6,
                "raw_thinking": "mock: 关键词匹配 query",
            }

        return {
            "intent": "unknown",
            "entities": {},
            "confidence": 0.1,
            "raw_thinking": "mock: 未匹配到任何意图",
        }


class ActionPlanner:
    """第一层半部分：动作规划

    将意图解析结果细化为具体动作列表（动作清单）。
    每个动作都是一个结构化对象，可被第二层直接消费。
    """

    def __init__(self, llm_client=None):
        self.llm = llm_client

    def plan(
        self,
        intent_result: Dict[str, Any],
        user_input: str,
        context: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """生成动作清单

        Args:
            intent_result: 意图解析结果
            user_input: 原始用户输入
            context: 配置上下文

        Returns:
            动作列表，每个动作格式：
            {
                "action": str,           # 动作类型
                "target": str,           # 操作目标
                "parameters": dict,      # 参数
                "description": str,      # 人类可读描述
            }
        """
        intent = intent_result.get("intent", "unknown")

        if self.llm is None:
            return self._mock_plan(intent, intent_result, context)

        prompt = f"""你是"无限制围棋"的动作规划AI。

根据用户意图和实体，生成具体的动作清单。

【意图】
{intent}

【提取的实体】
{json.dumps(intent_result.get('entities', {}), ensure_ascii=False, indent=2)}

【用户原始输入】
{user_input}

【当前配置快照】
棋盘大小: {context.get('board', {}).get('geometry', {}).get('width', 19)}×{context.get('board', {}).get('geometry', {}).get('height', 19)}路
棋种: {list(context.get('pieces', {}).keys())}

【输出格式】
请输出一个JSON数组，每个动作格式：
{{
  "action": "动作类型",
  "target": "操作目标路径",
  "parameters": {{ 参数 }},
  "description": "人类可读描述"
}}

只输出JSON数组，不要其他文字。"""

        try:
            messages = [{"role": "user", "content": prompt}]
            response = self.llm.chat(
                messages=messages,
                temperature=0.4,
                max_tokens=4096,
            )
            return self._parse_actions_response(response)
        except Exception:
            return self._mock_plan(intent, intent_result, context)

    def _parse_actions_response(self, response: str) -> List[Dict[str, Any]]:
        """解析LLM返回的动作清单"""
        try:
            json_start = response.find("[")
            json_end = response.rfind("]") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                return json.loads(json_str)
        except Exception:
            pass
        return []

    def _mock_plan(
        self,
        intent: str,
        intent_result: Dict[str, Any],
        context: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """mock模式的简单动作规划"""
        actions = []

        if intent == "create_piece":
            actions.append({
                "action": "add_piece_type",
                "target": "pieces",
                "parameters": {
                    "type_id": "new_stone",
                    "label": {"black": "新", "white": "新"},
                    "place_rules": [{"kind": "place", "land": "empty"}],
                    "capture_rules": [{"kind": "capture", "condition": "no_liberties", "target": "enemy"}],
                    "liberty_rules": {"count_method": "orthogonal_adjacent", "group_connect": "orthogonal"},
                },
                "description": "创建一个新棋种",
            })

        elif intent == "modify_piece":
            pieces = context.get("pieces", {})
            piece_types = list(pieces.keys()) if isinstance(pieces, dict) else []
            if piece_types:
                actions.append({
                    "action": "modify_piece_property",
                    "target": f"pieces.{piece_types[0]}",
                    "parameters": {"stone_value": 10},
                    "description": f"修改 {piece_types[0]} 的评估价值",
                })

        elif intent == "change_board":
            actions.append({
                "action": "resize_board",
                "target": "board.geometry",
                "parameters": {"width": 19, "height": 19},
                "description": "调整棋盘大小为19路",
            })

        elif intent == "ai_move":
            actions.append({
                "action": "ai_move",
                "target": "board_state",
                "parameters": {},
                "description": "请求AI走一步棋",
            })

        return actions


class PatchGenerator:
    """第二层AI：JSON Patch生成器

    输入：动作清单 + 当前配置
    输出：RFC 6902 JSON Patch 操作列表
    """

    def __init__(self, llm_client=None):
        self.llm = llm_client

    def generate(
        self,
        actions: List[Dict[str, Any]],
        configs: Dict[str, Any],
    ) -> Tuple[List[Dict[str, Any]], str]:
        """生成 JSON Patch

        Args:
            actions: 动作清单
            configs: 当前配置 { board, pieces, rules }

        Returns:
            (patch_operations, reasoning)
        """
        if self.llm is None:
            return self._mock_generate(actions, configs)

        prompt = f"""你是"无限制围棋"的配置补丁生成AI。

根据动作清单，生成 RFC 6902 标准的 JSON Patch 操作列表。

【动作清单】
{json.dumps(actions, ensure_ascii=False, indent=2)}

【当前配置结构】
- /board/geometry/width: 棋盘宽度
- /board/geometry/height: 棋盘高度
- /pieces_black/pieces/: 黑方棋子类型
- /pieces_white/pieces/: 白方棋子类型
- /rules/: 游戏规则

【JSON Patch格式】
[
  {{"op": "add/replace/remove", "path": "/路径", "value": 值}}
]

只输出JSON数组，不要其他文字。"""

        try:
            messages = [{"role": "user", "content": prompt}]
            response = self.llm.chat(
                messages=messages,
                temperature=0.2,
                max_tokens=4096,
            )
            return self._parse_patch_response(response)
        except Exception as e:
            return [], f"LLM调用失败: {e}"

    def _parse_patch_response(self, response: str) -> Tuple[List[Dict[str, Any]], str]:
        """解析LLM返回的JSON Patch"""
        try:
            json_start = response.find("[")
            json_end = response.rfind("]") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                patches = json.loads(json_str)
                return patches, response
        except Exception:
            pass
        return [], response

    def _mock_generate(
        self,
        actions: List[Dict[str, Any]],
        configs: Dict[str, Any],
    ) -> Tuple[List[Dict[str, Any]], str]:
        """mock模式生成简单patch"""
        patches = []
        for action in actions:
            act = action.get("action")
            params = action.get("parameters", {})

            if act == "add_piece_type":
                type_id = params.get("type_id", "new_stone")
                patches.append({
                    "op": "add",
                    "path": f"/pieces_black/pieces/{type_id}",
                    "value": {
                        "label": params.get("label", {"black": "新", "white": "新"}),
                        "place_rules": params.get("place_rules", [{"kind": "place", "land": "empty"}]),
                        "capture_rules": params.get("capture_rules", [{"kind": "capture", "condition": "no_liberties", "target": "enemy"}]),
                        "liberty_rules": params.get("liberty_rules", {"count_method": "orthogonal_adjacent", "group_connect": "orthogonal"}),
                    },
                })

            elif act == "resize_board":
                w = params.get("width", 19)
                h = params.get("height", 19)
                patches.extend([
                    {"op": "replace", "path": "/board/geometry/width", "value": w},
                    {"op": "replace", "path": "/board/geometry/height", "value": h},
                ])

        return patches, "mock: 简化生成"


class GovernanceLayer:
    """治理层：检查 AI 生成的修改是否安全合规

    两层检查：
    1. 静态规则检查（黑名单关键字、文件边界、不可变字段）
    2. LLM 复审（可选，用于高风险操作）
    """

    IMMUTABLE_PATHS = [
        "/_metadata",
    ]

    BLACKLIST_KEYWORDS = [
        "rm -rf",
        "eval(",
        "exec(",
        "__import__",
        "subprocess",
        "os.system",
    ]

    def __init__(self, llm_client=None):
        self.llm = llm_client

    def check(
        self,
        patches: List[Dict[str, Any]],
        configs: Dict[str, Any],
    ) -> Tuple[bool, str]:
        """治理检查

        Returns:
            (passed, reason)
        """
        for patch in patches:
            path = patch.get("path", "")

            for imm in self.IMMUTABLE_PATHS:
                if path.startswith(imm):
                    return False, f"路径不可修改: {path}"

            value_str = json.dumps(patch.get("value", ""), ensure_ascii=False)
            for kw in self.BLACKLIST_KEYWORDS:
                if kw in value_str:
                    return False, f"包含不安全关键字: {kw}"

            op = patch.get("op")
            if op not in ["add", "remove", "replace", "copy", "move", "test"]:
                return False, f"非法操作: {op}"

        if self.llm and len(patches) > 5:
            prompt = f"""你是安全审计AI。请检查以下 JSON Patch 操作是否安全合规。

【待检查的Patch】
{json.dumps(patches, ensure_ascii=False, indent=2)}

【安全规则】
- 不得修改 _metadata 路径
- 不得包含危险代码（eval、exec、subprocess等）
- 操作类型只能是 add/remove/replace/copy/move/test

检查通过就回复"通过"，否则说明问题。"""
            try:
                messages = [{"role": "user", "content": prompt}]
                response = self.llm.chat(
                    messages=messages,
                    temperature=0.1,
                    max_tokens=1024,
                )
                passed = "通过" in response or "safe" in response.lower()
                if not passed:
                    return False, response
            except Exception:
                pass

        return True, "检查通过"


class ExplanationGenerator:
    """解释生成器：将修改结果转化为自然语言解释"""

    def __init__(self, llm_client=None):
        self.llm = llm_client

    def explain(
        self,
        user_input: str,
        intent_result: Dict[str, Any],
        actions: List[Dict[str, Any]],
        patches: List[Dict[str, Any]],
        applied: bool,
        error_msg: str = "",
    ) -> str:
        """生成自然语言解释"""
        if self.llm is None:
            return self._mock_explain(
                user_input, intent_result, actions, patches, applied, error_msg
            )

        prompt = f"""你是"无限制围棋"的AI助手。请用自然语言向玩家解释刚才的操作。

【玩家输入】
{user_input}

【识别的意图】
{intent_result.get('intent', 'unknown')}

【执行的动作】
{json.dumps([a.get('description', '') for a in actions], ensure_ascii=False, indent=2)}

【生成的补丁数】
{len(patches)} 个

【是否成功应用】
{'成功' if applied else '失败：' + error_msg}

请用友好、简洁的中文回复玩家。"""

        try:
            messages = [{"role": "user", "content": prompt}]
            response = self.llm.chat(
                messages=messages,
                temperature=0.7,
                max_tokens=1024,
            )
            return response.strip()
        except Exception:
            return self._mock_explain(
                user_input, intent_result, actions, patches, applied, error_msg
            )

    def _mock_explain(
        self,
        user_input: str,
        intent_result: Dict[str, Any],
        actions: List[Dict[str, Any]],
        patches: List[Dict[str, Any]],
        applied: bool,
        error_msg: str,
    ) -> str:
        """mock解释"""
        if not applied:
            return f"修改未成功应用：{error_msg}"

        intent = intent_result.get("intent", "unknown")
        action_descs = [a.get("description", "") for a in actions]

        lines = [
            f"已处理你的请求：{user_input}",
            f"识别意图：{intent}",
            f"执行操作：",
        ]
        for i, desc in enumerate(action_descs, 1):
            lines.append(f"  {i}. {desc}")
        lines.append(f"共生成 {len(patches)} 个补丁操作。")

        return "\n".join(lines)


class AIOrchestrator:
    """AI编排器 - 协调各层AI完成自然语言到规则修改的全流程"""

    def __init__(
        self,
        llm_client=None,
        schema_validator=None,
        json_patch_applier=None,
    ):
        """
        Args:
            llm_client: LLM客户端
            schema_validator: Schema校验器（可选）
            json_patch_applier: JSON Patch应用器（可选）
        """
        self.intent_parser = IntentParser(llm_client)
        self.action_planner = ActionPlanner(llm_client)
        self.patch_generator = PatchGenerator(llm_client)
        self.governance = GovernanceLayer(llm_client)
        self.explainer = ExplanationGenerator(llm_client)
        self.schema_validator = schema_validator
        self.patch_applier = json_patch_applier

    def process(
        self,
        user_input: str,
        configs: Dict[str, Any],
        board_state: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """处理用户自然语言输入，完整管线

        Args:
            user_input: 用户输入
            configs: 当前配置 { board, pieces_black, pieces_white, rules }
            board_state: 当前棋盘状态（可选）

        Returns:
            {
                "success": bool,
                "intent": str,
                "actions": list,
                "patches": list,
                "new_configs": dict | None,
                "explanation": str,
                "error": str,
            }
        """
        context = self._build_context(configs, board_state)

        intent_result = self.intent_parser.parse(user_input, context)
        intent = intent_result.get("intent", "unknown")

        if intent == "unknown":
            return {
                "success": False,
                "intent": "unknown",
                "actions": [],
                "patches": [],
                "new_configs": None,
                "explanation": "抱歉，我没有理解你的意思，请换一种说法试试。",
                "error": "无法识别的意图",
            }

        if intent == "query":
            explanation = self._handle_query(user_input, context)
            return {
                "success": True,
                "intent": "query",
                "actions": [],
                "patches": [],
                "new_configs": None,
                "explanation": explanation,
                "error": "",
            }

        if intent == "ai_move":
            return {
                "success": True,
                "intent": "ai_move",
                "actions": [{"action": "ai_move", "description": "请求AI走棋"}],
                "patches": [],
                "new_configs": None,
                "explanation": "好的，AI正在思考下一步…",
                "error": "",
            }

        actions = self.action_planner.plan(intent_result, user_input, context)

        if not actions:
            return {
                "success": False,
                "intent": intent,
                "actions": [],
                "patches": [],
                "new_configs": None,
                "explanation": "未能生成具体的操作方案。",
                "error": "空动作列表",
            }

        patches, _ = self.patch_generator.generate(actions, configs)

        if not patches:
            return {
                "success": False,
                "intent": intent,
                "actions": actions,
                "patches": [],
                "new_configs": None,
                "explanation": "未能生成有效的配置补丁。",
                "error": "空补丁列表",
            }

        passed, reason = self.governance.check(patches, configs)
        if not passed:
            explanation = self.explainer.explain(
                user_input, intent_result, actions, patches, False, reason
            )
            return {
                "success": False,
                "intent": intent,
                "actions": actions,
                "patches": patches,
                "new_configs": None,
                "explanation": explanation,
                "error": reason,
            }

        new_configs = None
        apply_error = ""
        if self.patch_applier:
            try:
                new_configs = self._apply_patches(copy.deepcopy(configs), patches)

                if self.schema_validator:
                    valid, err = self._validate_new_configs(new_configs)
                    if not valid:
                        apply_error = f"Schema校验失败: {err}"
                        new_configs = None
            except Exception as e:
                apply_error = str(e)
                new_configs = None

        applied = new_configs is not None
        explanation = self.explainer.explain(
            user_input, intent_result, actions, patches, applied, apply_error
        )

        return {
            "success": applied,
            "intent": intent,
            "actions": actions,
            "patches": patches,
            "new_configs": new_configs,
            "explanation": explanation,
            "error": apply_error,
        }

    def _build_context(
        self,
        configs: Dict[str, Any],
        board_state: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """构建上下文快照"""
        context = {
            "board": configs.get("board", {}),
            "pieces": {},
            "rules": configs.get("rules", {}),
        }

        black_pieces = configs.get("pieces_black", {}).get("pieces", {})
        white_pieces = configs.get("pieces_white", {}).get("pieces", {})
        all_types = set(list(black_pieces.keys()) + list(white_pieces.keys()))

        for t in all_types:
            context["pieces"][t] = black_pieces.get(t, white_pieces.get(t, {}))

        if board_state:
            context["board_state"] = {
                "current_turn": board_state.get("current_turn"),
                "piece_count": len(board_state.get("pieces", [])),
                "game_status": board_state.get("game_status", {}),
                "captured_stones": board_state.get("captured_stones", {}),
            }

        return context

    def _apply_patches(
        self, configs: Dict[str, Any], patches: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """应用JSON Patch到配置上（简单实现）"""
        for patch in patches:
            op = patch.get("op")
            path = patch.get("path", "")
            value = patch.get("value")

            parts = [p for p in path.split("/") if p]
            target = configs

            for i, part in enumerate(parts[:-1]):
                if part not in target:
                    if op in ["add", "replace"]:
                        target[part] = {}
                    else:
                        raise ValueError(f"路径不存在: {path}")
                target = target[part]

            last_key = parts[-1] if parts else ""

            if op == "add":
                target[last_key] = value
            elif op == "replace":
                target[last_key] = value
            elif op == "remove":
                if last_key in target:
                    del target[last_key]
            elif op == "copy":
                from_path = patch.get("from", "")
                from_parts = [p for p in from_path.split("/") if p]
                src = configs
                for p in from_parts:
                    src = src[p]
                target[last_key] = copy.deepcopy(src)
            elif op == "move":
                from_path = patch.get("from", "")
                from_parts = [p for p in from_path.split("/") if p]
                src_parent = configs
                for p in from_parts[:-1]:
                    src_parent = src_parent[p]
                src_key = from_parts[-1]
                val = src_parent.pop(src_key)
                target[last_key] = val

        return configs

    def _validate_new_configs(self, configs: Dict[str, Any]) -> Tuple[bool, str]:
        """校验新配置"""
        if not self.schema_validator:
            return True, ""

        from schema_validator import validate_config

        for key in ["board", "pieces_black", "pieces_white", "rules"]:
            if key in configs:
                valid, err = validate_config(key, configs[key])
                if not valid:
                    return False, f"{key}: {err}"

        return True, ""

    def _handle_query(self, user_input: str, context: Dict[str, Any]) -> str:
        """处理查询类意图"""
        text = user_input.lower()

        if "规则" in text or "怎么玩" in text:
            return (
                "这是无限制围棋，基础规则：\n"
                "• 黑白双方交替落子，黑先白后\n"
                "• 棋子落在交叉点上，落下后不能移动\n"
                "• 被围住（无气）的棋子会被提走\n"
                "• 不能下在无气的位置（自杀），除非能提掉对方的子\n"
                "• 打劫时不能立即回提\n"
                "• 双方连续虚手（Pass）则终局，按数子法计算胜负\n\n"
                "你可以用自然语言修改规则，比如：'加一个能斜着连的棋子' 或 '把棋盘改成9路'"
            )

        if "棋子" in text or "棋种" in text:
            pieces = context.get("pieces", {})
            if not pieces:
                return "当前没有定义任何棋子类型。"
            lines = ["当前棋种："]
            for name, info in pieces.items():
                label = info.get("label", {})
                lines.append(f"  • {name}（{label.get('black', '?')}/{label.get('white', '?')}）")
            return "\n".join(lines)

        if "棋盘" in text or "大小" in text:
            board = context.get("board", {})
            geo = board.get("geometry", {})
            w = geo.get("width", 19)
            h = geo.get("height", 19)
            return f"当前棋盘大小：{w}×{h} 路"

        return "这是一个可以用自然语言修改规则的无限制围棋。你可以问规则、棋种、棋盘等问题。"
