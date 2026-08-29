/* ═══════════════════════════════════════════════════════════════
   六道大陆 · 2.5D 剧情模式大地图（Phaser 3）
   职责：RenderTexture 离线烘焙大陆底图 / 四向玩家移动与碰撞 /
         POI 与六道入口徽章 / E 键互动 / 按 8s 轮询刷新状态。
   支持：海域边界 / 河流 / 山脉屏障 / 非规则大陆形状 / 半岛海湾。
   依赖：window.OverworldUI（overworld-ui.js）
   ═══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var UI = null;
    var reduceQuery = null;
    var reduced = false;

    var REALM_NAMES = {
        hell: '地狱道', hungry: '饿鬼道', animal: '畜生道',
        human: '人道', asura: '阿修罗道', heaven: '天道'
    };

    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    var OverworldScene = new Phaser.Class({
        Extends: Phaser.Scene,

        initialize: function OverworldScene() {
            Phaser.Scene.call(this, { key: 'overworld' });
        },

        preload: function () {
            this.load.json('overworld', '/api/overworld/config');
        },

        setUI: function (u) { UI = u; return this; },
        getSamsara: function () { return this.samsara; },
        getGames: function () { return this.games; },

        create: function () {
            var self = this;

            if (window.OverworldUI) {
                this.setUI(window.OverworldUI);
                window.OverworldUI.init(this);
            }

            var ow = this.cache.json.get('overworld');
            if (!ow) { if (UI) UI.showError('大陆配置加载失败，请重试'); return; }
            this.ow = ow;
            this.bootstrapGeometry(ow);

            for (var k in ow.tilesets) {
                if (Object.prototype.hasOwnProperty.call(ow.tilesets, k)) {
                    var t = ow.tilesets[k];
                    this.load.spritesheet(k, t.file, { frameWidth: this.TILE, frameHeight: this.TILE });
                }
            }
            this.load.start();

            this._fetchGamesAndState();

            this.load.once('complete', function () {
                self.buildMap();
                self.buildActors();
                self.syncSamsara(self.samsara || {});
                if (UI) UI.refreshHUD();
                UI && UI.removeLoading();
                self.startPolling();
            });
            this.load.once('loaderror', function () {
                if (UI) UI.showError('大陆贴图资源加载失败，请重试');
            });
        },

        /* ── 填充一个布尔网格 (rect 列表形式) ── */
        _fillRectGrid: function (grid, list) {
            if (!Array.isArray(list)) return;
            var H = this.H, W = this.W;
            for (var i = 0; i < list.length; i++) {
                var it = list[i];
                if (!Array.isArray(it) || it[0] !== 'rect') continue;
                var x0 = it[2], y0 = it[3], x1 = it[4], y1 = it[5];
                // 允许 x0>x1 或 y0>y1 的顺序容错
                if (x0 > x1) { var t = x0; x0 = x1; x1 = t; }
                if (y0 > y1) { var s = y0; y0 = y1; y1 = s; }
                for (var y = y0; y <= y1; y++) {
                    for (var x = x0; x <= x1; x++) {
                        if (y >= 0 && y < H && x >= 0 && x < W) grid[y][x] = true;
                    }
                }
            }
        },

        bootstrapGeometry: function (ow) {
            this.W = ow.world.width;
            this.H = ow.world.height;
            this.TILE = ow.world.tile;
            this.SCALE = ow.world.scale;
            this.P = this.TILE * this.SCALE;
            this.WORLD_W = this.W * this.P;
            this.WORLD_H = this.H * this.P;
            this.BAKE_W = this.W * this.TILE;
            this.BAKE_H = this.H * this.TILE;

            this.seed = ow.world.seed || 20260828;
            this.rand = mulberry32(this.seed);

            /* 区域归属 */
            this.regionByTile = [];
            for (var i = 0; i < this.H; i++) this.regionByTile.push(new Array(this.W));
            ow.regions.forEach((function (rg) {
                var r = rg.rect, y, x;
                for (y = r[1]; y <= r[3]; y++) {
                    for (x = r[0]; x <= r[2]; x++) {
                        if (y >= 0 && y < this.H && x >= 0 && x < this.W) this.regionByTile[y][x] = rg;
                    }
                }
            }).bind(this));

            /* ── 海洋 / 湖泊 / 河流 = 水域网格（统一） ── */
            this.waterGrid = [];
            for (var wy = 0; wy < this.H; wy++) {
                var row = new Array(this.W);
                for (var wx = 0; wx < this.W; wx++) row[wx] = false;
                this.waterGrid.push(row);
            }
            this._fillRectGrid(this.waterGrid, ow.water_overlays);
            this._fillRectGrid(this.waterGrid, ow.river_snow);
            this._fillRectGrid(this.waterGrid, ow.river_ridge);

            /* ── 山脉网格 = 不可通行岩石地形 ── */
            this.mountainGrid = [];
            for (var my = 0; my < this.H; my++) {
                var mrow = new Array(this.W);
                for (var mx = 0; mx < this.W; mx++) mrow[mx] = false;
                this.mountainGrid.push(mrow);
            }
            this._fillRectGrid(this.mountainGrid, ow.mountain_overlays);

            /* 碰撞：水域 + 山脉 + 配置 solid_regions + 装饰锚点(稍后) */
            this.buildSolidGrid(ow);
        },

        buildSolidGrid: function (ow) {
            var i, j;
            this.solid = [];
            for (i = 0; i < this.H; i++) {
                var row = new Array(this.W);
                for (j = 0; j < this.W; j++) {
                    /* 水域与山脉 = 天然不可通行 */
                    row[j] = !!(this.waterGrid[i][j] || this.mountainGrid[i][j]);
                }
                this.solid.push(row);
            }
            if (ow.solid_regions) {
                ow.solid_regions.forEach((function (s) {
                    var r = s.rect;
                    for (i = r[1]; i <= r[3]; i++) {
                        for (j = r[0]; j <= r[2]; j++) {
                            if (i >= 0 && i < this.H && j >= 0 && j < this.W) this.solid[i][j] = true;
                        }
                    }
                }).bind(this));
            }
        },

        _setSolidTile: function (x, y, v) {
            if (y < 0 || y >= this.H || x < 0 || x >= this.W) return;
            this.solid[y][x] = v;
        },

        isSolid: function (tx, ty) {
            if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return true;
            return this.solid[ty][tx];
        },

        _fetchGamesAndState: function () {
            var self = this;
            this.games = [];
            this.samsara = {};
            fetch('/api/games')
                .then(function (r) { return r.json(); })
                .then(function (g) { self.games = g || []; if (UI) UI.setGames(self.games); })
                .catch(function () { });
            fetch('/samsara/api/state')
                .then(function (r) { return r.json(); })
                .then(function (s) { self.samsara = s || {}; self.syncSamsara(self.samsara); if (UI) UI.refreshHUD(); })
                .catch(function () { });
        },

        _isRoad: function (x, y) {
            var roads = this.ow.roads;
            for (var i = 0; i < roads.length; i++) {
                var r = roads[i];
                if (r.x !== undefined && r.x === x && y >= r.y0 && y <= r.y1) return true;
                if (r.y !== undefined && r.y === y && x >= r.x0 && x <= r.x1) return true;
            }
            return false;
        },
        _isWater: function (x, y) {
            if (y < 0 || y >= this.H || x < 0 || x >= this.W) return false;
            return this.waterGrid[y][x];
        },
        _isMountain: function (x, y) {
            if (y < 0 || y >= this.H || x < 0 || x >= this.W) return false;
            return this.mountainGrid[y][x];
        },

        /* 确定性二维值噪声(整数哈希 + 平滑双线性)：无种子、跨刷新稳定，
           低频采样 → 同主题瓦片自然成片，替代逐瓦片独立的椒盐噪声。 */
        _noise: function (x, y) {
            var hash = function (ix, iy) {
                var n = ix * 374761393 + iy * 668265263 + 1103515245;
                n = (n ^ (n >>> 13)) * 1274126177;
                n = (n ^ (n >>> 16));
                return ((n >>> 0) % 100000) / 100000;
            };
            var xi = Math.floor(x), yi = Math.floor(y);
            var fx = x - xi, fy = y - yi;
            var sx = fx * fx * (3 - 2 * fx);
            var sy = fy * fy * (3 - 2 * fy);
            var a = hash(xi, yi), b = hash(xi + 1, yi);
            var c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
            return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
        },

        /* 用一个低频值噪声把池子切成连续区块，选出一块合理的地面变体 */
        _pickFromPool: function (pool, x, y, freq) {
            var n = this._noise(x / (freq || 6), y / (freq || 6));
            return pool[Math.floor(n * pool.length) % pool.length];
        },

        /* 瓦片优先级：水域 > 山脉 > 道路 > 区域地面。
           每一层都用确定性噪声/伪随机，保证跨刷新稳定；并用低频噪声让
           相邻瓦片成片，避免逐格乱撒的“盐椒”噪点。 */
        _pickTile: function (x, y) {
            var rg = this.regionByTile[y] ? this.regionByTile[y][x] : null;
            var theme = rg ? rg.theme : 'town';

            if (this._isWater(x, y)) {
                /* 水域：低频噪声成片分布 battle 72 深水 / 73 浪纹 */
                return { pack: 'battle', index: this._noise(x / 6, y / 6) < 0.85 ? 72 : 73 };
            }

            if (this._isMountain(x, y)) {
                /* 山脉为岩石地貌（battle 5/6/7 山岩 + dungeon 50/51/52/65 石地），
                   低频噪声成片混合，绝不混入草地瓦片。 */
                var rocks = [['battle', 5], ['battle', 6], ['battle', 7],
                             ['dungeon', 50], ['dungeon', 51], ['dungeon', 52], ['dungeon', 65]];
                var rp = this._noise(x / 5, y / 5);
                var rock = rocks[Math.floor(rp * rocks.length) % rocks.length];
                return { pack: rock[0], index: rock[1] };
            }

            if (this._isRoad(x, y)) {
                /* 道路按区域主题选材质：石板 / 土路 / 地牢砖 / 战道泥 */
                var roadIdx = theme === 'town' ? 48 : theme === 'farm' ? 48
                             : theme === 'dungeon' ? 50 : 77;
                return { pack: theme, index: roadIdx };
            }

            /* —— 区域地面 + 相邻区域柔和过渡 —— */
            var pool = (rg && rg.ground) || [0];
            var curId = rg && rg.id;

            /* 过渡带：墨西哥帽式向邻区地面的概率性渐变，让区域边界更自然 */
            var BORDER = 3, blend = null, blendD = BORDER + 1;
            for (var dy = -BORDER; dy <= BORDER; dy++) {
                for (var dx = -BORDER; dx <= BORDER; dx++) {
                    var nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
                    var other = this.regionByTile[ny][nx];
                    if (!other || other.id === curId) continue;
                    var d = Math.max(Math.abs(dx), Math.abs(dy));
                    if (d < blendD) { blendD = d; blend = other; }
                }
            }
            if (blend) {
                var bn = this._noise(x / 4, y / 4);
                var bp = (blend.ground) || [0];
                var t;
                if (blendD === 1) t = 0.45;      /* 紧贴区域边界：较多过渡 */
                else if (blendD === 2) t = 0.22; /* 向内 1 格：中等过渡 */
                else if (blendD === 3) t = 0.08; /* 向内 2 格：轻微过渡 */
                else t = 0;
                if (t > 0 && bn < t) {
                    return { pack: blend.theme, index: this._pickFromPool(bp, x, y, 4) };
                }
            }

            return { pack: theme, index: this._pickFromPool(pool, x, y, 6) };
        },

        _getFrame: function (pack, index) {
            if (!this.textures.exists(pack)) return null;
            return this.textures.get(pack).get(index);
        },

        /* ── 离线烘焙整块大陆底图（仅一次） ── */
        buildMap: function () {
            var rt = this.add.renderTexture(0, 0, this.BAKE_W, this.BAKE_H);
            rt.setOrigin(0, 0);

            for (var y = 0; y < this.H; y++) {
                for (var x = 0; x < this.W; x++) {
                    var tile = this._pickTile(x, y);
                    var frame = this._getFrame(tile.pack, tile.index);
                    if (!frame) continue;
                    rt.draw(frame, x * this.TILE, y * this.TILE);
                }
            }

            rt.saveTexture('ow_ground');
            rt.destroy();
            this.textures.get('ow_ground').setFilter(1);
            this.groundImg = this.add.image(0, 0, 'ow_ground')
                .setOrigin(0, 0).setScale(this.SCALE).setDepth(0);

            /* ── 山脉附加装饰：山峰岩石层（在底图上再绘制） ── */
            this._drawMountainDecor();
            /* ── 水域附加装饰：浅滩与岸石 ── */
            this._drawShoreDecor();

            return this.groundImg;
        },

        /* 山脉区域上叠加突出岩石(视觉强调，不改碰撞) */
        _drawMountainDecor: function () {
            var decorRt = this.add.renderTexture(0, 0, this.BAKE_W, this.BAKE_H);
            decorRt.setOrigin(0, 0);
            var count = 0;
            for (var y = 0; y < this.H; y++) {
                for (var x = 0; x < this.W; x++) {
                    if (!this._isMountain(x, y)) continue;
                    /* 山峰顶的岩石：概率撒 battle 6/7 与 dungeon 66，确定性伪随机 */
                    var r = this.rand();
                    var pick = null;
                    if (r < 0.18) {
                        /* 山巅大岩 */
                        pick = r < 0.08 ? ['battle', 7] : ['battle', 6];
                    } else if (r < 0.28) {
                        pick = ['dungeon', 66];
                    } else if (r < 0.34) {
                        pick = ['dungeon', 67];
                    }
                    if (pick) {
                        var f = this._getFrame(pick[0], pick[1]);
                        if (f) { decorRt.draw(f, x * this.TILE, y * this.TILE); count++; }
                    }
                }
            }
            /* 山麓过渡：紧贴山脉的地面撒零星坠岩(岩屑)，软化硬边缘，不改碰撞 */
            var DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
            for (var y2 = 0; y2 < this.H; y2++) {
                for (var x2 = 0; x2 < this.W; x2++) {
                    if (this._isMountain(x2, y2)) continue;
                    var nearMount = false;
                    for (var d = 0; d < 4; d++) {
                        if (this._isMountain(x2 + DIRS[d][0], y2 + DIRS[d][1])) { nearMount = true; break; }
                    }
                    if (!nearMount) continue;
                    /* 山脚零星碎石：battle 5(坠岩) 少量 */
                    var fr = this.rand();
                    if (fr < 0.05) {
                        var ff = this._getFrame('battle', 5);
                        if (ff) { decorRt.draw(ff, x2 * this.TILE, y2 * this.TILE); count++; }
                    } else if (fr < 0.07) {
                        var fg = this._getFrame('town', 10);
                        if (fg) { decorRt.draw(fg, x2 * this.TILE, y2 * this.TILE); count++; }
                    }
                }
            }
            if (count > 0) {
                decorRt.saveTexture('ow_mt_decor');
                decorRt.destroy();
                this.textures.get('ow_mt_decor').setFilter(1);
                this.add.image(0, 0, 'ow_mt_decor')
                    .setOrigin(0, 0).setScale(this.SCALE).setDepth(1);
            } else {
                decorRt.destroy();
            }
        },

        /* 水域岸线：浅滩沙粒与岸边小石 */
        _drawShoreDecor: function () {
            var rt = this.add.renderTexture(0, 0, this.BAKE_W, this.BAKE_H);
            rt.setOrigin(0, 0);
            var count = 0;
            var DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
            for (var y = 0; y < this.H; y++) {
                for (var x = 0; x < this.W; x++) {
                    if (this._isWater(x, y)) continue;
                    if (this._isMountain(x, y)) continue;
                    /* 寻找邻接水瓦片的陆瓦片 = 岸线 */
                    var shore = false;
                    for (var d = 0; d < 4; d++) {
                        if (this._isWater(x + DIRS[d][0], y + DIRS[d][1])) { shore = true; break; }
                    }
                    if (!shore) continue;
                    var r = this.rand();
                    var pick = null;
                    var region = this.regionByTile[y][x];
                    var theme = region ? region.theme : 'town';
                    if (r < 0.18) {
                        /* 岸边卵石 */
                        if (theme === 'farm' || theme === 'town') pick = ['town', 10];
                        else pick = ['battle', 6];
                    } else if (r < 0.26) {
                        pick = ['town', 9];
                    } else if (r < 0.32 && theme === 'farm') {
                        pick = ['farm', 4];
                    }
                    if (pick) {
                        var f = this._getFrame(pick[0], pick[1]);
                        if (f) { rt.draw(f, x * this.TILE, y * this.TILE); count++; }
                    }
                }
            }
            if (count > 0) {
                rt.saveTexture('ow_shore');
                rt.destroy();
                this.textures.get('ow_shore').setFilter(1);
                this.add.image(0, 0, 'ow_shore')
                    .setOrigin(0, 0).setScale(this.SCALE).setDepth(1);
            } else {
                rt.destroy();
            }
        },

        /* ── 装饰 + 玩家 + POI ── */
        buildActors: function () {
            var self = this;
            var ow = this.ow;

            if (typeof this._anchorSet !== 'object') {
                this._anchorSet = {};
                (ow.decor_anchors || []).forEach(function (d) { self._anchorSet[d.x + ',' + d.y] = true; });
            }

            var poiGuard = [];
            (ow.pois || []).forEach(function (p) { poiGuard.push([p.x, p.y]); });
            var inPoiGuard = function (tx, ty) {
                for (var i = 0; i < poiGuard.length; i++) {
                    if (Math.abs(poiGuard[i][0] - tx) <= 2 && Math.abs(poiGuard[i][1] - ty) <= 2) return true;
                }
                return false;
            };

            /* 装饰锚点 */
            (ow.decor_anchors || []).forEach(function (d) {
                if (!self._getFrame(d.tile[0], d.tile[1])) return;
                /* 跳过落在水域或山脉上的锚点（防止装饰物漂浮） */
                if (self._isWater(d.x, d.y) || self._isMountain(d.x, d.y)) return;
                self.add.image(
                    d.x * self.TILE + (self.TILE / 2),
                    d.y * self.TILE + (self.TILE / 2),
                    d.tile[0], d.tile[1]
                ).setScale(self.SCALE).setDepth(2);
                if (d.solid) self._setSolidTile(d.x, d.y, true);
            });

            /* 装饰撒点（跳过：路、水、山、锚点、POI 保护区、已有碰撞物） */
            Object.keys(ow.decor_plant || {}).forEach(function (regionId) {
                var cfg = ow.decor_plant[regionId];
                var region = ow.regions.filter(function (r) { return r.id === regionId; })[0];
                if (!region) return;
                var r = region.rect;
                var area = (r[2] - r[0] + 1) * (r[3] - r[1] + 1);
                var count = Math.floor(area * (cfg.density || 0));
                if (count <= 0) return;
                var placed = 0, guard = 0;
                while (placed < count && guard < count * 8) {
                    guard++;
                    var tx = r[0] + Math.floor(self.rand() * (r[2] - r[0] + 1));
                    var ty = r[1] + Math.floor(self.rand() * (r[3] - r[1] + 1));
                    if (self._isRoad(tx, ty) || self._isWater(tx, ty) || self._isMountain(tx, ty)) continue;
                    if (self._anchorSet[tx + ',' + ty]) continue;
                    if (self.solid[ty] && self.solid[ty][tx]) continue;
                    if (inPoiGuard(tx, ty)) continue;
                    var choices = cfg.tiles || [];
                    if (!choices.length) continue;
                    var it = choices[Math.floor(self.rand() * choices.length)];
                    if (!it) continue;
                    var pack = it[0], pick = it[1];
                    if (!self._getFrame(pack, pick)) continue;
                    self.add.image(
                        tx * self.TILE + (self.TILE / 2),
                        ty * self.TILE + (self.TILE / 2),
                        pack, pick
                    ).setScale(self.SCALE).setDepth(2);
                    if (cfg.solid) self._setSolidTile(tx, ty, true);
                    placed++;
                }
            });

            this._buildPlayer(ow);
            this._buildPois(ow);

            this.cameras.main.setBounds(0, 0, this.WORLD_W, this.WORLD_H);
            this.cameras.main.startFollow(this.player, true, 0.10, 0.10);
            this.physics.world.setBounds(0, 0, this.WORLD_W, this.WORLD_H);
        },

        _buildPlayer: function (ow) {
            var init = ow.player.initial || { x: 58, y: 46 };
            var px = init.x * this.P + (this.P / 2);
            var py = init.y * this.P + (this.P / 2);

            this.player = this.add.container(px, py).setDepth(5);

            this.playerShadow = this.add.ellipse(0, this.P / 2 - 2, this.P * 0.78, 10, 0x000000, 0.35);
            this.playerSprite = this.add.image(0, this.P / 2, 'dungeon', 96)
                .setOrigin(0.5, 1)
                .setDisplaySize(this.P * 0.92, this.P * 0.92);

            this.player.add(this.playerShadow);
            this.player.add(this.playerSprite);
            this.player.setData('baseY', this.playerSprite.y);

            this.keyboard = this.input.keyboard;
            this.keys = this.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
            this.keyE = this.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

            this.walkPhase = 0;
            this.facing = 1;
            this.moving = false;
            this.closestPoi = null;
            this.playerSpeed = ow.player.speed || 160;
            this.playerR = ow.player.radius_px || 13;
        },

        /* POI：realm 型带光圈；skill_npc 用🧙；spawn 不独立渲染 */
        _buildPois: function (ow) {
            var self = this;
            this.pois = [];
            this.badgePool = [];

            ow.pois.forEach(function (p) {
                var cx = p.x * self.P + (self.P / 2);
                var cy = p.y * self.P + (self.P / 2);

                if (p.type === 'spawn') {
                    /* 生灭台：地面喷泉图案 + 指示标记（地面层） */
                    var spawnMark = self.add.graphics().setDepth(2);
                    spawnMark.lineStyle(3, 0xd4af37, 0.7);
                    spawnMark.strokeCircle(0, 0, self.P * 0.8);
                    spawnMark.setPosition(cx, cy);
                    return;
                }

                var halo = null;
                if (p.type === 'realm') {
                    /* 六道入口：金色呼吸光圈 + 彩色内晕（更显眼） */
                    halo = self.add.graphics().setDepth(3);
                    /* 外发光 */
                    halo.fillStyle(0xd4af37, 0.22);
                    halo.fillCircle(0, 0, self.P * 0.85);
                    /* 内层主题色 */
                    var innerColor = self._realmInnerColor(p.realm);
                    halo.fillStyle(innerColor, 0.55);
                    halo.fillCircle(0, 0, self.P * 0.5);
                    halo.setPosition(cx, cy);
                    if (!reduced) {
                        self.tweens.add({
                            targets: halo,
                            scaleX: { to: 1.25, from: 1 },
                            scaleY: { to: 1.25, from: 1 },
                            alpha: { to: 0.85, from: 0.55 },
                            duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut'
                        });
                    }
                } else if (p.type === 'npc') {
                    /* 菩提老者：智慧蓝光圈 */
                    halo = self.add.graphics().setDepth(3);
                    halo.fillStyle(0x4ecdc4, 0.25);
                    halo.fillCircle(0, 0, self.P * 0.75);
                    halo.fillStyle(0xfff9c5, 0.5);
                    halo.fillCircle(0, 0, self.P * 0.45);
                    halo.setPosition(cx, cy);
                    if (!reduced) {
                        self.tweens.add({
                            targets: halo,
                            alpha: { to: 1, from: 0.6 },
                            duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut'
                        });
                    }
                }

                var txt = self.add.text(cx, cy - (p.type === 'realm' ? self.P * 0.48 : self.P * 0.26),
                    p.emoji, {
                        fontFamily: 'Arial, "Noto Color Emoji", "Apple Color Emoji", sans-serif',
                        fontSize: (self.P * 0.78) + 'px'
                    }).setOrigin(0.5).setDepth(6);

                var entry = { poi: p, x: cx, y: cy, halo: halo, text: txt };
                self.pois.push(entry);

                if (p.type === 'realm') {
                    var bt = self.add.text(cx, cy - self.P * 1.0, '—', {
                        fontFamily: 'Arial, sans-serif',
                        fontSize: (self.P * 0.44) + 'px',
                        fontWeight: 'bold'
                    }).setOrigin(0.5).setDepth(7).setColor('#f4c542');
                    /* 徽章背景板 */
                    var badgeBg = self.add.graphics().setDepth(6);
                    badgeBg.fillStyle(0x1a1a2e, 0.72);
                    badgeBg.lineStyle(2, 0xd4af37, 0.9);
                    self.realmBadgeBg = badgeBg;  // 占位，后续动态刷新尺寸
                    self.badgePool.push({
                        realm: p.realm, text: bt, bg: badgeBg, halo: halo,
                        levels: [0, 5], done: false, sandbox: false
                    });
                }
            });

            self._syncBadges(this.samsara ? this.samsara.realm_progress : {});
        },

        _realmInnerColor: function (realm) {
            switch (realm) {
                case 'heaven': return 0xfff9c5;   /* 天道 · 暖金 */
                case 'human':  return 0xa8e6cf;   /* 人道 · 生绿 */
                case 'animal': return 0xffd3b6;   /* 畜生 · 大地 */
                case 'asura':  return 0xff6b6b;   /* 阿修罗 · 战红 */
                case 'hungry': return 0x795548;   /* 饿鬼 · 腐褐 */
                case 'hell':   return 0x4a1942;   /* 地狱 · 幽紫 */
                default:       return 0xd4af37;
            }
        },

        _syncBadges: function (realmProgress) {
            var self = this;
            var totals = self._levelTotals || (self._levelTotals = {});
            var s = self.samsara || {};
            var unlocked = s.sandbox_unlocked || [];
            this.badgePool.forEach(function (b) {
                var rp = realmProgress[b.realm] || {};
                var total = totals[b.realm] !== undefined ? totals[b.realm] : 5;
                var passed = rp.levels_passed || 0;
                b.done = !!rp.completed;
                b.sandbox = unlocked.indexOf(b.realm) >= 0;
                var lbl;
                if (b.done) {
                    lbl = '✓ 已通关' + (b.sandbox ? ' 🔒' : '');
                    b.text.setColor('#0a9396');
                } else {
                    lbl = passed + ' / ' + total;
                    b.text.setColor('#f4c542');
                }
                b.text.setText(lbl);
                /* 徽章底板按文字大小 */
                if (b.bg) {
                    b.bg.clear();
                    var w = Math.max(b.text.width + 16, self.P * 1.3);
                    var h = b.text.height + 8;
                    var cx = b.text.x;
                    var cy = b.text.y;
                    b.bg.setDepth(b.text.depth - 1);
                    b.bg.fillStyle(0x1a1a2e, 0.72);
                    b.bg.lineStyle(2, b.done ? 0x0a9396 : 0xd4af37, 0.92);
                    b.bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
                    b.bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
                }
            }, this);
        },

        syncSamsara: function (state) {
            if (!state) return;
            this.samsara = state;
            this._syncBadges(state.realm_progress || {});
            if (UI) UI.refreshHUD();
        },

        refreshSamsara: function () {
            var self = this;
            return fetch('/samsara/api/state')
                .then(function (r) { return r.json(); })
                .then(function (s) { self.syncSamsara(s); return s; })
                .catch(function () { return null; });
        },

        startPolling: function () {
            var self = this;
            this.pollTimer = setInterval(function () { self.refreshSamsara(); }, 8000);
        },
        stopPolling: function () {
            if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
        },

        refreshFromUI: function () { return this.refreshSamsara(); },

        update: function () {
            if (!this.player) return;
            var paused = !!(UI && UI.isModalOpen());

            var dx = 0, dy = 0;
            if (!paused) {
                if (this.keys.LEFT.isDown || this.keys.A.isDown) dx -= 1;
                if (this.keys.RIGHT.isDown || this.keys.D.isDown) dx += 1;
                if (this.keys.UP.isDown || this.keys.W.isDown) dy -= 1;
                if (this.keys.DOWN.isDown || this.keys.S.isDown) dy += 1;
            }

            var delta = this.game.loop.delta / 1000;
            var sp = this.playerSpeed;
            if (dx !== 0 || dy !== 0) {
                var inv = Math.hypot(dx, dy);
                this._moveAxis((dx / inv) * sp * delta, (dy / inv) * sp * delta);
                this.moving = true;
                if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
            } else {
                this.moving = false;
            }

            var wantFlip = this.facing < 0;
            if (this.playerSprite.flipX !== wantFlip) this.playerSprite.setFlipX(wantFlip);

            var baseY = this.player.getData('baseY');
            if (this.moving) {
                this.walkPhase += 6.5 * delta;
                if (!reduced) this.playerSprite.y = baseY - Math.abs(Math.sin(this.walkPhase)) * 3.2;
                else this.playerSprite.y = baseY;
            } else {
                if (reduced) this.playerSprite.y = baseY;
                else this.playerSprite.y = baseY - Math.sin(this.walkPhase * 0.8) * 1.8;
            }

            if (!paused) this._updateInteraction();
            if (!paused && Phaser.Input.Keyboard.JustDown(this.keyE)) this._onInteract();
        },

        _moveAxis: function (mx, my) {
            if (mx !== 0) {
                var nx = this.player.x + mx;
                if (!this._willCollide(nx, this.player.y)) this.player.x = nx;
            }
            if (my !== 0) {
                var ny = this.player.y + my;
                if (!this._willCollide(this.player.x, ny)) this.player.y = ny;
            }
        },

        _willCollide: function (px, py) {
            var r = this.playerR;
            if (px - r < 0 || px + r > this.WORLD_W || py - r < 0 || py + r > this.WORLD_H) return true;
            var t = this.P;
            var lx = Math.floor((px - r) / t), rx = Math.floor((px + r) / t);
            var ty = Math.floor((py - r) / t), by = Math.floor((py + r) / t);
            return this.isSolid(lx, ty) || this.isSolid(rx, ty) ||
                   this.isSolid(lx, by) || this.isSolid(rx, by);
        },

        _updateInteraction: function () {
            var self = this;
            var reach = this.ow.player.interact_tiles * this.P;
            var closest = null, minD = reach + 1;
            this.pois.forEach(function (entry) {
                var d = Math.hypot(entry.x - self.player.x, entry.y - self.player.y);
                if (d <= reach && d < minD) { minD = d; closest = entry; }
            });

            if (closest !== this.closestPoi) {
                var prev = this.closestPoi;
                if (prev && prev.halo) prev.halo.setBlendMode(Phaser.BlendModes.NORMAL);
                if (closest && closest.halo) closest.halo.setBlendMode(Phaser.BlendModes.ADD);
                this.closestPoi = closest;
            }

            if (closest && UI) {
                var lbl = closest.poi.type === 'realm'
                    ? ('前往 ' + (REALM_NAMES[closest.poi.realm] || closest.poi.realm))
                    : (closest.poi.label || '互动');
                UI.setInteractHint(lbl);
            } else if (UI) {
                UI.setInteractHint(null);
            }
        },

        _onInteract: function () {
            var entry = this.closestPoi;
            if (!entry || !UI) return;
            if (entry.poi.type === 'realm') UI.openRealmSelect(entry.poi.realm);
            else if (entry.poi.type === 'npc') UI.openSkillTree();
        }
    });

    function boot() {
        if (typeof Phaser === 'undefined') {
            if (window.OverworldUI) window.OverworldUI.showError('Phaser 引擎加载失败，请刷新重试');
            return;
        }
        reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        reduced = reduceQuery.matches;

        window.overworldGame = new Phaser.Game({
            type: Phaser.AUTO,
            parent: 'game-container',
            backgroundColor: '#070708',
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: 1280,
                height: 720
            },
            physics: { default: 'arcade', arcade: { debug: false } },
            scene: [OverworldScene]
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
