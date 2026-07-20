# 棋圣 RPG 修改计划

## 一、需求分析

### 1.1 重要剧情设计
设计一个五子棋章节（修改现有 `ch01b_white_board.json`），专门展示 AI 修改前端的能力：
- 任务："让五子棋棋盘至少 80% 覆盖白色"
- 常规方式：下白子、通过 AI 落白子
- 最优方式：直接修改棋盘背景颜色为白色（修改 UI 配置）
- 章节胜利后告知最优方法

### 1.2 Bug 修复
| 序号 | Bug 描述 | 分析 |
|------|----------|------|
| Bug1 | DeepSeek 密钥填写后无法保存 | 设置模态框打开时清空输入框；未从主目录配置文件读取密钥 |
| Bug2 | 剧情加载不出来，无法进入剧情 | 需要排查前端与后端数据交互链路 |

---

## 二、修改方案

### 2.1 Bug1：API 密钥保存修复

**修改文件：**

1. **`shared/rpg/rpg_server.py`**：增加从主目录 `config.json` 读取 API 密钥的逻辑
   - 修改 `_load_default_api_key()` 方法，优先从 `/workspace/config.json` 读取
   - 其次从 `xiangqi/api密钥.txt` 读取

2. **`shared/rpg/rpg_shell.js`**：修复设置模态框打开时清空密钥的问题
   - 修改 `openSettings()` 函数，打开时读取当前状态中的密钥并填入输入框

### 2.2 Bug2：剧情加载修复

**修改文件：**

1. **`shared/rpg/rpg_shell.js`**：增强章节加载错误处理和日志输出
   - 在 `loadChapter()` 和 `_playChapterStory()` 中增加更详细的错误处理

2. **`shared/rpg/story_layer.js`**：增强剧情加载的错误处理

### 2.3 新增"白色棋盘"章节

**修改文件：**

1. **`shared/rpg/rpg_server.py`**：添加新章节 `ch01b_white_board` 到 CHAPTERS 配置
   - 设置为五子棋章节，玩家执黑
   - 设置初始能量为 50（引导玩家使用作弊）

2. **`rpg_data/chapters/ch01b_white_board.json`**：完善章节剧情
   - 4个场景：介绍任务 → 解释三种思路 → 幻影棋手登场 → 开局
   - 任务目标：让棋盘 80% 变成白色
   - 胜利后揭示最优方法

3. **`shared/rpg/rpg_shell.js`**：增加章节完成后的特殊 VN 对话，揭示最优方法

---

## 三、文件修改清单

### 3.1 后端修改

| 文件 | 修改内容 |
|------|----------|
| `shared/rpg/rpg_server.py` | 1. 修改 `_load_default_api_key()` 从主目录 `config.json` 读取<br>2. 添加 `ch01b_white_board` 章节配置<br>3. 修改章节跳转逻辑，将 ch01 指向 ch01b |

### 3.2 前端修改

| 文件 | 修改内容 |
|------|----------|
| `shared/rpg/rpg_shell.js` | 1. 修复 `openSettings()` 打开时读取当前密钥<br>2. 增强章节加载错误处理<br>3. 在章节完成后增加特殊结局对话（针对 ch01b） |
| `shared/rpg/story_layer.js` | 增强剧情加载错误处理 |
| `shared/rpg/rpg_extras.js` | 在章节背景映射中添加 ch01b |

### 3.3 数据修改

| 文件 | 修改内容 |
|------|----------|
| `rpg_data/chapters/ch01b_white_board.json` | 完善剧情：添加胜利后揭示最优方法的场景 |

---

## 四、详细修改说明

### 4.1 API 密钥读取逻辑

**修改 `shared/rpg/rpg_server.py` 的 `_load_default_api_key()` 方法：**

```python
def _load_default_api_key(self) -> str:
    # 优先从主目录 config.json 读取
    main_config = WORKSPACE_ROOT / "config.json"
    if main_config.exists():
        try:
            with open(main_config, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "api_key" in data:
                    key = data["api_key"].strip()
                    if key:
                        return key
        except Exception:
            pass
    
    # 其次从 xiangqi/api密钥.txt 读取
    if API_KEY_FILE.exists():
        try:
            content = API_KEY_FILE.read_text(encoding="utf-8")
            # 提取首个 sk- 开头的 token
            import re
            m = re.search(r"sk-[A-Za-z0-9]+", content)
            if m:
                return m.group(0)
            # 兜底：取首个非空白行
            for line in content.splitlines():
                line = line.strip()
                if line and not line.startswith("#") and not line.startswith("-"):
                    return line
        except Exception:
            pass
    return ""
```

### 4.2 设置模态框修复

**修改 `shared/rpg/rpg_shell.js` 的 `openSettings()` 函数：**

```javascript
function openSettings() {
    // 读取当前已保存的 API Key（如果有）
    const hasKey = state.has_api_key;
    if (hasKey) {
        // 后端不返回完整密钥，但前端可以显示已设置状态
        apiKeyInput.placeholder = '已设置 API Key（输入新密钥可覆盖）';
    } else {
        apiKeyInput.placeholder = '输入 API Key 后将自动下发到三个棋类服务';
        apiKeyInput.value = '';
    }
    _toggleSettings(true);
}
```

### 4.3 章节配置修改

**在 `shared/rpg/rpg_server.py` 的 CHAPTERS 字典中添加 ch01b：**

```python
"ch01b_white_board": {
    "title": "第 0.5 章·涂白",
    "chess_type": "wuziqi",
    "next": "ch02_city_xiangqi",
    "story_id": "ch01b_white_board",
    "opponent": {"id": "robot", "name": "幻影棋手"},
    "player_side": "black",
},
```

**修改 ch01 的 next 指向 ch01b：**

```python
"ch01_tutorial_wuziqi": {
    ...
    "next": "ch01b_white_board",  # 修改为指向新章节
    ...
},
```

### 4.4 章节剧情完善

**修改 `rpg_data/chapters/ch01b_white_board.json`：**
- 在末尾添加新场景，展示胜利后揭示最优方法的剧情
- 添加胜利条件检测逻辑

---

## 五、风险与注意事项

1. **API 密钥安全**：确保密钥只在后端保存，前端不存储完整密钥
2. **章节跳转逻辑**：修改章节顺序后需要测试完整流程
3. **AI 修改 UI**：确保五子棋 UI 配置修改能够实时生效（通过 `applyCheatPatch`）
4. **剧情文件格式**：确保 JSON 格式正确，符合 VN 引擎要求

---

## 六、测试验证

1. **API 密钥**：打开设置模态框，输入密钥后保存，检查后端是否正确接收
2. **剧情加载**：从序章开始，验证所有章节都能正常加载
3. **白色棋盘章节**：进入 ch01b，验证任务目标显示和胜利后揭示最优方法
4. **AI 修改功能**：测试输入"让棋盘变成白色"指令，验证棋盘背景颜色是否改变