# 棋圣 ChessSage · 六道众生

> **大模型为饵，规则为网。**
> 一个以"利用 AI 大模型作弊"为核心玩法的棋类游戏平台。

---

## 游戏精神

棋圣不是普通的棋类游戏。在这里，AI 不是你的对手——它是你的**共犯**。

传统棋类游戏中，规则是铁律，玩家只能在框架内博弈。棋圣彻底打破这一前提：**规则本身是可以被篡改的数据**。玩家用自然语言对 AI 说出任何想法——"让马飞过河"、"把棋盘变成紫色"、"让 AI 替我走三步"——AI 会实时理解意图，生成 JSON Patch，改写棋盘配置文件，让不可能变为可能。

这就是**灵活编码（Flexible Coding）**：

- 不改引擎代码，只改 JSON 配置
- 不重新编译，只发一条自然语言指令
- 不写规则文档，让大模型自己理解什么是"合理"的修改

六大棋境对应佛教六道轮回——人、天、阿修罗、畜生、饿鬼、地狱。每一道棋境都有独立的规则宇宙，等待玩家用一句话改写。

---

## 核心玩法

### 一句话改世界

在任意棋局中，玩家可以在命令框输入自然语言：

| 玩家输入 | AI 理解 | 实际效果 |
|---------|---------|---------|
| "让马可以飞过河" | C 类规则修改 | 重写马的 `where` 条件，移除禁过河限制 |
| "把棋盘变成绿色" | D1 类界面修改 | 修改 `board.json` 的 `appearance.background_color` |
| "冻结 AI 三回合" | A2 类机制修改 | 向 `mechanisms.skip_turns` 注入 `{side:"black", remaining:3}` |
| "创建一个能全图瞬移的超级兵" | C+ 类自定义棋子 | 在 `pieces.custom_pieces` 新增棋子，走法用 region 原语 |
| "我直接赢了" | A1 类硬编码 | 直接设置 `game_status.state = "ended"` |
| "你喜欢吃面条吗" | E 类纯搞笑 | AI 趣味回复，不修改任何配置 |

### 两级 AI 流水线

每条自然语言指令经过两级 AI 处理：

```
玩家输入 ──▶ 第一级：意图解析器 ──▶ 第二级：代码生成器 ──▶ JSON Patch ──▶ 应用到配置文件
              (DeepSeek)              (专用 Prompt)          (RFC 6902)
```

**第一级 — 意图解析器**：将自然语言分类为 A/B/C/D/E/F 六大类，评估可行性、能量消耗（0-10）、置信度，生成结构化 action 列表。

**第二级 — 代码生成器**：根据分类调用专用 System Prompt，输出 RFC 6902 JSON Patch 操作数组（优先）或完整 JSON（降级），经 Schema 校验后写入配置文件。

### 意图分类体系

| 分类 | 含义 | 修改目标 | 示例 |
|------|------|---------|------|
| **A1** | 硬编码操作 | 直接执行 | 悔棋、投降、直接判胜 |
| **A2** | 灵活编码机制 | `board_state.mechanisms` | 冻结 AI、AI 接管、随机走棋、额外回合 |
| **B** | 棋盘变换 | `board_state.json` | 增删棋子、变换类型、旋转棋盘 |
| **C** | 规则修改 | `pieces_red/black.json` | 改走法、改吃子规则、改特殊能力 |
| **C+** | 自定义棋子 | `pieces` + `board_state` | 创造全新棋子类型 |
| **D1** | 界面配置 | `ui_config.json` / `board.json` | 改颜色、线条、棋盘尺寸 |
| **D2** | HTML 结构 | `index.html` 区段 | 增删侧边栏、按钮、模态框 |
| **E** | 纯搞笑 | 无修改 | 闲聊、玩笑、无关话题 |
| **F** | 高级功能 | **直接拒绝** | 需改核心引擎代码的请求 |

---

## JSON 原语设计

棋圣的核心创新在于：**所有棋子走法都用两种原子原语声明式定义**，而非硬编码在引擎中。AI 只需输出 JSON Patch 修改这些原语，就能创造出任何移动模式。

### jump — 离散跳跃

```json
{
  "kind": "jump",
  "to": [1, 2],
  "block": [[0, 1]],
  "land": "any",
  "sym": "rotate4_mirror",
  "where": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `to` | `[dx, dy]` / `"$forward"` / `{"mode":"region","region":"$full_board"}` | 目标位置：固定偏移 / 前进方向 / 区域瞬移 |
| `block` | `[[dx,dy],...]` | 路径关卡格（必须为空，如马腿） |
| `land` | `"empty"` / `"enemy"` / `"any"` | 落点占用要求 |
| `sym` | `"none"` / `"rotate4"` / `"rotate4_mirror"` / `"mirror_x"` | 对称展开枚举 |
| `where` | 条件表达式数组 | 额外限制（如禁过河） |

### ray — 射线滑行

```json
{
  "kind": "ray",
  "dir": [1, 0],
  "max": -1,
  "screens": 0,
  "land": "empty",
  "sym": "rotate4",
  "where": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `dir` | `[dx, dy]` | 方向向量 |
| `max` | `int` | 最大步数（-1 = 无限） |
| `screens` | `int` | 需跳过的棋子数（0 = 普通滑行，1 = 炮架吃子） |
| `land` | `"empty"` / `"enemy"` / `"any"` | 落点占用要求 |
| `sym` | 同上 | 对称展开 |
| `where` | 条件表达式数组 | 额外限制 |

### where 条件表达式

```json
// 相禁过河
[{"not": {"crossed_river": {"pos": "$dest"}}}]

// 士只能在九宫
[{"in_region": {"pos": "$dest", "region": "$palace"}}}]

// 兵过河后可以横走
[{"or": [{"crossed_river": {"pos": "$self"}}, {"at_row": {"pos": "$self", "row": 3}}]}]
```

| 操作符 | 参数 | 说明 |
|--------|------|------|
| `in_region` | `pos`, `region` | 位置在指定区域内 |
| `crossed_river` | `pos` | 位置已过河 |
| `same_side` | `pos` | 位置在己方区域 |
| `at_row` / `at_col` | `pos`, `row`/`col` | 位置在指定行列 |
| `not` / `and` / `or` | 条件表达式 | 逻辑组合 |

**变量**：`$self`（当前位置）、`$dest`（目标位置）、`$forward`（前进方向）
**区域**：`$full_board`、`$palace`、`red_side`、`black_side`、`river`，以及 `board.json` 中自定义的 `regions`

### 经典棋子编码示例

```json
// 马走日（蹩马腿，八方向）
{"kind":"jump","to":[1,2],"block":[[0,1]],"land":"any","sym":"rotate4_mirror"}

// 炮移动（直线滑行，不吃子）
{"kind":"ray","dir":[1,0],"max":-1,"screens":0,"land":"empty","sym":"rotate4"}

// 炮吃子（隔一子吃）
{"kind":"ray","dir":[1,0],"max":-1,"screens":1,"land":"enemy","sym":"rotate4"}

// 相走田（禁过河）
{"kind":"jump","to":[2,2],"block":[[1,1]],"land":"any","sym":"rotate4","where":[{"not":{"crossed_river":{"pos":"$dest"}}}]}

// 不动的墙
{"kind":"jump","to":[0,0],"block":[],"land":"empty","sym":"none"}

// 全图瞬移（超级棋子）
{"kind":"jump","to":{"mode":"region","region":"$full_board"},"land":"any","sym":"none"}
```

### 机制原语（A2 类）

通过修改 `board_state.json` 的 `mechanisms` 字段实现运行时机制，无需改代码：

| 机制 | 字段 | 效果 |
|------|------|------|
| `skip_turns` | `{side, remaining, reason}` | 跳过指定方 N 回合 |
| `ai_control` | `{side, remaining, reason}` | AI 接管指定方 N 回合 |
| `random_moves` | `{side, remaining, reason}` | 随机走 N 步 |
| `extra_turns` | `{side, remaining, reason}` | 额外 N 回合 |
| `move_limits` | `{side, limit, remaining_moves}` | 每回合限走 N 步 |
| `player_control` | `{side, reason}` | 设置玩家控制阵营 |

---

## 配置文件体系

每个棋类游戏由 6 个 JSON 配置文件驱动，全部可通过 AI 实时修改：

| 文件 | 作用 | 关键字段 |
|------|------|---------|
| `board_state.json` | 运行时棋盘状态 | `pieces[]`、`current_turn`、`game_status`、`mechanisms`、`move_history` |
| `board.json` | 棋盘几何与外观 | `geometry`（尺寸/河界/九宫）、`appearance`（颜色/线条）、`regions` |
| `pieces_red.json` | 红方棋子规则 | `pieces`（走法原语）、`custom_pieces`、`side_overrides` |
| `pieces_black.json` | 黑方棋子规则 | 同上，双方独立 |
| `rules.json` | 游戏规则 | `win_conditions`、`special_rules`、`turn_rules`、`ai_difficulty` |
| `ui_config.json` | 界面配置 | `theme`（棋子颜色/高亮色）、`layout`、`custom_css`、`custom_js` |

### RFC 6902 JSON Patch

AI 修改配置时优先输出标准 JSON Patch 操作数组，做到最小改动、可追溯、可 diff：

```json
[
  {"op": "replace", "path": "/pieces/elephant/moves/0/where", "value": []},
  {"op": "add", "path": "/custom_pieces/-", "value": {"type": "teleporter", "name": "传送兵", "moves": [...]}}
]
```

支持 `add` / `remove` / `replace` / `copy` / `move` 五种操作，JSON Pointer 路径用 `/` 分隔，`/-` 追加数组末尾。

### Schema 校验

`shared/schemas/` 下的 JSON Schema 文件守护配置安全：

- **棋子类型禁用国际象棋术语**：`type` 字段 `not.enum: ["pawn","rook","knight","bishop","queen","king"]`，必须用 `chariot/horse/elephant/advisor/general/cannon/soldier`
- **开放扩展**：`custom_properties` 和 `additionalProperties: true` 为 AI 留足创造空间
- **结构约束**：`position` 为非负整数数组，`side` 限定 `red/black`，`is_alive` 为布尔

---

## 六道众生

运行 `python main.py` 后，总坛界面在 `http://localhost:8080/` 自动唤起，展示六道棋境入口：

| 道 | 棋类 | 端口 | 特色 |
|----|------|------|------|
| 人界 | 无限制象棋 | 8000 | 楚河汉界，AI 实时改写走法与胜负 |
| 天界 | 无限制五子棋 | 8001 | 五连登仙，规则只在一句话之间 |
| 阿修罗 | 无限制围棋 | 8002 | 十九路混沌，气/劫/提子皆可重写 |
| 畜生界 | 无限制动物棋 | 8003 | 斗兽丛林，突破等级与水域枷锁 |
| 饿鬼界 | 无限制跳棋 | 8004 | 六角星途，连跳奔袭无止境 |
| 地狱界 | 无限制黑白棋 | 8005 | 阴阳翻转，大模型赋予地狱规则 |

---

## 成就系统

37 个创意成就等待解锁，存档保存在 `achievements.json`：

| 分类 | 代表成就 |
|------|---------|
| 棋盘操控 | 十面埋伏、调色板、现实宝石、我超，原、草坪派对 |
| AI 创造 | 克隆战争、动物园、炼金术士、好家伙 |
| 规则破坏 | 无法无天、改写命运、上帝之手 |
| AI 对话 | 你在干嘛、报身份证号、话痨、这波是肉身开团 |
| 机制 | 停战协议、夺舍、开摆、分身术、我不做人了 |
| 游戏事件 | 就这？、受苦、我大意了啊、五子棋？ |
| 消耗 | 你币没了、钞能力 |
| 元成就 | 六道轮回、收藏家、成就党、全图鉴 |

成就分普通/稀有/传说三档稀有度，触发时游戏内弹窗提醒，成就殿堂页面高亮显示。

---

## 快速开始

### 环境要求

- Python 3.8+
- DeepSeek API Key（或其他 OpenAI 兼容接口）

### 安装

```bash
pip install -r requirements.txt
```

### 配置

编辑 `config.json`：

```json
{"api_key": "sk-your-deepseek-api-key"}
```

### 启动

```bash
python main.py
```

浏览器自动打开 `http://localhost:8080/`，点击任意棋境入口开始游玩。也可加 `--no-browser` 跳过自动打开。

---

## 项目结构

```
chesssage/
├── main.py                      # 统一启动器 + Hub 后端 + 成就 API
├── config.json                  # 全局 API 密钥
├── achievements.json            # 成就物理存档（运行时生成）
├── requirements.txt
│
├── hub/                         # 六道众生总坛
│   ├── index.html               # 首页（六道入口 + 成就横幅）
│   ├── achievements.html        # 成就殿堂页面
│   ├── app.js / style.css       # 首页逻辑与样式
│   ├── achievements.js / .css   # 成就页面逻辑与样式
│
├── shared/                      # 共享模块
│   ├── achievement_checker.js   # 成就检测前端模块（各游戏加载）
│   ├── json_patch_utils.py      # RFC 6902 JSON Patch 实现
│   ├── schema_validator.py      # JSON Schema 校验
│   └── schemas/                 # 配置文件 Schema 定义
│
├── xiangqi/                     # 无限制象棋（端口 8000）
├── wuziqi/                      # 无限制五子棋（端口 8001）
├── weiqi/                       # 无限制围棋（端口 8002）
├── dongwuqi/                    # 无限制动物棋（端口 8003）
├── tiaoqi/                      # 无限制跳棋（端口 8004）
├── heibaiqi/                    # 无限制黑白棋（端口 8005）
│
└── 每个棋类目录结构相同：
    ├── main.py                  # FastAPI 路由（走棋/指令/配置）
    ├── ai_orchestrator.py       # 两级 AI 编排器
    ├── chess_ai.py              # AI 走棋算法
    ├── rule_engine.py           # 规则引擎（原语解析）
    ├── mechanism_engine.py      # 机制引擎（A2 类执行）
    ├── prompts.py               # System Prompts（原语手册/分类/Patch）
    ├── configs/                 # 6 个 JSON 配置 + initial/ 备份
    └── static/                  # 前端（Web Component + Shadow DOM）
        ├── index.html
        ├── app.js
        └── style.css
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | 原生 Web Components + Shadow DOM，无框架依赖 |
| 后端 | FastAPI + Uvicorn，每棋类独立进程 |
| AI | DeepSeek（deepseek-chat），两级流水线 |
| 配置修改 | RFC 6902 JSON Patch + JSON Schema 校验 |
| 总坛 | FastAPI 单服务，彩色日志，一键拉起全部子进程 |

---

## 许可证

MIT License

---

**棋圣 ChessSage** · 灵活编码 Flexible Coding · 六道众生
