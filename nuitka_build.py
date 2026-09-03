#!/usr/bin/env python3
"""
棋圣 ChessSage RPG · Nuitka 打包脚本（多文件 standalone，生产模式，无控制台）

产出（build/nuitka/棋圣 或 dist/chesssage）:
    多文件目录（standalone onedir）：
        ├── 棋圣.exe / 棋圣       # Nuitka 编译入口（Windows 下无控制台）
        ├── hub/ shared/ configs/ samsara/ sandbox/
        ├── xiangqi/ wuziqi/ weiqi/ dongwuqi/ tiaoqi/ heibaiqi/
        ├── config.json           # API 密钥
        ├── 启动游戏.bat / start.sh
        └── 使用说明.txt

用法：
    Windows:  python nuitka_build.py
    Linux:    python3 nuitka_build.py

可选环境变量：
    CHESSSAGE_COMPILER=msvc  使用已安装的 Visual Studio Build Tools (MSVC) 编译；
                             缺省自动使用 Zig（Python 3.13 不支持 MinGW64）。
    CHESSSAGE_TMP=<绝对路径> 把编译临时目录指到空间充足的盘（C 盘空间不足时用，如 D:\\）。

说明：
    - 多文件 = Nuitka --standalone（内置依赖，无需外部 Python 解释器）。
    - Windows 版 .exe 必须且只能在 Windows 上构建（Nuitka 不支持交叉编译）。
    - C 编译器：Python 3.13 起 MinGW64 不可用，脚本默认自动加 --zig 让 Nuitka 下载 Zig；
      若装了 MSVC，可设 CHESSSAGE_COMPILER=msvc 改用。需联网以便 Nuitka 下载编译器。
    - 冻结包内按需以进程内线程方式拉起棋类服务（见 main.py _IS_FROZEN），
      因此不同棋类无需各自单独编译，只需把源代码目录作为数据一并带上。
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "build" / "nuitka"
DIST = OUT_DIR / "main.dist"
EXE = "棋圣.exe" if os.name == "nt" else "棋圣"

# 作为数据一并携带的游戏代码 / 前端 / 配置（冻结包内以线程方式按需加载）
DATA_DIRS = [
    "hub", "shared", "configs", "samsara", "sandbox",
    "xiangqi", "wuziqi", "weiqi", "dongwuqi", "tiaoqi", "heibaiqi",
]

WINDOWS_FLAGS = []
if os.name == "nt":
    # Python 3.13 及以上无法使用 MinGW64 作为 C 编译器，统一默认改用 Zig
    #（Nuitka 在 --assume-yes-for-downloads 下会自动下载；仅支持 64 位 Python）。
    # 若本机已装 Visual Studio Build Tools(MSVC)，可设 CHESSSAGE_COMPILER=msvc 改回 MSVC。
    compiler = os.environ.get("CHESSSAGE_COMPILER", "zig")
    if compiler == "zig":
        WINDOWS_FLAGS.append("--zig")
    WINDOWS_FLAGS.append("--windows-console-mode=disable")   # 不弹出命令行控制台


def build() -> None:
    print("=" * 58)
    print("  棋圣 ChessSage RPG · Nuitka 打包")
    print("=" * 58)

    cmd = [sys.executable, "-m", "nuitka", "--standalone", f"--output-dir={OUT_DIR}"]
    cmd += ["--assume-yes-for-downloads", "--nofollow-import-to=tkinter"]
    for d in DATA_DIRS:
        cmd += [f"--include-data-dir={d}={d}"]
    cmd += ["--include-data-files=achievements.json=achievements.json"]
    if (ROOT / "config.json").exists():
        cmd += ["--include-data-files=config.json=config.json"]
    cmd += WINDOWS_FLAGS
    cmd += [str(ROOT / "main.py")]

    print("  >", " ".join(cmd))
    env = dict(os.environ)
    # C 盘空间不足时，可把编译临时目录/缓存整目录指到空间充足的盘（如 D:\）
    # CHESSSAGE_TMP=<绝对路径>；脚本自动让 Nuitka/编译器使用该目录。
    if "CHESSSAGE_TMP" in env:
        tmp = os.path.abspath(env["CHESSSAGE_TMP"])
        os.makedirs(tmp, exist_ok=True)
        env["TMP"] = env["TEMP"] = tmp
        cmd += [f"--temp-dir={tmp}"]
    rc = subprocess.run(cmd, cwd=str(ROOT), env=env).returncode
    if rc != 0:
        print("✗ Nuitka 构建失败")
        sys.exit(1)

    if not DIST.exists():
        # 新版本 Nuitka 可能输出 <name>.dist 在别处，做一次查找兜底
        cand = list(OUT_DIR.glob("*.dist"))
        if not cand:
            print("✗ 未找到 Nuitka 输出目录")
            sys.exit(1)
        src = cand[0]
        shutil.move(str(src), str(DIST))
        src.resolve()
    bin_path = next((p for p in DIST.iterdir() if p.name.startswith("main.")), None)
    if bin_path is None:
        print("✗ 未找到编译入口")
        sys.exit(1)

    target = DIST / EXE
    if bin_path.resolve() != target.resolve():
        try:
            bin_path.rename(target)
        except OSError:
            shutil.move(str(bin_path), str(target))
    # 保证 config.json 在产物内
    cfg = DIST / "config.json"
    if not cfg.exists() and (ROOT / "config.json").exists():
        shutil.copy2(ROOT / "config.json", cfg)
    elif not cfg.exists():
        cfg.write_text('{\n  "api_key": ""\n}\n', encoding="utf-8")

    generate_scripts(DIST)
    files = sum(1 for _ in DIST.rglob("*") if _.is_file())
    print("\n" + "~" * 58)
    print("打包完成！")
    print(f"  输出目录: {DIST}")
    print(f"  文件总数: {files}")
    if os.name == "nt":
        print("  启动方式: 双击 启动游戏.bat（无控制台，生产模式）")
    else:
        print("  启动方式: ./start.sh")
    print("~" * 58)


def generate_scripts(dist: Path) -> None:
    if os.name == "nt":
        bat = (
            "@echo off\r\n"
            "chcp 65001 >nul\r\n"
            "cd /d \"%~dp0\"\r\n"
            f"set CHESSSAGE_PRODUCTION=1\r\n"
            f"\"%~dp0{EXE}\"\r\n"
            "pause\r\n"
        )
        (dist / "启动游戏.bat").write_text(bat, encoding="utf-8")
    else:
        (dist / "start.sh").write_text(
            "#!/bin/bash\ncd \"$(dirname \"$0\")\"\nexport CHESSSAGE_PRODUCTION=1\nexec ./\"%s\"\n" % EXE,
            encoding="utf-8",
        ).chmod(0o755)
    (dist / "使用说明.txt").write_text(
        "棋圣 ChessSage RPG · 六道众生（Nuitka 打包版）\n"
        "=========================================\n"
        "运行：Windows 双击 启动游戏.bat；Linux 执行 ./start.sh\n"
        "配置：在 config.json 的 api_key 字段填入密钥。\n"
        "特性：生产模式运行、无命令行控制台、棋类服务按需在进程内懒启动。\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()