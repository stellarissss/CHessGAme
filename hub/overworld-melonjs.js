/* ═══════════════════════════════════════════════════════════════
   六道大陆 · 大地图渲染器（melonJS 版）
   永久替换损坏的 WebGPU 渲染器：melonJS v20 以默认 Canvas2D（黑屏不可能）
   或 WebGL 渲染整张大陆，内置动态光（ambientLight 暗色叠加被各 Light2d 挖空）。
   · 静态地图整屏预渲染到离屏 canvas，逐帧仅用一次 drawImage 截取可视区（高性能）
   · 动态光影：舞台 ambientLight 昼夜循环 + 玩家火把/各道境辉光 Light2d
     （注意：Light2d 第 3/4 参为半径；全局明暗由 ambientLight 承担，勿再加巨型加色 glow）
   · 玩家/POI/小地图/HUD 复用 overworld-wgpu.js 的 DOM 覆盖层胶水
   与 overworld-ui.js 兼容：保留 getSamsara / syncSamsara / refreshFromUI 等接口。
   ═══════════════════════════════════════════════════════════════ */
import * as me from "/static/vendor/melonjs/index.js";

var CELL;            // 单格像素 = world.tile * world.scale
var EXPLORED_KEY = 'chesssage_ow_explored';
var UI = null;       // DOM OverworldUI 句柄（ES Module 中未声明标识符的读取会抛 ReferenceError）
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

  /* —— 世界几何引导：flags 构建 + 地图预渲染（不含 melonJS） —— */
  bootstrapGeometry: function (ow) {
    var self = this;
    this.W = ow.world.width; this.H = ow.world.height; this.ow = ow;
    CELL = ow.world.tile * ow.world.scale;
    this._seed = ow.world.seed || 0;

    // 可走性 flags（bit1 水 bit2 路 bit4 山 bit8 墙 bit16 实心）
    var flags = this.flags = new Int32Array(this.W * this.H);
    var regionByTile = this.regionByTile = [];
    for (var i = 0; i < this.H; i++) regionByTile.push(new Array(this.W));

    function fillRect(list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (it) {
        if (!it || it[0] !== 'rect') return;
        var x0 = it[2], y0 = it[3], x1 = it[4], y1 = it[5];
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
          if (y >= 0 && y < self.H && x >= 0 && x < self.W) flags[y * self.W + x] |= F.WATER;
      });
    }
    fillRect(ow.water_overlays); fillRect(ow.river_snow); fillRect(ow.river_ridge);
    (ow.mountain_overlays || []).forEach(function (it) {
      if (!it || it[0] !== 'rect') return;
      var x0 = it[2], y0 = it[3], x1 = it[4], y1 = it[5];
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
        if (y >= 0 && y < self.H && x >= 0 && x < self.W) flags[y * self.W + x] |= F.MOUNT;
    });
    (ow.roads || []).forEach(function (r) {
      if (r.rect) { for (var i2 = r.rect[0]; i2 <= r.rect[2]; i2++) for (var j2 = r.rect[1]; j2 <= r.rect[3]; j2++) if (i2 >= 0 && i2 < self.W && j2 >= 0 && j2 < self.H) flags[j2 * self.W + i2] |= F.ROAD; }
      else if (r.x !== undefined) { for (var j3 = r.y0; j3 <= r.y1; j3++) if (j3 >= 0 && j3 < self.H && r.x >= 0 && r.x < self.W) flags[j3 * self.W + r.x] |= F.ROAD; }
      else if (r.y !== undefined) { for (var i3 = r.x0; i3 <= r.x1; i3++) if (i3 >= 0 && i3 < self.W && r.y >= 0 && r.y < self.H) flags[r.y * self.W + i3] |= F.ROAD; }
    });
    (ow.solid_regions || []).forEach(function (s) {
      var r = s.rect;
      for (var j4 = r[1]; j4 <= r[3]; j4++) for (var i4 = r[0]; i4 <= r[2]; i4++)
        if (j4 >= 0 && j4 < self.H && i4 >= 0 && i4 < self.W) flags[j4 * self.W + i4] |= F.SOLID;
    });
    var WALL = 6;
    for (var y5 = 0; y5 < this.H; y5++) for (var x5 = 0; x5 < this.W; x5++) {
      if (x5 < WALL || x5 >= this.W - WALL || y5 < WALL || y5 >= this.H - WALL) flags[y5 * this.W + x5] |= F.WALL;
    }
    (ow.regions || []).forEach(function (rg) {
      var r = rg.rect, x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3];
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
        if (x >= 0 && x < self.W && y >= 0 && y < self.H) regionByTile[y][x] = rg;
    });

    var init = (ow.player && ow.player.initial) || { x: 58, y: 46 };
    this.playerPos = { x: (init.x + 0.5) * CELL, y: (init.y + 0.5) * CELL };
    this.playerSpeedPx = (ow.player && ow.player.speed) ? ow.player.speed * 1.6 : 256;
    this.interactReachPx = ((ow.player && ow.player.interact_tiles) || 3.0) * CELL;

    // 加载 4 张图集图（等待 onload）
    return this._loadAtlases().then(function () {
      self._prerender();
      return self._prepDrawImage();
    }).then(function () {
      if (UI && typeof UI.setLoadingProgress === 'function') UI.setLoadingProgress(45);
    });
  },

  /* —— 把预渲染地图转成 melonJS 可上传的 ImageBitmap ——
     裸 <canvas> 在 WebGL 的 texSubImage2D 上传会抛“Overload resolution failed”
     导致整张地图不渲染（仅剩火光）。ImageBitmap 是 WebGL/Canvas2D 通用的纹理源，
     且静态预渲染只上传一次、逐帧仅 drawImage 一次切片，性能开销不变。 */
  _prepDrawImage: function () {
    var self = this;
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(this.mapCanvas).then(function (bmp) {
        self.mapImage = bmp;
      }).catch(function () {
        // 兜底：退回到原 canvas（Canvas2D 渲染器仍可用）
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

  /* —— 整张静态地图预渲染到离屏 canvas（一次绘制，避免逐帧大量 drawImage） —— */
  _prerender: function () {
    var W = this.W, H = this.H, cell = CELL;
    var map = this.mapCanvas = document.createElement('canvas');
    var mapW = map.width = W * cell, mapH = map.height = H * cell;
    var ctx = map.getContext('2d');
    var self = this;

    function tileRect(index) {
      return { sx: (index % 12) * 16, sy: Math.floor(index / 12) * 16 };
    }
    function drawTile(theme, index, x, y) {
      var img = self.atlases[theme];
      if (!img) return;
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

    // 1) 非区域的中性暗色大地
    ctx.fillStyle = '#1d231b';
    ctx.fillRect(0, 0, mapW, mapH);

    // 2) 区域地面（atlas 地面块随机但稳定）
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

    // 3) 水面
    ctx.fillStyle = '#1E6A96';
    for (var wy = 0; wy < H; wy++) for (var wx = 0; wx < W; wx++)
      if (this.flags[wy * W + wx] & F.WATER) ctx.fillRect(wx * cell, wy * cell, cell, cell);

    // 4) 山路（北部山顶覆雪）
    for (var my = 0; my < H; my++) for (var mx = 0; mx < W; mx++) {
      if (!(this.flags[my * W + mx] & F.MOUNT)) continue;
      // 越靠北（y 越接近 0）越白 → 覆雪
      var snowT = Math.max(0, 1 - my / 30);
      ctx.fillStyle = 'rgb(' + Math.round(127 * (1 - snowT) + 232 * snowT) + ',' +
        Math.round(122 * (1 - snowT) + 240 * snowT) + ',' +
        Math.round(115 * (1 - snowT) + 246 * snowT) + ')';
      ctx.fillRect(mx * cell, my * cell, cell, cell);
    }

    // 5) 道路
    ctx.fillStyle = '#C9B37E';
    for (var ry = 0; ry < H; ry++) for (var rx = 0; rx < W; rx++)
      if (this.flags[ry * W + rx] & F.ROAD) ctx.fillRect(rx * cell, ry * cell, cell, cell);

    // 6) 装饰锚点 + 区域植被
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
    // 地图层（负责逐帧绘制 + 玩家/光照/覆盖层逻辑）
    var layer = new MapLayer(0, 0, this.W * CELL, this.H * CELL);
    layer.game = this;
    layer.alwaysUpdate = true;
    app.world.addChild(layer);

    // 相机边界锁在大陆内
    var cam = app.viewport;
    cam.setBounds(0, 0, this.W * CELL, this.H * CELL);

    // 动态光：玩家火把（跟随）+ 各道境辉光。
    // 修复「大面积橙色光晕、看不到场景」：
    // 1) me.Light2d 第 3/4 参是 radiusX/radiusY（半径，直径=参数×2），旧值 420/320
    //    实际渲染 840×640 直径；2) 旧版还在地图中心叠了一盏 900/600 半径的
    //    「太阳光」（直径 1800×1200），而出生点恰在地图中心附近，双光加色
    //    （Light2d glow 默认 additive）叠加把整屏冲成橙金；3) 全局照明本应
    //    由 ambientLight 承担（见 _frame 昼夜曲线），巨型加色 glow 只会淹没
    //    地表细节，故移除 _sunLight，并将火把/道境半径与强度回调到合理值。
    this._torchLight = new me.Light2d(this.playerPos.x, this.playerPos.y, 210, 160, '#ffb347', 0.6);
    app.world.addChild(this._torchLight);
    // 各道境辉光
    var self = this;
    this._realmLights = [];
    (this.ow.pois || []).forEach(function (p) {
      if (p.type !== 'realm') return;
      var cx = (p.x + 0.5) * CELL, cy = (p.y + 0.5) * CELL;
      var light = new me.Light2d(cx, cy, 130, 130, '#9b7bff', 0.4);
      app.world.addChild(light);
      self._realmLights.push(light);
    });

    this.layer = layer;
  },

  /* —— 每帧逻辑（由 MapLayer.update 调用） —— */
  _frame: function (dtSec) {
    this._timeGlobal = (this._timeGlobal || 0) + dtSec;
    var paused = !!(UI && UI.isModalOpen());

    // 移动
    var keys = this.keys || {}, sx = 0, sy = 0;
    if (!paused) {
      if (keys['a'] || keys['arrowleft']) sx -= 1;
      if (keys['d'] || keys['arrowright']) sx += 1;
      if (keys['w'] || keys['arrowup']) sy -= 1;
      if (keys['s'] || keys['arrowdown']) sy += 1;
    }
    if (sx !== 0 || sy !== 0) {
      var inv = Math.hypot(sx, sy);
      this.moving = true;
      if (sx !== 0) this.facing = sx > 0 ? 1 : -1;
      var spd = this.playerSpeedPx * dtSec;
      this._moveAxis((sx / inv) * spd, (sy / inv) * spd);
    } else this.moving = false;
    if (this.moving) this.walkPhase = (this.walkPhase || 0) + 0.6;

    // 火把跟随玩家
    if (this._torchLight) this._torchLight.pos.set(this.playerPos.x, this.playerPos.y);

    // 相机跟随玩家
    var cam = this.viewport;
    if (cam) {
      cam.moveTo(this.playerPos.x - cam.width / 2, this.playerPos.y - cam.height / 2);
      // 昼夜循环：ambientLight 的 alpha 决定暗面深浅（1=全暗）
      // 修复：旧曲线 0.30~0.72 的深蓝黑遮罩在夜间把光圈外地表压暗 72%，
      // 近乎全黑（玩家看到「只有光晕没有场景」的第二主因）。
      // 收窄到 0.10~0.38：白昼地表清晰，夜晚有氛围但仍可读图。
      var day = 0.5 + 0.5 * Math.sin(this._timeGlobal * 0.25);
      var stage = me.state.current();
      if (stage && stage.ambientLight) {
        var a = 0.10 + 0.28 * (1 - day);
        stage.ambientLight.alpha = a;
        // 夜晚偏蓝，白昼暖黄
        if (day > 0.5) stage.ambientLight.setColor(8, 12, 20, a);
        else stage.ambientLight.setColor(4, 8, 26, a);
      }
    }

    // DOM 覆盖层 + 交互
    if (this.layer) {
      this._updateOverlay();
      this._refreshMinimapPlayer();
      if (!paused) this._updateInteraction();
      if (!paused) this._updateRealmGuide();
      if (!paused && this.ePressed) { this._onInteract(); this.ePressed = false; }
    }
  },

  _moveAxis: function (mx, my) {
    var nx = this.playerPos.x + mx;
    if (!this._willCollide(nx, this.playerPos.y)) this.playerPos.x = nx;
    var ny = this.playerPos.y + my;
    if (!this._willCollide(this.playerPos.x, ny)) this.playerPos.y = ny;
  },
  _willCollide: function (gx, gy) {
    var r = CELL * 0.30;
    var cx = gx / CELL, cy = gy / CELL;
    return this._isBarrier(Math.floor(cx - r / CELL), Math.floor(cy - r / CELL)) ||
           this._isBarrier(Math.floor(cx + r / CELL), Math.floor(cy - r / CELL)) ||
           this._isBarrier(Math.floor(cx - r / CELL), Math.floor(cy + r / CELL)) ||
           this._isBarrier(Math.floor(cx + r / CELL), Math.floor(cy + r / CELL));
  },
  _isBarrier: function (tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return true;
    return !!(this.flags && (this.flags[ty * this.W + tx] & (F.WALL | F.WATER | F.MOUNT | F.SOLID)));
  },

  /* —— DOM 覆盖层（玩家/POI/告示牌） —— */
  _makeOverlay: function () {
    this.overlayEl = document.getElementById('iso-viewport');
    this._buildPlayer();
    this._buildPoisOverlay();
  },
  _buildPlayer: function () {
    var pd = document.createElement('div');
    pd.className = 'player-marker';
    pd.innerHTML = '<span class="player-shade"></span><span class="player-avatar">☯</span>';
    this.overlayEl.appendChild(pd);
    this.playerEl = pd;
    this.facing = 1; this.moving = false; this.walkPhase = 0;
  },
  _buildPoisOverlay: function () {
    var self = this;
    this.pois = [];
    (this.ow.pois || []).forEach(function (p) {
      if (p.type === 'spawn') return;
      var marker = { poi: p, emoji: null, billboard: null, badge: null, badgeEl: null };
      if (p.type === 'billboard') {
        marker.billboard = self._buildBillboard(p);
      } else {
        var em = document.createElement('div');
        var isSandbox = p.type === 'sandbox';
        em.className = 'poi-emoji' + (p.type === 'realm' ? ' realm' : ' npc') + (isSandbox ? ' sandbox' : '');
        em.style.fontSize = (CELL * 1.15) + 'px';
        em.style.width = (CELL * 1.8) + 'px'; em.style.height = (CELL * 1.8) + 'px';
        em.style.display = 'flex'; em.style.alignItems = 'center'; em.style.justifyContent = 'center';
        em.textContent = p.emoji;
        em.setAttribute('data-poi', p.id || '');
        self.overlayEl.appendChild(em);
        marker.emoji = em;
        if (p.type === 'realm') {
          var badge = document.createElement('div');
          badge.className = 'realm-badge'; badge.style.width = (CELL * 1.8) + 'px';
          badge.style.display = 'flex'; badge.style.justifyContent = 'center'; badge.style.alignItems = 'center';
          var bt = document.createElement('span'); bt.textContent = '—'; badge.appendChild(bt);
          self.overlayEl.appendChild(badge);
          marker.badge = bt; marker.badgeEl = badge;
          (self.badgePool = self.badgePool || []).push({ realm: p.realm, el: badge, text: bt, done: false, sandbox: false });
        }
      }
      self.pois.push(marker);
    });
    this._syncBadges((this.samsara || {}).realm_progress || {});
  },
  _buildBillboard: function (p) {
    var bb = document.createElement('div');
    bb.className = 'ow-billboard glow' + (p.active ? ' active' : '');
    bb.setAttribute('data-poi', p.id || '');
    bb.innerHTML =
      '<div class="bb-post"><div class="bb-title">轮回修行</div><div class="bb-sub">SAMSARA</div><div class="bb-line"></div>' +
      '<div class="bb-rows"><div class="bb-row"><span>悟道</span><b data-k="enlight">—</b></div>' +
      '<div class="bb-row"><span>堕落</span><b data-k="corrupt">—</b></div>' +
      '<div class="bb-row"><span>祈求</span><b data-k="prayer">—</b></div>' +
      '<div class="bb-row"><span>记忆碎片</span><b data-k="frags">—</b></div></div>' +
      '<div class="bb-line"></div><div class="bb-legend">靠近按 [E] 查看详情</div></div>' +
      '<div class="bb-pole"></div><div class="bb-base"></div>';
    this.overlayEl.appendChild(bb);
    (this.billboards = this.billboards || []).push({ id: p.id || 'billboard', el: bb });
    this._refreshBillboard();
    return bb;
  },
  _refreshBillboard: function () {
    if (!this.billboards) return;
    var s = this.samsara || {}, ra = s.alignment || {}, frags = s.memory_fragments || {};
    this.billboards.forEach(function (b) {
      var q = b.el.querySelector;
      b.enlight = b.enlight || b.el.querySelector('[data-k="enlight"]');
      b.corrupt = b.corrupt || b.el.querySelector('[data-k="corrupt"]');
      b.prayer = b.prayer || b.el.querySelector('[data-k="prayer"]');
      b.frags = b.frags || b.el.querySelector('[data-k="frags"]');
      if (b.enlight) b.enlight.textContent = ra.enlightenment || 0;
      if (b.corrupt) b.corrupt.textContent = ra.corruption || 0;
      if (b.prayer) b.prayer.textContent = s.prayer_count || 0;
      if (b.frags) b.frags.textContent = ((frags.unlocked_count || 0) + ' / ' + (frags.total || 6));
    });
  },
  _syncBadges: function (realmProgress) {
    var self = this;
    (this.badgePool || []).forEach(function (b) {
      var rp = (realmProgress && realmProgress[b.realm]) || {};
      var total = self._levelTotals && self._levelTotals[b.realm] !== undefined ? self._levelTotals[b.realm] : 5;
      var passed = rp.levels_passed || 0;
      b.done = !!rp.completed;
      b.text.textContent = b.done ? ('✓ 已通关') : (passed + ' / ' + total);
      b.text.style.color = b.done ? '#0a9396' : '#f4c542';
      b.el.classList.toggle('realm-done', !!b.done);
      /* 叠加棋类定位标签（主推 / 不推荐的测试） */
      var t = (window.OverworldUI && window.OverworldUI.realmTag) ? window.OverworldUI.realmTag(b.realm) : null;
      if (!b.tagEl) { b.tagEl = document.createElement('span'); b.tagEl.className = 'rec-tag'; b.el.appendChild(b.tagEl); }
      if (t) { b.tagEl.textContent = t.text; b.tagEl.className = 'rec-tag ' + t.cls; b.tagEl.style.display = ''; }
      else { b.tagEl.textContent = ''; b.tagEl.style.display = 'none'; }
    }, this);
  },
  _updateOverlay: function () {
    if (!this.overlayEl || !this.viewport) return;
    var self = this;
    var pp = this.project(this.playerPos.x, this.playerPos.y);
    var pe = this.playerEl, av = pe.querySelector('.player-avatar');
    av.style.left = (pp.x - 23).toFixed(1) + 'px';
    av.style.top = (pp.y - 44).toFixed(1) + 'px';
    av.style.transform = (this.facing < 0 ? 'scaleX(-1) ' : '') +
      (this.moving ? 'translateY(' + (Math.abs(Math.sin(this.walkPhase)) * -6).toFixed(1) + 'px)' : '');
    var cam = this.viewport;
    var dprX = this._domScale ? this._domScale.x : 1;
    this.pois.forEach(function (m) {
      var wpos = self.project((m.poi.x + 0.5) * CELL, (m.poi.y + 0.5) * CELL);
      var px = wpos.x, py = wpos.y;
      var vw = self.viewport.width * dprX;
      var off = 120;
      if (!wpos.on || px < -off || px > vw + off || py < -off || py > self.viewport.height * (self._domScale ? self._domScale.y : 1) + off) {
        if (m.emoji) m.emoji.style.display = 'none';
        if (m.billboard) m.billboard.style.display = 'none';
        if (m.badgeEl) m.badgeEl.style.display = 'none';
        return;
      }
      if (m.emoji) {
        m.emoji.style.display = '';
        m.emoji.style.left = (px - CELL * 0.9).toFixed(1) + 'px';
        m.emoji.style.top = (py - CELL * 1.35).toFixed(1) + 'px';
      }
      if (m.badgeEl) {
        m.badgeEl.style.display = '';
        m.badgeEl.style.left = (px - CELL * 0.9).toFixed(1) + 'px';
        m.badgeEl.style.top = (py - CELL * 2.05).toFixed(1) + 'px';
      }
      if (m.billboard) {
        m.billboard.style.display = '';
        m.billboard.style.left = (px - CELL * 2.05).toFixed(1) + 'px';
        m.billboard.style.top = (py - CELL * 3.2).toFixed(1) + 'px';
      }
    });
  },

  /* —— 小地图 —— */
  _minimapColor: function (x, y) {
    var fl = this.flags[y * this.W + x];
    if (fl & 1) return [0x1E, 0x6A, 0x96];
    if (fl & 2) return [0xC9, 0xB3, 0x7E];
    // 区域主题色调按领域
    var rg = this.regionByTile && this.regionByTile[y] && this.regionByTile[y][x];
    var map = {
      nw_forest: [0x2e, 0x6e, 0x3b], n_snow: [0xdc, 0xe6, 0xef], ne_pasture: [0x8f, 0xbf, 0x54],
      w_waste: [0xb8, 0xa0, 0x6a], c_plain: [0x6c, 0xa6, 0x59], east_ridge: [0x7d, 0x93, 0x84],
      sw_dungeon: [0x24, 0x1c, 0x30], s_desert: [0xd8, 0xb2, 0x5a], se_battle: [0xa4, 0x44, 0x3f]
    };
    return (rg && map[rg.id]) || [0x5f, 0x9e, 0x4e];
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
    try { var raw = localStorage.getItem(EXPLORED_KEY); var arr = raw ? JSON.parse(raw) : []; return arr.indexOf(poiId) >= 0; } catch (e) { return false; }
  },
  _markExplored: function (poiId) {
    if (!poiId) return;
    try { var raw = localStorage.getItem(EXPLORED_KEY); var arr = raw ? JSON.parse(raw) : []; if (arr.indexOf(poiId) < 0) { arr.push(poiId); localStorage.setItem(EXPLORED_KEY, JSON.stringify(arr)); } } catch (e) { }
    var rec = this.minimapPois && this.minimapPois[poiId];
    if (rec) { rec.div.classList.add('explored'); rec.div.classList.remove('unexplored'); rec.div.textContent = rec.base; }
  },

  _fetchGamesAndState: function () {
    var self = this;
    self.games = [];
    fetch('/api/games').then(function (r) { return r.json(); }).then(function (g) { self.games = g || []; if (UI) UI.setGames(self.games); }).catch(function () { });
    self.refreshSamsara();
  },

  /* —— 交互 / 引导（复用 wgpu 胶水同款算法） —— */
  _updateInteraction: function () {
    var self = this, reach = this.interactReachPx + 4, closest = null, minD = reach + 1;
    this.pois.forEach(function (m) {
      var d = Math.hypot((m.poi.x + 0.5) * CELL - self.playerPos.x, (m.poi.y + 0.5) * CELL - self.playerPos.y);
      if (d <= reach && d < minD) { minD = d; closest = m; }
    });
    var activeId = closest ? closest.poi.id : null;
    this.pois.forEach(function (m) {
      if (m.emoji) m.emoji.classList.toggle('active', m.poi.id === activeId);
      else if (m.billboard) m.billboard.classList.toggle('active', m.poi.id === activeId);
    });
    this.closestPoi = closest; this.activePoi = activeId;
    if (closest && UI) {
      var lbl;
      if (closest.poi.type === 'realm') lbl = '前往 ' + (REALM_NAMES[closest.poi.realm] || closest.poi.realm);
      else if (closest.poi.type === 'sandbox') lbl = '进入 ' + (closest.poi.label || '沙盒训练场');
      else if (closest.poi.type === 'billboard') lbl = '查看 ' + (closest.poi.label || '轮回修行告示牌');
      else if (closest.poi.type === 'achievements') lbl = '查看 ' + (closest.poi.label || '成就殿堂');
      else lbl = closest.poi.label || '互动';
      UI.setInteractHint(lbl);
    } else if (UI) UI.setInteractHint(null);
  },
  _updateRealmGuide: function () {
    if (!UI || !UI.setRealmGuide || !this.pois) return;
    var self = this, best = null, bestD = Infinity;
    this.pois.forEach(function (m) {
      if (m.poi.type !== 'realm') return;
      var d = Math.max(Math.abs((m.poi.x + 0.5) - self.playerPos.x / CELL), Math.abs((m.poi.y + 0.5) - self.playerPos.y / CELL));
      if (d < bestD) { bestD = d; best = m; }
    });
    if (this.closestPoi && this.closestPoi.poi.type === 'realm') { UI.setRealmGuide(null); return; }
    if (!best) { UI.setRealmGuide(null); return; }
    var pp = this.project(this.playerPos.x, this.playerPos.y);
    var ep = this.project((best.poi.x + 0.5) * CELL, (best.poi.y + 0.5) * CELL);
    var deg = Math.round(Math.atan2(ep.y - pp.y, ep.x - pp.x) * 180 / Math.PI);
    UI.setRealmGuide({ name: REALM_NAMES[best.poi.realm] || best.poi.realm, dist: Math.round(bestD), arrow: '➤', angle: deg });
  },
  _onInteract: function () {
    var entry = this.closestPoi;
    if (!entry || !UI) return;
    if (entry.poi.type === 'realm') {
      this._markExplored(entry.poi.id);
      // 剧情模式下经 realm 选择弹窗进入，最终跳 /play?realm=（与 wgpu 一致经 UI 弹窗）
      UI.openRealmSelect(entry.poi.realm);
    }
    else if (entry.poi.type === 'sandbox') { this._markExplored(entry.poi.id); location.href = '/sandbox?r=' + Date.now(); }
    else if (entry.poi.type === 'npc') { this._markExplored(entry.poi.id); UI.openSkillTree(); }
    else if (entry.poi.type === 'billboard') { this._markExplored(entry.poi.id); UI.openRpgStats(); }
    else if (entry.poi.type === 'achievements') { this._markExplored(entry.poi.id); UI.openAchievements(); }
    else if (entry.poi.type === 'spawn') { if (UI.toast) UI.toast('生灭台：这里是旅途的起点。'); }
  },

  bindInput: function () {
    var self = this;
    this.keys = {};
    window.addEventListener('keydown', function (e) {
      var k = e.key, lk = k.toLowerCase();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(k) >= 0) e.preventDefault();
      if (lk === 'e') self.ePressed = true;
      self.keys[lk] = true;
    });
    window.addEventListener('keyup', function (e) { self.keys[e.key.toLowerCase()] = false; });
  },

  _buildScene: function () {
    this._makeOverlay();
    this.initMinimap();
    this._fetchGamesAndState();
    this.startPolling();
  }
};

/* ═══════════════ melonJS 渲染体：地图层 ═══════════════ */
class MapLayer extends me.Renderable {
  constructor(x, y, w, h) {
    super(x, y, w, h);
    /* 修复「地图不渲染、仅剩光晕」的第二个根因：
       me.Renderable 默认 anchorPoint=(0.5,0.5)，preDraw 会按本层尺寸
       translate(-(W*CELL/2), -(H*CELL/2))，叠加相机 translate 后本层的
       世界坐标绘制整体被拉出画布外（探针实测 translate(-2944,-2382)）。
       本层 draw() 按世界坐标切片绘制，必须把锚点重置为左上 (0,0)。 */
    this.anchorPoint.set(0, 0);
    this.alpha = 1;
  }
  update(dt) {
    if (this.game) this.game._frame((dt || 16) / 1000);
    return true; // 持续重绘以播放动态光
  }
  draw(renderer) {
    var g = this.game;
    var img = (g && (g.mapImage || g.mapCanvas));
    if (!g || !img || !g.viewport) return;
    var cam = g.viewport;
    var mapW = img.width, mapH = img.height;
    var vw = cam.width, vh = cam.height;
    var tx = cam.pos.x + cam.offset.x, ty = cam.pos.y + cam.offset.y;

    // 地图外区域铺暗色底
    renderer.save();
    renderer.setColor('#030509');
    renderer.fillRect(tx, ty, vw, vh);

    // 取可视区切片（加少许 margin，双线性缩放无可辨差）
    var m = 2;
    var sx = Math.max(0, Math.floor(tx) - m);
    var sy = Math.max(0, Math.floor(ty) - m);
    var ex = Math.min(mapW, Math.ceil(tx + vw) + m);
    var ey = Math.min(mapH, Math.ceil(ty + vh) + m);
    if (ex > sx && ey > sy) {
      var sw = ex - sx, sh = ey - sy;
      renderer.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
    }
    renderer.restore();
  }
}

/* ═══════════════ melonJS 舞台 ═══════════════ */
class OverworldStage extends me.Stage {
  onResetEvent(app) {
    var game = window.OverworldGame;
    game._attach(app);
    game._buildStage(app);
  }
  onDestroyEvent() {}
}

/* ═══════════════ 引导 ═══════════════ */
function melonBoot() {
  if (window.__owMelonBooted) return; // 幂等：防重复引导
  window.__owMelonBooted = true;
  console.log('[melonjs] 六道大陆 melonJS 渲染器启动 v' + (me && me.version ? me.version : '?'));
  var game = window.OverworldGame = OverworldGame;
  try {
    if (window.OverworldUI) { window.OverworldUI.init(game); UI = window.OverworldUI; }
  } catch (e) {
    console.error('[melonjs] OverworldUI.init 失败，继续但禁用 UI 交互：', e);
  }
  if (UI && typeof UI.showLoading === 'function') UI.showLoading();

  fetch('/api/overworld/config', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (ow) {
      if (!ow || !ow.world) {
        if (UI && typeof UI.showError === 'function') UI.showError('大陆配置加载失败，请重试');
        return;
      }
      if (UI && typeof UI.setLoadingProgress === 'function') UI.setLoadingProgress(28);
      return game.bootstrapGeometry(ow).then(function () {
        return initApplication();
      }).then(function () {
        if (UI && typeof UI.refreshHUD === 'function') UI.refreshHUD();
      });
    })
    .catch(function (e) {
      console.error('[melonjs] 大陆配置加载失败：', e);
      if (UI && typeof UI.showError === 'function') {
        UI.showError('大地图初始化失败：' + (e && e.message ? e.message : e));
      }
    });
}

function initApplication() {
  var game = window.OverworldGame;
  var vp = document.getElementById('iso-viewport');
  if (!vp) throw new Error('no iso-viewport');
  // 清掉旧的 iso-stage 占位，交给 melonJS 画布
  while (vp.firstChild) vp.removeChild(vp.firstChild);

  game.bindInput();

  var app = new me.Application(vp.clientWidth || 800, vp.clientHeight || 500, {
    parent: vp,
    renderer: me.video.AUTO,   // AUTO：WebGL→Canvas 自动回退，杜绝黑屏
    scaleMethod: 'flex'
  });
  game.app = app;
  var canvas = app.renderer ? app.renderer.getCanvas() : null;
  return app.init().then(function () {
    var c = app.renderer.getCanvas();
    c.style.position = 'absolute'; c.style.inset = '0';
    c.style.pointerEvents = 'none'; // 画布不拦截鼠标，HUD 可点
    game._canvas = c;

    // 注册自定义舞台并切换到它
    me.state.set(me.state.PLAY, new OverworldStage());
    me.state.change(me.state.PLAY, true);

    game._buildScene();
    return game;
  }).then(function () {
    setTimeout(function () {
      if (UI && typeof UI.setLoadingProgress === 'function') UI.setLoadingProgress(100);
      if (UI && typeof UI.removeLoading === 'function') UI.removeLoading();
    }, 250);
  });
}

// 导出供 overworld-load.js 使用 / 直接 self 兜底
export { OverworldGame, melonBoot };

// 模块加载即时引导（meloonBoot 自带幂等，DOMContentLoaded 前后皆可安全触发）
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', melonBoot);
else melonBoot();