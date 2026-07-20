/* ═══════════════════════════════════════════════════════════════
   RpgExtras - RPG 外壳扩展功能
   标题屏 / 粒子动画 / 游玩文档 / 教程入口 / 章节背景切换
   该脚本必须在 rpg_shell.js 之前加载（设置 __RPG_TITLE_ACTIVE 标志）
   ═══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ────────── 状态 ──────────
    // 标题屏激活标志：在 rpg_shell.js 加载前设置，阻止其 init() 自动加载序章。
    // 用户点击「开始游戏」后置 false，并触发 loadChapter。
    window.__RPG_TITLE_ACTIVE = true;
    let titleScreenActive = true;
    let pendingChapterLoad = null;
    let particleTimer = null;
    let manualModalEl = null;
    let settingsModalEl = null;
    let titleScreenEl = null;
    let loadingEl = null;
    let helpBtnEl = null;
    let tutorialBtnEl = null;
    let detectionStatEl = null;

    // 章节 → 背景图映射（与 rpg_data/chapters 对应）
    const CHAPTER_BG_MAP = {
        'ch00_prologue':       '/shared/rpg/assets/bgs/ch00_prologue.png',
        'ch01_tutorial_wuziqi':'/shared/rpg/assets/bgs/ch01_tutorial.png',
        'ch01b_white_board':    '/shared/rpg/assets/bgs/ch01_tutorial.png',
        'ch02_city_xiangqi':   '/shared/rpg/assets/bgs/ch02_city_xiangqi.png',
        'ch03_go_intro':       '/shared/rpg/assets/bgs/ch03_go_intro.png',
        'ch04_boss_wuziqi':    '/shared/rpg/assets/bgs/ch04_boss.png',
        'ch05_final_xiangqi':  '/shared/rpg/assets/bgs/ch05_final.png',
        'ch06_finale_go':      '/shared/rpg/assets/bgs/ch06_finale.png',
    };

    // ────────── 启动 ──────────

    function init() {
        titleScreenEl   = document.getElementById('rpg-title-screen');
        loadingEl       = document.getElementById('rpg-loading');
        manualModalEl   = document.getElementById('rpg-manual-modal');
        settingsModalEl = document.getElementById('rpg-settings-modal');
        helpBtnEl       = document.getElementById('rpg-btn-help');
        tutorialBtnEl   = document.getElementById('rpg-btn-tutorial');
        detectionStatEl = document.getElementById('rpg-detection-stat');

        _bindTitleMenu();
        _bindManualModal();
        _bindHelpButton();
        _bindTutorialButton();
        _startParticles();

        // 短暂延迟后隐藏加载遮罩（等首屏资源就绪）
        setTimeout(() => _hideLoading(), 800);
    }

    // ────────── 标题屏菜单 ──────────

    function _bindTitleMenu() {
        if (!titleScreenEl) return;
        const btns = titleScreenEl.querySelectorAll('.rpg-title-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                switch (action) {
                    case 'start':
                        _onStartGame();
                        break;
                    case 'tutorial':
                        _onTutorialFromTitle();
                        break;
                    case 'manual':
                        _openManual();
                        break;
                    case 'settings':
                        if (typeof RpgShell !== 'undefined' && RpgShell.openSettings) {
                            RpgShell.openSettings();
                        }
                        break;
                }
            });
        });
    }

    function _onStartGame() {
        // 进入序章
        _dismissTitleScreen(async () => {
            // 释放标题屏锁定，触发章节加载
            titleScreenActive = false;
            window.__RPG_TITLE_ACTIVE = false;
            const ch = pendingChapterLoad || 'ch00_prologue';
            pendingChapterLoad = null;
            try {
                await RpgShell.loadChapter(ch);
            } catch (e) {
                console.error('[RpgExtras] loadChapter failed:', e);
            }
        });
    }

    function _onTutorialFromTitle() {
        // 跳过序章直接进入教程章
        _dismissTitleScreen(async () => {
            titleScreenActive = false;
            window.__RPG_TITLE_ACTIVE = false;
            pendingChapterLoad = null;  // 丢弃序章
            try {
                await RpgShell.loadChapter('ch01_tutorial_wuziqi');
                if (RpgShell.toast) {
                    RpgShell.toast('已跳过序章，进入教程章节', 'success');
                }
            } catch (e) {
                console.error('[RpgExtras] loadChapter tutorial failed:', e);
            }
        });
    }

    function _dismissTitleScreen(afterCb) {
        if (!titleScreenEl) { afterCb && afterCb(); return; }
        titleScreenEl.classList.add('hidden');
        _stopParticles();
        // 等过渡动画结束后再隐藏 display
        setTimeout(() => {
            titleScreenEl.style.display = 'none';
            if (afterCb) afterCb();
        }, 850);
    }

    // ────────── 游玩文档模态框 ──────────

    function _bindManualModal() {
        const closeBtn = document.getElementById('rpg-btn-close-manual');
        if (closeBtn) {
            closeBtn.addEventListener('click', _closeManual);
        }
        // 点击遮罩关闭
        if (manualModalEl) {
            manualModalEl.addEventListener('click', (e) => {
                if (e.target === manualModalEl) _closeManual();
            });
        }
        // Esc 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (manualModalEl && manualModalEl.style.display !== 'none') {
                    _closeManual();
                }
            }
        });
    }

    function _openManual() {
        if (manualModalEl) {
            manualModalEl.style.display = 'flex';
        }
    }

    function _closeManual() {
        if (manualModalEl) {
            manualModalEl.style.display = 'none';
        }
    }

    // ────────── 顶部「?」帮助按钮 ──────────

    function _bindHelpButton() {
        if (helpBtnEl) {
            helpBtnEl.addEventListener('click', _openManual);
        }
    }

    // ────────── 侧栏「重温教程」按钮 ──────────

    function _bindTutorialButton() {
        if (tutorialBtnEl) {
            tutorialBtnEl.addEventListener('click', async () => {
                if (titleScreenActive) {
                    _dismissTitleScreen(async () => {
                        titleScreenActive = false;
                        window.__RPG_TITLE_ACTIVE = false;
                        pendingChapterLoad = null;
                        await RpgShell.loadChapter('ch01_tutorial_wuziqi');
                    });
                } else {
                    await RpgShell.loadChapter('ch01_tutorial_wuziqi');
                }
                if (RpgShell.toast) {
                    RpgShell.toast('正在加载教程章节……', 'success');
                }
            });
        }
    }

    // ────────── 加载遮罩 ──────────

    function _hideLoading() {
        if (loadingEl) {
            loadingEl.classList.add('hidden');
            setTimeout(() => {
                loadingEl.style.display = 'none';
            }, 600);
        }
    }

    // ────────── 粒子动画 ──────────

    function _startParticles() {
        const container = document.getElementById('rpg-title-particles');
        if (!container) return;
        container.innerHTML = '';

        const COLORS = ['#ffe066', '#f4c430', '#80deea', '#c77dff', '#ffffff'];
        const CHESS_CHARS = ['♟', '♞', '♝', '♜', '♛', '♚', '●', '○'];
        
        for (let i = 0; i < 48; i++) {
            const p = document.createElement('div');
            p.className = 'rpg-particle';
            
            const rand = Math.random();
            let type = 'circle';
            if (rand > 0.7) type = 'star';
            else if (rand > 0.5) type = 'chess';
            
            if (type === 'circle') {
                const size = 2 + Math.floor(Math.random() * 5);
                const left = Math.random() * 100;
                const dur = 6 + Math.random() * 12;
                const delay = Math.random() * 8;
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                p.style.width = size + 'px';
                p.style.height = size + 'px';
                p.style.left = left + '%';
                p.style.bottom = '-20px';
                p.style.background = color;
                p.style.boxShadow = `0 0 ${6 + size}px ${color}`;
                p.style.animationDuration = dur + 's';
                p.style.animationDelay = '-' + delay + 's';
                p.style.opacity = 0.4 + Math.random() * 0.6;
            } else if (type === 'star') {
                p.className = 'rpg-particle rpg-particle-star';
                const size = 8 + Math.floor(Math.random() * 12);
                const left = Math.random() * 100;
                const top = Math.random() * 60;
                const dur = 1.5 + Math.random() * 2;
                const delay = Math.random() * 5;
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                p.style.width = size + 'px';
                p.style.height = size + 'px';
                p.style.left = left + '%';
                p.style.top = top + '%';
                p.style.fontSize = size + 'px';
                p.style.color = color;
                p.style.textShadow = `0 0 8px ${color}`;
                p.textContent = '✦';
                p.style.animationDuration = dur + 's';
                p.style.animationDelay = delay + 's';
                p.style.opacity = 0.3 + Math.random() * 0.7;
            } else {
                p.className = 'rpg-particle rpg-particle-chess';
                const size = 12 + Math.floor(Math.random() * 16);
                const left = Math.random() * 100;
                const dur = 8 + Math.random() * 10;
                const delay = Math.random() * 6;
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                const char = CHESS_CHARS[Math.floor(Math.random() * CHESS_CHARS.length)];
                p.style.width = size + 'px';
                p.style.height = size + 'px';
                p.style.left = left + '%';
                p.style.bottom = '-30px';
                p.style.fontSize = size + 'px';
                p.style.color = color;
                p.style.textShadow = `0 0 6px ${color}`;
                p.textContent = char;
                p.style.animationDuration = dur + 's';
                p.style.animationDelay = '-' + delay + 's';
                p.style.opacity = 0.5 + Math.random() * 0.5;
            }
            container.appendChild(p);
        }
    }

    function _stopParticles() {
        const container = document.getElementById('rpg-title-particles');
        if (container) {
            // 不立即清空，让现有粒子自然消散（标题已隐藏）
            setTimeout(() => { container.innerHTML = ''; }, 1000);
        }
    }

    // ────────── 章节背景切换 ──────────

    function _updateChapterBackground(chapterId) {
        const bgUrl = CHAPTER_BG_MAP[chapterId];
        if (!bgUrl) return;
        // 用 CSS 自定义属性传递背景 URL，避免直接修改 ::before
        const app = document.getElementById('rpg-app');
        if (app) {
            app.style.setProperty('--rpg-current-bg', `url('${bgUrl}')`);
        }
        // 直接通过内联 style 注入一个新的伪元素覆盖（最稳妥）
        _ensureBgStyleEl();
        const styleEl = document.getElementById('rpg-dynamic-bg-style');
        if (styleEl) {
            styleEl.textContent =
                `#rpg-app::before { background-image: url('${bgUrl}'); }`;
        }
    }

    function _ensureBgStyleEl() {
        if (document.getElementById('rpg-dynamic-bg-style')) return;
        const s = document.createElement('style');
        s.id = 'rpg-dynamic-bg-style';
        document.head.appendChild(s);
    }

    // ────────── 识破概率动态显示（鼠标悬停才显示提示） ──────────

    function _bindDetectionHint() {
        if (!detectionStatEl) return;
        detectionStatEl.textContent = '???';
        detectionStatEl.style.cursor = 'help';
        // 每次作弊后由 cheat_panel 触发 updateStats，这里只负责显示策略
        // 玩家不可见具体数值——保持 ??? 悬念
    }

    // ────────── 章节背景切换（由 rpg_shell.js loadChapter 守卫放行后调用） ──────────
    // 注意：rpg_shell.js 内部闭包调用 loadChapter 不会经过此处，但章节背景更新
    // 已经由 RpgShell.loadChapter 在外部调用时（如标题屏「开始游戏」/ 章节抽屉点击）触发。
    // 对于自动 _goNextChapter 场景，背景沿用上一章节——这是可接受的视觉行为。

    // ────────── 启动入口 ──────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // rpg_shell.js 已同步执行 init()，此处同样同步执行
        init();
    }

    // 暴露少量 API（供 rpg_shell.js 调用 + 调试）
    window.RpgExtras = {
        openManual: _openManual,
        closeManual: _closeManual,
        dismissTitle: _dismissTitleScreen,
        updateChapterBackground: _updateChapterBackground,
    };
})();
