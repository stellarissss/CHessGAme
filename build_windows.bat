@echo off
REM 必须先切到 UTF-8 代码页,再读取下方任何中文内容
chcp 65001 >nul 2>nul
REM ═══════════════════════════════════════════════════════════════════════
REM  棋圣 ChessSage · Windows 一键打包 [Nuitka]
REM
REM  用法:
REM      1) 双击本文件即可;或在 cmd / PowerShell 中执行 build_windows.bat
REM      2) 首次运行会自动创建虚拟环境并安装依赖,含 Nuitka 与 C 编译器
REM
REM  可选参数 [直接追加在命令后]:
REM      --python 3.12      指定 Python 版本,默认 3.12
REM      --msvc             使用已安装的 Visual Studio Build Tools 编译
REM      --clean            打包前清理旧的 build 产物
REM      --no-cache         不使用编译缓存
REM      --tmp D:\nktmp     把编译临时目录指到空间充足的盘
REM      --no-sleep         不启用编译期休眠抑制
REM
REM  编译期行为:
REM      会临时关闭系统睡眠[交流电睡眠超时设为永不],结束后自动还原
REM      本脚本不会关机,编译结束[无论成功或失败]后始终保留开机状态
REM
REM  产物:dist\棋圣\  含 棋圣.exe + 依赖 + 游戏资源,整个目录可直接分发
REM ═══════════════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
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
set "DO_NOSLEEP=1"
set "SLEEP_TIMEOUT_CHANGED="

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--python" ( set "PYVER=%~2" & shift & shift & goto parse_args )
if /i "%~1"=="--msvc"   ( set "USE_MSVC=1" & shift & goto parse_args )
if /i "%~1"=="--clean"  ( set "DO_CLEAN=1" & shift & goto parse_args )
if /i "%~1"=="--no-cache" ( set "USE_CCACHE=0" & shift & goto parse_args )
if /i "%~1"=="--tmp"    ( set "TMPDIR=%~2" & shift & shift & goto parse_args )
if /i "%~1"=="--no-sleep" ( set "DO_NOSLEEP=0" & shift & goto parse_args )
echo   [!] 未知参数:%~1(已忽略)
shift
goto parse_args
:args_done

REM ── 0.1) 阻止休眠[编译期间保持系统唤醒]────────────────────
REM 编译动辄 10-25 分钟,若期间系统休眠会直接中断编译.
REM 主方案:把[交流电睡眠超时]临时设为 0[永不睡眠],收尾时还原为 30 分钟.
REM 该方案无需管理员权限,对整机生效,是最稳的做法.
REM 辅助:powercfg /requestsoverride 为编译用的 python 进程登记 SYSTEM 请求
REM [需管理员权限,非管理员时静默跳过,主方案已足够].
echo   [i] 正在启用编译期休眠抑制...
REM 主方案:临时关闭睡眠[记录是否改动成功,用于收尾还原]
if "%DO_NOSLEEP%"=="1" (
    powercfg /change standby-timeout-ac 0 >nul 2>nul
    if !errorlevel! equ 0 (
        set "SLEEP_TIMEOUT_CHANGED=1"
        echo   [OK] 已临时关闭睡眠(交流电睡眠超时设为永不).
    ) else (
        echo   [!] 无法修改电源计划;建议以管理员身份运行本脚本.
    )
    REM 辅助方案:为 python 进程登记请求[无权限时静默忽略]
    powercfg /requestsoverride PROCESS python.exe SYSTEM >nul 2>nul
) else (
    echo   [i] 已按 --no-sleep 跳过休眠抑制.
)
echo.

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
REM 退回 PATH 中的 python[校验 3.9+]
where python >nul 2>nul
if %errorlevel%==0 (
    set "PYCMD=python"
    for /f "tokens=2" %%v in ('python -V 2^>^&1') do set "PYACTUAL=%%v"
    echo   [i] 未找到 py -%PYVER%,改用 PATH 中的 python !PYACTUAL!
    goto python_found
)
echo   [X] 未找到 Python.请先安装 Python 3.11 / 3.12:https://www.python.org/downloads/
echo       安装时务必勾选 "Add python.exe to PATH" 与 "py launcher".
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
    echo   [OK] 已存在,直接复用
)
set "VPY=.venv-build\Scripts\python.exe"

REM ── 3) 安装依赖 ─────────────────────────────────────────────
echo.
echo [3/7] 安装/校验依赖(首次较慢,通常 2-6 分钟)...
echo       ├ 说明:使用 requirements-build.txt(打包精简集),
echo       │       不含 rembg/onnxruntime 等仅离线美术脚本使用的重包.
echo       └ 若长时间无输出属正常(pip 正在下载),但下面会显示进度条.
echo.

echo       [3.1/3.3] 升级 pip / setuptools / wheel ...
"%VPY%" -m pip install --upgrade pip setuptools wheel ^
    --disable-pip-version-check --progress-bar on
if !errorlevel! neq 0 ( echo   [X] pip 升级失败 & pause & exit /b 1 )

echo.
echo       [3.2/3.3] 安装运行时依赖 ...
set "BUILD_REQ=requirements-build.txt"
if not exist "%BUILD_REQ%" set "BUILD_REQ=requirements.txt"
"%VPY%" -m pip install -r "%BUILD_REQ%" ^
    --disable-pip-version-check --progress-bar on
if !errorlevel! neq 0 (
    echo   [!] 安装出现问题,改用国内镜像重试(清华源)...
    "%VPY%" -m pip install -r "%BUILD_REQ%" ^
        --disable-pip-version-check --progress-bar on ^
        -i https://pypi.tuna.tsinghua.edu.cn/simple
    if !errorlevel! neq 0 ( echo   [X] 依赖安装失败 & pause & exit /b 1 )
)

echo.
echo       [3.3/3.3] 安装打包工具链 Nuitka ...
REM ccache 是 C 语言程序,并非 PyPI 包,不能用 pip 安装
REM Windows 下 Nuitka 走 Zig/MSVC 工具链,本就不使用 ccache
REM 只装 Nuitka 官方要求的两个依赖,缺任一都会导致编译报错
set "NKPKGS=nuitka ordered-set zstandard"
"%VPY%" -m pip install %NKPKGS% --disable-pip-version-check --progress-bar on
if !errorlevel! neq 0 (
    echo   [!] 使用国内镜像重试打包工具安装...
    "%VPY%" -m pip install %NKPKGS% --disable-pip-version-check ^
        --progress-bar on -i https://pypi.tuna.tsinghua.edu.cn/simple
    if !errorlevel! neq 0 ( echo   [X] 打包工具安装失败 & pause & exit /b 1 )
)

REM 校验 Nuitka 可正常调用[提前暴露安装问题,避免编译到一半才失败]
"%VPY%" -m nuitka --version >nul 2>nul
if !errorlevel! neq 0 (
    echo   [X] Nuitka 安装异常,无法执行 "%VPY% -m nuitka --version"
    pause
    exit /b 1
)
echo.
echo   [OK] 依赖就绪

REM ── 4) C 编译器 ─────────────────────────────────────────────
echo.
echo [4/7] 检查 C 编译器 ...
if "%USE_MSVC%"=="1" (
    echo   [i] 使用 MSVC 模式;请确认已安装 Visual Studio Build Tools(含 C++ 桌面开发)
    set "NK_COMPILER="
) else (
    REM 默认 Zig:Nuitka 会自动下载,无需管理员权限,也不要求 Python 版本匹配 MSVC
    echo   [i] 使用 Zig 模式(Nuitka 自动下载,免安装 Visual Studio)
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
    echo   [i] 未指定 --clean,保留增量缓存(加速二次编译)
)

REM ── 6) 调用打包脚本 ─────────────────────────────────────────
echo.
echo [6/7] 开始 Nuitka 编译(预计 10-25 分钟,视 CPU 而定)...
echo       中途大量 C 编译输出属正常现象,请勿关闭窗口.
echo.

REM 与 nuitka_build.py 的参数约定保持一致
REM 注意:Nuitka 没有 --enable-cache 选项[编译缓存默认开启],只有 --disable-cache.
REM 因此这里只在「关闭缓存」时传 --no-cache,开启时什么都不传.
set "NK_ARGS=--windows"
if defined NK_COMPILER set "NK_ARGS=%NK_ARGS% %NK_COMPILER%"
if "%USE_CCACHE%"=="0" set "NK_ARGS=%NK_ARGS% --no-cache"
if defined TMPDIR set NK_ARGS=%NK_ARGS% --tmp "%TMPDIR%"
if "%DO_CLEAN%"=="1" set "NK_ARGS=%NK_ARGS% --clean"

"%VPY%" nuitka_build.py %NK_ARGS%
REM 必须用 !errorlevel! 延迟展开:setlocal EnableDelayedExpansion 下 %errorlevel%
REM 会在整个 if 块解析时就被提前求值,取到的是旧值.
set "BUILD_RC=!errorlevel!"

if !BUILD_RC! neq 0 (
    echo.
    echo   [X] 打包失败(退出码 !BUILD_RC!).常见原因与处理:
    echo       1. 网络受限导致 Zig 下载失败,可加 --msvc 参数改用 Visual Studio
    echo       2. 提示磁盘空间不足,可加 --tmp D:\nktmp 指定到空间充足的盘
    echo       3. 缺少 pywebview(仅桌面窗口模式需要),执行:
    echo          .venv-build\Scripts\python.exe -m pip install pywebview
    echo       4. 长时间无响应,首次编译属正常,耐心等待;二次编译会快很多
    echo.
    goto finish
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
    echo   分发方式 : 整个 "dist\棋圣" 文件夹打包发给玩家,
    echo              双击其中的 "启动游戏.bat" 或 "棋圣.exe" 即可运行.
    echo   API 密钥 : 首次运行后在游戏界面内填写,或直接编辑 config.json.
    echo.
    echo   正在打开产物目录...
    start "" "%CD%\dist\棋圣"
) else (
    echo   [!] 未找到 dist\棋圣,请检查上方 Nuitka 输出.
)

REM ══════════════════════════════════════════════════════════════
REM  收尾:解除休眠抑制 [统一出口,成功/失败都会走到]
REM  注意:本脚本不会关机,编译结束后始终保留开机状态.
REM ══════════════════════════════════════════════════════════════
:finish
echo.
echo ------------------------------------------------------------
REM 解除休眠抑制:清除进程规则;若改过睡眠超时则还原为 30 分钟
powercfg /requestsoverride PROCESS python.exe >nul 2>nul
if defined SLEEP_TIMEOUT_CHANGED (
    powercfg /change standby-timeout-ac 30 >nul 2>nul
    echo   [i] 已还原电源计划(睡眠超时 30 分钟).
) else (
    echo   [i] 休眠抑制已解除(电源计划未被改动).
)
echo.
pause
echo ------------------------------------------------------------
endlocal
