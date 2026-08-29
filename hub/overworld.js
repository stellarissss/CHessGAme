/* ═══════════════════════════════════════════════════════════════
   六道大陆 · 2.5D 剧情模式大地图（Phaser 3）
   职责：纯色轮廓大陆底图（单 Graphics 一次性绘制）/ 四向玩家移动与碰撞 /
         POI 与六道入口徽章 / E 键互动 / 按 8s 轮询刷新状态。
   支持：海域边界 / 河流 / 山脉屏障 / 非规则大陆形状 / 半岛海湾 / 各入口不动。
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

            /* ── 道路网格：当前地图改为纯色轮廓，道路用 O(1) 布尔网格查询 ── */
            this.roadGrid = [];
            for (var ry = 0; ry < this.H; ry++) {
                var rrow = new Array(this.W);
                for (var rx = 0; rx < this.W; rx++) rrow[rx] = false;
                this.roadGrid.push(rrow);
            }
            (ow.roads || []).forEach((function (r) {
                var i;
                if (r.x !== undefined) {
                    for (i = r.y0; i <= r.y1; i++) {
                        if (r.x >= 0 && r.x < this.W && i >= 0 && i < this.H) this.roadGrid[i][r.x] = true;
                    }
                } else if (r.y !== undefined) {
                    for (i = r.x0; i <= r.x1; i++) {
                        if (i >= 0 && i < this.W && r.y >= 0 && r.y < this.H) this.roadGrid[r.y][i] = true;
                    }
                }
            }).bind(this));

            /* ── 纯色轮廓调色板（地图待手动制作，先给清晰扁平的基础色块） ── */
            this.C_WATER = 0x1E6A96;
            this.C_MOUNT = 0x5A5650;
            this.C_ROAD  = 0xC9B37E;
            this.C_BASE  = 0x4F7A52;
            this.REG_COLOR = {
                nw_forest: 0x2E5E3B,  n_snow: 0xCBD8E0, ne_pasture: 0x6FA05A,
                w_waste: 0x9C8B5A,   c_plain: 0x8FA84F, east_ridge: 0x7C8B7B,
                sw_dungeon: 0x4A4252, s_desert: 0xD6B65C, se_battle: 0x9C5A45
            };

            /* 碰撞：水域 + 山脉 + 配置 solid_regions（装饰已清空，纯轮廓） */
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
            if (y < 0 || y >= this.H || x < 0 || x >= this.W) return false;
            return this.roadGrid[y][x];
        },
        _isWater: function (x, y) {
            if (y < 0 || y >= this.H || x < 0 || x >= this.W) return false;
            return this.waterGrid[y][x];
        },
        _isMountain: function (x, y) {
            if (y < 0 || y >= this.H || x < 0 || x >= this.W) return false;
            return this.mountainGrid[y][x];
        },

        /* 纯色轮廓配色：水域 > 山脉 > 道路 > 区域色 > 兜底地面色 */
        _colorAt: function (x, y) {
            if (this.waterGrid[y][x]) return this.C_WATER;
            if (this.mountainGrid[y][x]) return this.C_MOUNT;
            if (this.roadGrid[y][x]) return this.C_ROAD;
            var rg = this.regionByTile[y] ? this.regionByTile[y][x] : null;
            if (rg && this.REG_COLOR[rg.id]) return this.REG_COLOR[rg.id];
            return this.C_BASE;
        },

        /* ── 绘制纯色轮廓：逐行扫描 + 同色连续段合并为一个 fillRect。
           单次 Graphics 千把个矩形，远快于旧版逐瓦片烘焙。 ── */
        _renderSilhouette: function (g) {
            var T = this.TILE;
            for (var y = 0; y < this.H; y++) {
                var x = 0;
                while (x < this.W) {
                    var color = this._colorAt(x, y);
                    var x0 = x;
                    x++;
                    while (x < this.W && this._colorAt(x, y) === color) x++;
                    g.fillStyle(color, 1);
                    g.fillRect(x0 * T, y * T, (x - x0) * T, T);
                }
            }
        },

        /* ── 大陆轮廓底图（纯色，单 Graphics，一次性） ── */
        buildMap: function () {
            var g = this.add.graphics().setDepth(0);
            this._renderSilhouette(g);
            this.groundImg = g;
            return g;
        },

        /* ── 玩家 + POI（大地图为纯色轮廓，无装饰撒点/锚点） ── */
        buildActors: function () {
            this._buildPlayer(this.ow);
            this._buildPois(this.ow);

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
