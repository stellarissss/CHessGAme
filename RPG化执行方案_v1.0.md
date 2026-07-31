# 棋圣·六道轮回 —— RPG化技术执行方案 v1.0

> 本方案为"棋圣·六道轮回"项目的 RPG 化技术落地文档，描述在现有棋类作弊游戏基础上叠加轻 RPG 叙事层的完整实现路径。

---

## 一、总览

### 1.1 RPG化目标
在现有棋类作弊游戏基础上叠加轻 RPG 叙事层，使游戏从纯对局体验升级为"剧情 + 对局 + 选择 + 结局"的整体化体验。在不破坏原有棋类玩法的前提下，引入角色立绘、场景背景、对话系统、多结局与隐藏机制，形成可重复游玩（二周目）的轮回叙事结构。

### 1.2 核心系统
| 系统 | 职责 | 关键文件 |
| --- | --- | --- |
| 剧情数据管理 | 集中存储角色、六道、关卡、结局、记忆碎片数据 | `configs/story.json` |
| 选择系统 | 处理玩家在关卡中的分支选择，影响四维属性 | `choices.py` |
| 记忆碎片 | 无作弊通关解锁，收集后影响真结局 | `memory_fragments.py` |
| 结局系统 | 根据属性差距/真结局条件/识破状态判定 5 种结局 | `endings.py` |
| 识破系统 | 每次 AI 修改后概率结算，命中则锁定并触发 Boss 战 | `detection.py` |
| 天道 Boss 战 | 被识破后通关六道触发的特殊对局 | 主棋类逻辑 + 前端特化 |

### 1.3 设计原则
- **最小改动实现游戏整体 RPG 化**：复用现有棋类引擎与 API 框架，新增模块以"挂载"方式接入，不重构核心对局逻辑。
- 数据与逻辑分离：剧情文本全部存放于 `story.json`，代码仅做读取与运算。
- 二周目友好：通关后保留记忆碎片与结局记录，支持 New Game+。
- 概率与确定性平衡：识破系统使用概率判定，但触发后状态完全锁定，避免反复横跳。

---

## 二、资产嵌入游戏

### 2.1 角色立绘
- 尺寸：128×128 像素画。
- 加载路径：`/shared/assets/characters/`。
- 命名约定：`{portrait_prefix}_{emotion}.png`，例如 `protagonist_neutral.png`、`boss_asura_angry.png`。
- 用途：对话系统左侧/右侧立绘显示，通过 speaker 名称到 icon 文件名的映射表加载。

### 2.2 场景背景
- 尺寸：1920×1080 电影质感插画。
- 加载路径：`/shared/assets/backgrounds/`。
- 命名约定：与 `story.json` 中 `realms[*].background` 字段一一对应。
- 用途：关卡开场、对话背景、结局展示背景。

### 2.3 CG
- 形式：静态封面 + 动态 HTML（CSS + SVG 实现）。
- 动态效果：背景与人物相对移动（视差/平移），不使用视频文件以控制体积。
- 实现方式：前端用 CSS `transform` + SVG `<animate>` 组合，背景层缓慢平移，人物层轻微浮动。
- 加载路径：CG 内容内嵌于 HTML 模板，封面图存放于 `/shared/assets/cg/`。

### 2.4 UI
- 实现方式：SVG。
- 范围：四属性 HUD、选择按钮、记忆相册卡片、结局标题装饰、对话框边框。
- 优势：矢量缩放、可脚本化生成、与 HTML/CSS 无缝集成。

---

## 三、音乐与音效

### 3.1 BGM
- 数量：7 首（序章 + 六道各一首）。
- 来源：用户自行搜集。
- 文件路径：`shared/assets/audio/bgm/`。
- 命名约定：与 `story.json` 中 `realms[*].bgm` 字段对应，序章为 `bgm_prologue.mp3`。

### 3.2 音效
- 数量：28 个。
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
| `detection` | 被识破后通关六道并完成天道 Boss 战 |

#### determine_ending(final_choice_ending) 流程
```
1. 检查识破状态
     └─ 若 is_detected 且已完成 Boss 战 → 返回 "detection"
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
  - `detection`：黑底红纹裂痕

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
- 胜利后调用 `endings.determine_ending`，强制返回 `detection` 结局。
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
    "name": "悟道",
    "title": "结局标题",
    "description": "结局描述",
    "dialogue": [ "结局对话数组" ],
    "epilogue": "尾声文字",
    "unlock_text": "解锁提示"
  },
  "corruption": { ... },
  "samsara": { ... },
  "true_me": { ... },
  "detection": {
    "name": "识破",
    "title": "...",
    "description": "...",
    "dialogue": [ ... ],
    "epilogue": "...",
    "unlock_text": "...",
    "boss_battle": true
  }
}
```
> `detection` 结局额外含 `boss_battle: true`，前端据此展示天道 Boss 战相关 UI。

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
- [ ] Boss 战失败可无限重试，胜利后正确返回 `detection` 结局。
- [ ] 二周目功能正常：记忆碎片与结局记录保留，其余状态重置。

---

> 版本：v1.0 ｜ 项目：棋圣·六道轮回 ｜ 状态：待实施
