/* ═══════════════════════════════════════════════════════════════
   地图编辑器 · 几何工具
   把“逐格(pixel) 布尔网格”压缩成最少的矩形列表 [x0,y0,x1,y1]，
   以生成 overworld.json 里可被游戏 _fillRectGrid 直接消费的 rect。
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';

    // 像素布尔网格 → 矩形列表（横向游程 + 竖向合并，用 visited 标记避免迁移遍历破坏）
    function gridToRects(grid, W, H) {
        var runs = [];    // runs[y] = [ [x0,x1], ... ] 该行横向连续段
        var consumed = []; // consumed[y] = [false,...]
        for (var y = 0; y < H; y++) {
            var rowRuns = [], row = grid[y], x = 0;
            while (x < W) {
                if (row && row[x]) {
                    var x0 = x;
                    while (x < W && row[x]) x++;
                    rowRuns.push([x0, x - 1]);
                } else {
                    x++;
                }
            }
            runs.push(rowRuns);
            consumed.push(rowRuns.map(function () { return false; }));
        }

        var rects = [];
        for (var yy = 0; yy < H; yy++) {
            for (var ii = 0; ii < runs[yy].length; ii++) {
                if (consumed[yy][ii]) continue;
                var run = runs[yy][ii], x0 = run[0], x1 = run[1];
                var h = 1, down = yy + 1;
                while (down < H) {
                    var di = findRun(runs[down], consumed[down], x0, x1);
                    if (di < 0) break;
                    consumed[down][di] = true;
                    h++; down++;
                }
                consumed[yy][ii] = true;
                rects.push([x0, yy, x1, yy + h - 1]);
            }
        }
        return rects;
    }
    function findRun(rowRuns, rowConsumed, x0, x1) {
        for (var k = 0; k < rowRuns.length; k++) {
            if (!rowConsumed[k] && rowRuns[k][0] === x0 && rowRuns[k][1] === x1) return k;
        }
        return -1;
    }

    // 矩形列表应用到布尔网格
    function fillRects(grid, rects, W, H) {
        (rects || []).forEach(function (it) {
            // 支持 ["rect", name, x0,y0,x1,y1] 与裸 [x0,y0,x1,y1]
            var arr = Array.isArray(it) && it.length >= 4 && typeof it[0] === 'number' ? it : it.slice(2);
            var x0 = arr[0], y0 = arr[1], x1 = arr[2], y1 = arr[3];
            if (x0 > x1) { var t = x0; x0 = x1; x1 = t; }
            if (y0 > y1) { var s = y0; y0 = y1; y1 = s; }
            for (var y = y0; y <= y1 && y < H; y++) {
                if (y < 0) continue;
                for (var x = x0; x <= x1 && x < W; x++) {
                    if (x >= 0 && grid[y]) grid[y][x] = true;
                }
            }
        });
    }

    // 洪水填充：从 (sx,sy) 开始，把符合 pred 的同连通区改成 set 值，返回改动格子数
    function floodFill(W, H, sx, sy, pred, set) {
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) return 0;
        var stack = [[sx, sy]];
        var seen = {};
        var count = 0;
        while (stack.length) {
            var p = stack.pop();
            var key = p[0] + ',' + p[1];
            if (seen[key]) continue;
            seen[key] = true;
            if (!pred(p[0], p[1])) continue;
            set(p[0], p[1]);
            count++;
            if (p[0] > 0) stack.push([p[0] - 1, p[1]]);
            if (p[0] < W - 1) stack.push([p[0] + 1, p[1]]);
            if (p[1] > 0) stack.push([p[0], p[1] - 1]);
            if (p[1] < H - 1) stack.push([p[0], p[1] + 1]);
        }
        return count;
    }

    global.Geom = {
        gridToRects: gridToRects,
        fillRects: fillRects,
        floodFill: floodFill
    };
})(window);