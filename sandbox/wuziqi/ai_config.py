"""
统一的 AI 配置 - 所有棋类共享
确保模型名称、API 地址、密钥等配置的一致性
"""
import json
import os
from pathlib import Path

DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = "deepseek-v4-flash"

# 默认 API 密钥：所有棋类共享的缺省后端（测试用密钥，私人仓库）
DEFAULT_API_KEY = "sk-1081f06d7ea742068057032baefcbec2"

GAME_TYPES = {
    "xiangqi": "象棋",
    "wuziqi": "五子棋",
    "weiqi": "围棋",
    "dongwuqi": "动物棋",
    "tiaoqi": "跳棋",
    "heibaiqi": "黑白棋",
}

SAMSARA_API_URL = "http://localhost:8080"


def get_api_key() -> str:
    """读取 API 密钥：优先环境变量 DEEPSEEK_API_KEY，其次回落 config.json（向上搜索多级目录）"""
    env_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if env_key:
        return env_key
    here = Path(__file__).resolve()
    candidates = [
        here.parent / "config.json",                      # 同目录（sandbox 棋类自带）
        here.parent.parent / "config.json",               # shared/ 场景（共享目录的上一级 = 项目根）
        here.parent.parent.parent / "config.json",        # sandbox/棋类/ 场景（上两级 = 项目根）
    ]
    for config_path in candidates:
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    if config.get("api_key"):
                        return config["api_key"]
            except Exception:
                pass
    return DEFAULT_API_KEY
