# 剧情编辑器集成指南

> **目标读者**：负责游戏主体 RPG 部分开发的 AI 工程师
> **用途**：将剧情编辑器制作的视觉小说内容无缝迁移进游戏，并增强视觉效果

---

## 一、概述

### 1.1 什么是剧情编辑器

剧情编辑器（`/story-editor/`）是一个独立的可视化工具，用于创作 galgame/视觉小说风格的分支剧情。制作好的剧情以标准 JSON 格式存储，可直接嵌入游戏主程序。

### 1.2 核心概念

| 概念 | 说明 |
|---|---|
| **Story（剧情）** | 一个完整的剧情项目，包含多个场景 |
| **Scene（场景）** | 剧情的一个段落/章节，由多个节点组成 |
| **Node（节点）** | 剧情的最小单元（一句对话、一个选择、一次跳转等） |
| **Character（角色）** | 剧情中的角色，有多个表情/立绘 |
| **Background（背景）** | 场景背景图/色 |
| **Variable（变量）** | 全局状态，用于条件分支和数据传递 |

### 1.3 与游戏的关系

```
┌─────────────────────┐     ┌─────────────────────┐
│   剧情编辑器         │     │   游戏主程序（RPG）  │
│                     │     │                     │
│  • 可视化创作剧情    │     │  • 游戏循环          │
│  • 导出 JSON 文件    │────▶│  • 触发剧情播放      │
│  • 实时预览          │     │  • 变量互通          │
│                     │     │  • 视觉效果增强      │
└─────────────────────┘     └─────────────────────┘
```

---

## 二、剧情 JSON 格式详解

### 2.1 顶层结构

```json
{
  "id": "story_xxx",
  "meta": {
    "title": "剧情标题",
    "author": "作者",
    "version": "1.0.0",
    "description": "剧情描述",
    "created_at": "ISO 时间戳",
    "updated_at": "ISO 时间戳"
  },
  "characters": [ /* 角色列表 */ ],
  "backgrounds": [ /* 背景列表 */ ],
  "variables": { /* 初始变量 */ },
  "start_scene_id": "scene_prologue",
  "scenes": [ /* 场景列表 */ ]
}
```

### 2.2 角色定义

```json
{
  "id": "boy",
  "name": "少年",
  "color": "#60a5fa",
  "portraits": [
    { "expression": "neutral", "image": "/assets/characters/boy/boy_neutral.png" },
    { "expression": "happy", "image": "/assets/characters/boy/boy_happy.png" }
  ]
}
```

- `id`：角色唯一标识，在节点中引用
- `color`：角色名显示颜色，用于对话框
- `portraits`：表情→立绘映射，`expression` 为自定义标识

### 2.3 背景定义

```json
{
  "id": "bg_classroom",
  "name": "教室",
  "type": "solid",      // "solid" 纯色 / "image" 图片
  "color": "#1a1a2e",  // 纯色时使用
  "image": "data:image/..."  // 图片时使用（base64 或 URL）
}
```

### 2.4 场景定义

```json
{
  "id": "scene_prologue",
  "name": "序幕",
  "start_node_id": "node_1",
  "nodes": [ /* 节点列表 */ ]
}
```

### 2.5 节点类型全集

每个节点的基础结构：

```json
{
  "id": "node_xxx",
  "type": "dialogue",
  "x": 100,
  "y": 100,
  "data": { /* 类型特定字段 */ }
}
```

**全部节点类型及字段：**

| 类型 | 说明 | data 字段 |
|---|---|---|
| `dialogue` | 角色对话 | `character_id`, `expression`, `text`, `next` |
| `narration` | 旁白 | `text`, `next` |
| `choice` | 选择支 | `options: [{text, next_scene_id, next_node_id, condition}]` |
| `jump` | 场景跳转 | `target_scene_id`, `target_node_id` |
| `condition` | 条件分支 | `variable`, `operator`, `value`, `true_next`, `false_next` |
| `set_var` | 设置变量 | `variable`, `value`, `operation` (set/add/sub/toggle), `next` |
| `bg` | 切换背景 | `bg_id`, `transition` (fade/slide_left/slide_right/none), `next` |
| `show_char` | 显示角色 | `character_id`, `expression`, `position` (left/center/right), `transition`, `next` |
| `hide_char` | 隐藏角色 | `character_id`, `transition`, `next` |
| `wait` | 等待 | `duration_ms`, `next` |
| `effect` | 特效 | `effect_type` (shake/flash/fade_in/fade_out/glitch), `params` (JSON 字符串), `next` |
| `sound` | 音效 | `sound_id`, `action` (play/stop/loop), `volume`, `next` |
| `end` | 结局 | `ending_type` (good/bad/neutral/secret), `text` |

**连线规则：**
- 单输出节点（dialogue, narration, set_var, bg, show_char, hide_char, wait, effect, sound）：通过 `data.next` 指向下一节点 ID
- 双输出节点（condition）：`data.true_next` 和 `data.false_next`
- 多输出节点（choice）：`data.options[].next_node_id`（或跨场景的 `next_scene_id`）
- 无输出节点（end）：剧情在此结束

---

## 三、播放引擎 API

### 3.1 引入播放引擎

播放引擎代码位于 `/story-editor/modules/preview.js`，其中暴露了 `VisualNovelPlayer` 类，可直接在游戏中复用。

```html
<!-- 在游戏页面中引入 -->
<script src="/story-editor/modules/story-schema.js"></script>
<script src="/story-editor/modules/preview.js"></script>
```

### 3.2 基本用法

```javascript
// 创建播放器实例
const player = Preview.VisualNovelPlayer.create(
    document.getElementById('vn-container'),
    {
        onEnd: (ending) => {
            console.log('剧情结束:', ending.type, ending.text);
            // 回到游戏
        }
    }
);

// 加载并播放剧情
fetch('/api/stories/sample-story-intro')
    .then(r => r.json())
    .then(storyData => {
        player.play(storyData, 'scene_prologue');
    });

// 停止播放
player.stop();

// 设置/获取变量（与游戏状态互通）
player.setVariable('player_hp', 100);
const hp = player.getVariable('player_hp');
```

### 3.3 完整 API 列表

| 方法 | 说明 |
|---|---|
| `player.play(storyData, startSceneId)` | 播放指定剧情的指定场景 |
| `player.stop()` | 停止播放，清理舞台 |
| `player.onEnd(callback)` | 设置结局回调 |
| `player.setVariable(key, value)` | 设置变量（外部注入游戏状态） |
| `player.getVariable(key)` | 获取变量值（读取剧情状态到游戏） |
| `player.skip()` | 跳过当前对话（快进） |

---

## 四、集成到游戏 RPG 部分

### 4.1 集成架构

```
游戏主循环
    │
    ├─ 触发剧情事件（进入房间、遇到NPC、战斗胜利...）
    │       │
    │       ▼
    │   显示 VN 播放器（覆盖层）
    │       │
    │       ├─ 播放对话
    │       ├─ 处理选择 → 修改变量
    │       └─ 剧情结束 → 回到游戏
    │
    └─ 变量影响游戏机制
        ├─ 好感度 → AI 难度调整
        ├─ 解锁剧情 → 新机制开启
        └─ 结局分支 → 游戏结局
```

### 4.2 代码集成示例

**步骤 1：在游戏 HTML 中添加剧情容器**

```html
<!-- 剧情播放器容器（默认隐藏，覆盖全屏） -->
<div id="vn-overlay" style="display:none;position:fixed;inset:0;z-index:1000;background:#000;">
    <div id="vn-stage" style="width:100%;height:100%;position:relative;"></div>
</div>
```

**步骤 2：初始化播放器**

```javascript
const VNPlayer = {
    player: null,
    overlay: null,
    active: false,

    init() {
        this.overlay = document.getElementById('vn-overlay');
        this.player = Preview.VisualNovelPlayer.create(
            document.getElementById('vn-stage'),
            {
                onEnd: (ending) => this.handleEnd(ending)
            }
        );
    },

    async play(storyId, sceneId) {
        this.active = true;
        this.overlay.style.display = 'block';

        const resp = await fetch(`/api/stories/${storyId}`);
        const storyData = await resp.json();

        // 注入游戏状态到剧情变量
        this.player.setVariable('player_hp', GameState.player.hp);
        this.player.setVariable('ai_difficulty', GameState.ai.difficulty);

        this.player.play(storyData, sceneId);
    },

    handleEnd(ending) {
        // 将剧情变量写回游戏状态
        GameState.flags.bad_ending_seen = (ending.type === 'bad');

        // 淡出
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.active = false;
            this.player.stop();

            // 触发游戏后续逻辑
            Game.onStoryEnd(ending);
        }, 1000);
    },

    stop() {
        this.player.stop();
        this.overlay.style.display = 'none';
        this.active = false;
    }
};

// 游戏初始化时调用
// VNPlayer.init();
```

**步骤 3：在游戏事件中触发剧情**

```javascript
// 示例：玩家第一次走棋后触发序章
function onFirstMove() {
    if (!GameState.flags.prologue_seen) {
        GameState.flags.prologue_seen = true;
        VNPlayer.play('sample-story-intro', 'scene_prologue');
    }
}

// 示例：AI 触发剧情
async function onAIPersonalityChange(personality) {
    if (personality === 'aggressive' && !GameState.flags.aggressive_unlocked) {
        GameState.flags.aggressive_unlocked = true;
        VNPlayer.play('ai-personality-stories', 'scene_aggressive_intro');
    }
}
```

### 4.3 变量互通设计

**推荐的变量命名约定：**

| 前缀 | 用途 | 示例 |
|---|---|---|
| `player_` | 玩家状态 | `player_hp`, `player_name` |
| `ai_` | AI 状态 | `ai_temperature`, `ai_personality` |
| `flag_` | 剧情标记 | `flag_prologue_seen`, `flag_chess_club_joined` |
| `stat_` | 数值统计 | `stat_wins`, `stat_losses` |
| `rel_` | 角色关系值 | `rel_robot_friendship` |

**变量与游戏配置的映射：**

```javascript
// 游戏 → 剧情：游戏开始前注入
function syncGameToVN() {
    VNPlayer.player.setVariable('player_hp', state.configs.board_state.player_hp);
    VNPlayer.player.setVariable('ai_difficulty', state.configs.rules.ai_difficulty.current);
    VNPlayer.player.setVariable('stat_wins', getWinCount());
}

// 剧情 → 游戏：剧情结束后写回
function syncVNToGame() {
    const difficulty = VNPlayer.player.getVariable('ai_difficulty');
    if (difficulty) {
        state.configs.rules.ai_difficulty.current = difficulty;
        state.save_config('rules');
    }
}
```

---

## 五、视觉效果增强指南

### 5.1 增强转场效果

默认的 `fade` 转场比较简单，可根据游戏风格增强：

```javascript
// 在集成时覆盖转场函数
const originalApplyBgTransition = player.applyBgTransition;
player.applyBgTransition = function(bgId, transition) {
    // 自定义更华丽的转场
    const bgEl = document.querySelector('.vn-background');

    switch (transition) {
        case 'pixel_wipe':
            // 像素化擦除效果
            bgEl.style.clipPath = 'inset(0 0 0 100%)';
            bgEl.style.transition = 'clip-path 0.5s steps(8)';
            requestAnimationFrame(() => {
                bgEl.style.clipPath = 'inset(0 0 0 0)';
            });
            break;
        case 'glitch':
            // 故障转场（呼应 AI 主题）
            bgEl.style.filter = 'hue-rotate(90deg) blur(4px)';
            setTimeout(() => {
                // 切换背景
                BgManager.applyBgToElement(bgId, bgEl);
                bgEl.style.filter = '';
            }, 200);
            break;
        default:
            originalApplyBgTransition.call(player, bgId, transition);
    }
};
```

### 5.2 角色立绘动画增强

```css
/* 添加更多入场动画 */
.vn-char-sprite.enter-bounce {
    animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes bounceIn {
    0% { transform: translateY(50px) scale(0.8); opacity: 0; }
    60% { transform: translateY(-10px) scale(1.05); }
    100% { transform: translateY(0) scale(1); opacity: 1; }
}

.vn-char-sprite.shake {
    animation: charShake 0.3s;
}

@keyframes charShake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-8px); }
    75% { transform: translateX(8px); }
}
```

### 5.3 对话框样式定制

```css
/* 赛博朋克风格对话框 */
.vn-dialog-box {
    background: rgba(10, 14, 23, 0.95);
    border: 1px solid var(--accent-cyan);
    box-shadow:
        0 0 20px rgba(6, 182, 212, 0.3),
        inset 0 0 20px rgba(6, 182, 212, 0.05);
    border-radius: 8px;
    position: relative;
}

/* 角落装饰 */
.vn-dialog-box::before,
.vn-dialog-box::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid var(--accent-cyan);
}
.vn-dialog-box::before {
    top: -2px; left: -2px;
    border-right: none;
    border-bottom: none;
}
.vn-dialog-box::after {
    bottom: -2px; right: -2px;
    border-left: none;
    border-top: none;
}

/* 打字机光标 */
.vn-text::after {
    content: '▌';
    color: var(--accent-cyan);
    animation: blink 1s infinite;
}
@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}
```

### 5.4 音效与背景音乐

剧情编辑器支持 `sound` 节点，但默认不播放声音（无音频文件）。集成时可接入游戏音效系统：

```javascript
// 覆盖音效处理
const originalHandleSound = player.handleSound;
player.handleSound = function(node) {
    const { sound_id, action, volume } = node.data;

    // 调用游戏音效系统
    if (action === 'play' || action === 'loop') {
        Game.Audio.play(sound_id, {
            loop: action === 'loop',
            volume: volume || 1.0
        });
    } else if (action === 'stop') {
        Game.Audio.stop(sound_id);
    }
};
```

### 5.5 像素风格适配

如果游戏是像素风格，建议对播放器做以下调整：

```css
/* 像素化渲染 */
#vn-stage {
    image-rendering: pixelated;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
}

/* 像素字体 */
.vn-text, .vn-char-name {
    font-family: 'PixelFont', monospace;
    letter-spacing: 1px;
}

/* 像素边框 */
.vn-dialog-box {
    border-image: url('pixel-border.png') 4 repeat;
    border-width: 4px;
}
```

---

## 六、常见问题与排错

### Q1: 剧情不播放/卡在第一句？

检查：
1. `start_scene_id` 是否存在于 `scenes` 数组中
2. 起始场景的 `start_node_id` 是否存在
3. 控制台是否有报错
4. 角色立绘图片路径是否正确（404 不会报错，但角色不显示）

### Q2: 变量条件不生效？

检查：
1. 变量名是否完全一致（大小写敏感）
2. 比较运算符是否正确（数字比较用 `>` `<`，字符串用 `==` `!=`）
3. 变量值类型是否匹配（字符串 "10" ≠ 数字 10）

### Q3: 跨场景跳转不生效？

检查：
1. `next_scene_id` 对应的场景是否存在
2. 如果指定了 `next_node_id`，确认该节点在目标场景中存在
3. 跳转时 `story` 对象是否包含目标场景（单场景播放时不会有其他场景）

### Q4: 角色立绘位置不对？

检查：
1. `position` 字段值必须是 `left` / `center` / `right`
2. 立绘图片尺寸——如果图片自带大量空白区域，视觉上可能偏离
3. 可通过 CSS 微调 `.vn-char-sprite.pos-left { left: 10%; }`

### Q5: 如何在对话中插入变量值？

当前版本不支持模板字符串。可通过以下方式实现：

```javascript
// 集成时，在播放前预处理文本
const originalProcessNode = player.processCurrentNode;
player.processCurrentNode = function() {
    const node = this.currentNode;
    if (node && (node.type === 'dialogue' || node.type === 'narration')) {
        // 替换 {{variable}} 模板
        node.data.text = node.data.text.replace(/\{\{(\w+)\}\}/g, (m, key) => {
            return this.variables[key] ?? m;
        });
    }
    originalProcessNode.call(this);
};
```

---

## 七、文件清单

| 文件 | 位置 | 用途 |
|---|---|---|
| 编辑器主页面 | `story-editor/index.html` | 编辑器入口 |
| 主逻辑 | `story-editor/app.js` | 编辑器主应用 |
| 样式 | `story-editor/style.css` | 编辑器样式 |
| 数据模型 | `story-editor/modules/story-schema.js` | 节点类型定义、创建函数、校验 |
| 存取模块 | `story-editor/modules/story-io.js` | LocalStorage + 服务器 API + 文件导入导出 |
| 场景树 | `story-editor/modules/scene-tree.js` | 场景列表面板 |
| 节点画布 | `story-editor/modules/node-canvas.js` | 节点拖拽+连线 |
| 属性面板 | `story-editor/modules/inspector.js` | 节点属性编辑 |
| **播放引擎** | `**story-editor/modules/preview.js**` | **核心：视觉小说播放器（可复用）** |
| 角色管理 | `story-editor/modules/character-manager.js` | 角色资源管理 |
| 背景管理 | `story-editor/modules/bg-manager.js` | 背景资源管理 |
| 变量管理 | `story-editor/modules/variable-manager.js` | 变量系统 |
| 示例剧情 | `story-editor/stories/sample-story.json` | 完整示例，可直接播放 |
| 后端 API | `main.py`（见 `/api/stories/*` 路由） | 剧情 CRUD + 角色列表 |

---

## 八、下一步建议

1. **接入游戏事件系统**：将剧情触发点挂载到游戏的关键事件上（首局胜利、AI 首次修改规则、特殊机制触发等）
2. **丰富角色表情**：当前每个角色有 8-9 种表情，可根据剧情需要补充更多
3. **添加背景音乐**：为每个场景配置 BGM，增强沉浸感
4. **制作更多剧情**：用编辑器创作主线剧情、角色支线、结局分支
5. **添加存档系统集成**：剧情变量随游戏存档一起保存/读取
