# 棋圣 RPG - 实施计划

## 一、项目调研总结

### 1.1 项目概述
**棋圣 (ChessSage)** 是一款以"打破规则"为核心爽点的棋类RPG游戏。玩家扮演觉醒了「棋圣系统」的少年，通过自然语言改写棋局规则、操控对手认知。游戏包含三种棋类（中国象棋/五子棋/围棋），所有「作弊能力」由二级AI协作流水线现场实现。

### 1.2 关键文件结构
```
/workspace/
├── main.py                    # 统一启动器
├── config.json                # 配置文件（已有api_key字段）
├── rpg_data/chapters/         # 章节剧情数据
│   ├── ch00_prologue.json
│   ├── ch01_tutorial_wuziqi.json
│   ├── ch01b_white_board.json  # 已有白色棋盘章节骨架
│   └── ...
├── shared/rpg/               # RPG外壳层
│   ├── rpg_server.py          # 后端路由
│   ├── rpg_shell.js           # 前端主控
│   ├── rpg_shell.html         # HTML页面
│   ├── story_layer.js         # VN故事层
│   └── rpg_extras.js          # 标题屏等
└── wuziqi/                    # 五子棋子项目
    ├── configs/ui_config.json # UI配置（含背景色）
    └── static/app.js          # Web Component
```

### 1.3 核心设计理念
- **灵活编码**：AI现场生成代码实现作弊，而非硬编码
- **JSON驱动**：所有可变元素（规则、棋盘、棋子、剧情）抽象为JSON
- **作弊即玩法**：能量条 + 识破概率机制

---

## 二、任务分解与实施步骤

### 任务1：设计五子棋"白色棋盘"章节

#### 目标
创建一个展示AI修改前端能力的章节，任务为"让五子棋棋盘至少80%覆盖白色"，引导玩家发现最优解法——直接修改棋盘背景色。

#### 修改文件
1. **`rpg_data/chapters/ch01b_white_board.json`** - 完善章节剧情
2. **`shared/rpg/rpg_server.py`** - 添加章节配置
3. **`shared/rpg/rpg_extras.js`** - 添加章节背景映射

#### 步骤详情

**步骤1.1：完善 ch01b_white_board.json 章节剧情**

设计思路：
- **场景1**：棋圣系统提出挑战——"让棋盘80%变白色"
- **场景2**：引导玩家思考三种思路（手动下棋、AI落子、修改规则）
- **场景3**：幻影棋手登场
- **场景4**：进入对战（玩家执黑，对手执白）
- **场景5（胜利后）**：揭示最优解法——"其实你可以直接让棋盘变成白色"

关键设计：
- 初始能量50，鼓励使用作弊
- 胜利条件特殊检测：棋盘白色覆盖率≥80%
- 章节结束后展示系统提示，说明最优方法

**步骤1.2：在 rpg_server.py 中注册章节**

在 `CHAPTERS` 字典中添加：
```python
"ch01b_white_board": {
    "title": "第 0.5 章·涂白",
    "chess_type": "wuziqi",
    "next": "ch02_city_xiangqi",
    "story_id": "ch01b_white_board",
    "opponent": {"id": "phantom", "name": "幻影棋手"},
    "player_side": "black",
},
```

**步骤1.3：在 rpg_extras.js 中添加背景映射**

在 `CHAPTER_BG_MAP` 中添加：
```javascript
'ch01b_white_board': '/shared/rpg/assets/bgs/ch01_tutorial.png',
```

**步骤1.4：添加特殊胜利条件检测**

修改 `rpg_shell.js` 的 `_onBoardGameEnd` 函数，为 `ch01b_white_board` 章节添加特殊检测逻辑：
- 检查棋盘背景色是否为白色
- 检查棋盘上白子覆盖率

---

### 任务2：修复 DeepSeek 密钥保存问题

#### 目标
解决密钥填写后无法保存的问题，改为从主配置文件读取，前端默认从文件读取，读取不到再要求填入。

#### 修改文件
1. **`shared/rpg/rpg_server.py`** - 修改密钥加载逻辑，支持从主配置文件读取和保存
2. **`shared/rpg/rpg_shell.js`** - 修改设置面板，初始化时填充已有密钥
3. **`config.json`** - 确保包含api_key字段

#### 步骤详情

**步骤2.1：修改 rpg_server.py 密钥加载逻辑**

当前问题：
- 仅从 `xiangqi/api密钥.txt` 读取
- 设置后仅保存在内存，重启丢失

修改方案：
- 优先从 `/workspace/config.json` 读取 `api_key` 字段
- 设置密钥时同时写入 `config.json` 文件
- 保留从 `xiangqi/api密钥.txt` 读取的降级方案

**步骤2.2：修改 rpg_shell.js 设置面板**

当前问题：
- `openSettings()` 函数清空输入框：`apiKeyInput.value = ''`
- 未显示当前已设置的密钥

修改方案：
- 打开设置时填充当前密钥（脱敏显示）
- 保存后刷新状态

**步骤2.3：确保 config.json 包含 api_key 字段**

---

### 任务3：修复剧情加载不出来的问题

#### 目标
解决剧情无法加载、无法进入剧情的bug。

#### 修改文件
1. **`shared/rpg/story_layer.js`** - 检查VN播放逻辑
2. **`shared/rpg/rpg_shell.js`** - 检查章节加载和故事播放流程
3. **`shared/rpg/rpg_shell.html`** - 检查脚本加载顺序

#### 步骤详情

**步骤3.1：检查脚本加载顺序**

当前顺序（rpg_shell.html第274-279行）：
```html
<script src="/shared/rpg/vn_player/variable_manager.js"></script>
<script src="/shared/rpg/vn_player/preview.js"></script>
<script src="/shared/rpg/story_layer.js"></script>
<script src="/shared/rpg/cheat_panel.js"></script>
<script src="/shared/rpg/rpg_extras.js"></script>
<script type="module" src="/shared/rpg/rpg_shell.js"></script>
```

问题分析：`rpg_extras.js` 需要在 `rpg_shell.js` 之前加载以设置 `__RPG_TITLE_ACTIVE`，但当前顺序正确。

**步骤3.2：检查 story_layer.js 的 playChapter 函数**

当前逻辑：
1. 发起 `/api/rpg/vn/{storyId}` 请求
2. 调用 `Preview.playStory()`
3. 设置 `onEndCallback`

潜在问题：
- `Preview.playStory()` 可能在 `Preview.init()` 之前被调用
- 网络请求失败时的处理不完善

**步骤3.3：检查 rpg_shell.js 的 _playChapterStory 函数**

当前逻辑：
1. 探测故事是否存在
2. 调用 `StoryLayer.playChapter()`

潜在问题：
- 探测请求失败时直接调用 `onEnd`，跳过了故事播放
- 需要更好的错误处理和日志

**步骤3.4：修复方案**

1. 在 `StoryLayer.init()` 中确保 `Preview.init()` 已调用
2. 添加更详细的错误日志
3. 修复探测逻辑，避免过早跳过

---

## 三、潜在依赖与考虑

### 3.1 技术依赖
- **Preview.js**：VN引擎核心，必须正确初始化
- **FastAPI**：后端路由，确保 `/api/rpg/vn/{story_id}` 路由正常工作
- **config.json**：配置文件读写

### 3.2 设计约束
- **灵活编码原则**：所有新功能应通过AI编码实现，而非硬编码（但核心游戏逻辑可硬编码）
- **一致性**：与现有代码风格保持一致
- **兼容性**：不破坏现有功能

### 3.3 风险处理
- **密钥安全**：不在前端明文显示完整密钥，仅显示脱敏版本
- **JSON文件写入权限**：确保 `config.json` 可写
- **章节跳转逻辑**：确保 `ch01b_white_board` 章节正确连接到前后章节

---

## 四、验证方案

### 4.1 剧情章节验证
1. 启动游戏，进入标题屏
2. 点击"开始游戏"，进入序章
3. 完成序章后进入教程章（ch01）
4. 完成教程章后进入白色棋盘章（ch01b）
5. 验证章节剧情正常播放
6. 验证特殊胜利条件检测

### 4.2 密钥保存验证
1. 打开设置面板
2. 输入DeepSeek API密钥
3. 点击保存
4. 刷新页面
5. 再次打开设置面板，验证密钥已保存

### 4.3 剧情加载验证
1. 启动所有服务
2. 访问 `http://localhost:8080/`
3. 点击"开始游戏"
4. 验证序章剧情正常加载和播放
5. 验证后续章节剧情加载

---

## 五、实施时间预估

| 任务 | 预估步骤数 | 复杂度 |
|------|-----------|--------|
| 五子棋白色棋盘章节设计 | 4步 | 中 |
| DeepSeek密钥保存修复 | 3步 | 低 |
| 剧情加载修复 | 4步 | 中 |
| 验证测试 | 3步 | 低 |

---

## 六、文件修改清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `rpg_data/chapters/ch01b_white_board.json` | 修改 | 完善章节剧情，添加胜利后揭示最优解法的场景 |
| `shared/rpg/rpg_server.py` | 修改 | 添加章节配置，修改密钥读写逻辑 |
| `shared/rpg/rpg_shell.js` | 修改 | 添加特殊胜利条件检测，修复设置面板 |
| `shared/rpg/rpg_extras.js` | 修改 | 添加章节背景映射 |
| `shared/rpg/story_layer.js` | 修改 | 修复VN播放初始化问题 |
| `config.json` | 修改 | 确保包含api_key字段 |
