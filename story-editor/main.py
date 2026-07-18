"""
剧情编辑器 - 独立后端服务器
================================

从原象棋 main.py 中分离出来的剧情编辑器 API：
  - 剧情项目管理 (/api/stories)
  - 角色资产管理 (/api/characters)
  - AI 角色生成 (/api/ai/generate/character)
  - 批量抠图 (/api/assets/batch-remove-bg)

该模块是 story-editor 子项目的独立 FastAPI 入口，可单独运行：

    python story-editor/main.py

也可作为子应用挂载到主游戏框架中（详见 integration_guide.md）。
"""
import sys
import json
import uuid
import asyncio
from pathlib import Path
from typing import Optional

# ──────────────────────────────────────────────────────────────
# 路径配置
# ──────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = BASE_DIR.parent
SHARED_DIR = WORKSPACE_ROOT / "shared"

# 将 shared/ 与本目录的 scripts/ 加入 sys.path
if str(SHARED_DIR) not in sys.path:
    sys.path.insert(0, str(SHARED_DIR))
SCRIPTS_DIR = BASE_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# 角色资产统一指向 shared/assets/，避免重复
ASSETS_DIR = SHARED_DIR / "assets"
STORIES_DIR = BASE_DIR / "stories"


def _ensure_stories_dir():
    STORIES_DIR.mkdir(parents=True, exist_ok=True)


# ──────────────────────────────────────────────────────────────
# FastAPI 应用
# ──────────────────────────────────────────────────────────────
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="剧情编辑器", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载剧情编辑器前端静态文件（index.html / app.js / style.css / modules/）
if BASE_DIR.exists():
    app.mount("/", StaticFiles(directory=str(BASE_DIR), html=True), name="editor")

# 挂载共享 assets 目录（角色立绘图片）
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


# ═══════════════════════════════════════════════════════════════
# 剧情管理 API
# ═══════════════════════════════════════════════════════════════


@app.get("/api/stories")
async def list_stories():
    """列出所有保存的剧情项目"""
    _ensure_stories_dir()
    stories = []
    for f in STORIES_DIR.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
            stories.append({
                "id": f.stem,
                "meta": data.get("meta", {}),
                "scene_count": len(data.get("scenes", [])),
            })
        except Exception:
            stories.append({"id": f.stem, "meta": {"title": f.stem}, "scene_count": 0})
    stories.sort(key=lambda s: s.get("meta", {}).get("updated_at", ""), reverse=True)
    return stories


@app.get("/api/stories/{story_id}")
async def get_story(story_id: str):
    """获取单个剧情"""
    path = STORIES_DIR / f"{story_id}.json"
    if not path.exists():
        return JSONResponse({"error": "剧情不存在"}, status_code=404)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/stories")
async def save_story(request: Request):
    """保存剧情（新建或覆盖）"""
    _ensure_stories_dir()
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "无效的 JSON"}, status_code=400)

    story_id = data.get("id") or data.get("meta", {}).get("id")
    if not story_id:
        import time
        story_id = "story_" + str(int(time.time()))
    data["id"] = story_id

    path = STORIES_DIR / f"{story_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "id": story_id, "path": str(path)}


@app.delete("/api/stories/{story_id}")
async def delete_story(story_id: str):
    """删除剧情"""
    path = STORIES_DIR / f"{story_id}.json"
    if not path.exists():
        return JSONResponse({"error": "剧情不存在"}, status_code=404)
    path.unlink()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# 角色资产 API
# ═══════════════════════════════════════════════════════════════


@app.get("/api/characters/list")
async def list_characters(debug: bool = False):
    """获取 assets/characters 下的可用角色列表

    Args:
        debug: 是否返回详细调试信息
    """
    characters = []
    debug_info = {
        "assets_dir": str(ASSETS_DIR),
        "characters_dir": str(ASSETS_DIR / "characters"),
        "dir_exists": False,
        "dirs_scanned": [],
        "errors": []
    }

    chars_dir = ASSETS_DIR / "characters"
    if not chars_dir.exists():
        debug_info["errors"].append(f"角色目录不存在: {chars_dir}")
        result = {"characters": characters}
        if debug:
            result["debug"] = debug_info
        return result

    debug_info["dir_exists"] = True

    for char_dir in sorted(chars_dir.iterdir()):
        if not char_dir.is_dir():
            continue
        char_id = char_dir.name
        debug_info["dirs_scanned"].append(char_id)
        portraits = []
        char_errors = []

        manifest_path = char_dir / "manifest.json"
        manifest_used = False
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                if not isinstance(manifest, dict):
                    char_errors.append("manifest 格式错误：不是 JSON 对象")
                    raise ValueError("invalid manifest format")
                images = manifest.get("images", [])
                if not isinstance(images, list):
                    char_errors.append("manifest.images 格式错误：不是数组")
                    raise ValueError("invalid images format")
                for img in images:
                    if not isinstance(img, dict) or "filename" not in img:
                        char_errors.append(f"跳过无效图片项: {img}")
                        continue
                    filename = img["filename"]
                    img_full_path = char_dir / filename
                    if not img_full_path.exists():
                        char_errors.append(f"图片文件不存在: {filename}")
                        continue
                    img_path = f"/assets/characters/{char_id}/{filename}"
                    expr_base = filename.replace(char_id + "_", "").replace(".png", "")
                    category = img.get("category", "")
                    expression = f"{category}_{expr_base}" if category else expr_base
                    portraits.append({
                        "expression": expression,
                        "image": img_path,
                        "category": category
                    })
                char_name = manifest.get("character", manifest.get("name", char_id))
                characters.append({
                    "id": char_id,
                    "name": char_name,
                    "description": manifest.get("description", ""),
                    "color": manifest.get("color", "#4ade80"),
                    "portraits": portraits,
                    "source": "manifest"
                })
                manifest_used = True
            except Exception as e:
                char_errors.append(f"manifest 解析失败: {str(e)}")
                if debug:
                    debug_info["errors"].append(f"[{char_id}] manifest 解析失败: {str(e)}")

        if not manifest_used:
            png_count = 0
            for img_file in sorted(char_dir.glob("*.png")):
                img_path = f"/assets/characters/{char_id}/{img_file.name}"
                expression = img_file.stem.replace(char_id + "_", "")
                portraits.append({"expression": expression, "image": img_path})
                png_count += 1

            if portraits:
                characters.append({
                    "id": char_id,
                    "name": char_id,
                    "portraits": portraits,
                    "source": "scan"
                })
            elif debug:
                debug_info["errors"].append(f"[{char_id}] 没有找到 PNG 图片")

        if char_errors and debug:
            debug_info[f"{char_id}_errors"] = char_errors

    result = {"characters": characters}
    if debug:
        result["debug"] = debug_info
    return result


@app.get("/api/characters/{char_id}")
async def get_character_detail(char_id: str):
    """获取单个角色的详细信息"""
    chars_dir = ASSETS_DIR / "characters"
    char_dir = chars_dir / char_id
    if not char_dir.exists() or not char_dir.is_dir():
        return JSONResponse({"error": "角色不存在"}, status_code=404)

    portraits = []
    manifest = None
    manifest_path = char_dir / "manifest.json"
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            for img in manifest.get("images", []):
                filename = img["filename"]
                img_path = f"/assets/characters/{char_id}/{filename}"
                expr_base = filename.replace(char_id + "_", "").replace(".png", "")
                category = img.get("category", "")
                expression = f"{category}_{expr_base}" if category else expr_base
                portraits.append({
                    "expression": expression,
                    "image": img_path,
                    "category": category,
                    "prompt": img.get("prompt", "")
                })
        except Exception:
            pass

    if not portraits:
        for img_file in sorted(char_dir.glob("*.png")):
            img_path = f"/assets/characters/{char_id}/{img_file.name}"
            expression = img_file.stem.replace(char_id + "_", "")
            portraits.append({"expression": expression, "image": img_path})

    return {
        "id": char_id,
        "name": manifest.get("character", manifest.get("name", char_id)) if manifest else char_id,
        "description": manifest.get("description", "") if manifest else "",
        "color": manifest.get("color", "#4ade80") if manifest else "#4ade80",
        "portraits": portraits,
        "png_count": len(list(char_dir.glob("*.png")))
    }


# ═══════════════════════════════════════════════════════════════
# AI 角色生成 API（依赖 character_generator.py）
# ═══════════════════════════════════════════════════════════════


class CharacterGenerateRequest(BaseModel):
    char_id: str
    char_name: str
    description: str
    expressions: Optional[list] = None
    style: str = "pixel"
    color: str = "#4ade80"


@app.get("/api/ai/config")
async def get_ai_config():
    """获取 AI 配置状态"""
    try:
        from character_generator import ARK_API_KEY, STYLE_PRESETS, ALL_EXPRESSIONS, DEFAULT_EXPRESSIONS
        rembg_installed = False
        try:
            import rembg  # noqa: F401
            rembg_installed = True
        except ImportError:
            pass

        return {
            "api_key_configured": bool(ARK_API_KEY),
            "style_presets": STYLE_PRESETS,
            "all_expressions": [
                {"key": e[0], "label": e[1], "category": e[2]}
                for e in ALL_EXPRESSIONS
            ],
            "default_expressions": DEFAULT_EXPRESSIONS,
            "background_removal": {
                "available": rembg_installed,
                "method": "rembg (local)" if rembg_installed else "none",
                "note": "首次使用时自动下载模型，可能需要一些时间" if rembg_installed else None,
            },
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/ai/generate/character")
async def generate_character(req: CharacterGenerateRequest):
    """创建 AI 角色生成任务（异步）"""
    try:
        from character_generator import create_task, execute_task

        task = create_task(
            char_id=req.char_id,
            char_name=req.char_name,
            description=req.description,
            expressions=req.expressions,
            style=req.style,
            color=req.color,
        )
        asyncio.create_task(execute_task(task, ASSETS_DIR))
        return {"success": True, "task_id": task.task_id, "task": task.to_dict()}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@app.get("/api/ai/generate/character/{task_id}")
async def get_generation_status(task_id: str):
    """获取角色生成任务状态"""
    try:
        from character_generator import get_task
        task = get_task(task_id)
        if not task:
            return JSONResponse({"error": "任务不存在"}, status_code=404)
        return {"success": True, "task": task.to_dict()}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/ai/generate/character/{task_id}/regenerate/{expression}")
async def regenerate_single(task_id: str, expression: str):
    """重新生成单张表情"""
    try:
        from character_generator import (
            get_task, generate_image, build_prompt, download_image,
            remove_background, STYLE_PRESETS
        )

        task = get_task(task_id)
        if not task:
            return JSONResponse({"error": "任务不存在"}, status_code=404)

        prompt = build_prompt(
            user_description=task.description,
            expression_key=expression,
            style=task.style,
            char_name=task.char_name,
        )

        size = STYLE_PRESETS.get(task.style, STYLE_PRESETS["pixel"])["size"]
        url = await generate_image(prompt, size=size)
        if not url:
            return JSONResponse({"success": False, "error": "生成失败"}, status_code=500)

        char_dir = ASSETS_DIR / "characters" / task.char_id
        raw_path = char_dir / f"{expression}_raw.png"
        output_path = char_dir / f"{expression}.png"

        success = await download_image(url, raw_path)
        if not success:
            return JSONResponse({"success": False, "error": "下载失败"}, status_code=500)

        bg_removed = remove_background(raw_path, output_path)
        if not bg_removed:
            output_path = raw_path

        if expression in task.images:
            task.images[expression]["url"] = url
            task.images[expression]["local_path"] = str(output_path)
            task.images[expression]["status"] = "done"

        manifest_path = char_dir / "manifest.json"
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)

                portraits = manifest.get("portraits", [])
                found = False
                for p in portraits:
                    if p.get("expression") == expression:
                        p["image"] = f"/assets/characters/{task.char_id}/{expression}.png"
                        found = True
                        break
                if not found:
                    from character_generator import ALL_EXPRESSIONS
                    exp_label = next(
                        (e[1] for e in ALL_EXPRESSIONS if e[0] == expression),
                        expression
                    )
                    portraits.append({
                        "expression": expression,
                        "label": exp_label,
                        "image": f"/assets/characters/{task.char_id}/{expression}.png",
                    })
                manifest["portraits"] = portraits

                with open(manifest_path, "w", encoding="utf-8") as f:
                    json.dump(manifest, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        return {
            "success": True,
            "expression": expression,
            "url": url,
            "image_path": f"/assets/characters/{task.char_id}/{expression}.png",
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ═══════════════════════════════════════════════════════════════
# 批量抠图 API
# ═══════════════════════════════════════════════════════════════

_bg_remove_tasks = {}


@app.post("/api/assets/batch-remove-bg")
async def api_batch_remove_bg():
    """启动批量抠图任务"""
    try:
        from character_generator import batch_remove_background

        task_id = f"bg_{uuid.uuid4().hex[:12]}"
        _bg_remove_tasks[task_id] = {
            "status": "running",
            "progress": [],
            "result": None,
        }

        async def run_task():
            def on_progress(char_id, filename, status):
                _bg_remove_tasks[task_id]["progress"].append({
                    "char_id": char_id,
                    "filename": filename,
                    "status": status,
                })

            result = await batch_remove_background(ASSETS_DIR, on_progress=on_progress)
            _bg_remove_tasks[task_id]["status"] = "done"
            _bg_remove_tasks[task_id]["result"] = result

        asyncio.create_task(run_task())
        return {"success": True, "task_id": task_id}
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@app.get("/api/assets/batch-remove-bg/{task_id}")
async def get_batch_bg_status(task_id: str):
    """获取批量抠图任务状态"""
    task = _bg_remove_tasks.get(task_id)
    if not task:
        return JSONResponse({"error": "任务不存在"}, status_code=404)
    return {"success": True, **task}


# ═══════════════════════════════════════════════════════════════
# 启动
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    print("=" * 50)
    print("  剧情编辑器 - 启动中...")
    print(f"  访问地址: http://localhost:8001")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8001)
