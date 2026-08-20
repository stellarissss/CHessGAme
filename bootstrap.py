#!/usr/bin/env python3
"""
棋圣 ChessSage · 冻结运行入口（PyInstaller onedir 打包入口）

设计：
- 本文件被 PyInstaller 打包为可执行文件（Windows 下为 棋圣.exe）。
- 游戏代码与资源（main.py、hub/、shared/、各棋类目录、config.json 等）
  全部保留在可执行文件旁边的外部目录，由本入口在运行时动态加载。
- 两种运行模式：
  1) 启动器模式：不带参数运行 → 加载外部 main.py（总坛 + 12 个棋类子服务）。
  2) 子进程模式：argv[1] 是某个棋类服务的 main.py 路径 → 直接运行该服务。
     （冻结后 sys.executable 指向本 exe，main.py 以 [exe, 脚本路径] 拉起子进程，
       本入口据此实现与开发态 python 一致的“解释器 + 脚本”语义。）

仅在打包产物中使用；开发态仍直接运行 `python main.py`。
"""
import os
import sys
import importlib.util


def _app_root() -> str:
    """可执行文件所在目录（外部数据根目录）。"""
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def _run_script(path: str) -> None:
    """将外部脚本作为 __main__ 加载执行，保证其相对导入与 if __name__ == "__main__" 生效。"""
    path = os.path.abspath(path)
    script_dir = os.path.dirname(path)
    for p in (os.getcwd(), script_dir, _app_root()):
        if p and p not in sys.path:
            sys.path.insert(0, p)

    spec = importlib.util.spec_from_file_location("__main__", path)
    if spec is None or spec.loader is None:
        print(f"✗ 无法加载脚本: {path}")
        sys.exit(1)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["__main__"] = mod
    spec.loader.exec_module(mod)


def main() -> None:
    # 子进程模式：argv[1] 指向一个可运行的脚本
    if len(sys.argv) > 1 and sys.argv[1].endswith(".py") and os.path.isfile(sys.argv[1]):
        _run_script(sys.argv[1])
        return

    # 启动器模式：加载外部 main.py
    main_py = os.path.join(_app_root(), "main.py")
    if not os.path.isfile(main_py):
        print("✗ 未找到 main.py")
        print(f"  请确认游戏文件与程序位于同一目录: {_app_root()}")
        if os.name == "nt":
            input("按回车退出...")
        sys.exit(1)
    _run_script(main_py)


if __name__ == "__main__":
    main()
