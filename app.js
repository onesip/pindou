(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    file: null,
    image: null,
    rotation: 0,
    sourceCanvas: null,
    crop: { l: 0, r: 1, t: 0, b: 1 },
    cellBox: null,
    rows: null,
    cols: null,
    cells: [],
    selectedCode: null,
    selectedCell: null,
    done: new Set(),
    worker: null,
    imageName: '',
    mode: 'pan',
    view: { fit: 1, zoom: 1, tx: 0, ty: 0 },
    pointers: new Map(),
    gesture: null,
    selection: null
  };

  const els = {
    photoInput: $('photoInput'), cameraInput: $('cameraInput'), pasteBtn: $('pasteBtn'), dropZone: $('dropZone'), uploadError: $('uploadError'),
    sourceSection: $('sourceSection'), workSection: $('workSection'), sourceViewport: $('sourceViewport'), sourceStage: $('sourceStage'), sourceCanvas: $('sourceCanvas'),
    cropOverlay: $('cropOverlay'), cellOverlay: $('cellOverlay'), imageMeta: $('imageMeta'),
    rotateLeftBtn: $('rotateLeftBtn'), rotateRightBtn: $('rotateRightBtn'),
    panModeBtn: $('panModeBtn'), cropModeBtn: $('cropModeBtn'), cellModeBtn: $('cellModeBtn'), interactionHint: $('interactionHint'),
    sourceZoom: $('sourceZoom'), sourceZoomValue: $('sourceZoomValue'), zoomInBtn: $('zoomInBtn'), zoomOutBtn: $('zoomOutBtn'), fitBtn: $('fitBtn'),
    cropInfo: $('cropInfo'), cellInfo: $('cellInfo'), gridGuess: $('gridGuess'), clearCropBtn: $('clearCropBtn'), clearCellBtn: $('clearCellBtn'), applyCellBtn: $('applyCellBtn'),
    colsInput: $('colsInput'), rowsInput: $('rowsInput'), autoGridBtn: $('autoGridBtn'), recognizeBtn: $('recognizeBtn'),
    leftCrop: $('leftCrop'), rightCrop: $('rightCrop'), topCrop: $('topCrop'), bottomCrop: $('bottomCrop'), leftVal: $('leftVal'), rightVal: $('rightVal'), topVal: $('topVal'), bottomVal: $('bottomVal'),
    progressBox: $('progressBox'), progressText: $('progressText'), progressPct: $('progressPct'), progressBar: $('progressBar'), detectNotice: $('detectNotice'),
    stats: $('stats'), palette: $('palette'), showAllBtn: $('showAllBtn'), activeCode: $('activeCode'), nextBtn: $('nextBtn'), currentCell: $('currentCell'), zoomRange: $('zoomRange'), zoomValue: $('zoomValue'), gridCanvas: $('gridCanvas'), gridScroller: $('gridScroller'),
    editCodeInput: $('editCodeInput'), saveCodeBtn: $('saveCodeBtn'), resetBtn: $('resetBtn'), toast: $('toast')
  };

  const CODE_RE = /^[A-Z]{1,2}\d{1,2}$/;

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.add('hidden'), 2200);
  }

  function showNotice(msg, kind = '') {
    els.detectNotice.textContent = msg;
    els.detectNotice.className = `notice ${kind}`.trim();
    els.detectNotice.classList.remove('hidden');
  }

  function showUploadError(msg) {
    els.uploadError.textContent = msg;
    els.uploadError.classList.remove('hidden');
  }

  function clearUploadError() {
    els.uploadError.classList.add('hidden');
    els.uploadError.textContent = '';
  }

  function setProgress(text, pct) {
    els.progressBox.classList.remove('hidden');
    const n = Math.max(0, Math.min(100, Math.round(pct || 0)));
    els.progressText.textContent = text;
    els.progressPct.textContent = `${n}%`;
    els.progressBar.style.width = `${n}%`;
  }

  function hideProgress() { els.progressBox.classList.add('hidden'); }
  function waitFrame() { return new Promise(resolve => requestAnimationFrame(resolve)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function bindFileInput(input) {
    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await loadFile(file);
      input.value = '';
    });
  }
  bindFileInput(els.photoInput);
  bindFileInput(els.cameraInput);

  els.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropZone.classList.add('drag'); });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag'));
  els.dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('drag');
    const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif)$/i.test(x.name));
    if (f) await loadFile(f); else showUploadError('没有找到可读取的图片文件。');
  });

  els.pasteBtn.addEventListener('click', async () => {
    clearUploadError();
    try {
      if (!navigator.clipboard?.read) throw new Error('这个浏览器不允许直接读取剪贴板');
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        await loadFile(new File([blob], `pasted-${Date.now()}.png`, { type }));
        return;
      }
      throw new Error('剪贴板里没有图片');
    } catch (err) {
      showUploadError(`${err.message}。仍然可以直接用“选择照片”。`);
    }
  });

  async function loadFile(file) {
    clearUploadError();
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) {
      showUploadError('请选择 JPG、PNG、WebP 或手机相册中的图片。');
      return;
    }
    setProgress('正在打开图片…', 3);
    try {
      const decoded = await decodeImage(file);
      state.file = file;
      state.image = decoded;
      state.imageName = file.name || '图纸';
      state.rotation = 0;
      state.crop = { l: 0, r: 1, t: 0, b: 1 };
      state.cellBox = null;
      state.done.clear(); state.cells = []; state.selectedCode = null; state.selectedCell = null;
      els.colsInput.value = ''; els.rowsInput.value = '';
      renderSource();
      els.sourceSection.classList.remove('hidden');
      els.workSection.classList.add('hidden');
      els.imageMeta.textContent = `${state.imageName} · ${decoded.width} × ${decoded.height}px`;
      syncCropUIFromState();
      updateCalibrationInfo();
      setMode('pan');
      await waitFrame();
      resetView();
      hideProgress();
      showNotice('图片已打开。建议：先用双指/滑杆放大 → “框识别区域”只圈住真正的格子 → “框一个格子”告诉我单格大小。', 'ok');
      els.sourceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      hideProgress();
      showUploadError(`图片没有成功打开：${err.message || err}。HEIC/HEIF 如果浏览器不支持，请截图成 JPG/PNG 再试。`);
    }
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { bitmap: bmp, width: bmp.width, height: bmp.height };
      } catch (_) {}
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ bitmap: img, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('浏览器无法解码这个图片格式')); };
      img.src = url;
    });
  }

  function rotatedSize() {
    if (!state.image) return { width: 0, height: 0 };
    const swap = state.rotation === 90 || state.rotation === 270;
    return swap ? { width: state.image.height, height: state.image.width } : { width: state.image.width, height: state.image.height };
  }

  function buildRotatedSource() {
    const { width, height } = rotatedSize();
    const full = document.createElement('canvas'); full.width = width; full.height = height;
    const ctx = full.getContext('2d', { willReadFrequently: true });
    const img = state.image.bitmap;
    ctx.save();
    if (state.rotation === 0) ctx.drawImage(img, 0, 0);
    if (state.rotation === 90) { ctx.translate(width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(img, 0, 0); }
    if (state.rotation === 180) { ctx.translate(width, height); ctx.rotate(Math.PI); ctx.drawImage(img, 0, 0); }
    if (state.rotation === 270) { ctx.translate(0, height); ctx.rotate(-Math.PI / 2); ctx.drawImage(img, 0, 0); }
    ctx.restore();
    return full;
  }

  function renderSource() {
    const full = buildRotatedSource();
    const maxSide = 2400;
    const down = Math.min(1, maxSide / Math.max(full.width, full.height));
    const work = document.createElement('canvas');
    work.width = Math.max(1, Math.round(full.width * down));
    work.height = Math.max(1, Math.round(full.height * down));
    const wctx = work.getContext('2d', { willReadFrequently: true });
    wctx.imageSmoothingEnabled = true; wctx.imageSmoothingQuality = 'high';
    wctx.drawImage(full, 0, 0, work.width, work.height);
    state.sourceCanvas = work;

    els.sourceCanvas.width = work.width;
    els.sourceCanvas.height = work.height;
    els.sourceCanvas.style.width = `${work.width}px`;
    els.sourceCanvas.style.height = `${work.height}px`;
    els.sourceCanvas.getContext('2d').drawImage(work, 0, 0);
    els.sourceStage.style.width = `${work.width}px`;
    els.sourceStage.style.height = `${work.height}px`;
    updateOverlays();
  }

  function resetView() {
    if (!state.sourceCanvas) return;
    const vw = els.sourceViewport.clientWidth || 320;
    const vh = els.sourceViewport.clientHeight || 320;
    const fit = Math.min(vw / state.sourceCanvas.width, vh / state.sourceCanvas.height);
    state.view.fit = Math.max(.03, fit);
    state.view.zoom = 1;
    const scale = actualScale();
    state.view.tx = (vw - state.sourceCanvas.width * scale) / 2;
    state.view.ty = (vh - state.sourceCanvas.height * scale) / 2;
    syncSourceZoomUI();
    applyViewTransform();
  }

  function actualScale() { return state.view.fit * state.view.zoom; }

  function applyViewTransform() {
    els.sourceStage.style.transform = `translate(${state.view.tx}px,${state.view.ty}px) scale(${actualScale()})`;
  }

  function syncSourceZoomUI() {
    els.sourceZoom.value = String(Math.round(state.view.zoom * 100));
    els.sourceZoomValue.textContent = `${state.view.zoom.toFixed(1)}×`;
  }

  function zoomAt(nextZoom, clientX, clientY) {
    if (!state.sourceCanvas) return;
    nextZoom = clamp(nextZoom, 1, 6);
    const rect = els.sourceViewport.getBoundingClientRect();
    const ax = clientX == null ? rect.left + rect.width / 2 : clientX;
    const ay = clientY == null ? rect.top + rect.height / 2 : clientY;
    const oldScale = actualScale();
    const ix = (ax - rect.left - state.view.tx) / oldScale;
    const iy = (ay - rect.top - state.view.ty) / oldScale;
    state.view.zoom = nextZoom;
    const newScale = actualScale();
    state.view.tx = ax - rect.left - ix * newScale;
    state.view.ty = ay - rect.top - iy * newScale;
    syncSourceZoomUI();
    applyViewTransform();
  }

  els.sourceZoom.addEventListener('input', () => zoomAt(+els.sourceZoom.value / 100));
  els.zoomInBtn.addEventListener('click', () => zoomAt(state.view.zoom * 1.25));
  els.zoomOutBtn.addEventListener('click', () => zoomAt(state.view.zoom / 1.25));
  els.fitBtn.addEventListener('click', resetView);

  function setMode(mode) {
    state.mode = mode;
    [els.panModeBtn, els.cropModeBtn, els.cellModeBtn].forEach(x => x.classList.remove('active'));
    els.sourceViewport.classList.remove('mode-pan', 'mode-crop', 'mode-cell', 'dragging');
    if (mode === 'pan') {
      els.panModeBtn.classList.add('active'); els.sourceViewport.classList.add('mode-pan');
      els.interactionHint.className = 'notice ok';
      els.interactionHint.textContent = '移动图纸：单指拖动；双指捏合，或用下面滑杆放大缩小。';
    } else if (mode === 'crop') {
      els.cropModeBtn.classList.add('active'); els.sourceViewport.classList.add('mode-crop');
      els.interactionHint.className = 'notice ok';
      els.interactionHint.textContent = '框识别区域：在图上从左上拖到右下，只圈真正的网格，不要把标题、色卡、行列数字一起圈进去。双指仍可缩放。';
    } else {
      els.cellModeBtn.classList.add('active'); els.sourceViewport.classList.add('mode-cell');
      els.interactionHint.className = 'notice ok';
      els.interactionHint.textContent = '框一个格子：尽量放大后，沿某一个完整格子的四条边拖出方框。系统会用它推算每格尺寸和整张网格行列数。';
    }
  }
  els.panModeBtn.addEventListener('click', () => setMode('pan'));
  els.cropModeBtn.addEventListener('click', () => setMode('crop'));
  els.cellModeBtn.addEventListener('click', () => setMode('cell'));

  function clientToImage(clientX, clientY) {
    const rect = els.sourceViewport.getBoundingClientRect();
    const scale = actualScale();
    return {
      x: clamp((clientX - rect.left - state.view.tx) / scale, 0, state.sourceCanvas.width),
      y: clamp((clientY - rect.top - state.view.ty) / scale, 0, state.sourceCanvas.height)
    };
  }

  function rectFromPoints(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }

  function pointerDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  els.sourceViewport.addEventListener('pointerdown', (e) => {
    if (!state.sourceCanvas) return;
    e.preventDefault();
    els.sourceViewport.setPointerCapture?.(e.pointerId);
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      const mid = midpoint(a, b), rect = els.sourceViewport.getBoundingClientRect();
      const scale = actualScale();
      state.gesture = {
        type: 'pinch', dist: Math.max(1, pointerDistance(a, b)), zoom: state.view.zoom,
        imageX: (mid.x - rect.left - state.view.tx) / scale,
        imageY: (mid.y - rect.top - state.view.ty) / scale
      };
      state.selection = null;
      return;
    }

    if (state.mode === 'pan') {
      state.gesture = { type: 'pan', startX: e.clientX, startY: e.clientY, tx: state.view.tx, ty: state.view.ty };
      els.sourceViewport.classList.add('dragging');
    } else {
      const p = clientToImage(e.clientX, e.clientY);
      state.selection = { type: state.mode, start: p, current: p };
      drawDraftSelection();
    }
  }, { passive: false });

  els.sourceViewport.addEventListener('pointermove', (e) => {
    if (!state.pointers.has(e.pointerId)) return;
    e.preventDefault();
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (state.pointers.size >= 2) {
      const [a, b] = [...state.pointers.values()].slice(0, 2);
      if (!state.gesture || state.gesture.type !== 'pinch') {
        const mid = midpoint(a, b), rect = els.sourceViewport.getBoundingClientRect();
        const scale = actualScale();
        state.gesture = { type: 'pinch', dist: Math.max(1, pointerDistance(a, b)), zoom: state.view.zoom, imageX: (mid.x - rect.left - state.view.tx) / scale, imageY: (mid.y - rect.top - state.view.ty) / scale };
      }
      const mid = midpoint(a, b), rect = els.sourceViewport.getBoundingClientRect();
      const nextZoom = clamp(state.gesture.zoom * pointerDistance(a, b) / state.gesture.dist, 1, 6);
      state.view.zoom = nextZoom;
      const scale = actualScale();
      state.view.tx = mid.x - rect.left - state.gesture.imageX * scale;
      state.view.ty = mid.y - rect.top - state.gesture.imageY * scale;
      syncSourceZoomUI(); applyViewTransform();
      return;
    }

    if (state.gesture?.type === 'pan' && state.mode === 'pan') {
      state.view.tx = state.gesture.tx + (e.clientX - state.gesture.startX);
      state.view.ty = state.gesture.ty + (e.clientY - state.gesture.startY);
      applyViewTransform();
      return;
    }

    if (state.selection) {
      state.selection.current = clientToImage(e.clientX, e.clientY);
      drawDraftSelection();
    }
  }, { passive: false });

  function finishPointer(e) {
    if (!state.pointers.has(e.pointerId)) return;
    state.pointers.delete(e.pointerId);
    els.sourceViewport.classList.remove('dragging');

    if (state.pointers.size === 0) {
      if (state.selection) {
        const r = rectFromPoints(state.selection.start, state.selection.current);
        if (r.w >= 4 && r.h >= 4) {
          if (state.selection.type === 'crop') {
            state.crop = { l: r.x / state.sourceCanvas.width, r: (r.x + r.w) / state.sourceCanvas.width, t: r.y / state.sourceCanvas.height, b: (r.y + r.h) / state.sourceCanvas.height };
            syncCropUIFromState();
            showNotice('识别区域已框好。下一步建议切到“框一个格子”，放大后圈一个完整格子。', 'ok');
          } else if (state.selection.type === 'cell') {
            state.cellBox = r;
            showNotice(`已记录一个格子：约 ${r.w.toFixed(1)} × ${r.h.toFixed(1)} px。现在可以“按单格推算行列”。`, 'ok');
          }
          updateOverlays();
          updateCalibrationInfo();
        }
      }
      state.selection = null;
      state.gesture = null;
    } else if (state.pointers.size === 1) {
      state.gesture = null;
    }
  }
  els.sourceViewport.addEventListener('pointerup', finishPointer);
  els.sourceViewport.addEventListener('pointercancel', finishPointer);

  function drawDraftSelection() {
    if (!state.selection) return;
    const r = rectFromPoints(state.selection.start, state.selection.current);
    const target = state.selection.type === 'crop' ? els.cropOverlay : els.cellOverlay;
    target.classList.remove('hidden');
    positionOverlay(target, r);
  }

  function positionOverlay(el, r) {
    el.style.left = `${r.x}px`; el.style.top = `${r.y}px`; el.style.width = `${Math.max(1, r.w)}px`; el.style.height = `${Math.max(1, r.h)}px`;
  }

  function cropRectPx() {
    const c = state.sourceCanvas;
    return {
      x: Math.round(c.width * state.crop.l), y: Math.round(c.height * state.crop.t),
      w: Math.max(1, Math.round(c.width * (state.crop.r - state.crop.l))),
      h: Math.max(1, Math.round(c.height * (state.crop.b - state.crop.t)))
    };
  }

  function updateOverlays() {
    if (!state.sourceCanvas) return;
    const cr = cropRectPx();
    els.cropOverlay.classList.remove('hidden');
    positionOverlay(els.cropOverlay, cr);
    if (state.cellBox) {
      els.cellOverlay.classList.remove('hidden');
      positionOverlay(els.cellOverlay, state.cellBox);
    } else {
      els.cellOverlay.classList.add('hidden');
    }
  }

  function syncCropUIFromState() {
    els.leftCrop.value = Math.round(state.crop.l * 100);
    els.rightCrop.value = Math.round(state.crop.r * 100);
    els.topCrop.value = Math.round(state.crop.t * 100);
    els.bottomCrop.value = Math.round(state.crop.b * 100);
    els.leftVal.textContent = `${Math.round(state.crop.l * 100)}%`;
    els.rightVal.textContent = `${Math.round(state.crop.r * 100)}%`;
    els.topVal.textContent = `${Math.round(state.crop.t * 100)}%`;
    els.bottomVal.textContent = `${Math.round(state.crop.b * 100)}%`;
  }

  function updateCropFromSliders() {
    let l = +els.leftCrop.value / 100, r = +els.rightCrop.value / 100, t = +els.topCrop.value / 100, b = +els.bottomCrop.value / 100;
    if (r - l < .01) r = Math.min(1, l + .01);
    if (b - t < .01) b = Math.min(1, t + .01);
    state.crop = { l, r, t, b };
    syncCropUIFromState(); updateOverlays(); updateCalibrationInfo();
  }
  [els.leftCrop, els.rightCrop, els.topCrop, els.bottomCrop].forEach(x => x.addEventListener('input', updateCropFromSliders));

  function inferredGrid() {
    if (!state.sourceCanvas || !state.cellBox || state.cellBox.w < 2 || state.cellBox.h < 2) return null;
    const cr = cropRectPx();
    const cols = Math.round(cr.w / state.cellBox.w);
    const rows = Math.round(cr.h / state.cellBox.h);
    if (cols < 1 || rows < 1 || cols > 160 || rows > 160) return null;
    const errX = Math.abs(cr.w - cols * state.cellBox.w) / cr.w;
    const errY = Math.abs(cr.h - rows * state.cellBox.h) / cr.h;
    return { cols, rows, errX, errY };
  }

  function updateCalibrationInfo() {
    if (!state.sourceCanvas) return;
    const cr = cropRectPx();
    els.cropInfo.textContent = `${Math.round(cr.w)} × ${Math.round(cr.h)} px`;
    if (state.cellBox) els.cellInfo.textContent = `${state.cellBox.w.toFixed(1)} × ${state.cellBox.h.toFixed(1)} px`;
    else els.cellInfo.textContent = '还没框';
    const guess = inferredGrid();
    if (guess) {
      const quality = Math.max(guess.errX, guess.errY) < .08 ? '吻合' : '需微调';
      els.gridGuess.textContent = `${guess.cols} × ${guess.rows}（${quality}）`;
      els.applyCellBtn.disabled = false;
    } else {
      els.gridGuess.textContent = '待校准';
      els.applyCellBtn.disabled = true;
    }
  }

  els.clearCropBtn.addEventListener('click', () => {
    state.crop = { l: 0, r: 1, t: 0, b: 1 };
    syncCropUIFromState(); updateOverlays(); updateCalibrationInfo();
    setMode('crop'); toast('识别区域已重置，请重新框选');
  });
  els.clearCellBtn.addEventListener('click', () => {
    state.cellBox = null; updateOverlays(); updateCalibrationInfo(); setMode('cell'); toast('请重新框一个完整格子');
  });
  els.applyCellBtn.addEventListener('click', () => {
    const g = inferredGrid();
    if (!g) return;
    els.colsInput.value = g.cols; els.rowsInput.value = g.rows;
    showNotice(`已按你框的单格尺寸推算为 ${g.cols} 列 × ${g.rows} 行。请对照图纸边缘数字确认；如果图纸明确写 20×20，就以图纸数字为准。`, 'ok');
  });

  function rotate(delta) {
    if (!state.image) return;
    state.rotation = (state.rotation + delta + 360) % 360;
    state.crop = { l: 0, r: 1, t: 0, b: 1 }; state.cellBox = null;
    renderSource(); syncCropUIFromState(); updateCalibrationInfo();
    els.colsInput.value = ''; els.rowsInput.value = '';
    requestAnimationFrame(resetView);
    showNotice('已旋转。识别区域和单格校准已重置，请重新框选。', 'ok');
  }
  els.rotateLeftBtn.addEventListener('click', () => rotate(-90));
  els.rotateRightBtn.addEventListener('click', () => rotate(90));

  function cropCanvas() {
    const r = cropRectPx();
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    c.getContext('2d').drawImage(state.sourceCanvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return c;
  }

  function edgeProjection(canvas, axis) {
    const max = 1200;
    const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(canvas.width * scale)); c.height = Math.max(2, Math.round(canvas.height * scale));
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(canvas, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const len = axis === 'x' ? c.width : c.height, oth = axis === 'x' ? c.height : c.width;
    const arr = new Float32Array(len); const step = Math.max(1, Math.floor(oth / 400));
    for (let a = 1; a < len - 1; a++) {
      let s = 0, n = 0;
      for (let o = 0; o < oth; o += step) {
        const x1 = axis === 'x' ? a - 1 : o, y1 = axis === 'x' ? o : a - 1;
        const x2 = axis === 'x' ? a + 1 : o, y2 = axis === 'x' ? o : a + 1;
        const i1 = (y1 * c.width + x1) * 4, i2 = (y2 * c.width + x2) * 4;
        const g1 = .299 * d[i1] + .587 * d[i1 + 1] + .114 * d[i1 + 2];
        const g2 = .299 * d[i2] + .587 * d[i2 + 1] + .114 * d[i2 + 2];
        s += Math.abs(g2 - g1); n++;
      }
      arr[a] = s / Math.max(1, n);
    }
    return arr;
  }

  function estimateSpacing(values) {
    const n = values.length, lo = Math.max(4, Math.floor(n / 170)), hi = Math.min(140, Math.floor(n / 4));
    const mean = values.reduce((a, b) => a + b, 0) / n;
    let bestLag = 0, best = -Infinity;
    for (let lag = lo; lag <= hi; lag++) {
      let s = 0, norm = 0;
      for (let i = 0; i + lag < n; i += 2) {
        const a = Math.max(0, values[i] - mean), b = Math.max(0, values[i + lag] - mean);
        s += a * b; norm += a * a;
      }
      const cells = n / lag;
      if (cells < 4 || cells > 160) continue;
      const score = norm ? s / norm : 0;
      if (score > best) { best = score; bestLag = lag; }
    }
    return bestLag || null;
  }

  async function autoDetectGrid() {
    if (!state.sourceCanvas) return;
    setProgress('正在分析识别区域里的重复网格…', 15); await waitFrame();
    const crop = cropCanvas();
    const sx = estimateSpacing(edgeProjection(crop, 'x'));
    const sy = estimateSpacing(edgeProjection(crop, 'y'));
    hideProgress();
    if (!sx || !sy) {
      showNotice('自动网格不稳定。你现在可以直接用“框一个格子”，这比自动猜更可靠。', 'warn');
      return;
    }
    const cols = Math.round(crop.width / sx), rows = Math.round(crop.height / sy);
    if (cols >= 1 && cols <= 160) els.colsInput.value = cols;
    if (rows >= 1 && rows <= 160) els.rowsInput.value = rows;
    showNotice(`自动估算约 ${cols} 列 × ${rows} 行。自动结果只做辅助；如果你已经框了一个格子，以单格推算和图纸边缘数字为优先。`, 'ok');
  }
  els.autoGridBtn.addEventListener('click', autoDetectGrid);

  function normalizeCode(raw) {
    if (!raw) return '';
    let s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    s = s.replace(/^([A-Z]{1,2})O(\d)$/,'$10$2');
    if (CODE_RE.test(s)) return s;
    return '';
  }

  function rgbToHex(rgb) { return '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
  function luminance(rgb) { return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; }
  function colorDistance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  function sampleCellColor(ctx, x, y, w, h) {
    const pad = .18;
    const sx = Math.floor(x + w * pad), sy = Math.floor(y + h * pad);
    const sw = Math.max(2, Math.floor(w * (1 - pad * 2))), sh = Math.max(2, Math.floor(h * (1 - pad * 2)));
    const data = ctx.getImageData(sx, sy, Math.min(sw, ctx.canvas.width - sx), Math.min(sh, ctx.canvas.height - sy)).data;
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 180) continue;
      const r = Math.round(data[i] / 12) * 12, g = Math.round(data[i + 1] / 12) * 12, b = Math.round(data[i + 2] / 12) * 12;
      const k = `${r},${g},${b}`; buckets.set(k, (buckets.get(k) || 0) + 1);
    }
    let best = '255,255,255', count = -1;
    for (const [k, n] of buckets) if (n > count) { best = k; count = n; }
    return best.split(',').map(Number);
  }

  function centerInkScore(ctx, x, y, w, h, bg) {
    const sx = Math.floor(x + w * .16), sy = Math.floor(y + h * .16), sw = Math.max(2, Math.floor(w * .68)), sh = Math.max(2, Math.floor(h * .68));
    const d = ctx.getImageData(sx, sy, Math.min(sw, ctx.canvas.width - sx), Math.min(sh, ctx.canvas.height - sy)).data;
    let contrast = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const dd = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
      if (dd > 55) contrast++;
      n++;
    }
    return n ? contrast / n : 0;
  }

  async function getWorker() {
    if (!window.Tesseract) throw new Error('OCR 组件没有加载成功，请确认联网后刷新页面。');
    if (state.worker) return state.worker;
    state.worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') setProgress('正在读取格内编号…', 28 + (m.progress || 0) * 60);
      }
    });
    await state.worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '11'
    });
    return state.worker;
  }

  function makeOCRCanvas(crop, rows, cols) {
    const cellW = crop.width / cols, cellH = crop.height / rows;
    const count = rows * cols;
    const targetCell = count > 3500 ? 25 : count > 1500 ? 31 : count > 600 ? 40 : 52;
    const scale = clamp(targetCell / Math.max(5, Math.min(cellW, cellH)), 1, 5);
    const maxSide = 4200;
    const capped = Math.min(scale, maxSide / Math.max(crop.width, crop.height));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(crop.width * capped)); out.height = Math.max(1, Math.round(crop.height * capped));
    const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(crop, 0, 0, out.width, out.height);
    return out;
  }

  function extractCellCodes(data, rows, cols, ocrW, ocrH) {
    const tokens = Array.from({ length: rows * cols }, () => []);
    const items = data.words || [];
    for (const word of items) {
      const text = String(word.text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!text || !word.bbox) continue;
      const cx = (word.bbox.x0 + word.bbox.x1) / 2, cy = (word.bbox.y0 + word.bbox.y1) / 2;
      const c = clamp(Math.floor(cx / ocrW * cols), 0, cols - 1), r = clamp(Math.floor(cy / ocrH * rows), 0, rows - 1);
      tokens[r * cols + c].push({ text, x: word.bbox.x0 || 0, conf: word.confidence || 0 });
    }
    return tokens.map(arr => {
      if (!arr.length) return '';
      const direct = arr.map(x => normalizeCode(x.text)).find(Boolean);
      if (direct) return direct;
      arr.sort((a, b) => a.x - b.x);
      return normalizeCode(arr.map(x => x.text).join(''));
    });
  }

  async function recognize() {
    if (!state.sourceCanvas) return;
    let cols = parseInt(els.colsInput.value, 10), rows = parseInt(els.rowsInput.value, 10);
    if ((!cols || !rows) && inferredGrid()) {
      const g = inferredGrid(); cols = g.cols; rows = g.rows; els.colsInput.value = cols; els.rowsInput.value = rows;
    }
    if (!cols || !rows || cols < 1 || rows < 1 || cols > 160 || rows > 160) {
      showNotice('还不知道正确网格大小。先“框识别区域”+“框一个格子”，或者手动填写列数和行数。', 'warn');
      return;
    }
    const count = rows * cols;
    if (count > 10000) {
      showNotice('这张图超过 10,000 格，手机 OCR 会非常吃力。建议把图分区域裁切识别。', 'warn');
      return;
    }

    els.recognizeBtn.disabled = true;
    setProgress('正在按网格切分图片…', 8);
    try {
      const crop = cropCanvas();
      const ctx = crop.getContext('2d', { willReadFrequently: true });
      const cw = crop.width / cols, ch = crop.height / rows;
      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw, y = r * ch;
          const rgb = sampleCellColor(ctx, x, y, cw, ch);
          cells.push({ r, c, code: '', rgb, ink: centerInkScore(ctx, x, y, cw, ch, rgb) });
        }
      }

      setProgress('正在准备 OCR…', 18); await waitFrame();
      const ocr = makeOCRCanvas(crop, rows, cols);
      const worker = await getWorker();
      const result = await worker.recognize(ocr);
      const codes = extractCellCodes(result.data || {}, rows, cols, ocr.width, ocr.height);
      let directCount = 0;
      cells.forEach((cell, i) => { if (codes[i]) { cell.code = codes[i]; directCount++; } });

      setProgress('正在用颜色关系补全漏读编号…', 90);
      const groups = new Map();
      for (const cell of cells) {
        if (!cell.code) continue;
        if (!groups.has(cell.code)) groups.set(cell.code, []);
        groups.get(cell.code).push(cell.rgb);
      }
      const reps = [...groups.entries()].map(([code, colors]) => ({
        code,
        rgb: [0,1,2].map(k => colors.reduce((s, x) => s + x[k], 0) / colors.length)
      }));

      const cornerIndices = [0, cols - 1, (rows - 1) * cols, rows * cols - 1].filter(i => i >= 0 && i < cells.length);
      const bgColors = cornerIndices.map(i => cells[i].rgb);
      let inferredCount = 0;
      for (const cell of cells) {
        if (cell.code || !reps.length) continue;
        let nearest = null, best = Infinity;
        for (const rep of reps) {
          const d = colorDistance(cell.rgb, rep.rgb);
          if (d < best) { best = d; nearest = rep; }
        }
        const bgLike = bgColors.some(bg => colorDistance(cell.rgb, bg) < 24);
        const likelyPrintedCell = cell.ink > .018 || !bgLike;
        if (nearest && best < 30 && likelyPrintedCell) { cell.code = nearest.code; cell.inferred = true; inferredCount++; }
      }

      state.rows = rows; state.cols = cols; state.cells = cells; state.done.clear(); state.selectedCode = null; state.selectedCell = null;
      setProgress('正在生成工作图…', 98); await waitFrame();
      renderWork();
      hideProgress();
      els.workSection.classList.remove('hidden');
      showNotice(`识别完成：OCR 直接读到 ${directCount} 格，按颜色补全 ${inferredCount} 格。个别错字可以在工作图下方手动改。`, directCount ? 'ok' : 'warn');
      els.workSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      hideProgress();
      showNotice(`识别失败：${err.message || err}`, 'warn');
    } finally {
      els.recognizeBtn.disabled = false;
    }
  }
  els.recognizeBtn.addEventListener('click', recognize);

  function codeGroups() {
    const map = new Map();
    for (const cell of state.cells) {
      if (!cell.code) continue;
      if (!map.has(cell.code)) map.set(cell.code, { code: cell.code, count: 0, colors: [] });
      const g = map.get(cell.code); g.count++; g.colors.push(cell.rgb);
    }
    for (const g of map.values()) g.rgb = [0,1,2].map(k => g.colors.reduce((s, x) => s + x[k], 0) / g.colors.length);
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  function renderWork() {
    renderStats(); renderPalette(); drawGrid(); updateCurrentCell();
  }

  function renderStats() {
    const groups = codeGroups();
    const coded = state.cells.filter(x => x.code).length;
    const done = [...state.done].filter(k => {
      const [r,c] = k.split(',').map(Number); return state.cells[r * state.cols + c]?.code;
    }).length;
    els.stats.innerHTML = `
      <div class="stat"><span>网格</span><b>${state.cols}×${state.rows}</b></div>
      <div class="stat"><span>颜色</span><b>${groups.length}</b></div>
      <div class="stat"><span>已识别豆</span><b>${coded}</b></div>
      <div class="stat"><span>已完成</span><b>${done}</b></div>`;
  }

  function renderPalette() {
    const groups = codeGroups();
    els.palette.innerHTML = '';
    for (const g of groups) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'chip' + (state.selectedCode === g.code ? ' active' : '');
      btn.innerHTML = `<div class="chip-color" style="background:${rgbToHex(g.rgb)}"></div><strong>${g.code}</strong><span>${g.count} 颗</span>`;
      btn.addEventListener('click', () => { state.selectedCode = state.selectedCode === g.code ? null : g.code; els.activeCode.textContent = state.selectedCode || '全部'; renderPalette(); drawGrid(); });
      els.palette.appendChild(btn);
    }
    els.activeCode.textContent = state.selectedCode || '全部';
  }

  function drawGrid() {
    if (!state.rows || !state.cols) return;
    const size = +els.zoomRange.value;
    els.zoomValue.textContent = size;
    const c = els.gridCanvas; c.width = state.cols * size + 1; c.height = state.rows * size + 1;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(8, Math.floor(size * .31))}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

    for (const cell of state.cells) {
      const x = cell.c * size, y = cell.r * size;
      const dim = state.selectedCode && cell.code !== state.selectedCode;
      ctx.save(); ctx.globalAlpha = dim ? .09 : 1;
      if (cell.code) {
        ctx.fillStyle = rgbToHex(cell.rgb); ctx.fillRect(x, y, size, size);
        ctx.fillStyle = luminance(cell.rgb) < 135 ? '#fff' : '#111'; ctx.fillText(cell.code, x + size/2, y + size/2);
      } else {
        ctx.fillStyle = '#f5f5f2'; ctx.fillRect(x, y, size, size);
      }
      ctx.restore();
      const key = `${cell.r},${cell.c}`;
      if (state.done.has(key) && cell.code) {
        ctx.save(); ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, size * .08); ctx.beginPath(); ctx.moveTo(x + size*.2, y + size*.55); ctx.lineTo(x + size*.43, y + size*.78); ctx.lineTo(x + size*.82, y + size*.22); ctx.stroke(); ctx.restore();
      }
    }

    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    for (let x = 0; x <= state.cols; x++) { ctx.beginPath(); ctx.moveTo(x*size+.5, 0); ctx.lineTo(x*size+.5, c.height); ctx.stroke(); }
    for (let y = 0; y <= state.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y*size+.5); ctx.lineTo(c.width, y*size+.5); ctx.stroke(); }
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, size*.07);
    for (let x = 5; x < state.cols; x += 5) { ctx.beginPath(); ctx.moveTo(x*size, 0); ctx.lineTo(x*size, c.height); ctx.stroke(); }
    for (let y = 5; y < state.rows; y += 5) { ctx.beginPath(); ctx.moveTo(0, y*size); ctx.lineTo(c.width, y*size); ctx.stroke(); }
  }

  els.zoomRange.addEventListener('input', drawGrid);
  els.showAllBtn.addEventListener('click', () => { state.selectedCode = null; els.activeCode.textContent = '全部'; renderPalette(); drawGrid(); });

  els.gridCanvas.addEventListener('click', (e) => {
    if (!state.cols || !state.rows) return;
    const rect = els.gridCanvas.getBoundingClientRect();
    const sx = els.gridCanvas.width / rect.width, sy = els.gridCanvas.height / rect.height;
    const size = +els.zoomRange.value;
    const c = clamp(Math.floor((e.clientX - rect.left) * sx / size), 0, state.cols - 1);
    const r = clamp(Math.floor((e.clientY - rect.top) * sy / size), 0, state.rows - 1);
    const cell = state.cells[r * state.cols + c];
    state.selectedCell = cell;
    els.editCodeInput.value = cell.code || '';
    if (cell.code) {
      const key = `${r},${c}`;
      if (state.done.has(key)) state.done.delete(key); else state.done.add(key);
    }
    updateCurrentCell(); renderStats(); drawGrid();
  });

  function updateCurrentCell() {
    const cell = state.selectedCell;
    if (!cell) { els.currentCell.classList.add('hidden'); return; }
    const moduleCol = Math.floor(cell.c / 5) + 1, moduleRow = Math.floor(cell.r / 5) + 1;
    const withinCol = cell.c % 5 + 1, withinRow = cell.r % 5 + 1;
    els.currentCell.classList.remove('hidden');
    els.currentCell.innerHTML = `<b>${cell.code || '未识别'}</b> · 总坐标：第 ${cell.r + 1} 行 / 第 ${cell.c + 1} 列<br>5×5 模块：第 ${moduleRow} 排第 ${moduleCol} 块 · 模块内第 ${withinRow} 行第 ${withinCol} 格`;
  }

  els.nextBtn.addEventListener('click', () => {
    const targetCode = state.selectedCode;
    const candidates = state.cells.filter(x => x.code && (!targetCode || x.code === targetCode));
    const target = candidates.find(x => !state.done.has(`${x.r},${x.c}`));
    if (!target) { toast(targetCode ? `${targetCode} 已经全部完成` : '没有未完成的已识别格子'); return; }
    state.selectedCell = target; updateCurrentCell();
    const size = +els.zoomRange.value;
    els.gridScroller.scrollTo({ left: Math.max(0, target.c * size - els.gridScroller.clientWidth/2 + size/2), top: Math.max(0, target.r * size - els.gridScroller.clientHeight/2 + size/2), behavior: 'smooth' });
  });

  els.saveCodeBtn.addEventListener('click', () => {
    if (!state.selectedCell) { toast('先点工作图里的一个格子'); return; }
    const raw = els.editCodeInput.value.trim().toUpperCase();
    const code = raw ? normalizeCode(raw) : '';
    if (raw && !code) { toast('编号格式应类似 H5、D12、A22'); return; }
    state.selectedCell.code = code;
    renderWork(); toast(code ? `已改为 ${code}` : '已清空这个格子的编号');
  });

  els.resetBtn.addEventListener('click', async () => {
    if (!confirm('确定清空当前图纸和进度吗？')) return;
    if (state.worker) { try { await state.worker.terminate(); } catch (_) {} state.worker = null; }
    state.file = null; state.image = null; state.sourceCanvas = null; state.cells = []; state.done.clear(); state.cellBox = null; state.selectedCell = null; state.selectedCode = null;
    els.sourceSection.classList.add('hidden'); els.workSection.classList.add('hidden'); els.photoInput.value = ''; els.cameraInput.value = '';
    hideProgress(); clearUploadError(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('resize', () => { if (state.sourceCanvas) resetView(); });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
