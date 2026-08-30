/* ═══════════════════════════════════════════════════════════════
   六道大地图编辑器 · 核心逻辑
   - 瓦片网格编辑：区域/水域/山脉/道路/实体
   - 装饰贴纸（图集图格）、出生点、交互点（POI）
   - 平移/缩放/画笔大小/撤销重做
   - 导入 overworld.json，导出为游戏可直接替换的配置
   依赖：geom.js（gridToRects / fillRects / floodFill）
   ═══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    /* ────────────── 语义色（与游戏 overworld.js 一致） ────────────── */
    var C = {
        WATER: '#1E6A96',
        MOUNT: '#5A5650',
        ROAD: '#C9B37E',
        BASE: '#4F7A52'
    };

    /* 图层常量 */
    var LAYER = {
        region: 'region', water: 'water', mountain: 'mountain',
        road: 'road', erase: 'erase', fill: 'fill',
        decor: 'decor', spawn: 'spawn', poi: 'poi', inspect: 'inspect'
    };
    var LAYER_META = [
        { id: LAYER.inspect, name: '选择', ico: '🖱️', key: '0' },
        { id: LAYER.region,  name: '区域', ico: '🗺️', key: '1' },
        { id: LAYER.water,   name: '水域', ico: '🌊', key: '2' },
        { id: LAYER.mountain,name: '山脉', ico: '⛰️', key: '3' },
        { id: LAYER.road,    name: '道路', ico: '🛤️', key: '4' },
        { id: LAYER.erase,   name: '地形擦',ico: '🧽', key: '5' },
        { id: LAYER.fill,    name: '油漆桶',ico: '🪣', key: '6' },
        { id: LAYER.decor,   name: '贴纸', ico: '🎨', key: '7' },
        { id: LAYER.spawn,   name: '出生点',ico: '🚪', key: '8' },
        { id: LAYER.poi,     name: '交互点',ico: '📌', key: '9' }
    ];

    /* ────────────── 全局状态 ────────────── */
    var S = {
        W: 0, H: 0, TILE: 16, SCALE: 2, P: 32, SEED: 0,
        tilesets: {},
        atlas: {},            // theme -> Image
        regions: [],          // {id,name,theme,ground[],color(row hex)}
        regionGrid: null,     // Int32: regionIndex+1, 0=无
        water: null, mountain: null, road: null, solid: null, // Uint8
        deco: [],             // {x,y,theme,tile,solid}
        pois: [],             // {id,type,emoji,x,y,label?,realm?}
        spawn: { x: 0, y: 0 },
        decorPlant: {},       // 透传保留
        curLayer: LAYER.region,
        curRegion: -1,
        brushSize: 1,
        decorStamp: null,     // {theme,tile,solid}
        poiPreset: { type: 'npc', emoji: '🧙', label: '新NPC', realm: 'hungry' },
        fillTarget: LAYER.water,
        selected: null,       // 检查模式下选中的 deco/poi
        file: null            // 已加载文件名
    };

    /* 视图 */
    var view = { cx: 0, cy: 0, zoom: 1 };
    var fitted = false;

    /* 历史 */
    var history = [], histIdx = -1;
    var ALLOC = { region: 1, water: 1, mountain: 1, road: 1, solid: 1 };

    /* DOM */
    var canvas, ctx, baseCanvas, baseCtx;

    /* ─────────────────────── 工具函数 ─────────────────────── */
    var $ = function (q) { return document.querySelector(q); };

    function idx(x, y) { return y * S.W + x; }
    function inB(x, y) { return x >= 0 && y >= 0 && x < S.W && y < S.H; }

    function pad(v) { return ('000000' + v.toString(16)).slice(-6); }

    function regionColorHex(rg) { return rg.color || C.BASE; }
    function regionColorInt(rg) { var c = regionColorHex(rg); return parseInt(c.slice(1), 16); }

    function toRgba(hex, a) {
        var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    /* ─────────────────────── 画布尺寸/资源 ─────────────────────── */
    function canvasEl(w, h) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }
    function makeEditor(c) {
        var g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        return g;
    }

    /* 预加载图集图片（优先用本目录副本，回退共享资源） */
    function preloadAtlas() {
        return new Promise(function (resolve) {
            var keys = Object.keys(S.tilesets);
            var pending = keys.length; if (!pending) { resolve(); return; }
            keys.forEach(function (k) {
                var t = S.tilesets[k], done = false;
                var finish = function (img) {
                    if (done) return; done = true;
                    S.atlas[k] = img;
                    S.tilesets[k].rows = tilesetRows(k, img);
                    if (--pending <= 0) resolve();
                };
                var candidates = [];
                if (t.file) {
                    var base = t.file.split('/').pop();
                    candidates.push('assets/atlas/' + base);          /* 本目录副本 */
                    candidates.push('../shared/assets/' + t.file.replace(/^\/shared\/assets\//, ''));
                }
                (function tryNext() {
                    if (!candidates.length) { finish(null); return; }
                    var img = new Image();
                    img.onload = function () { finish(img); };
                    img.onerror = function () { candidates.shift(); tryNext(); };
                    img.src = candidates.shift();
                })();
            });
        });
    }
    function tilesetRows(theme, img) {
        var px = S.TILE; /* 源图每格像素 = world.tile */
        return Math.max(1, Math.floor(img.height / px));
    }

    /* ─────────────────────── 状态构建 ─────────────────────── */
    function newGrid(type) {
        var n = S.W * S.H;
        if (type === 'region') return new Int32Array(n);
        return new Uint8Array(n);
    }

    function resetState() {
        S.regionGrid = newGrid('region');
        S.water = newGrid(); S.mountain = newGrid(); S.road = newGrid(); S.solid = newGrid();
        S.regions = []; S.deco = []; S.pois = []; S.decorPlant = {}; S.spawn = { x: 10, y: 10 };
        S.curRegion = -1; S.decorStamp = null; S.selected = null;
        history = []; histIdx = -1; ALLOC.region = 1;
    }

    /* 导入 overworld.json → 状态 */
    function importMap(ow) {
        /* 先确定世界尺寸，再分配网格（resetState 依赖 S.W/S.H 分配 typed array） */
        var w = ow.world; S.W = w.width; S.H = w.height;
        resetState();
        S.TILE = w.tile; S.SCALE = w.scale; S.P = S.TILE * S.SCALE; S.SEED = w.seed;
        S.tilesets = ow.tilesets || {};
        S.decorPlant = ow.decor_plant || {};

        ow.regions.forEach(function (rg) {
            var hex = typeof rg.color === 'number' ? '#' + pad(rg.color) : (rg.color || C.BASE);
            var i = S.regions.length;
            S.regions.push({
                id: rg.id || ('region_' + i), name: rg.name || rg.id,
                theme: rg.theme, ground: (rg.ground || []).slice(), color: hex
            });
            /* 填充 footprint */
            var rects = rg.rects && rg.rects.length ? rg.rects : (rg.rect ? [rg.rect] : []);
            rects.forEach(function (r) {
                var x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3];
                for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
                    if (inB(x, y)) S.regionGrid[idx(x, y)] = i + 1;
            });
        });
        if (ow.regions.length) S.curRegion = 0;

        fillTyped(S.water, flattenRectList(ow.water_overlays, ow.river_snow, ow.river_ridge));
        fillTyped(S.mountain, flattenRectList(ow.mountain_overlays));
        fillTyped(S.road, roadRects(ow.roads));

        /* solid_regions */
        (ow.solid_regions || []).forEach(function (s) {
            var r = s.rect; for (var y = r[1]; y <= r[3]; y++) for (var x = r[0]; x <= r[2]; x++)
                if (inB(x, y)) S.solid[idx(x, y)] = 1;
        });

        S.deco = (ow.decor_anchors || []).map(function (d) {
            return { x: d.x, y: d.y, theme: d.tile[0], tile: d.tile[1], solid: !!d.solid };
        });
        S.pois = (ow.pois || []).filter(function (p) { return p.type !== 'spawn'; }).map(function (p) {
            return { id: p.id, type: p.type, emoji: p.emoji, x: p.x, y: p.y, label: p.label || '', realm: p.realm };
        });
        var sp = ow.pois.find(function (p) { return p.type === 'spawn'; });
        if (sp) S.spawn = { x: sp.x, y: sp.y };
        else if (ow.player && ow.player.initial) S.spawn = { x: ow.player.initial.x, y: ow.player.initial.y };

        S.file = null;
        rebuildRegionsUI();
        rebuildPalette();
        var wi = $('#worldInfo'); if (wi) wi.textContent = S.W + '×' + S.H + ' · tile ' + S.TILE + '×' + S.SCALE;
        fitted = false;
        if (!S.W || !canvas || !canvas.clientWidth) { setTimeout(initialView, 0); } else { initialView(); }
        pushHistory();
        fullRender();
        preloadAtlas().then(function () { renderPalette(); draw(); });
        status('地图已载入 ' + S.W + '×' + S.H);
    }

    function rowArray(gridTyped) {
        /* 返回二维 false 数组供 Geom.fillRects 使用，并写回 typed grid */
        var rows = [];
        for (var y = 0; y < S.H; y++) {
            var r = new Array(S.W);
            for (var x = 0; x < S.W; x++) r[x] = !!gridTyped[idx(x, y)];
            rows.push(r);
        }
        return rows;
    }
    function rowArrayRegion() {
        var rows = [];
        for (var y = 0; y < S.H; y++) {
            var r = new Array(S.W);
            for (var x = 0; x < S.W; x++) r[x] = S.regionGrid[idx(x, y)] > 0;
            rows.push(r);
        }
        return rows;
    }

    function fillTyped(typed, rects) {
        (rects || []).forEach(function (it) {
            var arr = Array.isArray(it) && it.length >= 4 && typeof it[0] === 'number' ? it : it.slice(2);
            var x0 = arr[0], y0 = arr[1], x1 = arr[2], y1 = arr[3];
            if (x0 > x1) { var t = x0; x0 = x1; x1 = t; }
            if (y0 > y1) { var s = y0; y0 = y1; y1 = s; }
            for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
                if (inB(x, y)) typed[idx(x, y)] = 1;
        });
    }

    function flattenRectList() {
        var out = [];
        for (var i = 0; i < arguments.length; i++) {
            var list = arguments[i];
            if (Array.isArray(list)) list.forEach(function (it) { if (Array.isArray(it)) out.push(it.slice(2)); });
        }
        return out;
    }
    function roadRects(roads) {
        var out = [];
        (roads || []).forEach(function (r) {
            if (r.rect) out.push(r.rect.slice());
            else if (r.x !== undefined) for (var y = r.y0; y <= r.y1; y++) out.push([r.x, y, r.x, y]);
            else if (r.y !== undefined) for (var x = r.x0; x <= r.x1; x++) out.push([x, r.y, x, r.y]);
        });
        return out;
    }

    /* ─────────────────────── 导出 ─────────────────────── */
    function exportMap() {
        var regions = S.regions.map(function (rg, i) {
            var foot = booleanFootprint(i + 1);
            var rects = Geom.gridToRects(foot, S.W, S.H);
            var out = {
                id: rg.id, name: rg.name, theme: rg.theme
            };
            if (rg.ground && rg.ground.length) out.ground = rg.ground.slice();
            var hex = (rg.color || '').slice(1);
            if (/^[0-9a-fA-F]{6}$/.test(hex)) out.color = parseInt(hex, 16);
            if (rects.length === 1) out.regions_rect = rects[0];
            out.rects = rects;
            if (rects.length === 1) out.rect = rects[0];
            return out;
        }).filter(function (r) { return r.rects && r.rects.length; });

        function grid_overlays(typed, name) {
            var rows = rowArray(typed);
            return Geom.gridToRects(rows, S.W, S.H).map(function (rc, n) {
                return ['rect', (name ? name + ' ' : '') + (n + 1), rc[0], rc[1], rc[2], rc[3]];
            });
        }
        function solidRects() {
            return Geom.gridToRects(rowArray(S.solid), S.W, S.H).map(function (rc, n) {
                return { id: 'user_solid_' + (n + 1), rect: rc };
            });
        }
        function roadRectsOut() {
            return Geom.gridToRects(rowArray(S.road), S.W, S.H).map(function (rc, n) {
                return { id: 'road_' + (n + 1), rect: rc };
            });
        }

        var pois = [];
        pois.push({ id: 'spawn', type: 'spawn', emoji: '🚪', x: S.spawn.x, y: S.spawn.y, label: '' });
        S.pois.forEach(function (p) {
            var op = { id: p.id || ('poi_' + Math.random().toString(36).slice(2, 6)), type: p.type, emoji: p.emoji, x: p.x, y: p.y };
            if (p.type === 'npc') op.label = p.label || '';
            if (p.type === 'realm') op.realm = p.realm || 'hungry';
            pois.push(op);
        });

        return {
            world: { width: S.W, height: S.H, tile: S.TILE, scale: S.SCALE, seed: S.SEED },
            tilesets: S.tilesets,
            regions: regions,
            water_overlays: grid_overlays(S.water, '水域'),
            mountain_overlays: grid_overlays(S.mountain, '山脉'),
            river_snow: [],
            river_ridge: [],
            roads: roadRectsOut(),
            solid_regions: solidRects(),
            pois: pois,
            decor_anchors: S.deco.map(function (d) { return { x: d.x, y: d.y, tile: [d.theme, d.tile], solid: d.solid }; }),
            decor_plant: S.decorPlant || {},
            player: { speed: 160, radius_px: 13, interact_tiles: 1.6, initial: { x: S.spawn.x, y: S.spawn.y } }
        };
    }
    function booleanFootprint(regionVal) {
        /* 用 1-based 区域值，取出该区域的 boolean 网格 */
        var foot = [];
        for (var y = 0; y < S.H; y++) {
            var row = new Array(S.W);
            for (var x = 0; x < S.W; x++) row[x] = S.regionGrid[idx(x, y)] === regionVal;
            foot.push(row);
        }
        return foot;
    }

    /* 校验导出（简单检查坐标不越界、ID 唯一） */
    function validateExport(ow) {
        var seen = {};
        (ow.regions || []).forEach(function (r) {
            if (seen[r.id]) throw new Error('区域 ID 重复: ' + r.id);
            seen[r.id] = 1;
        });
        (ow.pois || []).forEach(function (p) {
            if (seen[p.id]) throw new Error('POI ID 重复: ' + p.id);
            seen[p.id] = 1;
        });
        if (!ow.regions.length) throw new Error('地图没有任何有效区域');
        return true;
    }

    /* ─────────────────────── 渲染 ─────────────────────── */
    function buildBase() {
        /* 离屏纯色轮廓底图（世界像素 = W*P × H*P） */
        var pw = S.W * S.P, ph = S.H * S.P;
        if (!baseCanvas) { baseCanvas = canvasEl(pw, ph); baseCtx = makeEditor(baseCanvas); }
        else if (baseCanvas.width !== pw || baseCanvas.height !== ph) { baseCanvas.width = pw; baseCanvas.height = ph; baseCtx = makeEditor(baseCanvas); }
        else { baseCtx.clearRect(0, 0, pw, ph); baseCtx.imageSmoothingEnabled = false; }

        var g = baseCtx, P = S.P;
        for (var ty = 0; ty < S.H; ty++) {
            var x = 0;
            while (x < S.W) {
                var col = colorAt(x, ty);
                var x0 = x; x++;
                while (x < S.W && colorAt(x, ty) === col) x++;
                g.fillStyle = col;
                g.fillRect(x0 * P, ty * P, (x - x0) * P, P);
            }
        }
        /* 出生点光晕（画到底图便于低倍率下可见） */
        g.strokeStyle = 'rgba(244,197,66,0.8)';
        g.lineWidth = Math.max(2, P * 0.08);
        g.strokeRect(S.spawn.x * P + 2, S.spawn.y * P + 2, P - 4, P - 4);
        drawAllTiles();
    }

    function colorAt(x, y) {
        var i = idx(x, y);
        if (S.water[i]) return C.WATER;
        if (S.mountain[i]) return C.MOUNT;
        if (S.road[i]) return C.ROAD;
        var rv = S.regionGrid[i];
        if (rv > 0 && S.regions[rv - 1]) return regionColorHex(S.regions[rv - 1]);
        return C.BASE;
    }

    /* 贴纸瓦片也画进底图 */
    function drawAllTiles() {
        var g = baseCtx, P = S.P, T = S.TILE;
        S.deco.forEach(function (d) {
            var img = S.atlas[d.theme];
            if (!img) return;
            var cols = S.tilesets[d.theme].cols || 12;
            var sx = (d.tile % cols) * T, sy = Math.floor(d.tile / cols) * T;
            g.drawImage(img, sx, sy, T, T, d.x * P, d.y * P, P, P);
        });
    }

    function draw() {
        if (!S.W) return;
        if (!fitted) initialView();
        var dpr = window.devicePixelRatio || 1;
        var cw = canvas.clientWidth, ch = canvas.clientHeight;
        if (canvas.width !== Math.floor(cw * dpr)) { canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, cw, ch);

        var z = view.zoom;
        var ox = cw / 2 - view.cx * z, oy = ch / 2 - view.cy * z;
        ctx.setTransform(z, 0, 0, z, ox, oy);
        ctx.imageSmoothingEnabled = false;

        ctx.drawImage(baseCanvas, 0, 0);

        var P = S.P;
        /* 网格 */
        ctx.lineWidth = Math.max(0.4, 1 / z);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        for (var x = 0; x <= S.W; x++) { ctx.moveTo(x * P, 0); ctx.lineTo(x * P, S.H * P); }
        for (var y = 0; y <= S.H; y++) { ctx.moveTo(0, y * P); ctx.lineTo(S.W * P, y * P); }
        ctx.stroke();

        /* 实体标记 */
        ctx.fillStyle = 'rgba(255,64,64,0.55)';
        for (y = 0; y < S.H; y++) for (x = 0; x < S.W; x++)
            if (S.solid[idx(x, y)]) ctx.fillRect(x * P + 1, y * P + 1, P - 2, P - 2);

        /* POI 徽标 */
        S.pois.forEach(function (p) {
            marker(p.x, p.y, p.emoji, '#f4c542', p.type === 'realm');
        });

        /* 选中高亮 */
        if (S.selected) {
            var s = S.selected;
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
            ctx.strokeRect(s.x * P, s.y * P, P, P);
        }

        /* 光标方块 */
        if (S.mouse && inB(S.mouse.tx, S.mouse.ty)) {
            var bs = S.brushSize, bx = S.mouse.tx, by = S.mouse.ty;
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.fillRect(bx * P, by * P, P * bs, P * bs);
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
            ctx.strokeRect(bx * P, by * P, P * bs, P * bs);
            if (S.curLayer === LAYER.decor && S.decorStamp) {
                var img = S.atlas[S.decorStamp.theme];
                if (img) {
                    var T = S.TILE, cols = S.tilesets[S.decorStamp.theme].cols || 12;
                    var sx = (S.decorStamp.tile % cols) * T, sy2 = Math.floor(S.decorStamp.tile / cols) * T;
                    ctx.globalAlpha = 0.55; ctx.drawImage(img, sx, sy2, T, T, bx * P, by * P, P, P); ctx.globalAlpha = 1;
                }
            }
        }
    }

    function marker(mx, my, emoji, color, big) {
        var P = S.P;
        var cx = mx * P + P / 2, cy = my * P + P / 2;
        var r = P * (big ? 0.95 : 0.62);
        ctx.fillStyle = toRgba(color, 0.30);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
        ctx.fillStyle = toRgba(color, 0.7);
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.52, 0, 6.2832); ctx.fill();
        ctx.font = (P * (big ? 0.8 : 0.62)) + 'px "Noto Color Emoji", "Apple Color Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(emoji, cx, cy + 1);
    }

    /* ─────────────────────── 鼠标/视图 ─────────────────────── */
    function screenToWorld(sx, sy) {
        var rect = canvas.getBoundingClientRect();
        var cw = rect.width, ch = rect.height;
        var x = sx - rect.left - (cw / 2), y = sy - rect.top - (ch / 2);
        return { x: x / view.zoom + view.cx, y: y / view.zoom + view.cy };
    }
    function tileAt(sx, sy) {
        var w = screenToWorld(sx, sy);
        return { tx: Math.floor(w.x / S.P), ty: Math.floor(w.y / S.P) };
    }
    function initialView() {
        var cw = canvas.clientWidth, ch = canvas.clientHeight;
        if (!cw || !ch) return;
        var pw = S.W * S.P, ph = S.H * S.P;
        view.cx = pw / 2; view.cy = ph / 2;
        view.zoom = Math.max(0.3, Math.min(3, Math.min(cw / pw, ch / ph)));
        fitted = true;
    }

    /* ─────────────────────── 编辑操作 ─────────────────────── */
    function paintTile(tx, ty) {
        if (!inB(tx, ty)) return;
        var i = idx(tx, ty), L = S.curLayer, bs = S.brushSize;
        var x0 = tx - Math.floor((bs - 1) / 2), y0 = ty - Math.floor((bs - 1) / 2);
        for (var dy = 0; dy < bs; dy++) for (var dx = 0; dx < bs; dx++) {
            var x = x0 + dx, y = y0 + dy;
            if (!inB(x, y)) continue;
            var j = idx(x, y);
            if (L === LAYER.water) { S.water[j] = 1; S.mountain[j] = 0; S.road[j] = 0; }
            else if (L === LAYER.mountain) { S.mountain[j] = 1; S.water[j] = 0; S.road[j] = 0; }
            else if (L === LAYER.road) { S.road[j] = 1; S.water[j] = 0; S.mountain[j] = 0; }
            else if (L === LAYER.erase) { S.water[j] = 0; S.mountain[j] = 0; S.road[j] = 0; }
            else if (L === LAYER.solid) { S.solid[j] = 1; }
            else if (L === LAYER.region && S.curRegion >= 0) S.regionGrid[j] = S.curRegion + 1;
        }
    }

    /* 油漆桶：按填充目标 flood */
    function fillAt(tx, ty) {
        if (!inB(tx, ty)) return;
        var target = S.fillTarget;
        if (target === LAYER.water) {
            Geom.floodFill(S.W, S.H, tx, ty, function (x, y) { return !S.water[idx(x, y)]; }, function (x, y) { S.water[idx(x, y)] = 1; S.mountain[idx(x, y)] = 0; S.road[idx(x, y)] = 0; });
        } else if (target === LAYER.mountain) {
            Geom.floodFill(S.W, S.H, tx, ty, function (x, y) { return !S.mountain[idx(x, y)]; }, function (x, y) { S.mountain[idx(x, y)] = 1; S.water[idx(x, y)] = 0; S.road[idx(x, y)] = 0; });
        } else if (target === LAYER.road) {
            Geom.floodFill(S.W, S.H, tx, ty, function (x, y) { return !S.road[idx(x, y)]; }, function (x, y) { S.road[idx(x, y)] = 1; S.water[idx(x, y)] = 0; S.mountain[idx(x, y)] = 0; });
        } else if (target === LAYER.erase) {
            Geom.floodFill(S.W, S.H, tx, ty, function (x, y) { return S.water[idx(x, y)] || S.mountain[idx(x, y)] || S.road[idx(x, y)]; }, function (x, y) { S.water[idx(x, y)] = 0; S.mountain[idx(x, y)] = 0; S.road[idx(x, y)] = 0; });
        } else if (target === LAYER.region && S.curRegion >= 0) {
            var want = S.curRegion + 1, cur = S.regionGrid[idx(tx, ty)];
            Geom.floodFill(S.W, S.H, tx, ty, function (x, y) { return S.regionGrid[idx(x, y)] === cur; }, function (x, y) { S.regionGrid[idx(x, y)] = want; });
        }
    }

    /* ─────────────────────── 历史 ─────────────────────── */
    function snapshot() {
        return {
            region: S.regionGrid.slice(), water: S.water.slice(), mountain: S.mountain.slice(),
            road: S.road.slice(), solid: S.solid.slice(),
            regions: JSON.parse(JSON.stringify(S.regions)),
            deco: JSON.parse(JSON.stringify(S.deco)),
            pois: JSON.parse(JSON.stringify(S.pois)),
            spawn: { x: S.spawn.x, y: S.spawn.y }
        };
    }
    function pushHistory() {
        history = history.slice(0, histIdx + 1);
        history.push(snapshot());
        if (history.length > 60) history.shift();
        histIdx = history.length - 1;
        refreshUndo();
    }
    function applySnapshot(s) {
        S.regionGrid = s.region.slice(); S.water = s.water.slice(); S.mountain = s.mountain.slice();
        S.road = s.road.slice(); S.solid = s.solid.slice();
        S.regions = JSON.parse(JSON.stringify(s.regions));
        S.deco = JSON.parse(JSON.stringify(s.deco));
        S.pois = JSON.parse(JSON.stringify(s.pois));
        S.spawn = { x: s.spawn.x, y: s.spawn.y };
        rebuildRegionsUI(); rebuildPalette();
    }
    function undo() { if (histIdx > 0) { histIdx--; applySnapshot(history[histIdx]); rebuildBase(); refreshUndo(); status('已撤销'); } }
    function redo() { if (histIdx < history.length - 1) { histIdx++; applySnapshot(history[histIdx]); rebuildBase(); refreshUndo(); status('已重做'); } }
    function refreshUndo() {}

    /* 重绘底图 */
    function rebuildBase() { buildBase(); draw(); updateTileInfo(); }
    function fullRender() {
        buildBase();
        if (!fitted) initialView();
        draw(); updateTileInfo();
    }

    /* setStatus helper */
    function status(m) {
        var el = $('#statusMsg'); if (el) el.textContent = m;
    }

    /* ─────────────────────── 编辑触发（指针） ─────────────────────── */
    var painting = false, panning = false, lastTile = null, gestureAlloc = false;

    function onDown(e) {
        if (e.button === 2) { panning = true; lastPT = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
        if (e.button !== 0) return;
        painting = true;
        gestureAlloc = false;
        lastTile = null;
        var t = tileAt(e.clientX, e.clientY);
        if (S.curLayer === LAYER.inspect) { doInspect(t.tx, t.ty); painting = false; return; }
        if (S.curLayer === LAYER.decor) { doStamp(t.tx, t.ty); painting = false; return; }
        if (S.curLayer === LAYER.spawn) { doSpawn(t.tx, t.ty); painting = false; return; }
        if (S.curLayer === LAYER.poi) { doPoi(t.tx, t.ty); painting = false; return; }
        if (S.curLayer === LAYER.fill) { fillAt(t.tx, t.ty); pushHistory(); rebuildBase(); return; }
        paintTile(t.tx, t.ty); lastTile = [t.tx, t.ty]; gestureAlloc = true;
        rebuildBase();
    }
    var lastPT = null;
    function onMove(e) {
        var rect = canvas.getBoundingClientRect();
        if (rect.width === 0) return;
        var s = screenToWorld(e.clientX, e.clientY);
        S.mouse = { wx: s.x, wy: s.y, tx: Math.floor(s.x / S.P), ty: Math.floor(s.y / S.P) };
        if (panning) { view.cx -= (e.clientX - lastPT.x) / view.zoom; view.cy -= (e.clientY - lastPT.y) / view.zoom; lastPT = { x: e.clientX, y: e.clientY }; draw(); return; }
        if (painting && S.curLayer === LAYER.region || (painting && (S.curLayer === LAYER.water || S.curLayer === LAYER.mountain || S.curLayer === LAYER.road || S.curLayer === LAYER.erase))) {
            var t = S.mouse, dx = t.tx - lastTile[0], dy = t.ty - lastTile[1];
            var steps = Math.max(Math.abs(dx), Math.abs(dy));
            for (var k = 0; k <= steps; k++) {
                var ix = lastTile[0] + Math.round(dx * k / steps), iy = lastTile[1] + Math.round(dy * k / steps);
                paintTile(ix, iy);
            }
            lastTile = [t.tx, t.ty];
            rebuildBase();
        }
        draw();
        updateTileInfo();
    }
    function onUp(e) {
        if (e.button === 2) { panning = false; return; }
        if (!painting) return;
        painting = false;
        if (gestureAlloc) { pushHistory(); }
    }
    function onWheel(e) {
        e.preventDefault();
        var rect = canvas.getBoundingClientRect();
        var w = screenToWorld(e.clientX, e.clientY);
        var f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        var nz = Math.max(0.25, Math.min(8, view.zoom * f));
        /* 以光标为中心缩放 */
        view.cx = w.x - (e.clientX - rect.left - rect.width / 2) / nz;
        view.cy = w.y - (e.clientY - rect.top - rect.height / 2) / nz;
        view.zoom = nz;
        draw();
    }

    function doInspect(tx, ty) {
        var found = S.deco.find(function (d) { return d.x === tx && d.y === ty; })
            || S.pois.find(function (p) { return p.x === tx && p.y === ty; });
        S.selected = found || null;
        draw(); updateTileInfo();
    }

    function doSpawn(tx, ty) {
        S.spawn = { x: tx, y: ty };
        pushHistory(); rebuildBase(); status('出生点已移动到 (' + tx + ',' + ty + ')');
    }

    function doPoi(tx, ty) {
        var p = S.poiPreset;
        if (p.type === 'realm') {
            S.pois.push({ id: 'realm_' + p.realm, type: 'realm', emoji: p.emoji, x: tx, y: ty, realm: p.realm });
        } else {
            S.pois.push({ id: 'npc', type: 'npc', emoji: p.emoji, x: tx, y: ty, label: p.label });
        }
        pushHistory(); draw(); status('已放置交互点 (' + tx + ',' + ty + ')');
    }

    function doStamp(tx, ty) {
        if (!S.decorStamp) return;
        S.deco.push({ x: tx, y: ty, theme: S.decorStamp.theme, tile: S.decorStamp.tile, solid: S.decorStamp.solid });
        if (S.decorStamp.solid) S.solid[idx(tx, ty)] = 1;
        pushHistory(); rebuildBase(); status('贴纸已放置 (' + tx + ',' + ty + ')');
    }

    /* ─────────────────────── UI 构建 ─────────────────────── */
    function sel(id) { return document.getElementById(id); }

    /* 图层栏 */
    function buildLayers() {
        var ul = $('#layerList'); ul.innerHTML = '';
        LAYER_META.forEach(function (m) {
            var li = document.createElement('li');
            li.dataset.layer = m.id;
            li.innerHTML = '<span class="swatch" style="background:' + layerSwatch(m.id) + '"></span>' +
                '<span class="lname">' + m.name + '</span><kbd>' + m.key + '</kbd>';
            li.addEventListener('click', function () { setLayer(m.id); });
            ul.appendChild(li);
        });
    }
    function layerSwatch(l) {
        if (l === LAYER.water) return C.WATER;
        if (l === LAYER.mountain) return C.MOUNT;
        if (l === LAYER.road) return C.ROAD;
        if (l === LAYER.region) return '#8FA84F';
        if (l === LAYER.decor) return '#5b3fa0';
        if (l === LAYER.spawn) return '#f4c542';
        if (l === LAYER.poi) return '#4ecdc4';
        if (l === LAYER.fill) return '#d4af37';
        return '#39414f';
    }
    function setLayer(l) {
        S.curLayer = l;
        document.querySelectorAll('#layerList li').forEach(function (li) {
            li.classList.toggle('active', li.dataset.layer === l);
        });
        if (S.curLayer === LAYER.fill) showFillTarget(); else hideFillTarget();
        if (S.curLayer === LAYER.poi) showPoiBar(); else hidePoiBar();
        if (S.curLayer === LAYER.region) highlightRegion();
        updateTileInfo();
    }

    function showFillTarget() {
        var box = $('#fillTargetRow'); if (box) box.classList.remove('hidden');
    }
    function hideFillTarget() { var box = $('#fillTargetRow'); if (box) box.classList.add('hidden'); }
    function showPoiBar() { $('#poiBar').classList.remove('hidden'); }
    function hidePoiBar() { $('#poiBar').classList.add('hidden'); }

    /* 区域列表 */
    function rebuildRegionsUI() {
        var ul = $('#regionList'); ul.innerHTML = '';
        S.regions.forEach(function (rg, i) {
            var li = document.createElement('li');
            li.dataset.i = i;
            li.innerHTML = '<span class="swatch" style="background:' + regionColorHex(rg) + '"></span>' +
                '<span class="rname">' + rg.name + '</span><span class="rcount">' + regionCount(i + 1) + '</span>';
            li.addEventListener('click', function () { selectRegion(i); });
            li.addEventListener('dblclick', function () { openRegionModal(i); });
            ul.appendChild(li);
        });
        var del = $('#btnDelRegion'); del.disabled = S.curRegion < 0;
        highlightRegion();
        updateTileInfo();
    }
    function regionCount(val) {
        var n = 0; for (var i = 0; i < S.regionGrid.length; i++) if (S.regionGrid[i] === val) n++;
        return n;
    }
    function selectRegion(i) {
        S.curRegion = i; setLayer(LAYER.region);
        document.querySelectorAll('#regionList li').forEach(function (li) {
            li.classList.toggle('active', +li.dataset.i === i);
        });
        var del = $('#btnDelRegion'); del.disabled = false;
        status('正在编辑区域：' + (S.regions[i] && S.regions[i].name));
    }
    function highlightRegion() {
        document.querySelectorAll('#regionList li').forEach(function (li) {
            li.classList.toggle('active', +li.dataset.i === S.curRegion);
        });
    }

    /* 工具网格列表（右侧“画笔”区） */
    function buildTools() {
        var grid = $('#toolGrid');
        LAYER_META.forEach(function (m) {
            var d = document.createElement('div');
            d.className = 'tool'; d.dataset.layer = m.id;
            d.innerHTML = '<span class="ico">' + m.ico + '</span><span class="tname">' + m.name + '</span>';
            d.addEventListener('click', function () { setLayer(m.id); });
            grid.appendChild(d);
        });
        /* toolGrid 点击后同步高亮 */
        grid.addEventListener('click', function () {
            document.querySelectorAll('#toolGrid .tool').forEach(function (d) {
                d.classList.toggle('active', d.dataset.layer === S.curLayer);
            });
        });
    }

    /* 图格贴纸面板 */
    function rebuildPalette() {
        var sel = $('#paletteTileset');
        var prev = sel.value;
        sel.innerHTML = '';
        Object.keys(S.tilesets).forEach(function (k) {
            var o = document.createElement('option'); o.value = k; o.textContent = k;
            sel.appendChild(o);
        });
        if (prev && S.tilesets[prev]) sel.value = prev;
        renderPalette();
    }
    function renderPalette() {
        var theme = $('#paletteTileset').value; if (!theme || !S.tilesets[theme]) return;
        var img = S.atlas[theme];
        var box = $('#tilePalette'); box.innerHTML = '';
        var cols = S.tilesets[theme].cols || 12;
        var T = S.TILE;
        var total = img ? tilesetRows(theme, img) * cols : 30;
        for (var i = 0; i < total; i++) {
            var c = document.createElement('div');
            c.className = 'tcell' + (S.decorStamp && S.decorStamp.theme === theme && S.decorStamp.tile === i ? ' active' : '');
            c.dataset.tile = i;
            if (img) {
                var sx = (i % cols) * T, sy = Math.floor(i / cols) * T;
                var cv = canvasEl(T, T), g = cv.getContext('2d');
                try { g.imageSmoothingEnabled = false; g.drawImage(img, sx, sy, T, T, 0, 0, T, T); } catch (e) {}
                cv.style.width = '100%'; cv.style.height = '100%';
                c.appendChild(cv);
            } else { c.style.background = '#20242c'; }
            /* 用子节点追加编号，避免 innerHTML += 重建 canvas 清空已绘制像素 */
            var cidx = document.createElement('span');
            cidx.className = 'idx'; cidx.textContent = i;
            c.appendChild(cidx);
            c.addEventListener('click', function () {
                S.decorStamp = { theme: theme, tile: +this.dataset.tile, solid: $('#solidChk').checked };
                renderPalette(); setLayer(LAYER.decor);
            });
            box.appendChild(c);
        }
    }

    /* ─────────────────────── 右键 POI 预设栏 ─────────────────────── */
    function makePoiBar() {
        var bar = document.createElement('div');
        bar.id = 'poiBar';
        bar.className = 'hidden';
        bar.innerHTML = '<div class="row"><select id="poiType"><option value="npc">NPC</option><option value="realm">六道入口</option></select></div>' +
            '<div class="row" id="poiFields"><input id="poiEmoji" type="text" value="🧙" style="width:64px" title="表情"><input id="poiLabel" type="text" placeholder="名称"></div>' +
            '<div class="row hidden" id="realmFields"><select id="poiRealm"></select></div>' +
            '<button class="btn sm" id="poiHint">点击画布放置</button>';
        $('#palettePanel').appendChild(bar);
        var realms = ['hungry', 'heaven', 'animal', 'hell', 'human', 'asura'];
        var rs = $('#poiRealm');
        realms.forEach(function (r) { var o = document.createElement('option'); o.value = r; o.textContent = r; rs.appendChild(o); });
        $('#poiType').addEventListener('change', function () {
            var t = this.value;
            $('#poiFields').classList.toggle('hidden', t === 'realm');
            $('#realmFields').classList.toggle('hidden', t !== 'realm');
        });
    }
    function readPoiPreset() {
        var el = $('#poiBar'); if (!el || el.classList.contains('hidden')) return;
        var type = $('#poiType').value;
        S.poiPreset.type = type;
        S.poiPreset.emoji = $('#poiEmoji').value || '📌';
        S.poiPreset.label = $('#poiLabel').value || '新NPC';
        S.poiPreset.realm = $('#poiRealm').value;
    }

    /* ─────────────────────── 区域弹窗 ─────────────────────── */
    function openRegionModal(i) {
        var rg = S.regions[i]; if (!rg) return;
        $('#modalTitle').textContent = '编辑区域';
        $('#f_id').value = rg.id;
        $('#f_name').value = rg.name;
        var the = $('#f_theme'); the.innerHTML = '';
        Object.keys(S.tilesets).forEach(function (k) {
            var o = document.createElement('option'); o.value = k; o.textContent = k; the.appendChild(o);
        });
        the.value = rg.theme || Object.keys(S.tilesets)[0] || '';
        $('#f_color').value = regionColorHex(rg) === C.BASE ? '#4F7A52' : regionColorHex(rg);
        $('#f_color').dataset.custom = rg.color ? '1' : '';
        $('#f_ground').value = (rg.ground || []).join(',');
        $('#f_area').textContent = regionCount(i + 1);
        $('#modal').classList.remove('hidden');
        $('#modal').dataset.index = i;
    }
    function closeModal() { $('#modal').classList.add('hidden'); }
    function saveRegion() {
        var i = +$('#modal').dataset.index;
        var id = $('#f_id').value.trim(), name = $('#f_name').value.trim();
        if (!id) { status('区域 ID 不能为空'); return; }
        var theme = $('#f_theme').value;
        var ground = $('#f_ground').value.split(',').map(function (s) { return parseInt(s.trim(), 10); }).filter(function (n) { return !isNaN(n); });
        var rg = S.regions[i];
        rg.id = id; rg.name = name || id; rg.theme = theme; rg.ground = ground;
        var custom = $('#f_color').dataset.custom;
        rg.color = custom ? $('#f_color').value : null;
        pushHistory(); rebuildRegionsUI(); rebuildBase(); closeModal(); status('区域已保存');
    }

    function newRegion() {
        S.curRegion = S.regions.length;
        S.regions.push({
            id: 'new_region_' + (S.regions.length + 1), name: '新区域',
            theme: Object.keys(S.tilesets)[0] || '', ground: [], color: null
        });
        rebuildRegionsUI(); selectRegion(S.curRegion); openRegionModal(S.curRegion);
    }
    function deleteRegion() {
        if (S.curRegion < 0) return;
        var v = S.curRegion + 1, id = S.regions[S.curRegion].id;
        if (!confirm('删除区域「' + id + '」？其画布覆盖将清除。')) return;
        /* 重编号：删掉 v，之后的区域下标 -1 */
        for (var i = 0; i < S.regionGrid.length; i++) {
            if (S.regionGrid[i] === v) S.regionGrid[i] = 0;
            else if (S.regionGrid[i] > v) S.regionGrid[i]--;
        }
        S.regions.splice(S.curRegion, 1);
        S.curRegion = -1;
        pushHistory(); rebuildRegionsUI(); rebuildBase(); status('已删除区域');
    }

    /* ─────────────────────── 导入/导出 ─────────────────────── */
    function bindImport() {
        $('#fileImport').addEventListener('change', function (e) {
            var f = e.target.files[0]; if (!f) return;
            var rd = new FileReader();
            rd.onload = function () {
                try { var ow = JSON.parse(rd.result); importMap(ow); S.file = f.name; } catch (err) { status('导入失败：' + err.message); }
            };
            rd.readAsText(f);
        });
        $('#btnLoadTemplate').addEventListener('click', function () {
            fetch('template/overworld.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(function (ow) { importMap(ow); status('已载入模板 template/overworld.json'); })
                .catch(function (e) { status('模板载入失败：' + e.message); });
        });
    }
    function bindExport() {
        $('#btnExport').addEventListener('click', function () {
            if (!S.W) return status('请先载入地图');
            try {
                var ow = exportMap(); validateExport(ow);
            } catch (e) { status('导出校验失败：' + e.message); return; }
            var blob = new Blob([JSON.stringify(ow, null, 2)], { type: 'application/json' });
            (window.saveAs || function (b, n) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(b); a.download = n; a.click();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
            })(blob, 'overworld.json');
            status('已导出 overworld.json');
        });
        $('#btnCopyToGame').addEventListener('click', function () {
            if (!S.W) return status('请先载入地图');
            var ow;
            try { ow = exportMap(); validateExport(ow); } catch (e) { status('导出校验失败：' + e.message); return; }
            /* POST 到后端写盘接口（若有） */
            fetch('/api/overworld/save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ow)
            }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(function () { status('已写入 configs/overworld.json，可刷新游戏查看'); })
                .catch(function (e) {
                    downloadFallback(ow);
                    status('后端写盘不可用，已改为浏览器下载（请手动替换 configs/overworld.json）');
                });
        });
    }
    function downloadFallback(ow) {
        var blob = new Blob([JSON.stringify(ow, null, 2)], { type: 'application/json' });
        (window.saveAs || function (b, n) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 800); })(blob, 'overworld.json');
    }

    /* ─────────────────────── 信息面板 ─────────────────────── */
    function updateTileInfo() {
        var m = S.mouse;
        var dd = $('#tileInfo');
        if (!m || !inB(m.tx, m.ty)) {
            dd.children[1].textContent = '—'; dd.children[3].textContent = '—';
            dd.children[5].textContent = '—'; dd.children[7].textContent = '—';
            dd.children[9].textContent = '—'; dd.children[11].textContent = '—';
            return;
        }
        var i = idx(m.tx, m.ty);
        dd.children[1].textContent = '(' + m.tx + ', ' + m.ty + ')';
        var rv = S.regionGrid[i];
        dd.children[3].textContent = rv > 0 && S.regions[rv - 1] ? S.regions[rv - 1].name : '无';
        dd.children[5].textContent = S.water[i] ? '是' : '否';
        dd.children[7].textContent = S.mountain[i] ? '是' : '否';
        dd.children[9].textContent = S.road[i] ? '是' : '否';
        var dec = S.deco.find(function (d) { return d.x === m.tx && d.y === m.ty; });
        dd.children[11].textContent = dec ? (dec.theme + ' · ' + dec.tile) : '—';
        /* 选中对象 */
        var stat = $('#statCounts');
        if (stat) stat.textContent = 'n填 ' + regionTotal() + ' 贴纸' + S.deco.length + ' 交互点' + S.pois.length;
    }
    function regionTotal() {
        var n = 0; for (var i = 0; i < S.regionGrid.length; i++) if (S.regionGrid[i]) n++;
        return n;
    }

    /* ─────────────────────── 快捷键 ─────────────────────── */
    function bindKeys() {
        document.addEventListener('keydown', function (e) {
            var tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
            if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
            var hit = LAYER_META.find(function (m) { return m.key === e.key; });
            if (hit) setLayer(hit.id);
            if (e.key === '[') changeBrush(-1);
            if (e.key === ']') changeBrush(1);
            if (e.key === 'Delete' && S.selected) {
                removeSelected(); e.preventDefault();
            }
        });
    }
    function changeBrush(d) { S.brushSize = Math.max(1, Math.min(12, (S.brushSize || 1) + d)); $('#brushSize').value = S.brushSize; $('#brushSizeVal').textContent = S.brushSize; }
    function removeSelected() {
        if (!S.selected) return;
        var s = S.selected;
        if (s.theme !== undefined) { /* deco */
            S.deco = S.deco.filter(function (d) { return !(d.x === s.x && d.y === s.y && d.theme === s.theme && d.tile === s.tile); });
            S.solid[idx(s.x, s.y)] = 0;
        } else {
            S.pois = S.pois.filter(function (p) { return !(p.x === s.x && p.y === s.y); });
        }
        S.selected = null;
        pushHistory(); rebuildBase(); status('已删除所选对象');
    }

    /* 填充目标下拉与画笔滑块 */
    function bindControls() {
        $('#fillTarget').addEventListener('change', function () { S.fillTarget = this.value; });
        $('#brushSize').addEventListener('input', function () { S.brushSize = +this.value; $('#brushSizeVal').textContent = S.brushSize; });
    }

    /* ─────────────────────── 初始化 ─────────────────────── */
    function init() {
        canvas = $('#mapCanvas');
        ctx = makeEditor(canvas);
        bindImport(); bindExport();
        buildLayers(); rebuildToolsStatic();
        bindRegionUI();
        bindModalUI();
        makePoiBar();
        buildTools();
        bindControls();
        bindKeys();

        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        canvas.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('resize', function () { draw(); });

        if (S.W) initialView(); else setTimeout(initialView, 0);

        /* 默认载入模板 */
        $('#btnLoadTemplate').click();
    }

    function rebuildToolsStatic() {
        var tb = $('#toolGrid'); if (!tb) return;
    }

    function bindRegionUI() {
        $('#btnNewRegion').addEventListener('click', newRegion);
        $('#btnDelRegion').addEventListener('click', deleteRegion);
    }
    function bindModalUI() {
        $('#f_done').addEventListener('click', saveRegion);
        $('#f_cancel').addEventListener('click', closeModal);
        $('#f_colorClear').addEventListener('click', function () {
            $('#f_color').dataset.custom = '';
        });
        $('#f_color').addEventListener('input', function () { this.dataset.custom = '1'; });
    }

    document.addEventListener('DOMContentLoaded', init);
})();