/**
 * 六道轮回 · 总坛前端
 * 从 /api/games 获取棋类服务列表并渲染入口卡片
 * 加载轮回状态和技能树
 */

const REALM_LABELS = {
    heaven: "天界",
    human: "人界",
    asura: "阿修罗",
    animal: "畜生界",
    hungry: "饿鬼界",
    hell: "地狱界",
};

const REALM_NAMES = {
    hell: "地狱道",
    hungry: "饿鬼道",
    animal: "畜生道",
    human: "人道",
    asura: "阿修罗道",
    heaven: "天道",
};

// 防泄漏：模块级定时器ID，render() 中复用
let _statusIntervalId = null;
// BroadcastChannel：跨页面 / 跨标签事件广播（成就解锁、业力更新、关卡推进、重置）
let _gameEventsChannel = null;
function _getChannel() {
    if (typeof BroadcastChannel === "undefined") return null;
    if (!_gameEventsChannel) {
        try {
            _gameEventsChannel = new BroadcastChannel("game-events");
        } catch (e) {
            return null;
        }
    }
    return _gameEventsChannel;
}
function _broadcastEvent(type, payload) {
    const ch = _getChannel();
    if (!ch) return;
    try { ch.postMessage({ type, ...(payload || {}) }); } catch (e) {}
}
// storage 事件兜底（非当前 tab 写入 localStorage，其他 tab 会收到）
function _storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify({ value, ts: Date.now() })); } catch (e) {}
}
function _fireLocalAndBroadcast(type, payload) {
    _broadcastEvent(type, payload);
    _storageSet(`ge_${type}`, payload || {});
}

const DEFAULT_GAMES = [
    {
        id: "xiangqi",
        name: "无限制象棋",
        realm: "human",
        icon: "♜",
        sub: "人道 · 楚河汉界",
        description: "传统象棋骨架，AI 实时改写走法、规则与胜负。马可以飞天，炮可遁地。",
        port: 8000,
    },
    {
        id: "wuziqi",
        name: "无限制五子棋",
        realm: "heaven",
        icon: "⚫",
        sub: "天道 · 五连登仙",
        description: "连珠成线即可登天。让黑子变大、让白子吃子——规则只在你一句话之间。",
        port: 8001,
    },
    {
        id: "weiqi",
        name: "无限制围棋",
        realm: "asura",
        icon: "⚪",
        sub: "阿修罗 · 混沌气局",
        description: "十九路战场，气、劫、提子皆可被自然语言重写。越深奥，越无序。",
        port: 8002,
    },
    {
        id: "dongwuqi",
        name: "无限制动物棋",
        realm: "animal",
        icon: "🐘",
        sub: "畜生道 · 斗兽丛林",
        description: "鼠可吃象，狮可跳河。用 AI 让动物们突破等级与水域的枷锁。",
        port: 8003,
    },
    {
        id: "tiaoqi",
        name: "无限制跳棋",
        realm: "hungry",
        icon: "⬢",
        sub: "饿鬼道 · 六角星途",
        description: "六角星盘上连跳奔袭。让棋子斜走、让营区瞬移——AI 让 hunger 无止境。",
        port: 8004,
    },
    {
        id: "heibaiqi",
        name: "无限制黑白棋",
        realm: "hell",
        icon: "☯",
        sub: "地狱道 · 阴阳翻转",
        description: "夹吃翻转的 Othello，却被大模型赋予了地狱般的自定义规则。",
        port: 8005,
    },
];

let samsaraState = null;
let skillTreeData = null;

function buildUrl(port) {
    return `http://localhost:${port}/`;
}

function render(games) {
    const grid = document.getElementById("game-grid");
    grid.innerHTML = "";

    games.forEach((game, index) => {
        const url = game.url || buildUrl(game.port);
        const card = document.createElement("article");
        card.className = "card";
        card.setAttribute("data-realm", game.realm);
        card.style.animationDelay = `${0.15 + index * 0.12}s`;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `进入${game.name}`);

        card.innerHTML = `
            <div class="realm-label">${REALM_LABELS[game.realm] || game.realm}</div>
            <div class="icon">${game.icon}</div>
            <h2 class="card-title">${game.name}</h2>
            <div class="card-sub">${game.sub}</div>
            <p class="card-desc">${game.description}</p>
            <div class="card-progress" id="progress-${game.realm}"></div>
            <div class="card-footer">
                <div style="display:flex;align-items:center;">
                    <span class="status-dot loading" id="status-${game.id}"></span>
                    <span class="port-badge">PORT ${game.port}</span>
                </div>
                <button class="enter-btn">进入</button>
            </div>
        `;

        const openRealm = () => showRealmLevels(game);
        card.addEventListener("click", openRealm);
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openRealm();
            }
        });

        grid.appendChild(card);
    });

    loadRealmProgress(games);
    updateStatuses(games);
    // 防泄漏：清理旧定时器后再启动新的（避免 render 重复调用导致多定时器叠加）
    if (_statusIntervalId) clearInterval(_statusIntervalId);
    _statusIntervalId = setInterval(() => updateStatuses(games), 6000);
}

async function loadRealmProgress(games) {
    // 并发发送六道进度请求（串行 6*RTT → 并发 max(RTT)，显著减少等待）
    await Promise.all(games.map(async (game) => {
        try {
            const resp = await fetch(`/samsara/api/levels/realm/${game.realm}`);
            if (!resp.ok) return;
            const data = await resp.json();
            const el = document.getElementById(`progress-${game.realm}`);
            if (!el) return;
            const passed = data.levels_passed || 0;
            const total = data.total_levels || 0;
            const sandbox = data.sandbox_unlocked ? " · 沙盒已解锁" : "";
            el.innerHTML = `<span class="progress-text">关卡进度: ${passed}/${total}${sandbox}</span>`;
        } catch (e) {}
    }));
}

async function showRealmLevels(game) {
    let modal = document.getElementById("realm-levels-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "realm-levels-modal";
        modal.className = "realm-levels-modal";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `<div class="realm-levels-content"><div class="realm-levels-header"><h2>${game.icon} ${REALM_NAMES[game.realm]}</h2><button class="close-realm-btn" id="close-realm-btn">✕</button></div><div class="realm-levels-body" id="realm-levels-body"><p style="text-align:center;color:#888;">加载中...</p></div></div>`;

    modal.classList.add("active");
    modal.querySelector("#close-realm-btn").addEventListener("click", () => modal.classList.remove("active"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

    try {
        const resp = await fetch(`/samsara/api/levels/realm/${game.realm}`);
        if (!resp.ok) throw new Error("加载失败");
        const data = await resp.json();
        const body = document.getElementById("realm-levels-body");
        body.innerHTML = "";

        const levels = data.levels || [];
        const url = `http://localhost:${game.port}/`;

        levels.forEach((level) => {
            const levelEl = document.createElement("div");
            levelEl.className = `level-item ${level.status}`;
            const typeLabel = { standard: "对弈", puzzle: "残局", objective: "目标", boss: "Boss" }[level.type] || level.type;
            const stars = "★".repeat(level.difficulty || 1);
            const desc = level.description || "";
            levelEl.innerHTML = `
                <div class="level-info">
                    <span class="level-name">${level.name}</span>
                    <span class="level-type">${typeLabel}</span>
                    <span class="level-stars">${stars}</span>
                </div>
                <div class="level-desc">${desc}</div>
                <div class="level-status">${level.status === "completed" ? "✓ 已通关" : level.status === "current" ? "▶ 可挑战" : "🔒 锁定"}</div>
            `;
            if (level.status === "completed" || level.status === "current") {
                levelEl.addEventListener("click", () => startLevel(game, level.index, url));
            }
            body.appendChild(levelEl);
        });

        if (data.sandbox_unlocked) {
            const sandboxEl = document.createElement("div");
            sandboxEl.className = "level-item sandbox";
            sandboxEl.innerHTML = `
                <div class="level-info">
                    <span class="level-name">沙盒模式</span>
                    <span class="level-type">自由对弈</span>
                </div>
                <div class="level-desc">无限制自由游玩，AI修改/业力/识破概率与关卡模式互通。胜利获得技能点。</div>
                <div class="level-status">🔓 已解锁</div>
            `;
            sandboxEl.addEventListener("click", () => startSandbox(game, url));
            body.appendChild(sandboxEl);
        }
    } catch (e) {
        const body = document.getElementById("realm-levels-body");
        if (body) body.innerHTML = `<p style="text-align:center;color:#f44;">加载关卡失败: ${e.message}</p>`;
    }
}

async function startLevel(game, levelIndex, url) {
    try {
        await fetch("/samsara/api/levels/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ realm: game.realm, level_index: levelIndex }),
        });
    } catch (e) {
        console.error("Failed to start level:", e);
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

async function startSandbox(game, url) {
    try {
        await fetch("/samsara/api/levels/sandbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ realm: game.realm }),
        });
    } catch (e) {
        console.error("Failed to start sandbox:", e);
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

async function updateStatuses(games) {
    // 并发检测6个服务状态（串行→并发，每轮检测从 ~18s 降到 ~3s）
    await Promise.all(games.map(async (game) => {
        const dot = document.getElementById(`status-${game.id}`);
        if (!dot) return;

        dot.className = "status-dot loading";
        try {
            const url = game.url || buildUrl(game.port);
            await fetch(url, {
                method: "GET",
                mode: "no-cors",
                signal: AbortSignal.timeout(3000),
            });
            dot.className = "status-dot";
        } catch (err) {
            dot.className = "status-dot offline";
        }
    }));
}

async function loadSamsaraState() {
    try {
        const resp = await fetch("/samsara/api/state");
        samsaraState = await resp.json();
        updateSamsaraUI();
    } catch (e) {
        console.error("Failed to load samsara state:", e);
        samsaraState = {
            detection_probability: 0,
            current_realm: "hell",
            skill_points: 0,
            unlocked_skills: [],
        };
        updateSamsaraUI();
    }
}

function updateSamsaraUI() {
    if (!samsaraState) return;

    // 业力是单局变量，仅在关卡内显示，主页不显示
    const detectionFill = document.getElementById("detection-fill");
    const detectionValue = document.getElementById("detection-value");
    const currentRealm = document.getElementById("current-realm");
    const skillPoints = document.getElementById("skill-points");

    const detection = samsaraState.detection || 0;
    const realm = samsaraState.current_realm || "hell";
    const points = samsaraState.skill_points || 0;

    if (detectionFill) detectionFill.style.width = `${detection}%`;
    if (detectionValue) detectionValue.textContent = `${Math.round(detection)}%`;
    if (currentRealm) currentRealm.textContent = REALM_NAMES[realm] || realm;
    if (skillPoints) skillPoints.textContent = points;
}

async function loadSkillTree() {
    try {
        const resp = await fetch("/samsara/api/skills/tree");
        skillTreeData = await resp.json();
    } catch (e) {
        console.error("Failed to load skill tree:", e);
        skillTreeData = null;
    }
}

function renderSkillTree() {
    if (!skillTreeData || !samsaraState) return;

    const container = document.getElementById("skill-branches");
    container.innerHTML = "";

    const skillPoints = samsaraState.skill_points || 0;

    Object.keys(skillTreeData).forEach((branchId) => {
        const branch = skillTreeData[branchId];
        const branchEl = document.createElement("div");
        branchEl.className = "skill-branch";

        branchEl.innerHTML = `<div class="skill-branch-title">${branch.icon} ${branch.name}</div>`;

        const tiers = branch.tiers || {};
        Object.keys(tiers).sort((a, b) => parseInt(a) - parseInt(b)).forEach((tierNum) => {
            const tier = tiers[tierNum];
            if (tier.options) {
                tier.options.forEach((skill) => {
                    const skillEl = createSkillElement(skill, tierNum, skillPoints);
                    branchEl.appendChild(skillEl);
                });
            } else {
                const skillEl = createSkillElement(tier, tierNum, skillPoints);
                branchEl.appendChild(skillEl);
            }
        });

        container.appendChild(branchEl);
    });
}

function createSkillElement(skill, tierNum, skillPoints) {
    const skillEl = document.createElement("div");
    let statusClass = "locked";
    let icon = "🔒";

    if (skill.unlocked) {
        statusClass = "unlocked";
        icon = "✓";
    } else if (skillPoints >= skill.cost) {
        statusClass = "available";
        icon = `⭐${skill.cost}`;
    }

    skillEl.className = `skill-item ${statusClass}`;
    skillEl.innerHTML = `
        <span class="skill-tier">${tierNum}</span>
        <span class="skill-name">${skill.name}</span>
        <span class="skill-desc">${skill.description}</span>
        <span class="skill-cost">${icon}</span>
    `;

    if (statusClass === "available") {
        skillEl.addEventListener("click", () => unlockSkill(skill.id, tierNum));
    }

    return skillEl;
}

async function unlockSkill(skillId, tier) {
    try {
        const resp = await fetch("/samsara/api/skills/unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ skill_id: skillId, tier: tier }),
        });

        const data = await resp.json();
        if (data.success) {
            samsaraState = data.state;
            updateSamsaraUI();
            renderSkillTree();
        }
    } catch (e) {
        console.error("Failed to unlock skill:", e);
    }
}

function initSkillTreeModal() {
    const btn = document.getElementById("skill-tree-btn");
    const modal = document.getElementById("skill-tree-modal");
    const closeBtn = document.getElementById("close-skill-btn");

    btn.addEventListener("click", () => {
        renderSkillTree();
        modal.classList.add("active");
    });

    closeBtn.addEventListener("click", () => {
        modal.classList.remove("active");
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.classList.remove("active");
        }
    });
}

async function init() {
    // 事件 + 按钮先初始化（这样第一次加载数据后任何跨页事件都能响应）
    initEventListeners();
    // 等待 DOM 就绪再挂载按钮（确保 rpg-overview 存在）
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initResetButtons, { once: true });
    } else {
        initResetButtons();
    }

    const meta = document.getElementById("hub-meta");
    let resolvedGames = null;
    try {
        const res = await fetch("/api/games", { cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const games = await res.json();
        resolvedGames = games;
        meta.textContent = `总坛在线 · 已发现 ${games.length} 重棋境`;
        render(games);
    } catch (err) {
        console.warn("无法从 /api/games 获取服务列表，使用默认配置", err);
        meta.textContent = "总坛在线 · 使用默认端口配置";
        resolvedGames = DEFAULT_GAMES;
        render(DEFAULT_GAMES);
    }

    try { await loadAchievementsBanner(); } catch (err) { console.warn("无法获取成就进度", err); }

    await loadSamsaraState();
    await loadSkillTree();
    initSkillTreeModal();
    await loadRpgOverview();
    // games 存在时刷新状态：避免 6s 轮询第一档延迟
    refreshHubStatus({ reloadAchievements: false, reloadSkills: false, reloadOverview: false, games: resolvedGames });
}

// ═══ 统一刷新入口 ═══
async function refreshHubStatus({ reloadAchievements = true, reloadSkills = true, reloadOverview = true, games = null } = {}) {
    try { await loadSamsaraState(); } catch (e) {}
    if (reloadSkills) { try { await loadSkillTree(); renderSkillTree(); } catch (e) {} }
    if (reloadAchievements) { try { await loadAchievementsBanner(); } catch (e) {} }
    if (reloadOverview) { try { await loadRpgOverview(); } catch (e) {} }
    try {
        if (!games) {
            // 当前 DOM 内渲染的 games，如果有全局变量则复用，否则加载
            const resp = await fetch("/api/games", { cache: "no-store", signal: AbortSignal.timeout(4000) });
            if (resp.ok) games = await resp.json();
        }
        if (games && games.length) {
            updateStatuses(games);
            await loadRealmProgress(games);
        }
    } catch (e) {}
}

async function loadAchievementsBanner() {
    const achRes = await fetch("/api/achievements", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!achRes.ok) return;
    const achData = await achRes.json();
    const el = document.getElementById("ach-banner-progress");
    if (el) {
        el.textContent = `已解锁 ${achData.unlocked_count || 0} / ${achData.total || 0}`;
    }
}

// ═══ Toast：成就解锁提示（所有页面统一实现）═══
function showAchievementToast(ach) {
    let root = document.getElementById("game-events-toast-root");
    if (!root) {
        root = document.createElement("div");
        root.id = "game-events-toast-root";
        Object.assign(root.style, {
            position: "fixed", top: "16px", right: "16px", zIndex: "2147483647",
            display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none",
        });
        document.body.appendChild(root);
    }
    const el = document.createElement("div");
    Object.assign(el.style, {
        minWidth: "260px", maxWidth: "360px", padding: "12px 16px",
        borderRadius: "12px", border: "1px solid rgba(255,215,0,0.45)",
        background: "linear-gradient(135deg, rgba(60,40,10,0.95), rgba(20,10,0,0.95))",
        color: "#fff", boxShadow: "0 6px 20px rgba(0,0,0,0.45)", pointerEvents: "auto",
        fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif",
    });
    const icon = (ach && ach.icon) ? ach.icon : "🏆";
    const name = (ach && ach.name) ? ach.name : (ach && ach.id ? ach.id : "新成就");
    const desc = (ach && ach.desc) ? ach.desc : "";
    el.innerHTML = `<div style="font-weight:600;font-size:14px;margin-bottom:4px;color:#ffd972;">${icon} 成就解锁</div>
                    <div style="font-size:14px;font-weight:600;margin-bottom:3px;">${name}</div>
                    <div style="font-size:12px;opacity:0.88;">${desc}</div>`;
    root.appendChild(el);
    setTimeout(() => { el.style.transition = "opacity 420ms"; el.style.opacity = "0"; }, 3600);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4200);
}

// ═══ 存档重置按钮（双档）═══
async function doResetArchive(mode) {
    const cnName = mode === "hard" ? "全量重置（清空成就/技能/关卡全部）" : "软重置（保留技能/成就/结局，只清关卡进度）";
    const confirmMsg = mode === "hard"
        ? `即将执行：${cnName}。\n此操作会把所有进度恢复默认，并写入 .bak 备份。确认继续？`
        : `即将执行：${cnName}。\n此操作会保留技能树/成就/结局/记忆碎片，只回到地狱第0关重开新周目。确认继续？`;
    if (!confirm(confirmMsg)) return;
    try {
        const r1 = await fetch("/samsara/api/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode }),
        });
        const d1 = await r1.json();
        if (!d1.success) alert("六道存档重置失败");
        if (mode === "hard") {
            try { await fetch("/api/achievements/reset", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({mode:"all"}) }); } catch (e) {}
        }
        if (d1.state) { samsaraState = d1.state; updateSamsaraUI(); }
        _fireLocalAndBroadcast("reset-issued", { mode });
        await refreshHubStatus({ reloadAchievements: true, reloadSkills: true, reloadOverview: true });
        alert("重置完成。页面已同步最新存档。");
    } catch (e) {
        alert(`重置失败：${e.message}`);
    }
}

function initResetButtons() {
    // 尝试挂到两个位置：
    const mountIds = ["reset-buttons-slot", "rpg-overview"];
    const mount = mountIds.map(id => document.getElementById(id)).find(Boolean)
        || document.body;
    let slot = document.getElementById("hub-reset-slot");
    if (!slot) {
        slot = document.createElement("div");
        slot.id = "hub-reset-slot";
        Object.assign(slot.style, {
            display: "flex", gap: "8px", flexWrap: "wrap",
            marginTop: "8px",
        });
        slot.innerHTML = `
            <button id="btn-reset-soft" class="enter-btn" style="background:rgba(180,130,60,0.25);border:1px solid rgba(200,160,90,0.5);">🗘 软重置（保留技能/成就）</button>
            <button id="btn-reset-hard" class="enter-btn" style="background:rgba(180,50,50,0.22);border:1px solid rgba(220,90,90,0.5);">🗑 全量重置（清空全部）</button>
        `;
        mount.appendChild(slot);
    }
    const s = document.getElementById("btn-reset-soft");
    if (s) s.addEventListener("click", () => doResetArchive("soft"));
    const h = document.getElementById("btn-reset-hard");
    if (h) h.addEventListener("click", () => doResetArchive("hard"));
}

// ═══ 跨页事件监听 ═══
function initEventListeners() {
    const ch = _getChannel();
    if (ch) {
        ch.addEventListener("message", (e) => {
            const t = e.data && e.data.type;
            if (!t) return;
            switch (t) {
                case "achievement-unlocked":
                    showAchievementToast(e.data.achievement || { id: e.data.id, name: e.data.name, desc: e.data.desc, icon: e.data.icon });
                    refreshHubStatus({ reloadAchievements: true, reloadSkills: false, reloadOverview: false });
                    break;
                case "karma-updated":
                case "reset-issued":
                case "level-advanced":
                case "level-started":
                    refreshHubStatus({ reloadAchievements: (t === "reset-issued") });
                    break;
            }
        });
    }
    // storage 兜底：BroadcastChannel 在老浏览器或同一 tab 不可靠时，这里也触发一次
    window.addEventListener("storage", (ev) => {
        if (!ev || !ev.key || !ev.key.startsWith("ge_")) return;
        const t = ev.key.slice(3);
        let payload = {};
        try { payload = JSON.parse(ev.newValue || "{}").value || {}; } catch (e) {}
        if (t === "achievement-unlocked") {
            showAchievementToast(payload.achievement || payload);
            refreshHubStatus({ reloadAchievements: true, reloadSkills: false, reloadOverview: false });
        } else if (["karma-updated", "reset-issued", "level-advanced", "level-started"].includes(t)) {
            refreshHubStatus({ reloadAchievements: (t === "reset-issued") });
        }
    });
    // 页面可见性/焦点兜底
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            refreshHubStatus({ reloadAchievements: true });
        }
    });
    window.addEventListener("focus", () => {
        refreshHubStatus({ reloadAchievements: true });
    });
}

// ═══ RPG 总览加载 ═══
async function loadRpgOverview() {
    try {
        const resp = await fetch("/samsara/story/api/rpg/overview", { cache: "no-store" });
        if (!resp.ok) return;
        const data = await resp.json();

        const align = data.alignment || {};
        const el = (id) => document.getElementById(id);
        if (el("rpg-enlightenment")) el("rpg-enlightenment").textContent = align.enlightenment || 0;
        if (el("rpg-corruption")) el("rpg-corruption").textContent = align.corruption || 0;
        if (el("rpg-prayer")) el("rpg-prayer").textContent = data.prayer_count || 0;

        const frags = data.memory_fragments || {};
        if (el("rpg-fragments")) el("rpg-fragments").textContent = `${frags.unlocked_count || 0}/${frags.total || 6}`;

        const preview = (data.endings || {}).preview || {};
        if (el("rpg-ending-name")) el("rpg-ending-name").textContent = preview.name || "未定";

        // 天道Boss战按钮（仅可进入时显示）
        const boss = data.tiandao_boss || {};
        if (boss.can_enter && el("rpg-boss-btn")) {
            el("rpg-boss-btn").style.display = "flex";
        }
    } catch (e) {
        console.warn("无法加载RPG总览:", e);
    }
}

init();
