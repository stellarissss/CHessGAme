/* ═══════════════════════════════════════════════════════════════
   AchievementSystem - 成就系统
   成就定义 / 检测引擎 / 存档 / 弹窗 / 页面渲染
   ═══════════════════════════════════════════════════════════════ */

const AchievementSystem = (() => {

    const STORAGE_KEY = 'chess_sage_achievements';
    const RARITY_COLORS = {
        common: '#94a3b8',
        rare: '#60a5fa',
        epic: '#a78bfa',
        legendary: '#fbbf24',
    };
    const CATEGORY_NAMES = {
        chess: '棋盘竞技',
        cheat: '棋圣作弊',
        ai: 'AI 互动',
        secret: '隐藏成就',
    };

    // ────────── 状态 ──────────
    let data = {
        unlocked: {},
        stats: {
            totalMoves: 0,
            totalWins: 0,
            totalCheats: 0,
            totalEnergySpent: 0,
            totalAiChats: 0,
            totalFunChats: 0,
            consecutiveWins: 0,
            currentGameCheats: 0,
            currentGameTurns: 0,
            winsByType: { xiangqi: 0, wuziqi: 0, go: 0 },
            cannonCaptures: 0,
            knightCaptures: 0,
            consecutiveErrors: 0,
            endingsUnlocked: {},
        },
    };
    let modalEl = null;
    let listEl = null;
    let toastQueue = [];
    let isShowingToast = false;

    // ────────── 成就定义 ──────────
    const ACHIEVEMENTS = {
        // ═══ 棋盘类 ═══
        chess_first_move: {
            id: 'chess_first_move',
            name: '第一步',
            description: '完成第一次落子',
            icon: '🎯',
            category: 'chess',
            rarity: 'common',
        },
        chess_first_win: {
            id: 'chess_first_win',
            name: '首胜',
            description: '赢得第一局对战',
            icon: '🏆',
            category: 'chess',
            rarity: 'common',
        },
        chess_ten_soldiers: {
            id: 'chess_ten_soldiers',
            name: '十面埋伏',
            description: '象棋中，你的棋子数量高于20个',
            icon: '♟',
            category: 'chess',
            rarity: 'rare',
        },
        chess_five_in_go: {
            id: 'chess_five_in_go',
            name: '五子棋',
            description: '围棋中，把自己方棋子连成五子',
            icon: '⚫',
            category: 'chess',
            rarity: 'epic',
        },
        chess_undefeated: {
            id: 'chess_undefeated',
            name: '常胜将军',
            description: '连续赢3局',
            icon: '⚔️',
            category: 'chess',
            rarity: 'rare',
        },
        chess_cannon_master: {
            id: 'chess_cannon_master',
            name: '隔山打牛',
            description: '象棋中用炮吃子5次',
            icon: '💥',
            category: 'chess',
            rarity: 'rare',
        },
        chess_knight_dance: {
            id: 'chess_knight_dance',
            name: '马踏飞燕',
            description: '象棋中用马吃子5次',
            icon: '🐎',
            category: 'chess',
            rarity: 'rare',
        },
        chess_perfect_game: {
            id: 'chess_perfect_game',
            name: '完胜',
            description: '赢一局且己方棋子一个都没丢',
            icon: '💎',
            category: 'chess',
            rarity: 'epic',
        },
        chess_long_game: {
            id: 'chess_long_game',
            name: '持久战',
            description: '单局超过50回合',
            icon: '⏳',
            category: 'chess',
            rarity: 'rare',
        },
        chess_all_types: {
            id: 'chess_all_types',
            name: '全能选手',
            description: '三种棋类各赢一局',
            icon: '🎖️',
            category: 'chess',
            rarity: 'epic',
        },

        // ═══ 作弊类 ═══
        cheat_first: {
            id: 'cheat_first',
            name: '初窥门径',
            description: '第一次使用作弊',
            icon: '✨',
            category: 'cheat',
            rarity: 'common',
        },
        cheat_palette: {
            id: 'cheat_palette',
            name: '调色板',
            description: '让你的任意棋盘变色',
            icon: '🎨',
            category: 'cheat',
            rarity: 'rare',
        },
        cheat_reality_gem: {
            id: 'cheat_reality_gem',
            name: '现实宝石',
            description: '改变任意棋盘的线条框架',
            icon: '💠',
            category: 'cheat',
            rarity: 'epic',
        },
        cheat_freeze: {
            id: 'cheat_freeze',
            name: '时间停止',
            description: '让AI连续跳过3回合',
            icon: '❄️',
            category: 'cheat',
            rarity: 'rare',
        },
        cheat_control: {
            id: 'cheat_control',
            name: '夺舍',
            description: '让AI替你走一步',
            icon: '👻',
            category: 'cheat',
            rarity: 'rare',
        },
        cheat_chaos: {
            id: 'cheat_chaos',
            name: '混乱之治',
            description: '让对手随机走棋',
            icon: '🌀',
            category: 'cheat',
            rarity: 'rare',
        },
        cheat_double_turn: {
            id: 'cheat_double_turn',
            name: '再来一回合',
            description: '让自己多走一回合',
            icon: '🔄',
            category: 'cheat',
            rarity: 'rare',
        },
        cheat_god_mode: {
            id: 'cheat_god_mode',
            name: '我即是神',
            description: '单局使用作弊超过5次',
            icon: '👑',
            category: 'cheat',
            rarity: 'epic',
        },
        cheat_big_spender: {
            id: 'cheat_big_spender',
            name: '能量大户',
            description: '累计消耗能量超过100',
            icon: '⚡',
            category: 'cheat',
            rarity: 'rare',
        },
        cheat_cheat_master: {
            id: 'cheat_cheat_master',
            name: '棋圣降临',
            description: '累计使用作弊超过20次',
            icon: '🌟',
            category: 'cheat',
            rarity: 'legendary',
        },

        // ═══ AI 互动类 ═══
        ai_first_chat: {
            id: 'ai_first_chat',
            name: '你好，棋圣',
            description: '第一次和AI对话',
            icon: '👋',
            category: 'ai',
            rarity: 'common',
        },
        ai_talking_nonsense: {
            id: 'ai_talking_nonsense',
            name: '你在干嘛',
            description: '和ChatAI谈论无关的事情',
            icon: '💬',
            category: 'ai',
            rarity: 'rare',
        },
        ai_rejected: {
            id: 'ai_rejected',
            name: '这不行',
            description: '作弊被AI拒绝',
            icon: '🚫',
            category: 'ai',
            rarity: 'common',
        },
        ai_confused: {
            id: 'ai_confused',
            name: 'AI 也懵了',
            description: 'AI 连续出错3次',
            icon: '🤯',
            category: 'ai',
            rarity: 'rare',
        },
        ai_deep_think: {
            id: 'ai_deep_think',
            name: '深思熟虑',
            description: 'AI 思考时间超过10秒',
            icon: '🧠',
            category: 'ai',
            rarity: 'epic',
        },
        ai_best_friend: {
            id: 'ai_best_friend',
            name: '最佳损友',
            description: '和AI闲聊超过10次',
            icon: '🤝',
            category: 'ai',
            rarity: 'epic',
        },

        // ═══ 隐藏类 ═══
        secret_pure: {
            id: 'secret_pure',
            name: '纯白无瑕',
            description: '零作弊通关一局',
            icon: '🕊️',
            category: 'secret',
            rarity: 'legendary',
        },
        secret_detected: {
            id: 'secret_detected',
            name: '东窗事发',
            description: '第一次被识破',
            icon: '🕵️',
            category: 'secret',
            rarity: 'epic',
        },
        secret_all_endings: {
            id: 'secret_all_endings',
            name: '全结局收集者',
            description: '解锁所有三个结局',
            icon: '📚',
            category: 'secret',
            rarity: 'legendary',
        },
        secret_hundred_turns: {
            id: 'secret_hundred_turns',
            name: '百年孤独',
            description: '单局达到100回合',
            icon: '🏯',
            category: 'secret',
            rarity: 'legendary',
        },
    };

    // ────────── 存档 ──────────
    function load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                data.unlocked = parsed.unlocked || {};
                if (parsed.stats) {
                    data.stats = { ...data.stats, ...parsed.stats };
                }
            }
        } catch (e) {
            console.error('[Achievement] load failed:', e);
        }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('[Achievement] save failed:', e);
        }
    }

    function reset() {
        data = {
            unlocked: {},
            stats: {
                totalMoves: 0,
                totalWins: 0,
                totalCheats: 0,
                totalEnergySpent: 0,
                totalAiChats: 0,
                totalFunChats: 0,
                consecutiveWins: 0,
                currentGameCheats: 0,
                currentGameTurns: 0,
                winsByType: { xiangqi: 0, wuziqi: 0, go: 0 },
                cannonCaptures: 0,
                knightCaptures: 0,
                consecutiveErrors: 0,
                endingsUnlocked: {},
            },
        };
        save();
        renderList();
    }

    // ────────── 解锁逻辑 ──────────
    function unlock(id) {
        if (data.unlocked[id]) return false;
        const ach = ACHIEVEMENTS[id];
        if (!ach) return false;

        data.unlocked[id] = {
            unlockedAt: Date.now(),
        };
        save();
        _showUnlockToast(ach);
        return true;
    }

    function isUnlocked(id) {
        return !!data.unlocked[id];
    }

    function getUnlockedCount() {
        return Object.keys(data.unlocked).length;
    }

    function getTotalCount() {
        return Object.keys(ACHIEVEMENTS).length;
    }

    // ────────── 事件触发 ──────────
    function onMove(context) {
        data.stats.totalMoves++;
        data.stats.currentGameTurns++;

        // 第一步
        if (data.stats.totalMoves === 1) {
            unlock('chess_first_move');
        }

        // 持久战
        if (data.stats.currentGameTurns === 50) {
            unlock('chess_long_game');
        }

        // 百年孤独
        if (data.stats.currentGameTurns === 100) {
            unlock('secret_hundred_turns');
        }

        // 十面埋伏（象棋）
        if (context.chessType === 'xiangqi' && context.playerPieceCount > 20) {
            unlock('chess_ten_soldiers');
        }

        // 炮吃子统计
        if (context.capturedPieceType === 'cannon') {
            data.stats.cannonCaptures++;
            if (data.stats.cannonCaptures >= 5) {
                unlock('chess_cannon_master');
            }
        }

        // 马吃子统计
        if (context.capturedPieceType === 'horse') {
            data.stats.knightCaptures++;
            if (data.stats.knightCaptures >= 5) {
                unlock('chess_knight_dance');
            }
        }

        // 围棋五子连珠
        if (context.chessType === 'go' && context.hasFiveInRow) {
            unlock('chess_five_in_go');
        }

        save();
    }

    function onGameEnd(context) {
        if (context.won) {
            data.stats.totalWins++;
            data.stats.consecutiveWins++;
            if (context.chessType && data.stats.winsByType[context.chessType] !== undefined) {
                data.stats.winsByType[context.chessType]++;
            }

            // 首胜
            if (data.stats.totalWins === 1) {
                unlock('chess_first_win');
            }

            // 常胜将军
            if (data.stats.consecutiveWins >= 3) {
                unlock('chess_undefeated');
            }

            // 全能选手
            const allTypes = ['xiangqi', 'wuziqi', 'go'];
            if (allTypes.every(t => (data.stats.winsByType[t] || 0) > 0)) {
                unlock('chess_all_types');
            }

            // 纯白无瑕
            if (data.stats.currentGameCheats === 0) {
                unlock('secret_pure');
            }

            // 完胜
            if (context.playerPieceCount !== undefined && context.initialPieceCount !== undefined
                && context.playerPieceCount >= context.initialPieceCount) {
                unlock('chess_perfect_game');
            }

            // 结局收集
            if (context.ending) {
                data.stats.endingsUnlocked[context.ending] = true;
                const endings = Object.keys(data.stats.endingsUnlocked).length;
                if (endings >= 3) {
                    unlock('secret_all_endings');
                }
            }
        } else {
            data.stats.consecutiveWins = 0;
        }

        // 重置单局统计
        data.stats.currentGameCheats = 0;
        data.stats.currentGameTurns = 0;

        save();
    }

    function onCheat(context) {
        data.stats.totalCheats++;
        data.stats.currentGameCheats++;
        if (context.costEnergy) {
            data.stats.totalEnergySpent += context.costEnergy;
        }

        // 初窥门径
        if (data.stats.totalCheats === 1) {
            unlock('cheat_first');
        }

        // 我即是神
        if (data.stats.currentGameCheats >= 5) {
            unlock('cheat_god_mode');
        }

        // 棋圣降临
        if (data.stats.totalCheats >= 20) {
            unlock('cheat_cheat_master');
        }

        // 能量大户
        if (data.stats.totalEnergySpent >= 100) {
            unlock('cheat_big_spender');
        }

        // 分析作弊类型
        if (context.patchPaths) {
            const paths = context.patchPaths || [];
            // 调色板 - 修改颜色
            if (paths.some(p => p.includes('color') || p.includes('theme') || p.includes('ui_config'))) {
                unlock('cheat_palette');
            }
            // 现实宝石 - 修改棋盘线条/框架
            if (paths.some(p => p.includes('board') || p.includes('grid') || p.includes('line') || p.includes('frame'))) {
                unlock('cheat_reality_gem');
            }
            // 时间停止 - skip_turns
            if (paths.some(p => p.includes('skip_turns')) && context.skipTurns >= 3) {
                unlock('cheat_freeze');
            }
            // 夺舍 - ai_control
            if (paths.some(p => p.includes('ai_control'))) {
                unlock('cheat_control');
            }
            // 混乱之治 - random_moves
            if (paths.some(p => p.includes('random_moves'))) {
                unlock('cheat_chaos');
            }
            // 再来一回合 - extra_turns
            if (paths.some(p => p.includes('extra_turns'))) {
                unlock('cheat_double_turn');
            }
        }

        save();
    }

    function onAiResponse(context) {
        data.stats.totalAiChats++;
        data.stats.consecutiveErrors = 0;

        // 你好，棋圣
        if (data.stats.totalAiChats === 1) {
            unlock('ai_first_chat');
        }

        // 你在干嘛
        if (context.type === 'fun') {
            data.stats.totalFunChats++;
            unlock('ai_talking_nonsense');
            // 最佳损友
            if (data.stats.totalFunChats >= 10) {
                unlock('ai_best_friend');
            }
        }

        // 这不行
        if (context.type === 'rejected') {
            unlock('ai_rejected');
        }

        // 深思熟虑
        if (context.responseTime && context.responseTime > 10000) {
            unlock('ai_deep_think');
        }

        save();
    }

    function onAiError() {
        data.stats.consecutiveErrors++;
        if (data.stats.consecutiveErrors >= 3) {
            unlock('ai_confused');
        }
        save();
    }

    function onDetected() {
        unlock('secret_detected');
    }

    function onEnding(endingType) {
        if (!endingType) return;
        data.stats.endingsUnlocked[endingType] = true;
        const count = Object.keys(data.stats.endingsUnlocked).length;
        if (count >= 3) {
            unlock('secret_all_endings');
        }
        save();
    }

    // ────────── 弹窗 ──────────
    function _showUnlockToast(achievement) {
        toastQueue.push(achievement);
        if (!isShowingToast) {
            _processToastQueue();
        }
    }

    function _processToastQueue() {
        if (toastQueue.length === 0) {
            isShowingToast = false;
            return;
        }
        isShowingToast = true;
        const ach = toastQueue.shift();
        const color = RARITY_COLORS[ach.rarity] || '#fff';

        let toast = document.getElementById('rpg-achievement-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'rpg-achievement-toast';
            toast.className = 'rpg-achievement-toast';
            document.body.appendChild(toast);
        }

        toast.innerHTML = `
            <div class="rpg-achievement-toast-icon" style="color:${color}">${ach.icon}</div>
            <div class="rpg-achievement-toast-text">
                <div class="rpg-achievement-toast-label">成就解锁</div>
                <div class="rpg-achievement-toast-name">${ach.name}</div>
                <div class="rpg-achievement-toast-desc">${ach.description}</div>
            </div>
        `;

        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                _processToastQueue();
            }, 300);
        }, 3500);
    }

    // ────────── 成就页面 ──────────
    function openModal() {
        if (!modalEl) {
            _initModal();
        }
        renderList();
        modalEl.style.display = 'flex';
    }

    function closeModal() {
        if (modalEl) {
            modalEl.style.display = 'none';
        }
    }

    function _initModal() {
        modalEl = document.createElement('div');
        modalEl.id = 'rpg-achievement-modal';
        modalEl.className = 'rpg-modal rpg-achievement-modal';
        modalEl.style.display = 'none';
        modalEl.innerHTML = `
            <div class="rpg-modal-content rpg-modal-large rpg-achievement-content">
                <div class="rpg-achievement-header">
                    <h3>🏆 成就殿堂</h3>
                    <div class="rpg-achievement-progress">
                        <span id="rpg-achievement-count">0 / 0</span>
                    </div>
                    <button class="rpg-btn-icon" id="rpg-btn-close-achievement" title="关闭">✕</button>
                </div>
                <div class="rpg-achievement-tabs">
                    <button class="rpg-achievement-tab active" data-cat="all">全部</button>
                    <button class="rpg-achievement-tab" data-cat="chess">棋盘竞技</button>
                    <button class="rpg-achievement-tab" data-cat="cheat">棋圣作弊</button>
                    <button class="rpg-achievement-tab" data-cat="ai">AI 互动</button>
                    <button class="rpg-achievement-tab" data-cat="secret">隐藏成就</button>
                </div>
                <div id="rpg-achievement-list" class="rpg-achievement-list"></div>
                <div class="rpg-modal-buttons">
                    <button class="rpg-btn rpg-btn-ghost" id="rpg-btn-reset-achievements">重置成就</button>
                    <button class="rpg-btn rpg-btn-primary" id="rpg-btn-close-achievement2">关闭</button>
                </div>
            </div>
        `;
        document.getElementById('rpg-app').appendChild(modalEl);

        listEl = document.getElementById('rpg-achievement-list');

        document.getElementById('rpg-btn-close-achievement').addEventListener('click', closeModal);
        document.getElementById('rpg-btn-close-achievement2').addEventListener('click', closeModal);
        document.getElementById('rpg-btn-reset-achievements').addEventListener('click', () => {
            if (confirm('确定要重置所有成就吗？此操作不可撤销。')) {
                reset();
            }
        });

        // Tabs
        modalEl.querySelectorAll('.rpg-achievement-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                modalEl.querySelectorAll('.rpg-achievement-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderList(tab.dataset.cat);
            });
        });

        // 点击背景关闭
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModal();
        });
    }

    function renderList(category = 'all') {
        if (!listEl) return;

        const countEl = document.getElementById('rpg-achievement-count');
        if (countEl) {
            countEl.textContent = `${getUnlockedCount()} / ${getTotalCount()}`;
        }

        let items = Object.values(ACHIEVEMENTS);
        if (category !== 'all') {
            items = items.filter(a => a.category === category);
        }

        listEl.innerHTML = items.map(ach => {
            const unlocked = isUnlocked(ach.id);
            const color = RARITY_COLORS[ach.rarity] || '#94a3b8';
            const catName = CATEGORY_NAMES[ach.category] || ach.category;
            return `
                <div class="rpg-achievement-item ${unlocked ? 'unlocked' : 'locked'}" 
                     style="border-color:${unlocked ? color : 'transparent'}">
                    <div class="rpg-achievement-icon" style="color:${unlocked ? color : '#4b5563'}">
                        ${unlocked ? ach.icon : '🔒'}
                    </div>
                    <div class="rpg-achievement-info">
                        <div class="rpg-achievement-name" style="color:${unlocked ? color : '#6b7280'}">
                            ${unlocked ? ach.name : '???'}
                        </div>
                        <div class="rpg-achievement-desc">
                            ${unlocked ? ach.description : '未解锁'}
                        </div>
                        <div class="rpg-achievement-meta">
                            <span class="rpg-achievement-rarity" style="color:${color}">${_rarityName(ach.rarity)}</span>
                            <span class="rpg-achievement-cat">${catName}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function _rarityName(rarity) {
        const names = {
            common: '普通',
            rare: '稀有',
            epic: '史诗',
            legendary: '传说',
        };
        return names[rarity] || rarity;
    }

    // ────────── 围棋五连检测辅助 ──────────
    function checkGoFiveInRow(boardState, playerSide) {
        if (!boardState || !boardState.pieces) return false;
        const size = boardState.board_size || 9;
        const pieces = boardState.pieces.filter(p => p.is_alive && p.owner === playerSide);
        const grid = {};
        pieces.forEach(p => {
            const key = `${p.position[0]},${p.position[1]}`;
            grid[key] = true;
        });
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (const p of pieces) {
            const [x, y] = p.position;
            for (const [dx, dy] of directions) {
                let count = 1;
                let nx = x + dx, ny = y + dy;
                while (grid[`${nx},${ny}`]) {
                    count++;
                    nx += dx; ny += dy;
                }
                nx = x - dx; ny = y - dy;
                while (grid[`${nx},${ny}`]) {
                    count++;
                    nx -= dx; ny -= dy;
                }
                if (count >= 5) return true;
            }
        }
        return false;
    }

    // ────────── 初始化 ──────────
    function init() {
        load();
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init,
        openModal,
        closeModal,
        unlock,
        isUnlocked,
        getUnlockedCount,
        getTotalCount,
        onMove,
        onGameEnd,
        onCheat,
        onAiResponse,
        onAiError,
        onDetected,
        onEnding,
        checkGoFiveInRow,
        reset,
        renderList,
        ACHIEVEMENTS,
        get stats() { return data.stats; },
    };
})();