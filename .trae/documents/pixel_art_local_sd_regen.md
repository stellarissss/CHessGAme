# 像素画立绘与动画本地化重制计划

## 概述

将游戏所有像素画人像（boy/chenmo/6 guardian）从云端 Seedream/Seedance 生成方案，改为 **本地化 SD WebUI Forge + SDXL + Pixel Art XL + LayerDiffusion + AnimateDiff** 全开源方案，在 Google Colab 免费 T4 GPU 上运行。彻底解决抠图质量问题（头发/衣服误扣）并保留 24FPS 帧动画架构。

**核心约束**：不再使用任何 Seedream/Seedance 额度；全开源模型；Colab 免费 T4。

---

## 当前状态分析

### 工作区状态
- 工作区已被用户清空（`/workspace` 为空）
- 需先从 https://stellaric.site/download.php?f=game.zip (427MB) 下载并解压恢复
- 上一轮对话上下文已知项目结构（执行时需以恢复后实际文件为准验证）

### 上一轮架构（基于上下文回忆，执行时验证）
- 静态立绘：`/workspace/shared/assets/characters/{boy,chenmo,...}/*.jpg` + 抠图 PNG
- 动画帧：`{char}_{emotion}_f1.png` ~ `_f48.png`（48帧/24FPS/2秒循环）
- 前端：`/workspace/hub/dialogue.html` + `/workspace/hub/dialogue.js`（`startPortraitAnimation` 帧序列循环）
- 配置：`/workspace/configs/story.json`（含 protagonist.animation 配置 + charMap）
- 上一轮脚本：`generate_anim_frames.py`、`regenerate_white_bg.py`、`cutout_rembg.py`（本次将替换为 SD 方案）

### 上一轮问题
1. 抠图质量不佳：rembg 误扣深色头发/衣服（不透明区域仅 18.5%）
2. 依赖付费 Seedream/Seedance API（已超支，AccountOverdueError）

### 调研结论（Phase 1）
- **Pixel Art XL** (nerijs/pixel-art-xl)：SDXL LoRA，生成 16-bit 精细像素画，HuggingFace 免费
- **LayerDiffusion** (lllyasviel/sd-forge-layerdiffuse)：SD WebUI Forge 扩展，原生生成 RGBA 透明 PNG，头发丝细节完美，无需抠图
- **AnimateDiff-SDXL** (guoyww/AnimateDiff mm_sdxl_v10_beta)：给 SDXL 加运动模块，img2img 生成 2 秒微动视频
- **T4 可行性**：Forge 优化后 4GB 显存即可跑 SDXL，T4(15GB) 完全够用 SDXL + LayerDiffusion + AnimateDiff-SDXL（fp16 + xformers + VAE slicing）
- **角色一致性**：ControlNet (Canny/Lineart) + img2img 低 denoise 从 base 立绘生成表情变体

---

## 技术栈

| 组件 | 选型 | 用途 | 来源 |
|------|------|------|------|
| WebUI | SD WebUI Forge (lllyasviel) | 运行平台，LayerDiffusion 原生支持 | github.com/lllyasviel/stable-diffusion-webui-forge |
| 基础模型 | SDXL Base 1.0 (fp16) | SDXL 底模 | huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 |
| 像素 LoRA | Pixel Art XL (nerijs) | 16-bit 像素画风 | huggingface.co/nerijs/pixel-art-xl |
| 透明生成 | LayerDiffusion (layer_xl_transparent_attn) | 原生 RGBA PNG | huggingface.co/LayerDiffusion/layerdiffusion-v1 |
| 动画运动模块 | AnimateDiff-SDXL (mm_sdxl_v10_beta.ckpt) | 图生视频 | huggingface.co/guoyww/AnimateDiff |
| 角色一致性 | ControlNet Canny + Lineart | 锁定角色轮廓 | SDXL ControlNet |
| 加速 | xformers + fp16 + VAE slicing | T4 显存优化 | Forge 内置 |
| 像素后处理 | sd-webui-pixelart 扩展 | 像素格对齐 | Forge 扩展库 |

---

## 实施步骤

### Phase A — 恢复文件与验证（执行第一步）
1. 下载 `https://stellaric.site/download.php?f=game.zip` 到 `/workspace/game.zip`
2. 解压到 `/workspace/`
3. 验证关键文件存在：
   - `/workspace/hub/dialogue.html`、`/workspace/hub/dialogue.js`
   - `/workspace/configs/story.json`
   - `/workspace/shared/assets/characters/` 各角色子目录
4. 读取 `story.json` 的 `charMap` 与各 `guardian.emotions`，**生成完整角色清单**（执行时确认实际表情列表）
5. 备份现有立绘到 `/workspace/shared/assets/characters/_backup_seedream/`

### Phase B — Colab 环境部署
创建 `/workspace/tools/colab_sd_setup.ipynb`，包含以下单元：

```python
# 单元 1: 环境与仓库
!git clone https://github.com/lllyasviel/stable-diffusion-webui-forge.git
%cd /content/stable-diffusion-webui-forge
!git clone https://github.com/lllyasviel/sd-forge-layerdiffuse.git extensions/sd-forge-layerdiffuse
!git clone https://github.com/continue-revolution/sd-webui-animatediff.git extensions/sd-webui-animatediff
!git clone https://github.com/microsoft/sd-webui-pixelart.git extensions/sd-webui-pixelart  # 像素后处理

# 单元 2: 下载模型（HuggingFace 直链，免 API Key）
# SDXL base
!wget -O models/Stable-diffusion/sd_xl_base_1.0.safetensors \
  https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors
# Pixel Art XL LoRA
!wget -O models/Lora/pixel-art-xl.safetensors \
  https://huggingface.co/nerijs/pixel-art-xl/resolve/main/pixel-art-xl.safetensors
# LayerDiffusion 模型（自动下载，但可预置）
!mkdir -p models/layer_model
!wget -O models/layer_model/layer_xl_transparent_attn.safetensors \
  https://huggingface.co/LayerDiffusion/layerdiffusion-v1/resolve/main/layer_xl_transparent_attn.safetensors
# AnimateDiff SDXL 运动模块
!wget -O extensions/sd-webui-animatediff/model/mm_sdxl_v10_beta.ckpt \
  https://huggingface.co/guoyww/AnimateDiff/resolve/main/mm_sdxl_v10_beta.ckpt
# SDXL ControlNet Canny/Lineart
!wget -O models/ControlNet/control_v11p_sd15_canny.pth ...  # SDXL 版本待确认

# 单元 3: 启动 WebUI（gradio share 隧道）
!python launch.py --share --xformers --enable-insecure-extension-access \
  --no-half-vae --theme dark --port 7860
```

**验收**：拿到 `https://xxx.gradio.live` 公网 URL，浏览器可访问 Forge UI。

### Phase C — 静态立绘重制（SDXL + Pixel Art XL + LayerDiffusion）

#### C1. Base 立绘生成（每角色 1 张）
对每个角色用 **txt2img + LayerDiffusion 透明模式** 生成 base 立绘：

**提示词模板**（16-bit GBA/SNES 精细像素风）：
```
pixel art, 16-bit, SNES style, detailed pixel art portrait,
{character_description}, {expression}, {costume},
half body, centered composition, facing front, 3/4 view,
clean pixel edges, limited color palette, no gradient, no anti-aliasing,
transparent background, game sprite, RPG character portrait
```
**负面提示词**：
```
3d render, realistic, photograph, smooth gradient, blur,
jpeg artifacts, watermark, signature, multiple characters,
text, border, frame, background scenery
```

**参数**：
- 大模型：`sd_xl_base_1.0.safetensors`
- LoRA：`pixel-art-xl.safetensors` 权重 1.0-1.2
- LayerDiffusion：启用，Method = `Only Generate Transparent Image (Attention Injection)`
- 采样器：DPM++ 2M Karras，步数 30，CFG 7
- 分辨率：768×768（T4 友好，像素画足够）
- Clip Skip：2

#### C2. 表情变体生成（ControlNet 保证一致性）
对每个角色的其他表情，用 **img2img + ControlNet Canny/Lineart** 从 base 立绘生成：

```
输入：base 立绘（Canny 提取轮廓）+ 新表情提示词
ControlNet: Canny (weight 0.6-0.8) + Lineart (weight 0.4) 锁定角色轮廓
img2img denoise: 0.4-0.55（保留角色，仅改表情）
LayerDiffusion: 启用透明输出
```

#### C3. 像素后处理
对生成图像应用 `sd-webui-pixelart` 后处理：
- 像素格大小：4px（16-bit 精细）
- 调色板限制：32-64 色
- 边缘锐化：开启

**输出**：每角色 `*.png`（原生 RGBA，无需 rembg 抠图）

### Phase D — 动画生成（AnimateDiff-SDXL + 抽帧 + LayerDiffusion 抠图）

替换上一轮 `generate_anim_frames.py` 为 `/workspace/tools/generate_anim_sd.py`：

#### D1. AnimateDiff 图生视频
对每个 base 立绘（选 1 张代表表情，如 neutral/portrait）：
- 模式：**img2img + AnimateDiff**
- 输入：base 立绘 PNG
- 运动模块：`mm_sdxl_v10_beta.ckpt`
- 帧数：16 帧（SDXL 显存友好，2秒×8FPS）→ 后续 RIFE 插帧到 48
- 提示词：
  ```
  pixel art, 16-bit, {character}, subtle breathing micro-movement,
  gentle chest rise, slight hair sway, natural eye blink,
  2 second seamless loop, camera completely fixed, no scene change
  ```
- 闭环：开启 `closed_loop = R+P`（首尾衔接）
- 分辨率：768×768
- Motion LoRA（可选）：`zoomout` 或 `panright` 权重 0.5 微动

#### D2. RIFE 插帧（16→48）
用 RIFE 将 16 帧插值到 48 帧（24FPS × 2秒）：
```bash
# /workspace/tools/rife_interpolate.py
python rife_interpolate.py --input video.mp4 --output frames/ --target_fps 24
```
保持 24FPS 48 帧架构不变（前端 JS 无需改）。

#### D3. LayerDiffusion 逐帧抠图
对 48 帧 RGB PNG 批量应用 LayerDiffusion `img2img` 透明模式：
- Method：`From Image to Transparent Image`
- 输入：每帧 RGB PNG
- 输出：原生 RGBA PNG（头发丝、半透明细节完美保留）

**替代方案**（若 LayerDiffusion 逐帧太慢）：用 `rembg` + alpha 二值化（上一轮方案），但因 LayerDiffusion 已验证质量更优，优先 LayerDiffusion。

#### D4. 重命名
`f001.png` → `{char}_{emotion}_f1.png` ... `_f48.png`，覆盖旧文件。

### Phase E — 前端代码集成

#### E1. dialogue.js 验证/微调
- 上一轮已实现 `startPortraitAnimation`（24FPS 帧序列循环 + 优雅降级）
- 确认 `ANIM_FRAME_COUNT = 48`、`ANIM_FPS = 24` 不变
- 确认 `stopPortraitAnim` 在切立绘时清理 timer
- 若 LayerDiffusion 输出已是 RGBA，移除任何残留的 rembg 兜底逻辑

#### E2. dialogue.html 确认
- `.character-portrait` 无 CSS animation（上一轮已清理）
- 保留 `image-rendering: pixelated`（像素画清晰显示）

#### E3. story.json 更新
更新 `protagonist.animation` 元数据：
```json
"animation": {
  "enabled": true,
  "type": "frame_sequence",
  "fps": 24,
  "frame_count": 48,
  "loop_duration": "2s",
  "source": "AnimateDiff-SDXL img2img + RIFE 插帧 + LayerDiffusion 透明化",
  "style": "Pixel Art XL 16-bit (GBA/SNES)",
  "cutout": "LayerDiffusion 原生 RGBA（无 rembg 后处理）",
  "platform": "Google Colab T4 + SD WebUI Forge"
}
```

### Phase F — 清理与备份
1. 删除 `_backup_seedream/` 旧素材（确认新素材无误后）
2. 删除上一轮的 `regenerate_white_bg.py`、`cutout_rembg.py`（已被 SD 方案取代）
3. 保留 `generate_anim_sd.py`、`colab_sd_setup.ipynb`、`rife_interpolate.py` 作为可复用工具
4. 视频存档保留在 `/workspace/shared/assets/characters/_anim_videos/`

---

## 角色清单（执行时以 story.json 实际值为准）

基于上一轮 `story.json` 的 `charMap` 与 guardian 配置：

| 角色 | 文件夹 | 表情/立绘 | 动画 |
|------|--------|-----------|------|
| 林夜(boy) | boy | neutral, happy, thinking, surprised, determined, sad, confident, defeated | neutral 动画 |
| 陈默(chenmo) | chenmo | portrait, awkward, smile, surprised, thinking, silent, playing | portrait 动画 |
| 引路人(guide) | guide | silhouette, back | - |
| 翻覆者(flipper) | flipper | portrait, angry, sad, fade, as_linne, as_chenmo | portrait 动画 |
| 饕餮者(glutton) | glutton | portrait, tempting, outraged, despair, fade | portrait 动画 |
| 秩序者(orderer) | orderer | portrait + 3 emotions | portrait 动画 |
| 算计者(calculator) | calculator | portrait + 3 emotions | portrait 动画 |
| 狂乱者(chaos) | chaos | portrait + 3 emotions | portrait 动画 |
| 禅定者(zen) | zen | portrait + 3 emotions | portrait 动画 |
| 天道(tiandao) | tiandao | portrait + emotions | portrait 动画 |
| 林父(father) | father | portrait | - |
| 班主任(teacher) | teacher | cold, stern | - |
| 小宇(xiaoyu) | xiaoyu | portrait | - |

**预估工作量**：~30 张静态立绘 + ~10 个动画（仅主角与 guardian 的 portrait 做动画）

---

## 提示词与参数设计（关键参考）

### 角色描述模板（执行时填充具体人设）
```
pixel art, 16-bit SNES style, {name}, {age} years old {gender},
{hair_style} {hair_color} hair, {eye_color} eyes,
wearing {clothing_description}, {expression} expression,
anime-inspired pixel art, detailed pixel portrait, half body,
centered, facing 3/4 front view, clean pixel edges,
limited 32-color palette, no gradient, no blur
```

### 各角色人设（基于上一轮 story.json）
- **林夜(boy)**：17岁高二男生，聪明叛逆，自尊心强，黑发，校服
- **陈默(chenmo)**：林夜好友，温和内向
- **翻覆者(flipper)**：地狱道守护者，悔恨化身，可化作林夜/陈默形态
- **饕餮者(glutton)**：饿鬼道守护者，贪婪，诱惑者形象
- 其他 guardian 按各道主题设计（执行时从 story.json 读取 tagline/personality）

### 动画提示词
```
pixel art, 16-bit, {character}, subtle idle breathing animation,
gentle chest rise and fall, very slight hair sway,
natural eye blinking, 2 second seamless loop,
camera completely fixed and static, no scene change,
keep character design unchanged, pixel-perfect consistency
```

---

## 已确认决策（用户确认 2026-08-01）

1. **执行方式**：Colab + Forge API。用户启动 Colab 运行 notebook 部署 Forge，生成脚本在 Colab 本地调用 `http://127.0.0.1:7860` 的 `/sdapi/v1/img2img`（不依赖 gradio share URL，最稳定），生成后推回 GitHub，我从 sandbox 拉取集成。
2. **角色一致性**：img2img 参考现有白色背景立绘，denoise 0.45 保留人设、转像素画风。**务必原生透明背景**（LayerDiffusion，非 rembg 后处理）。
3. **动画范围**：仅重制现有 10 个（boy 6 + chenmo 4），不扩展到 guardian。

## 已交付脚本（/workspace/tools/）

- `forge_asset_config.py` — 共享配置：13 角色清单 + 64 表情 + 人设提示词 + 动画 10 项 + Forge API helper + 生成参数
- `forge_generate_portraits.py` — 静态立绘：img2img + Pixel Art XL LoRA + LayerDiffusion 透明 → RGBA PNG + 白底 JPG（动画首帧参考）
- `forge_generate_animations.py` — 动画：AnimateDiff-SDXL 16帧 → RIFE 插帧 48 → LayerDiffusion 逐帧透明 → `_f1.png`~`_f48.png`
- `colab_sd_setup.ipynb` — Colab 部署+生成全流程 notebook（10 cell：GPU检查→克隆仓库→Forge+扩展→下载模型→RIFE→启动Forge→生成立绘→生成动画→推回GitHub）

## 前端集成验证

- `hub/dialogue.js` 的 `startPortraitAnimation` 探测 `_f1.png` 存在则播 48 帧循环、否则静态 PNG —— **已兼容，无需改动**
- `hub/dialogue.html` 已移除 CSS 动画，`image-rendering: pixelated` 保留
- `configs/story.json` 的 `protagonist.animation` 已更新为 SDXL 技术栈元数据

## 下一步：用户操作

1. 上传 `tools/colab_sd_setup.ipynb` 到 Google Colab，选 T4 GPU 运行时
2. 依次运行 cell 1-10（cell 6 启动 Forge 需等 5-10 分钟）
3. 生成完成后推回 GitHub（cell 10，需配置 token）
4. 回 Trae 对话告知完成，我从 GitHub 拉取资产并验证前端

## 假设与决策

1. **T4 显存够用**：Forge 优化后 SDXL+LayerDiffusion+AnimateDiff-SDXL 在 15GB 可行（调研确认 4GB 即可跑 SDXL）。若 AnimateDiff-SDXL 仍 OOM，降级为 AnimateDiff v3 (SD1.5) + 像素 LoRA 备选。
2. **LayerDiffusion 原生透明优于 rembg**：调研确认头发丝/半透明细节完美，97% 用户偏好优于 generate-then-matte。
3. **ControlNet 变体保证一致性**：denoise 0.4-0.55 + Canny 0.7 可在改表情时保留角色特征。
4. **RIFE 插帧 16→48**：AnimateDiff-SDXL 16 帧省显存，RIFE 插值到 48 帧保证 24FPS 流畅。
5. **角色清单以恢复后 story.json 为准**：本计划清单基于上一轮上下文，执行时需实际读取确认。
6. **不训练角色 LoRA**：用户选择 ControlNet 变体方案，免训练，快。
7. **Colab 断连应对**：所有生成参数写入脚本，断连后可从 `--skip-if-done` 继续。
8. **像素后处理可选**：若 Pixel Art XL LoRA 已足够像素化，可跳过 sd-webui-pixelart 后处理。

---

## 验证步骤

### 1. PNG Alpha 质量验证
```python
# 检查所有新生成 PNG 的 alpha
from PIL import Image
import numpy as np
# 预期：不透明区域 40-60%（LayerDiffusion 质量远优于 rembg 的 18.5%）
# 预期：头发丝边缘有半透明渐变（无白边）
```

### 2. 像素一致性验证
- 同角色所有表情立绘：发色、瞳色、服装、脸型一致
- 动画 48 帧角色无突变/抖动

### 3. 前端集成验证
- `node --check /workspace/hub/dialogue.js`（语法）
- 浏览器加载 `dialogue.html?realm=hell&level=1`，确认立绘显示 + 24FPS 动画循环
- 切换立绘时动画正确停止/启动

### 4. 视觉对比
- 与上一轮 Seedream 立绘对比：抠图质量（头发完整度）
- 动画流畅性：24FPS 无卡顿

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Colab 免费版断连 | 所有脚本支持断点续跑（`--skip-if-done`）；模型存 Google Drive 持久化 |
| AnimateDiff-SDXL beta 不稳 | 备选 AnimateDiff v3 (SD1.5) + AziibPixelMix 模型 |
| LayerDiffusion 逐帧慢 | 批量脚本并行；备选 rembg+alpha 二值化（质量略低但快） |
| ControlNet 变体角色仍偏移 | 调低 denoise 到 0.35；加 IP-Adapter 辅助 |
| Colab T4 限流 | 分批生成，每天限量；或备选 Kaggle GPU |
| 角色人设与上一轮差异 | 执行时对照 story.json tagline/personality 校准提示词 |

---

## 执行顺序

1. Phase A: 下载恢复 game.zip（5 分钟）
2. Phase B: Colab 环境部署（30-60 分钟，含模型下载）
3. Phase C: 静态立绘生成（~30 张，每张 1-2 分钟，约 1 小时）
4. Phase D: 动画生成（~10 个，每个 5-10 分钟，约 1-2 小时）
5. Phase E: 前端集成验证（15 分钟）
6. Phase F: 清理（5 分钟）

**总计预估**：3-5 小时（含 Colab 模型下载与生成等待）
