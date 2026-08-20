# 剩余 Bug 修复与 v1.1.1 发行计划

## 摘要

前一轮已修复 4 大 bug (业力同步/下一关/重置/缓存) 并发布 v1.1.0。深度审查后发现 **1 个遗漏 bug**: 象棋(主模式)的"重置所有配置"按钮未接入 Samsara 重置, 导致重置后业力/关卡不归零。本计划修复此 bug 并重新打包发行为 v1.1.1。

## 当前状态分析

### 已完成 (v1.1.0, commit 30b5142)
- 6 RPG + 6 沙盒 `GameSharedRPG.install()` / 内联等价实现 ✅
- `game_base.py` 默认 `_after_reset_board` 业力同步 ✅
- `samsara/api.py` `levels/advance` + `reset(mode)` + `Cache-Control` ✅
- `hub/app.js` BroadcastChannel 事件驱动刷新 ✅
- 12 TDD passed, 14 JS 语法 OK ✅
- git 已推送, Release v1.1.0 已创建 ✅

### 遗漏 Bug
- **文件**: [xiangqi/static/app.js](file:///workspace/CHessGAme/xiangqi/static/app.js) 第 5040-5057 行
- **问题**: 象棋主模式的"重置所有配置"按钮仅调用 `/api/reset_configs` (重置本地棋类配置), 未调用 `/samsara/api/reset` (重置业力/关卡), 也未调用 `rpgResetConfigsHandler`
- **根因**: xiangqi 是"先导实现", 内联了 `rpgResetBattleAndApply` / `advanceNextLevel` / `showGameOver` 等方法, 但漏掉了 `rpgResetConfigsHandler`。其他 5 个棋类通过 `GameSharedRPG.install()` 自动绑定了此方法
- **影响**: 玩家在象棋界面点"重置所有配置"后, 棋盘配置重置了但业力和关卡数不变 → 对应 bug #3
- **对比**: wuziqi/weiqi/dongwuqi/tiaoqi/heibaiqi 均正确调用 `rpgResetConfigsHandler('soft')` ✅; 6 个沙盒也正确 ✅

## 修改方案

### 1. xiangqi/static/app.js — 新增 rpgResetConfigsHandler 内联方法

在 `rpgResetBattleAndApply` 方法之后 (约第 3095 行), 新增内联 `rpgResetConfigsHandler` 方法, 逻辑与 `shared/game_shared_rpg.js` 中的 `rpgResetConfigsHandler` 完全一致:

```javascript
async rpgResetConfigsHandler(hardOrSoft) {
    const mode = hardOrSoft === 'hard' ? 'hard' : 'soft';
    // 1. 重置本地棋类配置
    try {
        const r = await this._fetchRaw(`${this.apiBase}/api/reset_configs`, { method: 'POST' });
        const data = (r && r.ok) ? await r.json() : null;
        if (data && !data.success) console.warn('[RPG] reset_configs failed');
    } catch (e) { console.warn('[RPG] reset_configs failed', e); }

    // 2. 非沙盒: 重置 Samsara 业力/关卡
    if (!this.isSandbox) {
        try {
            const r = await fetch('/samsara/api/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode }),
            });
            if (r.ok) {
                try {
                    const d = await r.json();
                    if (d && d.state) { this.samsaraState = d.state; this.updateSamsaraUI(); }
                } catch (e) {}
            }
        } catch (e) { console.warn('[RPG] samsara reset failed', e); }

        if (mode === 'hard') {
            try {
                await fetch('/api/achievements/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'all' }),
                });
            } catch (e) {}
        }
        this._fireLocalAndBroadcast('reset-issued', { mode });
    }

    // 3. 三件套 + 全重绘
    await this.rpgResetBattleAndApply({ doSamsaraResetLevel: true, doBroadcast: true });
    if (typeof this.loadConfigs === 'function') await this.loadConfigs();
    if (this.lastMove !== undefined) this.lastMove = null;
    if (typeof this._rpgRerender === 'function') await this._rpgRerender(this);
    this.addMessage('✅ 所有配置已重置' + (mode === 'hard' ? '（含存档）' : ''), 'success');
}
```

### 2. xiangqi/static/app.js — 修改按钮事件处理器

将第 5040-5057 行的内联处理器替换为:

```javascript
this.shadowRoot.getElementById('btn-reset-configs').addEventListener('click', async () => {
    if (!confirm('确定要重置所有配置吗？所有自定义规则将被清除。')) return;
    await this.rpgResetConfigsHandler('soft');
});
```

### 3. 验证步骤
1. `node -c xiangqi/static/app.js` — 语法检查
2. `python3 -m pytest tests/ -q` — TDD 回归
3. 启动服务冒烟: `curl -X POST http://127.0.0.1:8000/api/reset_configs` 确认 200
4. git add + commit + push origin main
5. `python3 build_game.py --skip-pyi` — 重新打包
6. `zip -9` 压缩 dist/chesssage/
7. `gh release create v1.1.1` 上传发行包

## 假设与决策
- **决策**: 使用内联方法而非 `GameSharedRPG.install()`, 因为 xiangqi 已有大量内联 RPG 方法, 强行接入共享模块可能产生方法覆盖冲突。保持一致性但最小化改动范围。
- **不做的事**: 不重构 xiangqi 去使用共享模块 (风险大、收益低, 不在用户要求范围内)
- **发行版本号**: v1.1.1 (补丁版本, 表示在 v1.1.0 基础上的 bug 修复)
