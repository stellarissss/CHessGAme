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
    const meta = document.getElementById("hub-meta");
    try {
        const res = await fetch("/api/games", { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const games = await res.json();
        meta.textContent = `总坛在线 · 已发现 ${games.length} 重棋境`;
        render(games);
    } catch (err) {
        console.warn("无法从 /api/games 获取服务列表，使用默认配置", err);
        meta.textContent = "总坛在线 · 使用默认端口配置";
        render(DEFAULT_GAMES);
    }

    try {
        const achRes = await fetch("/api/achievements");
        if (achRes.ok) {
            const achData = await achRes.json();
            const el = document.getElementById("ach-banner-progress");
            if (el) {
                el.textContent = `已解锁 ${achData.unlocked_count} / ${achData.total}`;
            }
        }
    } catch (err) {
        console.warn("无法获取成就进度", err);
    }

    await loadSamsaraState();
    await loadSkillTree();
    initSkillTreeModal();
    loadRpgOverview();
}

// ═══ RPG 总览加载 ═══
async function loadRpgOverview() {
    try {
        const resp = await fetch("/samsara/story/api/rpg/overview");
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
