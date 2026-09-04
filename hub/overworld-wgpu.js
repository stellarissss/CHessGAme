/* ═══════════════════════════════════════════════════════════════
   WebGPU 大地图渲染器（六道大陆）
   作为 OverworldGame 的 WebGPU 实现，替换 iso-engine 的 CSS 3D 阶段：

    渲染管线（次世代式，前向 GBuffer 精简版）：
      · 地形(高度场网格) + 实例化装饰(树/石/雪/水/植被/灵粒) → 颜色(HDR)+法线+世界坐标
      · SSAO(compute) → 屏幕空间环境光遮蔽
      · 体积光(fullscreen 沿太阳步进) → God Ray 近似
      · Bloom(亮部提取 + 逐级下采样)
      · 合成：HDR + ACES + Gamma + 暗角 + 抖动

    工程特性：
      · bind group / 实例化 / 分块视口剔除（只绘制可见 chunk 的索引/实例区间）
      · 资源构建在 Web Worker 中执行（多线程），失败则退回主线程同步构建
      · DOM 覆盖层(玩家/POI/告示牌) 用与 GPU 相同的 mvp 逐帧投影，保证严丝合缝
      · frame uniform 每帧上传（相机/光照/雾/动画时间）

   与 overworld-ui.js 兼容：保留 getSamsara / syncSamsara / refreshFromUI 等接口。
   ═══════════════════════════════════════════════════════════════ */
'use strict';
import './wgpu/shaders.js';

var CELL = 46;          // 世界坐标每格长度（与 DOM 版本一致，方便 POI 换算）
var WALL = 6;           // 边缘群山外障厚度（格）
var CHUNK = 16;         // 分块尺寸（格）
var EXPLORED_KEY = 'chesssage_ow_explored';
var S = window.OWSHADERS;

var REALM_NAMES = {
  hell: '地狱道', hungry: '饿鬼道', animal: '畜生道',
  human: '人道', asura: '阿修罗道', heaven: '天道'
};

var BIOME_LIST = [
  { id: 'nw_forest',  c: [0x2e, 0x6e, 0x3b], h: 1.5 },
  { id: 'n_snow',     c: [0xdc, 0xe6, 0xef], h: 1.7 },
  { id: 'ne_pasture', c: [0x8f, 0xbf, 0x54], h: 0.9 },
  { id: 'w_waste',    c: [0xb8, 0xa0, 0x6a], h: 0.7 },
  { id: 'c_plain',    c: [0x6c, 0xa6, 0x59], h: 0.65 },
  { id: 'east_ridge', c: [0x7d, 0x93, 0x84], h: 2.4 },
  { id: 'sw_dungeon', c: [0x24, 0x1c, 0x30], h: 0.2 },
  { id: 's_desert',   c: [0xd8, 0xb2, 0x5a], h: 0.5 },
  { id: 'se_battle',  c: [0xa4, 0x44, 0x3f], h: 0.9 }
];
var C_WATER = [0x1E, 0x6A, 0x96];
var C_ROAD = [0xC9, 0xB3, 0x7E];
var C_ROCK = [0x7F, 0x7A, 0x73];
// 索引对齐 BIOME_LIST 顺序的区域植被类型表
var BIOME_KINDS = [
  ['pine', 'tree', 'grass', 'rock'],   // nw_forest
  ['snow', 'pine', 'snow', 'rock'],    // n_snow
  ['grass', 'tree', 'grass', 'rock'],  // ne_pasture
  ['dead', 'rock', 'dune'],            // w_waste
  ['tree', 'grass', 'rock', 'tree'],   // c_plain
  ['rock', 'pine', 'rock'],            // east_ridge
  ['ruin', 'rock', 'dead'],            // sw_dungeon
  ['cacti', 'dune', 'rock'],           // s_desert
  ['dead', 'rock', 'ruin']             // se_battle
];
// 索引对齐 BIOME_LIST 的区域装饰密度（区分繁茂/荒芜，避免全图均一 5%）
var BIOME_DENSITY = [0.16, 0.10, 0.14, 0.06, 0.12, 0.08, 0.055, 0.06, 0.07];

/* ═══════════════ 数学辅助（mat4，列主序 Float32Array） ═══════════════ */
function m4Identity() { var m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function m4Mul(a, b) {
  var o = new Float32Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1]
                 + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
  }
  return o;
}
function m4LookAt(eye, center, up) {
  var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  var len = Math.hypot(zx, zy, zz) || 1; zx /= len; zy /= len; zz /= len;
  var ux = up[0], uy = up[1], uz = up[2];
  var xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  len = Math.hypot(xx, xy, xz) || 1; xx /= len; xy /= len; xz /= len;
  var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  var m = m4Identity();
  m[0] = xx; m[1] = yx; m[2] = zx;
  m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  return m;
}
function m4Ortho(l, r, b, t, n, f) {
  var m = m4Identity();
  m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n);
  return m;
}
function m4Invert(m) {
  var o = new Float32Array(16);
  m4InvertTo(m, o); return o;
}
function m4InvertTo(m, invOut) {
  var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3],
      a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
      a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11],
      a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15],
      b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32,
      det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) { return; }
  det = 1 / det;
  invOut[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  invOut[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  invOut[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  invOut[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  invOut[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  invOut[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  invOut[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  invOut[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  invOut[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  invOut[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  invOut[10] = (a30 * b04 - a31 * b02 + a33 * b01) * det;
  invOut[11] = (a21 * b02 - a20 * b04 - a23 * b01) * det;
  invOut[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  invOut[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  invOut[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  invOut[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
}
function m4Transform(m, v) {
  var w = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
  return [
    (m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]) / w,
    (m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]) / w,
    (m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]) / w
  ];
}

/* ═══════════════ buildWorld：在 Worker（或主线程）中构建网格/实例 ═══
   自包含函数：可序列化为字符串注入 Blob Worker。不引用任何外部变量。 */
function buildWorld(spec) {
  var W = spec.W, H = spec.H, CELL = spec.CELL, CHUNK = 16;
  var flags = spec.flags, biome = spec.biome; // Int32Array
  var NV = (W + 1) * (H + 1);

  // hash / noise
  function rng(x, y, salt) {
    var h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  }
  function noise(nx, ny) { // value noise, unit cell
    var xi = Math.floor(nx), yi = Math.floor(ny);
    var xf = nx - xi, yf = ny - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = rng(xi, yi, 40), b = rng(xi + 1, yi, 40), c = rng(xi, yi + 1, 40), d = rng(xi + 1, yi + 1, 40);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) { return noise(x, y) * 0.6 + noise(x * 2.3, y * 2.3) * 0.3 + noise(x * 5.3 + 4, y * 5.3 + 3) * 0.1; }

  var F_WATER = 1, F_ROAD = 2, F_MOUNT = 4, F_WALL = 8, F_SOLID = 16;

  /* 生物群系采样：用分形噪声做域扭曲（domain warp），把原本由轴对齐矩形逐格填充的
     平直线边界“卷”成有机、自然过渡的曲线边缘——景观之间不再是笔直的线。 */
  function warpBiome(tx, ty) {
    var s = 4.5;  // 扭曲幅度（格），越大边界越蜿蜒
    var wx = tx + (fbm(tx * 0.115 + 7.3, ty * 0.115 + 1.1) - 0.5) * s * 2;
    var wy = ty + (fbm(tx * 0.115 + 3.7, ty * 0.115 + 5.9) - 0.5) * s * 2;
    if (wx < 0) wx = 0; else if (wx >= W - 1) wx = W - 1;
    if (wy < 0) wy = 0; else if (wy >= H - 1) wy = H - 1;
    return biome[(wy | 0) * W + (wx | 0)];
  }

  function tileH(tx, ty) {
    var i = ty * W + tx;
    var f = flags[i];
    var rid = warpBiome(tx, ty);
    var base = BIOME_BASE[rid] || 0.6;
    if (f & F_WATER) return (f & F_WALL) ? 14 + rng(tx, ty, 50) * 5 : -0.6;
    if (f & F_WALL) return 13 + fbm(tx * 0.13, ty * 0.13) * 7;
    if (f & F_MOUNT) return 5.5 + fbm(tx * 0.17, ty * 0.17) * 3.5;
    return base + fbm(tx * 0.08, ty * 0.08) * 1.4 - 0.4;
  }
  function tileC(tx, ty) {
    var i = ty * W + tx;
    var f = flags[i];
    if (f & F_ROAD) return C_ROAD;
    if (f & F_MOUNT) return C_ROCK;
    if (f & F_WALL) return C_ROCK;
    if (f & F_WATER) return C_WATER;
    var c = BIOME_C[warpBiome(tx, ty)];
    // 轻微噪声色偏，让地面色块更自然、减少“贴纸感”
    if (c) {
      var sh = (noise(tx * 0.05 + 2.2, ty * 0.05 + 9.4) - 0.5) * 18;
      return [Math.max(0, Math.min(255, Math.round(c[0] + sh))),
              Math.max(0, Math.min(255, Math.round(c[1] + sh))),
              Math.max(0, Math.min(255, Math.round(c[2] + sh)))];
    }
    return [0x5f, 0x9e, 0x4e];
  }

  // —— 高度场顶点 ——
  var tH = [], tC = [];
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    tH.push(tileH(x, y)); tC.push(tileC(x, y));
  }
  var idxAt = function (x, y) { return y * W + x; };
  var vertPos = new Float32Array(NV * 10);
  var vi = 0;
  for (var j = 0; j <= H; j++) for (var i = 0; i <= W; i++) {
    // 顶点高度/颜色 = 邻近 4 格平均（越界回绕 → 视为墙）
    var xs = [Math.max(0, i - 1), Math.min(W - 1, i)];
    var ys = [Math.max(0, j - 1), Math.min(H - 1, j)];
    var hAcc = 0, cr = 0, cg = 0, cb = 0, n = 0;
    xs.forEach(function (ax) { ys.forEach(function (ay) {
      var k = idxAt(ax, ay);
      hAcc += tH[k]; var c = tC[k]; cr += c[0]; cg += c[1]; cb += c[2]; n++;
    }); });
    var hh = hAcc / n, r = cr / n / 255, g = cg / n / 255, b = cb / n / 255;
    vertPos[vi++] = i * CELL; vertPos[vi++] = j * CELL; vertPos[vi++] = hh;
    vertPos[vi++] = r; vertPos[vi++] = g; vertPos[vi++] = b; vertPos[vi++] = 1;
    vertPos[vi++] = 0; vertPos[vi++] = 0; vertPos[vi++] = 0;
  }
  // 计算法线
  function gv(i, j) { return j * (W + 1) + i; }
  var hAt = function (i, j) { return vertPos[gv(i, j) * 10 + 2]; };
  for (var j2 = 0; j2 <= H; j2++) for (var i2 = 0; i2 <= W; i2++) {
    var il = Math.max(0, i2 - 1), ir = Math.min(W, i2 + 1);
    var jd = Math.max(0, j2 - 1), ju = Math.min(H, j2 + 1);
    var dx = (hAt(ir, j2) - hAt(il, j2)) / (2 * CELL);
    var dy = (hAt(i2, ju) - hAt(i2, jd)) / (2 * CELL);
    var nx = -dx, ny = -dy, nz = 1;
    var l = Math.hypot(nx, ny, nz) || 1;
    var o = gv(i2, j2) * 10;
    vertPos[o + 7] = nx / l; vertPos[o + 8] = ny / l; vertPos[o + 9] = nz / l;
  }
  // —— 索引 + 分块 ——
  var terrIdx = new Uint32Array(W * H * 6);
  var terrChunkMap = {}; var terrChunks = [];
  var tii = 0;
  for (var ty2 = 0; ty2 < H; ty2++) for (var tx2 = 0; tx2 < W; tx2++) {
    var a = gv(tx2, ty2), bb = gv(tx2 + 1, ty2), c2 = gv(tx2, ty2 + 1), d2 = gv(tx2 + 1, ty2 + 1);
    terrIdx[tii++] = a; terrIdx[tii++] = bb; terrIdx[tii++] = c2;
    terrIdx[tii++] = bb; terrIdx[tii++] = d2; terrIdx[tii++] = c2;
    var cx = (tx2 / CHUNK) | 0, cy = (ty2 / CHUNK) | 0, key = cy * 1000 + cx;
    var cell = terrChunkMap[key];
    if (!cell) { cell = { cx: cx, cy: cy, first: tii - 6, count: 6 }; terrChunkMap[key] = cell; terrChunks.push(cell); }
    else { cell.count += 6; }
  }
  // —— 实例化装饰（树/石/雪/水/植被/灵粒） ——
  // 每对象类型 → 实例数组；每实例 20 floats:
  // [pos3][scale3][yaw,flag][colT.rgb,alpha][colF.rgb,alpha][colR.rgb,alpha]
  function pushInst(arr, cx, cy, pos, scale, yaw, flag, ct, cf, cr, alpha) {
    var b = arr.base;
    for (var q = 0; q < pos.length; q++) b.push(pos[q]);
    for (q = 0; q < scale.length; q++) b.push(scale[q]);
    b.push(yaw, flag);
    b.push(ct[0], ct[1], ct[2], alpha, cf[0], cf[1], cf[2], alpha, cr[0], cr[1], cr[2], alpha);
    arr.n++;
    var ckey = cy * 1000 + cx;
    var cell = arr.chunkMap[ckey];
    if (!cell) { cell = { cx: cx, cy: cy, first: arr.n - 1, count: 1 }; arr.chunkMap[ckey] = cell; arr.chunks.push(cell); }
    else cell.count++;
  }
  function obj(color) { return [color[0] / 255, color[1] / 255, color[2] / 255]; }
  var deco = { base: [], n: 0, chunkMap: {}, chunks: [] };

  for (var y3 = 0; y3 < H; y3++) for (var x3 = 0; x3 < W; x3++) {
    var idx = y3 * W + x3;
    var f = flags[idx], rid = biome[idx], cx3 = (x3 / CHUNK) | 0, cy3 = (y3 / CHUNK) | 0;
    var gc = (x3 + 0.5) * CELL, gy = (y3 + 0.5) * CELL;
    var groundH = tH[idxAt(x3, y3)];
    var r = rng;

    if (f & F_WATER) {
      // 水面（薄片）+ 微光灵粒
      pushInst(deco, cx3, cy3, [gc, gy, groundH + 0.15], [CELL, CELL, 0.4], 0, 1, obj(C_WATER.map(function (v) { return v * 0.9; })), obj(C_WATER), obj(C_WATER), 0.82);
      if (r(x3, y3, 60) < 0.05) addMote(gc + (r(x3, y3, 61) - 0.5) * CELL * 0.6, gy + (r(x3, y3, 62) - 0.5) * CELL * 0.6, groundH + 2);
      continue;
    }
    if (f & F_WALL) {
      // 群山外障：密布巨岩，形成不可逾越的山墙
      if (r(x3, y3, 5) > 0.82) continue;
      var wd = CELL * (0.9 + r(x3, y3, 6) * 1.1);
      pushInst(deco, cx3, cy3, [gc, gy, groundH], [CELL * 0.85, CELL * 0.85, wd], 0, 0, obj([0x6f, 0x6a, 0x62]), obj([0x57, 0x52, 0x49]), obj([0x3e, 0x3a, 0x34]), 1);
      continue;
    }
    if (f & F_MOUNT) {
      if (r(x3, y3, 5) > 0.55) continue;
      var mh = CELL * (0.6 + r(x3, y3, 6) * 0.9);
      pushInst(deco, cx3, cy3, [gc, gy, groundH], [CELL * 0.62, CELL * 0.62, mh], 0, 0, obj([0x8f, 0x8a, 0x82]), obj([0x72, 0x6d, 0x65]), obj([0x57, 0x52, 0x4a]), 1);
      continue;
    }
    if (f & F_SOLID) continue;
    var kinds = BIOME_KINDS[rid];
    if (!kinds) continue;
    var dens = BIOME_DENSITY[rid] || 0.05;
    if (r(x3, y3, 1) > dens) {
      // 稀疏灵粒/野花点缀，让大地更有生气
      if (r(x3, y3, 63) < 0.02) addMote(gc, gy, groundH + 2);
      continue;
    }
    var kind = kinds[Math.floor(r(x3, y3, 2) * kinds.length)];
    var s = 0.6 + r(x3, y3, 3) * 0.7;
    place(gc, gy, groundH, kind, s, cx3, cy3, r);
    // 设计化的景观过渡：紧邻不同生物群系的边界格，以噪声概率补一棵矮灌/一颗小石，
    // 把直线分界弱化为有层次的植物过渡带（对应旧 iso 路径的 buildBoundaries）。
    var wr = warpBiome(x3, y3);
    if (wr !== rid && r(x3, y3, 31) < 0.16) {
      var edgeK = r(x3, y3, 32) < 0.5 ? 'grass' : 'rock';
      place(gc + (r(x3, y3, 33) - 0.5) * CELL * 0.4, gy + (r(x3, y3, 34) - 0.5) * CELL * 0.4,
            groundH, edgeK, 0.55 + r(x3, y3, 35) * 0.4, cx3, cy3, r);
    }
  }
  function addMote(x, y, z) {
    var s = CELL * 0.05;
    pushInst(deco, (x / CELL / CHUNK) | 0, (y / CELL / CHUNK) | 0, [x, y, z], [s, s, s], 0, 2, [0xff, 0xe6, 0x8a].map(function (v) { return v / 255; }), [0xff, 0xdd, 0x66].map(function (v) { return v / 255; }), [0xff, 0xcc, 0x44].map(function (v) { return v / 255; }), 0.9);
  }
  function place(gcx, gcy, gz, kind, scale, cx, cy, R) {
    var c = function (hc) { return [hc[0] / 255, hc[1] / 255, hc[2] / 255]; };
    var k;
    switch (kind) {
      case 'tree': case 'pine': {
        var trunkW = CELL * 0.22;
        pushInst(deco, cx, cy, [gcx, gcy, gz], [CELL * 0.22, CELL * 0.22, CELL * 0.30], R(gcx | 0, gcy | 0, 70), 0, c([0x6b, 0x4a, 0x2f]), c([0x5a, 0x3d, 0x26]), c([0x49, 0x32, 0x1e]), 1);
        var leaf = (kind === 'tree' ? [0x4a, 0x8f, 0x3a] : [0x2f, 0x6b, 0x3a]);
        pushInst(deco, cx, cy, [gcx, gcy, gz + CELL * 0.3], [CELL * 0.6 * scale, CELL * 0.6 * scale, CELL * 0.6 * scale], R(gcx | 0, gcy | 0, 71), 0, c(leaf), c(leaf.map(function (v) { return v * 0.8; })), c(leaf.map(function (v) { return v * 0.62; })), 1);
        break; }
      case 'rock': case 'ruin': {
        var rw = CELL * 0.5 * scale, rd = CELL * 0.4 * scale;
        var tc = kind === 'ruin' ? [0x7b, 0x6f, 0x64] : [0x9a, 0x94, 0x8c];
        pushInst(deco, cx, cy, [gcx, gcy, gz], [rw, rw, rd], R(gcx | 0, gcy | 0, 72), 0, c(tc), c([0x5f, 0x55, 0x4c]), c([0x61, 0x5c, 0x55]), 1);
        break; }
      case 'snow': {
        var sw = CELL * 0.5 * scale, sd = CELL * 0.38 * scale;
        pushInst(deco, cx, cy, [gcx, gcy, gz], [sw, sw, sd], R(gcx | 0, gcy | 0, 73), 0, c([0xff, 0xff, 0xff]), c([0xdf, 0xe9, 0xf2]), c([0xb8, 0xcc, 0xdc]), 1);
        break; }
      case 'grass':
        pushInst(deco, cx, cy, [gcx, gcy, gz], [CELL * 0.5 * scale, CELL * 0.5 * scale, CELL * 0.18 * scale], R(gcx | 0, gcy | 0, 74), 2, c([0x7f, 0xc0, 0x4e]), c([0x66, 0xa5, 0x3e]), c([0x4f, 0x83, 0x30]), 0.95);
        break;
      case 'dead':
        pushInst(deco, cx, cy, [gcx, gcy, gz], [CELL * 0.5 * scale, CELL * 0.5 * scale, CELL * 0.14 * scale], R(gcx | 0, gcy | 0, 75), 2, c([0x9b, 0x8b, 0x5a]), c([0x7d, 0x70, 0x47]), c([0x5f, 0x56, 0x36]), 0.95);
        break;
      case 'cacti':
        pushInst(deco, cx, cy, [gcx, gcy, gz], [CELL * 0.26, CELL * 0.26, CELL * 0.9 * scale], R(gcx | 0, gcy | 0, 76), 0, c([0x5a, 0x90, 0x40]), c([0x4a, 0x7a, 0x35]), c([0x3a, 0x64, 0x29]), 1);
        pushInst(deco, cx, cy, [gcx + CELL * 0.18, gcy - CELL * 0.1, gz + CELL * 0.5 * scale], [CELL * 0.34, CELL * 0.2, CELL * 0.16 * scale], R(gcx | 0, gcy | 0, 77), 0, c([0x5a, 0x90, 0x40]), c([0x4a, 0x7a, 0x35]), c([0x3a, 0x64, 0x29]), 1);
        break;
      case 'dune':
        pushInst(deco, cx, cy, [gcx, gcy, gz], [CELL * 0.55 * scale, CELL * 0.55 * scale, CELL * 0.22 * scale], R(gcx | 0, gcy | 0, 78), 0, c([0xe0, 0xbb, 0x6a]), c([0xc8, 0xa0, 0x52]), c([0xa9, 0x8a, 0x40]), 1);
        break;
    }
  }

  // 收紧数组
  var inst = new Float32Array(deco.n * 20);
  for (var i3 = 0; i3 < deco.n * 20; i3++) inst[i3] = deco.base[i3];

  function chunksToArray(list) {
    var a = new Uint32Array(list.length * 4);
    for (var i4 = 0; i4 < list.length; i4++) { var c = list[i4]; a[i4 * 4] = c.cx; a[i4 * 4 + 1] = c.cy; a[i4 * 4 + 2] = c.first; a[i4 * 4 + 3] = c.count; }
    return a;
  }

  // 补齐 10-float 步进的 mvp 之外不需要的 padding —— 无。
  return {
    terrainVerts: vertPos, terrainIdx: terrIdx,
    terrainChunks: chunksToArray(terrChunks),
    decoInst: inst, decoChunks: chunksToArray(deco.chunks),
    terrainVertCount: NV, terrainIdxCount: W * H * 6,
    decoCount: deco.n, terrainChunkCount: terrChunks.length, decoChunkCount: deco.chunks.length
  };
}
// buildWorld 引用的全局查找表 —— 作为模块级常量，注入 Worker 时一并带上
var BIOME_BASE = {}; var BIOME_C = {}; var BIOME_ID = {};
(function () {
  for (var i = 0; i < BIOME_LIST.length; i++) {
    var bm = BIOME_LIST[i];
    BIOME_C[i] = bm.c; BIOME_BASE[i] = bm.h;
  }
  BIOME_ID = {};
  for (var jj = 0; jj < BIOME_LIST.length; jj++) BIOME_ID[BIOME_LIST[jj].id] = jj;
})();

/* ═══════════════════════ OverworldGame（WebGPU） ═══════════════════════ */
var OverworldGame = {

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
  startPolling: function () { var self = this; this.pollTimer = setInterval(function () { self.refreshSamsara(); }, 8000); },
  stopPolling: function () { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } },
  isOpen: function () { return UI ? UI.isModalOpen() : false; },

  /* ── 世界几何引导 ── */
  bootstrapGeometry: function (ow) {
    var self = this;
    this.W = ow.world.width; this.H = ow.world.height; this.ow = ow;
    this.regionByTile = [];
    for (var i = 0; i < this.H; i++) this.regionByTile.push(new Array(this.W));
    (ow.regions || []).forEach(function (rg) {
      var rects = rg.rects && rg.rects.length ? rg.rects : (rg.rect ? [rg.rect] : []);
      for (var k = 0; k < rects.length; k++) {
        var r = rects[k];
        var x0 = r[0], x1 = r[2], y0 = r[1], y1 = r[3];
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
          if (x >= 0 && x < self.W && y >= 0 && y < self.H) self.regionByTile[y][x] = rg;
      }
    });

    // 顶点属性 + flags/biome 码
    this.flags = new Int32Array(this.W * this.H);
    this.biome = new Int32Array(this.W * this.H);
    var fl = this.flags, bm = this.biome;
    function fillRect(list, bit) {
      if (!Array.isArray(list)) return;
      list.forEach(function (it) {
        if (!it || it[0] !== 'rect') return;
        var y0 = it[3], x1 = it[4], y1 = it[5], x0 = it[2];
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
          if (y >= 0 && y < self.H && x >= 0 && x < self.W) fl[y * self.W + x] |= bit;
      });
    }
    fillRect(ow.water_overlays, 1); fillRect(ow.river_snow, 1); fillRect(ow.river_ridge, 1);
    fillRect(ow.mountain_overlays, 4);
    (ow.roads || []).forEach(function (r) {
      if (r.rect) for (var i2 = r.rect[0]; i2 <= r.rect[2]; i2++) for (var j2 = r.rect[1]; j2 <= r.rect[3]; j2++)
          if (i2 >= 0 && i2 < self.W && j2 >= 0 && j2 < self.H) fl[j2 * self.W + i2] |= 2;
      else if (r.x !== undefined) for (var j3 = r.y0; j3 <= r.y1; j3++) if (j3 >= 0 && j3 < self.H && r.x >= 0 && r.x < self.W) fl[j3 * self.W + r.x] |= 2;
      else if (r.y !== undefined) for (var i3 = r.x0; i3 <= r.x1; i3++) if (i3 >= 0 && i3 < self.W && r.y >= 0 && r.y < self.H) fl[r.y * self.W + i3] |= 2;
    });
    (ow.solid_regions || []).forEach(function (s) {
      var r = s.rect;
      for (var j4 = r[1]; j4 <= r[3]; j4++) for (var i4 = r[0]; i4 <= r[2]; i4++)
        if (j4 >= 0 && j4 < self.H && i4 >= 0 && i4 < self.W) fl[j4 * self.W + i4] |= 16;
    });
    for (var y5 = 0; y5 < this.H; y5++) for (var x5 = 0; x5 < this.W; x5++) {
      if (x5 < WALL || x5 >= this.W - WALL || y5 < WALL || y5 >= this.H - WALL) fl[y5 * this.W + x5] |= 8;
      var rg = this.regionByTile[y5][x5];
      var rid = rg && rg.id ? rg.id : 'c_plain';
      bm[y5 * this.W + x5] = (BIOME_ID[rid] !== undefined ? BIOME_ID[rid] : 4);
    }
    this.playerPos = { x: ((this.ow.player && this.ow.player.initial) || { x: 58, y: 46 }).x + 0.5, y: ((this.ow.player && this.ow.player.initial) || { x: 58, y: 46 }).y + 0.5 };
    this.playerSpeed = ((this.ow.player && this.ow.player.speed) || 160) / 5;

    // 启动资源构建（首推 Worker，多线程；失败主线程兜底）
    this._prepare();

    // 同步构建可立即完成的部分（小地图）
    if (UI) UI.setLoadingProgress(38);
  },

  _prepare: function () {
    var self = this;
    this._ready = this._buildResources().then(function () {
      return self._initGPU();
    }).catch(function (err) {
      console.error('[WebGPU] init failed:', err);
      if (UI) UI.removeLoading();   // 别让加载遮罩盖住 HUD
      // 自动回退到兼容渲染（iso-engine），保证大地图与 HUD 始终可用可点；幂等由分发起保护
      if (window.__owFallbackToIso) {
        window.__owFallbackToIso(err);
        return null;
      }
      if (UI) UI.showError('未能启动次世代渲染，请刷新重试，或确认浏览器开启了 WebGPU。');
      throw err;
    });
    return this._ready;
  },

  _buildResources: function () {
    var self = this;
    var spec = { W: this.W, H: this.H, CELL: CELL, flags: this.flags, biome: this.biome };
    var runMain = function () { self._world = buildWorld(spec); return Promise.resolve(); };
    if (!(typeof Worker === 'function')) return runMain();
    return new Promise(function (resolve) {
      // 将 buildWorld 及其依赖表内联注入 Blob Worker
      var src = '(' + buildWorld.toString() + ')';
      var tables = 'var BIOME_BASE=' + JSON.stringify(BIOME_BASE) + ';' +
                   'var BIOME_C=' + JSON.stringify(BIOME_C) + ';' +
                   'var BIOME_ID=' + JSON.stringify(BIOME_ID) + ';' +
                   'var BIOME_KINDS=' + JSON.stringify(BIOME_KINDS) + ';' +
                   'var BIOME_DENSITY=' + JSON.stringify(BIOME_DENSITY) + ';' +
                   'var C_ROAD=' + JSON.stringify(C_ROAD) + ';' +
                   'var C_WATER=' + JSON.stringify(C_WATER) + ';' +
                   'var C_ROCK=' + JSON.stringify(C_ROCK) + ';';
      var workerSrc = tables + 'self.onmessage=function(e){var build=' + src + ';var r=build(e.data);self.postMessage(r,[r.terrainVerts.buffer,r.terrainIdx.buffer,r.terrainChunks.buffer,r.decoInst.buffer,r.decoChunks.buffer]);};';
      var w;
      try {
        var url = URL.createObjectURL(new Blob([workerSrc], { type: 'application/javascript' }));
        w = new Worker(url);
      } catch (e) { w = null; }
      if (!w) { resolve(); return runMain().finally(function () {}); }
      w.onmessage = function (ev) {
        self._world = ev.data; resolve();
        try { w.terminate(); } catch (e) { }
      };
      w.onerror = function () { resolve(); runMain().finally(function () {}); try { w.terminate(); } catch (e) { } };
      // 转换 spec → 可结构化克隆的传输（用拷贝，避免 detach 掉 this.flags / this.biome）
      var flagsCopy = spec.flags.slice(), biomeCopy = spec.biome.slice();
      w.postMessage({ W: spec.W, H: spec.H, CELL: CELL, flags: flagsCopy, biome: biomeCopy }, [flagsCopy.buffer, biomeCopy.buffer]);
    });
  }
};

/* ═══════════════════════════════════════════════════════════════
   ══════════  下列方法通过 `OverworldGame.方法 = fn` 追加  ══════════
   （GPU 初始化 / 相机 / 渲染循环 / DOM 覆盖层 / 玩家 / 小地图 / 交互）
   ═══════════════════════════════════════════════════════════════ */

/* ── 基础立方体（供实例化装饰/水面使用）── */
function makeCube() {
  var verts = [], idx = [], faces = [
    [0, 0, 1, 0, 0, 1], [0, 0, -1, 0, 0, -1], [1, 0, 0, 1, 0, 0], [-1, 0, 0, -1, 0, 0], [0, 1, 0, 0, 1, 0], [0, -1, 0, 0, -1, 0]
  ];
  var u = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  faces.forEach(function (f) {
    var n = [f[3], f[4], f[5]];
    var dir = [f[0], f[1], f[2]];
    var base = verts.length / 6;
    for (var i = 0; i < 4; i++) {
      // 沿面轴铺开 u/v，法线方向 dir 决定 ±0.5 偏移，构成单位立方体角点
      var e1 = [0, 0, 0], e2 = [0, 0, 0];
      if (dir[0] !== 0) { e1 = [0, 1, 0]; e2 = [0, 0, 1]; }
      else if (dir[1] !== 0) { e1 = [1, 0, 0]; e2 = [0, 0, 1]; }
      else { e1 = [1, 0, 0]; e2 = [0, 1, 0]; }
      var u0 = u[i][0] > 0 ? 0.5 : -0.5, u1 = u[i][1] > 0 ? 0.5 : -0.5;
      var rx = dir[0] !== 0 ? dir[0] * 0.5 : e1[0] * u0 + e2[0] * u1;
      var ry = dir[1] !== 0 ? dir[1] * 0.5 : e1[1] * u0 + e2[1] * u1;
      var rz = dir[2] !== 0 ? dir[2] * 0.5 : e1[2] * u0 + e2[2] * u1;
      verts.push(rx, ry, rz, n[0], n[1], n[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx), indexCount: idx.length, vertexCount: verts.length / 6 };
}

/* ── 相机 ── */
OverworldGame.setupCamera = function () {
  var c = this.cam = { zoom: 1.6, vw: window.innerWidth, vh: window.innerHeight };
  var vp = document.getElementById('iso-viewport');
  if (vp) { c.vw = vp.clientWidth; c.vh = vp.clientHeight; }
  var self = this;
  this._onResize = (function () {
    var cc = this.cam;
    cc.vw = document.getElementById('iso-viewport').clientWidth;
    cc.vh = document.getElementById('iso-viewport').clientHeight;
    this._ensureSize();
    this.applyCamera(true);
  }).bind(this);
  window.addEventListener('resize', this._onResize);
  if (UI) UI.setLoadingProgress(45);
};

// 以玩家为世界中心计算 view/proj 矩阵
OverworldGame._updateView = function () {
  var c = this.cam, z = c.zoom;
  var tx = this.playerPos.x * CELL, ty = this.playerPos.y * CELL;
  var eye = [tx - 34, ty - 34, 44 + (z - 1) * 6]; // 拉近/拉远 = 升高/降高
  var target = [tx, ty, 0];
  var view = m4LookAt(eye, target, [0, 0, 1]);
  var hl = c.vw / (2 * z), vt = c.vh / (2 * z);
  var proj = m4Ortho(-hl, hl, -vt, vt, -600, 600);
  this._view = view; this._proj = proj;
  this._mvp = m4Mul(proj, view);
  this._invMvp = m4Invert(this._mvp);
  this._camPos = eye;
};

// World → 屏幕像素（与 GPU 同用一套 mvp，保证 DOM 覆盖层严丝合缝）
OverworldGame.project = function (wx, wy, wz) {
  if (!this._mvp) return { x: 0, y: 0, on: false, scale: this.cam ? this.cam.zoom : 1 };
  var clip = m4Transform(this._mvp, [wx, wy, wz]);
  var c = this.cam;
  return {
    x: (clip[0] * 0.5 + 0.5) * c.vw,
    y: (1 - (clip[1] * 0.5 + 0.5)) * c.vh,
    scale: c.zoom,
    on: clip[2] >= -1 && clip[2] <= 1
  };
};
OverworldGame._project = function () { return { x: 0, y: 0 }; }; // 兼容旧调用，实际用 project()

/* ── GPU 初始化 ── */
OverworldGame._initGPU = function () {
  var self = this;
  if (!navigator.gpu) return Promise.reject(new Error('no WebGPU'));
  return navigator.gpu.requestAdapter().then(function (adapter) {
    if (!adapter) throw new Error('no adapter');
    return adapter.requestDevice();
  }).then(function (device) {
    self.device = device;
    self.presentFormat = navigator.gpu.getPreferredCanvasFormat();
    self._canvas = document.createElement('canvas');
    var vp = document.getElementById('iso-viewport');
    if (!vp) throw new Error('no viewport');
    // 清掉 iso-stage（DOM 版本占位），换上渲染 canvas
    while (vp.firstChild) vp.removeChild(vp.firstChild);
    vp.appendChild(self._canvas);
    self._canvas.style.position = 'absolute'; self._canvas.style.inset = '0'; self._canvas.style.width = '100%'; self._canvas.style.height = '100%';
    // canvas 永远不拦截鼠标：交互走 window 键鼠 + 独立的 DOM 标点层，避免画布盖住 HUD 按钮
    self._canvas.style.pointerEvents = 'none';
    self._ctx = self._canvas.getContext('webgpu');
    self._ctx.configure({ device: device, format: self.presentFormat, alphaMode: 'opaque' });
    self._sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    self._buildPipelines();
    self._uploadWorld();
    self._ensureSize();
    self._makeOverlay();
    self._canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
    return device;
  });
};

// 帧级 uniform：52 floats
OverworldGame._updateFrame = function () {
  var f = this._frameBuf; if (!f) return;
  f.fill(0);
  f.set(this._mvp, 0);
  f[16] = this._camPos[0]; f[17] = this._camPos[1]; f[18] = this._camPos[2];
  // sunDir (世界指向太阳)，黄昏暖阳略低
  var sd = [-0.5, -0.35, 0.78]; var sl = Math.hypot(sd[0], sd[1], sd[2]);
  f[20] = sd[0] / sl; f[21] = sd[1] / sl; f[22] = sd[2] / sl;
  f[24] = 0.52; f[25] = 0.66; f[26] = 0.82;         // skyColor
  f[28] = 0.20; f[29] = 0.22; f[30] = 0.24;         // groundColor
  f[32] = 0.50; f[33] = 0.54; f[34] = 0.60;         // fogColor
  f[36] = 1.0; f[37] = 0.80; f[38] = 0.52;          // sunColor
  f[40] = this.cam.vw; f[41] = this.cam.vh;         // res
  f[42] = this._time;
  f[43] = this.cam.zoom;
  f[44] = 0.0016;                                   // fogDensity
  f[45] = 1.15;                                     // exposure
  f[46] = 1.0;                                      // sunIntensity
  f[47] = 3.0;                                      // aoRadius
  f[48] = 0.55;                                     // aoIntensity
  this.device.queue.writeBuffer(this._frameBuffer, 0, f);
};

/* ── 附件尺寸 / 重建 RT ── */
OverworldGame._ensureSize = function () {
  if (!this._ctx) return;
  var w = Math.max(2, Math.floor(this.cam.vw * (this._dpr || 1)));
  var h = Math.max(2, Math.floor(this.cam.vh * (this._dpr || 1)));
  if (w === this._rtsW && h === this._rtsH) return;
  this._rtsW = w; this._rtsH = h;
  this._canvas.width = w; this._canvas.height = h;
  this._colorRT = this._rt('rgba16float', w, h);
  this._normalRT = this._rt('rgba8unorm', w, h);
  this._posRT = this._rt('rgba32float', w, h);
  this._depthRT = this.device.createTexture({ size: [w, h], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  this._aoRT = this.device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
  this._volRT = this._rt('rgba16float', w, h);
  // 缓存附件 View（避免每帧 createView 的分配/GC 开销）
  this._views = {
    color: this._colorRT.createView(), normal: this._normalRT.createView(), pos: this._posRT.createView(),
    depth: this._depthRT.createView(), vol: this._volRT.createView()
  };
  // 预计算 SSAO / 细节 compute 派发数
  this._ssaoDispatchW = Math.ceil(w / 8); this._ssaoDispatchH = Math.ceil(h / 8);
  // Bloom mip 链
  this._bloomRTs = [];
  var bw = w, bh = h;
  for (var i = 0; i < 4; i++) { bw = Math.max(4, bw >> 1); bh = Math.max(4, bh >> 1); this._bloomRTs.push(this._rt('rgba16float', bw, bh)); }
  this._buildPostBindGroups();
};
OverworldGame._rt = function (fmt, w, h) {
  return this.device.createTexture({ size: [w, h], format: fmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
};

/* ── 管线构建 ── */
OverworldGame._buildPipelines = function () {
  var d = this.device, sh = S, modConfig = { module: this._module };
  function module(src) { return d.createShaderModule({ code: src }); }
  var self = this;
  this._frameLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: 13, buffer: { type: 'uniform' } }] }); // vert(1)|frag(4)|compute(8)
  // 地形细节场布局：group(1) = 计算生成的细节纹理 + 采样器（顶点置换 + 法线锐化）
  this._detailLayout = d.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 1, texture: {} }, { binding: 1, visibility: 1, sampler: {} }] }); // vertex 采样
  this._detailWriteLayout = d.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 8, storageTexture: { format: 'rgba16float', access: 'write-only' } }] });
  // terrain（group(0)=frame，group(1)=细节场）
  this._pipeTerrain = d.createRenderPipeline({
    layout: d.createPipelineLayout({ bindGroupLayouts: [this._frameLayout, this._detailLayout] }),
    vertex: { module: module(sh.TERRAIN_VS), buffers: [{ arrayStride: 40, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x4' }, { shaderLocation: 2, offset: 28, format: 'float32x3' }] }] },
    fragment: { module: module(sh.TERRAIN_FS), targets: [this._fmt('rgba16float', null), this._fmt('rgba8unorm', null), this._fmt('rgba32float', null)] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
  });
  // deco
  this._pipeDeco = d.createRenderPipeline({
    layout: d.createPipelineLayout({ bindGroupLayouts: [this._frameLayout] }),
    vertex: { module: module(sh.DECO_VS), buffers: [
      { arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] },
      { arrayStride: 80, stepMode: 'instance', attributes: [
        { shaderLocation: 2, offset: 0, format: 'float32x3' }, { shaderLocation: 3, offset: 12, format: 'float32x3' },
        { shaderLocation: 4, offset: 24, format: 'float32x4' }, { shaderLocation: 5, offset: 40, format: 'float32x4' },
        { shaderLocation: 6, offset: 56, format: 'float32x4' }, { shaderLocation: 7, offset: 72, format: 'float32x4' }] }] },
    fragment: { module: module(sh.DECO_FS), targets: [
      this._fmt('rgba16float', { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }),
      this._fmt('rgba8unorm', null), this._fmt('rgba32float', null)] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
  });
  // 全屏后处理（vol / bright / blur / composite 共用顶点三角形）
  var fsLayout = d.createPipelineLayout({ bindGroupLayouts: [this._frameLayout, this._postLayout || this._mkFsLayout()] });
  this._pipeVol = d.createRenderPipeline({ layout: fsLayout, vertex: { module: module(sh.FULLSCREEN_VS) }, fragment: { module: module(sh.VOL_FS), targets: [this._fmt('rgba16float', null)] }, primitive: { topology: 'triangle-list', cullMode: 'none' } });
  this._pipeBright = d.createRenderPipeline({ layout: fsLayout, vertex: { module: module(sh.FULLSCREEN_VS) }, fragment: { module: module(sh.BRIGHT_FS), targets: [this._fmt('rgba16float', null)] }, primitive: { topology: 'triangle-list', cullMode: 'none' } });
  this._pipeBlur = d.createRenderPipeline({ layout: fsLayout, vertex: { module: module(sh.FULLSCREEN_VS) }, fragment: { module: module(sh.BLUR_FS), targets: [this._fmt('rgba16float', null)] }, primitive: { topology: 'triangle-list', cullMode: 'none' } });
  // 合成
  var compLayout = d.createPipelineLayout({ bindGroupLayouts: [this._frameLayout, this._compLayout || this._mkCompLayout()] });
  this._pipeComposite = d.createRenderPipeline({ layout: compLayout, vertex: { module: module(sh.FULLSCREEN_VS) }, fragment: { module: module(sh.COMPOSITE_FS), targets: [this._fmt(this.presentFormat, null)] }, primitive: { topology: 'triangle-list', cullMode: 'none' } });
  // SSAO compute
  this._ssaoLayout = this._mkSsaLayout();
  var ssaoPipeLayout = d.createPipelineLayout({ bindGroupLayouts: [this._frameLayout, this._ssaoLayout] });
  this._pipeSsa = d.createComputePipeline({ layout: ssaoPipeLayout, compute: { module: module(sh.SSAO_CS) } });
  // 地形细节场 compute（生成高频细节场，供地形顶点置换）
  this._pipeDetail = d.createComputePipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [this._detailWriteLayout] }), compute: { module: module(sh.TERRAIN_DETAIL_CS) } });
  // 实例几何
  var cube = makeCube();
  this._cubeVert = d.createBuffer({ size: cube.verts.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX });
  d.queue.writeBuffer(this._cubeVert, 0, cube.verts);
  this._cubeIdx = d.createBuffer({ size: cube.idx.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.INDEX });
  d.queue.writeBuffer(this._cubeIdx, 0, cube.idx);
  this._cubeIdxCount = cube.indexCount;
};

OverworldGame._fmt = function (format, blend) {
  return blend ? { format: format, blend: { color: { operation: 'add', srcFactor: blend.srcFactor, dstFactor: blend.dstFactor }, alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } } : { format: format };
};
// 全屏单一纹理 pass 的 bind group layout（src + sampler）
OverworldGame._mkFsLayout = function () {
  this._postLayout = this.device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 4, texture: {} }, { binding: 1, visibility: 4, sampler: {} }] });
  this._compLayout = this.device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 4, texture: {} }, { binding: 1, visibility: 4, texture: {} }, { binding: 2, visibility: 4, texture: {} },
    { binding: 3, visibility: 4, texture: {} }, { binding: 4, visibility: 4, texture: {} }, { binding: 5, visibility: 4, texture: {} },
    { binding: 6, visibility: 4, texture: {} }, { binding: 7, visibility: 4, sampler: {} }] });
  this._ssaLayout = this.device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 8, texture: {} }, { binding: 1, visibility: 8, texture: {} }, { binding: 2, visibility: 8, storageTexture: { format: 'rgba8unorm', access: 'write-only' } }] });
  return this._postLayout;
};
OverworldGame._mkCompLayout = function () { return this._compLayout; };
OverworldGame._mkSsaLayout = function () { return this._ssaLayout; };

// 上传世界几何（地形 + 装饰 + 分块）
OverworldGame._uploadWorld = function () {
  var d = this.device, wld = this._world;
  this._terrainVert = d.createBuffer({ size: wld.terrainVerts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  d.queue.writeBuffer(this._terrainVert, 0, wld.terrainVerts);
  this._terrainIdx = d.createBuffer({ size: wld.terrainIdx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  d.queue.writeBuffer(this._terrainIdx, 0, wld.terrainIdx);
  this._decoInst = d.createBuffer({ size: wld.decoInst.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  d.queue.writeBuffer(this._decoInst, 0, wld.decoInst);
  this._terrainChunks = wld.terrainChunks;
  this._decoChunks = wld.decoChunks;
  this._terrainChunkCount = wld.terrainChunkCount;
  this._decoChunkCount = wld.decoChunkCount;
  this._frameBuffer = d.createBuffer({ size: 208, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  this._frameBuf = new Float32Array(52);

  // 地形细节场：世界锚定纹理（1 纹元 = 1 格）+ 采样 bind group + 写入 bind group
  this._detailTex = d.createTexture({ size: [this.W, this.H], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
  this._detailBG = d.createBindGroup({ layout: this._detailLayout, entries: [
    { binding: 0, resource: this._detailTex.createView() }, { binding: 1, resource: this._sampler }] });
  this._detailWriteBG = d.createBindGroup({ layout: this._detailWriteLayout, entries: [
    { binding: 0, resource: this._detailTex.createView() }] });
  // 一次性 compute：GPU 并行生成高频细节场
  var enc = d.createCommandEncoder();
  var cp = enc.beginComputePass();
  cp.setPipeline(this._pipeDetail); cp.setBindGroup(0, this._detailWriteBG);
  cp.dispatchWorkgroups(Math.ceil(this.W / 8), Math.ceil(this.H / 8));
  cp.end();
  d.queue.submit([enc.finish()]);
};

/* ── 后处理 bind group（随 RT 重建而重建） ── */
OverworldGame._buildPostBindGroups = function () {
  var d = this.device, pass = this._fsPassBG = { base: {}, comp: {}, ssao: {} };
  // vol: posRT
  this._volBG = d.createBindGroup({ layout: this._postLayout, entries: [
    { binding: 0, resource: this._posRT.createView() }, { binding: 1, resource: this._sampler }] });
  // bright: colorRT
  this._brightBG = d.createBindGroup({ layout: this._postLayout, entries: [
    { binding: 0, resource: this._colorRT.createView() }, { binding: 1, resource: this._sampler }] });
  // composite
  this._compBG = d.createBindGroup({ layout: this._compLayout, entries: [
    { binding: 0, resource: this._colorRT.createView() }, { binding: 1, resource: this._aoRT.createView() },
    { binding: 2, resource: this._volRT.createView() }, { binding: 3, resource: this._bloomRTs[0].createView() },
    { binding: 4, resource: this._bloomRTs[1].createView() }, { binding: 5, resource: this._bloomRTs[2].createView() },
    { binding: 6, resource: this._bloomRTs[3].createView() }, { binding: 7, resource: this._sampler }] });
  // ssao
  this._ssaoBG = d.createBindGroup({ layout: this._ssaLayout, entries: [
    { binding: 0, resource: this._posRT.createView() }, { binding: 1, resource: this._normalRT.createView() },
    { binding: 2, resource: this._aoRT.createView() }] });
  // 预创建 Bloom 逐级模糊 bind group（跨帧复用，避免每帧 createBindGroup）
  this._blurBGs = [];
  for (var k = 1; k < 4; k++) {
    this._blurBGs[k] = d.createBindGroup({ layout: this._postLayout, entries: [
      { binding: 0, resource: this._bloomRTs[k - 1].createView() }, { binding: 1, resource: this._sampler }] });
  }
  this._frameBG = {}; // frame 绑定打进 bind group，见 _frameBind
  this._frameBG = d.createBindGroup({ layout: this._frameLayout, entries: [{ binding: 0, resource: { buffer: this._frameBuffer } }] });
};

// 可见分块范围（以玩家为中心的轴对齐盒，保守覆盖屏幕）
OverworldGame._visibleChunks = function () {
  var z = this.cam.zoom;
  var hx = Math.ceil((this.cam.vw / (2 * z)) / CELL / CHUNK) + 1;
  var hy = Math.ceil((this.cam.vh / (2 * z)) / CELL / CHUNK) + 1;
  var cxp = Math.floor(this.playerPos.x / CHUNK), cyp = Math.floor(this.playerPos.y / CHUNK);
  return { cx0: cxp - hx, cx1: cxp + hx, cy0: cyp - hy, cy1: cyp + hy };
};

/* ── 渲染主流程 ── */
OverworldGame._render = function () {
  var d = this.device, c = this.cam;
  this._updateView(); this._updateFrame();
  var vp = this._views.color, nv = this._views.normal, pv = this._views.pos;
  var dv = this._views.depth;
  var enc = d.createCommandEncoder();
  // 1) 几何 pass
  var rp = enc.beginRenderPass({ colorAttachments: [
    { view: vp, loadOp: 'clear', clearValue: [0.05, 0.06, 0.08, 1], storeOp: 'store' },
    { view: nv, loadOp: 'clear', clearValue: [0.5, 0.5, 1, 1], storeOp: 'store' },
    { view: pv, loadOp: 'clear', clearValue: [0, 0, 9999, 1], storeOp: 'store' }],
    depthStencilAttachment: { view: dv, depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'store' } });
  // 地形（顶点着色器采样 GPU 生成细节场做置换）
  var vis = this._visibleChunks();
  rp.setPipeline(this._pipeTerrain);
  rp.setBindGroup(0, this._frameBG);
  rp.setBindGroup(1, this._detailBG);
  rp.setVertexBuffer(0, this._terrainVert);
  rp.setIndexBuffer(this._terrainIdx, 'uint32');
  var tc = this._terrainChunks;
  for (var i = 0; i < this._terrainChunkCount; i++) {
    var cx = tc[i * 4], cy = tc[i * 4 + 1];
    if (cx < vis.cx0 || cx > vis.cx1 || cy < vis.cy0 || cy > vis.cy1) continue;
    rp.drawIndexed(tc[i * 4 + 3], 1, tc[i * 4 + 2], 0, 0);
  }
  // 装饰（实例化）
  rp.setPipeline(this._pipeDeco);
  rp.setVertexBuffer(0, this._cubeVert);
  rp.setVertexBuffer(1, this._decoInst);
  rp.setIndexBuffer(this._cubeIdx, 'uint32');
  var dc = this._decoChunks;
  for (var j = 0; j < this._decoChunkCount; j++) {
    var dx = dc[j * 4], dy = dc[j * 4 + 1];
    if (dx < vis.cx0 || dx > vis.cx1 || dy < vis.cy0 || dy > vis.cy1) continue;
    rp.drawIndexed(this._cubeIdxCount, dc[j * 4 + 3], 0, 0, dc[j * 4 + 2]);
  }
  rp.end();
  // 2) SSAO compute
  {
    var cp = enc.beginComputePass();
    cp.setPipeline(this._pipeSsa);
    cp.setBindGroup(0, this._frameBG);
    cp.setBindGroup(1, this._ssaoBG);
    cp.dispatchWorkgroups(this._ssaoDispatchW || Math.ceil(c.vw / 8), this._ssaoDispatchH || Math.ceil(c.vh / 8));
    cp.end();
  }
  // 3) 体积光
  var vr = this._views.vol;
  {
    var vpass = enc.beginRenderPass({ colorAttachments: [{ view: vr, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
    vpass.setPipeline(this._pipeVol); vpass.setBindGroup(0, this._frameBG); vpass.setBindGroup(1, this._volBG); vpass.draw(3); vpass.end();
  }
  // 4) Bloom: bright → m0；m0→m1→m2→m3 下采样
  {
    var b0 = this._bloomRTs[0].createView();
    var bp = enc.beginRenderPass({ colorAttachments: [{ view: b0, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
    bp.setPipeline(this._pipeBright); bp.setBindGroup(0, this._frameBG); bp.setBindGroup(1, this._brightBG); bp.draw(3); bp.end();
    for (var k = 1; k < 4; k++) {
      var bv = this._bloomRTs[k].createView();
      var lbp = enc.beginRenderPass({ colorAttachments: [{ view: bv, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
      lbp.setPipeline(this._pipeBlur); lbp.setBindGroup(0, this._frameBG); lbp.setBindGroup(1, this._blurBGs[k]); lbp.draw(3); lbp.end();
    }
  }
  // 5) 合成 → swapchain
  var cur = this._ctx.getCurrentTexture();
  {
    var sp = enc.beginRenderPass({ colorAttachments: [{ view: cur.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
    sp.setPipeline(this._pipeComposite); sp.setBindGroup(0, this._frameBG); sp.setBindGroup(1, this._compBG); sp.draw(3); sp.end();
  }
  d.queue.submit([enc.finish()]);
};

/* ── 覆盖层（玩家/POI/告示牌/引导） ── */
OverworldGame._makeOverlay = function () {
  var ov = document.createElement('div');
  ov.className = 'wgpu-overlay';
  ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  this._canvas.parentNode.appendChild(ov);
  this.overlayEl = ov;
  this._buildPlayer();
};

OverworldGame._buildPlayer = function () {
  var pd = document.createElement('div');
  pd.className = 'player-marker';
  pd.innerHTML = '<span class="player-shade"></span><span class="player-avatar">☯</span>';
  this.overlayEl.appendChild(pd);
  this.playerEl = pd;
  this.facing = 1; this.moving = false; this.walkPhase = 0;
};

OverworldGame._buildPoisOverlay = function () {
  var self = this;
  this.pois = [];
  (this.ow.pois || []).forEach(function (p) {
    if (p.type === 'spawn') return;
    var marker = { poi: p, emoji: null, billboard: null, badge: null };
    if (p.type === 'billboard') {
      marker.billboard = self._buildBillboard(p);
    } else {
      var em = document.createElement('div');
      em.className = 'poi-emoji' + (p.type === 'realm' ? ' realm' : ' npc');
      em.style.fontSize = (CELL * 1.15) + 'px';
      em.style.lineHeight = '1';
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
};

OverworldGame._buildBillboard = function (p) {
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
  (this.billboards = this.billboards || []).push({
    id: p.id || 'billboard', el: bb,
    enlight: bb.querySelector('[data-k="enlight"]'), corrupt: bb.querySelector('[data-k="corrupt"]'),
    prayer: bb.querySelector('[data-k="prayer"]'), frags: bb.querySelector('[data-k="frags"]')
  });
  this._refreshBillboard();
  return bb;
};

OverworldGame._refreshBillboard = function () {
  if (!this.billboards) return;
  var s = this.samsara || {}, ra = s.alignment || {}, frags = s.memory_fragments || {};
  this.billboards.forEach(function (b) {
    if (b.enlight) b.enlight.textContent = ra.enlightenment || 0;
    if (b.corrupt) b.corrupt.textContent = ra.corruption || 0;
    if (b.prayer) b.prayer.textContent = s.prayer_count || 0;
    if (b.frags) b.frags.textContent = ((frags.unlocked_count || 0) + ' / ' + (frags.total || 6));
  });
};

OverworldGame._syncBadges = function (realmProgress) {
  var self = this;
  (this.badgePool || []).forEach(function (b) {
    var rp = (realmProgress && realmProgress[b.realm]) || {};
    var total = self._levelTotals && self._levelTotals[b.realm] !== undefined ? self._levelTotals[b.realm] : 5;
    var passed = rp.levels_passed || 0;
    b.done = !!rp.completed;
    b.text.textContent = b.done ? ('✓ 已通关') : (passed + ' / ' + total);
    b.text.style.color = b.done ? '#0a9396' : '#f4c542';
    b.el.classList.toggle('realm-done', !!b.done);
  }, this);
};

// 逐帧：用与 GPU 相同的投影放置 DOM 覆盖元素
OverworldGame._updateOverlay = function () {
  if (!this.overlayEl) return;
  var self = this, z = this.cam.zoom;
  // 玩家
  var pp = this.project(this.playerPos.x * CELL, this.playerPos.y * CELL, 0);
  var pe = this.playerEl, av = pe.querySelector('.player-avatar');
  av.style.left = (pp.x - 23).toFixed(1) + 'px';
  av.style.top = (pp.y - 44).toFixed(1) + 'px';
  av.style.transform = (this.facing < 0 ? 'scaleX(-1) ' : '') +
    (this.moving ? 'translateY(' + (Math.abs(Math.sin(this.walkPhase)) * -6).toFixed(1) + 'px)' : '');
  // POI（用与 GPU 相同的投影放置）
  this.pois.forEach(function (m) {
    var wpos = self.project(m.poi.x * CELL, m.poi.y * CELL, 0);
    var sx = z / 1.6;
    if (!wpos.on || wpos.x < -120 || wpos.x > self.cam.vw + 120 || wpos.y < -160 || wpos.y > self.cam.vh + 160) {
      if (m.emoji) m.emoji.style.display = 'none';
      if (m.billboard) m.billboard.style.display = 'none';
      if (m.badgeEl) m.badgeEl.style.display = 'none';
      return;
    }
    if (m.emoji) {
      m.emoji.style.display = '';
      m.emoji.style.left = (wpos.x - CELL * 0.9 * sx).toFixed(1) + 'px';
      m.emoji.style.top = (wpos.y - CELL * 1.35 * sx).toFixed(1) + 'px';
    }
    if (m.badgeEl) {
      m.badgeEl.style.display = '';
      m.badgeEl.style.left = (wpos.x - CELL * 0.9 * sx).toFixed(1) + 'px';
      m.badgeEl.style.top = (wpos.y - CELL * 2.05 * sx).toFixed(1) + 'px';
    }
    if (m.billboard) {
      m.billboard.style.display = '';
      m.billboard.style.left = (wpos.x - CELL * 2.05 * sx).toFixed(1) + 'px';
      m.billboard.style.top = (wpos.y - CELL * 3.2 * sx).toFixed(1) + 'px';
    }
  });
};

/* ── 小地图 ── */
OverworldGame._minimapColor = function (x, y) {
  var fl = this.flags[y * this.W + x];
  if (fl & 1) return [0x1E, 0x6A, 0x96];
  if (fl & 2) return [0xC9, 0xB3, 0x7E];
  var rid = this.biome[y * this.W + x];
  var c = BIOME_C[rid] ? BIOME_C[rid] : [0x5f, 0x9e, 0x4e];
  return c;
};
OverworldGame.initMinimap = function () {
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
  // 入口标点
  var poisEl = document.getElementById('minimap-pois');
  if (!poisEl) return;
  poisEl.innerHTML = '';
  this.minimapPois = {};
  var self = this;
  (this.pois || []).forEach(function (m) {
    var p = m.poi;
    if (!p) return;
    var div = document.createElement('div');
    div.className = 'minimap-poi';
    div.style.left = ((p.x + 0.5) / W * 100) + '%';
    div.style.top = ((p.y + 0.5) / H * 100) + '%';
    if (p.label) div.setAttribute('title', p.label);
    poisEl.appendChild(div);
    self.minimapPois[p.id] = { div: div, base: p.emoji };
    if (self._isExplored(p.id)) { div.classList.add('explored'); div.textContent = p.emoji; }
    else { div.classList.add('unexplored'); div.textContent = '❓'; }
  });
  this._refreshMinimapPlayer();
};
OverworldGame._refreshMinimapPlayer = function () {
  var p = document.getElementById('minimap-player');
  if (!p || !this.playerPos || !this.W) return;
  p.style.left = (this.playerPos.x / this.W * 100) + '%';
  p.style.top = (this.playerPos.y / this.H * 100) + '%';
};
OverworldGame._isExplored = function (poiId) {
  try { var raw = localStorage.getItem(EXPLORED_KEY); var arr = raw ? JSON.parse(raw) : []; return arr.indexOf(poiId) >= 0; } catch (e) { return false; }
};
OverworldGame._markExplored = function (poiId) {
  if (!poiId) return;
  try { var raw = localStorage.getItem(EXPLORED_KEY); var arr = raw ? JSON.parse(raw) : []; if (arr.indexOf(poiId) < 0) { arr.push(poiId); localStorage.setItem(EXPLORED_KEY, JSON.stringify(arr)); } } catch (e) { }
  var rec = this.minimapPois && this.minimapPois[poiId];
  if (rec) { rec.div.classList.add('explored'); rec.div.classList.remove('unexplored'); rec.div.textContent = rec.base; }
};
OverworldGame._fetchGamesAndState = function () {
  var self = this;
  self.games = [];
  fetch('/api/games').then(function (r) { return r.json(); }).then(function (g) { self.games = g || []; if (UI) UI.setGames(self.games); }).catch(function () { });
  self.refreshSamsara();
};

/* ── 玩家移动 / 碰撞 / 交互 / 引导（与 DOM 版本同算法） ── */
OverworldGame.step = function (dt) {
  if (!this.playerPos) return;
  var paused = !!(UI && UI.isModalOpen());
  var keys = this.keys || {};
  var sx = 0, sy = 0;
  if (!paused) {
    if (keys['a']) sx -= 1; if (keys['d']) sx += 1;
    if (keys['w']) sy -= 1; if (keys['s']) sy += 1;
  }
  if (sx !== 0 || sy !== 0) {
    var inv = Math.hypot(sx, sy);
    this.moving = true;
    if (sx !== 0) this.facing = sx > 0 ? 1 : -1;
    var spd = this.playerSpeed * dt;
    var sdx = (sx / inv) * spd, sdy = (sy / inv) * spd;
    var dA = sdx / 0.7071, dB = sdy / 0.3536;
    this._moveAxis((dA + dB) / 2, (dB - dA) / 2);
  } else this.moving = false;
  if (this.moving) this.walkPhase += 0.6;
  this._refreshMinimapPlayer();
  if (!paused) this._updateInteraction();
  if (!paused) this._updateRealmGuide();
  if (!paused && this.ePressed) { this._onInteract(); this.ePressed = false; }
};
OverworldGame._moveAxis = function (mx, my) {
  var nx = this.playerPos.x + mx;
  if (!this._willCollide(nx, this.playerPos.y)) this.playerPos.x = nx;
  var ny = this.playerPos.y + my;
  if (!this._willCollide(this.playerPos.x, ny)) this.playerPos.y = ny;
};
OverworldGame._willCollide = function (gx, gy) {
  var r = 0.28;
  return this._isBarrier(Math.floor(gx - r), Math.floor(gy - r)) ||
         this._isBarrier(Math.floor(gx + r), Math.floor(gy - r)) ||
         this._isBarrier(Math.floor(gx - r), Math.floor(gy + r)) ||
         this._isBarrier(Math.floor(gx + r), Math.floor(gy + r));
};
OverworldGame._isBarrier = function (tx, ty) {
  if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return true;
  return !!(this.flags && (this.flags[ty * this.W + tx] & 8));
};
OverworldGame._updateInteraction = function () {
  var self = this, reach = 3.2, closest = null, minD = reach + 1;
  this.pois.forEach(function (m) {
    var d = Math.hypot(m.poi.x - self.playerPos.x, m.poi.y - self.playerPos.y);
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
};
OverworldGame._updateRealmGuide = function () {
  if (!UI || !UI.setRealmGuide || !this.pois) return;
  var self = this, best = null, bestD = Infinity;
  this.pois.forEach(function (m) {
    if (m.poi.type !== 'realm') return;
    var d = Math.max(Math.abs((m.poi.x + 0.5) - self.playerPos.x), Math.abs((m.poi.y + 0.5) - self.playerPos.y));
    if (d < bestD) { bestD = d; best = m; }
  });
  if (this.closestPoi && this.closestPoi.poi.type === 'realm') { UI.setRealmGuide(null); return; }
  if (!best) { UI.setRealmGuide(null); return; }
  var ppA = this.project(this.playerPos.x * CELL, this.playerPos.y * CELL, 0);
  var ep = this.project(best.poi.x * CELL, best.poi.y * CELL, 0);
  var deg = Math.round(Math.atan2(ep.y - ppA.y, ep.x - ppA.x) * 180 / Math.PI);
  UI.setRealmGuide({ name: REALM_NAMES[best.poi.realm] || best.poi.realm, dist: Math.round(bestD), arrow: '➤', angle: deg });
};
OverworldGame._onInteract = function () {
  var entry = this.closestPoi;
  if (!entry || !UI) return;
  if (entry.poi.type === 'realm') { this._markExplored(entry.poi.id); UI.openRealmSelect(entry.poi.realm); }
  else if (entry.poi.type === 'sandbox') { this._markExplored(entry.poi.id); location.href = '/sandbox?r=' + Date.now(); }
  else if (entry.poi.type === 'npc') { this._markExplored(entry.poi.id); UI.openSkillTree(); }
  else if (entry.poi.type === 'billboard') { this._markExplored(entry.poi.id); UI.openRpgStats(); }
  else if (entry.poi.type === 'achievements') { this._markExplored(entry.poi.id); UI.openAchievements(); }
  else if (entry.poi.type === 'spawn') { if (UI.toast) UI.toast('生灭台：这里是旅途的起点。'); }
};

OverworldGame.bindInput = function () {
  var self = this;
  this.keys = {};
  window.addEventListener('keydown', function (e) {
    var k = e.key, lk = k.toLowerCase();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(k) >= 0) e.preventDefault();
    if (lk === 'e') self.ePressed = true;
    self.keys[lk] = true;
    if (k === '+' || k === '=') self.zoomBy(1.35);
    else if (k === '-' || k === '_') self.zoomBy(1 / 1.35);
  });
  window.addEventListener('keyup', function (e) { self.keys[e.key.toLowerCase()] = false; });
  window.addEventListener('wheel', function (e) {
    if (UI && UI.isModalOpen()) return;
    if (e.deltaY > 0) self.zoomBy(1 / 1.18); else if (e.deltaY < 0) self.zoomBy(1.18);
    e.preventDefault();
  }, { passive: false });
};

OverworldGame.zoomBy = function (f) {
  if (!this.cam) return;
  this.cam.zoom = Math.max(0.5, Math.min(4.2, this.cam.zoom * f));
  this._updateView(); this._updateFrame();
};

OverworldGame.focusRealm = function (realm) {
  if (!realm || !this.pois) return;
  var target = null;
  this.pois.forEach(function (m) { if (!target && m.poi.type === 'realm' && m.poi.realm === realm) target = m; });
  if (!target) return;
  if (target.emoji) { target.emoji.classList.add('realm-focus'); setTimeout(function () { target.emoji.classList.remove('realm-focus'); }, 1600); }
};

// 组装场景（在 GPU 就绪后）
OverworldGame.buildScene = function () {
  var self = this;
  this._fetchGamesAndState();
  this._ready.then(function () {
    if (UI) UI.setLoadingProgress(82);
    self._buildPoisOverlay();
    self.initMinimap(); // POI 就绪后重建小地图标点
  }).catch(function () { });
  this._ready.then(function () {
    setTimeout(function () { if (UI) UI.setLoadingProgress(100); if (UI) UI.removeLoading(); }, 1200);
  });
};

OverworldGame.start = function () {
  var self = this;
  this.setupCamera();
  this.bindInput();
  this._dpr = Math.min(2, window.devicePixelRatio || 1);
  this._time = 0;
  var last = performance.now(), lastOverlay = 0;
  this._ready.then(function () {
    self._frameCB = 0;
    (function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      self._time += dt;
      self.step(dt);
      if (self.device && self._ctx) {
        self._updateView(); self._frameCB++;
        self._render();
        self._updateOverlay();
      }
      requestAnimationFrame(loop);
    })(performance.now());
  }).catch(function () { });
  this.startPolling();
};

/* ── 引导 ── */
function wgpuBoot() {
  var game = window.OverworldGame = OverworldGame;
  if (window.OverworldUI) { window.OverworldUI.init(game); UI = window.OverworldUI; }
  if (UI) UI.showLoading();
  // 补 WGPU overlay 样式
  injectStyles();
  fetch('/api/overworld/config').then(function (r) { return r.json(); }).then(function (ow) {
    if (!ow || !ow.world) { if (UI) UI.showError('大陆配置加载失败，请重试'); return; }
    if (UI) UI.setLoadingProgress(30);
    game.bootstrapGeometry(ow);
    var backRealm = (function () { try { return new URLSearchParams(location.search).get('backrealm'); } catch (e) { return null; } })();
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (UI) UI.setLoadingProgress(78);
      game.buildScene();
      game.initMinimap();
      game.start();
    }); });
    if (UI) UI.refreshHUD();
  }).catch(function () { if (UI) UI.showError('大陆配置加载失败，请重试'); });
}
function injectStyles() {
  if (document.getElementById('wgpu-styles')) return;
  var st = document.createElement('style'); st.id = 'wgpu-styles';
  st.textContent = '.wgpu-overlay .poi-emoji{position:absolute;text-align:center;filter:drop-shadow(0 5px 6px rgba(0,0,0,0.6));}' +
    '.wgpu-overlay .poi-emoji.realm{animation:realmPulse 2.2s ease-in-out infinite;}' +
    '.wgpu-overlay .poi-emoji.active{animation:none;filter:drop-shadow(0 0 12px #fff) drop-shadow(0 0 6px rgba(255,255,255,0.9));}' +
    '.wgpu-overlay .realm-badge{position:absolute;color:#d4af37;font-size:15px;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,0.85);}' +
    '.wgpu-overlay .realm-badge.realm-done{color:#0d7377;}' +
    '.wgpu-overlay .player-marker{position:absolute;width:0;height:0;}' +
    '.wgpu-overlay .player-shade{position:absolute;left:-20px;top:-10px;width:40px;height:12px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,0.5),rgba(0,0,0,0) 70%);}' +
    '.wgpu-overlay .player-avatar{position:absolute;left:-23px;top:-44px;width:46px;height:46px;display:flex;align-items:center;justify-content:center;font-size:30px;line-height:1;color:#ffe08a;background:radial-gradient(circle,rgba(212,175,55,0.32),rgba(15,15,22,0.62) 72%);border:2px solid rgba(255,224,138,0.9);border-radius:50%;box-shadow:0 5px 16px rgba(0,0,0,0.6),0 0 20px rgba(212,175,55,0.45);transform-origin:50% 100%;animation:playerFloat 2.4s ease-in-out infinite;}' +
    '@keyframes realmPulse{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes playerFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}' +
    '.wgpu-overlay .ow-billboard{position:absolute;transform:scale(0.66);transform-origin:center bottom;pointer-events:none;}' +
    '.wgpu-overlay .ow-billboard .bb-post{position:relative;background:linear-gradient(180deg,rgba(120,74,28,.96),rgba(90,55,20,.96) 70%,rgba(60,36,14,.96));border:2px solid #c9a35c;border-radius:6px;box-shadow:inset 0 0 24px rgba(0,0,0,0.5);width:188px;min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:14px 12px;text-align:center;color:#f7ecd0;box-sizing:border-box;}' +
    '.wgpu-overlay .bb-title{font-family:var(--font-display);font-size:24px;color:#d4af37;letter-spacing:.12em;margin:4px 0 2px;text-shadow:0 2px 4px rgba(0,0,0,.7);}' +
    '.wgpu-overlay .bb-sub{font-size:11px;letter-spacing:.28em;color:#d8c9a4;margin-bottom:8px;}' +
    '.wgpu-overlay .bb-line{width:80%;height:1px;background:rgba(212,175,55,.4);margin:8px 0;}' +
    '.wgpu-overlay .bb-rows{width:100%;font-size:12px;line-height:1.6;}' +
    '.wgpu-overlay .bb-row{display:flex;justify-content:space-between;gap:8px;color:#eaddc3;padding:2px;}' +
    '.wgpu-overlay .bb-row b{color:#d4af37;font-family:var(--font-tech);}' +
    '.wgpu-overlay .bb-legend{font-size:10px;color:#bfa97e;margin-top:8px;letter-spacing:.06em;}' +
    '.wgpu-overlay .bb-pole{width:12px;height:40px;background:linear-gradient(90deg,#4c3318,#6e4a24,#4c3318);}' +
    '.wgpu-overlay .bb-base{width:66px;height:10px;border-radius:3px;background:linear-gradient(90deg,#4c3318,#6e4a24,#4c3318);}';
  document.head.appendChild(st);
  var lit = document.getElementById('iso-lighting'); if (lit) lit.style.display = 'none'; // 着色器已含暗角
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wgpuBoot);
else wgpuBoot();

window.OverworldGame = OverworldGame;