# 棋圣·六道轮回 —— RPG化技术执行方案 v1.3

> 本方案为「棋圣·六道轮回」项目的 RPG 化技术落地文档，描述在现有棋类作弊游戏基础上叠加轻 RPG 叙事层的完整实现路径。
> **核心原则**：剧情模式入口统一为 2.5D 大地图「六道大陆」；取消节点路径制，恢复道内线性关卡推进；大地图像素化、非规则大陆形状、九大景观区域、六道入口 + 技能 NPC 自由寻路交互。
> **资产与前端升级**：rembg ML 抠图 + alpha 二值化修复半透明、75% 透明对话框、CSS transform 立绘微幅动画、CG 改为 Seedance 文生视频、BGM 8 首、像素画 UI 资源 jpg、陈默形象统一。剧情数据源统一到 `configs/story.json`。

---

## 一、总览

### 1.1 RPG化目标
在现有棋类作弊游戏基础上叠加轻 RPG 叙事层，使游戏从纯对局体验升级为"剧情 + 对局 + 选择 + 结局"的整体化体验。在不破坏原有棋类玩法的前提下，引入角色立绘、场景背景、对话系统、多结局与隐藏机制，形成可重复游玩（二周目）的轮回叙事结构。

### 1.2 核心系统
| 系统 | 职责 | 关键文件 |
| --- | --- | --- |
| **六道大陆（剧情模式入口）** | 2.5D 等距自由探索大地图、四向玩家移动、碰撞、六道入口 / 技能 NPC 交互（E 键） | `hub/overworld.html` `hub/overworld-iso.js` `hub/overworld-ui.js` `configs/overworld.json` |
| 剧情数据管理 | 集中存储角色、六道、关卡、结局、记忆碎片数据 | `configs/story.json` |
| 关卡推进（线性） | 道内 5-6 个关卡，胜利推进 levels_passed；整道通关解锁沙盒（取消节点路径制） | `samsara/levels.py` `samsara/progression.py` `samsara/state.py` |
| 选择系统 | 处理玩家在关卡中的分支选择，影响四维属性 | `samsara/choices.py` |
| 记忆碎片 | 无作弊通关解锁，收集后影响真结局 | `samsara/memory_fragments.py` |
| 结局系统 | 根据属性差距/真结局条件/识破状态判定 5 种结局 | `samsara/endings.py` |
| 识破系统 | 每次 AI 修改后概率结算，命中则锁定并触发 Boss 战 | `samsara/detection.py` |
| 天道 Boss 战 | 被识破后通关六道触发的特殊对局 | 主棋类逻辑 + 前端特化 |

### 1.3 设计原则
- **剧情模式以大陆探索为骨架**：不再有节点路径制 UI；所有选关动作在大陆上通过六道入口 E 键交互发起。
- 数据与逻辑分离：大地图权威配置为 `configs/overworld.json`，剧情文本存放于 `story.json`，代码仅做读取与运算。
- 二周目友好：通关后保留记忆碎片、技能树、六道徽章进度与沙盒解锁状态，支持 New Game+。
- 概率与确定性平衡：识破系统使用概率判定，但触发后状态完全锁定，避免反复横跳。
- 大地图合理性优先：大陆地理、景观、POI 分布按真实地图逻辑铺展，空地比例充足，入口分布于角落以激发探索欲。

---

## 二、资产嵌入游戏

### 2.1 角色立绘
- 尺寸：1024×1024（square_hd）AI 像素画风格（1024×1024；旧文档写 128×128 已弃用）。
- 加载路径：`/shared/assets/characters/`。
- 命名约定：`{portrait_prefix}_{emotion}.png`（抠图后透明 PNG），例如 `boy_happy.png`、`flipper_as_chenmo.png`。
- 抠图：`shared/assets/cutout_rembg.py`（rembg U2Net ML 语义分割 + alpha 二值化修复半透明问题；旧 `cutout_all.py` 作回退保留）。alpha 二值化将 rembg 输出的软蒙版（alpha 1-254）在头发/衣服/皮肤等区域半透明的问题修复：alpha > 128 → 255（不透明），否则 → 0（透明），边缘做 1.2px 高斯羽化保留抗锯齿。
- 动画：v1.5 起立绘动画改为 CSS @keyframes transform 驱动（`portrait-idle` 3.5s / `portrait-speak` 2.8s，±1.5-2px 垂直浮动 + ±0.3° 微摆，60fps 无缝循环）。旧 6 帧 PNG 切换（`{prefix}_{emotion}_f{1-6}.png`，12FPS）已弃用但文件保留。CSS 在 `hub/dialogue.html`，配置见 `story.json` 的 `protagonist.animation` 与 `real_world_characters.陈默.animation`。
- 陈默形象统一：可爱+温和并存，齐肩黑色短发左侧别小发夹、白衬衫深蓝校服外套红色领结、棋子胸针；9 张图（7 立绘 + `flipper_as_chenmo` + `cg_memory_hungry`）已重新生成并抠图。
- 用途：对话系统立绘显示（已改为对齐画面下边沿，由半透明对话框盖住下半身）。

### 2.2 场景背景
- 尺寸：1920×1080 电影质感插画。
- 加载路径：`/shared/assets/backgrounds/`。
- 命名约定：与 `story.json` 中 `realms[*].background` 字段一一对应。
- 用途：关卡开场、对话背景、结局展示背景（静态图作视频缺失回退）。

### 2.3 CG（改为 Seedance 文生视频）
- 形式：5 秒可循环 MP4 视频（5 秒可循环 MP4 视频；旧文档写"静态封面 + CSS/SVG 动态 HTML，不使用视频文件"已弃用）。
- 生成工具：`shared/assets/cg/generate_cg_videos.py`（Seedance `doubao-seedance-1-0-pro-250528` 文生视频）。
- 参数：5s / 720p / 16:9 / `camera_fixed=true` 锁镜头 / 无水印；单场景、无情节、富有张力、符合物理规律。
- 资产映射：`story.json` 中 `endings[*].cg_video` 与 `realms[*].memory_fragment.cg_video` 字段指向 `{cg名}.mp4`；静态封面 JPG 仍保留于 `/shared/assets/cg/covers/`，旧 `cg` 字段指向 JPG。
- 加载路径：视频文件 `/shared/assets/cg/videos/{cg名}.mp4`；前端用 `<video autoplay muted loop playsinline>` 嵌入，结局页（`hub/ending.html` + `ending.js`）作全屏背景视频层，记忆相册详情（`hub/memory_album.js`）顶部插入视频。
- CSS 动画移除：`hub/ending.html` 已删除 `.fade-in` / `@keyframes fadeIn` 规则与 `.fade-in` 类应用。

### 2.4 UI（改为像素画 jpg）
- 实现方式：6 张 AI 生成像素画 PNG/JPG（AI 生成像素画 JPG；旧文档写"SVG"已弃用）。
- 加载路径：`/shared/assets/ui/`。
- 清单：`ui_dharma_wheel`（佛法转轮）、`ui_realm_icon_sheet`（六道图标表）、`ui_particle_star`（金色星光粒子）、`ui_particle_ember`（暗红余烬粒子）、`ui_particle_black_white`（黑白粒子）、`ui_portrait_frame`（立绘边框装饰）。
- 范围：四属性 HUD、选择按钮、记忆相册卡片、结局标题装饰、对话框边框（其余仍由内联 CSS/SVG 实现）。

---

## 三、音乐与音效

### 3.1 BGM（8 首）
- 数量：8 首（序章 + 六道各一首 + 天道 Boss 战 1 首；8 首；旧文档写 7 首已弃用）。
- 来源：用户自行搜集；清单见 `shared/assets/audio/bgm/BGM清单.md`（含主题与风格描述）。
- 文件路径：`shared/assets/audio/bgm/`。
- 命名约定：与 `story.json` 中 `realms[*].bgm`、`endings[*].bgm`、`prologue.bgm`、`tiandao.boss_battle.bgm` 字段对应，序章为 `bgm_prologue.mp3`，天道 Boss 战为 `bgm_tiandao_boss.mp3`。

### 3.2 音效
- 数量：27 个（校正为 27 个；旧文档写 28 个有误，实际 `shared/assets/audio/sfx/` 为 27 个 wav；计划新增的 `sfx_prayer.wav` 等尚未生成）。
- 生成工具：`sox`。
- 文件路径：`shared/assets/audio/sfx/`。

### 3.3 音效清单

#### 通用音效（10 个）
| 编号 | 名称 | 用途 |
| --- | --- | --- |
| 1 | `sfx_click.mp3` | 按钮点击 |
| 2 | `sfx_hover.mp3` | 鼠标悬停 |
| 3 | `sfx_page_turn.mp3` | 翻页/对话推进 |
| 4 | `sfx_unlock.mp3` | 记忆碎片解锁 |
| 5 | `sfx_ending.mp3` | 结局揭晓 |
| 6 | `sfx_transition.mp3` | 场景切换 |
| 7 | `sfx_save.mp3` | 存档/记录选择 |
| 8 | `sfx_error.mp3` | 操作错误 |
| 9 | `sfx_notify.mp3` | 系统提示 |
| 10 | `sfx_typewriter.mp3` | 打字机音效 |

#### 棋类专属音效（6 个）
| 编号 | 名称 | 用途 |
| --- | --- | --- |
| 11 | `sfx_move.mp3` | 落子 |
| 12 | `sfx_capture.mp3` | 吃子 |
| 13 | `sfx_check.mp3` | 将军 |
| 14 | `sfx_cheat.mp3` | 作弊修改棋盘 |
| 15 | `sfx_win.mp3` | 胜利 |
| 16 | `sfx_lose.mp3` | 失败 |

#### 剧情音效（12 个）
| 编号 | 名称 | 用途 |
| --- | --- | --- |
| 17 | `sfx_fragment_glow.mp3` | 记忆碎片闪光 |
| 18 | `sfx_alignment_shift.mp3` | 属性变化 |
| 19 | `sfx_enlightenment.mp3` | 悟道属性提升 |
| 20 | `sfx_corruption.mp3` | 堕落属性提升 |
| 21 | `sfx_detection.mp3` | 被识破 |
| 22 | `sfx_boss_appear.mp3` | Boss 登场 |
| 23 | `sfx_boss_defeat.mp3` | Boss 战失败 |
| 24 | `sfx_true_ending.mp3` | 真结局触发 |
| 25 | `sfx_realm_enter.mp3` | 进入六道之一 |
| 26 | `sfx_realm_clear.mp3` | 通关一道 |
| 27 | `sfx_samsara.mp3` | 轮回主题 |
| 28 | `sfx_heaven_strike.mp3` | 天道 Boss 攻击 |

---

## 四、后端系统设计

### 4.1 状态扩展（state.py）

新增字段至玩家状态对象，用于承载 RPG 层数据。

#### alignment（四维属性）
```python
alignment = {
    "enlightenment_value": 0,   # 悟道
    "corruption_value": 0,      # 堕落
    "rationality_value": 0,     # 理性
    "emotion_value": 0,         # 情感
}
```

#### detection_state（识破状态）
```python
detection_state = {
    "is_detected": False,                # 是否已被识破
    "detection_locked": False,           # 识破状态是否已锁定（命中后锁定）
    "trigger_boss_on_complete": False,   # 通关六道后是否触发天道 Boss 战
}
```

#### story_progress（剧情进度）
```python
story_progress = {
    "memory_fragments": [],       # 已解锁记忆碎片所属道
    "endings_unlocked": [],       # 已解锁结局名称
    "choices_made": [],           # 历史选择记录
    "playthrough_count": 0,       # 周目数
    "guide_seen": False,          # 是否已看过引导
}
```

#### 相关方法
| 方法 | 说明 |
| --- | --- |
| `get_alignment()` | 返回当前四维属性字典 |
| `add_alignment(delta_dict)` | 按字典增量调整属性，可为负 |
| `record_choice(realm, level, choice_index, option_index)` | 记录选择到 `choices_made` |
| `unlock_memory_fragment(realm)` | 将该道加入 `memory_fragments` |
| `get_detection_state()` | 返回识破状态字典 |
| `reset_on_detection()` | 命中识破后调用，锁定状态并标记触发 Boss |
| `clear_detection_state()` | 清除识破状态（仅在新周目或调试用） |
| `start_new_game_plus()` | 进入二周目：保留 `memory_fragments` 与 `endings_unlocked`，重置其余 |

### 4.2 识破系统（detection.py）

#### 概率判定机制
- 触发时机：每次 AI 修改棋盘后（即 `ChatAI` 输出并应用修改之后）。
- 结算方式：生成随机数与该道当前识破概率比较，命中则触发 `reset_on_detection`。
- 该机制保证作弊风险随使用次数累积，但单次结果不可预测。

#### handle_overdraft 方法流程
```
1. 检查 detection_locked
     └─ 若已锁定 → 直接返回，不再结算（避免重复触发）
2. 计算 delta（基于本次 AI 修改幅度/次数）
3. 增加识破概率（当前道概率 += delta）
4. 概率判定（random() < 当前概率）
     └─ 命中 → 调用 reset_on_detection
```

#### reset_on_detection 行为
- 标记 `is_detected = True`
- 标记 `detection_locked = True`
- 标记 `trigger_boss_on_complete = True`
- 所有六道的识破概率清零（防止后续道再次结算导致状态混乱）

### 4.3 选择系统（choices.py）

#### 核心接口
```python
ChoiceSystem.apply_choice(
    realm: str,
    level: int,
    choice_index: int,
    option_index: int,
    option_data: dict
)
```

#### 处理流程
1. 从 `option_data` 中读取 `effect` 字段（四维属性增量）。
2. 调用 `state.add_alignment(effect)` 应用到 `alignment`。
3. 调用 `state.record_choice(...)` 记录选择历史。
4. 判定是否为该道最终关卡选择（`is_final`）。
5. 若为最终选择，调用 `endings.determine_ending(...)` 得到 `ending`。

#### 返回值
```python
{
    "old_alignment": {...},   # 选择前属性
    "new_alignment": {...},   # 选择后属性
    "is_final": bool,         # 是否为最终选择
    "ending": str | None,     # 若 is_final 则为结局名称
}
```

### 4.4 记忆碎片系统（memory_fragments.py）

#### 解锁条件
- 该道全程无作弊通关（即整道对局过程中未触发任何 AI 修改棋盘）。
- 通关该道时由对局结算逻辑调用 `check_unlock_condition` 验证。

#### MemoryFragmentSystem 接口
| 方法 | 说明 |
| --- | --- |
| `check_unlock_condition(realm)` | 校验该道是否满足无作弊通关条件 |
| `try_unlock(realm)` | 满足条件则调用 `state.unlock_memory_fragment` 并返回碎片内容 |
| `get_all_fragments()` | 返回所有道碎片状态（已解锁/未解锁） |
| `get_fragment_detail(realm)` | 返回单个道碎片详情文本 |

#### 数据来源
- 碎片内容从 `configs/story.json` 中 `realms[*].memory_fragment` 字段读取。

### 4.5 结局系统（endings.py）

#### 5 种结局
| 名称 | 触发条件概述 |
| --- | --- |
| `enlightenment` | 悟道属性显著高于堕落 |
| `corruption` | 堕落属性显著高于悟道 |
| `samsara` | 悟道与堕落差距不足，陷入轮回 |
| `true_me` | 满足真结局条件（收集全部记忆碎片 + 属性平衡等） |
| `exposed` | 被识破后通关六道并完成天道 Boss 战 |

#### determine_ending(final_choice_ending) 流程
```
1. 检查识破状态
     └─ 若 is_detected 且已完成 Boss 战 → 返回 "exposed"
2. 根据 alignment 差距判定基础结局
     └─ enlightenment / corruption / samsara
3. 检查真结局条件
     └─ 全部记忆碎片已解锁 + 属性满足阈值 → 覆盖为 "true_me"
4. 返回最终结局名称
```

#### 其他方法
- `get_all_endings_status()`：返回 5 种结局的解锁状态列表。
- `get_ending_info(name)`：返回该结局的标题、描述、对话、尾声。
- `start_new_game_plus()`：将本局结局加入 `endings_unlocked`，调用 `state.start_new_game_plus()`。

### 4.6 剧情API（story_api.py）

挂载到 `/samsara/story/` 路径下，作为独立 router 提供。

#### 端点清单

**剧情数据**
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/story/data` | 返回完整 story.json（或精简概览） |
| GET | `/api/story/realm/{realm}` | 返回单道剧情（含 levels 概要） |
| GET | `/api/story/realm/{realm}/level/{level}` | 返回单关详情（opening/mid_events/ending/choices） |

**选择系统**
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/story/choice` | 提交一次选择，返回属性变化与结局（若有） |
| GET | `/api/story/choices` | 返回当前已记录的选择历史 |

**记忆碎片**
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/story/memory_fragments` | 返回六道碎片状态总览 |
| GET | `/api/story/memory_fragments/{realm}` | 返回单道碎片详情 |
| POST | `/api/story/memory_fragments/{realm}/unlock` | 尝试解锁该道碎片 |

**结局系统**
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/story/endings` | 返回 5 种结局解锁状态 |
| GET | `/api/story/endings/{name}` | 返回单结局详情 |
| POST | `/api/story/endings/determine` | 触发结局判定，返回结局名称 |

**周目与状态**
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/story/new_game_plus` | 进入二周目 |
| GET | `/api/story/alignment` | 返回当前四维属性 |
| GET | `/api/story/detection_state` | 返回识破状态 |
| POST | `/api/story/clear_detection` | 清除识破状态（调试/Boss 战后处理） |

### 4.7 主API整合（api.py）

#### Router 挂载
```python
from story_api import story_router

app.mount("/story", story_router)
```
挂载后，所有剧情相关端点统一前缀为 `/samsara/story/api/story/...`。

#### _frontend_state() 补充字段
在原有返回基础上，补充以下字段供前端 Hub 与对话系统消费：
```python
{
    "alignment": state.get_alignment(),
    "detection_state": state.get_detection_state(),
    "story_progress": state.story_progress,
    "memory_fragments": memory_system.get_all_fragments(),
}
```

---

## 五、前端界面设计

### 5.1 对话系统（dialogue.html + dialogue.js）

#### 功能模块
- **打字机效果台词展示**：逐字渲染台词，可点击跳过至整句。
- **立绘显示**：根据台词 `speaker` 字段映射到 `characters/{portrait_prefix}_{emotion}.png`。
- **选择面板**：选项按钮 + 效果标签（如 `悟道+1`）+ 提示文字（如"此选择将影响结局"）。
- **四属性 HUD**：悟道 / 堕落 / 理性 / 情感，SVG 进度条实时刷新。
- **场景背景切换**：进入关卡时按 `realm.background` 加载，过渡使用淡入淡出。

#### API 调用
- 基础路径：`/samsara/story/api/story/`
- 关键调用：
  - 进入关卡：`GET /api/story/realm/{realm}/level/{level}`
  - 提交选择：`POST /api/story/choice`
  - 刷新属性：`GET /api/story/alignment`

### 5.2 记忆相册（memory_album.html + memory_album.js）

#### 功能模块
- **六道记忆碎片卡片网格**：3×2 布局，每张卡片代表一道。
- **已解锁/未解锁状态显示**：已解锁显示碎片封面与标题，未解锁显示剪影与"???"。
- **点击查看详情（模态框）**：弹出该道碎片完整文本与配图。
- **进度条显示**：顶部展示 `已解锁数 / 6`。

#### API 调用
- `GET /api/story/memory_fragments`
- `GET /api/story/memory_fragments/{realm}`

### 5.3 结局展示（ending.html + ending.js）

#### 功能模块
- **结局标题、名称、描述**：从 `GET /api/story/endings/{name}` 获取。
- **结局对话展示**：复用对话系统打字机组件。
- **角色属性总结**：展示最终四维属性数值与走向。
- **尾声文字**：结局后记，逐段淡入。
- **不同结局不同背景效果**：
  - `enlightenment`：金光普照
  - `corruption`：暗红涟漪
  - `samsara`：循环旋转纹样
  - `true_me`：白光与碎片聚合
  - `exposed`：黑底红纹裂痕

### 5.4 Hub页面更新（index.html）

#### 新增入口
- **"记忆相册"入口链接**：跳转至 `memory_album.html`。
- **"剧情对话"入口**：从关卡选择页进入，跳转至 `dialogue.html?realm={realm}&level={level}`。

#### 状态展示
- 在 Hub 顶部展示当前周目数、已解锁结局数、已收集碎片数。

---

## 六、天道Boss战

### 6.1 触发条件
- 玩家被识破（`is_detected = True`）后，继续通关六道全部对局。
- 六道通关结算时检测 `trigger_boss_on_complete = True`，进入天道 Boss 战。

### 6.2 棋类
- 使用传统象棋（`xiangqi`）。

### 6.3 特殊规则
- **玩家禁止作弊**：作弊输入框画红叉禁用，AI 修改棋盘能力对玩家关闭。
- **天道"士"替换为"车"**：天道方四个"士"全部替换为"车"，显著提升 Boss 难度。

### 6.4 失败处理
- 无限重试：失败后可重新开始 Boss 战，不退出轮回。
- 不影响已收集记忆碎片与结局记录。

### 6.5 胜利触发
- 胜利后调用 `endings.determine_ending`，强制返回 `exposed` 结局。
- 同时调用 `clear_detection_state` 重置识破状态，允许进入二周目。

---

## 七、剧情数据结构（configs/story.json）

### 7.1 顶层结构
```json
{
  "protagonist": { ... },
  "realms": [ ... ],
  "endings": { ... }
}
```

### 7.2 protagonist
```json
{
  "name": "主角名",
  "age": 18,
  "portrait_prefix": "protagonist"
}
```

### 7.3 realms（六道）
每道结构：
```json
{
  "name": "天道",
  "personality": "该道性格基调描述",
  "boss_name": "Boss名",
  "bgm": "bgm_heaven.mp3",
  "background": "heaven_bg.png",
  "intro": "该道开场旁白",
  "levels": [ ... ],
  "memory_fragment": {
    "title": "碎片标题",
    "content": "碎片正文",
    "image": "fragment_heaven.png"
  }
}
```

### 7.4 levels
每关结构：
```json
{
  "opening": "关卡开场对话/旁白",
  "mid_events": [ "中途事件文本数组" ],
  "ending": "关卡结尾文本",
  "choices": [
    {
      "prompt": "选择提示",
      "options": [
        {
          "text": "选项文本",
          "effect": {
            "enlightenment_value": 1,
            "corruption_value": 0,
            "rationality_value": 0,
            "emotion_value": -1
          },
          "hint": "选项提示"
        }
      ]
    }
  ]
}
```

### 7.5 endings（5 种）
```json
{
  "enlightenment": {
    "id": "enlightenment",
    "name": "悟道结局·破茧成蝶",
    "type": "good",
    "cg": "cg_ending_enlightenment.jpg",
    "cg_video": "cg_ending_enlightenment.mp4",
    "background": "bg_ending_enlightenment.jpg",
    "bgm": "bgm_heaven.mp3",
    "sfx": "sfx_ending_enlightenment.wav",
    "condition": { "enlightenment_gt_corruption_by": 3, "final_choice": "enlightenment", "karma_lt": 100, "no_prayer": true },
    "description": "结局描述",
    "dialogues": [ {"speaker": "...", "portrait": "...", "text": "..."} ],
    "epilogue": "尾声文字",
    "unlock_content": "解锁内容"
  },
  "corruption": { ... },
  "samsara": { ... },
  "true_me": { ... },
  "exposed": {
    "id": "exposed",
    "name": "识破结局·天道审判",
    "type": "worst",
    "cg": "cg_ending_exposed.jpg",
    "cg_video": "cg_ending_exposed.mp4",
    "background": "bg_ending_exposed.jpg",
    "bgm": "bgm_tiandao_boss.mp3",
    "sfx": "sfx_tiandao_judgment.wav",
    "condition": { "prayer_count_gte": 1, "tiandao_boss_defeated": true },
    "description": "...",
    "dialogues_before": [ {"speaker": "天道", "portrait": "tiandao_verdict.jpg", "text": "使用真心祈求共计 {prayer_count} 次。"} ],
    "epilogue": "尾声文字",
    "unlock_content": "解锁内容"
  }
}
```
> 所有结局统一字段：`id` / `name` / `type` / `cg` / `cg_video` / `background` / `bgm` / `sfx` / `condition` / `description` / `epilogue` / `unlock_content`。
> 标准结局用 `dialogues`（对白数组）；`exposed` 结局改用 `dialogues_before`（Boss 战胜利后审判对白），其中 `{prayer_count}` 占位符由后端 `endings.py` 的 `get_ending_data()` 注入并替换为实际祈求次数。

---

## 八、测试验收标准

### 8.1 API 层
- [ ] 所有 `/samsara/story/api/story/*` 端点可正常访问（返回 200 或预期状态码）。
- [ ] `story.json` 解析无错误（启动时与 `GET /api/story/data` 调用时）。
- [ ] 选择系统正确应用属性变化（提交前后 `alignment` 差值与 `effect` 一致）。
- [ ] 记忆碎片解锁条件判定正确（无作弊通关解锁，有作弊不解锁）。
- [ ] 结局判定逻辑正确（5 种结局各自触发条件均能复现）。
- [ ] 识破系统概率判定正常（多次 AI 修改后概率上升且最终可命中）。
- [ ] 被识破后状态锁定正确（`detection_locked` 后再次结算不重复触发）。

### 8.2 前端层
- [ ] `dialogue.html` 正常加载，打字机、立绘、选择面板、四属性 HUD 均可交互。
- [ ] `memory_album.html` 正常加载，卡片网格、模态框、进度条显示正确。
- [ ] `ending.html` 正常加载，5 种结局背景效果均能正确呈现。
- [ ] `index.html` 新增入口链接可正常跳转。

### 8.3 Boss 战与周目
- [ ] 天道 Boss 战在被识破后通关六道时正确触发。
- [ ] Boss 战失败可无限重试，胜利后正确返回 `exposed` 结局。
- [ ] 二周目功能正常：记忆碎片与结局记录保留，其余状态重置。

### 8.4 六道大陆（剧情模式入口）
- [ ] `GET /overworld` 返回 200 并正确加载 iso-engine 等距场景（`#iso-scene` 已注入、`window.OverworldGame` 就绪）。
- [ ] `GET /api/overworld/config` 返回 overworld.json 权威内容，字段合法（world / tilesets / regions / roads / decor_plant / water_overlays / mountain_overlays / river_snow / river_ridge / pois / player）。
- [ ] 大陆瓦片覆盖：所有 112×84 瓦片均归属至少一个区域；POI 瓦片在合法范围且非实体（solid=false）。
- [ ] 六道入口 ×6、技能 NPC ×1、生灭台 ×1，总数正确；每个 POI 均能被交互命中（_updateInteraction 识别 closestPoi）。
- [ ] 玩家四向移动（WASD / 方向键）+ 相机跟随：连续驱动 2 秒位移 ≥ 200px，碰撞检测阻挡水体与山脉。
- [ ] 线性关卡推进：六道整道通关 `levels_passed == total_levels` 后 `state.realm_progress[realm].completed = true` 且 `sandbox_unlocked` 含该道；失败不推进。
- [ ] 浏览器端到端：入口 / 总览 / 选关弹窗 / 技能弹窗 无 console.error；badge 进度与后端同步。

---

## 九、六道大陆（iso-engine）实现规范

### 9.1 物理与渲染
- **引擎**：iso-engine v0.1.1（本地模块 `hub/vendor/iso-engine/isometric-engine.js`，CSS 3D Transform / Lit Web Components），浏览器自动深度排序；无显式烘焙层。
- **逻辑尺寸**：大陆世界 112×84 瓦片，等距渲染 CELL=30px；`iso-scene` 原点由 `origin-x / origin-y` 对齐，舞台随相机 translate + scale。
- **地面**：逐行合并同色连续段生成 829 个 `iso-plane` 色块（REG_COLOR 主题：绿/黄绿/黄/红/黑/白/灰），水域/道路/山脉以 `iso-plane`/`iso-cube` 叠色。
- **景观物体**：依 `KIND_BY_REGION` 以 `_rng(x,y,salt)` 确定性散布 iso-cube（岩石/草丛/松树/阔叶树/雪堆/沙丘/仙人掌/枯木/废墟），三面明暗自带光影。
- **相机**：视口 `#iso-viewport`，相机 zoom + translate（`applyCamera`），跟随玩家保持既定边距，+/- 缩放。
- **光影**：立方体三面明暗（库内置 shadow-overlay）+ 屏幕环境光 / 暗角（`#iso-lighting`）合成层次。

### 9.2 碰撞与几何
- **碰撞网格**：`solid[H][W]` 由 `buildSolidGrid` 预计算，水体、山脉、装饰锚点、配置 `solid_regions` 均为实体。
- **边界**：玩家半径 `playerR=13`；对玩家四角采样瓦片实体状态（`_willCollide`）。
- **水体/山脉网格**：`_fillRectGrid` 支持 `["rect", name, x1, y1, x2, y2]` 矩形区域集合，生成 `waterGrid` / `mountainGrid`。河流（`river_snow` / `river_ridge`）统一汇入水网格。

### 9.3 装饰与分层
- **装饰**：区域级 `decor_plant.{regionId}`，字段 `base_density` + 精灵池 `sprites` + `collide` 标志。植物/岩石锚点被记录进实体网格。
- **分层（z 轴 / depth）**：烘焙底图 depth=0，生灭台 depth=2，玩家容器 depth=5，POI halo / 徽章 depth=3+6；保证玩家覆盖地面、阴影在地。
- **特殊装饰**：山脉顶面撒 battle 6/7（冰川）与 dungeon 66（岩石），岸线 battle 72/73 做浅滩，绿洲 farm 15 棕榈树，密林 farm 1 常青树 ＋ farm 3 矮灌木。

### 9.4 POI 与交互
- **六道入口**：Emoji 徽章 + 金色呼吸光圈（0xd4af37 外发光 + 主题色内晕），tween 缩放 1.0 ↔ 1.15。
- **技能 NPC**：🧙 菩提老者 + 发光光圈，触发时打开 `skill-tree-modal`。
- **E 键互动**：键盘 `keydown` 捕获 → `_onInteract` → realm 调 `UI.openRealmSelect(realm)`；npc 调 `UI.openSkillTree()`。
- **8s 轮询**：`startPolling()` 每 8 秒刷新 Samsara 状态（levels_passed / completed / sandbox_unlocked），更新徽章与 HUD。

### 9.5 配置与接口
- 权威配置：`configs/overworld.json` → 通过 `GET /api/overworld/config` 返回，由启动器挂载在 main.py 的 FastAPI 应用。
- 前端运行路径：`hub/overworld.html` → `overworld-ui.js`（Overlay UI）+ `overworld-iso.js`（iso-engine 场景）。
- 测试：`tests/test_overworld.py` 校验 JSON 结构与覆盖，`tests/test_samsara_linear.py` 校验线性推进/沙盒解锁/API 回归。

---

> 版本：v1.2 · 六道大陆 ｜ 项目：棋圣·六道轮回 ｜ 状态：已落地
