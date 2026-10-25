#!/usr/bin/env bash
# 棋圣 · 六道轮回 一键启动（Linux / macOS）
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"

if ! command -v "$PY" >/dev/null 2>&1; then
  echo "未找到 Python3，请先安装 Python 3.10 或更高版本。" >&2
  exit 1
fi

if [ ! -d venv ]; then
  "$PY" -m venv venv
fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "已生成 config.json，请填入 api_key（或设置环境变量 DEEPSEEK_API_KEY）。"
fi

echo "正在启动六道众生总坛…… 浏览器将自动打开。"
exec python main.py
