@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  棋圣 ChessSage · Windows 一键打包（Nuitka）
REM
REM  用法：
REM      1) 双击本文件即可；或在 cmd / PowerShell 中执行 build_windows.bat
REM      2) 首次运行会自动创建虚拟环境并安装依赖（含 Nuitka 与 C 编译器）
REM
REM  可选参数（直接追加在命令后）：
REM      --python 3.12      指定 Python 版本（默认 3.12；需已装 py 启动器）
REM      --msvc             使用已安装的 Visual Studio Build Tools 编译
REM      --clean            打包前清理旧的 build 产物
REM      --no-cache         不使用 ccache（默认开启以加速二次编译）
REM      --tmp D:\nktmp     把编译临时目录指到空间充足的盘
REM
REM  产物：dist\棋圣\  （含 棋圣.exe + 依赖 + 游戏资源，整个目录可直接分发）
REM ═══════════════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo   棋圣 ChessSage RPG · Windows 一键打包
echo ============================================================
echo.

REM ── 0) 解析参数 ─────────────────────────────────────────────
set "PYVER=3.12"
set "USE_MSVC=0"
set "DO_CLEAN=0"
set "USE_CCACHE=1"
set "TMPDIR="

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--python" ( set "PYVER=%~2" & shift & shift & goto parse_args )
if /i "%~1"=="--msvc"   ( set "USE_MSVC=1" & shift & goto parse_args )
if /i "%~1"=="--clean"  ( set "DO_CLEAN=1" & shift & goto parse_args )
if /i "%~1"=="--no-cache" ( set "USE_CCACHE=0" & shift & goto parse_args )
if /i "%~1"=="--tmp"    ( set "TMPDIR=%~2" & shift & shift & goto parse_args )
echo   [!] 未知参数：%~1（已忽略）
shift
goto parse_args
:args_done

REM ── 1) 定位 Python ──────────────────────────────────────────
echo [1/7] 定位 Python %PYVER% ...
where py >nul 2>nul
if %errorlevel%==0 (
    py -%PYVER% -c "import sys" >nul 2>nul
    if !errorlevel!==0 (
        set "PYCMD=py -%PYVER%"
        goto python_found
    )
)
REM 退回 PATH 中的 python（校验 3.9+）
where python >nul 2>nul
if %errorlevel%==0 (
    set "PYCMD=python"
    for /f "tokens=2" %%v in ('python -V 2^>^&1') do set "PYACTUAL=%%v"
    echo   [i] 未找到 py -%PYVER%，改用 PATH 中的 python !PYACTUAL!
    goto python_found
)
echo   [X] 未找到 Python。请先安装 Python 3.11 / 3.12：https://www.python.org/downloads/
echo       安装时务必勾选 "Add python.exe to PATH" 与 "py launcher"。
pause
exit /b 1
:python_found

for /f "delims=" %%v in ('%PYCMD% -c "import sys;print(sys.version.split()[0])"') do set "PYREAL=%%v"
echo   [OK] Python !PYREAL!  (%PYCMD%)

REM ── 2) 虚拟环境 ─────────────────────────────────────────────
echo.
echo [2/7] 准备构建用虚拟环境 .venv-build ...
if not exist ".venv-build\Scripts\python.exe" (
    %PYCMD% -m venv .venv-build
    if !errorlevel! neq 0 (
        echo   [X] 创建虚拟环境失败
        pause
        exit /b 1
    )
    echo   [OK] 已创建
) else (
    echo   [OK] 已存在，直接复用
)
set "VPY=.venv-build\Scripts\python.exe"

REM ── 3) 安装依赖 ─────────────────────────────────────────────
echo.
echo [3/7] 安装/校验依赖（首次较慢，请耐心等待）...
"%VPY%" -m pip install --upgrade pip setuptools wheel --quiet
if !errorlevel! neq 0 ( echo   [X] pip 升级失败 & pause & exit /b 1 )

REM 项目运行依赖
"%VPY%" -m pip install -r requirements.txt --quiet
if !errorlevel! neq 0 (
    echo   [!] requirements.txt 安装出现问题，尝试使用国内镜像重试...
    "%VPY%" -m pip install -r requirements.txt --quiet ^
        -i https://pypi.tuna.tsinghua.edu.cn/simple
    if !errorlevel! neq 0 ( echo   [X] 依赖安装失败 & pause & exit /b 1 )
)

REM 打包工具链：Nuitka + 依赖 + 加速
set "NKPKGS=nuitka ordered-set zstandard"
if "%USE_CCACHE%"=="1" set "NKPKGS=%NKPKGS% ccache"
"%VPY%" -m pip install %NKPKGS% --quiet
if !errorlevel! neq 0 (
    echo   [!] 使用国内镜像重试打包工具安装...
    "%VPY%" -m pip install %NKPKGS% --quiet -i https://pypi.tuna.tsinghua.edu.cn/simple
    if !errorlevel! neq 0 ( echo   [X] 打包工具安装失败 & pause & exit /b 1 )
)
echo   [OK] 依赖就绪

REM ── 4) C 编译器 ─────────────────────────────────────────────
echo.
echo [4/7] 检查 C 编译器 ...
if "%USE_MSVC%"=="1" (
    echo   [i] 使用 MSVC 模式；请确认已安装 Visual Studio Build Tools（含 C++ 桌面开发）
    set "NK_COMPILER="
) else (
    REM 默认 Zig：Nuitka 会自动下载，无需管理员权限，也不要求 Python 版本匹配 MSVC
    echo   [i] 使用 Zig 模式（Nuitka 自动下载，免安装 Visual Studio）
    set "NK_COMPILER=--zig"
)

REM ── 5) 清理 ─────────────────────────────────────────────────
echo.
echo [5/7] 清理旧产物 ...
if "%DO_CLEAN%"=="1" (
    if exist "build\nuitka" (
        rmdir /s /q "build\nuitka" 2>nul
        echo   [OK] 已清理 build\nuitka
    )
    if exist "dist\棋圣" (
        rmdir /s /q "dist\棋圣" 2>nul
        echo   [OK] 已清理 dist\棋圣
    )
) else (
    echo   [i] 未指定 --clean，保留增量缓存（加速二次编译）
)

REM ── 6) 调用打包脚本 ─────────────────────────────────────────
echo.
echo [6/7] 开始 Nuitka 编译（预计 10-25 分钟，视 CPU 而定）...
echo       中途大量 C 编译输出属正常现象，请勿关闭窗口。
echo.

REM 与 nuitka_build.py 的参数约定保持一致
set "NK_ARGS=--windows"
if defined NK_COMPILER set "NK_ARGS=%NK_ARGS% %NK_COMPILER%"
if "%USE_CCACHE%"=="1" (
    set "NK_ARGS=%NK_ARGS% --enable-cache"
) else (
    set "NK_ARGS=%NK_ARGS% --no-cache"
)
if defined TMPDIR set "NK_ARGS=%NK_ARGS% --tmp "%TMPDIR%""
if "%DO_CLEAN%"=="1" set "NK_ARGS=%NK_ARGS% --clean"

"%VPY%" nuitka_build.py %NK_ARGS%
if !errorlevel! neq 0 (
    echo.
    echo   [X] 打包失败。常见原因与处理：
    echo       1. 网络受限导致 Zig 下载失败 → 加 --msvc 参数改用 Visual Studio
    echo       2. 提示磁盘空间不足          → 加 --tmp D:\nktmp 指定到空间充足的盘
    echo       3. 缺少 pywebview（仅桌面窗口模式需要）→ 执行：
    echo          .venv-build\Scripts\python.exe -m pip install pywebview
    echo       4. 长时间无响应              → 首次编译属正常，耐心等待；二次编译会快很多
    echo.
    pause
    exit /b 1
)

REM ── 7) 完成 ─────────────────────────────────────────────────
echo.
echo ============================================================
echo   [OK] 打包完成
echo ============================================================
if exist "dist\棋圣" (
    echo   产物目录 : %CD%\dist\棋圣
    echo   主程序   : dist\棋圣\棋圣.exe
    echo.
    echo   分发方式 : 整个 "dist\棋圣" 文件夹打包发给玩家，
    echo              双击其中的 "启动游戏.bat" 或 "棋圣.exe" 即可运行。
    echo   API 密钥 : 首次运行后在游戏界面内填写，或直接编辑 config.json。
    echo.
    echo   正在打开产物目录...
    start "" "%CD%\dist\棋圣"
) else (
    echo   [!] 未找到 dist\棋圣，请检查上方 Nuitka 输出。
)
echo.
pause
endlocal
