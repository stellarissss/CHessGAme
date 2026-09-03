/* ═══════════════════════════════════════════════════════════════
   大地图渲染器能力分发器
   优先 WebGPU（次世代渲染），无 WebGPU 或加载失败自动回退到 iso-engine(DOM)。
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function loadIso() { return import('/static/overworld-iso.js'); }
  function loadWgpu() { return import('/static/overworld-wgpu.js'); }

  var useWebGPU = !!(navigator.gpu && navigator.gpu.requestAdapter);
  var p = useWebGPU ? loadWgpu() : loadIso();
  p.catch(function (err) {
    console.warn('[overworld] WebGPU 渲染加载失败，回退到 iso-engine。', err);
    return loadIso();
  });
})();