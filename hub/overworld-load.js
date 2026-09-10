/* ═══════════════════════════════════════════════════════════════
   大地图渲染器能力分发器
   使用 melonJS v20（resolveRenderer 以 WebGL 优先，Canvas2D 自动兜底，黑屏不可能）。
   提供：
     - 渲染器角标（渲染：melonJS · WebGL / melonJS · Canvas2D）
     - loading 遮罩兜底：melonJS 就绪若悬挂，最多 N 秒强制移除加载遮罩
     - window.__owFallbackToIso：供渲染模块在异常时报错（melonJS 自身已自动降级 Canvas）
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function ensureBadge() {
    var b = document.getElementById('renderer-badge');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'renderer-badge';
    b.style.cssText = 'position:fixed;left:12px;top:8px;z-index:120;pointer-events:none;' +
      'font:11px "Noto Serif SC",serif;color:#8f8a7d;letter-spacing:.06em;opacity:.8;' +
      'text-shadow:0 1px 3px rgba(0,0,0,.8);user-select:none;';
    document.body.appendChild(b);
    return b;
  }
  function setBadge(text) {
    try { ensureBadge().textContent = text; } catch (e) {}
  }

  /* 把初始化失败原因转成可读诊断（melonJS 通常不会走到这一步）。 */
  function describeIssue(reason) {
    var r = String(reason || '');
    if (r.indexOf('WebGL') !== -1) return r;
    return 'melonJS 初始化失败：' + (r || '未知原因') + '。';
  }

  /* 供渲染模块在意外初始化失败时调用：移除 loading 并给出可读错误。 */
  window.__owFallbackToIso = function (reason) {
    console.error('[melonjs] 大地图初始化失败：', reason || '');
    var UIw = window.OverworldUI;
    if (UIw) {
      if (typeof UIw.removeLoading === 'function') UIw.removeLoading();
      if (typeof UIw.showError === 'function') UIw.showError(describeIssue(reason));
    }
    return Promise.resolve(null);
  };

  // 加载遮罩兜底：若 melonJS 就绪 promise 悬挂导致 loading 未移除，最多 12s 强制移除
  setTimeout(function () {
    try {
      var ov = document.getElementById('loading-overlay');
      if (ov && !/\bhidden\b/.test(ov.className)) {
        ov.classList.add('hidden');
        var UIw = window.OverworldUI;
        if (UIw && typeof UIw.removeLoading === 'function') UIw.removeLoading();
      }
    } catch (e) {}
  }, 12000);

  // 先加载 melonJS，再加载并引导渲染模块（渲染模块自带幂等 boot）
  Promise.resolve().then(function () {
    return import('/static/vendor/melonjs/index.js');
  }).then(function () {
    setBadge('渲染：melonJS · 加载中…');
    return import('/static/overworld-melonjs.js');
  }).then(function () {
    // 渲染模块加载后会自动 melonBoot()，这里在下一宏任务回填角标（此时 renderer 已确定）
    setTimeout(function () {
      try {
        var g = window.OverworldGame;
        var r = g && g.renderer;
        var isGL = r && typeof r.isWebGL === 'function' ? r.isWebGL() : (r && r.constructor && /WebGL/i.test(r.constructor.name));
        setBadge(isGL ? '渲染：melonJS · WebGL' : '渲染：melonJS · 内置画布');
      } catch (e) { setBadge('渲染：melonJS'); }
    }, 1200);
  }).catch(function (err) {
    console.error('[melonjs] 模块加载失败：', err);
    window.__owFallbackToIso(err);
  });
})();