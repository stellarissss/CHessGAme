/* ═══════════════════════════════════════════════════════════════
   RPG Adapter - 棋类服务与 RPG 外壳通信适配器
   兼容层：支持 iframe postMessage 和 Web Components 两种通信模式
   ═══════════════════════════════════════════════════════════════ */

(() => {
    const RPG_MODE_PARAM = 'rpg';
    const isRpgMode = () => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(RPG_MODE_PARAM) === '1';
    };

    if (!isRpgMode()) {
        return;
    }

    let parentWindow = window.parent;
    let boardApp = null;

    const MESSAGE_TYPES = {
        RPG_INIT: 'RPG_INIT',
        RPG_READY: 'RPG_READY',
        RPG_MOVE_COMPLETE: 'RPG_MOVE_COMPLETE',
        RPG_GAME_END: 'RPG_GAME_END',
        RPG_APPLY_CHEAT: 'RPG_APPLY_CHEAT',
        RPG_CHEAT_APPLIED: 'RPG_CHEAT_APPLIED',
    };

    function sendMessage(type, data = {}) {
        try {
            parentWindow.postMessage({
                type,
                timestamp: Date.now(),
                ...data,
            }, '*');
        } catch (e) {
            console.error('[RpgAdapter] postMessage failed:', e);
        }
    }

    function findBoardApp() {
        const boardEls = [
            document.querySelector('xiangqi-board'),
            document.querySelector('wuziqi-board'),
            document.querySelector('go-board'),
        ];
        return boardEls.find(el => el !== null);
    }

    async function refreshBoard() {
        if (!boardApp) {
            boardApp = findBoardApp();
        }
        if (boardApp && typeof boardApp.loadConfigs === 'function') {
            await boardApp.loadConfigs();
            if (typeof boardApp.renderStones === 'function') {
                boardApp.renderStones();
            }
        }
    }

    function handleMoveComplete(detail) {
        sendMessage(MESSAGE_TYPES.RPG_MOVE_COMPLETE, {
            captured: detail.captured || null,
            mover: detail.mover || null,
            is_check: !!detail.is_check,
            game_ended: !!detail.game_ended,
            winner: detail.winner || null,
            is_five_in_a_row: !!detail.is_five_in_a_row,
            go_captures: detail.go_captures || 0,
        });
    }

    function handleGameEnd(detail) {
        sendMessage(MESSAGE_TYPES.RPG_GAME_END, {
            winner: detail.winner || null,
            win_condition: detail.win_condition || null,
        });
    }

    function handleReady() {
        sendMessage(MESSAGE_TYPES.RPG_READY, {
            chess_type: boardApp?.chessType || 'unknown',
            player_side: boardApp?.playerSide || 'black',
        });
    }

    function bindBoardEvents() {
        boardApp = findBoardApp();
        if (!boardApp) {
            setTimeout(bindBoardEvents, 100);
            return;
        }

        boardApp.addEventListener('move', (e) => {
            handleMoveComplete(e.detail);
        });

        boardApp.addEventListener('gameend', (e) => {
            handleGameEnd(e.detail);
        });

        boardApp.addEventListener('ready', () => {
            handleReady();
        });

        if (boardApp._initialized) {
            handleReady();
        }
    }

    function init() {
        bindBoardEvents();

        window.addEventListener('message', (e) => {
            const msg = e.data;
            if (!msg || !msg.type) return;

            switch (msg.type) {
                case MESSAGE_TYPES.RPG_INIT:
                    console.log('[RpgAdapter] Received RPG_INIT');
                    handleReady();
                    break;

                case MESSAGE_TYPES.RPG_APPLY_CHEAT:
                    console.log('[RpgAdapter] Received RPG_APPLY_CHEAT:', msg);
                    (async () => {
                        try {
                            await refreshBoard();
                            sendMessage(MESSAGE_TYPES.RPG_CHEAT_APPLIED, { success: true });
                        } catch (err) {
                            sendMessage(MESSAGE_TYPES.RPG_CHEAT_APPLIED, {
                                success: false,
                                message: err.message,
                            });
                        }
                    })();
                    break;

                default:
                    break;
            }
        });

        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            const url = args[0] instanceof Request ? args[0].url : args[0];

            if (url.includes('/api/move') || url.includes('/api/ai_move')) {
                try {
                    const cloned = response.clone();
                    const data = await cloned.json();
                    if (data.board_state) {
                        const gameStatus = data.board_state.game_status || {};
                        const captures = data.board_state.captures || {};

                        if (gameStatus.state === 'ended') {
                            handleGameEnd({
                                winner: gameStatus.winner,
                                win_condition: gameStatus.win_condition,
                            });
                        } else {
                            handleMoveComplete({
                                captured: null,
                                mover: data.board_state.current_turn === 'black' ? 'white' : 'black',
                                game_ended: false,
                                go_captures: (captures.black || 0) + (captures.white || 0),
                            });
                        }
                    }
                } catch (e) {
                    console.error('[RpgAdapter] fetch hook error:', e);
                }
            }

            return response;
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();