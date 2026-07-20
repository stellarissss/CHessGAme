# CheatPanel 修改计划

## 修改目标
将 `_onUse()` 函数中通过 `postMessage` 发送作弊配置的方式，改为直接调用棋盘组件的 `applyCheatPatch` 方法。

## 修改文件
- `/workspace/shared/rpg/cheat_panel.js`

## 具体修改内容

在 `_onUse()` 函数中，将第 125-132 行的代码：

```javascript
// 2. 通过 postMessage 把 modified_configs 发给 iframe
if (data.modified_configs && Object.keys(data.modified_configs).length > 0) {
    RpgShell.sendToIframe({
        type: 'RPG_APPLY_CHEAT',
        modified_configs: data.modified_configs,
        classification: data.classification,
    });
}
```

替换为：

```javascript
// 2. 直接调用棋盘组件的 applyCheatPatch 方法
if (data.modified_configs && Object.keys(data.modified_configs).length > 0) {
    const boardEl = RpgShell.getBoardElement();
    if (boardEl && typeof boardEl.applyCheatPatch === 'function') {
        await boardEl.applyCheatPatch(data.modified_configs);
    }
}
```

## 说明
- `_onUse` 函数本身已经是 `async` 的，所以添加 `await` 没有问题
- 其他代码保持不变
