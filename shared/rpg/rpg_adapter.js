/* ═══════════════════════════════════════════════════════════════
   RpgAdapter - 棋类 iframe 适配器（三种棋类共用）
   棋类本身零改动，只需在 index.html 末尾加一行 script 引用。
   ═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // 仅在 RPG 模式下启用（URL 带 ?rpg=1）
    const params = new URLSearchParams(window.location.search);
    if (params.get('rpg') !== '1') {
        return;
    }

    const PARENT = window.parent;
    if (!PARENT || PARENT === window) {
        // 不在 iframe 中
        return;
    }

    console.log('[RpgAdapter] RPG 模式已启用');

    // ────────── 1. UI 改造：隐藏原生输入区，重命名侧栏标题 ──────────

    function tweakUI() {
        // 隐藏原生指令输入区
        document.querySelectorAll('.input-section').forEach(el => {
            el.style.display = 'none';
        });
        // 把「AI 助手」改为「棋圣系统」（xq/wz 的 index.html 用 data-num="01"）
        const aiTitle = document.querySelector('h3[data-num="01"]');
        if (aiTitle) {
            aiTitle.textContent = '棋圣系统';
        }
        // 隐藏「操作」面板中无用的按钮（防止玩家手动 reset 干扰 RPG 流程）
        // 但保留悔棋和重新开始，因为它们也是游戏体验
    }

    // ────────── 2. postMessage 协议 ──────────

    function postToParent(msg) {
        PARENT.postMessage(msg, '*');
    }

    function handleMessage(event) {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'RPG_INIT':
                console.log('[RpgAdapter] 收到 RPG_INIT:', msg);
                // 已 ready，回发确认
                postToParent({ type: 'RPG_READY', chapter_id: msg.chapter_id });
                break;
            case 'RPG_APPLY_CHEAT':
                console.log('[RpgAdapter] 收到 RPG_APPLY_CHEAT:', msg);
                applyCheatToBoard(msg.modified_configs || {}, msg.classification);
                break;
        }
    }

    // ────────── 3. 应用作弊到棋盘 ──────────

    async function applyCheatToBoard(modifiedConfigs, classification) {
        // modified_configs 是 {config_name: new_value} 的字典
        // 通过棋类 /api/rpg/apply_patch 应用 patch
        // 但更简单：直接用棋类已应用的 modified_configs（棋类 /api/command 已 apply_config_update）
        // 所以这里只需通知前端 app.js 刷新棋盘渲染
        try {
            // 棋类 /api/command 已经在 ai_orchestrator.process_command 中 apply_config_update，
            // 也就是说 modified_configs 已经写入棋类 state.configs。
            // 我们只需让前端 app.js 重新拉取 /api/config/all 并重新渲染。
            if (window.app && typeof window.app.loadConfigs === 'function') {
                await window.app.loadConfigs();
            } else if (window.app && typeof window.app.refresh === 'function') {
                await window.app.refresh();
            } else {
                // 兜底：刷新整个棋盘
                if (typeof fetchBoardState === 'function') {
                    await fetchBoardState();
                } else {
                    console.warn('[RpgAdapter] 找不到 app.loadConfigs / app.refresh，可能棋盘未自动刷新');
                }
            }
            postToParent({ type: 'RPG_CHEAT_APPLIED', success: true, classification });
        } catch (e) {
            console.error('[RpgAdapter] applyCheatToBoard failed:', e);
            postToParent({ type: 'RPG_CHEAT_APPLIED', success: false, error: e.message });
        }
    }

    // ────────── 4. Hook window.fetch：拦截 /api/move /api/ai_move 响应 ──────────

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const resp = await originalFetch.apply(this, args);
        const url = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');

        // 只关心 POST /api/move 或 /api/ai_move
        if (resp.ok && (url.includes('/api/move') || url.includes('/api/ai_move'))) {
            try {
                // clone 后读取 body（原 resp 已被消费会报错）
                const clone = resp.clone();
                const data = await clone.json();
                _reportMoveComplete(url, data);
            } catch (e) {
                // 解析失败忽略
            }
        }
        return resp;
    };

    function _reportMoveComplete(url, data) {
        if (!data || !data.success) return;
        const boardState = data.board_state;
        if (!boardState) return;

        // 从 move_history[-1] 推导 captured
        const history = boardState.move_history || [];
        const lastMove = history[history.length - 1] || {};
        const captured = lastMove.captured || null;

        // 从 game_status 推导 game_ended / winner
        const status = boardState.game_status || {};
        const gameEnded = status.state === 'ended';
        const winner = status.winner || null;
        const winCondition = status.win_condition || '';

        // 判定 mover：
        //   - url 含 /api/move → 玩家方
        //   - url 含 /api/ai_move → AI 方
        const playerSide = boardState.player_side || 'red';
        let mover;
        if (url.includes('/api/ai_move')) {
            mover = (playerSide === 'red') ? 'black' : 'red';
        } else {
            mover = playerSide;
        }

        // 判定 is_five_in_a_row
        const isFiveInARow = (winCondition === 'five_in_a_row');

        // 判定 is_check（象棋专用）：简单做法——根据 win_condition 不容易区分将军，
        // 这里默认 false，由 RPG 后端机制兜底（执行方案允许简化）
        const isCheck = false;

        postToParent({
            type: 'RPG_MOVE_COMPLETE',
            captured,
            mover,
            is_check: isCheck,
            game_ended: gameEnded,
            winner,
            is_five_in_a_row: isFiveInARow,
            move_url: url,
        });

        if (gameEnded) {
            postToParent({
                type: 'RPG_GAME_END',
                winner,
                win_condition: winCondition,
            });
        }
    }

    // ────────── 5. 启动 ──────────

    window.addEventListener('message', handleMessage);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            tweakUI();
            // iframe 加载完成后回发 READY（不等 RPG_INIT）
            postToParent({ type: 'RPG_READY' });
        });
    } else {
        tweakUI();
        postToParent({ type: 'RPG_READY' });
    }

})();
