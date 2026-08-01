#!/usr/bin/env python3
"""
forge_asset_config.py — 共享配置：角色清单、提示词、Forge API 调用 helper
============================================================================
在 Google Colab (T4 GPU) 上运行，调用本地 Forge (http://127.0.0.1:7860) 的
/sdapi/v1/img2img 接口，配合 LayerDiffusion（原生 RGBA 透明背景）与
AnimateDiff（图生视频）批量重制像素画立绘与动画。

技术栈：SDXL Base 1.0 + Pixel Art XL LoRA + LayerDiffusion + AnimateDiff-SDXL
参考图：现有 Seedream 白色背景立绘（img2img 低 denoise 保人设）

依赖：requests, Pillow, numpy
"""

import base64
import io
import os
import time
from pathlib import Path

import requests
from PIL import Image

# ──────────────────────────────────────────────────────────────
# 路径配置（在 Colab 上，参考立绘从 GitHub clone 获取）
# ──────────────────────────────────────────────────────────────
# 游戏仓库（含现有白色背景参考立绘）
GAME_REPO = "https://github.com/stellarissss/CHessGAme.git"
GAME_DIR = Path("/content/CHessGAme")
CHAR_DIR = GAME_DIR / "shared" / "assets" / "characters"
OUTPUT_DIR = GAME_DIR / "shared" / "assets" / "characters"  # 原地覆盖

# Forge API
FORGE_URL = os.environ.get("FORGE_URL", "http://127.0.0.1:7860")
SDXL_MODEL = "sd_xl_base_1.0.safetensors"
PIXEL_LORA = "pixel-art-xl.safetensors"

# ──────────────────────────────────────────────────────────────
# 画风提示词（精细像素画，16-bit GBA/SNES 风）
# ──────────────────────────────────────────────────────────────
PIXEL_STYLE_POS = (
    "pixel art, 16-bit, detailed pixel art, SNES GBA style RPG portrait, "
    "clean crisp pixel edges, limited color palette, no gradient, no anti-aliasing, "
    "detailed pixel art character bust portrait, half body, centered, "
    "facing 3/4 front view, game sprite, high quality pixel art"
)
PIXEL_STYLE_NEG = (
    "3d render, realistic, photograph, smooth gradient, blur, jpeg artifacts, "
    "watermark, signature, multiple characters, text, border, frame, "
    "background scenery, anti-aliasing, high resolution, smooth shading, "
    "low quality, bad anatomy, deformed, extra limbs"
)

# ──────────────────────────────────────────────────────────────
# 角色清单 + 每角色表情列表 + 人设提示词后缀
# （表情清单来自 story.json + 文件系统验证；人设来自设计文档）
# img2img 用现有白色背景 .jpg 作参考，denoise 0.45 保人设、转像素画风
# ──────────────────────────────────────────────────────────────
CHARACTERS = {
    "boy": {
        "name": "林夜",
        "desc": "17 year old high school boy student, short messy black hair, "
                "wearing white shirt and dark blue school uniform jacket with red collar tie, "
                "young RPG hero protagonist vibe",
        "emotions": {
            "neutral":      "neutral calm expression, relaxed face",
            "happy":        "happy smiling expression, bright eyes",
            "thinking":     "thinking expression, looking up, finger near chin",
            "surprised":    "surprised wide eyes, open mouth",
            "determined":   "determined fierce eyes, furrowed brow, confident smile",
            "sad":          "sad expression, downcast eyes, melancholic",
            "confident":    "confident smirk, one eyebrow raised, self-assured",
            "defeated":     "defeated expression, head bowed, eyes shadowed",
        },
    },
    "chenmo": {
        "name": "陈默",
        "desc": "17 year old cute gentle high school girl, chess club president, "
                "shoulder-length black hair with small hairclip on left side",
        "emotions": {
            "portrait":     "gentle calm smile, friendly",
            "awkward":      "awkward embarrassed expression, blushing, looking away",
            "smile":        "warm happy smile, eyes curved",
            "surprised":    "surprised expression, wide eyes, hand near mouth",
            "thinking":     "thinking expression, finger on cheek",
            "silent":       "silent quiet expression, soft gaze",
            "playing":      "playing chess, focused on board, holding piece",
        },
    },
    "flipper": {
        "name": "翻覆者",
        "desc": "guardian of hell realm, embodiment of regret, shadowy figure "
                "who can shapeshift into Lin Ye or Chen Mo forms",
        "emotions": {
            "portrait":     "menacing shadow figure portrait, dark hooded silhouette",
            "angry":        "angry fierce expression, glaring eyes",
            "sad":          "sorrowful mournful expression, tears",
            "fade":         "fading away, dissolving into shadow",
            "as_linne":     "shapeshifted as Lin Ye, but eyes shadowed and uncanny",
            "as_chenmo":    "shapeshifted as Chen Mo, but eyes shadowed and uncanny",
        },
    },
    "glutton": {
        "name": "饕餮者",
        "desc": "guardian of hungry ghost realm, embodiment of greed, "
                "tempting seductive figure, gaunt with hollow cheeks",
        "emotions": {
            "portrait":     "tempting alluring figure, half-smile, beckoning",
            "tempting":     "tempting expression, finger to lips, seductive gaze",
            "outraged":     "outraged furious expression, mouth wide open",
            "despair":      "despair expression, hollow eyes, reaching out",
            "fade":         "fading away, dissolving into mist",
        },
    },
    "orderer": {
        "name": "秩序者",
        "desc": "guardian of animal realm, embodiment of instinct, "
                "bestial armored warrior, predatory dominance",
        "emotions": {
            "portrait":     "arrogant noble warrior portrait, chin raised",
            "arrogant":     "arrogant disdainful expression, looking down",
            "angered":      "angered furious expression, bared teeth",
            "thoughtful":   "thoughtful contemplative expression, hand on chin",
            "fade":         "fading away, dissolving",
        },
    },
    "calculator": {
        "name": "算计者",
        "desc": "guardian of human realm, embodiment of rationality, "
                "cold calculating intellectual with glasses",
        "emotions": {
            "portrait":     "cold intellectual portrait, glasses, neutral",
            "cold":         "cold detached expression, glasses glinting",
            "smug":         "smug self-satisfied expression, slight smirk",
            "stuck":        "frustrated stuck expression, hand on forehead",
            "glasses_off":  "glasses removed, vulnerable lost expression",
            "fade":         "fading away, dissolving",
        },
    },
    "chaos": {
        "name": "狂乱者",
        "desc": "guardian of asura realm, embodiment of fury, "
                "wild chaotic warrior with disheveled hair",
        "emotions": {
            "portrait":     "wild chaotic warrior portrait, fierce eyes",
            "raging":       "raging furious expression, mouth open screaming",
            "taunting":     "taunting mocking expression, tongue out, sneering",
            "tired":        "exhausted tired expression, sweat, slumped",
            "reminisce":    "reminiscing nostalgic expression, distant gaze",
            "fade":         "fading away, dissolving",
        },
    },
    "zen": {
        "name": "禅定者",
        "desc": "guardian of heaven realm, embodiment of tranquility, "
                "serene monk with peaceful aura",
        "emotions": {
            "portrait":     "serene peaceful monk portrait, eyes closed, calm",
            "smile":        "gentle enlightened smile, eyes softly closed",
            "questioning":  "questioning expression, one eyebrow raised, curious",
            "standing":     "standing meditation pose, hands in prayer",
            "fade":         "fading away, dissolving into light",
        },
    },
    "tiandao": {
        "name": "天道",
        "desc": "rule maker and final judge of samsara, "
                "giant faceless humanoid silhouette surrounded by chess wheel halo",
        "emotions": {
            "portrait":     "giant faceless humanoid silhouette portrait, ominous",
            "judge":        "judging posture, pointing down, imposing",
            "whisper":      "whispering, leaning in, conspiratorial shadow",
            "eye":          "single giant eye opening on faceless head",
            "verdict":      "pronouncing verdict, arms raised, commanding",
            "fade":         "fading away, dissolving into rules",
        },
    },
    "father": {
        "name": "林父",
        "desc": "engineer father, silent but loving, middle-aged man with glasses",
        "emotions": {
            "portrait":     "kind middle-aged father portrait, gentle eyes, glasses",
            "hug":          "hugging, warm embracing posture, fatherly love",
            "silent":       "silent stoic expression, looking down",
            "young":        "young version, energetic, smiling",
        },
    },
    "teacher": {
        "name": "初中班主任",
        "desc": "middle school homeroom teacher, stern middle-aged woman",
        "emotions": {
            "cold":         "cold stern expression, frowning, arms crossed",
            "stern":        "stern lecturing expression, pointing finger",
        },
    },
    "xiaoyu": {
        "name": "小宇",
        "desc": "junior high classmate, intellectually delayed young boy, "
                "innocent gentle appearance",
        "emotions": {
            "calm":         "calm innocent expression, gentle peaceful eyes",
        },
    },
    "guide": {
        "name": "引路人",
        "desc": "mysterious guide, protagonist's subconscious desire to change, "
                "blurry silhouette whispering figure",
        "emotions": {
            "silhouette":   "blurry dark silhouette portrait, indistinct features",
            "back":         "back view, walking away into light",
            "whisper":      "leaning in whispering, hooded, shadowed face",
        },
    },
}

# ──────────────────────────────────────────────────────────────
# 动画清单（仅重制现有 10 个：boy 6 + chenmo 4）
# 每项 = (char_dir, emotion)，用该表情的白色背景 .jpg 作首帧参考
# AnimateDiff 生成 16 帧 → RIFE 插帧到 48 → LayerDiffusion 透明化
# ──────────────────────────────────────────────────────────────
ANIMATIONS = [
    ("boy", "determined"),
    ("boy", "happy"),
    ("boy", "neutral"),
    ("boy", "sad"),
    ("boy", "surprised"),
    ("boy", "thinking"),
    ("chenmo", "awkward"),
    ("chenmo", "smile"),
    ("chenmo", "surprised"),
    ("chenmo", "thinking"),
]

# 动画提示词（微妙呼吸微动 + 自然眨眼 + 轻微头发摆动，2 秒无缝循环）
ANIM_PROMPT_TMPL = (
    "pixel art, 16-bit, {character}, subtle idle breathing animation, "
    "gentle chest rise and fall, very slight hair sway, natural eye blinking, "
    "2 second seamless loop, camera completely fixed and static, no scene change, "
    "keep character design unchanged, pixel-perfect consistency, "
    "detailed pixel art character bust portrait, half body, centered"
)

# ──────────────────────────────────────────────────────────────
# Forge API helper
# ──────────────────────────────────────────────────────────────
def wait_for_forge(url=FORGE_URL, timeout=600):
    """等待 Forge 启动就绪"""
    print(f"等待 Forge 就绪 ({url})...", flush=True)
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = requests.get(f"{url}/sdapi/v1/options", timeout=5)
            if r.status_code == 200:
                print("✅ Forge 已就绪", flush=True)
                return True
        except Exception:
            pass
        time.sleep(3)
    print("❌ Forge 启动超时", flush=True)
    return False


def set_model(model_name, url=FORGE_URL):
    """切换 Forge 当前大模型"""
    r = requests.post(f"{url}/sdapi/v1/options", json={"sd_model_checkpoint": model_name})
    r.raise_for_status()
    print(f"已切换模型: {model_name}", flush=True)


def img_to_base64(img: Image.Image, fmt="PNG") -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode()


def base64_to_img(b64: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(b64)))


def build_lora_prompt(weight=1.1):
    """构造带 Pixel Art XL LoRA 权重的提示词片段"""
    return f"<lora:pixel-art-xl:{weight}>, "


# ──────────────────────────────────────────────────────────────
# 生成参数
# ──────────────────────────────────────────────────────────────
PORTRAIT_PARAMS = {
    "steps": 30,
    "cfg_scale": 7.0,
    "denoising_strength": 0.45,   # img2img 低 denoise 保人设
    "sampler_name": "DPM++ 2M Karras",
    "width": 1024,                # SDXL 原生，T4 友好
    "height": 1024,
    "clip_skip": 2,
}

ANIM_PARAMS = {
    "steps": 25,
    "cfg_scale": 7.0,
    "denoising_strength": 0.50,
    "sampler_name": "DPM++ 2M Karras",
    "width": 768,
    "height": 768,
    "clip_skip": 2,
    "video_length": 16,           # AnimateDiff 16 帧（SDXL 显存友好）
    "fps": 8,                     # 16帧/8fps = 2秒
    "closed_loop": "R+P",         # 首尾衔接
}

# 目标帧数（RIFE 插帧到 48 帧 = 24FPS × 2秒）
TARGET_FRAMES = 48
TARGET_FPS = 24
