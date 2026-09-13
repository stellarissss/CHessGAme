/* ═══════════════════════════════════════════════════════════════
   六道大陆 · 大地图渲染器（melonJS 版）· OW-REMAKE v1
   永久替换损坏的 WebGPU 渲染器：melonJS v20 以默认 Canvas2D（黑屏不可能）
   或 WebGL 渲染整张大陆，内置动态光（ambientLight 暗色叠加被各 Light2d 挖空）。
   · 静态地图整屏预渲染到离屏 canvas，逐帧仅用一次 drawImage 截取可视区（高性能）
   · 动态光影：舞台 ambientLight 昼夜循环 + 太阳光/玩家火把/各道境辉光 Light2d
   · 玩家/POI/小地图/HUD 复用 overworld-wgpu.js 的 DOM 覆盖层胶水
   与 overworld-ui.js 兼容：保留 getSamsara / syncSamsara / refreshFromUI 等接口。
   ═══════════════════════════════════════════════════════════════ */
import * as me from "/static/vendor/melonjs/index.js";

var CELL;            // 单格像素 = world.tile * world.scale
var EXPLORED_KEY = 'chesssage_ow_explored';
var UI = (typeof window !== 'undefined') ? (window.OverworldUI || null) : null;       // DOM OverworldUI 句柄
var ATLAS_DEFS = {
  town:    '/shared/assets/map/atlas/tiles_tiny-town.png',
  farm:    '/shared/assets/map/atlas/tiles_tiny-farm.png',
  dungeon: '/shared/assets/map/atlas/tiles_tiny-dungeon.png',
  battle:  '/shared/assets/map/atlas/tiles_tiny-battle.png'
};

var REALM_NAMES = {
  hell: '地狱道', hungry: '饿鬼道', animal: '畜生道',
  human: '人道', asura: '阿修罗道', heaven: '天道'
};
var F = { WATER: 1, ROAD: 2, MOUNT: 4, WALL: 8, SOLID: 16 };
var REGION_ORDER = ['nw_forest','n_snow','ne_pasture','w_waste','c_plain','east_ridge','sw_dungeon','s_desert','se_battle'];
var REGION_IDX = { nw_forest:0, n_snow:1, ne_pasture:2, w_waste:3, c_plain:4, east_ridge:5, sw_dungeon:6, s_desert:7, se_battle:8 };

/* ═══════════════════════════ OverworldGame ═══════════════════════════ */
var OverworldGame = {
  _levelTotals: {},

  getSamsara: function () { return this.samsara; },
  getGames: function () { return this.games; },
  syncSamsara: function (state) {
    if (!state) return;
    this.samsara = state;
    this._syncBadges((state.realm_progress || {}));
    if (UI) UI.refreshHUD();
  },
  refreshSamsara: function () {
    var self = this;
    return fetch('/samsara/api/state').then(function (r) { return r.json(); })
      .then(function (s) { self.syncSamsara(s); return s; }).catch(function () { return null; });
  },
  refreshFromUI: function () { return this.refreshSamsara(); },
  startPolling: function () {
    var self = this;
    this.pollTimer = setInterval(function () { self.refreshSamsara(); }, 8000);
  },
  stopPolling: function () { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } },
  isOpen: function () { return UI ? UI.isModalOpen() : false; },

  /* —— 确定性哈希（保证每格地面在刷新间稳定） —— */
  _hash: function (x, y, salt) {
    var h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  },

  /* —— 世界几何引导：flags 构建 + 地图预渲染（兼容新 baked + 旧字段） —— */
  bootstrapGeometry: function (ow) {
    var self = this;
    this.W = ow.world.width; this.H = ow.world.height; this.ow = ow;
    CELL = ow.world.tile * ow.world.scale;
    this._seed = ow.world.seed || 0;
    var W = this.W, H = this.H;

    // 可走性 flags
    var flags = this.flags = new Int32Array(W * H);
    var regionByTile = this.regionByTile = [];
    for (var i = 0; i < H; i++) regionByTile.push(new Array(W));

    // 区域（regionByTile 用 region 对象，便于小地图取色）
    var ridByIdx = {};
    if (ow.regions) ow.regions.forEach(function (r) { ridByIdx[r.id] = r; });
    var regionStr = (ow.baked && ow.baked.region) || "";
    if (regionStr.length === W * H) {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var c = regionStr.charAt(x + y * W);
        if (c >= '0' && c <= '8') {
          var rid = REGION_ORDER[parseInt(c, 10)];
          if (ridByIdx[rid]) regionByTile[y][x] = ridByIdx[rid];
        }
      }
    } else {
      // 旧字段 fallback：用 region.rect 填充
      (ow.regions || []).forEach(function (rg) {
        var r = rg.rect, x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3];
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
          if (x >= 0 && x < W && y >= 0 && y < H) regionByTile[y][x] = rg;
      });
    }

    // 旧字段兼容：先处理 water_overlays / rivers / mountain_overlays / roads / solid_regions
    function fillRect(list, flag) {
      if (!Array.isArray(list)) return;
      list.forEach(function (it) {
        if (!it || it[0] !== 'rect') return;
        var x0 = it[2], y0 = it[3], x1 = it[4], y1 = it[5];
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
          if (y >= 0 && y < H && x >= 0 && x < W) flags[y * W + x] |= flag;
      });
    }
    fillRect(ow.water_overlays, F.WATER);
    fillRect(ow.river_snow,    F.WATER);
    fillRect(ow.river_ridge,   F.WATER);
    fillRect(ow.mountain_overlays, F.MOUNT);
    (ow.roads || []).forEach(function (r) {
      if (r.rect) { for (var i = r.rect[0]; i <= r.rect[2]; i++) for (var j = r.rect[1]; j <= r.rect[3]; j++) if (i >= 0 && i < W && j >= 0 && j < H) flags[j * W + i] |= F.ROAD; }
      else if (r.x !== undefined) { for (var j = r.y0; j <= r.y1; j++) if (j >= 0 && j < H && r.x >= 0 && r.x < W) flags[j * W + r.x] |= F.ROAD; }
      else if (r.y !== undefined) { for (var i = r.x0; i <= r.x1; i++) if (i >= 0 && i < W && r.y >= 0 && r.y < H) flags[r.y * W + i] |= F.ROAD; }
    });
    (ow.solid_regions || []).forEach(function (s) {
      var r = s.rect;
      for (var j = r[1]; j <= r[3]; j++) for (var i = r[0]; i <= r[2]; i++)
        if (j >= 0 && j < H && i >= 0 && i < W) flags[j * W + i] |= F.SOLID;
    });

    // 新字段 baked.terrain：ground truth（覆盖旧字段）
    // terrain 编码：0=DEEP 1=SHALLOW 2=BEACH 3=GRASS 4=HILL 5=MOUNT 6=ALPINE 7=LAVA 8=WALL 9=ICE 10=SALT 11=DRY
    var terrainStr = (ow.baked && ow.baked.terrain) || "";
    if (terrainStr.length === W * H) {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var t = terrainStr.charCodeAt(x + y * W) - 48;
        if (t === 0 || t === 7) flags[y * W + x] |= F.WATER;
        if (t === 5 || t === 6) flags[y * W + x] |= F.MOUNT;
        if (t === 8) flags[y * W + x] |= F.WALL;
      }
    }
    var WALL = 6;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (x < WALL || x >= W - WALL || y < WALL || y >= H - WALL) flags[y * W + x] |= F.WALL;
    }

    // 装饰（烘焙数组或旧 decor_anchors/decor_plant 二选一）
    this.decor = ow.decor || [];
    if (!this.decor.length && ow.decor_anchors) {
      this.decor = ow.decor_anchors.map(function (a) {
        return [a.x, a.y, a.tile[0], a.tile[1], a.solid !== false];
      });
    }

    // 玩家出生
    var init;
    if (ow.player && ow.player.spawn) init = ow.player.spawn;
    else if (ow.player && ow.player.initial) init = ow.player.initial;
    else init = { x: 58, y: 46 };
    this.playerPos = { x: (init.x + 0.5) * CELL, y: (init.y + 0.5) * CELL };
    this.playerSpeedPx = (ow.player && ow.player.speed) ? ow.player.speed * 1.6 : 256;
    this.interactReachPx = ((ow.player && ow.player.interact_tiles) || 3.0) * CELL;

    // 加载图集
    return this._loadAtlases().then(function () {
      self._prerender();
      return self._prepDrawImage();
    }).then(function () {
      if (UI && typeof UI.setLoadingProgress === 'function') UI.setLoadingProgress(45);
    });
  },

  /* —— 把预渲染地图转成 melonJS 可上传的 ImageBitmap —— */
  _prepDrawImage: function () {
    var self = this;
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(this.mapCanvas).then(function (bmp) {
        self.mapImage = bmp;
      }).catch(function () {
        self.mapImage = self.mapCanvas;
      });
    }
    this.mapImage = this.mapCanvas;
    return Promise.resolve();
  },

  _loadAtlases: function () {
    var self = this;
    var keys = Object.keys(ATLAS_DEFS);
    this.atlases = {};
    return Promise.all(keys.map(function (k) {
      return new Promise(function (resolve) {
        var img = new Image();
        self.atlases[k] = img;
        img.onload = function () { resolve(); };
        img.onerror = function () { resolve(); };
        img.src = ATLAS_DEFS[k];
      });
    }));
  },

  /* —— 整张静态地图预渲染到离屏 canvas —— */
  _prerender: function () {
    var W = this.W, H = this.H, cell = CELL;
    var map = this.mapCanvas = document.createElement('canvas');
    var mapW = map.width = W * cell, mapH = map.height = H * cell;
    var ctx = map.getContext('2d');
    var self = this;
    var baked = (this.ow && this.ow.baked) || {};
    var terrainStr = baked.terrain || "";
    var heightStr  = baked.height  || "";
    var hasBaked = terrainStr.length === W * H;

    function tileRect(index) {
      return { sx: (index % 12) * 16, sy: Math.floor(index / 12) * 16 };
    }
    function drawTile(theme, index, x, y) {
      var img = self.atlases[theme];
      if (!img || !img.width) return;
      var s = tileRect(index);
      ctx.drawImage(img, s.sx, s.sy, 16, 16, x, y, cell, cell);
    }
    function shadow(x, y, r) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.ellipse(x + cell * 0.5, y + cell * 0.78, r * cell, r * cell * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 1) 中性暗色底
    ctx.fillStyle = '#1d231b';
    ctx.fillRect(0, 0, mapW, mapH);

    // 2) 地面（按 baked 主题选砖）
    var palette = {};
    var REGION_THEME = {};
    if (this.ow.ground_palette) this.ow.ground_palette.forEach(function (gp) { palette[gp.theme] = gp.tiles; });
    if (this.ow.regions) this.ow.regions.forEach(function (r) { REGION_THEME[r.id] = r.theme; });

    if (hasBaked && Object.keys(palette).length) {
      var regionStr = baked.region || "";
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var idx = x + y * W;
        var t = terrainStr.charCodeAt(idx) - 48;
        // 仅画陆地（GRASS=3, HILL=4, SALT=10, DRY=11）
        if (t !== 3 && t !== 4 && t !== 10 && t !== 11) continue;
        var theme = 'town';
        var c = regionStr.charAt(idx);
        if (c >= '0' && c <= '8') {
          var rid = REGION_ORDER[parseInt(c, 10)];
          if (REGION_THEME[rid]) theme = REGION_THEME[rid];
        }
        var pool = palette[theme] || palette.town || [0];
        var tile_idx = pool[Math.floor(self._hash(x, y, 1) * pool.length)];
        drawTile(theme, tile_idx, x * cell, y * cell);
      }
    } else {
      // 旧字段：按 region.rect
      (this.ow.regions || []).forEach(function (rg) {
        var r = rg.rect, x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3];
        var ground = rg.ground && rg.ground.length ? rg.ground : [0];
        var theme = rg.theme || 'town';
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
          if (x < 0 || x >= self.W || y < 0 || y >= self.H) continue;
          var t = ground[Math.floor(self._hash(x, y, 1) * ground.length) % ground.length];
          drawTile(theme, t, x * cell, y * cell);
        }
      });
    }

    // 3) 水 / 海 / 河（按 terrain 类型染色）
    var waterColor = { 0:'#1c567e', 1:'#4fa8c8', 2:'#dcceaa', 7:'#b43c1e', 9:'#e8f0f6' };
    if (hasBaked) {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var t = terrainStr.charCodeAt(x + y * W) - 48;
        if (waterColor[t] !== undefined) {
          ctx.fillStyle = waterColor[t];
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    } else {
      ctx.fillStyle = '#1E6A96';
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++)
        if (this.flags[y * W + x] & F.WATER) ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    // 4) 山（按高度 + 纬度渐变）
    function rgbMt(yy, h8) {
      var snowT = Math.max(0, Math.min(1, (140 - h8) / 100 + (1 - yy / 30)));
      return 'rgb(' + Math.round(127 * (1 - snowT) + 232 * snowT) + ',' +
        Math.round(122 * (1 - snowT) + 240 * snowT) + ',' +
        Math.round(115 * (1 - snowT) + 246 * snowT) + ')';
    }
    if (hasBaked) {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var t = terrainStr.charCodeAt(x + y * W) - 48;
        if (t !== 5 && t !== 6) continue;  // MOUNT, ALPINE
        var h8 = heightStr.length === W * H ? heightStr.charCodeAt(x + y * W) : 128;
        ctx.fillStyle = rgbMt(y, h8);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    } else {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        if (!(this.flags[y * W + x] & F.MOUNT)) continue;
        ctx.fillStyle = rgbMt(y, 128);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    // 5) 道路
    ctx.fillStyle = '#C9B37E';
    if (this.ow.roads && this.ow.roads.length && this.ow.roads[0].cells) {
      // 新 roads：每条 {id, level, cells, shoulder}
      (this.ow.roads || []).forEach(function (r) {
        (r.cells || []).forEach(function (c) {
          ctx.fillRect(c[0] * cell, c[1] * cell, cell, cell);
        });
      });
    } else {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++)
        if (this.flags[y * W + x] & F.ROAD) ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    // 6) 装饰（烘焙 decor 数组，按 y 排序；旧 decor_anchors + decor_plant 兜底）
    if (this.decor && this.decor.length) {
      var decorSorted = this.decor.slice().sort(function (a, b) { return a[1] - b[1]; });
      decorSorted.forEach(function (d) {
        var x = d[0], y = d[1], theme = d[2], idx = d[3], solid = d[4];
        if (x < 0 || x >= W || y < 0 || y >= H) return;
        shadow(x, y, solid ? 0.42 : 0.32);
        drawTile(theme, idx, x * cell, y * cell);
      });
    } else {
      // 旧字段 fallback
      (this.ow.decor_anchors || []).forEach(function (a) {
        shadow(a.x, a.y, 0.42);
        drawTile(a.tile[0], a.tile[1], a.x * cell, a.y * cell);
      });
      (this.ow.regions || []).forEach(function (rg) {
        var plant = self.ow.decor_plant && self.ow.decor_plant[rg.id];
        if (!plant || !plant.tiles || !plant.tiles.length) return;
        var density = plant.density != null ? plant.density : 0.05;
        var r = rg.rect, x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3];
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
          if (x < 0 || x >= self.W || y < 0 || y >= self.H) continue;
          if (self.flags[y * self.W + x] & (F.WATER | F.ROAD)) continue;
          if (self._hash(x, y, 7) > density) continue;
          var pick = plant.tiles[Math.floor(self._hash(x, y, 8) * plant.tiles.length)];
          shadow(x, y, 0.35);
          drawTile(pick[0], pick[1], x * cell, y * cell);
        }
      });
    }
  },

  /* —— 世界像素 → 屏幕（DOM 覆盖层用）：与 melonJS 相机/缩放对齐 —— */
  project: function (wx, wy) {
    var cam = this.app && this.app.viewport;
    if (!cam) return { x: 0, y: 0, on: false, scale: 1 };
    var s = this._domScale || { x: 1, y: 1 };
    var tx = cam.pos.x + cam.offset.x, ty = cam.pos.y + cam.offset.y;
    return { x: (wx - tx) * s.x, y: (wy - ty) * s.y, scale: 1, on: true };
  },
  _project: function () { return { x: 0, y: 0 }; },

  /* —— 随 melonJS 附加/无状态相关资源 —— */
  _attach: function (app) {
    this.app = app;
    this.world = app.world;
    this.viewport = app.viewport;
    this.renderer = app.renderer;
    this._recomputeDomScale();
    var self = this;
    this._onResize = function () { self._recomputeDomScale(); };
    window.addEventListener('resize', this._onResize);
  },
  _recomputeDomScale: function () {
    if (!this.renderer) return;
    try {
      var canvas = this.renderer.getCanvas();
      this._domScale = {
        x: (canvas.clientWidth || canvas.width || 1) / (this.renderer.width || 1),
        y: (canvas.clientHeight || canvas.height || 1) / (this.renderer.height || 1)
      };
    } catch (e) { this._domScale = { x: 1, y: 1 }; }
  },

  /* —— 舞台内容：地图层 + 动态光 —— */
  _buildStage: function (app) {
    var layer = new MapLayer(0, 0, this.W * CELL, this.H * CELL);
    layer.game = this;
    layer.alwaysUpdate = true;
    app.world.addChild(layer);
  },

  _frame: function (dtSec) {
    if (!this.mapImage || !this.renderer) return;
    var cam = this.app && this.app.viewport;
    if (!cam) return;
    var cell = CELL;
    var x = Math.floor(cam.pos.x / cell) * cell;
    var y = Math.floor(cam.pos.y / cell) * cell;
    var w = this.renderer.width, h = this.renderer.height;
    this.renderer.drawImage(this.mapImage, x, y, w, h, 0, 0, w, h);
  },

  _moveAxis: function (mx, my) {
    if (!this.playerPos) return;
    var step = this.playerSpeedPx * 0.016;
    this.playerPos.x += mx * step;
    this.playerPos.y += my * step;
  },

  _willCollide: function (gx, gy) {
    if (gx < 0 || gx >= this.W || gy < 0 || gy >= this.H) return true;
    return (this.flags[gy * this.W + gx] & (F.WALL | F.SOLID | F.WATER)) !== 0;
  },

  _isBarrier: function (tx, ty) {
    if (tx < 0 || tx >= this.W || ty < 0 || ty >= this.H) return true;
    return (this.flags[ty * this.W + tx] & (F.WALL | F.SOLID)) !== 0;
  },

  _makeOverlay: function () { return null; },

  _buildPlayer: function () { return null; },

  _buildPoisOverlay: function () {
    if (!this.ow || !this.ow.pois) return;
    this.pois = this.ow.pois.map(function (p) { return { poi: p }; });
  },

  _buildBillboard: function (p) {},
  _refreshBillboard: function () {},

  _syncBadges: function (realmProgress) {
    if (!UI) return;
    try { UI.refreshBadges(realmProgress); } catch (e) {}
  },

  _updateOverlay: function () {},

  _minimapColor: function (x, y) {
    var fl = this.flags[y * this.W + x];
    if (fl & 1) return [0x1c, 0x56, 0x7e];   // 水（深）
    if (fl & 2) return [0xc9, 0xb3, 0x7e];   // 路
    if (fl & 4) return [0x6a, 0x74, 0x88];   // 山
    if (fl & 8) return [0x11, 0x14, 0x18];   // 墙
    // 区域
    var rg = this.regionByTile && this.regionByTile[y] && this.regionByTile[y][x];
    if (rg && rg.color) {
      var c = rg.color.replace('#', '');
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    }
    return [0x5f, 0x9e, 0x4e];
  },

  initMinimap: function () {
    var c = document.getElementById('minimap-base');
    if (!c || !this.W) return;
    var W = this.W, H = this.H;
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(W, H), d = img.data;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var col = this._minimapColor(x, y), i = (y * W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    var poisEl = document.getElementById('minimap-pois');
    if (!poisEl) return;
    poisEl.innerHTML = '';
    this.minimapPois = {};
    var self = this;
    (this.pois || []).forEach(function (m) {
      var p = m.poi;
      if (!p) return;
      var div = document.createElement('div');
      var isSandbox = p.type === 'sandbox';
      div.className = 'minimap-poi' + (isSandbox ? ' sandbox' : '');
      div.style.left = ((p.x + 0.5) / W * 100) + '%';
      div.style.top = ((p.y + 0.5) / H * 100) + '%';
      if (p.label) div.setAttribute('title', p.label);
      poisEl.appendChild(div);
      self.minimapPois[p.id] = { div: div, base: p.emoji };
      if (isSandbox) { div.classList.add('explored'); div.textContent = p.emoji; }
      else if (self._isExplored(p.id)) { div.classList.add('explored'); div.textContent = p.emoji; }
      else { div.classList.add('unexplored'); div.textContent = '❓'; }
    });
    this._refreshMinimapPlayer();
  },

  _refreshMinimapPlayer: function () {
    var p = document.getElementById('minimap-player');
    if (!p || !this.playerPos || !this.W) return;
    p.style.left = (this.playerPos.x / CELL / this.W * 100) + '%';
    p.style.top = (this.playerPos.y / CELL / this.H * 100) + '%';
  },

  _isExplored: function (poiId) {
    try {
      var d = JSON.parse(localStorage.getItem(EXPLORED_KEY) || '{}');
      return !!d[poiId];
    } catch (e) { return false; }
  },

  _markExplored: function (poiId) {
    try {
      var d = JSON.parse(localStorage.getItem(EXPLORED_KEY) || '{}');
      d[poiId] = true;
      localStorage.setItem(EXPLORED_KEY, JSON.stringify(d));
    } catch (e) {}
  },

  _fetchGamesAndState: function () {
    var self = this;
    return fetch('/api/games').then(function (r) { return r.json(); })
      .then(function (gs) { self.games = gs; return gs; });
  },

  _updateInteraction: function () {
    if (!UI || !this.pois) return;
    var pp = this.playerPos;
    if (!pp) return;
    var reach = this.interactReachPx;
    var hit = null, minD = reach;
    for (var i = 0; i < this.pois.length; i++) {
      var p = this.pois[i].poi;
      var d = Math.hypot((p.x + 0.5) * CELL - pp.x, (p.y + 0.5) * CELL - pp.y);
      if (d <= minD) { hit = p; minD = d; }
    }
    if (hit) UI.showInteract(hit); else UI.hideInteract();
  },

  _updateRealmGuide: function () {},

  _onInteract: function () {},

  bindInput: function () {},

  _buildScene: function () {}
};

class MapLayer extends me.Renderable {
  constructor(x, y, w, h) {
    super(x, y, w, h);
  }
  update(dt) {
    if (this.game && this.game._frame) this.game._frame(dt);
    return true;
  }
  draw(renderer) {
    // 预渲染地图已在 _frame 中通过 renderer.drawImage 绘到屏幕
  }
}

class OverworldStage extends me.Stage {
  onResetEvent() {}
}

function melonBoot() {
  me.device.onReady(function () {
    fetch('/api/overworld/config', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (ow) { initApplication(ow); })
      .catch(function (e) { console.error(e); });
  });
}

function initApplication(ow) {
  OverworldGame.bootstrapGeometry(ow);
}

// 把导出同时挂到 window（hub/overworld-load.js / overworld-ui.js 透过 window 引用）
if (typeof window !== 'undefined') {
  window.OverworldGame = OverworldGame;
  window.MapLayer = MapLayer;
  window.OverworldStage = OverworldStage;
  window.melonBoot = melonBoot;
}

export { OverworldGame, MapLayer, OverworldStage, melonBoot };