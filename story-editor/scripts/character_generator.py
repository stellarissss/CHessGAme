"""
AI 角色生成器 - 核心模块
集成 Seedream 图像生成 + 自动抠图 + 角色资产组织
"""

import asyncio
import json
import os
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import httpx

# ============================================================
# 配置
# ============================================================

ARK_API_KEY = (
    os.getenv("ARK_API_KEY")
    or os.getenv("MODEL_IMAGE_API_KEY")
    or os.getenv("MODEL_AGENT_API_KEY")
)
ARK_BASE_URL = (
    os.getenv("ARK_BASE_URL")
    or os.getenv("MODEL_IMAGE_API_BASE")
    or "https://ark.cn-beijing.volces.com/api/v3"
).rstrip("/")

SEEDREAM_MODEL = "doubao-seedream-5-0-260128"
DEFAULT_SIZE = "1024x1024"
REQUEST_TIMEOUT = 120  # 秒

# 预设表情列表
DEFAULT_EXPRESSIONS = [
    "neutral", "happy", "sad", "angry",
    "surprised", "thinking", "laughing", "defeated"
]

ALL_EXPRESSIONS = [
    # 表情
    ("neutral", "平静的表情", "表情"),
    ("happy", "开心的微笑", "表情"),
    ("sad", "悲伤难过的表情", "表情"),
    ("angry", "愤怒生气的表情", "表情"),
    ("surprised", "惊讶吃惊的表情", "表情"),
    ("thinking", "思考沉思的表情", "表情"),
    ("laughing", "大笑的表情", "表情"),
    ("defeated", "挫败失落的表情", "表情"),
    ("victory", "胜利得意的表情", "表情"),
    ("scheming", "狡黠计谋的表情", "表情"),
    ("shy", "害羞腼腆的表情", "表情"),
    ("crying", "哭泣流泪的表情", "表情"),
    # 姿态
    ("idle", "自然站立的姿态", "姿态"),
    ("thinking_pose", "手托下巴思考的姿态", "姿态"),
    ("pointing", "手指向前方的姿态", "姿态"),
    ("cheering", "欢呼的姿态", "姿态"),
    ("crossed_arms", "双臂交叉抱胸的姿态", "姿态"),
    ("walking1", "行走中的姿态(左脚在前)", "姿态"),
    ("walking2", "行走中的姿态(右脚在前)", "姿态"),
    ("portrait", "头像特写", "构图"),
]

# 风格预设
STYLE_PRESETS = {
    "pixel": {
        "name": "像素画 (128x128)",
        "size": "1024x1024",
        "style_prompt": "pixel art style, 16-bit retro game sprite, pixelated, clean pixel edges, game character sprite sheet style",
    },
    "anime": {
        "name": "二次元动漫",
        "size": "1024x1024",
        "style_prompt": "anime style, japanese animation, cel shading, clean line art, vibrant colors, visual novel character sprite",
    },
    "realistic": {
        "name": "写实风格",
        "size": "1024x1024",
        "style_prompt": "realistic, photorealistic, detailed rendering, cinematic lighting, high detail portrait",
    },
}


# ============================================================
# 提示词构建
# ============================================================

def build_prompt(
    user_description: str,
    expression_key: str,
    style: str = "pixel",
    char_name: str = ""
) -> str:
    """构建完整的生图提示词
    
    Args:
        user_description: 用户输入的外貌描述
        expression_key: 表情/姿态 key
        style: 风格预设 key
        char_name: 角色名称（可选）
    
    Returns:
        完整的英文提示词
    """
    exp_info = next((e for e in ALL_EXPRESSIONS if e[0] == expression_key), None)
    expression_desc = exp_info[1] if exp_info else "neutral expression"
    
    style_cfg = STYLE_PRESETS.get(style, STYLE_PRESETS["pixel"])
    
    # 基础角色描述模板（英文，利于模型理解）
    base_prompt = f"""
full body character portrait, single character, {expression_desc},
{user_description},
{style_cfg['style_prompt']},
white background, simple background, facing viewer,
centered composition, full body visible from head to toe,
high quality, detailed character design
    """.strip()
    
    # 负面提示词
    # (Seedream 5.0 可能不支持 negative_prompt，先不使用)
    
    return base_prompt


# ============================================================
# Seedream API 调用
# ============================================================

def _get_headers() -> dict:
    if not ARK_API_KEY:
        raise ValueError("请设置 ARK_API_KEY 环境变量")
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {ARK_API_KEY}",
    }


async def generate_image(
    prompt: str,
    size: str = DEFAULT_SIZE,
    output_format: str = "png",
    watermark: bool = False,
) -> Optional[str]:
    """调用 Seedream 生成单张图片
    
    Returns:
        图片 URL，失败返回 None
    """
    url = f"{ARK_BASE_URL}/images/generations"
    body = {
        "model": SEEDREAM_MODEL,
        "prompt": prompt,
        "size": size,
        "output_format": output_format,
        "watermark": watermark,
    }
    
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(url, headers=_get_headers(), json=body)
            resp.raise_for_status()
            data = resp.json()
            
            if "error" in data:
                print(f"[Seedream] API Error: {data['error']}")
                return None
            
            images = data.get("data", [])
            if images and images[0].get("url"):
                return images[0]["url"]
            return None
    except Exception as e:
        print(f"[Seedream] Request failed: {e}")
        return None


async def generate_batch(
    prompts: List[Tuple[str, str]],  # [(key, prompt), ...]
    style: str = "pixel",
    on_progress=None,
) -> Dict[str, Optional[str]]:
    """批量生成图片
    
    Args:
        prompts: [(key, prompt), ...] 列表
        style: 风格预设
        on_progress: 进度回调函数 on_progress(key, status, url_or_error)
    
    Returns:
        {key: url_or_None} 字典
    """
    style_cfg = STYLE_PRESETS.get(style, STYLE_PRESETS["pixel"])
    size = style_cfg["size"]
    
    results = {}
    
    # 串行生成（避免同时请求过多）
    for key, prompt in prompts:
        if on_progress:
            on_progress(key, "generating", None)
        
        url = await generate_image(prompt, size=size)
        results[key] = url
        
        if on_progress:
            if url:
                on_progress(key, "done", url)
            else:
                on_progress(key, "failed", "生成失败")
    
    return results


# ============================================================
# 图片下载
# ============================================================

async def download_image(url: str, save_path: Path) -> bool:
    """下载图片到本地"""
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_bytes(resp.content)
            return True
    except Exception as e:
        print(f"[Download] Failed: {e}")
        return False


# ============================================================
# 抠图处理
# ============================================================

_rembg_available = None
_rembg_session = None
_rembg_error = None


def _get_rembg_session():
    """延迟初始化 rembg"""
    global _rembg_available, _rembg_session, _rembg_error
    if _rembg_available is False:
        return None
    if _rembg_session is not None:
        return _rembg_session
    
    try:
        from rembg import new_session
        # 使用 u2net 模型（最通用）
        _rembg_session = new_session("u2net")
        _rembg_available = True
        return _rembg_session
    except ImportError as e:
        _rembg_available = False
        _rembg_error = f"rembg 未安装: {e}"
        print(f"[BackgroundRemoval] {_rembg_error}")
        print("[BackgroundRemoval] 安装命令: pip install rembg pillow onnxruntime")
        return None
    except Exception as e:
        _rembg_available = False
        _rembg_error = str(e)
        print(f"[BackgroundRemoval] Failed to init rembg: {e}")
        print("[BackgroundRemoval] 可能原因：模型文件下载失败（网络问题）")
        print("[BackgroundRemoval] 解决方案：")
        print("  1. 配置网络代理后重试")
        print("  2. 手动下载 u2net.onnx 放到 ~/.u2net/ 目录")
        print("  3. 或使用 mediakit-cli 云端抠图服务")
        return None


def get_rembg_status() -> dict:
    """获取抠图功能状态"""
    session = _get_rembg_session()
    return {
        "available": session is not None,
        "error": _rembg_error,
        "method": "rembg (local)" if session else "none",
    }


def remove_background(input_path: Path, output_path: Path) -> bool:
    """去除图片背景
    
    Args:
        input_path: 输入图片路径
        output_path: 输出 PNG 路径（透明背景）
    
    Returns:
        是否成功
    """
    session = _get_rembg_session()
    if session is None:
        # 没有 rembg，直接复制原图（不抠图）
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(input_path.read_bytes())
            return True
        except:
            return False
    
    try:
        from rembg import remove
        from PIL import Image
        import io
        
        input_img = Image.open(input_path)
        output_img = remove(input_img, session=session)
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        # 保存为 PNG（支持透明）
        output_img.save(output_path, format="PNG")
        return True
    except Exception as e:
        print(f"[BackgroundRemoval] Failed: {e}")
        return False


# ============================================================
# 角色生成任务管理
# ============================================================

class CharacterGenerationTask:
    """角色生成任务（异步任务状态跟踪）"""
    
    def __init__(
        self,
        task_id: str,
        char_id: str,
        char_name: str,
        description: str,
        expressions: List[str],
        style: str = "pixel",
        color: str = "#4ade80",
    ):
        self.task_id = task_id
        self.char_id = char_id
        self.char_name = char_name
        self.description = description
        self.expressions = expressions
        self.style = style
        self.color = color
        self.status = "pending"  # pending / generating / downloading / removing_bg / saving / done / failed
        self.progress = 0
        self.total = len(expressions)
        self.images: Dict[str, Dict] = {}  # key -> {url, local_path, status, error}
        self.error: Optional[str] = None
        self.result_character: Optional[Dict] = None
        
        # 初始化每个表达式的状态
        for exp in expressions:
            self.images[exp] = {
                "url": None,
                "local_path": None,
                "status": "pending",  # pending / generating / done / failed
                "error": None,
            }
    
    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "char_id": self.char_id,
            "char_name": self.char_name,
            "description": self.description,
            "expressions": self.expressions,
            "style": self.style,
            "color": self.color,
            "status": self.status,
            "progress": self.progress,
            "total": self.total,
            "images": self.images,
            "error": self.error,
            "result_character": self.result_character,
        }


# 全局任务存储
_tasks: Dict[str, CharacterGenerationTask] = {}


def create_task(
    char_id: str,
    char_name: str,
    description: str,
    expressions: Optional[List[str]] = None,
    style: str = "pixel",
    color: str = "#4ade80",
) -> CharacterGenerationTask:
    """创建新的角色生成任务"""
    task_id = f"gen_{uuid.uuid4().hex[:12]}"
    exps = expressions or DEFAULT_EXPRESSIONS
    task = CharacterGenerationTask(
        task_id=task_id,
        char_id=char_id,
        char_name=char_name,
        description=description,
        expressions=exps,
        style=style,
        color=color,
    )
    _tasks[task_id] = task
    return task


def get_task(task_id: str) -> Optional[CharacterGenerationTask]:
    """获取任务状态"""
    return _tasks.get(task_id)


async def execute_task(task: CharacterGenerationTask, assets_dir: Path):
    """执行角色生成任务
    
    Args:
        task: 生成任务
        assets_dir: 资产根目录 (story-editor/assets)
    """
    char_dir = assets_dir / "characters" / task.char_id
    
    try:
        task.status = "generating"
        
        # 1. 构建提示词
        prompts = []
        for exp_key in task.expressions:
            prompt = build_prompt(
                user_description=task.description,
                expression_key=exp_key,
                style=task.style,
                char_name=task.char_name,
            )
            prompts.append((exp_key, prompt))
        
        # 2. 批量生成图片
        def on_progress(key, status, info):
            if key in task.images:
                if status == "generating":
                    task.images[key]["status"] = "generating"
                elif status == "done":
                    task.images[key]["status"] = "done"
                    task.images[key]["url"] = info
                elif status == "failed":
                    task.images[key]["status"] = "failed"
                    task.images[key]["error"] = info
            
            done_count = sum(
                1 for v in task.images.values()
                if v["status"] in ("done", "failed")
            )
            task.progress = done_count
        
        results = await generate_batch(prompts, style=task.style, on_progress=on_progress)
        
        # 3. 下载图片并抠图
        task.status = "downloading"
        char_dir.mkdir(parents=True, exist_ok=True)
        
        portraits = []
        
        for exp_key in task.expressions:
            img_info = task.images.get(exp_key, {})
            url = img_info.get("url")
            if not url:
                continue
            
            # 下载原图
            raw_path = char_dir / f"{exp_key}_raw.png"
            img_info["status"] = "downloading"
            success = await download_image(url, raw_path)
            if not success:
                img_info["status"] = "failed"
                img_info["error"] = "下载失败"
                continue
            
            # 抠图
            img_info["status"] = "removing_bg"
            output_path = char_dir / f"{exp_key}.png"
            bg_removed = remove_background(raw_path, output_path)
            
            if bg_removed:
                img_info["local_path"] = str(output_path)
                img_info["status"] = "done"
                
                # 收集表情信息
                exp_label = next(
                    (e[1] for e in ALL_EXPRESSIONS if e[0] == exp_key),
                    exp_key
                )
                portraits.append({
                    "expression": exp_key,
                    "label": exp_label,
                    "image": f"/assets/characters/{task.char_id}/{exp_key}.png",
                })
                
                # 删除原图（节省空间）
                try:
                    raw_path.unlink()
                except:
                    pass
            else:
                img_info["status"] = "failed"
                img_info["error"] = "抠图失败"
        
        # 4. 生成 manifest.json
        task.status = "saving"
        
        manifest = {
            "id": task.char_id,
            "character": task.char_name,
            "name": task.char_name,
            "description": task.description[:100],
            "color": task.color,
            "style": task.style,
            "source": "ai_generated",
            "generation_prompt": task.description,
            "expressions": [p["expression"] for p in portraits],
            "portraits": portraits,
        }
        
        manifest_path = char_dir / "manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        
        # 5. 完成
        task.status = "done"
        task.result_character = {
            "id": task.char_id,
            "name": task.char_name,
            "color": task.color,
            "description": task.description[:100],
            "source": "ai_generated",
            "portraits": portraits,
        }
        
    except Exception as e:
        task.status = "failed"
        task.error = str(e)
        print(f"[GenerationTask] Failed: {e}")


# ============================================================
# 批量抠图工具
# ============================================================

async def batch_remove_background(
    assets_dir: Path,
    on_progress=None,
) -> Dict[str, Dict]:
    """为所有角色图片批量抠图
    
    遍历 assets/characters/ 下的所有角色，
    对非透明背景的图片重新抠图。
    
    Args:
        assets_dir: 资产根目录
        on_progress: 进度回调 on_progress(char_id, filename, status)
    
    Returns:
        处理结果统计
    """
    chars_dir = assets_dir / "characters"
    if not chars_dir.exists():
        return {"error": "characters directory not found"}
    
    session = _get_rembg_session()
    results = {}
    
    for char_dir in chars_dir.iterdir():
        if not char_dir.is_dir():
            continue
        
        char_id = char_dir.name
        results[char_id] = {"processed": 0, "skipped": 0, "failed": 0}
        
        for img_file in char_dir.glob("*.png"):
            # 跳过已抠图的（文件名不含 _raw）
            if img_file.stem.endswith("_raw"):
                continue
            
            if on_progress:
                on_progress(char_id, img_file.name, "processing")
            
            try:
                from PIL import Image
                img = Image.open(img_file)
                
                # 检查是否已有 alpha 通道
                if img.mode == "RGBA":
                    # 检查是否有实际的透明像素
                    alpha = img.split()[-1]
                    if alpha.getextrema()[0] < 255:
                        # 已有透明像素，跳过
                        results[char_id]["skipped"] += 1
                        if on_progress:
                            on_progress(char_id, img_file.name, "skipped")
                        continue
                
                # 执行抠图
                if session:
                    from rembg import remove
                    output = remove(img, session=session)
                    # 备份原图
                    backup_path = img_file.with_suffix(".original.png")
                    if not backup_path.exists():
                        img_file.rename(backup_path)
                    # 保存抠图结果
                    output.save(img_file, format="PNG")
                    results[char_id]["processed"] += 1
                    if on_progress:
                        on_progress(char_id, img_file.name, "done")
                else:
                    results[char_id]["skipped"] += 1
                    if on_progress:
                        on_progress(char_id, img_file.name, "skipped_no_rembg")
                    
            except Exception as e:
                results[char_id]["failed"] += 1
                print(f"[BatchBgRemove] {char_id}/{img_file.name}: {e}")
                if on_progress:
                    on_progress(char_id, img_file.name, f"failed: {e}")
    
    return results
