/**
 * 六道小世界 · 道内小地图（元气骑士式房间节点图）
 * 从 /samsara/api/map/{realm} 拉取节点/连线/状态，网格坐标 + SVG 连线渲染。
 * 点击 available 战斗节点 → 进入 /play 内嵌对局容器。
 */

const REALM_NAMES = {
    hell: "地狱道", hungry: "饿鬼道", animal: "畜生道",
    human: "人道", asura: "阿修罗道", heaven: "天道",
};
const TYPE_LABELS = {
    start: "入口", battle: "对弈", puzzle: "残局", objective: "目标",
    boss: "守道者", event: "事件", reward: "奖励", rest: "休憩",
};
const TYPE_ICONS = {
    start: "⛩️", battle: "⚔️", puzzle: "🧩", objective: "🎯",
    boss: "💀", event: "❔", reward: "🎁", rest: "🛏️",
};

let GAME_PORT_MAP = {}; // { realm: port }
const realm = new URLSearchParams(location.search).get("realm") || "hell";
const canvasId = "map-canvas";

function $(id) { return document.getElementById(id); }

async function fetchJSON(url) {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

async function loadGamePorts() {
    try {
        const data = await fetchJSON("/api/games");
        (Array.isArray(data) ? data : data.games || []).forEach((g) => {
            if (g.realm) GAME_PORT_MAP[g.realm] = g.port;
        });
    } catch (e) {
        console.warn("加载棋类端口失败:", e);
    }
}

function statusOf(node) {
    // 优先用服务端状态；占位节点恒为 placeholder（可点击置灰提示）
    if (node.placeholder) return "placeholder";
    return node.status || "locked";
}

function buildTip(node) {
    const isPlaceholder = node.placeholder;
    const name = node.label || node.id;
    if (isPlaceholder) {
        return `
            <div class="map-modal-content">
                <h3>${TYPE_ICONS[node.type] || "❔"} ${name}</h3>
                <!-- TODO: ${node.todo || "内容待制作"}（realm_maps.json placeholder 节点）-->
                <p>此区域尚未开启，敬请期待。<br><small style="color:var(--crimson);">（占位：${node.todo || "待制作"}）</small></p>
                <div class="map-modal-btns">
                    <button class="modal-btn primary" onclick="closeModal()">知道了</button>
                </div>
            </div>`;
    }
    const typeLabel = TYPE_LABELS[node.type] || node.type;
    const level = node.level || {};
    const statusText = node.status === "cleared" ? "已通关" : (node.status === "available" ? "可挑战" : "未解锁");
    const desc = level.description || "";
    return `
        <div class="map-modal-content">
            <h3>${TYPE_ICONS[node.type] || "📍"} ${name}</h3>
            <p>
                <span style="color:var(--rc-accent,var(--gold));">${typeLabel}</span>
                <span class="sep" style="margin:0 8px;color:var(--text-muted);">·</span>
                <span>${statusText}</span>
                ${level.difficulty ? `<span class="sep" style="margin:0 8px;color:var(--text-muted);">·</span><span>难度 ${"★".repeat(level.difficulty)}</span>` : ""}
                <br>${desc || ""}
            </p>
            ${node.status === "available"
                ? `<div class="map-modal-btns">
                        <button class="modal-btn ghost" onclick="closeModal()">再看看</button>
                        <button class="modal-btn primary" onclick="enterNode('${node.id}')">进入对局 ▶</button>
                   </div>`
                : `<div class="map-modal-btns"><button class="modal-btn primary" onclick="closeModal()">知道了</button></div>`}
        </div>`;
}

async function enterNode(nodeId) {
    const startData = await fetchJSON("/samsara/api/map/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ realm, node_id: nodeId }),
    });
    if (!startData || !startData.success) {
        alert(startData && startData.message ? startData.message : "无法进入节点");
        return;
    }
    const port = GAME_PORT_MAP[realm];
    const url = `/play?realm=${realm}&node=${nodeId}&port=${port || 8000}`;
    location.href = url;
}

function showModal(node) {
    const content = $("map-modal-content");
    content.innerHTML = buildTip(node);
    $("map-modal").classList.add("active");
}

function closeModal() {
    $("map-modal").classList.remove("active");
}

async function loadMap() {
    await loadGamePorts();
    const title = $("realm-title");
    if (title) title.textContent = REALM_NAMES[realm] || realm;
    const sub = $("realm-sub");
    if (sub) sub.textContent = `${REALM_NAMES[realm] || realm} · SMALL WORLD`;

    const data = await fetchJSON(`/samsara/api/map/${realm}`);
    if (!data || !data.success || !data.map) {
        $(canvasId).innerHTML = `<p style="inset:0;display:flex;align-items:center;justify-content:center;color:var(--crimson);">地图加载失败</p>`;
        return;
    }
    const map = data.map;
    const nodes = map.nodes || [];
    const edges = map.edges || [];
    const grid = map.grid || { rows: 3, cols: 4 };

    if (nodes.length === 0) {
        $(canvasId).innerHTML = `<p style="inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">此道地图暂未配置</p>`;
        return;
    }

    renderMap(nodes, edges, grid);
}

function renderMap(nodes, edges, grid) {
    const wrap = $( canvasId );
    wrap.innerHTML = "";

    const hasBoss = nodes.some((n) => n.type === "boss");
    const cols = Math.max(...nodes.map((n) => n.x)) + 1;
    const rows = Math.max(...nodes.map((n) => n.y)) + 1;

    // 画布坐标系：百分比
    const padX = 9, padY = 11;

    const posOf = (n) => {
        const gx = cols > 1 ? n.x / (cols - 1) : 0.5;
        const gy = rows > 1 ? n.y / (rows - 1) : 0.5;
        return { x: padX + gx * (100 - 2 * padX), y: padY + gy * (100 - 2 * padY) };
    };

    // SVG 连线层
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "map-lines");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    wrap.appendChild(svg);

    edges.forEach(([a, b]) => {
        const na = nodes.find((n) => n.id === a);
        const nb = nodes.find((n) => n.id === b);
        if (!na || !nb) return;
        const pa = posOf(na), pb = posOf(nb);
        const line = document.createElementNS(svgNs, "line");
        line.setAttribute("x1", pa.x); line.setAttribute("y1", pa.y);
        line.setAttribute("x2", pb.x); line.setAttribute("y2", pb.y);
        line.setAttribute("class", "line");
        svg.appendChild(line);
    });

    // 节点
    nodes.forEach((n) => {
        const p = posOf(n);
        const el = document.createElement("div");
        const status = statusOf(n);
        el.className = "node";
        el.dataset.status = status;
        if (n.type === "boss") el.classList.add("boss");
        if (n.type === "start") el.classList.add("n-start");
        if (n.placeholder) el.classList.add("placeholder");
        if (status === "locked") el.classList.add("is-locked");

        const icon = n.placeholder ? "❔" : (TYPE_ICONS[n.type] || "📍");
        el.style.left = `${p.x}%`;
        el.style.top = `${p.y}%`;

        el.innerHTML = `
            <span class="n-icon">${icon}</span>
            <span class="n-label">${n.label || n.id}</span>
            ${n.placeholder && n.todo ? `<span class="todo-tag">待制作</span>` : ""}
            <div class="node-tip ${n.placeholder ? "tip-placeholder" : ""}">
                <div class="tip-name">${icon} ${n.label || n.id}</div>
                <div class="tip-desc">${n.placeholder ? (n.todo || "内容待制作") : (TYPE_LABELS[n.type] || n.type) + (n.level && n.level.name ? " · " + n.level.name : "")}</div>
                ${n.level && n.level.description ? `<div class="tip-desc">${n.level.description}</div>` : ""}
                <div class="tip-type">${status === "cleared" ? "✓ 已通关" : status === "available" ? "▶ 可挑战" : status === "placeholder" ? "⚠ 待制作" : "🔒 未解锁"}</div>
            </div>
        `;
        el.addEventListener("click", () => showModal(n));
        wrap.appendChild(el);
    });

    // 占位节点数量标注（代码内 TODO 注明，方便后续开发定位）
    const phCount = nodes.filter((n) => n.placeholder).length;
    if (phCount > 0) {
        const note = document.createElement("div");
        note.style.cssText = "position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--crimson);opacity:0.8;";
        note.textContent = `⚠ 本道含 ${phCount} 个占位房间（事件/奖励等），内容待后续制作`;
        // TODO: 占位房间内容待制作（realm_maps.json 中 placeholder: true 的节点）
        wrap.appendChild(note);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    $("map-modal").addEventListener("click", (e) => { if (e.target === $("map-modal")) closeModal(); });
    loadMap();
});