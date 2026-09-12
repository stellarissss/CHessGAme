# 大地图渲染架构 —— WebGPU 主通道 + melonJS 兜底（v2.2）

> 本文档描述「棋圣·六道轮回」大地图（六道大陆）渲染架构的 v2.2 全貌：WebGPU 渲染器回归为主通道、四档智能画质分级、呈现自检与自动降级，以及三大根因修复与端到端测试方法。

---

## 一、双通道架构总览

```
玩家打开 /overworld
        │
        ▼
overworld-load.js（智能分发器 v3）
        │
        ├─ 1. 画质意图解析：URL ?owq= → localStorage.chesssage_ow_quality → 'auto'
        ├─ 2. 设备能力检测（'auto' 时）：
        │      requestAdapter() + adapter.info + isFallbackAdapter
        │      + /swiftshader|llvmpipe|lavapipe|software|angle \(google\// 识别软件渲染
        │      + hardwareConcurrency / deviceMemory / 移动端 UA
        │      → 选档：software / balanced / high / ultra
        │
        ├─ 3. WebGPU 可用 ──► import overworld-wgpu.js → setQuality(档位)
        │      │               等 _ready + 3.6s → presentSelfCheck()
        │      ├─ 自检 PASS ──► WebGPU 主通道渲染（角标：渲染：WebGPU · <画质档>）
        │      └─ 自检 FAIL ──► g.destroy() ─┐
        │                                     │
        └─ 4. WebGPU 不可用 / 管线失败 / 加载超时(12s) ──► melonJS 兜底通道
               （并行预热 vendor，overworld-melonjs.js，
                 角标：渲染：melonJS · WebGL / 内置画布）
```

**设计承诺**：无论设备是否支持 WebGPU、驱动是否有缺陷、合成器是否异常，玩家**永远看到可玩的地图**——黑屏/白屏在架构上不可能发生。

---

## 二、WebGPU 主通道（`hub/overworld-wgpu.js` + `hub/wgpu/shaders.js`）

### 2.1 渲染特性
- **高度场地形**：compute 着色器生成高频细节场 → 地形顶点着色器置换，生物群系域扭曲有机边界 + 边界过渡带。
- **实例化装饰**：植被/岩石/建筑按区域密度实例化绘制。
- **光照**：多光源前向着色 + 太阳方向光，HDR 线性空间。
- **后期链**：SSAO（半分辨率）→ 体积光（太阳散射）→ Bloom（三级降采样）→ Tonemap 合成（ACES 近似 + 雾 + 暗角）。
- **DOM 覆盖层同步**：POI/玩家/入口覆盖层用与 GPU 相同的视图-投影矩阵逐帧投影，画布与 DOM 严丝合缝。
- **Worker 构建**：地形/装饰数据在 Web Worker 构建，不阻塞主线程。

### 2.2 智能画质分级

| 档位 | renderScale | DPR 上限 | SSAO | Bloom | 体积光 | 适用设备 |
| --- | --- | --- | --- | --- | --- | --- |
| `ultra` | 1.0 | 2.0 | ✅ | ✅ | ✅ | 核数 ≥12 且内存 ≥16GB 且非软件渲染 |
| `high` | 1.0 | 1.5 | ✅ | ✅ | ✅ | 普通桌面独显/核显 |
| `balanced` | 0.75 | 1.25 | ❌ | ✅ | ❌ | 移动端 / 核数 ≤4 / 内存 ≤4GB |
| `software` | 0.6 | 1.0 | ❌ | ❌ | ❌ | SwiftShader / llvmpipe / fallback 适配器 |

- **选档规则**（`overworld-load.js detectDevice()`）：软件渲染器识别（适配器名正则 + `isFallbackAdapter`）→ `software`；移动端 UA 或核数 ≤4 或内存 ≤4GB → `balanced`；核数 ≥12 且内存 ≥16GB → `ultra`；其余 → `high`。
- **下传机制**：画质位编码进帧 uniform `FrameUB.qualityFlags`（bit0=SSAO、bit1=Bloom、bit2=体积光），WGSL 合成着色器按位开关；`OverworldGame._render` 在 JS 侧按位**跳过对应 pass**（不创建 pipeline、不派发 compute）——零开销启停，不重新编译着色器。
- **用户覆盖**：`?owq=ultra|high|balanced|software` URL 参数 > `localStorage.chesssage_ow_quality` > 自动检测。`setQuality()` 支持运行时热切换（renderScale/DPR 变化时重算后备缓冲）。

### 2.3 呈现自检与自动降级

```js
OverworldGame.presentSelfCheck = function () {
  // 把 WebGPU canvas drawImage 到 64×64 探针 canvas，
  // 采样 (8,8)-(48,48) 区域平均亮度；
  // avg < 2（全黑）或 > 253（全白）→ 判呈现异常，返回 false
};
```

- **触发时机**：WebGPU 通道就绪后 3.6s（覆盖首批帧 + 后期链稳定）。
- **降级动作**：`OverworldGame.destroy()`（置 `_destroyed` 停 rAF 帧循环、停轮询、摘 resize 监听、`device.destroy()`）→ 无缝启动 melonJS 通道，loading 遮罩由 melonJS 侧接管淡出。
- **为什么需要**：headless/部分驱动环境下管线 0 错误、帧稳定提交，但 swapchain 呈现仍可能全黑/全白（合成器/驱动缺陷）。**代码正确性 ≠ 画面正确**，自检把"画面正确"也纳入契约。

---

## 三、三大根因修复记录（v2.2）

| # | 根因 | 症状 | 修复 |
| --- | --- | --- | --- |
| 1 | **相机初始化竞态** | `Cannot read properties of undefined (reading 'vw')`——`_prepare()` 立即触发 `_initGPU()`，而 `setupCamera()` 要等 `/api/overworld/config` 返回 | `setupCamera()` 幂等化（`if (this.cam) return`）+ `_initGPU()` 入口兜底 `if (!this.cam) this.setupCamera()` |
| 2 | **旧草案 ShaderStage 常量** | `Value 13 is invalid for WGPUShaderStage` → **全部 RenderPipeline 无效**，帧循环空转 | 8 处数值常量（vert=1/frag=4/compute=8）替换为现行 `GPUShaderStage.VERTEX/FRAGMENT/COMPUTE` 位或组合 |
| 3 | **error scope 未配对** | `No error scopes to pop` 异常打断帧循环 | pop 全部 `.catch`（safePop）+ push 加 try/catch |

> 历史教训：v2.0 曾因"黑屏修不尽"整体迁移 melonJS。根因排查表明黑屏 = 上述三个**可修复 bug** + headless 环境**呈现缺陷**（不可修复但可自检降级）。v2.2 修复 + 自检架构后 WebGPU 回归主通道。

---

## 四、测试方法

### 4.1 无头测试环境（Linux 沙箱）
```bash
# Mesa lavapipe（llvmpipe）Vulkan ICD + 放行软件适配器
export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json
export VK_LOADER_DRIVERS_SELECT=lvp_icd.json
chrome --headless=new --remote-debugging-port=9222 --remote-allow-origins='*' \
  --no-sandbox --enable-unsafe-webgpu --ignore-gpu-blocklist \
  --use-angle=vulkan --use-webgpu-adapter=vulkan --enable-features=Vulkan,WebGPUUseDXC
```
- 特性状态校验：`chrome://gpu` 的 featureStatus 应为 `WebGPU: Enabled`（`unavailable_software` = SwiftShader 后端被禁）。
- 适配器名 `google/swiftshader`：管线验证有效（着色器编译、布局校验真实执行），但 swapchain 呈现可能失效——**这正是呈现自检的覆盖场景**。

### 4.2 端到端验证矩阵（全部通过 ✅）

| 场景 | 预期 | 结果 |
| --- | --- | --- |
| 自动检测（无参数） | lavapipe 识别为 software 档，WebGPU 通道启动，自检后（headless 呈现缺陷）自动降级 melonJS | ✅ |
| `?owq=ultra` 强制档位 | 角标 `渲染：WebGPU · ultra`，管线 0 错误，帧稳定提交 | ✅ |
| 无 WebGPU（默认 Chrome 不带 flag） | 直接走 melonJS 兜底 | ✅ |
| 竞态延迟（config 3s+ 慢返回） | `_initGPU` 兜底自建相机，不再 `undefined 'vw'` | ✅ |

### 4.3 回归断言
- 管线验证：渲染器自带的 `getCompilationInfo()` 诊断 + error scope 收集，console 无 `invalid` / 编译错误。
- 帧活性：`_frameCount` 持续增长，无异常弹出。
- 呈现：真实浏览器（非 headless）自检 PASS 直接走 WebGPU；headless 自检 FAIL 走降级——两条路径都断言最终 canvas 有非单色像素。

---

## 五、已知限制与风险

| 限制 | 影响 | 缓解 |
| --- | --- | --- |
| headless/软件光栅器 swapchain 呈现可能失效 | 自动化测试无法直接截图 WebGPU 画面 | 呈现自检自动降级 melonJS；管线正确性靠 WGSL 编译诊断 + 管线验证保障 |
| Firefox Safari WebGPU 兼容性（Safari 26+ 支持，Firefox 需手动开启） | 部分浏览器走 melonJS 兜底 | 分发器 `navigator.gpu` 探测，天然兼容 |
| `?owq=` 强制 software 档仍走 WebGPU 管线 | 极老设备可能帧率低 | 软件渲染识别优先级最高，绝大多数老设备自动落 melonJS |
| deviceMemory 在部分浏览器为 undefined | 信号缺失时选档偏保守 | 兜底 `high` 档，运行时可 `?owq=` 覆盖 |

---

> 版本：v1.0（对应渲染 v2.2） ｜ 项目：棋圣·六道轮回 ｜ 状态：已落地
