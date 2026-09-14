"""
统一的 AI 配置 —— 全部棋类（顶层 6 + sandbox 6 + RPG 层）的唯一配置真源。

────────────────────────────────────────────────────────────────────
【单一真源原则 —— 复用逻辑说明】

    本模块是本项目的「DeepSeek 接入配置唯一真源」（Single Source of Truth）。
    历史上，模型名 / 密钥曾以硬编码形式散落在 30+ 个文件中：

        - 6 个顶层棋类 chess_ai.py        → "model": "deepseek-v4-flash"
        - 6 个 sandbox 棋类 chess_ai.py    → 部分 "deepseek-chat" / 部分 "deepseek-v4-flash"
        - 12 个 ai_orchestrator.py         → DEFAULT_MODEL 类属性（顶层继承基类 / sandbox 各自覆盖）
        - shared/karma_assessor_base.py    → assess() 内联 "model": "deepseek-v4-flash"
        - samsara/karma_assessor.py        → 硬编码完整 URL + 模型名

    这导致「换一次模型 / 换一次密钥」需要改十几处，极易漏改。

    因此统一约定如下（后续开发者 / AI 必须遵守）：

        1. 任何需要「模型名」的代码，一律 `from ai_config import get_model`
           （或 `from shared.ai_config import get_model`），禁止再写死字符串。
        2. 任何需要「API 密钥」的代码，一律 `from ai_config import get_api_key`，
           禁止再写死 sk-xxx。
        3. 任何需要「Base URL」的代码，一律 `from ai_config import get_base_url`。
        4. 确需在文档（README / 计划书）中提及模型名时，允许写示例值，但
           运行时行为一律以本模块的解析结果为准。

【配置优先级（从高到低）】

    API 密钥   ：环境变量 DEEPSEEK_API_KEY > config.json["api_key"] > DEFAULT_API_KEY
    模型名     ：环境变量 DEEPSEEK_MODEL   > config.json["model"]   > DEEPSEEK_MODEL
    Base URL   ：环境变量 DEEPSEEK_BASE_URL > config.json["base_url"] > DEEPSEEK_BASE_URL

【路径解析（关键修复点）】

    历史 bug：get_api_key() 的候选路径对 sandbox 棋类解析失败。

        - 顶层棋类  ：<repo>/xiangqi/main.py         → BASE_DIR = <repo>/xiangqi
        - sandbox 棋 ：<repo>/sandbox/xiangqi/main.py → BASE_DIR = <repo>/sandbox/xiangqi

    原实现按「shared/ 父目录的 N 级」猜测路径，sandbox 场景会解析到
    <repo>/sandbox/ 而不是 <repo>/，导致读不到根 config.json，只能回落到
    写死的 DEFAULT_API_KEY —— 即「配置文件的密钥无法覆盖 sandbox 棋类」。

    现改为：从本文件所在目录逐级向上遍历，取遇到的第一个 config.json。
    对顶层棋类，向上 2 级即到 <repo>/config.json；
    对 sandbox 棋类同样会命中 <repo>/config.json（因为 <repo>/sandbox/ 下无配置文件）。
    同时兼容「棋类自带 config.json 覆盖根配置」的场景（就近优先）。
────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

# ═══════════════════════════════════════════════════════════════
# 默认值（当环境变量与 config.json 均未提供时使用）
# ═══════════════════════════════════════════════════════════════

DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"

# 默认模型：DeepSeek 最新可用模型（统一顶层棋类 / sandbox 棋类 / RPG 层）。
#
# 【重要】模型名必须是 DeepSeek 网关实际支持的 ID。实测本账号 `GET /models` 返回：
#     ["deepseek-flash", "deepseek-v4-pro"]
# 且传入别名 "deepseek-v4-flash" / "deepseek-chat" / "deepseek-reasoner" 时，
# 网关虽返回 200，但响应体 model 字段会被规范化为 "deepseek-flash"。
# 而传入 "deepseek-v4.1" / "deepseek-v4" 会被网关以 400 拒绝：
#     "The supported API model names are deepseek-flash, deepseek-v4-pro"
# 因此统一采用真实 ID "deepseek-flash"（flash 系列最新，速度/成本最适合游戏实时流水线）。
#
# 如需改用 Pro，改此处（或设环境变量 DEEPSEEK_MODEL，或改 config.json["model"]）即可全局生效。
DEEPSEEK_MODEL = "deepseek-flash"

# 默认 API 密钥：所有棋类共享的缺省后端（测试用密钥，私人仓库）。
DEFAULT_API_KEY = "sk-e2e58bcd3bd9462baff6d5e7aa3080bc"

GAME_TYPES = {
    "xiangqi": "象棋",
    "wuziqi": "五子棋",
    "weiqi": "围棋",
    "dongwuqi": "动物棋",
    "tiaoqi": "跳棋",
    "heibaiqi": "黑白棋",
}

SAMSARA_API_URL = "http://localhost:8080"


# ═══════════════════════════════════════════════════════════════
# 配置文件定位与读取
# ═══════════════════════════════════════════════════════════════

# 缓存：避免每次调用都重复遍历目录 / 读磁盘。
_config_cache: Optional[dict] = None
_config_path_cache: Optional[Path] = None


def find_config_path() -> Optional[Path]:
    """自本文件所在目录逐级向上，返回第一个存在的 config.json 路径。

    向上遍历可同时覆盖三种部署形态：
        - shared/ 在 <repo>/shared/（开发态）        → 上 1 级命中 <repo>/config.json
        - shared/ 被复制到棋类目录（打包态）          → 同级命中 <棋类>/config.json
        - sandbox 棋类 deep path                     → 一路上溯命中 <repo>/config.json

    就近优先：若棋类目录下自带 config.json，则该棋类使用自己的配置，
    从而支持「单棋类覆盖根配置」。
    """
    here = Path(__file__).resolve().parent
    for parent in (here, *here.parents):
        candidate = parent / "config.json"
        if candidate.exists():
            return candidate
    return None


def _load_config() -> dict:
    """读取并缓存 config.json 内容；读取失败返回空 dict 而非抛错。"""
    global _config_cache, _config_path_cache
    if _config_cache is not None:
        return _config_cache

    path = find_config_path()
    _config_path_cache = path
    if path is None:
        _config_cache = {}
        return _config_cache

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            _config_cache = data if isinstance(data, dict) else {}
    except Exception:
        # 配置读取失败不应中断游戏；静默回落默认值。
        _config_cache = {}
    return _config_cache


def get_api_key() -> str:
    """读取 API 密钥。

    优先级：环境变量 DEEPSEEK_API_KEY > config.json["api_key"] > DEFAULT_API_KEY。
    顶层 6 棋类与 sandbox 6 棋类共用同一份根 config.json，因此一处改动即全局生效。
    """
    env_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if env_key:
        return env_key

    config = _load_config()
    if config.get("api_key"):
        return str(config["api_key"]).strip()

    return DEFAULT_API_KEY


def get_model() -> str:
    """读取模型名。

    优先级：环境变量 DEEPSEEK_MODEL > config.json["model"] > DEEPSEEK_MODEL。

    这是「模型名唯一出口」：所有 chess_ai / ai_orchestrator / karma_assessor
    均应调用本函数，而不是内联模型字符串。
    """
    env_model = os.environ.get("DEEPSEEK_MODEL", "").strip()
    if env_model:
        return env_model

    config = _load_config()
    if config.get("model"):
        return str(config["model"]).strip()

    return DEEPSEEK_MODEL


def get_base_url() -> str:
    """读取 API Base URL。

    优先级：环境变量 DEEPSEEK_BASE_URL > config.json["base_url"] > DEEPSEEK_BASE_URL。
    """
    env_url = os.environ.get("DEEPSEEK_BASE_URL", "").strip()
    if env_url:
        return env_url

    config = _load_config()
    if config.get("base_url"):
        return str(config["base_url"]).strip()

    return DEEPSEEK_BASE_URL


def reload_config() -> None:
    """清空配置缓存，强制下次调用重新读盘。

    供「运行中热更新密钥 / 模型」的场景使用（例如前端设置面板写回 config.json 后）。
    """
    global _config_cache, _config_path_cache
    _config_cache = None
    _config_path_cache = None


# ═══════════════════════════════════════════════════════════════
# 推理开关：游戏内实时 AI 调用的关键性能参数
# ═══════════════════════════════════════════════════════════════
#
# 【背景 / 实测数据】
#     deepseek-flash 是「推理模型」：默认会先产出 reasoning_content
#     （思考过程），再产出 content（最终答案），两部分共享 max_tokens 预算。
#     这给游戏带来两个严重问题：
#
#       1. 预算被思考吃光 → content 为空
#          实测 max_tokens=10 时 100% 返回空 content（思考就用完了额度），
#          导致业力评估 / 棋子估值全部落回本地 fallback，AI 能力形同失效。
#          即便加到 512，长 prompt 场景仍可能被思考吃光。
#
#       2. 时延不可接受
#          实测同一业力评估请求（3 次平均）：
#             默认（开启推理）        : 21.43s   ← 游戏内不可用
#             thinking: disabled      :  0.65s   ← 33 倍加速
#             reasoning_effort: none  :  0.90s
#
#     业力评估（输出一个 1~150 的整数）与棋子估值（输出 50~1000 的整数）
#     都是「简单数值映射」任务，不需要推理链。关闭后更快、更省、更稳定。
#
# 【策略】
#     - 简单数值/分类任务（karma_assessor / chess_ai 估值）：调用
#       get_no_think_params() 合并进请求体，关闭推理。
#     - 复杂生成任务（ai_orchestrator 的意图解析 / JSON Patch 代码生成）：
#       保留默认推理，代码生成质量优先（实测思考 ~3200 tokens 后输出正常）。
#
# 【参数选择依据（实测）】
#     thinking={"type":"disabled"}   → reasoning_tokens=0，结果正确，最快
#     reasoning_effort="none"        → reasoning_tokens=0，结果正确，略慢
#     两者均被 DeepSeek 网关接受；本模块统一采用前者。
# ═══════════════════════════════════════════════════════════════

# 关闭推理的请求参数片段（供简单数值/分类任务合并进 payload）。
NO_THINK_PARAMS: dict = {"thinking": {"type": "disabled"}}


def get_no_think_params() -> dict:
    """返回「关闭推理」的请求参数片段。

    用法：
        payload = {"model": get_model(), "messages": [...], **get_no_think_params()}

    适用于业力评估、棋子估值等简单数值映射任务：实测时延从 ~21s 降到 ~0.65s，
    且避免 reasoning 吃光 max_tokens 导致 content 为空。
    """
    return dict(NO_THINK_PARAMS)
