# -*- mode: python ; coding: utf-8 -*-
"""
棋圣 ChessSage · PyInstaller 打包规格（onedir 非单文件）

打包范围：
- 入口：bootstrap.py（冻结运行入口）
- 仅打包 Python 运行时 + Web 依赖（fastapi/uvicorn/httpx/pydantic 等）
- 游戏代码与资源（main.py、hub/、shared/、configs/、samsara/、sandbox/、6 个棋类目录、
  config.json）由 build_game.py 作为外部数据复制到 dist/chesssage/，运行时动态加载。

排除项：
- rembg / torch / numpy / PIL / scipy 等仅用于 shared/assets 下的资源生成脚本，
  不属于游戏运行时依赖，不打包以控制体积。
"""
from PyInstaller.utils.hooks import collect_submodules

# 运行时第三方依赖（game 代码在外部，不会进入静态分析，需显式收集）
_RUNTIME_PKGS = [
    "uvicorn",
    "starlette",
    "fastapi",
    "httpx",
    "httpcore",
    "pydantic",
    "jsonschema",
    "jsonpatch",
    "websockets",
    "anyio",
    "h11",
    "certifi",
    "idna",
    "webview",   # pywebview 独立桌面窗口（外部 main.py 运行时导入，需显式收集及其平台后端）
]
hiddenimports = []
for _pkg in _RUNTIME_PKGS:
    try:
        hiddenimports += collect_submodules(_pkg)
    except Exception:
        pass

_EXCLUDES = [
    "rembg", "torch", "numpy", "PIL", "Pillow", "scipy",
    "pandas", "matplotlib", "tensorflow", "onnxruntime", "skimage",
    "pytest", "_pytest", "IPython", "notebook", "jupyter", "tkinter",
]

a = Analysis(
    ["bootstrap.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=_EXCLUDES,
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="棋圣",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="chesssage",
)
