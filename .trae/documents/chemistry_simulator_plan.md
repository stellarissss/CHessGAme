# 化学反应模拟器 — 实施计划

> 单文件 HTML + CSS + JS，零依赖，对标 PhET / ChemCollective / NB化学实验室

---

## 一、Summary 概要

在 `/workspace/chemistry_simulator.html` 单个文件中构建一个高度仿真的化学实验模拟器。采用 **Canvas 主体 + DOM 面板** 的混合架构：实验区（仪器、液体、粒子、火焰）由 Canvas 实时绘制；试剂架、信息面板、对话框由 DOM 实现。仪器组合采用**邻近耦合**机制（酒精灯在烧杯下方→加热；漏斗在容器上方→可过滤/倾倒；冷凝管在烧瓶上方→冷凝）。

反应引擎采用**规则引擎 + 经典反应定义表**双层架构：通用规则（沉淀表、酸碱中和、气体生成、置换活性顺序、氧化还原）自动判断任意组合；20 个经典实验通过带条件与催化剂的精修反应定义保证现象细节准确。

---

## 二、Current State Analysis 现状分析

工作区 `/workspace` 现有内容为棋类游戏项目（xiangqi/weiqi/wuziqi/dongwuqi/heibaiqi/tiaoqi + samsara 六道轮回系统 + hub 总入口）。`hub/style.css` 体现了项目偏好的视觉语言：深色主题、金/玉/绛配色、Noto Serif SC + Orbitron 字体、ambient 光晕氛围。本模拟器将延续此视觉语言（深色主题、玻璃质感、霓虹高光），但配色调整为更贴合"实验室"语境（青绿试剂量、琥珀火焰、银白玻璃）。

无任何已有化学代码，本文件为全新创建。

---

## 三、Architecture 架构总览

### 3.1 文件结构（单 HTML 内部分区）

```
chemistry_simulator.html
├── <head>
│   ├── <meta> / <title>
│   └── <style>  全部 CSS 内联
├── <body>
│   ├── 顶栏 .topbar           （标题、重置、实验导览下拉、帮助）
│   ├── 左栏 .shelf            （试剂架 DOM，分类可拖拽物质卡片）
│   ├── 中栏 .stage-wrap
│   │   ├── <canvas id="stage">  实验区主画布
│   │   └── .stage-overlay        浮层提示/工具栏（加热/搅拌/倾倒按钮）
│   ├── 右栏 .panel           （信息面板：内容物/方程式/现象/温度/pH/历史）
│   ├── .instrument-tray      （底部仪器托盘，拖入画布生成实例）
│   └── .modal-layer          （警告/导览/帮助模态框）
└── <script>  全部 JS 内联
    ├── CONFIG                  全局常量
    ├── SUBSTANCES              物质数据库
    ├── INSTRUMENTS             仪器规格
    ├── REACTIONS               经典反应定义表
    ├── RULES                   通用化学规则（沉淀/酸碱/气体/置换/氧化还原）
    ├── class Substance         物质实例（含物质量 mol、温度、状态）
    ├── class Container         容器实例（内容物、温度、体积、pH、位置）
    ├── class Instrument        仪器实例（位置、类型、关联容器）
    ├── class ParticleSystem    粒子系统（气泡/沉淀/火焰/烟雾）
    ├── class ReactionEngine    反应引擎（检测/限量计算/放热/条件判断）
    ├── class Renderer          Canvas 渲染器（仪器/液体/粒子/光效）
    ├── class UI                DOM 面板更新与拖拽
    ├── class Simulator         总控（主循环、事件分发、状态同步）
    └── bootstrap               启动
```

### 3.2 渲染分层（每帧）

1. **背景层**：网格实验台、ambient 光晕
2. **仪器底层**：铁架台杆、酒精灯底座
3. **液体层**：容器内液体（弯月面、渐变、波纹）
4. **沉淀层**：底部沉积颗粒
5. **仪器玻璃层**：透明玻璃壁（反光、高光线）
6. **粒子层**：气泡上升、烟雾扩散、火焰闪烁
7. **标注层**：温度浮标、连线、邻近耦合高亮
8. **DOM 浮层**：工具按钮、提示

### 3.3 主循环（requestAnimationFrame ~60fps）

```
tick(dt):
  1. ReactionEngine.detect(containers)   // 检测并推进反应
  2. for each container: updateTemperature(dt), updateDissolution(dt), updateSettling(dt)
  3. ParticleSystem.update(dt)
  4. Renderer.render(all)
  5. UI.refresh(throttled)               // 每 ~200ms 刷一次 DOM
```

---

## 四、数据模型

### 4.1 物质数据库 `SUBSTANCES`（覆盖规格中全部物质 + 常见派生物）

每条记录字段：
```js
{
  id: 'hcl',
  name: '盐酸',
  formula: 'HCl',
  molarMass: 36.5,          // g/mol
  state: 'aqueous',         // solid | liquid | gas | aqueous
  color: '#f5f5f5',         // 主色（溶液为透明时给极淡色）
  density: 1.18,            // g/mL（固体/液体）
  solubility: null,         // 或 g/100g水
  category: 'acid',         // metal|nonmetal|oxide|acid|base|salt|organic|indicator|other
  attributes: {
    pH: 1,                  // 强酸
    concentration: 12,      // mol/L（浓）
    corrosive: true,
    flammable: false,
    strongAcid: true,
    strongBase: false,
    metalActivity: null,    // 金属活动顺序（Na=1...Au=16）
    redox: 'oxidizer',      // oxidizer|reducer|none
    catalyst: false,
    ionColor: null,         // 水合离子颜色（Cu2+ 蓝、Fe3+ 黄、Fe2+ 浅绿、KMnO4 紫）
  },
  indicator: null,          // 若为指示剂：{acidColor, baseColor, neutralColor, transitionRange}
}
```

物质清单（≥60 种）：
- **金属**：Na, K, Fe, Cu, Zn, Mg, Al, Ca（含粉末/片/条形态）
- **非金属/气体**：H₂, O₂, CO₂, NH₃, Cl₂, SO₂, N₂, C（碳粉）
- **氧化物**：CaO, Fe₂O₃, Fe₃O₄, CuO, MnO₂, MgO
- **酸**：HCl(稀/浓), H₂SO₄(稀/浓), HNO₃(稀/浓), CH₃COOH, H₂CO₃
- **碱**：NaOH, KOH, Ca(OH)₂, NH₃·H₂O
- **盐**：NaCl, CuSO₄(含胆矾 CuSO₄·5H₂O), FeCl₃, FeCl₂, AgNO₃, BaCl₂, Na₂CO₃, NaHCO₃, CaCO₃, KMnO₄, Na₂SO₄, KClO₃, FeSO₄, CuCl₂, MgCl₂, Na₂S, KI
- **其他**：H₂O₂, C₂H₅OH, C₆H₁₂O₆, H₂O（蒸馏水）, 蔗糖
- **指示剂**：酚酞、石蕊、甲基橙

### 4.2 仪器规格 `INSTRUMENTS`

```js
{
  id: 'beaker',
  name: '烧杯',
  icon: '⚗',                  // 托盘图标
  capacity: 250,              // mL
  mouthOpen: 'top',           // top|narrow|side
  canHeat: true,
  canStir: true,
  canPour: true,
  shape: 'beaker',            // Renderer 据此绘制
  connectors: ['top'],        // 可连接方位
  draw(ctx, inst){...}        // 可选自定义绘制
}
```

仪器清单（≥13 种）：烧杯、试管、锥形瓶、量筒、酒精灯、铁架台、蒸发皿、漏斗（含滤纸）、滴管、玻璃棒、温度计、集气瓶、冷凝管、圆底烧瓶、广口瓶、燃烧匙。

### 4.3 容器状态 `Container`

```js
{
  id, type: 'beaker',
  x, y, w, h,                 // 画布坐标
  contents: [                 // 内容物（物质实例）
    {substanceId, moles, state, dissolved, temp, indicatorMix}
  ],
  temperature: 25,            // ℃
  volume: 0,                  // 当前液体体积 mL
  pH: 7,
  heated: false,              // 是否被加热
  stirring: false,
  capped: false,
  particles: [],              // 容器内粒子
  history: [],                // 反应历史
}
```

---

## 五、反应引擎 `ReactionEngine`（核心）

### 5.1 双层架构

**第一层：通用规则 `RULES`**（自动判断任意组合，不限预定义）

| 规则类型 | 判断依据 | 现象 |
|---|---|---|
| 沉淀生成 | 溶度积表 `SOLUBILITY_TABLE`（含 AgCl/BaSO₄/Cu(OH)₂/Fe(OH)₃/Mg(OH)₂/CaCO₃/BaCO₃ 等 ~25 项） | 沉淀下沉，按离子色着色 |
| 酸碱中和 | H⁺ + OH⁻ → H₂O；含指示剂变色（按过渡范围） | 颜色突变、放热 |
| 气体生成 | H⁺ + CO₃²⁻/HCO₃⁻/S²⁻ → CO₂/H₂S；NH₄⁺ + OH⁻ → NH₃ | 气泡逸出 |
| 金属置换 | 金属活动顺序表（K>Na>Ca>Mg>Al>Zn>Fe>Sn>Pb>H>Cu>Hg>Ag>Pt>Au） | 固体溶解/析出，部分放热 |
| 氧化还原 | 标准电极电位表 `REDOX_POTENTIALS`（含 MnO₄⁻/Cr₂O₇²⁻/HNO₃/H₂O₂/Cl₂ 等） | 颜色变化、气体（NO₂/Cl₂/SO₂） |
| 络合形成 | Cu²⁺ + 4NH₃ → [Cu(NH₃)₄]²⁺ 等常见络合 | 颜色变化 |
| 铵盐分解 | 加热条件下 NH₄⁺ 盐 → NH₃↑ + 酸 | 气体、温度门控 |

**第二层：经典反应定义 `REACTIONS`**（精修 20 个实验的细节）

```js
{
  id: 'na_water',
  reactants: [{id:'na', state:'solid'}, {id:'h2o'}],
  products: [{id:'naoh'}, {id:'h2', state:'gas'}],
  equation: '2Na + 2H₂O → 2NaOH + H₂↑',
  conditions: {minTemp: 0},        // 无需加热
  catalyst: null,
  enthalpy: -184,                  // kJ/mol（放热）
  phenomena: [
    {type:'gasBubble', intensity:'high'},
    {type:'flame', chance:0.4, reason:'H₂ 与空气点燃'},  // 钠反应放热引燃 H₂
    {type:'colorShift', to:'#ff4500', reason:'钠熔融小球'}
  ],
  safety: {level:'warn', message:'钠与水剧烈反应，可能燃烧/爆炸，工业上禁用水扑灭钠火'},
  description: '钠浮于水面，熔成小球，迅速游动，发出嘶嘶声，产生氢气（可点燃），溶液变红（酚酞）',
}
```

### 5.2 反应检测算法

```
detect(container):
  1. 收集容器内全部物质（按离子解离）
  2. 匹配 REACTIONS（按 reactants 集合）→ 若命中且条件满足，使用定义反应
  3. 否则遍历 RULES：
     a. 沉淀：两两离子组合查 SOLUBILITY_TABLE
     b. 酸碱：检测 H⁺ 与 OH⁻ / 弱碱根
     c. 气体：H⁺ + 挥发性阴离子；NH₄⁺ + OH⁻
     d. 置换：金属 + 酸/盐溶液，按活动顺序
     e. 氧化还原：氧化剂 + 还原剂，按电极电位差 > 0
  4. 计算限量试剂：min(reactant.moles / stoich)
  5. 推进反应（按 dt 限速）：消耗限量试剂，生成产物
  6. 热量：Q = enthalpy × Δn；更新容器温度 ΔT = Q / (m·c)
  7. 触发现象粒子与 UI 更新
  8. 若全部规则均不匹配 → UI 显示"无明显反应"
```

### 5.3 条件门控

- `minTemp`：低于阈值不反应（如 KMnO₄ 分解需加热）
- `needsIgnition`：需"点燃"操作（如乙醇燃烧、Mg 燃烧）
- `catalyst`：需存在催化剂物质（如 H₂O₂ 分解需 MnO₂）
- `concentration`：浓/稀产物不同（Cu+浓HNO₃→NO₂；Cu+稀HNO₃→NO）

---

## 六、Canvas 渲染器 `Renderer`

### 6.1 仪器绘制

每种仪器有专属绘制函数，统一风格：
- **玻璃质感**：`ctx.fillStyle = rgba(255,255,255,0.05)`；高光用 `linearGradient` 白→透明；边缘 `strokeStyle = rgba(180,220,255,0.6)`
- **液体填充**：根据容器形状 clip 后填充，顶部画弯月面（贝塞尔曲线）
- **液体颜色**：混合所有溶解物质颜色（按浓度加权 RGB 加色混合）

### 6.2 粒子系统 `ParticleSystem`

| 粒子类型 | 行为 | 视觉 |
|---|---|---|
| `bubble` | 从液体底部生成，向上加速，到液面消失 | 半透明白圆，半径随机 2-6px |
| `precipitate` | 反应点生成，下沉（速度按 Stokes 律有差异） | 不透明小颗粒，色按沉淀物 |
| `floc` | 絮状沉淀，缓慢下沉，聚集 | 模糊大颗粒 |
| `flame` | 酒精灯口生成，向上抖动，颜色渐变 | 多层径向渐变 + 噪声扰动 |
| `smoke` | 火焰顶部生成，向上扩散，淡出 | 灰色半透明，半径渐大 |
| `vapor` | 加热液体表面生成 | 白色雾化 |
| `spark` | 燃烧/剧烈反应生成 | 短寿命亮点 + 拖尾 |

粒子用对象池复用以保性能。

### 6.3 邻近耦合视觉反馈

- 当仪器进入耦合范围（如酒精灯火焰区与烧杯底部重叠），画布绘制虚线连接 + 脉冲光晕
- 鼠标悬停仪器时高亮其耦合伙伴

---

## 七、交互层

### 7.1 拖拽

- **试剂架 → 容器**：HTML5 drag API；拖到画布上时，根据鼠标位置判断目标容器（命中测试），调用 `container.addSubstance(id, amount)`
- **试剂架 → 空画布**：自动生成一个新烧杯承装该物质
- **仪器托盘 → 画布**：拖入生成仪器实例
- **画布内仪器**：Canvas 内自定义拖拽（mousedown/move/up），更新位置并重算耦合
- **容器倾倒**：选中容器 → 点"倾倒"按钮 → 拖到另一容器上方释放 → 内容物转移（含动画弧线）

### 7.2 操作按钮（选中容器时浮层显示）

- 🔥 加热 / 停止（需邻近酒精灯，或自带电加热）
- ⤵ 滴加（需邻近滴管）
- 🌀 搅拌（需玻璃棒插入）
- ⬇ 倾倒
- ✋ 点燃（针对可燃物）
- 🧪 取样（查看内容物详情）
- 🗑 清空

### 7.3 仪器组合（邻近耦合规则）

| 仪器 A | 仪器 B（位置关系） | 耦合效果 |
|---|---|---|
| 酒精灯 | 容器（A 在 B 下方） | 加热 B |
| 漏斗 | 容器（A 在 B 上方） | 可过滤/转移液体到 B |
| 冷凝管 | 圆底烧瓶（A 在 B 上方） | 蒸气冷凝回流 |
| 玻璃棒 | 容器（A 插入 B） | 可搅拌 B |
| 温度计 | 容器（A 插入 B） | 显示 B 温度 |
| 集气瓶 | 容器（A 接 B 导管口） | 收集气体 |
| 铁架台 | 任意仪器（夹持范围） | 固定位置 |

---

## 八、信息面板（右栏 DOM）

实时展示选中容器：
1. **内容物清单**：物质名 / 化学式 / 物质量 mol / 状态
2. **反应方程式**：当前/最近反应的配平方程式（含条件标注如 Δ、点燃、催化剂）
3. **现象描述**：自然语言文字（如"产生白色沉淀，溶液由无色变蓝色"）
4. **数据**：温度 ℃ / 体积 mL / pH 值（有指示剂或可测时）
5. **反应历史**：时间戳 + 反应名 + 方程式

---

## 九、20 个经典实验覆盖（REACTIONS 定义表）

| # | 实验 | 关键物质 | 关键现象 | 特殊处理 |
|---|---|---|---|---|
| 1 | 钠与水 | Na + H₂O | 浮熔游响红 + H₂ 燃烧 | 安全警告 |
| 2 | 铁置换铜 | Fe + CuSO₄ | 铁表面红色析出，溶液蓝→浅绿 | 活动顺序 |
| 3 | 碳酸钠+盐酸 | Na₂CO₃ + HCl | 大量气泡 | 气体规则 |
| 4 | AgCl 沉淀 | AgNO₃ + HCl | 白色沉淀（见光变灰可选） | 沉淀表 |
| 5 | BaSO₄ 沉淀 | BaCl₂ + Na₂SO₄ | 白色不溶沉淀 | 沉淀表 |
| 6 | Cu(OH)₂ 生成 | CuSO₄ + NaOH | 蓝色絮状沉淀 | 絮状粒子 |
| 7 | Fe(OH)₃ 生成 | FeCl₃ + NaOH | 红褐色沉淀 | 沉淀表 |
| 8 | 酸碱中和 | HCl + NaOH（+指示剂） | 颜色突变 + 放热 | 指示剂变色 |
| 9 | H₂O₂ 分解 | H₂O₂ + MnO₂ | 催化产氧 | 催化剂门控 |
| 10 | CaCO₃+盐酸 | CaCO₃ + HCl | 固体溶解+气泡 | 气体规则 |
| 11 | 镁条燃烧 | Mg + O₂(点燃) | 耀眼白光 | 点燃门控 |
| 12 | 铁在氧气中燃烧 | Fe + O₂(点燃) | 火星四射 | 点燃+集气瓶 |
| 13 | CO₂通入石灰水 | CO₂ + Ca(OH)₂ | 浑浊→澄清（过量） | 两段反应 |
| 14 | 铜与浓硝酸 | Cu + 浓 HNO₃ | 红棕色 NO₂ 气体 | 浓度分支 |
| 15 | 乙醇燃烧 | C₂H₅OH + O₂(点燃) | 蓝色火焰 | 点燃门控 |
| 16 | KMnO₄ 加热分解 | KMnO₄(Δ) | 紫色褪去+产氧 | 加热门控 |
| 17 | NaHCO₃+盐酸 | NaHCO₃ + HCl | 气泡 | 气体规则 |
| 18 | FeCl₃+NaOH | FeCl₃ + NaOH | 红褐沉淀 | 沉淀表 |
| 19 | BaCl₂+Na₂SO₄ | BaCl₂ + Na₂SO₄ | 白色沉淀 | 沉淀表 |
| 20 | 浓硫酸稀释 | 浓 H₂SO₄ + H₂O | 大量放热 | **顺序警告**：水入酸→警告弹窗 |

### 副反应扩展（RULES 自动覆盖）

- 所有可溶盐 + 酸/碱/盐的双分解反应（自动沉淀/气体/中和判断）
- 所有活泼金属 + 酸 → H₂
- 所有金属 + 盐溶液 → 置换
- 铵盐 + 强碱 → NH₃（加热增强）
- 含 Cu²⁺/Fe³⁺ + OH⁻ → 沉淀
- CO₂ + OH⁻ → CO₃²⁻（过量→HCO₃⁻）

---

## 十、安全提示

`SAFETY_RULES` 表，命中时弹模态框：
- 水入浓硫酸（顺序错误）→ 警告"应酸入水"
- 钠与水 → 提示剧烈反应
- 浓硝酸接触有机物 → 警告
- 加热密闭容器 → 警告
- 大量活泼金属入水 → 警告

---

## 十一、样式规范（延续项目视觉语言）

- 深色主题：`--bg: #0a0e14`，`--panel: rgba(20,26,36,0.85)`
- 玻璃质感：`backdrop-filter: blur(12px)` + 半透明边框
- 强调色：青绿 `#3dd9b3`（试剂）、琥珀 `#ffa940`（火焰/警告）、银白 `#e6f0ff`（玻璃高光）
- 字体：`Noto Serif SC`（标题/方程式）、`Orbitron`（数据/温度）、`JetBrains Mono`（化学式）
- 响应式：≥1200px 三栏；900-1200px 折叠右栏为抽屉；<900px 试剂架变底部横向滚动

---

## 十二、实施步骤

### Step 1：HTML 骨架 + CSS 主题
- `<head>` 内联 CSS 变量、布局（grid 三栏）、面板/模态框样式、响应式断点

### Step 2：物质/仪器/规则数据库
- JS 内联 `SUBSTANCES`、`INSTRUMENTS`、`SOLUBILITY_TABLE`、`REDOX_POTENTIALS`、`METAL_ACTIVITY`、`REACTIONS`、`SAFETY_RULES`

### Step 3：核心类
- `Substance`、`Container`、`Instrument`、`ParticleSystem`

### Step 4：反应引擎
- `ReactionEngine.detect()` / `advance()` / `limitingReagent()` / `heat()`

### Step 5：Canvas 渲染器
- 仪器绘制函数集、液体绘制（弯月面+渐变）、粒子绘制、光效

### Step 6：DOM UI
- 试剂架卡片生成、信息面板更新、模态框、工具浮层

### Step 7：交互层
- 拖拽（HTML5 DnD + Canvas mousedown/move）、邻近耦合检测、操作按钮

### Step 8：主循环与启动
- `Simulator` 类 + `requestAnimationFrame` + `bootstrap()`

### Step 9：20 个经典反应定义填表 + 安全规则

### Step 10：自测与调优
- 浏览器打开验证每个实验；调粒子参数、颜色、性能

---

## 十三、Assumptions & Decisions 假设与决策

1. **渲染架构**：Canvas 主体 + DOM 面板（用户已确认）
2. **仪器组合**：邻近耦合而非显式管道连接（用户已确认，保证高自由度）
3. **物质量单位**：mol；用户拖入时按"一药匙"/"一滴"/"一块"换算为近似 mol（如固体 0.05 mol、液体 5 mL 按浓度计算）
4. **温度模型**：简化比热容（水 4.18 J/g·K；溶液近似水；固体容器忽略热容）
5. **反应速率**：非真实动力学；按 dt 限速消耗（每秒消耗限量试剂的 30%），保证视觉可见
6. **pH 计算**：强酸/强碱按浓度直接算；弱酸/弱碱按简化 Ka；缓冲略
7. **指示剂**：作为物质混入容器，按其过渡范围决定颜色（与溶液真实色混合）
8. **不实现**：电子云/量子化学、有机反应机理（仅燃烧/酯化等表观）、电极电位精确计算（仅查表）
9. **文件位置**：`/workspace/chemistry_simulator.html`
10. **零依赖**：不引外部 CDN，字体用系统 fallback（`Noto Serif SC` fallback 到 `Songti SC`/`serif`）

---

## 十四、Verification 验证步骤

完成后按以下顺序验证（直接 `file://` 打开或 `python3 -m http.server`）：

1. **基础渲染**：打开页面，三栏布局正常，画布显示空实验台网格
2. **拖拽试剂**：从试剂架拖 HCl 到画布 → 生成烧杯+盐酸
3. **拖入 NaOH**：拖入同一烧杯 → 触发中和反应，温度上升，颜色（无指示剂时无变化）
4. **加指示剂**：拖入酚酞 → 中和前变红，过量酸后褪色
5. **20 个实验逐一验证**：用顶栏"实验导览"下拉快速切换预设场景，逐一确认现象
6. **安全警告**：尝试水入浓硫酸 → 弹警告
7. **仪器组合**：放酒精灯在烧杯下 → 加热按钮可用；KMnO₄ 加热产氧
8. **性能**：同时 50 粒子无掉帧
9. **响应式**：缩窄窗口至 900px，右栏变抽屉
10. **跨浏览器**：Chrome / Firefox / Safari 最新版均正常

---

## 十五、Out of Scope（明确不做）

- 真实分子动力学模拟
- 三维渲染（保持 2D 俯视/侧视）
- 多语言（仅中文 UI，化学式通用）
- 持久化（刷新即重置，不做 localStorage）
- 网络功能
- 单元测试框架（手工验证）
