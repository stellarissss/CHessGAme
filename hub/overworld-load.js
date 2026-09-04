/* ═══════════════════════════════════════════════════════════════
   大地图渲染器能力分发器
   强制使用 WebGPU（次世代渲染），不做 iso-engine 回退。
   提供：
     - 渲染器角标（提示玩家当前用的是 WebGPU 渲染）
     - loadIng 遮罩兜底：WebGPU 就绪若悬挂，最多 N 秒强制移除加载遮罩，避免盖住 HUD/按钮
     - window.__owFallbackToIso：供 overworld-wgpu.js 在运行时适配器/设备失败时调用，
       失败时仅提示错误，绝不降级到兼容渲染
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

  function loadWgpu() {
    setBadge('渲染：次世代 · WebGPU');
    return import('/static/overworld-wgpu.js');
  }

  var _upgradedToBrowser = false;

  /* 若运行在 pywebview 桌面窗口且内核没有 WebGPU（如 WebKitGTK / 旧 WKWebView）：
     调用桌面桥接打开系统浏览器（Chromium 必支持 WebGPU），保证玩家仍能使用 WebGPU 渲染。 */
  function maybeEscalateToBrowser() {
    try {
      if (typeof navigator !== 'undefined' && navigator.gpu) return false;
      var pw = window.pywebview;
      if (!pw || !pw.api || typeof pw.api.webgpuUnavailable !== 'function') return false;
      pw.api.webgpuUnavailable();
      _upgradedToBrowser = true;
      setBadge('窗口内核不支持 WebGPU · 已为你打开系统浏览器');
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 把 WebGPU 初始化失败原因转成可读诊断，便于玩家/开发者定位（独立窗口为何没 WebGPU）。 */
  function describeGpuIssue(reason) {
    var r = String(reason || '');
    if (r.indexOf('no WebGPU') !== -1 || r.indexOf('navigator.gpu') !== -1) {
      return '当前窗口/浏览器引擎不提供 WebGPU（navigator.gpu 缺失，需 Chromium 系内核）。';
    }
    if (r.indexOf('no adapter') !== -1) {
      return 'GPU 适配器获取失败（requestAdapter 返回空，可能被浏览器禁用或硬件拦截）。';
    }
    return 'WebGPU 设备初始化失败：' + (r || '未知原因') + '。';
  }

  /* 强制使用 WebGPU，不做 iso-engine 回退。
     （供 overworld-wgpu.js 在适配器/设备初始化失败时调用。）
     失败时仅移除加载遮罩并提示错误，不再降级到兼容渲染。 */
  window.__owFallbackToIso = function (reason) {
    console.error('[overworld] WebGPU 初始化失败（已禁用 iso 回退）：', reason || '');
    var UIw = window.OverworldUI;
    if (UIw) {
      if (typeof UIw.removeLoading === 'function') UIw.removeLoading();
      if (typeof UIw.showError === 'function') {
        var msg = _upgradedToBrowser
          ? '当前窗口内核不支持 WebGPU，已在系统浏览器中打开游戏。请切换到已打开的浏览器窗口继续。'
          : 'WebGPU 渲染初始化失败。' + describeGpuIssue(reason) + ' 请确认窗口内核为 Chromium（Windows WebView2 / Linux·macOS QtWebEngine）且浏览器已开启 WebGPU 后刷新重试。';
        UIw.showError(msg);
      }
    }
    return Promise.resolve(null);
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

  // 强制使用 WebGPU：无论 navigator.gpu 是否可用都加载 wgpu 模块，
  // 适配器/设备初始化失败时由 __owFallbackToIso 提示错误，绝不降级 iso-engine。
  maybeEscalateToBrowser();
  loadWgpu().catch(function (err) {
    console.error('[overworld] WebGPU 模块加载失败：', err);
    window.__owFallbackToIso(err);
  });
})();