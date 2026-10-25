@echo off
rem 棋圣 · 六道轮回 一键启动（Windows）
cd /d %~dp0

where python >nul 2>nul
if errorlevel 1 (
    echo 未找到 Python，请先安装 Python 3.10+ 并勾选 "Add python.exe to PATH"。
    pause
    exit /b 1
)

if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt

if not exist config.json (
    copy config.example.json config.json >nul
    echo 已生成 config.json，请填入 api_key（或设置环境变量 DEEPSEEK_API_KEY）。
)

echo 正在启动六道众生总坛……
python main.py
pause
