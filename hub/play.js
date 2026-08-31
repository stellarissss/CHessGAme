/**
 * 六道小世界 · 对局容器
 * 同窗口内嵌棋类服务 iframe（无边框），顶部悬浮返回条。
 * 返回时重新拉取地图状态，正确显示通关/解锁后的节点。
 */

const params = new URLSearchParams(location.search);
const realm = params.get("realm") || "hell";
const port = params.get("port") || "8000";

const REALM_NAMES = {
    hell: "地狱道", hungry: "饿鬼道", animal: "畜生道",
    human: "人道", asura: "阿修罗道", heaven: "天道",
};

const frame = document.getElementById("game-frame");
const railTitle = document.getElementById("play-title");
const backBtn = document.getElementById("btn-back-map");

// iframe 指向对应棋类服务，带 embed=1 内嵌模式（隐藏返回/新窗口等外部元素）+ realm（供胜负页“返回地图”）
const gameUrl = `http://localhost:${port}/?embed=1&realm=${encodeURIComponent(realm)}`;
frame.src = gameUrl;
railTitle.textContent = `${REALM_NAMES[realm] || realm} · 对局`;

// 返回 2.5D 大陆大地图并强制刷新状态（?r=时间戳），并按当前道（realm）回填导航焦点
backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    location.href = `/overworld?r=${Date.now()}&backrealm=${encodeURIComponent(realm)}`;
});

// 服务就绪前显示加载态（iframe 正常加载即可，不阻塞）
frame.addEventListener("error", () => {
    railTitle.textContent = "对局加载失败";
});