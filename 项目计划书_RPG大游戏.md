# 棋圣 (ChessSage) - 项目计划书：RPG 大游戏

> **将「无限制棋类元引擎」改造为一款融合剧情、大地图、多种棋类的 RPG 大游戏。**
> 玩家扮演一名觉醒了"棋圣系统"的 16 岁高中生，在课间被同学虐哭后穿越至棋圣世界，
> 通过无限制作弊（多层 AI 协作）击败各路强敌，最终成为"棋圣"。

**版本**: v1.0（RPG 化首版计划）
**日期**: 2026-07-18
**作者**: 用户（世界观与玩法愿景） + AI（架构与实现规划）
**前置阅读**: [README.md](./README.md) · [无限制象棋_完整计划书_v4.0.md](./无限制象棋_完整计划书_v4.0.md) · [story-editor/docs/integration_guide.md](./story-editor/docs/integration_guide.md)

---

> ## ⚠️ v1.1 修订说明（2026-07-18）
>
> 本文件以下章节已过时，**实际执行以 [`执行方案.md`](./执行方案.md) 为准**。下方正文保留作历史参考。
>
> | 章节 | 过时内容 | 修订后 |
> |---|---|---|
> | 2.3 主线剧情大纲 | 4 种棋类混用 + 棋圣塔 99 层 | 3 种传统棋类（象棋/五子棋/围棋）均衡分配，6 场对战，约 65 分钟 |
> | 3.2.2 识破概率公式 | 含"现实扭曲"减免项 | 删除减免项，改为单调递增，封顶 95% |
> | 3.3.1 限制维度第 2 项 | 冷却回合设计 | 删除，能量条机制足够 |
> | 4.2.1 主角属性 | 现实扭曲（RealityWarp）属性 | 删除该属性 |
> | 4.3 道具系统 | 5 种道具（能量药剂/幸运币等） | 全部删除，聚焦核心玩法 |
> | 4.4 经济系统 | 金币/棋魂/剧情物品 | 全部删除 |
> | 5.1 整体技术栈 | PixiJS（地图渲染） | 用原生 SVG/Canvas，不引入 2D 引擎 |
> | 6.1 目录结构 | 独立 rpg/ 子项目 + iframe 嵌入 | 改为 Option A（RPG 外壳 + iframe + 严格 postMessage 协议） |
> | 8.4 阶段四 新棋类 | 列为长远目标 | 围棋（9×9 简化版）提前到 demo 阶段实现 |
>
> **核心机制修订**：
> - 能量条：100 上限，30 门槛，起始 0，可透支，AI 评估消耗
> - 识破概率：0 起步，只增不减，全局变量，影响结局而非当前对战
> - 吃子加能量：+10（吃子）/ +5（被吃）
> - "AI 助手" 更名为"棋圣系统"
> - 对手合理化台词：作弊成功后必须触发（预脚本模板，不用 AI 生成）
>
> 详见 [`执行方案.md`](./执行方案.md)。

---

## 目录

1. [项目愿景与核心理念](#1-项目愿景与核心理念)
2. [游戏世界观与剧情大纲](#2-游戏世界观与剧情大纲)
3. [核心玩法设计](#3-核心玩法设计)
4. [RPG 系统设计](#4-rpg-系统设计)
5. [技术架构与栈选型](#5-技术架构与栈选型)
6. [详细模块设计](#6-详细模块设计)
7. [美术与音频资源规划](#7-美术与音频资源规划)
8. [开发路线图](#8-开发路线图)
9. [风险与挑战](#9-风险与挑战)
10. [附录：技术决策与替代方案](#10-附录技术决策与替代方案)

---

## 1. 项目愿景与核心理念

### 1.1 一句话定位

> **「以作弊取胜的剧情向棋类 RPG」**：玩家不能正面赢，但可以通过"棋圣系统"在场外动手脚——
> 修改规则、操控对手认知、改写胜负条件，最终在没人察觉的情况下登顶棋圣。

### 1.2 核心创新点（与原象棋项目的关系）

| 原项目能力 | RPG 化后的角色 |
|---|---|
| 自然语言指令修改规则 | **棋圣系统的核心作弊能力**：玩家"许愿"，AI"实现" |
| 二级 AI 协作（意图解析 + 代码生成） | 棋圣系统的"内脑"：第一级是人格化导师，第二级是底层代码生成器 |
| 5 种机制原语（skip/ai_control/random/extra/move_limits） | 玩家可装备的"作弊技能"，每次对战有限次使用 |
| AI 性格系统（aggressive/defensive/random/custom） | 不同对手的"AI 人格"——激进型对手会主动进攻，狂徒型会随机走棋 |
| jump/ray 双原子规则引擎 | 元引擎保证：BOSS 可定制任意棋类规则 |
| 剧情编辑器 VisualNovelPlayer | RPG 过场动画 / 对话演出引擎 |
| 共享角色资产（boy / robot） | 主角立绘 / 棋圣系统 AI 立绘 |

### 1.3 设计哲学（继承自原项目）

- **🌟 灵活编码（最高纲领）**：所有新玩法（新棋类、新作弊技能、新对手规则）都尽量通过 AI 现场生成代码实现，而非硬编码。RPG 框架本身可以是硬编码，但**棋类内容与作弊实现保持灵活**。
- **作弊是玩法而非Bug**：玩家"作弊"被包装为"棋圣系统的超能力"，每次使用都有代价（能量、被发现风险）。
- **元引擎保证**：任何棋类（象棋、五子棋、围棋、国际象棋、自定义棋）都能装载为关卡，规则可被 AI 现场改写。
- **剧情驱动**：所有棋局都有叙事目的——为复仇、为救人、为挑战。绝不只是"再来一局"。

---

## 2. 游戏世界观与剧情大纲

### 2.1 主角设定

| 字段 | 设定 |
|---|---|
| 姓名 | 默认"林弈"（玩家可改） |
| 年龄 | 16 岁 |
| 身份 | 普通高中一年级学生 |
| 性格 | 倔强、好胜、但棋力平庸 |
| 背景 | 课间被同桌连虐十几把五子棋，气得晕倒，醒来觉醒棋圣系统 |
| 立绘 | `shared/assets/characters/boy/` 已生成的 18 张表情 |

### 2.2 棋圣系统设定

**棋圣系统**是寄宿在主角意识中的 AI 实体，外观为一个像素机器人（`shared/assets/characters/robot/` 已生成的 17 张表情）。

| 能力 | 描述 | 对应原项目模块 |
|---|---|---|
| **意识对话** | 系统作为"导师"角色与主角对话，提供建议、解说规则、嘲讽对手 | VisualNovelPlayer |
| **规则改写** | "许愿"修改棋盘/棋子/规则 | B/C/C+ 类 CodeAI |
| **机制操控** | 冻结对手、AI 接管、随机走棋、额外回合、步数限制 | A2 类机制引擎 |
| **现实扭曲** | 修改对手认知，让对手不会察觉主角作弊 | 剧情包装（无实际功能） |
| **AI 性格预判** | 分析对手的 AI 性格（aggressive/defensive/random），给出克制建议 | AI 性格系统 |

**核心设定**：棋圣系统的所有作弊都在"现实层"和"认知层"同时生效——
对玩家来说作弊成功，对对手来说他以为自己的失误是合理的。这是世界观层面的"洗白"，让玩家安心作弊。

### 2.3 主线剧情大纲（章节制）

#### 第 0 章：觉醒（新手教程）

- **场景**：高中教室，课间
- **剧情**：主角连输 13 把五子棋给同桌小赵，气晕过去
- **觉醒**：醒来时脑中浮现棋圣系统，机器人导师登场
- **教程关卡**：
  1. 第一局五子棋（普通规则，玩家照常下，必输）→ 教玩家"系统作弊"的存在
  2. 第二局五子棋（系统教会玩家用 1 次"AI 接管"作弊）→ 玩家体验机制原语
  3. 第三局五子棋（系统教会玩家用 1 次"规则改写"——比如让黑子也能下一手）→ 玩家体验 B/C 类
- **章节结局**：系统发现主角有"作弊天赋"，传送至棋圣世界

#### 第 1 章：棋圣世界·入口城

- **场景**：棋圣世界的新手村「棋源城」
- **目标**：通过 3 个 NPC 的考验获得"棋徒"资格
- **棋类**：象棋（简单规则）、五子棋（变体规则）、自定义小棋
- **首次出现**：作弊能量条（每局有限次作弊）

#### 第 2 章：四方棋院（中段）

- **场景**：四大棋院分别专精一种棋类
  - 車院（象棋）
  - 子院（五子棋）
  - 星院（围棋——未来添加）
  - 异院（自定义棋）
- **每院一位 BOSS**，规则不同：
  - 車院 BOSS：象棋，但 BOSS 棋力远超玩家 → 必须靠作弊
  - 子院 BOSS：五子棋，规则是"六连才算赢" → 玩家要改规则回五连
  - 星院 BOSS：围棋简化版（9×9）→ 玩家要创造新棋子
  - 异院 BOSS：完全自定义棋类（AI 现场生成）

#### 第 3 章：棋圣塔（终章）

- **场景**：棋圣塔 99 层，每层一个对手
- **特色**：每 10 层一个 mini-BOSS，每层规则不同
- **核心玩法**：玩家爬塔过程中作弊能量逐渐耗尽，需要管理资源

#### 第 4 章：最终 BOSS（同样会作弊）

- **BOSS 设定**：上一代棋圣，同样拥有"棋圣系统"
- **特色**：
  - BOSS 也会作弊——它会主动改写规则来针对玩家
  - 玩家需要先"识破"BOSS 的作弊（识别 AI 修改了哪些规则），再用更强的作弊反制
  - 这是一场"作弊对作弊"的巅峰对决
- **结局**：
  - **真结局**：完美识破并反制，BOSS 认输，传授棋圣称号
  - **普通结局**：硬撑到 BOSS 能量耗尽，勉强获胜
  - **坏结局**：作弊被识破（用得太频繁），被棋圣塔驱逐

### 2.4 多结局设计

| 结局 | 触发条件 | 描述 |
|---|---|---|
| 真结局 | 全程作弊被发现次数 ≤ 3 | 完美棋圣 |
| 普通结局 | 作弊被发现 4-10 次 | 阴影棋圣 |
| 坏结局 | 作弊被发现 > 10 次 | 被驱逐 |
| 隐藏结局 | 全程不使用任何作弊 | 真正的棋艺 |

> **"被发现次数"机制**：每次作弊有一个"识破概率"（基于作弊烈度、对手强度、累计使用次数）。这是 RPG 系统层的玩法，不影响棋局本身。

---

## 3. 核心玩法设计

### 3.1 三层玩法结构

```
┌────────────────────────────────────────────┐
│  外层：RPG 大地图探索（章节制）              │
│   走动、对话、接受任务、触发剧情              │
└────────────────┬───────────────────────────┘
                 │ 触发战斗
                 ▼
┌────────────────────────────────────────────┐
│  中层：棋局对战（核心）                       │
│   装载某种棋类 + 对手规则 + 玩家作弊技能      │
└────────────────┬───────────────────────────┘
                 │ 玩家求助系统
                 ▼
┌────────────────────────────────────────────┐
│  内层：棋圣系统作弊（AI 协作）                │
│   自然语言 → 意图解析 → 代码生成 → 应用修改    │
└────────────────────────────────────────────┘
```

### 3.2 棋类对战详细设计

#### 3.2.1 对战参数化

每场对战由一份「对战契约 (BattleContract)」JSON 定义：

```json
{
  "battle_id": "ch01_wuziqi_tutorial_2",
  "chapter": 1,
  "scene": "棋源城·棋徒考验",

  "chess_type": "wuziqi",          // 装载哪个子项目：xiangqi/wuziqi/...
  "board_config": "configs/board.json",  // 棋盘配置（覆盖默认）
  "rules_overrides": {              // 规则覆盖（开局即生效）
    "win_conditions": {"five_in_a_row": {"length": 6}}  // 六连才算赢
  },

  "opponent": {
    "name": "棋徒甲",
    "ai_personality": "aggressive",  // AI 性格
    "ai_difficulty": "medium",
    "portrait": "characters/oldman/",
    "catch_cheat_chance": 0.15       // 识破作弊的基础概率
  },

  "player_constraints": {
    "cheat_energy": 5,              // 本局可消耗的作弊能量
    "disabled_cheats": ["ai_control"],  // 本局禁用的作弊类型
    "forced_rules": []              // 强制生效的规则（玩家不能改）
  },

  "win_condition": "default",       // 默认胜利条件
  "lose_condition": "default",      // 默认失败条件
  "rewards": {
    "energy": 2,
    "items": ["item_lucky_coin"],
    "story_progress": "ch01_complete"
  }
}
```

**优势**：每场对战只需改 JSON，剧情策划（用户）可独立编写，不需要写代码。
**实现路径**：在 RPG 后端添加 `/api/battle/start` 接口，根据契约装载对应子项目的引擎。

#### 3.2.2 玩家作弊技能（基于机制引擎）

将原项目的 5 种机制原语包装为玩家可装备的"技能"：

| 技能 | 原语 | 效果 | 能量消耗 | 识破概率加成 |
|---|---|---|---|---|
| **冰封** | skip_turns | 跳过对手 N 回合 | 2/回合 | +15% |
| **附身** | ai_control | AI 接管对手 N 步 | 3/步 | +25% |
| **混沌** | random_moves | 对手随机走棋 | 1/步 | +10% |
| **时停** | extra_turns | 玩家获得额外回合 | 2/回合 | +20% |
| **限制** | move_limits | 限制对手每回合步数 | 1/步 | +5% |
| **改写** | C 类 CodeAI | 修改棋子规则 | 3/次 | +30% |
| **添加** | B 类 CodeAI | 添加/移动棋子 | 4/次 | +40% |
| **创造** | C+ 类 CodeAI | 创造新棋子 | 5/次 | +50% |
| **美化** | D 类 CodeAI | 修改界面（仅供娱乐） | 0/次 | 0% |

**识破概率公式**：
```
识破概率 = 对手基础识破率 + 累计作弊烈度 × 烈度系数 - 当前关卡的"现实扭曲"加成
```

> 现实扭曲加成：玩家越深入剧情，棋圣系统的"扭曲现实"能力越强，识破率越低。这是 RPG 养成的体现。

#### 3.2.3 对手规则定制（剧情驱动）

每个对手的"规则怪癖"由剧情决定，**用户未来会写详细策划案**。本计划书提供示例：

| 对手 | 棋类 | 规则怪癖 | 剧情动机 |
|---|---|---|---|
| 同桌小赵 | 五子棋 | 标准规则 | 觉醒前磨砺主角 |
| 棋徒甲 | 五子棋 | 六连才算赢 | 入门考验 |
| 車院 BOSS | 象棋 | 玩家不能悔棋 | 严格棋德考验 |
| 子院 BOSS | 五子棋 | BOSS 每回合走两步 | 高强度对抗 |
| 星院 BOSS | 9×9 围棋 | 谁先占 30 子谁赢 | 改变胜利条件 |
| 异院 BOSS | AI 现场生成 | 规则每 5 回合重置 | 终极变化 |
| 棋圣塔 99 层 | 任意 | 玩家不知道是什么棋 | 神秘感 |
| 最终 BOSS | 象棋 | BOSS 也会作弊 | 巅峰对决 |

### 3.3 AI 使用限制（核心系统）

**关键设计**：玩家的"棋圣系统"AI 不是无限使用的，每场对战有限制。

#### 3.3.1 限制维度

1. **能量条（Energy）**：每个作弊技能消耗能量，能量条空了就不能再作弊
2. **冷却回合（Cooldown）**：同一种作弊技能不能连续使用
3. **识破阈值（Suspicion）**：累计识破值达到阈值则直接判负
4. **指令次数（Tokens）**：单局允许的 AI 调用次数（呼应原项目的 Token 统计）
5. **被禁用类型（Disabled）**：部分对战禁用某些作弊类型（强制玩家用其他策略）

#### 3.3.2 难度调节

| RPG 难度 | 初始能量 | 识破阈值 | 被禁用 |
|---|---|---|---|
| 故事模式 | 10 | 5 | 无 |
| 标准 | 5 | 3 | "创造" |
| 挑战 | 3 | 2 | "创造"、"改写" |
| 真棋圣 | 1 | 1 | 除"美化"外全部禁用 |

---

## 4. RPG 系统设计

### 4.1 大地图系统

#### 4.1.1 地图结构

采用 **节点式大地图**（参考《火焰纹章》的章节地图）：

- 每个章节一张大地图，地图上有若干**节点**
- 节点类型：剧情节点 / 战斗节点 / 商店节点 / 隐藏节点
- 玩家点击节点即可移动（不需要自由走动）
- 每个节点触发对应事件

**优势**：
- 实现简单（SVG 即可）
- 节点之间的过渡天然适合 VisualNovelPlayer 演出
- 与剧情章节制完美契合

**未来扩展**：可升级为 2D 自由探索大地图（用 PixiJS / Phaser）。

#### 4.1.2 地图数据结构

```json
{
  "chapter_id": "ch01",
  "title": "棋源城",
  "background": "bg/qiyuan_city.png",
  "nodes": [
    {
      "id": "node_start",
      "type": "story",
      "position": [100, 200],
      "story_event": "ch01_intro",
      "next": ["node_tavern"]
    },
    {
      "id": "node_tavern",
      "type": "battle",
      "position": [300, 200],
      "battle_contract": "ch01_battle_01",
      "next": ["node_shop", "node_master"]
    },
    {
      "id": "node_shop",
      "type": "shop",
      "position": [300, 350],
      "shop_items": ["item_energy_potion", "item_lucky_coin"]
    },
    {
      "id": "node_master",
      "type": "battle",
      "position": [500, 200],
      "battle_contract": "ch01_battle_boss",
      "next": ["node_end"]
    },
    {
      "id": "node_end",
      "type": "story",
      "position": [700, 200],
      "story_event": "ch01_end",
      "next_chapter": "ch02"
    }
  ]
}
```

### 4.2 角色养成系统

#### 4.2.1 主角属性

| 属性 | 影响 |
|---|---|
| 棋艺（ChessSkill） | 影响开局阵型优劣（高棋艺有更好的开局） |
| 系统亲和（SystemAffinity） | 影响每次作弊的能量消耗（高亲和 → 低消耗） |
| 现实扭曲（RealityWarp） | 影响识破概率（高扭曲 → 低识破） |
| 智谋（Wisdom） | 影响剧情对话选项的可用性 |

#### 4.2.2 经验与升级

- 每场对战胜利获得经验
- 升级时获得属性点（玩家分配）
- 每章结束时获得"棋圣印记"（强化棋圣系统）

### 4.3 道具系统

| 道具 | 效果 | 获取 |
|---|---|---|
| 能量药剂 | 恢复 3 点作弊能量 | 商店购买 |
| 幸运币 | 降低下次作弊的识破概率 50% | 隐藏节点 |
| 规则手册 | 允许本场对战多使用 1 次"改写" | 任务奖励 |
| 双面镜 | 复制对手的作弊技能（仅 BOSS 战） | BOSS 掉落 |
| 棋圣印记 | 永久增加 1 点最大能量 | 章节奖励 |

### 4.4 经济系统

- **金币**：战胜对手获得，用于购买道具
- **棋魂**：稀有货币，用于升级棋圣系统，仅 BOSS 战掉落
- **剧情物品**：不可交易，触发剧情用

### 4.5 存档系统

```json
{
  "save_id": "save_001",
  "timestamp": "2026-07-18T12:00:00",
  "player": {
    "name": "林弈",
    "level": 5,
    "attributes": {"chess_skill": 3, "system_affinity": 5, ...},
    "inventory": [...]
  },
  "progress": {
    "current_chapter": "ch02",
    "current_node": "node_tavern",
    "completed_battles": ["ch01_battle_01", ...],
    "story_flags": {"first_cheat_used": true, ...}
  },
  "stats": {
    "total_cheats_used": 23,
    "times_caught": 2,
    "battles_won": 8,
    "battles_lost": 1
  }
}
```

存档采用 JSON 文件存储在 `saves/` 目录，支持多存档槽。

---

## 5. 技术架构与栈选型

### 5.1 整体技术栈

| 层 | 技术 | 理由 |
|---|---|---|
| **RPG 前端框架** | 原生 HTML/CSS/JS + PixiJS（地图渲染） | 沿用项目现有架构，AI 易生成代码；PixiJS 是轻量 2D 渲染库 |
| **RPG 前端 UI** | 原生 DOM + CSS 变量 | 与象棋前端一致，避免引入 React/Vue 增加复杂度 |
| **棋类对战** | iframe 嵌入现有 xiangqi / wuziqi | 子项目完全复用，零改动 |
| **剧情演出** | iframe 嵌入 story-editor 的 VisualNovelPlayer | 已设计的可独立嵌入播放引擎 |
| **后端** | Python FastAPI | 沿用现有后端，新增 RPG API 路由 |
| **AI 层** | DeepSeek API（继承原项目） | 棋圣系统作弊直接调用现有 ai_orchestrator |
| **存储** | JSON 文件 + 内存状态 | 沿用现有架构，简单可靠 |
| **构建** | 无打包工具，原生 ES Modules | 与项目"AI 灵活编码"理念一致 |

### 5.2 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                         浏览器 / RPG 主前端                       │
│                                                                   │
│  ┌─────────────┐  ┌──────────────────────────────────────────┐  │
│  │  RPG Shell  │  │  对战模式（覆盖层）                       │  │
│  │             │  │                                          │  │
│  │ • 大地图    │  │  ┌──────────────────────────────────┐   │  │
│  │ • 主菜单    │  │  │ iframe: xiangqi/static/ 或        │   │  │
│  │ • 角色面板  │  │  │         wuziqi/static/            │   │  │
│  │ • 存档管理  │  │  │ + 棋圣系统作弊侧栏                │   │  │
│  │ • 道具栏    │  │  │ + 能量/识破进度条                 │   │  │
│  │             │  │  └──────────────────────────────────┘   │  │
│  └─────────────┘  └──────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  剧情演出层（覆盖整个屏幕）                                │   │
│  │  iframe: story-editor/modules/preview.js (VisualNovelPlayer)│   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTP
┌─────────────────────────────▼─────────────────────────────────────┐
│                     RPG 后端 (FastAPI)                            │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │  RPG API         │  │  转发到子项目 API                       │ │
│  │  /api/save       │  │  /api/battle/start                    │ │
│  │  /api/load       │  │     → 装载 battle_contract             │ │
│  │  /api/chapter    │  │     → 调用 xiangqi 或 wuziqi 的引擎     │ │
│  │  /api/inventory  │  │  /api/cheat/use                       │ │
│  │  /api/character  │  │     → 调用 ai_orchestrator.process_cmd  │ │
│  └──────────────────┘  └──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 关键技术决策

#### 5.3.1 为什么用 iframe 嵌入棋类对战？

**优点**：
1. **零改动复用**：xiangqi/ 和 wuziqi/ 子项目完全不需要改动，直接 iframe 嵌入
2. **解耦**：RPG 框架与棋类引擎完全独立，未来新增棋类只需新增子项目
3. **AI 易生成**：iframe 通信通过 postMessage，逻辑简单
4. **故障隔离**：棋类前端崩溃不影响 RPG 主框架

**缺点与对策**：
- 通信复杂度：通过 postMessage 协议化通信（详见 6.4）
- 样式不一致：通过 URL 参数注入主题（`?theme=rpg`）

#### 5.3.2 为什么不引入 React/Vue/Phaser？

- 项目核心理念是"灵活编码"——AI 生成代码。React/Vue 的 JSX/SFC 模板对 AI 不友好
- PixiJS 是命令式 API，比 Phaser 更适合 AI 现场生成代码
- 原生 JS + ES Modules 已足够实现 RPG（参考无数独立游戏）
- 避免构建工具链（webpack/vite）增加 AI 生成代码的门槛

#### 5.3.3 为什么 RPG 后端不另起项目？

- 共享 ai_orchestrator：作弊功能直接调用现有 AI 编排器
- 共享 schema_validator / json_patch_utils：存档校验和作弊修改用同一套
- 共享角色资产：避免重复
- 通过 FastAPI 的 `include_router` 把 RPG 路由挂到主应用

---

## 6. 详细模块设计

### 6.1 RPG 主框架目录结构（新增）

```
/workspace/
├── rpg/                            ← 新增：RPG 主框架
│   ├── main.py                     ← RPG FastAPI 入口（端口 8002）
│   ├── battle_loader.py            ← 对战契约装载器
│   ├── cheat_engine.py             ← 作弊技能系统（包装 mechanism_engine）
│   ├── save_manager.py             ← 存档管理
│   ├── chapter_data/               ← 章节剧情数据
│   │   ├── ch00_awakening.json     ← 觉醒章
│   │   ├── ch01_qiyuan.json        ← 棋源城
│   │   └── ...
│   ├── battle_contracts/           ← 对战契约
│   │   ├── ch00_wuziqi_01.json
│   │   └── ...
│   ├── saves/                      ← 存档目录
│   └── static/                     ← RPG 前端
│       ├── index.html              ← RPG 主页
│       ├── rpg-shell.js            ← RPG 外壳
│       ├── map-renderer.js         ← 大地图渲染（PixiJS）
│       ├── battle-overlay.js       ← 对战覆盖层（iframe 通信）
│       ├── story-player.js         ← VisualNovelPlayer 封装
│       ├── save-ui.js              ← 存档 UI
│       └── style.css
```

### 6.2 RPG 后端 API

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/` | RPG 主页 |
| GET | `/api/chapter/{chapter_id}` | 获取章节地图数据 |
| GET | `/api/battle_contract/{battle_id}` | 获取对战契约 |
| POST | `/api/battle/start` | 启动对战（装载子项目引擎） |
| POST | `/api/battle/end` | 结束对战（计算奖励、识破概率） |
| POST | `/api/cheat/use` | 使用作弊技能（调用 ai_orchestrator） |
| GET | `/api/cheat/status` | 获取当前作弊状态（能量、识破值） |
| GET | `/api/save/list` | 列出存档 |
| POST | `/api/save/load` | 加载存档 |
| POST | `/api/save/write` | 写入存档 |
| GET | `/api/character/{char_id}` | 获取角色信息（透传到 story-editor API） |

### 6.3 战斗流程详细设计

```
1. 玩家点击地图上的 battle 节点
   ↓
2. RPG 后端 GET /api/battle_contract/{id}
   → 返回 BattleContract JSON
   ↓
3. RPG 前端显示"对战开始"过场（VisualNovelPlayer 演出对手介绍）
   ↓
4. RPG 前端创建 iframe，src 指向对应子项目：
   http://localhost:8000/?battle_mode=rpg&contract_id=ch01_battle_01
   ↓
5. iframe 内的子项目（如 wuziqi）读取 URL 参数：
   - battle_mode=rpg：启用 RPG 模式
   - contract_id=xxx：从 RPG 后端拉取对战契约
   - 应用 rules_overrides 和 player_constraints
   - 隐藏自身的"自然语言输入框"，改由 RPG 外壳的"棋圣系统作弊"按钮触发
   ↓
6. 玩家在对战中点击"棋圣系统"按钮
   → RPG 外壳弹出"作弊对话框"
   → 玩家输入作弊指令
   → RPG 后端 /api/cheat/use
   → 后端调用 ai_orchestrator.process_command()
   → 通过 postMessage 把结果发回 iframe
   → iframe 内的子项目应用修改
   ↓
7. 对战结束（一方胜利）
   → iframe 通过 postMessage 通知 RPG 外壳
   → RPG 外壳调用 /api/battle/end
   → 后端计算奖励、识破概率、剧情推进
   → RPG 外壳显示"对战结束"过场
   → 返回大地图
```

### 6.4 iframe 通信协议

定义一套 postMessage 协议，规范 RPG 外壳与棋类 iframe 的通信：

```typescript
// RPG 外壳 → iframe
{
  type: "RPG_CONFIG",
  contract_id: "ch01_battle_01",
  rules_overrides: {...},
  player_constraints: {...},
  theme: "rpg"
}

// RPG 外壳 → iframe（应用作弊结果）
{
  type: "APPLY_CHEAT",
  patch: [...],  // JSON Patch 数组
  target_config: "pieces_red" | "board_state" | ...
}

// iframe → RPG 外壳（对战结束）
{
  type: "BATTLE_END",
  winner: "player" | "opponent",
  moves_count: 23,
  cheats_used: 4,
  duration_sec: 312
}

// iframe → RPG 外壳（请求作弊）
{
  type: "REQUEST_CHEAT",
  current_state: {...}  // 当前棋盘状态快照
}
```

子项目需要少量改动以支持 RPG 模式（详见 8.1 阶段一）。

### 6.5 棋圣系统作弊对话框

RPG 外壳提供一个作弊侧栏，玩家可以：
1. **快捷作弊**：点击预设按钮使用技能（冰封/附身/混沌等）
2. **自由作弊**：输入自然语言指令（调用原 ai_orchestrator）
3. **查看状态**：当前能量、识破值、已用技能、对手 AI 性格分析

UI 草图：
```
┌────────────────────────────────────────┐
│ 当前对战：象棋 vs 車院 BOSS           │
│ 能量：████░░░░ 3/8   识破：░░ 0/3      │
│                                        │
│ ┌──[棋圣系统作弊]──────────────────┐  │
│ │ [冰封 2⚡] [附身 3⚡] [混沌 1⚡]  │  │
│ │ [时停 2⚡] [限制 1⚡] [改写 3⚡]  │  │
│ │ [添加 4⚡] [创造 5⚡] [美化 0⚡]  │  │
│ │                                  │  │
│ │ 自由指令：[_____________] [发送] │  │
│ └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

---

## 7. 美术与音频资源规划

### 7.1 美术资源

| 类型 | 来源 | 需要新增 |
|---|---|---|
| 主角立绘 | `shared/assets/characters/boy/` (18 张已生成) | 后期可加更多表情 |
| 棋圣系统立绘 | `shared/assets/characters/robot/` (17 张已生成) | 后期可加更多表情 |
| 对手立绘 | 现有 2 个角色 | 每章 3-5 个新角色，用 story-editor 的 AI 生成器批量生成 |
| 大地图背景 | story-editor 的 PRESET_BGS (7 种) | 每章 1-2 张专属背景 |
| 棋盘皮肤 | 沿用现有 xiangqi/wuziqi 主题 | RPG 主题（深色+发光风格） |
| UI 图标 | 简单 SVG 即可 | 用 Emoji 或 Lucide Icons |

### 7.2 音频资源（可选，后期添加）

- BGM：每章一首主题曲（可用 AI 生成，如 Suno）
- 音效：作弊成功音、识破警报音、对战胜利音
- 语音：关键剧情可选配音（用 TTS 生成）

---

## 8. 开发路线图

### 8.1 阶段一：MVP（最小可玩 Demo）

**目标**：完成觉醒章（第 0 章），玩家能体验从觉醒到第一场作弊对战的全流程。

**任务清单**：

- [ ] 创建 `rpg/` 目录结构
- [ ] `rpg/main.py`：基础 FastAPI 入口
- [ ] `rpg/save_manager.py`：JSON 存档系统
- [ ] `rpg/static/index.html`：RPG 主页（占位）
- [ ] `rpg/static/rpg-shell.js`：基础外壳（菜单、存档、章节选择）
- [ ] `rpg/static/battle-overlay.js`：iframe 嵌入对战 + postMessage 通信
- [ ] `rpg/static/story-player.js`：封装 VisualNovelPlayer
- [ ] `rpg/static/style.css`：RPG 主题样式
- [ ] `rpg/battle_loader.py`：对战契约装载器
- [ ] `rpg/cheat_engine.py`：作弊技能系统（包装现有 mechanism_engine）
- [ ] `chapter_data/ch00_awakening.json`：第 0 章地图
- [ ] `battle_contracts/ch00_*.json`：3 场教程对战契约
- [ ] **子项目改动**：在 `xiangqi/main.py` 和 `wuziqi/main.py` 添加 RPG 模式支持
  - 读取 URL 参数 `battle_mode=rpg`
  - 接收 postMessage 配置
  - 隐藏自然语言输入框（由 RPG 外壳接管）
  - 对战结束发送 postMessage 通知

### 8.2 阶段二：内容扩展

**目标**：完成第 1-2 章（棋源城 + 四方棋院），具备完整 RPG 玩法循环。

**任务清单**：

- [ ] 第 1 章：棋源城（5 个节点，3 场对战，1 个商店）
- [ ] 第 2 章：四方棋院（4 个分支，4 个 BOSS）
- [ ] 角色养成系统（属性、经验、升级）
- [ ] 道具系统（5 种基础道具）
- [ ] 商店系统
- [ ] 多结局判定逻辑
- [ ] 至少 10 个对手角色（用 AI 生成立绘）
- [ ] BGM 系统（章节主题曲）

### 8.3 阶段三：完整游戏

**目标**：完成第 3-4 章（棋圣塔 + 最终 BOSS），游戏可发布。

**任务清单**：

- [ ] 第 3 章：棋圣塔 99 层（程序化生成 + 精心设计的 BOSS 层）
- [ ] 第 4 章：最终 BOSS 战（BOSS 也会作弊）
- [ ] 4 种结局的全部内容
- [ ] 隐藏结局：全程不使用任何作弊
- [ ] 章节切换动画
- [ ] 存档导入/导出
- [ ] 设置菜单（音量、难度切换、AI Key 配置）
- [ ] 完整剧情文案（用户撰写策划案）
- [ ] Steam/Launcher 打包（可选）

### 8.4 阶段四：长远扩展

- [ ] 新棋类子项目：围棋、国际象棋、自定义棋
- [ ] 多人对战模式（原项目计划中的 WebSocket）
- [ ] MOD 系统（玩家自定义章节）
- [ ] 移动端适配
- [ ] 国际化（多语言）

---

## 9. 风险与挑战

### 9.1 技术风险

| 风险 | 等级 | 应对 |
|---|---|---|
| iframe 通信复杂度 | 中 | 定义清晰的 postMessage 协议；提供测试夹具 |
| AI 调用延迟影响对战体验 | 高 | 异步处理；UI 显示"棋圣系统思考中..."；缓存常见作弊 |
| Token 成本控制 | 中 | 沿用现有 token_stats 监控；RPG 难度调节限制调用次数 |
| 棋类引擎的 RPG 模式适配 | 中 | 子项目改动最小化（仅 main.py 添加 URL 参数处理） |
| 大量 JSON 数据维护 | 中 | 提供 JSON 编辑器辅助（已有 story-editor 模式） |

### 9.2 设计风险

| 风险 | 等级 | 应对 |
|---|---|---|
| 作弊玩法可能让游戏太简单 | 高 | 引入"识破"机制；BOSS 也会作弊；难度调节 |
| 多种棋类学习成本 | 中 | 每章引入一种新棋类；新手教程充分 |
| 剧情与玩法的平衡 | 中 | 章节制控制节奏；剧情可跳过 |
| AI 生成内容的质量参差 | 中 | 关键规则改动硬编码；剧情由人工撰写 |

### 9.3 资源风险

| 风险 | 等级 | 应对 |
|---|---|---|
| 美术资源不足 | 中 | 复用现有 boy/robot 资产；AI 批量生成新角色 |
| 开发者精力 | 高 | 分阶段发布；社区贡献（开源） |

---

## 10. 附录：技术决策与替代方案

### 10.1 替代方案对比

#### 方案 A：Phaser 全栈 RPG（已否决）

**优点**：完整的 2D 游戏引擎，原生支持精灵、物理、动画
**缺点**：
- 学习曲线陡峭，AI 难以生成符合 Phaser API 风格的代码
- 与现有 HTML/CSS/JS 子项目割裂
- 需要构建工具链

#### 方案 B：Electron 桌面应用（已否决）

**优点**：本地运行性能好，可访问文件系统
**缺点**：
- 部署复杂度增加
- 失去 Web 端的便捷性
- 与项目现有的 Web-first 架构冲突

#### 方案 C：纯 React + iframe（备选）

**优点**：组件化清晰，生态丰富
**缺点**：
- React 的 JSX 对 AI 生成代码不友好
- 增加构建步骤
- 与项目"原生 JS + ES Modules"理念不符

#### 方案 D（推荐）：原生 JS + PixiJS + iframe（本计划采用）

**优点**：
- 与现有架构一致
- AI 易于生成代码
- 子项目零改动复用
- 故障隔离

### 10.2 棋圣系统的"作弊烈度"算法（详细）

```python
def calculate_cheat_severity(cheat_type, current_state):
    """计算单次作弊的烈度分数（影响识破概率）"""
    base_severity = {
        "skip_turns": 3,       # 直接跳过对手回合
        "ai_control": 5,       # 接管对手
        "random_moves": 2,     # 让对手随机
        "extra_turns": 4,       # 玩家额外回合
        "move_limits": 2,      # 限制步数
        "rule_modify": 6,      # 修改规则
        "board_transform": 7,  # 棋盘变换
        "piece_create": 9,     # 创造新棋子
        "ui_modify": 0,        # 仅美化
    }[cheat_type]
    
    # 烈度调整：作弊前后局势变化越大，烈度越高
    severity_multiplier = compute_state_delta(current_state)
    
    return base_severity * severity_multiplier


def calculate_detection_probability(cheat_severity, battle_state):
    """计算本次作弊被识破的概率"""
    base = battle_state.opponent.catch_cheat_chance
    accumulated = battle_state.accumulated_suspicion
    reality_warp = battle_state.player.reality_warp_attribute / 100
    
    raw_prob = base + (cheat_severity * 0.02) + (accumulated * 0.01)
    final_prob = raw_prob * (1 - reality_warp)
    
    return min(final_prob, 0.95)  # 上限 95%
```

### 10.3 子项目 RPG 模式适配的最小改动

每个棋类子项目（xiangqi/wuziqi）需要在 `main.py` 和 `static/app.js` 添加少量代码：

**main.py 改动**：
```python
@app.get("/")
async def index(battle_mode: str = None, contract_id: str = None):
    """主页面，支持 RPG 模式参数"""
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    if battle_mode == "rpg":
        # 注入 RPG 模式标记
        html = html.replace(
            "<body>",
            f'<body data-rpg-mode="true" data-contract-id="{contract_id}">'
        )
    return HTMLResponse(html)

@app.post("/api/apply_external_patch")
async def apply_external_patch(patch: dict, target: str):
    """RPG 外壳通过此接口应用作弊 Patch（绕过自然语言 AI，直接应用）"""
    # 仅在 RPG 模式下启用
    # 应用 Patch 到对应配置
    ...
```

**app.js 改动**：
```javascript
// 检测 RPG 模式
const isRpgMode = document.body.dataset.rpgMode === "true";
const contractId = document.body.dataset.contractId;

if (isRpgMode) {
    // 1. 隐藏自然语言输入框（由 RPG 外壳接管）
    document.querySelector(".command-input-section").style.display = "none";
    
    // 2. 监听 RPG 外壳的 postMessage
    window.addEventListener("message", (event) => {
        if (event.data.type === "APPLY_CHEAT") {
            applyExternalPatch(event.data.patch, event.data.target_config);
        }
    });
    
    // 3. 对战结束时通知 RPG 外壳
    function notifyBattleEnd(winner) {
        window.parent.postMessage({
            type: "BATTLE_END",
            winner: winner === "red" ? "player" : "opponent",
            moves_count: moveHistory.length,
        }, "*");
    }
}
```

### 10.4 与原项目计划书的对应关系

| 原项目（v4.1）功能 | 在 RPG 中的角色 |
|---|---|
| 意图解析 AI（A/B/C/D/E 分类） | 棋圣系统的"自由指令"功能 |
| 5 种机制原语 | 玩家可装备的 5 种作弊技能 |
| AI 性格系统 | 不同对手的 AI 人格 |
| Token 统计 | RPG 的"作弊使用统计"（影响识破率） |
| 撤销栈 | 棋圣系统的"反悔"功能（限次数） |
| 自定义棋子（C+） | "创造"作弊技能 |
| HTML 区段替换（D2） | "美化"作弊技能（无影响） |
| 棋盘变换（B） | "添加"作弊技能 |
| 规则修改（C） | "改写"作弊技能 |
| 剧情编辑器 VisualNovelPlayer | RPG 过场动画引擎 |
| 角色立绘生成器 | RPG 角色美术生产工具 |

---

## 结语

这份计划书是对用户 RPG 化愿景的整理与扩充，核心思路是：

1. **保留**：原项目的所有"灵活编码"能力、二级 AI 协作、机制引擎、jump/ray 元引擎——这些是 RPG 玩法的根基。
2. **包装**：把原项目的"作弊能力"重新包装为"棋圣系统的超能力"，让作弊成为合法的 RPG 玩法。
3. **新增**：RPG 主框架（大地图、章节、养成、道具、存档），用最简实现（原生 JS + PixiJS + iframe）。
4. **不动**：子项目（xiangqi/wuziqi/story-editor）保持独立，仅做最小化 RPG 模式适配。
5. **延展**：用户的剧情策划案将作为"内容"注入到这套框架中。

**下一步行动建议**：
1. 用户开始撰写第 0 章的详细剧情策划案（含具体对话、对手设定、对战规则）
2. AI 团队按 8.1 阶段一开始实现 RPG MVP
3. 第一版 MVP 跑通后，根据实际体验调整本计划书

**联系与协作**：
- 技术问题：在本仓库 issue 中讨论
- 剧情策划：用户独立撰写，提交至 `rpg/chapter_data/` 与 `rpg/battle_contracts/`
- 美术资源：通过 `shared/assets/generate_all.py` 与 story-editor 的 AI 角色生成器生产

---

*本计划书版本 v1.0。后续随开发进展迭代更新。*
