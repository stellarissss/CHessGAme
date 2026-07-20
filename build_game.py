#!/usr/bin/env python3
"""
棋圣 RPG - 一键打包工具
将项目打包成完整游戏文件夹，双击即可运行
"""

import os
import sys
import shutil
import json
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent
DIST_DIR = WORKSPACE_ROOT / "dist" / "chesssage"

# 需要复制的目录
COPY_DIRS = [
    "shared",
    "xiangqi",
    "wuziqi",
    "go",
    "rpg_data",
]

# 需要复制的文件
COPY_FILES = [
    "requirements.txt",
    "main.py",
]

# 需要排除的文件模式
EXCLUDE_PATTERNS = [
    "__pycache__",
    "*.pyc",
    ".trae",
    ".git",
    "*.txt",
]


def should_exclude(path):
    """判断是否需要排除文件"""
    for pattern in EXCLUDE_PATTERNS:
        if pattern in str(path):
            return True
    return False


def copy_directory(src, dst):
    """复制目录，排除指定模式"""
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        if should_exclude(item):
            continue
        if item.is_dir():
            copy_directory(item, dst / item.name)
        else:
            shutil.copy2(item, dst / item.name)


def patch_rpg_shell_js(dst_path):
    """修改 rpg_shell.js 中的 API 地址为相对路径"""
    rpg_shell_path = dst_path / "shared" / "rpg" / "rpg_shell.js"
    if not rpg_shell_path.exists():
        print(f"✗ 未找到 {rpg_shell_path}")
        return
    
    with open(rpg_shell_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 将绝对 URL 替换为相对路径（通过反向代理）
    content = content.replace(
        "xiangqi: 'http://localhost:8000'",
        "xiangqi: '/xiangqi-api'"
    ).replace(
        "wuziqi: 'http://localhost:8001'",
        "wuziqi: '/wuziqi-api'"
    ).replace(
        "go: 'http://localhost:8002'",
        "go: '/go-api'"
    )
    
    with open(rpg_shell_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    print("✓ 已修改 API 地址为相对路径")


def generate_start_scripts(dst_path):
    """生成启动脚本"""
    # Windows 启动脚本
    bat_content = """@echo off
chcp 65001 >nul
echo ================================================
echo 棋圣 ChessSage RPG
echo ================================================
echo 正在启动游戏...
python main.py
pause
"""
    with open(dst_path / "start.bat", "w", encoding="utf-8") as f:
        f.write(bat_content)
    
    # Linux/Mac 启动脚本
    sh_content = """#!/bin/bash
echo "================================================"
echo "棋圣 ChessSage RPG"
echo "================================================"
echo "正在启动游戏..."
python3 main.py
"""
    with open(dst_path / "start.sh", "w", encoding="utf-8") as f:
        f.write(sh_content)
    
    # 添加执行权限
    os.chmod(dst_path / "start.sh", 0o755)
    
    print("✓ 已生成启动脚本")


def main():
    print("=" * 50)
    print("棋圣 ChessSage RPG")
    print("一键打包工具")
    print("=" * 50)
    print(f"\n工作目录: {WORKSPACE_ROOT}")
    print(f"输出目录: {DIST_DIR}")
    
    # 清空旧的输出目录
    if DIST_DIR.exists():
        print("\n清理旧输出目录...")
        shutil.rmtree(DIST_DIR)
    
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    
    # 复制目录
    print("\n复制文件...")
    for dir_name in COPY_DIRS:
        src = WORKSPACE_ROOT / dir_name
        if src.exists():
            copy_directory(src, DIST_DIR / dir_name)
            print(f"✓ {dir_name}")
        else:
            print(f"✗ 目录不存在: {dir_name}")
    
    # 复制文件
    for file_name in COPY_FILES:
        src = WORKSPACE_ROOT / file_name
        if src.exists():
            shutil.copy2(src, DIST_DIR / file_name)
            print(f"✓ {file_name}")
        else:
            print(f"✗ 文件不存在: {file_name}")
    
    # 修改 API 地址
    print("\n修改配置...")
    patch_rpg_shell_js(DIST_DIR)
    
    # 生成启动脚本
    generate_start_scripts(DIST_DIR)
    
    # 统计文件数量
    total_files = sum(1 for _ in DIST_DIR.rglob("*") if _.is_file())
    total_dirs = sum(1 for _ in DIST_DIR.rglob("*") if _.is_dir())
    
    print("\n" + "=" * 50)
    print(f"打包完成!")
    print(f"输出目录: {DIST_DIR}")
    print(f"文件数量: {total_files}")
    print(f"目录数量: {total_dirs}")
    print("\n运行方式:")
    print("  Windows: 双击 start.bat")
    print("  Linux/Mac: 运行 ./start.sh")
    print("=" * 50)


if __name__ == "__main__":
    main()
