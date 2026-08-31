/**
 * 成就殿堂前端逻辑
 */

var RARITY_LABELS = {
    common: "普通",
    rare: "稀有",
    legendary: "传说",
};

var CATEGORY_LABELS = {
    board: "棋盘操控",
    ai_create: "AI创造",
    rule_break: "规则破坏",
    chat: "AI对话",
    mechanism: "机制",
    event: "游戏事件",
    usage: "消耗",
    meta: "元成就",
};

var GAME_LABELS = {
    xiangqi: "象棋",
    wuziqi: "五子棋",
    weiqi: "围棋",
    dongwuqi: "动物棋",
    tiaoqi: "跳棋",
    heibaiqi: "黑白棋",
    all: "全部",
    meta: "元成就",
};

var allAchievements = [];
var currentFilter = "all";
var currentRarity = "all";
var currentStatus = "all";
var currentSearch = "";

function init() {
    fetch("/api/achievements")
        .then(function (r) { return r.json(); })
        .then(function (data) {
            allAchievements = data.achievements || [];
            updateProgress(data.unlocked_count, data.total);
            render();
        })
        .catch(function (err) {
            console.error("Failed to load achievements:", err);
            document.getElementById("ach-grid").innerHTML =
                '<div class="loading-text">加载失败，请刷新重试</div>';
        });

    // 分类筛选按钮
    document.querySelectorAll(".filter-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".filter-btn").forEach(function (b) {
                b.classList.remove("active");
            });
            btn.classList.add("active");
            currentFilter = btn.getAttribute("data-cat");
            render();
        });
    });

    // P3-⑨ 稀有度 / 状态筛选 + 文本搜索
    var raritySel = document.getElementById("filter-rarity");
    var statusSel = document.getElementById("filter-status");
    var searchBox = document.getElementById("ach-search");
    if (raritySel) raritySel.addEventListener("change", function () { currentRarity = raritySel.value; render(); });
    if (statusSel) statusSel.addEventListener("change", function () { currentStatus = statusSel.value; render(); });
    if (searchBox) searchBox.addEventListener("input", function () {
        currentSearch = (searchBox.value || "").trim().toLowerCase();
        render();
    });
}

function updateProgress(unlocked, total) {
    var pct = total > 0 ? (unlocked / total) * 100 : 0;
    document.getElementById("progress-fill").style.width = pct + "%";
    document.getElementById("progress-text").textContent = unlocked + " / " + total;
}

function render() {
    var grid = document.getElementById("ach-grid");
    grid.innerHTML = "";

    var filtered = allAchievements.filter(function (a) {
        if (currentFilter !== "all" && a.category !== currentFilter) return false;
        if (currentRarity !== "all" && a.rarity !== currentRarity) return false;
        if (currentStatus === "unlocked" && !a.unlocked) return false;
        if (currentStatus === "locked" && a.unlocked) return false;
        if (currentSearch) {
            var hay = ((a.name || "") + " " + (a.desc || "")).toLowerCase();
            if (hay.indexOf(currentSearch) < 0) return false;
        }
        return true;
    });

    var countEl = document.getElementById("ach-count");
    if (countEl) countEl.textContent = "匹配 " + filtered.length + " / " + allAchievements.length;

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="loading-text">没有符合条件的成就</div>';
        return;
    }

    // 已解锁的排前面
    filtered.sort(function (a, b) {
        if (a.unlocked && !b.unlocked) return -1;
        if (!a.unlocked && b.unlocked) return 1;
        return 0;
    });

    filtered.forEach(function (ach, index) {
        var card = document.createElement("div");
        card.className = "ach-card " + (ach.unlocked ? "unlocked" : "locked");
        card.setAttribute("data-rarity", ach.rarity);
        card.style.animationDelay = (index * 0.04) + "s";

        var gameLabel = ach.games && ach.games[0] === "all" ? "全棋类" : (ach.games || []).map(function (g) { return GAME_LABELS[g] || g; }).join("/");
        var timeStr = ach.unlocked_at
            ? new Date(ach.unlocked_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
            : "未解锁";

        card.innerHTML =
            '<div class="ach-card-header">' +
                '<div class="ach-icon">' + (ach.icon || "🏆") + "</div>" +
                '<div class="ach-title-area">' +
                    '<h3 class="ach-name">' + (ach.unlocked ? ach.name : "???") + "</h3>" +
                    '<span class="ach-rarity ' + ach.rarity + '">' + RARITY_LABELS[ach.rarity] + "</span>" +
                "</div>" +
            "</div>" +
            '<p class="ach-desc">' + (ach.unlocked ? ach.desc : "隐藏成就 — 满足特定条件后解锁") + "</p>" +
            '<div class="ach-meta">' +
                '<span class="ach-game-tag">' + gameLabel + "</span>" +
                '<span class="ach-time">' + timeStr + "</span>" +
            "</div>";

        grid.appendChild(card);
    });
}

init();
