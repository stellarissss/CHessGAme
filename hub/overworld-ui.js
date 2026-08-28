/* ═══════════════════════════════════════════════════════════════
   六道大陆 · overworld-ui.js（DOM Overlay）
   承载：HUD / 互动提示条 / 总览弹窗 / 选关弹窗 / 技能树弹窗 / Toast /
         加载遮罩 / 错误遮罩。提供无障碍（dialog / 焦点圈 / Tab/Enter/Esc）。
   依赖：overworld.html 中的 DOM；与 overworld.js 场景互操作。
   ═══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    /* 六道 → 棋类端口（对齐 main.py GAMES） */
    var GAME_PORT_MAP = {
        human: 8000, heaven: 8001, asura: 8002,
        animal: 8003, hungry: 8004, hell: 8005
    };

    var REALM_NAMES = {
        hell: '地狱道', hungry: '饿鬼道', animal: '畜生道',
        human: '人道', asura: '阿修罗道', heaven: '天道'
    };
    var REALM_EMOJI = {
        hell: '☯', hungry: '👹', animal: '🐘', human: '♜', asura: '⚔️', heaven: '☸️'
    };

    var $ = function (id) { return document.getElementById(id); };

    var game = null;        // overworld 场景引用
    var games = [];         // /api/games
    var samsara = {};       // 最近一次状态（缓存）
    var badges = {};        // realm -> {passed,total,done,sandbox}
    var openId = null;      // 当前打开的弹窗 id
    var reduceMotion = false;

    var keyHandler = {
        onKeydown: null      // 供 focus trap 绑定的临时处理
    };

    /* HTML 转义 */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ── 基础 DOM 缓存与事件 ── */
    var dom = {};
    function cacheDom() {
        dom.hudSkill = $('hud-skill-points');
        dom.hudDetFill = $('hud-detection-fill');
        dom.hudDetVal = $('hud-detection-value');
        dom.hudCleared = $('hud-realm-cleared');
        dom.hint = $('interact-hint');
        dom.hintKey = $('interact-key');
        dom.hintLabel = $('interact-label');
        dom.loading = $('loading-overlay');
        dom.loadingText = $('loading-text');
        dom.error = $('error-overlay');
        dom.errorText = $('error-text');
        dom.errorRetry = $('error-retry');
        dom.toastRoot = $('toast-container');
        dom.overview = $('overview-modal');
        dom.overviewRealms = $('overview-realms');
        dom.overviewClose = $('close-overview');
        dom.realmModal = $('realm-modal');
        dom.realmTitle = $('realm-modal-title');
        dom.realmLevels = $('realm-levels');
        dom.realmClose = $('close-realm-modal');
        dom.skillModal = $('skill-modal');
        dom.skillBalance = $('skill-points-balance');
        dom.skillBranches = $('skill-branches');
        dom.skillClose = $('close-skill-modal');
        dom.overviewBtn = $('btn-overview');
    }

    function init(overworldRef) {
        cacheDom();
        game = overworldRef || null;
        reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) document.documentElement.classList.add('reduce-motion');

        /* 绑定：总览按钮 / 关闭按钮 / 点击遮罩关闭 / Esc */
        dom.overviewBtn.addEventListener('click', function () { toggleOverview(true); });
        bindClose(dom.overview, dom.overviewClose);
        bindClose(dom.realmModal, dom.realmClose);
        bindClose(dom.skillModal, dom.skillClose);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' || e.key === 'Esc') {
                if (openId) { closeModal(); }
                else { toggleOverview(true); }
            }
        });

        dom.errorRetry.addEventListener('click', function () {
            location.reload();
        });

        refreshHUD();
    }

    function bindClose(modal, btn) {
        btn.addEventListener('click', function (e) { e.stopPropagation(); closeModal(); });
        modal.addEventListener('mousedown', function (e) {
            if (e.target === modal) closeModal();
        });
    }

    /* ── 告知 overworld 场景：当前是否弹窗打开（暂停互动）── */
    function isModalOpen() { return !!openId; }

    function setUI(ref) { game = ref; }

    function setGames(list) { games = Array.isArray(list) ? list : []; }

    /* ── HUD / 徽章 ── */
    function setRealmBadge(realm, data) {
        badges[realm] = {
            passed: (data && data.levels_passed) || 0,
            total: (data && data.total_levels !== undefined) ? data.total_levels : 5,
            done: !!(data && data.completed),
            sandbox: !!(data && data.sandbox_unlocked)
        };
    }

    function refreshHUD() {
        if (!dom.hudSkill) return;
        var st = game && game.getSamsara ? (game.getSamsara() || samsara) : samsara;
        if (!st || !st.skill_points) st = st || samsara;
        samsara = st || samsara;

        if (dom.hudSkill) dom.hudSkill.textContent = (samsara.skill_points != null) ? samsara.skill_points : 0;

        var det = samsara.detection != null ? samsara.detection : 0;
        dom.hudDetVal.textContent = Math.round(det) + '%';
        dom.hudDetFill.style.width = Math.min(100, Math.max(0, det)) + '%';

        var rp = samsara.realm_progress || {};
        var cleared = 0;
        Object.keys(REALM_NAMES).forEach(function (r) {
            if (rp[r] && rp[r].completed) cleared++;
        });
        dom.hudCleared.textContent = cleared + ' / 6';

        renderOverview(samsara);
    }

    function realmLevelsMeta(realm) {
        var b = badges[realm] || {};
        return { passed: b.passed || 0, total: b.total || 5, done: b.done, sandbox: b.sandbox };
    }

    /* ── 互动提示条 ── */
    function setInteractHint(text) {
        if (text) {
            dom.hintLabel.textContent = text;
            dom.hint.classList.add('visible');
            dom.hint.setAttribute('aria-live', 'polite');
        } else {
            dom.hint.classList.remove('visible');
        }
    }

    /* ── Toast ── */
    function toast(msg) {
        var el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        dom.toastRoot.appendChild(el);
        setTimeout(function () {
            el.classList.add('leaving');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
        }, 2600);
    }

    /* ── 加载 / 错误遮罩 ── */
    function showLoading(text) {
        dom.loading.classList.remove('hidden');
        if (text) dom.loadingText.textContent = text;
    }
    function removeLoading() {
        dom.loading.classList.add('hidden');
    }
    function showError(msg) {
        dom.loading.classList.add('hidden');
        dom.errorText.textContent = msg || '大陆加载失败，请重试。';
        dom.error.classList.remove('hidden');
        dom.errorRetry.focus();
    }
    function hideError() { dom.error.classList.add('hidden'); }

    /* ── 弹窗通用：打开 / 关闭 / 焦点圈 ── */
    function openModal(id, title) {
        var modal = $(id);
        if (!modal) return;
        closeModal(false); // 先关其它
        openId = id;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        var titleEl = modal.querySelector('h2');
        if (titleEl) titleEl.textContent = title;

        /* 记录当前焦点并进入焦点圈 */
        cacheLastFocus = document.activeElement;
        setTimeout(function () {
            var first = modal.querySelector('button, .level-item, .ov-row, .skill-item.available');
            if (first) first.focus();
        }, 0);
        bindTrap(modal);
    }

    var cacheLastFocus = null;

    function closeModal(refresh) {
        if (!openId) return;
        var modal = $(openId);
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            unbindTrap();
        }
        openId = null;
        if (cacheLastFocus && cacheLastFocus.focus) {
            try { cacheLastFocus.focus(); } catch (e) { /* ignore */ }
        }
    }

    function bindTrap(modal) {
        keyHandler.onKeydown = function (e) {
            if (e.key === 'Tab') {
                var focusables = modal.querySelectorAll('button:not(:disabled), .level-item:not(:disabled), .ov-row, .skill-item.available, a[href]');
                if (focusables.length === 0) { e.preventDefault(); return; }
                var list = Array.prototype.slice.call(focusables);
                var first = list[0], last = list[list.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', keyHandler.onKeydown);
    }
    function unbindTrap() {
        if (keyHandler.onKeydown) {
            document.removeEventListener('keydown', keyHandler.onKeydown);
            keyHandler.onKeydown = null;
        }
    }

    /* ── 总览弹窗 ── */
    function toggleOverview(force) {
        if (openId) {
            closeModal();
            return;
        }
        openModal('overview-modal', '🌍 六道大陆总览');
        renderOverview(samsara);
    }

    function renderOverview(state) {
        if (!dom.overviewRealms) return;
        var rp = (state && state.realm_progress) || {};
        var unlocked = (state && state.sandbox_unlocked) || [];
        var rows = Object.keys(REALM_NAMES).map(function (realm) {
            var info = rp[realm] || {};
            var passed = info.levels_passed || 0;
            var done = !!info.completed;
            var sand = unlocked.indexOf(realm) >= 0;
            var badge = badges[realm] || {};
            var total = badge.total || 5;
            var status = done ? '<span class="chip cleared">✓ 已通关</span>'
                              : (passed > 0 ? '<span class="chip">进行中</span>' : '<span class="chip locked">未开始</span>') +
                                (sand ? '<span class="chip sandbox">🔒沙盒</span>' : '');
            return '<button type="button" class="ov-row" data-realm="' + realm + '">' +
                '<span class="ov-icon">' + REALM_EMOJI[realm] + '</span>' +
                '<span class="ov-name">' + REALM_NAMES[realm] + '</span>' +
                status +
                '<span class="ov-progress">' + passed + ' / ' + total + '</span>' +
                '</button>';
        }).join('');
        dom.overviewRealms.innerHTML = rows;
        dom.overviewRealms.querySelectorAll('.ov-row').forEach(function (btn) {
            btn.addEventListener('click', function () {
                closeModal();
                openRealmSelect(btn.dataset.realm);
            });
        });
    }

    /* ── 选关弹窗 ── */
    function openRealmSelect(realm) {
        var name = REALM_NAMES[realm] || realm;
        openModal('realm-modal', REALM_EMOJI[realm] + ' ' + name + ' · 选择关卡');
        dom.realmLevels.innerHTML = '<p style="color:var(--text-muted);padding:20px 0;text-align:center">正在载入关卡…</p>';

        fetch('/samsara/api/levels/realm/' + encodeURIComponent(realm))
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.success === false) {
                    dom.realmLevels.innerHTML = '<p style="color:var(--crimson)">' + esc(data.message || '关卡加载失败') + '</p>';
                    return;
                }
                /* 回调场景缓存关卡总数，供徽章显示 */
                var levels = (data && data.levels) || [];
                var passed = (data && data.levels_passed) || 0;
                var total = (data && data.total_levels) || levels.length;
                var done = !!(data && data.completed);
                var sandUnlocked = !!(data && data.sandbox_unlocked);
                if (game && game._levelTotals) game._levelTotals[realm] = total;
                setRealmBadge(realm, { levels_passed: passed, total_levels: total, completed: done, sandbox_unlocked: sandUnlocked });
                if (game) game.syncSamsara(game.getSamsara ? game.getSamsara() : {});

                dom.realmLevels.innerHTML = levels.map(function (lv, i) {
                    var status = (lv && lv.status) || (i < passed ? 'completed' : (i === passed ? 'current' : 'locked'));
                    var clickable = status !== 'locked';
                    var boss = lv && lv.type === 'boss';
                    var stars = (lv && lv.difficulty) ? new Array(Math.min(5, lv.difficulty)).fill('★').join('') : '';
                    var statusTxt = status === 'completed' ? '<div class="lv-status done">✓ 已完成</div>'
                        : status === 'current' ? '<div class="lv-status now">▶ 当前挑战</div>'
                        : '<div class="lv-status lock">🔒 尚未解锁</div>';
                    var desc = lv && lv.description ? '<div class="lv-desc">' + esc(lv.description) + '</div>' : '';
                    return '<button type="button" class="level-item ' + status + '" data-index="' + i + '"' +
                        (clickable ? '' : ' disabled aria-disabled="true"') + '>' +
                        '<div class="lv-top">' +
                        (boss ? '<span class="lv-badge boss">💀 Boss</span>' : '') +
                        '<span class="lv-name">' + esc(lv.name || ('第 ' + (i + 1) + ' 关')) + '</span>' +
                        (stars ? '<span class="lv-stars">' + stars + '</span>' : '') +
                        '</div>' +
                        desc + statusTxt +
                        '</button>';
                }).join('') +
                    (sandUnlocked ? sandboxRow(realm) : '');

                dom.realmLevels.querySelectorAll('.level-item[data-index]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        startRealmBattle(realm, Number(btn.dataset.index));
                    });
                });
                var sandboxBtn = dom.realmLevels.querySelector('.level-item.sandbox');
                if (sandboxBtn) sandboxBtn.addEventListener('click', function () { startRealmBattle(realm, null, true); });

                var first = dom.realmLevels.querySelector('.level-item:not(:disabled)');
                if (first) first.focus();
            })
            .catch(function () {
                dom.realmLevels.innerHTML = '<p style="color:var(--crimson)">关卡数据加载失败，请稍后重试。</p>';
            });
    }

    function sandboxRow(realm) {
        return '<button type="button" class="level-item sandbox">' +
            '<div class="lv-top"><span class="lv-badge">🔒</span><span class="lv-name">' + REALM_NAMES[realm] + ' · 沙盒模式</span></div>' +
            '<div class="lv-desc">无限自由对弈，AI 改规、业力与识破互通。</div>' +
            '</button>';
    }

    function startRealmBattle(realm, levelIndex, isSandbox) {
        var body = { realm: realm };
        if (isSandbox) body.mode = 'sandbox';
        else body.level_index = levelIndex;

        fetch('/samsara/api/levels/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.success === false) {
                    toast((data.message || '启动失败') + '（' + (data.reason || '') + '）');
                    return;
                }
                var port = GAME_PORT_MAP[realm] || 8000;
                location.href = '/play?realm=' + encodeURIComponent(realm) + '&port=' + port;
            })
            .catch(function () { toast('启动关卡失败，请重试'); });
    }

    /* 技能树弹窗 ── */
    function computeBranchLocks(tree) {
        /* branch -> { tier: 是否有任意该级技能已解锁 } */
        var m = {};
        Object.keys(tree).forEach(function (bid) {
            var b = tree[bid];
            var tiers = b.tiers || {};
            var mm = (m[bid] = {});
            [1, 2, 3].forEach(function (t) {
                var td = tiers[t];
                if (!td) return;
                var unlocked = false;
                if (td.options) unlocked = td.options.some(function (o) { return !!o.unlocked; });
                else unlocked = !!td.unlocked;
                mm[t] = unlocked;
            });
        });
        return m;
    }
    function prevUnlocked(lockMap, branch, tier) {
        if (tier <= 1) return true;
        var mm = lockMap[branch];
        return !!(mm && mm[tier - 1]);
    }

    function openSkillTree() {
        openModal('skill-modal', '🌳 技能树');

        return Promise.all([
            fetch('/samsara/api/skills/tree').then(function (r) { return r.json(); }),
            fetch('/samsara/api/skills').then(function (r) { return r.json(); })
        ]).then(function (res) {
            var tree = res[0] || {};
            var skillsData = res[1] || {};
            var points = (skillsData.skill_points != null ? skillsData.skill_points : (samsara.skill_points || 0));
            var locks = computeBranchLocks(tree);

            dom.skillBalance.textContent = points;

            var branchesEl = dom.skillBranches;
            branchesEl.innerHTML = '';
            Object.keys(tree).forEach(function (branchId) {
                var branch = tree[branchId];
                var card = document.createElement('div');
                card.className = 'skill-branch';
                card.innerHTML = '<div class="skill-branch-head"><span class="skill-branch-icon">' + (branch.icon || '✦') + '</span>' +
                    '<span class="skill-branch-name">' + esc(branch.name) + '</span></div>' +
                    '<div class="skill-branch-desc">' + esc(branch.description || '') + '</div>';

                var tiers = branch.tiers || {};
                [1, 2, 3].forEach(function (tier) {
                    var td = tiers[tier];
                    if (!td) return;
                    var prev = prevUnlocked(locks, branchId, tier);
                    if (td.options) {
                        td.options.forEach(function (opt) {
                            var sk = { id: opt.id, name: opt.name, description: opt.description, cost: opt.cost, unlocked: !!opt.unlocked };
                            card.appendChild(skillItem(branchId, tier, sk, points, prev));
                        });
                    } else {
                        var sk = { id: td.id, name: td.name, description: td.description, cost: td.cost, unlocked: !!td.unlocked };
                        card.appendChild(skillItem(branchId, tier, sk, points, prev));
                    }
                });
                branchesEl.appendChild(card);
            });

            dom.skillBranches.querySelectorAll('.skill-item.available').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    unlockSkill(btn.dataset.id, Number(btn.dataset.tier));
                });
            });
            var first = dom.skillModal.querySelector('.skill-item.available');
            if (first) first.focus();
        }).catch(function () {
            dom.skillBranches.innerHTML = '<p style="color:var(--crimson)">技能树加载失败，请稍后重试。</p>';
        });
    }

    function skillItem(branchId, tier, skill, points, prevUnlocked) {
        var unlocked = !!skill.unlocked;
        var can = !unlocked && !!prevUnlocked && points >= (skill.cost || 1);
        var beDisabled = unlocked || !can;
        var mark = unlocked ? '<span class="skill-mark" style="color:#4ade80">✓</span>'
                   : (can ? '<span class="skill-mark" style="color:#a78bfa">＋</span>'
                   : '<span class="skill-mark" style="color:var(--text-muted)">🔒</span>');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'skill-item ' + (unlocked ? 'unlocked' : (can ? 'available' : 'blocked'));
        btn.dataset.id = skill.id;
        btn.dataset.tier = tier;
        if (beDisabled) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
        btn.innerHTML = '<span class="skill-tier-tag">Lv.' + tier + '</span>' +
            '<span class="skill-body"><span class="skill-name">' + esc(skill.name || '未命名') + '</span>' +
            '<div class="skill-desc">' + esc(skill.description || '') + '</div></span>' +
            '<span class="skill-cost">' + (unlocked ? '已解锁' : ('⚡' + (skill.cost || 1) + ' 点')) + '</span>' +
            mark;
        return btn;
    }

    function collectBranchState() {
        var m = {};
        dom.skillBranches.querySelectorAll('.skill-item.unlocked').forEach(function (btn) {
            var id = btn.dataset.id || '';
            var tier = Number(btn.dataset.tier || 1);
            var branch = String(id.split('_t')[0]);
            m[branch + '_' + tier] = true;
        });
        return m;
    }

    function unlockSkill(skillId, tier) {
        var branch = String(skillId.split('_t')[0]);
        var branchState = collectBranchState();
        var prevNeed = tier <= 1 || !!branchState[branch + '_' + (tier - 1)];
        if (!prevNeed) { toast('需要先解锁上一级技能'); return; }

        fetch('/samsara/api/skills/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_id: skillId, tier: tier })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || data.success === false) {
                    toast('技能解锁失败（技能点不足或前置未满足）');
                    return;
                }
                toast('已解锁：' + skillId);
                if (game && game.refreshFromUI) game.refreshFromUI();
                if (data.state) {
                    samsara = data.state;
                    refreshHUD();
                }
                openSkillTree();
            })
            .catch(function () { toast('解锁请求失败，请重试'); });
    }

    /* ── 对外 API ── */
    window.OverworldUI = {
        init: init,
        setUI: setUI,
        setGames: setGames,
        setRealmBadge: setRealmBadge,
        refreshHUD: refreshHUD,
        setInteractHint: setInteractHint,
        openRealmSelect: openRealmSelect,
        openSkillTree: openSkillTree,
        toast: toast,
        showLoading: showLoading,
        removeLoading: removeLoading,
        showError: showError,
        hideError: hideError,
        isModalOpen: isModalOpen,
        REALM_NAMES: REALM_NAMES,
        realmLevelsMeta: realmLevelsMeta
    };
})();