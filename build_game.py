#!/usr/bin/env python3
"""
棋圣 ChessSage RPG · 一键打包脚本（PyInstaller onedir，非单文件）

产物结构（dist/chesssage/）：
    dist/chesssage/
    ├── 棋圣.exe          # 冻结入口（Windows 下双击启动；Linux 下为无后缀可执行文件）
    ├── _internal/        # PyInstaller 内部：Python 运行时 + Web 依赖
    ├── main.py           # 总坛启动器（外部代码，运行时加载）
    ├── hub/  shared/  configs/  samsara/  sandbox/
    ├── xiangqi/ wuziqi/ weiqi/ dongwuqi/ tiaoqi/ heibaiqi/
    ├── config.json       # API 密钥（来自项目根目录本地配置）
    ├── 启动游戏.bat      # Windows 启动脚本
    └── start.sh          # Linux/macOS 启动脚本

用法：
    Windows:  python build_game.py   （或直接运行 一键打包.bat）
    Linux:    python3 build_game.py
说明：
    PyInstaller 不支持交叉编译，Windows 版 .exe 必须在 Windows 上构建。
    本脚本为跨平台，在 Windows 上运行即产出 棋圣.exe。
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent
DIST_ROOT = WORKSPACE_ROOT / "dist" / "chesssage"
WORK_PATH = WORKSPACE_ROOT / "build" / "pyi"
SPEC_FILE = WORKSPACE_ROOT / "chesssage.spec"
EXE_NAME = "棋圣.exe" if os.name == "nt" else "棋圣"

# 需要复制的外部数据目录（游戏代码 / 前端 / 配置 / 资源）
COPY_DIRS = [
    "hub",
    "shared",
    "configs",
    "samsara",
    "sandbox",
    "xiangqi",
    "wuziqi",
    "weiqi",
    "dongwuqi",
    "tiaoqi",
    "heibaiqi",
]

# 需要复制的外部数据文件
COPY_FILES = [
    "main.py",
    "achievements.json",  # 运行时可自建，存在则一并带上
    "config.json",        # API 密钥（若存在则带上，否则生成占位模板）
]

# 复制时排除的目录 / 文件（中间产物与打包脚手架）
EXCLUDE_DIRS = {"__pycache__", ".git", ".trae", "build", "dist", "tests", "node_modules"}
EXCLUDE_PATTERNS = (".pyc", ".pyo", ".trae-html-share-packages")
EXCLUDE_FILES = {"bootstrap.py", "chesssage.spec", "build_game.py", "一键打包.bat"}


def _should_exclude(rel: str) -> bool:
    parts = Path(rel).parts
    if any(p in EXCLUDE_DIRS for p in parts):
        return True
    if any(p.endswith(pat) for p in parts for pat in EXCLUDE_PATTERNS):
        return True
    name = parts[-1] if parts else ""
    if name in EXCLUDE_FILES:
        return True
    return False


def copy_tree(src: Path, dst: Path, rel: str = "") -> tuple[int, int]:
    """递归复制，排除中间产物。返回 (文件数, 目录数)。"""
    n_files = n_dirs = 0
    dst.mkdir(parents=True, exist_ok=True)
    for item in sorted(src.iterdir()):
        rel_item = os.path.join(rel, item.name)
        if _should_exclude(rel_item):
            continue
        if item.is_dir():
            n_dirs += 1
            nf, nd = copy_tree(item, dst / item.name, rel_item)
            n_files += nf
            n_dirs += nd
        else:
            shutil.copy2(item, dst / item.name)
            n_files += 1
    return n_files, n_dirs


def clean_old() -> None:
    for path in (DIST_ROOT, WORK_PATH, WORKSPACE_ROOT / "build" / "chesssage"):
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)


def run_pyinstaller() -> None:
    print("\n[1/4] 运行 PyInstaller（onedir）...")
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--clean", "-y",
        "--distpath", str(WORKSPACE_ROOT / "dist"),
        "--workpath", str(WORK_PATH),
        str(SPEC_FILE),
    ]
    print("  " + " ".join(cmd))
    result = subprocess.run(cmd, cwd=str(WORKSPACE_ROOT))
    if result.returncode != 0:
        print("✗ PyInstaller 构建失败")
        sys.exit(1)
    if not (DIST_ROOT / EXE_NAME).exists():
        print(f"✗ 未找到产物: {DIST_ROOT / EXE_NAME}")
        sys.exit(1)
    print(f"✓ PyInstaller 产物生成: {DIST_ROOT / EXE_NAME}")


def copy_external_data() -> None:
    print("\n[2/4] 复制外部游戏数据...")
    total_files = total_dirs = 0
    for dir_name in COPY_DIRS:
        src = WORKSPACE_ROOT / dir_name
        if src.exists():
            nf, nd = copy_tree(src, DIST_ROOT / dir_name, dir_name)
            total_files += nf
            total_dirs += nd
            print(f"  ✓ {dir_name}/ ({nf} 文件)")
        else:
            print(f"  ✗ 目录不存在: {dir_name}")

    for file_name in COPY_FILES:
        src = WORKSPACE_ROOT / file_name
        if src.exists():
            shutil.copy2(src, DIST_ROOT / file_name)
            total_files += 1
            print(f"  ✓ {file_name}")
        elif file_name == "config.json":
            # 项目根没有 config.json（已 gitignore）→ 生成占位模板，提示用户填写密钥
            placeholder = '{\n  "api_key": ""\n}\n'
            (DIST_ROOT / "config.json").write_text(placeholder, encoding="utf-8")
            print("  ! config.json 不存在，已生成占位模板（请在产物中填入你的 API 密钥）")
    print(f"  共复制 {total_files} 个文件 / {total_dirs} 个目录")


def generate_start_scripts() -> None:
    print("\n[3/4] 生成启动脚本...")
    if os.name == "nt":
        bat = (
            "@echo off\r\n"
            "chcp 65001 >nul\r\n"
            "cd /d \"%~dp0\"\r\n"
            "echo ================================================\r\n"
            "echo   棋圣 ChessSage RPG · 六道众生\r\n"
            "echo ================================================\r\n"
            f"\"%~dp0{EXE_NAME}\"\r\n"
            "pause\r\n"
        )
        (DIST_ROOT / "启动游戏.bat").write_text(bat, encoding="utf-8")
        print("  ✓ 启动游戏.bat")
    else:
        sh_content = (
            "#!/bin/bash\n"
            'cd "$(dirname "$0")"\n'
            f'exec ./"{EXE_NAME}"\n'
        )
        sh_path = DIST_ROOT / "start.sh"
        sh_path.write_text(sh_content, encoding="utf-8")
        sh_path.chmod(0o755)
        print("  ✓ start.sh")

    readme = (
        "棋圣 ChessSage RPG · 六道众生（打包版）\n"
        "=========================================\n"
        "运行方式：\n"
        "  Windows: 双击 启动游戏.bat（或直接双击 棋圣.exe）\n"
        "  Linux/macOS: ./start.sh\n"
        "\n"
        "说明：\n"
        "  1. 首次运行需在 config.json 中填写 API 密钥（api_key 字段）。\n"
        "  2. 启动后会自动拉起 1 个总坛 + 12 个棋类服务（端口 8000-8005 / 8010-8015 / 8080），\n"
        "     并自动打开浏览器，访问 http://localhost:8080/ 。\n"
        "  3. 关闭窗口即停止全部服务。\n"
        "  4. 本目录不可拆分/移动单文件，整体分发（onedir 打包）。\n"
    )
    (DIST_ROOT / "使用说明.txt").write_text(readme, encoding="utf-8")
    print("  ✓ 使用说明.txt")


def main() -> None:
    print("=" * 58)
    print("  棋圣 ChessSage RPG · 一键打包（PyInstaller onedir）")
    print("=" * 58)
    print(f"  项目目录: {WORKSPACE_ROOT}")
    print(f"  输出目录: {DIST_ROOT}")

    clean_old()
    run_pyinstaller()
    copy_external_data()
    generate_start_scripts()

    total_files = sum(1 for _ in DIST_ROOT.rglob("*") if _.is_file())
    print("\n" + "=" * 58)
    print("打包完成!")
    print(f"  输出目录: {DIST_ROOT}")
    print(f"  文件总数: {total_files}")
    if os.name == "nt":
        print("  启动方式: 双击 启动游戏.bat")
    else:
        print("  启动方式: ./start.sh")
    print("=" * 58)


if __name__ == "__main__":
    main()
