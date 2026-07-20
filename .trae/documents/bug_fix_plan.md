# 棋圣 RPG 三大 Bug 修复计划

## 一、Bug 总览

| 编号 | Bug 描述 | 严重程度 | 涉及模块 |
|------|----------|----------|----------|
| Bug 1 | 设置页面始终显示「当前状态 检查中…」，输入框不显示 API Key，不确定是否从主文件夹 `config.json` 读取 | 高 | `rpg_server.py`, `rpg_shell.js`, `rpg_extras.js` |
| Bug 2 | 命令行工作时没有反馈工作日志（子进程输出被吞掉） | 中 | `main.py` |
| Bug 3 | 点击开始游戏后，剧情始终不显示，卡在「正在进入剧情……」界面 | 高 | `story_layer.js`, `rpg_shell.js`, `vn_style.css` |

---

## 二、Bug 1：设置页面 API Key 显示与读取问题

### 2.1 根因分析

通过代码审查，发现以下三个问题：

#### 问题 1：API Key 没有从根目录 `config.json` 读取

[rpg_server.py](file:///workspace/shared/rpg/rpg_server.py#L150-L167) 中的 `_load_default_api_key()` 只从 `xiangqi/api密钥.txt` 读取：

```python
API_KEY_FILE = XIANGQI_DIR / "api密钥.txt"

def _load_default_api_key(self) -> str:
    if API_KEY_FILE.exists():
        # ... 从 xiangqi/api密钥.txt 读取
    return ""
```

而根目录 `/workspace/config.json` 中确实有 `api_key` 字段，但完全没有被读取。

#### 问题 2：打开设置时输入框被清空

[rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js#L462-L465) 中的 `openSettings()` 每次打开设置都把输入框清空：

```javascript
function openSettings() {
    apiKeyInput.value = '';   // ← 直接清空，不显示当前已加载的 Key
    _toggleSettings(true);
}
```

#### 问题 3：状态文本「检查中…」从未更新（部分场景）

[rpg_extras.js](file:///workspace/shared/rpg/rpg_extras.js#L203-L229) 中的 `_bindSettingsStatus()` 只给**顶部设置按钮**追加了 click 监听器来刷新状态。但有两个入口可以打开设置：
- 顶部 ⚙ 按钮 → 状态会刷新 ✓
- 标题屏「设置」按钮 → 状态不会刷新 ✗（因为走的是 `RpgShell.openSettings()` 直接调用）

### 2.2 修复方案

#### 修复 1.1：让 API Key 支持从多个位置读取

修改 `rpg_server.py` 的 `_load_default_api_key()`，按优先级读取：
1. 根目录 `config.json`（最高优先级）
2. `xiangqi/api密钥.txt`
3. `wuziqi/api密钥.txt`
4. `go/api密钥.txt`

#### 修复 1.2：打开设置时回填当前 API Key 到输入框

修改 `rpg_shell.js` 的 `openSettings()`：
- 不再清空输入框
- 改为从后端拉取 `/api/rpg/state` 获取 `has_api_key` 状态
- 由于安全原因，API Key 明文不下发，但可以显示「已加载」状态并用星号占位提示
- 新增一个 API 端点 `/api/rpg/apikey` 的 GET 版本，仅返回掩码后的 Key（如 `sk-5b5e...a43`）

#### 修复 1.3：确保状态文本在所有打开方式下都刷新

修改 `rpg_shell.js` 的 `openSettings()`，在显示模态框后主动刷新状态文本，而不依赖按钮的额外监听器。

### 2.3 修改文件清单

- [rpg_server.py](file:///workspace/shared/rpg/rpg_server.py) — 新增 `config.json` 读取逻辑
- [rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js) — 修改 `openSettings()`，回填状态
- [rpg_extras.js](file:///workspace/shared/rpg/rpg_extras.js) — 移除冗余的状态绑定逻辑（统一由 `rpg_shell.js` 处理）

---

## 三、Bug 2：命令行无工作日志输出

### 3.1 根因分析

[main.py](file:///workspace/main.py#L38-L59) 中的 `start_process()` 把子进程的 stdout/stderr 重定向到了 `subprocess.PIPE`，但主进程从未读取这些管道：

```python
process = subprocess.Popen(
    [sys.executable, str(script_path)],
    stdout=subprocess.PIPE,    # ← 输出被存到管道里
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1
)
```

导致子进程的所有日志（包括 FastAPI 的请求日志、错误信息等）都被缓冲在管道中，永远不会打印到终端。

### 3.2 修复方案

#### 方案：添加日志实时输出线程

为每个子进程启动一个后台线程，实时读取其 stdout 管道并打印到主进程终端，格式为 `[服务名] 日志内容`，方便区分不同服务的输出。

修改 `main.py`：
1. 新增 `_pipe_logger(process, name)` 函数：持续读取 `process.stdout` 并逐行打印
2. 在 `start_process()` 中启动日志线程
3. 确保程序退出时日志线程也能正常结束

### 3.3 修改文件清单

- [main.py](file:///workspace/main.py) — 添加日志输出线程

---

## 四、Bug 3：剧情不显示，卡在「正在进入剧情……」

### 4.1 根因分析

经过多层代码审查，发现可能是以下几个问题叠加导致：

#### 问题 1：`vn-stage` 的 z-index 低于顶栏，且层级可能有问题

[vn_style.css](file:///workspace/shared/rpg/vn_player/vn_style.css#L20-L26) 中 `vn-stage` 的 `z-index: 100`，而顶栏 `.rpg-header` 的 `z-index: 200`。虽然顶栏只会挡住顶部 64px，但关键问题是：

`vn-stage` 是 `position: absolute`，位于 `#rpg-app` 内部。而 `.rpg-main`（包含 `battle-placeholder`）的 `z-index: 1`。理论上 `vn-stage` (z-index:100) 应该在 `.rpg-main` 上面。

但如果 `Preview.playStory()` 执行过程中出错，`vn-stage` 可能虽然 `display:block` 了但内容为空（全黑背景），用户可能以为还在加载中。

#### 问题 2：剧情播放失败时没有明显的错误提示

[story_layer.js](file:///workspace/shared/rpg/story_layer.js#L53-L69) 中的 `playChapter()` 出错时只 `console.error` 和 `alert()`，但：
- `alert()` 会被用户忽略或以为是其他问题
- 如果 `Preview` 对象未正确初始化，`show()` 可能正常调用但 `playStory()` 静默失败

#### 问题 3：`battlePlaceholder` 在剧情播放时没有隐藏

「正在进入剧情……」文字来自 `#rpg-battle-placeholder`。在纯 VN 章节中：
1. `_unmountBoard()` 只移除棋盘组件，不隐藏 placeholder
2. `StoryLayer.show()` 显示 `vn-stage`
3. 如果 `vn-stage` 因为任何原因没有正确显示（或透明），用户就会看到 placeholder 一直卡在那

#### 问题 4（潜在）：模块加载顺序问题

`rpg_shell.js` 是 `type="module"`，会延迟执行；而 `rpg_extras.js` 是普通脚本，立即执行。如果 `rpg_extras.js` 中的某些逻辑在 `RpgShell` 初始化完成前就触发，可能导致调用失败。

### 4.2 修复方案

#### 修复 3.1：提高 `vn-stage` 的 z-index，确保覆盖所有内容

把 `vn-stage` 的 z-index 从 100 提高到 300（高于顶栏 200，低于模态框 800），确保剧情层在最上层。

#### 修复 3.2：播放剧情时主动隐藏 `battlePlaceholder`

修改 `rpg_shell.js` 的 `_playChapterStory()`：
- 调用 `StoryLayer.playChapter()` 之前，先隐藏 `battlePlaceholder`
- 剧情结束后，如果要返回战斗界面再显示（但纯 VN 章节不需要）

#### 修复 3.3：增强错误处理和用户反馈

修改 `story_layer.js` 和 `rpg_shell.js`：
- 在 `playChapter()` 中添加更详细的错误日志
- 剧情加载失败时用 `toast()` 显示错误，而不是只有 `alert()`
- 确保 `Preview.init()` 被正确调用（在 `StoryLayer.init()` 中加检查）

#### 修复 3.4：添加调试日志

在关键路径（`loadChapter` → `_playChapterStory` → `StoryLayer.playChapter` → `Preview.playStory`）添加 `console.log` 输出，方便排查问题。

### 4.3 修改文件清单

- [vn_style.css](file:///workspace/shared/rpg/vn_player/vn_style.css) — 提高 `.vn-stage` 的 z-index
- [rpg_shell.js](file:///workspace/shared/rpg/rpg_shell.js) — 隐藏 placeholder、添加日志
- [story_layer.js](file:///workspace/shared/rpg/story_layer.js) — 增强错误处理、添加日志

---

## 五、风险与注意事项

| 风险点 | 影响 | 应对措施 |
|--------|------|----------|
| API Key 从多个位置读取可能导致混淆 | 低 | 明确优先级顺序，日志中打印加载来源 |
| 子进程日志输出可能导致主终端信息过载 | 低 | 用 `[服务名]` 前缀区分，颜色可选 |
| 提高 `vn-stage` z-index 可能影响其他浮层 | 低 | 设置为 300，低于模态框(800)和标题屏(500) |

---

## 六、验证步骤

1. **Bug 1 验证**：
   - 确认根目录 `config.json` 中的 API Key 能被正确加载
   - 打开设置面板，状态显示「已设置」
   - 从标题屏进入设置，状态同样正确显示

2. **Bug 2 验证**：
   - 启动 `main.py`，观察终端是否实时输出各服务的启动日志
   - 在浏览器中操作游戏，观察终端是否输出 HTTP 请求日志

3. **Bug 3 验证**：
   - 点击「开始游戏」，序章剧情正常显示
   - 点击屏幕推进对话，剧情正常流转
   - 序章结束后自动进入下一章节
