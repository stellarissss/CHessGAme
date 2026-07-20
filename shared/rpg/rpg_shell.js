/* ═══════════════════════════════════════════════════════════════
   RpgShell - RPG 外壳主控
   章节管理 / iframe postMessage / 状态同步 / 设置
   ═══════════════════════════════════════════════════════════════ */

const RpgShell = (() => {

    // ────────── 状态 ──────────
    let state = {
        energy: 0,
        detection: 0,
        was_detected: false,
        cheats_used: 0,
        turn_count: 0,
        current_chapter: 'ch00_prologue',
        chess_type: null,
        player_side: 'red',
        has_api_key: false,
        chapter_progress: {},
        ending: null,
    };

    let currentChapter = null;       // 当前章节元信息
    let currentBoardElement = null;

    const CHESS_BASE_URLS = {
        xiangqi: 'http://localhost:8000',
        wuziqi: 'http://localhost:8001',
        go: 'http://localhost:8002',
    };
    const CHESS_MODULES = {
        xiangqi: `${CHESS_BASE_URLS.xiangqi}/static/app.js`,
        wuziqi: `${CHESS_BASE_URLS.wuziqi}/static/app.js`,
        go: `${CHESS_BASE_URLS.go}/static/app.js`,
    };
    const CHESS_ELEMENTS = {
        xiangqi: 'xiangqi-board',
        wuziqi: 'wuziqi-board',
        go: 'go-board',
    };

    // ────────── DOM ──────────
    let chapterTitleEl, energyFillEl, energyValueEl, turnCountEl;
    let battleContainer, battlePlaceholder, skipBtn;
    let chapterDrawer, chapterList;
    let settingsModal, apiKeyInput;
    let toastEl;

    // ────────── 初始化 ──────────

    async function init() {
        // DOM 引用
        chapterTitleEl = document.getElementById('rpg-chapter-title');
        energyFillEl = document.getElementById('rpg-energy-fill');
        energyValueEl = document.getElementById('rpg-energy-value');
        turnCountEl = document.getElementById('rpg-turn-count');
        battleContainer = document.getElementById('rpg-battle-container');
        battlePlaceholder = document.getElementById('rpg-battle-placeholder');
        skipBtn = document.getElementById('rpg-btn-skip');
        chapterDrawer = document.getElementById('rpg-chapter-drawer');
        chapterList = document.getElementById('rpg-chapter-list');
        settingsModal = document.getElementById('rpg-settings-modal');
        apiKeyInput = document.getElementById('rpg-api-key-input');
        toastEl = document.getElementById('rpg-toast');

        // 初始化子模块
        StoryLayer.init();
        CheatPanel.init();

        // 绑定事件
        document.getElementById('rpg-btn-menu').addEventListener('click', () => _toggleDrawer(true));
        document.getElementById('rpg-btn-close-drawer').addEventListener('click', () => _toggleDrawer(false));
        document.getElementById('rpg-btn-settings').addEventListener('click', openSettings);
        document.getElementById('rpg-btn-close-settings').addEventListener('click', () => _toggleSettings(false));
        document.getElementById('rpg-btn-save-settings').addEventListener('click', _onSaveSettings);
        skipBtn.addEventListener('click', _onSkipChapter);

        // 绑定 data-action 按钮事件
        document.querySelectorAll('[data-action="settings"]').forEach(btn => {
            btn.addEventListener('click', openSettings);
        });

        // 拉取初始状态
        await refreshState();

        // 默认加载序章（若标题屏激活则跳过——由 rpg_extras 在用户点击「开始游戏」后触发）
        if (!window.__RPG_TITLE_ACTIVE) {
            await loadChapter('ch00_prologue');
        }

        // 渲染章节列表
        await _renderChapterList();
    }

    // ────────── 状态同步 ──────────

    async function refreshState() {
        try {
            const resp = await fetch('/api/rpg/state');
            const data = await resp.json();
            state = { ...state, ...data };
            _updateStateUI();
            CheatPanel.updateStats(state);
        } catch (e) {
            console.error('[RpgShell] refreshState failed:', e);
        }
    }

    function updateState(partial) {
        state = { ...state, ...partial };
        _updateStateUI();
        CheatPanel.updateStats(state);
    }

    function getState() {
        return state;
    }

    function stateHasApiKey() {
        return !!state.has_api_key;
    }

    function _updateStateUI() {
        // 能量条
        const energy = state.energy || 0;
        const pct = Math.max(0, Math.min(100, energy));
        energyFillEl.style.width = pct + '%';
        energyValueEl.textContent = energy;
        if (energy < 0) {
            energyFillEl.classList.add('negative');
        } else {
            energyFillEl.classList.remove('negative');
        }
        // 回合数
        turnCountEl.textContent = `回合 ${state.turn_count || 0}`;
    }

    // ────────── 章节加载 ──────────

    async function loadChapter(chapterId) {
        console.log('[RpgShell] loadChapter:', chapterId);
        // 标题屏激活期间挂起章节加载请求（由 rpg_extras.js 在用户点击「开始游戏」时关闭）
        if (window.__RPG_TITLE_ACTIVE) {
            console.log('[RpgShell] 标题屏激活中，挂起章节加载:', chapterId);
            window.__RPG_PENDING_CHAPTER = chapterId;
            return;
        }
        try {
            const resp = await fetch(`/api/rpg/chapter/${chapterId}`);
            const chapter = await resp.json();
            currentChapter = chapter;
            chapterTitleEl.textContent = chapter.title;

            // 更新章节背景（由 rpg_extras.js 提供像素画背景切换）
            if (window.RpgExtras && typeof window.RpgExtras.updateChapterBackground === 'function') {
                window.RpgExtras.updateChapterBackground(chapterId);
            }

            // 隐藏 VN 舞台
            StoryLayer.hide();

            const chessType = chapter.chess_type;

            if (!chessType) {
                // 纯 VN 章节：播完 VN 后自动进入下一章
                console.log('[RpgShell] 纯 VN 章节，播放剧情:', chapter.story_id);
                _unmountBoard();
                _hidePlaceholder();
                skipBtn.style.display = 'none';
                await _playChapterStory(chapter, {
                    onEnd: async () => {
                        console.log('[RpgShell] 纯 VN 章节播放结束，进入下一章');
                        await _goNextChapter();
                    },
                });
                return;
            }

            if (!chapter.service_up) {
                // 棋类服务不可达
                console.warn('[RpgShell] 棋类服务未启动:', chessType);
                _unmountBoard();
                _showPlaceholder();
                skipBtn.style.display = 'inline-block';
                const portMap = { xiangqi: 8000, wuziqi: 8001, go: 8002 };
                const port = portMap[chessType] || '?';
                toast(`⚠ ${chessType} 服务未启动（端口 ${port}），可跳过本章`, 'error');
                // 仍播放章节 VN
                await _playChapterStory(chapter, { allowSkip: true });
                return;
            }

            // 对战章节：先播放章节 VN，结束后加载 iframe
            console.log('[RpgShell] 对战章节，先播放剧情:', chapter.story_id);
            skipBtn.style.display = 'none';
            _hidePlaceholder();
            await _playChapterStory(chapter, {
                onEnd: async () => {
                    console.log('[RpgShell] 剧情播放完毕，开始对战');
                    _showPlaceholder();
                    await _startBattle(chapter);
                },
            });
        } catch (e) {
            console.error('[RpgShell] loadChapter failed:', e);
            toast(`章节加载失败: ${e.message}`, 'error');
        }
    }

    async function _playChapterStory(chapter, opts = {}) {
        const storyId = chapter.story_id;
        if (!storyId) {
            console.log('[RpgShell] 章节无 story_id，直接结束');
            if (opts.onEnd) opts.onEnd();
            return;
        }
        console.log('[RpgShell] _playChapterStory:', storyId);
        // 检查 story 是否存在
        try {
            const probe = await fetch(`/api/rpg/vn/${storyId}`);
            if (!probe.ok) {
                console.error('[RpgShell] 章节剧情未找到:', storyId, probe.status);
                toast(`章节剧情 ${storyId} 未找到`, 'error');
                _showPlaceholder();
                if (opts.onEnd) opts.onEnd();
                return;
            }
        } catch (e) {
            console.error('[RpgShell] 检查剧情失败:', e);
            _showPlaceholder();
            if (opts.onEnd) opts.onEnd();
            return;
        }

        console.log('[RpgShell] 调用 StoryLayer.playChapter');
        StoryLayer.playChapter(storyId, null, {
            onEnd: () => {
                console.log('[RpgShell] StoryLayer 播放结束');
                StoryLayer.hide();
                if (opts.onEnd) opts.onEnd();
            },
        });
    }

    async function _startBattle(chapter) {
        let data;
        try {
            const resp = await fetch('/api/rpg/battle/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapter_id: chapter.chapter_id }),
            });
            data = await resp.json();
            if (!data.success) {
                toast(`对战开始失败: ${data.message}`, 'error');
                return;
            }
            updateState({
                energy: data.energy,
                chess_type: data.chess_type,
                player_side: data.player_side,
            });
        } catch (e) {
            toast(`对战开始请求失败: ${e.message}`, 'error');
            return;
        }

        try {
            await _mountBoard(chapter.chess_type, data.player_side);
        } catch (e) {
            toast(`棋盘加载失败: ${e.message}`, 'error');
        }
    }

    function _hideBoard() {
        _unmountBoard();
        _showPlaceholder();
    }

    function _hidePlaceholder() {
        if (battlePlaceholder) {
            battlePlaceholder.style.display = 'none';
        }
    }

    function _showPlaceholder() {
        if (battlePlaceholder) {
            battlePlaceholder.style.display = 'flex';
        }
    }

    // ────────── Web Components 棋盘 ──────────

    async function loadChessComponent(chessType) {
        const modulePath = CHESS_MODULES[chessType];
        if (!modulePath) throw new Error(`未知棋类: ${chessType}`);
        await import(modulePath);
        const elementName = CHESS_ELEMENTS[chessType];
        if (!customElements.get(elementName)) {
            throw new Error(`组件 ${elementName} 注册失败`);
        }
        return elementName;
    }

    async function _mountBoard(chessType, playerSide) {
        _unmountBoard();
        const elementName = await loadChessComponent(chessType);
        const boardEl = document.createElement(elementName);
        boardEl.setAttribute('api-base', CHESS_BASE_URLS[chessType]);
        boardEl.setAttribute('player-side', playerSide || 'red');
        boardEl.setAttribute('rpg-mode', '');
        boardEl.addEventListener('move', _onBoardMove);
        boardEl.addEventListener('gameend', _onBoardGameEnd);
        boardEl.addEventListener('ready', _onBoardReady);
        boardEl.addEventListener('error', _onBoardError);
        battlePlaceholder.style.display = 'none';
        battleContainer.appendChild(boardEl);
        currentBoardElement = boardEl;
        await boardEl.init();
        return boardEl;
    }

    function _unmountBoard() {
        if (currentBoardElement) {
            if (typeof currentBoardElement.destroy === 'function') {
                currentBoardElement.destroy();
            }
            currentBoardElement.remove();
            currentBoardElement = null;
        }
    }

    function getBoardElement() {
        return currentBoardElement;
    }

    function _onBoardReady(e) {
        console.log('[RpgShell] 棋盘组件就绪');
    }

    function _onBoardError(e) {
        const msg = e.detail?.message || '未知错误';
        toast(`棋盘错误: ${msg}`, 'error');
    }

    async function _onBoardMove(e) {
        const msg = e.detail;
        try {
            const resp = await fetch('/api/rpg/move_complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    captured: msg.captured || null,
                    mover: msg.mover || null,
                    is_check: !!msg.is_check,
                    game_ended: !!msg.game_ended,
                    winner: msg.winner || null,
                    is_five_in_a_row: !!msg.is_five_in_a_row,
                    go_captures: msg.go_captures || 0,
                }),
            });
            const data = await resp.json();
            if (data.success) {
                updateState({
                    energy: data.energy,
                    turn_count: data.turn_count,
                });
                if (data.reason && data.reason.length > 0) {
                    // 简短提示能量变化
                    toast(data.reason.join(' / '), 'success');
                }
                if (data.game_ended) {
                    _onBoardGameEnd({ detail: { winner: data.winner } });
                }
            }
        } catch (e) {
            console.error('[RpgShell] move_complete failed:', e);
        }
    }

    async function _onBoardGameEnd(e) {
        const msg = e.detail;
        try {
            const resp = await fetch('/api/rpg/battle/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chapter_id: currentChapter.chapter_id,
                    winner: msg.winner,
                }),
            });
            const data = await resp.json();
            if (data.success) {
                updateState(data.state || {});
                // 显示胜负
                const winnerText = msg.winner === state.player_side ? '胜利' : '失败';
                toast(`本局${winnerText}！`, msg.winner === state.player_side ? 'success' : 'error');
                // 播放胜负 VN
                setTimeout(() => {
                    _playOutcomeStory(msg.winner, data.ending);
                }, 1500);
            }
        } catch (e) {
            console.error('[RpgShell] game_end failed:', e);
        }
    }

    async function _playOutcomeStory(winner, ending) {
        const playerWon = winner === state.player_side;
        // 简单胜负旁白，后续章节可扩展为完整 story
        const text = playerWon
            ? '你赢了。\n棋圣系统在你脑中低语：感觉如何？打破规则的力量……是否令你着迷？'
            : '你输了。\n棋圣系统沉默了一瞬：这不是结束。再来一局，你将看到更多。';
        StoryLayer.playSystemMessage(text, {
            onEnd: async () => {
                StoryLayer.hide();
                await _goNextChapter();
            },
        });
    }

    async function _goNextChapter() {
        if (!currentChapter || !currentChapter.next_chapter) {
            // 没有下一章：显示结局
            const ending = state.ending || _computeEnding();
            _showFinalEnding(ending);
            return;
        }
        _unmountBoard();
        await loadChapter(currentChapter.next_chapter);
        await _renderChapterList();
    }

    function _computeEnding() {
        if (state.cheats_used === 0) return 'secret';
        if (state.was_detected) return 'bad';
        return 'good';
    }

    function _showFinalEnding(ending) {
        const labels = {
            good: '🎉 好结局 - 棋圣的胜利',
            bad: '💀 坏结局 - 被识破的真相',
            secret: '🔮 隐藏结局 - 不破不立',
        };
        const text = `你的旅程结束了。\n\n作弊次数：${state.cheats_used}\n曾被发现：${state.was_detected ? '是' : '否'}\n\n${labels[ending] || '结局'}`;
        StoryLayer.playNarration(text);
    }

    async function _onSkipChapter() {
        if (!currentChapter) return;
        // 标记章节跳过
        state.chapter_progress[currentChapter.chapter_id] = 'skipped';
        toast('已跳过本章', 'success');
        await _goNextChapter();
    }

    // ────────── 章节列表 ──────────

    async function _renderChapterList() {
        try {
            const resp = await fetch('/api/rpg/chapters');
            const data = await resp.json();
            chapterList.innerHTML = '';
            Object.entries(data.chapters).forEach(([id, ch]) => {
                const item = document.createElement('div');
                item.className = 'rpg-chapter-item';
                if (id === state.current_chapter) item.classList.add('active');
                const progress = state.chapter_progress[id];
                if (progress === 'completed') item.classList.add('completed');
                if (progress === 'skipped') item.classList.add('skipped');
                item.textContent = ch.title;
                item.onclick = async () => {
                    _toggleDrawer(false);
                    await loadChapter(id);
                    await _renderChapterList();
                };
                chapterList.appendChild(item);
            });
        } catch (e) {
            console.error('[RpgShell] renderChapterList failed:', e);
        }
    }

    function _toggleDrawer(show) {
        chapterDrawer.style.display = show ? 'flex' : 'none';
    }

    // ────────── 设置 ──────────

    async function openSettings() {
        _toggleSettings(true);
        await _refreshSettingsStatus();
    }

    async function _refreshSettingsStatus() {
        const statusEl = document.getElementById('rpg-settings-status');
        try {
            const resp = await fetch('/api/rpg/apikey');
            const data = await resp.json();
            if (data.has_api_key) {
                apiKeyInput.placeholder = `已加载: ${data.masked}（输入新密钥可覆盖）`;
            } else {
                apiKeyInput.placeholder = '输入 API Key 后将自动下发到三个棋类服务';
            }
            if (statusEl) {
                const hasKey = data.has_api_key;
                const chessType = state.chess_type || '—';
                const cheats = state.cheats_used || 0;
                const chapter = state.current_chapter || '—';
                statusEl.innerHTML =
                    `API Key: <span style="color:${hasKey ? 'var(--pix-green)' : 'var(--pix-red-bright)'}">${hasKey ? '已设置' : '未设置'}</span><br>` +
                    `当前章节: <span style="color:var(--pix-cyan-bright)">${chapter}</span><br>` +
                    `当前棋类: <span style="color:var(--pix-gold-bright)">${chessType}</span><br>` +
                    `作弊次数: <span style="color:var(--pix-purple-bright)">${cheats}</span>`;
            }
        } catch (e) {
            console.error('[RpgShell] 刷新设置状态失败:', e);
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:var(--pix-red-bright)">状态加载失败</span>`;
            }
        }
    }

    function _toggleSettings(show) {
        settingsModal.style.display = show ? 'flex' : 'none';
    }

    async function _onSaveSettings() {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            _toggleSettings(false);
            return;
        }
        try {
            const resp = await fetch('/api/rpg/apikey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey }),
            });
            const data = await resp.json();
            if (data.success) {
                state.has_api_key = true;
                toast('API Key 已保存并下发到棋类服务', 'success');
                _toggleSettings(false);
            } else {
                toast('保存失败: ' + (data.message || ''), 'error');
            }
        } catch (e) {
            toast(`保存失败: ${e.message}`, 'error');
        }
    }

    // ────────── Toast ──────────

    let toastTimer = null;
    function toast(text, type = '') {
        if (!toastEl) return;
        toastEl.textContent = text;
        toastEl.className = 'rpg-toast' + (type ? ' ' + type : '');
        toastEl.style.display = 'block';
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.style.display = 'none';
        }, 3000);
    }

    // ────────── 启动 ──────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init,
        refreshState,
        updateState,
        getState,
        stateHasApiKey,
        openSettings,
        getBoardElement,
        toast,
        loadChapter,
    };

})();
