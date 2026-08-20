@echo off
chcp 65001 >nul
echo ================================================
echo  棋圣 ChessSage RPG · 一键打包
echo  ================================================
echo  本脚本需在 Windows 上运行，产出 棋圣.exe
echo  请确保已安装 Python 3.10+ 并执行过:
echo    pip install pyinstaller fastapi "uvicorn[standard]" httpx pydantic jsonschema jsonpatch
echo ================================================
cd /d "%~dp0"
python build_game.py
if errorlevel 1 (
    echo.
    echo 打包失败，请检查上方日志。
    pause
    exit /b 1
)
echo.
echo 打包完成！产物位于 dist\chesssage\ 目录。
pause
