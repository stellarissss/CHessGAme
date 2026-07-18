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
    let iframe = null;
    let iframeReady = false;
    let pendingInit = false;

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
        iframe = document.getElementById('rpg-chess-iframe');
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

        // postMessage 监听
        window.addEventListener('message', _onIframeMessage);

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
        // 标题屏激活期间挂起章节加载请求（由 rpg_extras.js 在用户点击「开始游戏」时关闭）
        if (window.__RPG_TITLE_ACTIVE) {
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
                _hideIframe();
                skipBtn.style.display = 'none';
                await _playChapterStory(chapter, {
                    onEnd: async () => {
                        await _goNextChapter();
                    },
                });
                return;
            }

            if (!chapter.service_up) {
                // 棋类服务不可达
                _hideIframe();
                skipBtn.style.display = 'inline-block';
                const portMap = { xiangqi: 8000, wuziqi: 8001, go: 8002 };
                const port = portMap[chessType] || '?';
                toast(`⚠ ${chessType} 服务未启动（端口 ${port}），可跳过本章`, 'error');
                // 仍播放章节 VN
                await _playChapterStory(chapter, { allowSkip: true });
                return;
            }

            // 对战章节：先播放章节 VN，结束后加载 iframe
            skipBtn.style.display = 'none';
            await _playChapterStory(chapter, {
                onEnd: async () => {
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
            if (opts.onEnd) opts.onEnd();
            return;
        }
        // 检查 story 是否存在
        try {
            const probe = await fetch(`/api/rpg/vn/${storyId}`);
            if (!probe.ok) {
                toast(`章节剧情 ${storyId} 未找到`, 'error');
                if (opts.onEnd) opts.onEnd();
                return;
            }
        } catch (e) {
            if (opts.onEnd) opts.onEnd();
            return;
        }

        StoryLayer.playChapter(storyId, null, {
            onEnd: () => {
                StoryLayer.hide();
                if (opts.onEnd) opts.onEnd();
            },
        });
    }

    async function _startBattle(chapter) {
        // 调用 battle/start 重置棋类棋盘 + RPG 状态
        try {
            const resp = await fetch('/api/rpg/battle/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapter_id: chapter.chapter_id }),
            });
            const data = await resp.json();
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

        // 加载 iframe
        if (chapter.iframe_url) {
            battlePlaceholder.style.display = 'none';
            iframe.style.display = 'block';
            iframeReady = false;
            pendingInit = true;
            iframe.src = chapter.iframe_url;
        }
    }

    function _hideIframe() {
        if (iframe) {
            iframe.src = 'about:blank';
            iframe.style.display = 'none';
        }
        if (battlePlaceholder) {
            battlePlaceholder.style.display = 'flex';
        }
    }

    // ────────── postMessage 协议 ──────────

    function _onIframeMessage(event) {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'RPG_READY':
                // iframe 就绪，发送 INIT
                iframeReady = true;
                sendToIframe({
                    type: 'RPG_INIT',
                    chapter_id: currentChapter?.chapter_id,
                    player_side: currentChapter?.player_side,
                    chess_type: currentChapter?.chess_type,
                });
                break;
            case 'RPG_MOVE_COMPLETE':
                _onMoveComplete(msg);
                break;
            case 'RPG_GAME_END':
                _onGameEnd(msg);
                break;
        }
    }

    function sendToIframe(msg) {
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(msg, '*');
        }
    }

    async function _onMoveComplete(msg) {
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
                    _onGameEnd({ winner: data.winner });
                }
            }
        } catch (e) {
            console.error('[RpgShell] move_complete failed:', e);
        }
    }

    async function _onGameEnd(msg) {
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

    function openSettings() {
        apiKeyInput.value = '';
        _toggleSettings(true);
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
        sendToIframe,
        toast,
        loadChapter,
    };

})();
