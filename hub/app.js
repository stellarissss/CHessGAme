/**
 * 六道轮回 · 总坛前端
 * 从 /api/games 获取棋类服务列表并渲染入口卡片
 * 集成轮回状态、技能树、关卡信息等
 */

const REALM_LABELS = {
    heaven: "天界",
    human: "人界",
    asura: "阿修罗",
    animal: "畜生界",
    hungry: "饿鬼界",
    hell: "地狱界",
};

const DEFAULT_GAMES = [
    {
        id: "xiangqi",
        name: "无限制象棋",
        realm: "human",
        icon: "♜",
        sub: "人界 · 楚河汉界",
        description: "传统象棋骨架，AI 实时改写走法、规则与胜负。马可以飞天，炮可遁地。",
        port: 8000,
    },
    {
        id: "wuziqi",
        name: "无限制五子棋",
        realm: "heaven",
        icon: "⚫",
        sub: "天界 · 五连登仙",
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
        sub: "畜生界 · 斗兽丛林",
        description: "鼠可吃象，狮可跳河。用 AI 让动物们突破等级与水域的枷锁。",
        port: 8003,
    },
    {
        id: "tiaoqi",
        name: "无限制跳棋",
        realm: "hungry",
        icon: "⬢",
        sub: "饿鬼界 · 六角星途",
        description: "六角星盘上连跳奔袭。让棋子斜走、让营区瞬移——AI 让 hunger 无止境。",
        port: 8004,
    },
    {
        id: "heibaiqi",
        name: "无限制黑白棋",
        realm: "hell",
        icon: "☯",
        sub: "地狱界 · 阴阳翻转",
        description: "夹吃翻转的 Othello，却被大模型赋予了地狱般的自定义规则。",
        port: 8005,
    },
];

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
            <div class="card-footer">
                <div style="display:flex;align-items:center;">
                    <span class="status-dot loading" id="status-${game.id}"></span>
                    <span class="port-badge">PORT ${game.port}</span>
                </div>
                <button class="enter-btn">进入</button>
            </div>
        `;

        const openGame = () => window.open(url, "_blank", "noopener,noreferrer");
        card.addEventListener("click", openGame);
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openGame();
            }
        });

        grid.appendChild(card);
    });

    updateStatuses(games);
    setInterval(() => updateStatuses(games), 6000);
}

async function updateStatuses(games) {
    for (const game of games) {
        const dot = document.getElementById(`status-${game.id}`);
        if (!dot) continue;

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
    }
}

async function fetchSamsaraState() {
    try {
        const res = await fetch("http://localhost:8888/api/samsara/state");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn("无法获取轮回状态", err);
        return null;
    }
}

async function fetchSkills() {
    try {
        const res = await fetch("http://localhost:8888/api/samsara/skills");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn("无法获取技能树", err);
        return null;
    }
}

async function upgradeSkill(skillId) {
    try {
        const res = await fetch(`http://localhost:8888/api/samsara/skills/${skillId}/upgrade`, {
            method: "POST",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn("升级技能失败", err);
        return null;
    }
}

async function resetProgress() {
    try {
        const res = await fetch("http://localhost:8888/api/samsara/reset", {
            method: "POST",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn("重置进度失败", err);
        return null;
    }
}

function updateSamsaraUI(state) {
    if (!state) return;

    const karma = state.karma || {};
    const detection = state.detection_probability || 0;
    const skills = state.skill_points || 0;
    const level = state.current_level || {};
    const turn_limit = state.turn_limit || { remaining: 20, max: 20 };

    document.getElementById("karma-value").textContent = karma.current || 100;
    document.getElementById("karma-max").textContent = karma.max || 100;
    const karmaPercent = ((karma.current || 100) / (karma.max || 100)) * 100;
    document.getElementById("karma-bar").style.width = `${karmaPercent}%`;

    document.getElementById("detection-value").textContent = `${Math.round(detection * 100)}%`;
    document.getElementById("detection-bar").style.width = `${detection * 100}%`;

    document.getElementById("turn-value").textContent = turn_limit.max || 20;
    document.getElementById("turn-remaining").textContent = turn_limit.remaining || 20;
    const turnPercent = ((turn_limit.remaining || 20) / (turn_limit.max || 20)) * 100;
    document.getElementById("turn-bar").style.width = `${turnPercent}%`;

    document.getElementById("skill-value").textContent = skills;

    const realmProgress = state.realm_progress || [];
    document.querySelectorAll(".realm-badge").forEach(badge => {
        const realm = badge.dataset.realm;
        if (realmProgress.includes(realm)) {
            badge.classList.add("completed");
        }
        if (level.realm === realm) {
            badge.classList.add("current");
        }
    });

    if (level.realm && level.name) {
        document.getElementById("level-realm").textContent = REALM_LABELS[level.realm] || level.realm;
        document.getElementById("level-name").textContent = level.name;

        const objectivesContainer = document.getElementById("level-objectives");
        objectivesContainer.innerHTML = "";
        const objectives = level.objectives || [];
        objectives.forEach(obj => {
            const item = document.createElement("div");
            item.className = "objective-item";
            item.innerHTML = `
                <span class="objective-icon">🏆</span>
                <span class="objective-text">${obj.description || obj.type}</span>
                <span class="objective-progress">${obj.current || 0}/${obj.target || 1}</span>
            `;
            objectivesContainer.appendChild(item);
        });
    }
}

function renderSkillTree(skills) {
    const container = document.getElementById("skill-tree-content");
    if (!skills) {
        container.innerHTML = "<p style='text-align:center;color:var(--text-muted);'>无法加载技能树</p>";
        return;
    }

    const skillTree = document.createElement("div");
    skillTree.className = "skill-tree";

    skills.forEach(skill => {
        const item = document.createElement("div");
        item.className = `skill-item ${skill.unlocked ? "unlocked" : "locked"}`;

        let btnClass = "locked-btn";
        let btnText = "未解锁";
        if (skill.unlocked) {
            if (skill.level >= skill.max_level) {
                btnClass = "max-level";
                btnText = "已满级";
            } else {
                btnClass = "upgrade";
                btnText = `升级 (${skill.cost} 点)`;
            }
        }

        item.innerHTML = `
            <h4 class="skill-name">${skill.name}</h4>
            <p class="skill-desc">${skill.description}</p>
            <div class="skill-cost">等级: ${skill.level}/${skill.max_level}</div>
            <button class="skill-btn ${btnClass}" data-skill-id="${skill.id}">${btnText}</button>
        `;

        const btn = item.querySelector(".skill-btn");
        if (btnClass === "upgrade") {
            btn.addEventListener("click", async () => {
                const result = await upgradeSkill(skill.id);
                if (result && result.success) {
                    init();
                }
            });
        }

        skillTree.appendChild(item);
    });

    container.appendChild(skillTree);
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

    const samsaraState = await fetchSamsaraState();
    updateSamsaraUI(samsaraState);

    document.getElementById("start-game-btn").addEventListener("click", () => {
        const level = samsaraState?.current_level;
        const realm = level?.realm || "human";
        const game = DEFAULT_GAMES.find(g => g.realm === realm);
        if (game) {
            window.open(buildUrl(game.port), "_blank", "noopener,noreferrer");
        }
    });

    document.getElementById("skill-tree-btn").addEventListener("click", async () => {
        const modal = document.getElementById("skill-modal");
        modal.classList.add("active");
        const skills = await fetchSkills();
        renderSkillTree(skills);
    });

    document.getElementById("close-skill-modal").addEventListener("click", () => {
        document.getElementById("skill-modal").classList.remove("active");
    });

    document.getElementById("reset-progress-btn").addEventListener("click", async () => {
        if (confirm("确定要重置所有轮回进度吗？")) {
            const result = await resetProgress();
            if (result && result.success) {
                location.reload();
            }
        }
    });

    document.getElementById("skill-modal").addEventListener("click", (e) => {
        if (e.target.id === "skill-modal") {
            e.target.classList.remove("active");
        }
    });
}

init();