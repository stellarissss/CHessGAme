/**
 * 六道小世界 · 世界地图
 * 六块大陆平铺展示，自由选择进入各道小地图。
 * 数据：/api/samsara/realms（路由/名称）+ /samsara/api/map/progress（进度聚合）。
 */

const REALM_META = [
    { id: "hell",   name: "地狱道",    sub: "HELL · REVERSI",   icon: "☯", desc: "黑白翻转，阴阳相克。在覆盘中直面愧疚。", accent: "#c0392b" },
    { id: "hungry", name: "饿鬼道",    sub: "HUNGRY · CHECKERS", icon: "👹", desc: "六角星途，连跳奔袭。贪婪永无止境。", accent: "#d68910" },
    { id: "animal", name: "畜生道",    sub: "ANIMAL · BEASTS",  icon: "🐘", desc: "弱肉强食，等级森严。凭本能撕开枷锁。", accent: "#16a085" },
    { id: "human",  name: "人道",      sub: "HUMAN · XIANGQI",  icon: "♜", desc: "楚河汉界，运筹帷幄。规则由你改写。", accent: "#d4af37" },
    { id: "asura",  name: "阿修罗道",  sub: "ASURA · WEIQI",    icon: "⚔️", desc: "十九路战场，气劫提杀。越深奥，越无序。", accent: "#8e44ad" },
    { id: "heaven", name: "天道",      sub: "HEAVEN · GOMOKU",  icon: "☸️", desc: "五连登仙，禅定守道。窥见真我之名。", accent: "#5dade2" },
];

let tooltipTimer = null;

function $(id) { return document.getElementById(id); }

async function fetchJSON(url) {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

async function loadWorld() {
    try {
        const [realmsResp, progressResp] = await Promise.all([
            fetchJSON("/api/samsara/realms"),
            fetchJSON("/samsara/api/map/progress"),
        ]);
        const realms = Array.isArray(realmsResp) ? realmsResp : realmsResp.realms || [];
        const mapProgress = progressResp.progress || {};
        const realmProgress = progressResp.realm_progress || {};
        const sandboxUnlocked = progressResp.sandbox_unlocked || [];
        renderRealms(realms, mapProgress, realmProgress, sandboxUnlocked);
    } catch (e) {
        $("world-grid").innerHTML =
            `<p style="grid-column:1/-1; text-align:center; color:var(--crimson);">加载世界地图失败: ${e.message}</p>`;
    }
}

function renderRealms(realms, mapProgress, realmProgress, sandboxUnlocked) {
    const grid = $("world-grid");
    grid.innerHTML = "";
    REALM_META.forEach((meta, idx) => {
        const card = document.createElement("a");
        card.className = "realm-card";
        card.dataset.realm = meta.id;
        card.href = `/realm-map/${meta.id}`;
        card.style.animationDelay = `${0.06 * idx}s`;

        const progress = mapProgress[meta.id] || {};
        const states = Object.values(progress);
        let clearedCount = 0;
        states.forEach((s) => { if (s === "cleared") clearedCount += 1; });
        const totalNodes = states.length || 8; // 未拉取到地图节点时给个友好占位
        const rp = realmProgress[meta.id] || {};
        const completed = !!rp.completed;
        const unlocked = sandboxUnlocked.includes(meta.id);

        const badgeHtml = completed
            ? `<span class="realm-badge cleared">✓ 已通关</span>`
            : (clearedCount > 0
                ? `<span class="realm-badge">进行中</span>`
                : `<span class="realm-badge locked">未开始</span>`) +
              (unlocked ? `<span class="realm-badge sandbox">沙盒已解锁</span>` : "");

        card.innerHTML = `
            <div class="realm-icon">${meta.icon}</div>
            <h2 class="realm-name">${meta.name}</h2>
            <div class="realm-sub">${meta.sub}</div>
            <p class="realm-desc">${meta.desc}</p>
            <div class="realm-meta">
                <span class="progress">${clearedCount} / ${totalNodes} 节点</span>
                ${badgeHtml}
            </div>
            <span class="card-enter">踏入此道 ▶</span>
        `;
        grid.appendChild(card);
    });
}

/* ── 顶部状态条 ── */
async function loadSamsaraState() {
    try {
        const data = await fetchJSON("/samsara/api/state");
        const detection = data.detection || 0;
        const fill = $("detection-fill");
        const value = $("detection-value");
        if (fill) fill.style.width = `${Math.min(100, detection)}%`;
        if (value) value.textContent = `${Math.round(detection)}%`;
        $("skill-points").textContent = data.skill_points || 0;
        const rp = data.realm_progress || {};
        const cleared = Object.values(rp).filter((r) => r.completed).length;
        $("realm-cleared").textContent = `${cleared} / 6`;
    } catch (e) {
        // 静默失败
    }
}

function bindToolbar() {
    $("btn-prologue").addEventListener("click", () => { location.href = "/dialogue?mode=prologue"; });
    $("btn-skill-tree").addEventListener("click", () => { location.href = "/hub#skill-tree"; });
    $("btn-achievements").addEventListener("click", () => { location.href = "/achievements"; });
    $("btn-memory").addEventListener("click", () => { location.href = "/memory-album"; });
    $("btn-ending").addEventListener("click", () => { location.href = "/ending"; });
}

document.addEventListener("DOMContentLoaded", () => {
    bindToolbar();
    loadWorld();
    loadSamsaraState();
    setInterval(loadSamsaraState, 5000);
});