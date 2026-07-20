# 五子棋 index.html 适配 Web Component 架构计划

## 目标
将 `/workspace/wuziqi/static/index.html` 修改为 Web Component 架构，参考 `/workspace/xiangqi/static/index.html` 的实现。

## 修改内容

### 1. head 部分
- 保留 Google Fonts 相关 link（preconnect 和 fonts css）
- 移除 `<link rel="stylesheet" href="/static/style.css">`

### 2. body 部分
- 只保留 `<div id="app"></div>`，移除内部所有其他 HTML 元素（包括 thinking-overlay、settings-modal、logs-modal、header、main、footer 等所有子元素）

### 3. script 部分
- 移除旧的 script 标签：
  - `<script src="/static/app.js"></script>`
  - `<script src="http://localhost:80/shared/rpg/rpg_adapter.js"></script>`
- 在 body 末尾添加 module script：
```html
<script type="module">
    import { WuziqiBoard } from '/static/app.js';
    const board = document.createElement('wuziqi-board');
    document.getElementById('app').appendChild(board);
    board.init();
</script>
```

## 最终效果
修改后的 index.html 结构将与 xiangqi 的 index.html 一致，只是将 XiangqiBoard 替换为 WuziqiBoard，xiangqi-board 替换为 wuziqi-board。
