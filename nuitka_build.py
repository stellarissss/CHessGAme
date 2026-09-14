#!/usr/bin/env python3
"""
棋圣 ChessSage · Nuitka 打包脚本（多文件 standalone onedir / 生产模式 / 无控制台）

产物（dist/棋圣/）：
    dist/棋圣/
        ├── 棋圣.exe              # 编译入口（Windows 无控制台）
        ├── python3.dll / *.pyd   # 运行时依赖（standalone 自带）
        ├── hub/ shared/ configs/ samsara/ sandbox/
        ├── xiangqi/ wuziqi/ weiqi/ dongwuqi/ tiaoqi/ heibaiqi/
        ├── config.json           # API 密钥
        ├── 启动游戏.bat / start.sh
        └── 使用说明.txt

用法：
    Windows:  build_windows.bat            （推荐，一键）
              或  .venv-build\\Scripts\\python.exe nuitka_build.py --windows --zig
    Linux:    python3 nuitka_build.py

命令行参数：
    --windows          Windows 目标（在 Windows 上默认即可，可省略）
    --zig              使用 Zig 作为 C 编译器（Nuitka 自动下载；含 MSVC 时可不加）
    --enable-cache     启用 ccache 加速二次编译（默认开启）
    --no-cache         关闭 ccache
    --clean            编译前清理旧产物与缓存
    --tmp <路径>       指定编译临时目录（C 盘空间不足时用，如 D:\\nktmp）
    --output <路径>    自定义最终产物目录（默认 dist/棋圣）

设计要点（为什么这样打包）：
    1. 入口是 main.py —— 同一份 main.py 既是开发态启动器，也是冻结产物的唯一入口；
       bootstrap.py 不会被打包器编入，其「子进程分支」逻辑已内联进 main.py。
    2. 子进程模型 —— 冻结后父进程以 [本exe, <棋类>/main.py] 拉起子服务，main.py 入口
       通过 _run_as_child_script() 还原「解释器 + 脚本」语义，使每个棋类获得独立的
       进程与模块命名空间（各棋类目录下存在同名模块 chess_ai.py / rule_engine.py 等，
       若在同一进程内加载会互相污染）。
    3. 代码以「数据目录」形式随包携带（--include-data-dir）—— 棋类服务由子进程按需
       runpy 加载，Nuitka 静态分析无法追踪，故必须显式携带源码目录。
    4. webview 显式 --include-package —— pywebview 在 main.py 中是延迟导入（函数内
       import），静态分析检测不到，漏了会在 --window 模式下崩溃。
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "build" / "nuitka"
DEFAULT_OUTPUT = ROOT / "dist" / "棋圣"
EXE = "棋圣.exe" if os.name == "nt" else "棋圣"
ENTRY = ROOT / "main.py"

# 作为数据一并携带的游戏代码 / 前端 / 配置
DATA_DIRS = [
    "hub", "shared", "configs", "samsara", "sandbox",
    "xiangqi", "wuziqi", "weiqi", "dongwuqi", "tiaoqi", "heibaiqi",
]

# 运行期必需、但可能被静态分析漏掉的包。
# 注意：pywebview 无需在此列出——Nuitka 自带 pywebview 插件会自动识别并打包
# （手动再加 --include-package=webview 会与之冲突报 FATAL）。
INCLUDE_PACKAGES: list[str] = []

# 明确排除的无用大包（减小产物体积 / 避免误报缺失）
EXCLUDE_PACKAGES = [
    "tkinter", "matplotlib", "numpy", "pandas", "scipy",
    "PIL", "rembg", "onnxruntime", "cv2", "notebook", "IPython",
]


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="棋圣 ChessSage · Nuitka 多文件打包",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    ap.add_argument("--windows", action="store_true", help="Windows 目标标记（兼容 .bat 传参）")
    ap.add_argument("--zig", action="store_true", help="使用 Zig 作为 C 编译器")
    ap.add_argument("--msvc", action="store_true", help="使用已安装的 MSVC 编译")
    ap.add_argument("--enable-cache", dest="cache", action="store_true", default=True,
                    help="启用 ccache（默认开启）")
    ap.add_argument("--no-cache", dest="cache", action="store_false", help="关闭 ccache")
    ap.add_argument("--clean", action="store_true", help="编译前清理旧产物与缓存")
    ap.add_argument("--tmp", metavar="PATH", default=None, help="编译临时目录")
    ap.add_argument("--output", metavar="PATH", default=None, help="最终产物目录")
    ap.add_argument("--console", action="store_true", help="保留控制台（调试用）")
    args, _unknown = ap.parse_known_args()
    return args


def _list_py(root: Path) -> list[Path]:
    """列出目录下所有 .py 文件（排除 __pycache__），按路径排序保证命令稳定。"""
    return sorted(
        p for p in root.rglob("*.py")
        if "__pycache__" not in p.parts and p.is_file()
    )


def _pkg_available(name: str) -> bool:
    """检测当前解释器是否可导入指定顶层包（不真正导入，避免副作用）。"""
    import importlib.util
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def clean(extra_tmp: str | None = None) -> None:
    for p in (OUT_DIR, DEFAULT_OUTPUT):
        if p.exists():
            print(f"  · 清理 {p}")
            shutil.rmtree(p, ignore_errors=True)
    if extra_tmp:
        t = Path(extra_tmp)
        if t.exists():
            print(f"  · 清理临时目录 {t}")
            shutil.rmtree(t, ignore_errors=True)


def build() -> int:
    args = parse_args()

    print("=" * 60)
    print("  棋圣 ChessSage · Nuitka 打包（standalone onedir）")
    print("=" * 60)
    print(f"  Python : {sys.version.split()[0]}  ({sys.executable})")
    print(f"  平台   : {sys.platform}")

    if args.clean:
        print("\n[清理]")
        clean(args.tmp)

    if not ENTRY.exists():
        print(f"✗ 找不到入口文件 {ENTRY}")
        return 1

    output = Path(args.output).resolve() if args.output else DEFAULT_OUTPUT

    cmd = [
        sys.executable, "-m", "nuitka",
        "--standalone",
        f"--output-dir={OUT_DIR}",
        "--assume-yes-for-downloads",
        "--lto=no",                      # 关闭 LTO：显著加快编译，性能损失可忽略
        "--remove-output",
        "--company-name=ChessSage",
        "--product-name=棋圣",
        "--file-version=3.1.0.0",
        "--product-version=3.1.0.0",
        "--file-description=棋圣·六道轮回",
    ]

    # ── 平台/编译器相关 ────────────────────────────────────────
    if os.name == "nt":
        if args.msvc:
            print("  [编译器] MSVC")
        elif args.zig or os.environ.get("CHESSSAGE_COMPILER", "zig") == "zig":
            cmd.append("--zig")
            print("  [编译器] Zig（自动下载，免装 Visual Studio）")
        if not args.console:
            cmd.append("--windows-console-mode=disable")
        # 图标：仅当 assets 下存在 .ico 时才传，否则留空参数会被 Nuitka 判为非法
        ico = ROOT / "assets" / "app.ico"
        if ico.is_file():
            cmd.append(f"--windows-icon-from-ico={ico}")
    else:
        print("  [编译器] 系统 gcc/clang")

    # ── 缓存 ───────────────────────────────────────────────────
    # Nuitka 的编译缓存（含 ccache）默认即为开启，没有 --enable-cache 这类选项，
    # 只能通过 --disable-cache 关闭。故「开启」时什么都不加，仅关闭时传参。
    if not args.cache:
        cmd.append("--disable-cache=ccache")
        print("  [缓存] 已关闭 ccache")

    # ── 临时目录 ───────────────────────────────────────────────
    tmp = args.tmp or os.environ.get("CHESSSAGE_TMP")
    if tmp:
        tmp_abs = os.path.abspath(tmp)
        os.makedirs(tmp_abs, exist_ok=True)
        cmd.append(f"--temp-dir={tmp_abs}")
        print(f"  [临时目录] {tmp_abs}")

    # ── 数据目录 ───────────────────────────────────────────────
    # 关键陷阱：Nuitka 的 --include-data-dir 会把 .py 视为「代码」而自动过滤，
    # 导致棋类服务的源码一个都进不了产物（这正是旧包「完全无法使用」的根因）。
    # 因此分两路携带：
    #   (1) --include-data-dir=<dir>=<dir>          —— 携带前端/配置等非 py 资源；
    #   (2) --include-data-files=<单个py>=<同名路径> —— 逐个强制携带 .py 源码。
    # 必须「逐文件精确映射」，不能用 <dir>/**/*.py 通配：通配会把子目录层级压平
    # （sandbox/xiangqi/main.py 会挤成 sandbox/main.py 互相覆盖）。
    for d in DATA_DIRS:
        if not (ROOT / d).is_dir():
            print(f"  [!] 数据目录缺失，跳过：{d}")
            continue
        # 仅当目录内存在非 .py 资源时才加 --include-data-dir；
        # 纯 .py 目录（如 samsara/）加它会触发误导性的 "No data files" 告警。
        if any(
            p.is_file() and p.suffix != ".py" and "__pycache__" not in p.parts
            for p in (ROOT / d).rglob("*")
        ):
            cmd.append(f"--include-data-dir={d}={d}")
        pys = _list_py(ROOT / d)
        for p in pys:
            rel = p.relative_to(ROOT).as_posix()
            cmd.append(f"--include-data-files={rel}={rel}")
        print(f"  · {d}: {len(pys)} 个 .py 源码")

    cmd.append("--include-data-files=achievements.json=achievements.json")
    if (ROOT / "config.json").exists():
        cmd.append("--include-data-files=config.json=config.json")

    # ── 显式包含 / 排除 ────────────────────────────────────────
    # pywebview 为可选依赖（仅 --window 桌面窗口模式需要），缺失时降级为告警，
    # 不能因此让整个打包失败——默认浏览器模式无需它。
    for pkg in INCLUDE_PACKAGES:
        if _pkg_available(pkg):
            cmd.append(f"--include-package={pkg}")
        else:
            print(f"  [!] 可选包未安装，跳过 --include-package={pkg}"
                  f"（{pkg} 仅桌面窗口模式需要，浏览器模式不受影响）")
    for pkg in EXCLUDE_PACKAGES:
        cmd.append(f"--nofollow-import-to={pkg}")

    cmd.append(str(ENTRY))

    print("\n[Nuitka 命令]")
    print("  " + " ".join(cmd))
    print("\n[编译中] 首次约 10-25 分钟，大量 C 编译输出属正常，请勿中断...\n")
    t0 = time.time()
    rc = subprocess.run(cmd, cwd=str(ROOT)).returncode
    if rc != 0:
        print(f"\n✗ Nuitka 构建失败（退出码 {rc}）")
        return rc

    print(f"\n[编译完成] 耗时 {time.time() - t0:.0f}s，开始整理产物...")

    # ── 定位 .dist 输出 ────────────────────────────────────────
    dist = OUT_DIR / "main.dist"
    if not dist.is_dir():
        cands = [p for p in OUT_DIR.glob("*.dist") if p.is_dir()]
        if not cands:
            print("✗ 未找到 Nuitka 输出目录（*.dist）")
            return 1
        dist = cands[0]

    # ── 重命名入口 ─────────────────────────────────────────────
    bin_path = next((p for p in dist.iterdir() if p.name.startswith("main.")), None)
    if bin_path is None:
        print("✗ 未找到编译入口可执行文件")
        return 1
    target_bin = dist / EXE
    if bin_path.resolve() != target_bin.resolve():
        try:
            bin_path.rename(target_bin)
        except OSError:
            shutil.move(str(bin_path), str(target_bin))
    print(f"  · 入口已重命名为 {EXE}")

    # ── 补齐 config.json ──────────────────────────────────────
    cfg = dist / "config.json"
    if not cfg.exists():
        if (ROOT / "config.json").exists():
            shutil.copy2(ROOT / "config.json", cfg)
        else:
            cfg.write_text('{\n  "api_key": ""\n}\n', encoding="utf-8")

    generate_scripts(dist)

    # ── 移动到最终产物目录 ────────────────────────────────────
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        shutil.rmtree(output, ignore_errors=True)
    try:
        shutil.move(str(dist), str(output))
    except OSError:
        shutil.copytree(dist, output)
        shutil.rmtree(dist, ignore_errors=True)

    files = sum(1 for _ in output.rglob("*") if _.is_file())
    size_mb = sum(_.stat().st_size for _ in output.rglob("*") if _.is_file()) / 1024 / 1024
    print("\n" + "~" * 60)
    print("  打包完成")
    print(f"  产物目录 : {output}")
    print(f"  文件总数 : {files}")
    print(f"  占用空间 : {size_mb:.0f} MB")
    if os.name == "nt":
        print(f"  启动方式 : 双击 {output}\\启动游戏.bat")
    else:
        print(f"  启动方式 : cd {output} && ./start.sh")
    print("~" * 60)
    return 0


def generate_scripts(dist: Path) -> None:
    """在产物目录内生成一键启动脚本与说明。"""
    if os.name == "nt":
        bat = (
            "@echo off\r\n"
            "chcp 65001 >nul\r\n"
            "cd /d \"%~dp0\"\r\n"
            "set CHESSSAGE_PRODUCTION=1\r\n"
            "set CHESSSAGE_FROZEN=1\r\n"
            f"start \"\" \"%~dp0{EXE}\"\r\n"
            "exit /b 0\r\n"
        )
        (dist / "启动游戏.bat").write_text(bat, encoding="utf-8")
    else:
        sh = dist / "start.sh"
        sh.write_text(
            "#!/bin/bash\n"
            "cd \"$(dirname \"$0\")\"\n"
            "export CHESSSAGE_PRODUCTION=1\n"
            "export CHESSSAGE_FROZEN=1\n"
            f"exec ./{EXE} \"$@\"\n",
            encoding="utf-8",
        )
        os.chmod(sh, 0o755)

    (dist / "使用说明.txt").write_text(
        "棋圣 ChessSage · 六道轮回（Nuitka 打包版）\n"
        "============================================\n"
        "\n"
        "【运行】\n"
        "  Windows：双击「启动游戏.bat」（或直接双击 棋圣.exe）\n"
        "  Linux  ：在终端执行 ./start.sh\n"
        "\n"
        "【配置】\n"
        "  在 config.json 的 api_key 字段填入大模型密钥；\n"
        "  也可在游戏界面内填写。\n"
        "\n"
        "【说明】\n"
        "  · 首次启动会稍慢（需初始化内置运行环境）。\n"
        "  · 棋类服务按需启动：进入某棋类时才拉起对应服务，退出后自动回收。\n"
        "  · 浏览器打开 http://localhost:8080 即为总坛界面。\n"
        "  · 本目录需整体分发，请勿单独拷贝 棋圣.exe。\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    sys.exit(build())
