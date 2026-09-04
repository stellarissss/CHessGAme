/* ═══════════════════════════════════════════════════════════════
   大地图渲染器能力分发器
   优先 WebGPU（次世代渲染），无 WebGPU 或初始化失败自动回退到 iso-engine(DOM)。
   提供：
     - 渲染器角标（提示玩家当前用的是 WebGPU 还是兼容渲染，便于区分"没变化"是否因回退）
     - loadIng 遮罩兜底：WebGPU 就绪若悬挂，最多 N 秒强制移除加载遮罩，避免盖住 HUD/按钮
     - window.__owFallbackToIso：供 overworld-wgpu.js 在运行时适配器/设备失败时调用
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

  function loadIso() {
    setBadge('渲染：兼容 · iso-engine');
    return import('/static/overworld-iso.js');
  }
  function loadWgpu() {
    setBadge('渲染：次世代 · WebGPU');
    return import('/static/overworld-wgpu.js');
  }

  /* 运行时回退到兼容渲染（供 overworld-wgpu.js 在适配器/设备初始化失败时调用）。
     加了幂等保护：只触发一次，避免 wgpu 与 iso 双重初始化。 */
  window.__owFallbackToIso = function (reason) {
    if (window.__owIsoTried) return Promise.resolve();
    window.__owIsoTried = true;
    console.warn('[overworld] WebGPU 不可用，回退到兼容渲染：', reason || '');
    return loadIso();
  };

  // 加载遮罩兜底：若 WebGPU 就绪 promise 悬挂导致加载遮罩未移除，最多 12s 强制移除，
  // 确保 HUD（大陆总览/技能树等按钮）不一直被全屏 loading 覆盖。
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

  var useWebGPU = !!(navigator.gpu && navigator.gpu.requestAdapter);
  if (!useWebGPU) {
    window.__owFallbackToIso('无 WebGPU 支持（navigator.gpu 缺失）');
    return;
  }
  loadWgpu().catch(function (err) {
    console.warn('[overworld] WebGPU 模块加载失败，回退到 iso-engine。', err);
    window.__owFallbackToIso(err);
  });
})();