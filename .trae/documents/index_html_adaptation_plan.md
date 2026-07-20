# index.html Web Component 适配修改计划

## 修改目标
将 `/workspace/xiangqi/static/index.html` 从传统 HTML + 外部脚本架构，改造为适配 Web Component 架构的精简版本。

## 修改内容

### 1. head 部分修改
- **保留**：`<!DOCTYPE html>`、`<html lang="zh-CN">`、`<head>` 标签
- **保留**：meta charset、viewport、title
- **保留**：Google Fonts 相关的两个 preconnect link 和一个字体 link（字体可跨 Shadow DOM 共享）
- **移除**：`<link rel="stylesheet" href="/static/style.css">`（Web Component 内部 Shadow DOM 已注入样式）

### 2. body 部分修改
- **保留**：`<div id="app"></div>` 作为 Web Component 的挂载容器
- **清空**：#app 内部的所有 HTML 元素（thinking-overlay、settings-modal、logs-modal、header、main、board-container、side-panel、input-section 等全部移除）
- **移除**：`<script src="/static/app.js"></script>`
- **移除**：`<script src="http://localhost:80/shared/rpg/rpg_adapter.js"></script>`

### 3. 添加 module script
在 body 末尾、`</body>` 之前添加：
```html
<script type="module">
    import { XiangqiBoard } from '/static/app.js';
    // 模块会自动注册 custom element
    const board = document.createElement('xiangqi-board');
    document.getElementById('app').appendChild(board);
    board.init();
</script>
```

## 最终效果
简化后的 HTML 结构：
- head：meta + title + Google Fonts links
- body：`<div id="app"></div>` + module script
- 访问 http://localhost:8000/ 时仍能正常运行
