/**
 * 六道众生 · 总坛前端
 * 从 /api/games 获取棋类服务列表并渲染入口卡片
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
            // 用 no-cors 探测服务是否已监听，避免 CORS 细节阻塞状态
            await fetch(url, {
                method: "HEAD",
                mode: "no-cors",
                signal: AbortSignal.timeout(3000),
            });
            dot.className = "status-dot";
        } catch (err) {
            dot.className = "status-dot offline";
        }
    }
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
}

init();
