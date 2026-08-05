"""
统一的 AI 配置 - 所有棋类共享
确保模型名称、API 地址、密钥等配置的一致性
"""
import json
from pathlib import Path

DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = "deepseek-v4-flash"

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
    """从 config.json 读取 API 密钥（向上搜索多级目录，兼容 shared/ 与 sandbox 棋类两种位置）"""
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
                    return config.get("api_key", "")
            except Exception:
                return ""
    return ""
