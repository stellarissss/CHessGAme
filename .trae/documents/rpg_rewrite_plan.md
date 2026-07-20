# 棋圣RPG剧情重构计划

## 1. 项目调研结论

### 1.1 当前项目结构
项目是一个以"作弊取胜"为核心玩法的棋类RPG游戏，包含以下模块：
- **核心架构**：Web Components + ES Modules，三种棋类（象棋/五子棋/围棋）封装为自定义元素
- **剧情数据**：7个章节JSON文件（ch00-ch06），存储在 `rpg_data/chapters/`
- **角色资产**：主角（boy）18张立绘 + 棋圣系统（robot）17张立绘
- **场景资产**：8张章节背景图 + 5个图标 + 2个UI元素

### 1.2 当前剧情问题
当前剧情设定为"少年林弈深夜研究残局，梦境中觉醒棋圣系统"，与用户要求的新设定不符：
- 用户要求：16岁高中男生小明，课间和同学下五子棋连输十几把气晕，醒来觉醒棋圣系统
- 需要修改所有章节的背景、人物和对话内容

### 1.3 技术约束
- 不得修改游戏架构（Web Components + ES Modules）
- 不得重新设计教程、章节boss等核心玩法
- 仅重构所有剧情与人物
- 可使用Seedream模型生成新资产

## 2. 新剧情设定

### 2.1 主角设定
- **姓名**：小明
- **年龄**：16岁
- **身份**：普通高中一年级学生
- **性格**：好胜心强、倔强、棋力平庸但有潜力
- **背景**：课间被同桌连虐十几把五子棋，气得晕倒，醒来觉醒棋圣系统

### 2.2 棋圣系统设定
- 寄宿在主角意识中的AI实体
- 外观为未来科技风格的数字精灵
- 可以帮助主角在不被发现的情况下作弊
- 作弊有识破概率，影响最终结局

### 2.3 新章节大纲

| 章节 | 场景 | 内容 |
|------|------|------|
| ch00 | 高中教室 | 小明课间和同学下五子棋连输，气晕后觉醒棋圣系统 |
| ch01 | 教室/棋圣空间 | 与同学对战（教程），系统教作弊方法 |
| ch02 | 棋圣世界·新手村 | 被系统传送至棋圣世界，开始第一关 |
| ch03 | 棋圣世界·进阶区 | 围棋对战，学习更深的棋道 |
| ch04 | 棋圣世界·BOSS塔 | 五子棋BOSS战 |
| ch05 | 棋圣世界·圣殿 | 象棋终极对决 |
| ch06 | 棋圣世界·终局 | 围棋终局，结局判定 |

## 3. 文件修改清单

### 3.1 章节剧情文件（核心修改）

| 文件 | 修改内容 |
|------|----------|
| `rpg_data/chapters/ch00_prologue.json` | 重写为高中教室场景，下棋连输，觉醒系统 |
| `rpg_data/chapters/ch01_tutorial_wuziqi.json` | 重写为与同学对战的教程，系统介绍作弊功能 |
| `rpg_data/chapters/ch02_city_xiangqi.json` | 修改背景为棋圣世界新手村，补充完整剧情 |
| `rpg_data/chapters/ch03_go_intro.json` | 修改背景为棋圣世界进阶区，调整剧情对话 |
| `rpg_data/chapters/ch04_boss_wuziqi.json` | 修改背景为棋圣世界BOSS塔，补充完整剧情 |
| `rpg_data/chapters/ch05_final_xiangqi.json` | 修改背景为棋圣世界圣殿，补充完整剧情 |
| `rpg_data/chapters/ch06_finale_go.json` | 修改背景为棋圣世界终局，调整结局对话 |

### 3.2 角色资产文件（需要生成）

| 文件 | 说明 |
|------|------|
| `shared/assets/characters/boy/` | 主角小明新立绘（高中男生校服形象） |
| `shared/assets/characters/classmate/` | 新同学角色立绘 |
| `shared/assets/characters/robot/` | 棋圣系统新外观（未来科技风格） |

### 3.3 场景背景文件（需要生成）

| 文件 | 新场景 |
|------|--------|
| `shared/rpg/assets/bgs/ch00_prologue.png` | 高中教室课间场景 |
| `shared/rpg/assets/bgs/ch01_tutorial.png` | 教室下棋/棋圣空间 |
| `shared/rpg/assets/bgs/ch02_city_xiangqi.png` | 棋圣世界新手村 |
| `shared/rpg/assets/bgs/ch03_go_intro.png` | 棋圣世界进阶区 |
| `shared/rpg/assets/bgs/ch04_boss.png` | 棋圣世界BOSS塔 |
| `shared/rpg/assets/bgs/ch05_final.png` | 棋圣世界圣殿 |
| `shared/rpg/assets/bgs/ch06_finale.png` | 棋圣世界终局 |

### 3.4 其他文件

| 文件 | 修改内容 |
|------|----------|
| `shared/rpg/dialogue_templates.json` | 更新对手台词，符合新设定 |
| `shared/rpg/assets/manifest.json` | 更新资产生成清单 |

## 4. 实施步骤

### 阶段一：剧情重构（第1-7章）

**步骤1.1**：修改ch00_prologue.json
- 场景：高中教室，课间休息
- 剧情：小明与同学下五子棋连输十几把，气急攻心晕倒
- 醒来后发现觉醒了棋圣系统

**步骤1.2**：修改ch01_tutorial_wuziqi.json
- 场景：教室/棋圣空间
- 剧情：系统教小明作弊方法，与同学对战练习
- 保留原有教学内容（能量条、识破概率等）

**步骤1.3**：修改ch02_city_xiangqi.json
- 场景：棋圣世界·新手村
- 剧情：系统发现小明是好苗子，传送至棋圣世界
- 第一关：象棋对战

**步骤1.4**：修改ch03_go_intro.json
- 场景：棋圣世界·进阶区
- 剧情：围棋对战，学习棋道

**步骤1.5**：修改ch04_boss_wuziqi.json
- 场景：棋圣世界·BOSS塔
- 剧情：五子棋BOSS战，规则变体

**步骤1.6**：修改ch05_final_xiangqi.json
- 场景：棋圣世界·圣殿
- 剧情：象棋终极对决

**步骤1.7**：修改ch06_finale_go.json
- 场景：棋圣世界·终局
- 剧情：围棋终局，结局判定

### 阶段二：资产生成

**步骤2.1**：生成主角小明新立绘（18张）
- 高中男生校服形象，统一相貌
- 包含各种表情和姿态

**步骤2.2**：生成同学角色立绘（8张）
- 高中同学形象，与小明风格一致

**步骤2.3**：生成棋圣系统新外观（17张）
- 未来科技风格，数字精灵形象

**步骤2.4**：生成7张新章节背景图
- 符合新场景设定的像素画风格

**步骤2.5**：更新manifest.json
- 记录新生成的资产信息

### 阶段三：对话模板更新

**步骤3.1**：更新dialogue_templates.json
- 修改对手台词，符合新的剧情设定

## 5. 资产生成提示词设计

### 5.1 主角小明立绘
```
Pixel art, 128x128 resolution, clean crisp pixel art game sprite,
a 16-year-old high school boy student, short black hair,
wearing white shirt and dark blue school uniform jacket with red collar,
young RPG hero protagonist vibe, centered, simple dark solid background,
neutral calm expression, bust portrait
```

### 5.2 同学角色立绘
```
Pixel art, 128x128 resolution, clean crisp pixel art game sprite,
a high school boy student classmate, slightly mischievous expression,
wearing white shirt and dark blue school uniform,
simple dark solid background for sprite cutout,
bust portrait, teasing smile
```

### 5.3 棋圣系统外观
```
Pixel art, 128x128 resolution, clean crisp pixel art game sprite,
a floating digital AI spirit character, futuristic holographic design,
glowing cyan eyes, geometric body with circuit patterns,
chess piece symbols floating around, cyberpunk tech aesthetic,
centered, simple dark solid background, full body
```

### 5.4 章节背景图
- **ch00（教室）**：高中教室课间场景，课桌椅，窗外阳光，五子棋棋盘
- **ch01（教室/棋圣空间）**：教室与数字空间的过渡场景
- **ch02（新手村）**：棋圣世界的新手村，棋盘状建筑，奇幻风格
- **ch03（进阶区）**：棋圣世界的进阶区域，围棋主题，云雾缭绕
- **ch04（BOSS塔）**：黑暗的BOSS塔，神秘氛围
- **ch05（圣殿）**：华丽的棋圣殿，金色光芒
- **ch06（终局）**：终极空间，破碎的棋盘世界

## 6. 风险与应对

### 6.1 风险列表

| 风险 | 等级 | 应对措施 |
|------|------|----------|
| AI生图人物相貌不统一 | 高 | 使用相同的基础提示词，逐步调整表情变化 |
| 剧情修改影响游戏流程 | 中 | 保持章节结构不变，仅修改对话和场景描述 |
| 资产生成失败 | 中 | 备用方案：使用现有资产，仅修改剧情文本 |
| 识破概率机制与新剧情不兼容 | 低 | 保持原有机制不变，仅修改描述文本 |

### 6.2 质量保证
- 所有剧情修改保持原有JSON结构
- 人物名称和ID保持一致，仅修改name字段和对话内容
- 资产文件名保持一致，仅替换图片内容

## 7. 验证标准

1. **剧情连贯性**：所有章节剧情连贯，符合新设定
2. **资产一致性**：角色相貌统一，背景风格一致
3. **游戏完整性**：所有章节可正常加载和游玩
4. **机制兼容性**：能量条、识破概率等机制正常工作

## 8. 预期交付物

1. 修改完成的7个章节JSON文件
2. 新生成的角色立绘（主角+同学+棋圣系统）
3. 新生成的7张章节背景图
4. 更新后的对话模板文件
5. 更新后的资产生成清单

---

*计划版本：v1.0*
*制定日期：2026-07-20*