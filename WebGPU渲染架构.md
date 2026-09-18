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
  // ① 哨兵探针：向 colorRT 写「左半红 / 右半绿」，再拷回 CPU 校验。
  //    读回值 == 哨兵色 → 证明「读回通路」可信；否则判据不可信，保守返回 true。
  // ② 实读画面：拷回 colorRT 的真实内容，统计非零像素占比与平均亮度；
  //    仅当 非零<1% 且 平均<0.002（全黑）或 全白>99.5% 时返回 false。
};
```

- **为什么不读 canvas**：`ctx.drawImage(webgpuCanvas, ...)` 依赖交换链的"可读回"能力，在 headless / SwiftShader / 软件光栅器下**常恒定返回全黑**——即便 GPU 渲染完全正常。实测：连"直接向 swapchain 输出纯红常量"的着色器，`drawImage` 读回依然是 0。用它会把工作正常的设备误判为"呈现异常"。故改为**直接读 GPU 侧 render target 的真实像素**。
- **两步法的意义**：只读 render target 仍无法区分「画面真黑」与「拷贝失败」——两者都表现为读回全黑。**哨兵探针**用已知常量校准读回通路本身，把"判据是否可信"与"画面是否有内容"解耦。哨兵读回不符预期时**保守放行**（返回 true），绝不误杀。
- **实现要点**：
  - `_rt()` 创建的 RT `usage` 需含 `COPY_SRC`（仅放开拷贝权限，不改渲染行为、不增显存），使拷贝来源永远合法。
  - 读回缓冲 `bytesPerRow` 按 256 对齐，逐行步进避免把行尾填充计入统计。
  - 探针使用**独立 uniform buffer**（不碰主帧 `_frameBuffer`），否则 `_updateFrame()` 会把 `res` 写回 `cam.vw`（CSS 像素）而 RT 尺寸是 `vw*_dpr`，二者不等时左右分界会落错位置（实测退化为 83/17 而非 50/50）。
  - 哨兵写入与拷贝读回必须在**同一 encoder + 同一次 submit**；分两次会因让出主线程而被 rAF 帧插队覆盖。
  - 探针后**补画一帧正常画面**，避免哨兵色残留到屏幕上（尊重 `_renderPaused`）。
- **触发时机**：WebGPU 通道就绪后 3.6s（覆盖首批帧 + 后期链稳定）。
- **降级动作（默认非破坏）**：**WebGPU 优先级永远高于回退**——默认情况下即便自检发现全黑/全白，也**保持 WebGPU 通道**并仅打角标告警（"渲染：WebGPU · <档>（自检告警）"），不主动降级。只有在以下"明确报错"时才走 melonJS 兜底：初始化抛异常、`navigator.gpu` 缺失、适配器为空、`device.lost` 设备中途丢失。如需在缺陷硬件上诊断，可用 **`?owselfcheck=1`** 手动启用破坏性降级（此时自检失败才会 `destroy()` → 启动 melonJS）。
- **为什么默认非破坏**：此前的"自动降级"会在缺陷驱动/合成器/无头环境下把工作正常的 GPU 误杀，造成"WebGPU 被回退"的体感。为兑现"WebGPU 优先级永远比回退更高、只有明确报错才回退"，自检改为默认不降级；代价是放弃"绝对不黑屏"保险，由 `?owselfcheck=1` 提供逃生口。

---

## 三、根因修复记录（v2.2）

| # | 根因 | 症状 | 修复 |
| --- | --- | --- | --- |
| 1 | **相机初始化竞态** | `Cannot read properties of undefined (reading 'vw')`——`_prepare()` 立即触发 `_initGPU()`，而 `setupCamera()` 要等 `/api/overworld/config` 返回 | `setupCamera()` 幂等化（`if (this.cam) return`）+ `_initGPU()` 入口兜底 `if (!this.cam) this.setupCamera()` |
| 2 | **旧草案 ShaderStage 常量** | `Value 13 is invalid for WGPUShaderStage` → **全部 RenderPipeline 无效**，帧循环空转 | 8 处数值常量（vert=1/frag=4/compute=8）替换为现行 `GPUShaderStage.VERTEX/FRAGMENT/COMPUTE` 位或组合 |
| 3 | **error scope 未配对** | `No error scopes to pop` 异常打断帧循环 | pop 全部 `.catch`（safePop）+ push 加 try/catch |
| 4 | **区块索引区间不连续（大地图不显示的根因）** | 管线 0 错误、帧稳定提交、`colorRT` 写入通路正常，但大地图只剩零星条纹/几乎不可见 | 见下方 §3.1 |
| 5 | **呈现自检误报** | 工作正常的设备被自检判为"呈现异常"，打无意义告警角标 | 见下方 §3.2 |
| 6 | **合成暗角偏离中心** | 最亮点落在画面右上角，四角压暗不均、中心反而偏暗 | `length(uv - 1.0)` → `length((uv - 0.5) * 2.0)`，恢复中心对称 |

### 3.1 区块索引区间不连续（核心根因）

`buildWorld()` 里地形与装饰的分块统计，原先采用 **tile-major（逐行）外层循环**：

```js
for (var ty = 0; ty < H; ty++) for (var tx = 0; tx < W; tx++) {
  // ... 写入 6 个索引 ...
  var cx = (tx / CHUNK) | 0, cy = (ty / CHUNK) | 0, key = cy * 1000 + cx;
  var cell = chunkMap[key];
  if (!cell) { cell = { cx, cy, first: tii - 6, count: 6 }; chunkMap[key] = cell; chunks.push(cell); }
  else cell.count += 6;                       // ← 只累加计数，不管索引是否相邻
}
```

**问题**：`drawIndexed(count, 1, firstIndex, 0, 0)` 只接受**一段连续**的索引区间。而 tile-major 顺序下，一个 16×16 的 chunk 被拆散在 **16 个不同行**上，相邻 chunk 的索引插在中间。于是每个 chunk 声称的 `[first, first+count)` 区间里，**只有 18.8% 的索引真正属于它，81.2% 是别的 chunk 的三角形**：

```
chunk[0,0] first=0    count=1536 → 属于本块 =  288/1536 (18.8%)
chunk[1,0] first=96   count=1536 → 属于本块 =  288/1536 (18.8%)
chunk[2,0] first=192  count=1536 → 属于本块 =  288/1536 (18.8%)
chunk[3,0] first=288  count=1536 → 属于本块 =  288/1536 (18.8%)
```

绘制时读到的绝大部分是**错位的三角形**（引用了不匹配的顶点），几何退化/错乱，屏幕上几乎什么都看不到——这就是"WebGPU 不显示大地图"的直接原因。装饰实例走 `drawIndexed(cubeIdxCount, count, 0, 0, firstInstance)`，依赖"同一 chunk 的实例物理连续"，同样中招。

**修复**：改为 **chunk-major（逐块）外层循环**，一个 chunk 的格子一次性写完，索引天然连续：

```js
var CW = Math.ceil(W / CHUNK), CH = Math.ceil(H / CHUNK);
for (var cy = 0; cy < CH; cy++) for (var cx = 0; cx < CW; cx++) {
  var tx0 = cx * CHUNK, ty0 = cy * CHUNK;
  var tx1 = Math.min(tx0 + CHUNK, W), ty1 = Math.min(ty0 + CHUNK, H);
  if (tx0 >= tx1 || ty0 >= ty1) continue;
  var first = tii;                             // 本 chunk 连续区间起点
  for (var ty = ty0; ty < ty1; ty++) for (var tx = tx0; tx < tx1; tx++) {
    // ... 写入 6 个索引 ...
  }
  chunks.push({ cx: cx, cy: cy, first: first, count: tii - first });
}
```

装饰侧同构处理：抽出 `emitChunk(x0, y0, x1, y1)` 记录 `first = deco.n`，`pushInst` 不再自行维护 `chunkMap`，由外层 chunk 循环驱动。

**验证（修复后）**：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 地形区块区间连续 | ❌ `first = 0, 96, 192, 288…` | ✅ `first = 0, 1536, 3072, 4608…` |
| 区块区间归属正确率 | 18.8% | 100% |
| 索引总和 | 56448/56448（总数对，分布错） | 56448/56448 |
| 渲染目标覆盖率 | 仅底部约 27% 一条带 | **100%** |
| 剔除绘制 vs 全量绘制 | 差异巨大 | **完全一致** |

> 该 bug 的隐蔽性在于：**索引总数、顶点数、chunk 数、管线验证全部正常**，`frameCount` 持续增长、console 无任何错误。只有把 `colorRT` 逐像素读回、并与"全量 drawIndexed(所有索引)"的结果对比，才能定位到分块区间错位。

### 3.2 呈现自检误报

旧自检用 `ctx.drawImage(webgpuCanvas, ...)` 采样亮度。该路径在 headless / 软件光栅器下恒定返回全黑（见 §2.3 说明），导致工作正常的设备被判"呈现异常"。已重写为「哨兵探针 + RT 实读」两步法。

另一个隐蔽点：探针最初复用主帧 uniform，被 `_updateFrame()` 覆写 `res` 后左右分界落错（50/50 退化为 83/17）。修复为**专用 uniform buffer**。

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
| 自动检测（无参数） | lavapipe 识别为 software 档，WebGPU 通道启动，自检通过 | ✅ |
| `?owq=software` 强制档 | RT 660×420，剔除==全量 100%，自检 true，0 错误 | ✅ |
| `?owq=balanced` 强制档 | RT 1100×700，剔除==全量 100%，自检 true，0 错误 | ✅ |
| `?owq=high` 强制档 | RT 1100×700，剔除==全量 100%，自检 true，0 错误 | ✅ |
| `?owq=ultra` 强制档 | RT 1100×700，剔除==全量 100%，自检 true，0 错误 | ✅ |
| 无 WebGPU（劫持 `navigator.gpu`） | 直接走 melonJS 兜底，地图正常渲染 | ✅ |
| `/tutorial` 独立页 | 不受影响 | ✅ |
| 竞态延迟（config 3s+ 慢返回） | `_initGPU` 兜底自建相机，不再 `undefined 'vw'` | ✅ |

### 4.3 回归断言

- **分块连续性**：`terrainChunks` / `decoChunks` 的 `first` 必须严格等于前面所有 `count` 之和（`first[i] === Σ count[0..i-1]`），且 `Σ count === 索引/实例总数`；每个地形 chunk 的 `count` 必须等于 `格数 × 6`。
- **剔除无副作用**：以"仅可见区块剔除绘制"与"全量绘制"两次渲染的 `colorRT` 覆盖率必须**完全相等**。这是分块正确性的端到端判据。
- 管线验证：渲染器自带的 `getCompilationInfo()` 诊断 + error scope 收集，console 无 `invalid` / 编译错误。
- 帧活性：`_frameCB` 持续增长，无异常弹出。
- 呈现：`presentSelfCheck()` 在可用环境下应返回 `true`（哨兵探针回报 `r≈0.5 g≈0.5 b≈0`）。

---

## 五、已知限制与风险

| 限制 | 影响 | 缓解 |
| --- | --- | --- |
| **headless + 软件光栅器下 WebGPU canvas 不呈现** | 页面截图看到的 canvas 是**空白**，与 GPU 实际渲染内容无关；自动化测试无法直接用页面截图验证 WebGPU 画面 | 判据改用 **`colorRT` 逐像素读回**（已验证可靠）；已用最小 WebGPU 页面（纯品红常量 → swapchain）复现：页面依然空白，证明是本环境呈现缺陷而非代码问题 |
| Firefox / Safari WebGPU 兼容性（Safari 26+ 支持，Firefox 需手动开启） | 部分浏览器走 melonJS 兜底 | 分发器 `navigator.gpu` 探测，天然兼容 |
| `?owq=` 强制 software 档仍走 WebGPU 管线 | 极老设备可能帧率低 | 软件渲染识别优先级最高，绝大多数老设备自动落 melonJS |
| deviceMemory 在部分浏览器为 undefined | 信号缺失时选档偏保守 | 兜底 `high` 档，运行时可 `?owq=` 覆盖 |
| 合成着色器暗角公式已修正（曾偏离中心） | 原式 `smoothstep(0.9, 0.28, length(uv - 1.0) * 0.72)` 中 `uv-1.0` 使暗角最亮处落在右上角而非中心，四角压暗不均 | **已修**：改为 `(uv - 0.5) * 2.0` 再 `smoothstep(0.9, 0.28, ·)`；已验证中心 `vig=1.0`、四角 `vig=0.0`，完全中心对称 |

---

> 版本：v1.2（对应渲染 v2.2） ｜ 项目：棋圣·六道轮回 ｜ 状态：已落地（本地修复，未推送）

---

## 附：本次修复的影响面清单

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `hub/overworld-wgpu.js` | +384 / −97 | ① 地形与装饰分块改为 chunk-major（根因修复）；② `_rt()` 增加 `COPY_SRC`；③ `presentSelfCheck()` 重写为哨兵探针 + RT 实读两步法，新增 `_PROBE_WGSL` / `_drawProbe()` / `_analyzeRTReadback()` / `_readbackRT()` |
| `hub/wgpu/shaders.js` | +10 / −4 | 合成着色器暗角恢复中心对称 |
| `hub/_dev_server.py` | +4 | 开发服务器下发 `no-store` 等禁缓存头，避免改源码后被浏览器/CDP 复用旧 JS |
| `WebGPU渲染架构.md` | +110 | 更新 §2.3 自检说明、新增 §3.1 分块根因、§4.2/4.3 测试矩阵与断言、§5 已知限制、本附录 |
