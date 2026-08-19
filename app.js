(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    file: null,
    image: null,
    rotation: 0,
    sourceCanvas: null,
    crop: { l: 0, r: 1, t: 0, b: 1 },
    rows: null,
    cols: null,
    cells: [],
    selectedCode: null,
    selectedCell: null,
    done: new Set(),
    worker: null,
    lastObjectUrl: null,
    imageName: ''
  };

  const els = {
    photoInput: $('photoInput'), cameraInput: $('cameraInput'), pasteBtn: $('pasteBtn'), dropZone: $('dropZone'), uploadError: $('uploadError'),
    uploadSection: $('uploadSection'), sourceSection: $('sourceSection'), workSection: $('workSection'), sourceCanvas: $('sourceCanvas'), cropOverlay: $('cropOverlay'), imageMeta: $('imageMeta'),
    rotateLeftBtn: $('rotateLeftBtn'), rotateRightBtn: $('rotateRightBtn'), colsInput: $('colsInput'), rowsInput: $('rowsInput'), autoGridBtn: $('autoGridBtn'), recognizeBtn: $('recognizeBtn'),
    leftCrop: $('leftCrop'), rightCrop: $('rightCrop'), topCrop: $('topCrop'), bottomCrop: $('bottomCrop'), leftVal: $('leftVal'), rightVal: $('rightVal'), topVal: $('topVal'), bottomVal: $('bottomVal'),
    progressBox: $('progressBox'), progressText: $('progressText'), progressPct: $('progressPct'), progressBar: $('progressBar'), detectNotice: $('detectNotice'),
    stats: $('stats'), palette: $('palette'), showAllBtn: $('showAllBtn'), activeCode: $('activeCode'), nextBtn: $('nextBtn'), currentCell: $('currentCell'), zoomRange: $('zoomRange'), zoomValue: $('zoomValue'), gridCanvas: $('gridCanvas'), gridScroller: $('gridScroller'),
    editCodeInput: $('editCodeInput'), saveCodeBtn: $('saveCodeBtn'), resetBtn: $('resetBtn'), toast: $('toast')
  };

  const CODE_RE = /^[A-Z]{1,2}\d{1,2}$/;
  const pureNumber = /^\d{1,3}$/;

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

  function hideProgress() {
    els.progressBox.classList.add('hidden');
  }

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
    e.preventDefault(); els.dropZone.classList.remove('drag');
    const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/'));
    if (f) await loadFile(f); else showUploadError('没有找到可读取的图片文件。');
  });

  els.pasteBtn.addEventListener('click', async () => {
    clearUploadError();
    try {
      if (!navigator.clipboard?.read) throw new Error('这个浏览器不允许直接读取剪贴板。');
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          await loadFile(new File([blob], `pasted-${Date.now()}.png`, { type }));
          return;
        }
      }
      throw new Error('剪贴板里没有图片。');
    } catch (err) {
      showUploadError(`${err.message} 你仍然可以直接用上面的“选择照片”。`);
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
      state.done.clear();
      state.cells = [];
      state.selectedCode = null;
      state.selectedCell = null;
      els.colsInput.value = '';
      els.rowsInput.value = '';
      resetCropSliders();
      renderSource();
      els.sourceSection.classList.remove('hidden');
      els.workSection.classList.add('hidden');
      els.imageMeta.textContent = `${state.imageName} · ${decoded.width} × ${decoded.height}px`;
      setProgress('图片已打开，正在估算网格…', 12);
      await waitFrame();
      await autoDetectGrid(true);
      hideProgress();
      els.sourceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      hideProgress();
      showUploadError(`图片没有成功打开：${err.message || err}。如果是 HEIC/HEIF，建议先在 iPhone 相册里“存储到文件”或截图成 JPG/PNG 再试。`);
    }
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { bitmap: bmp, width: bmp.width, height: bmp.height, kind: 'bitmap' };
      } catch (_) {}
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ bitmap: img, width: img.naturalWidth, height: img.naturalHeight, kind: 'img' });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('浏览器无法解码这个图片格式')); };
      img.src = url;
    });
  }

  function resetCropSliders() {
    els.leftCrop.value = 0; els.rightCrop.value = 100; els.topCrop.value = 0; els.bottomCrop.value = 100;
    updateCropFromUI();
  }

  function rotatedSize() {
    if (!state.image) return { width: 0, height: 0 };
    const swap = Math.abs(state.rotation % 180) === 90;
    return swap ? { width: state.image.height, height: state.image.width } : { width: state.image.width, height: state.image.height };
  }

  function buildRotatedSource() {
    const { width, height } = rotatedSize();
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const img = state.image.bitmap;
    ctx.save();
    if (state.rotation === 0) ctx.drawImage(img, 0, 0);
    if (state.rotation === 90) { ctx.translate(width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(img, 0, 0); }
    if (state.rotation === 180) { ctx.translate(width, height); ctx.rotate(Math.PI); ctx.drawImage(img, 0, 0); }
    if (state.rotation === 270) { ctx.translate(0, height); ctx.rotate(-Math.PI / 2); ctx.drawImage(img, 0, 0); }
    ctx.restore();
    return c;
  }

  function renderSource() {
    const full = buildRotatedSource();
    state.sourceCanvas = full;
    const max = 1500;
    const scale = Math.min(1, max / Math.max(full.width, full.height));
    els.sourceCanvas.width = Math.round(full.width * scale);
    els.sourceCanvas.height = Math.round(full.height * scale);
    const ctx = els.sourceCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(full, 0, 0, els.sourceCanvas.width, els.sourceCanvas.height);
    updateCropOverlay();
  }

  function updateCropFromUI() {
    const l = +els.leftCrop.value / 100, r = +els.rightCrop.value / 100, t = +els.topCrop.value / 100, b = +els.bottomCrop.value / 100;
    state.crop = { l: Math.min(l, r - .05), r: Math.max(r, l + .05), t: Math.min(t, b - .05), b: Math.max(b, t + .05) };
    els.leftVal.textContent = `${Math.round(state.crop.l * 100)}%`;
    els.rightVal.textContent = `${Math.round(state.crop.r * 100)}%`;
    els.topVal.textContent = `${Math.round(state.crop.t * 100)}%`;
    els.bottomVal.textContent = `${Math.round(state.crop.b * 100)}%`;
    updateCropOverlay();
  }

  [els.leftCrop, els.rightCrop, els.topCrop, els.bottomCrop].forEach(x => x.addEventListener('input', updateCropFromUI));

  function updateCropOverlay() {
    if (!state.sourceCanvas) return;
    const { l, r, t, b } = state.crop;
    els.cropOverlay.style.left = `${l * 100}%`;
    els.cropOverlay.style.top = `${t * 100}%`;
    els.cropOverlay.style.width = `${(r - l) * 100}%`;
    els.cropOverlay.style.height = `${(b - t) * 100}%`;
  }

  function rotate(delta) {
    if (!state.image) return;
    state.rotation = (state.rotation + delta + 360) % 360;
    renderSource();
    resetCropSliders();
    els.colsInput.value = ''; els.rowsInput.value = '';
    showNotice('已旋转。请再点一次“自动找网格”，或者直接填写图纸的行数/列数。', 'ok');
  }
  els.rotateLeftBtn.addEventListener('click', () => rotate(-90));
  els.rotateRightBtn.addEventListener('click', () => rotate(90));

  function cropRectPx(canvas = state.sourceCanvas) {
    return {
      x: Math.round(canvas.width * state.crop.l),
      y: Math.round(canvas.height * state.crop.t),
      w: Math.max(1, Math.round(canvas.width * (state.crop.r - state.crop.l))),
      h: Math.max(1, Math.round(canvas.height * (state.crop.b - state.crop.t)))
    };
  }

  function waitFrame() { return new Promise(r => requestAnimationFrame(() => r())); }

  function percentile(arr, p) {
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.max(0, Math.min(a.length - 1, Math.floor((a.length - 1) * p)))] || 0;
  }

  function smooth(arr, radius = 2) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0, n = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(arr.length - 1, i + radius); j++) { s += arr[j]; n++; }
      out[i] = s / n;
    }
    return out;
  }

  function getEdgeProjection(canvas, axis) {
    const maxDim = 1100;
    const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(canvas.width * scale)); c.height = Math.max(2, Math.round(canvas.height * scale));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const len = axis === 'x' ? c.width : c.height;
    const oth = axis === 'x' ? c.height : c.width;
    const out = new Float32Array(len);
    const step = Math.max(1, Math.floor(oth / 500));
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
      out[a] = s / Math.max(1, n);
    }
    return { values: smooth(out, 1), scale };
  }

  function estimateSpacing(values) {
    const n = values.length;
    const lo = Math.max(6, Math.floor(n / 130));
    const hi = Math.min(Math.floor(n / 6), 120);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const centered = Float32Array.from(values, v => Math.max(0, v - mean));
    let bestLag = null, best = -Infinity;
    for (let lag = lo; lag <= hi; lag++) {
      let s = 0, norm = 0;
      for (let i = 0; i + lag < n; i += 2) { s += centered[i] * centered[i + lag]; norm += centered[i] * centered[i]; }
      const score = norm ? s / norm : 0;
      const cells = n / lag;
      const plausible = cells >= 8 && cells <= 100 ? 1 : .65;
      if (score * plausible > best) { best = score * plausible; bestLag = lag; }
    }
    return bestLag;
  }

  function bestPhase(values, spacing) {
    if (!spacing) return 0;
    let bestP = 0, best = -Infinity;
    for (let p = 0; p < spacing; p++) {
      let s = 0;
      for (let x = p; x < values.length; x += spacing) s += values[x];
      if (s > best) { best = s; bestP = p; }
    }
    return bestP;
  }

  function linePositions(values, spacing, phase) {
    const med = percentile(values, .5), hi = percentile(values, .85);
    const threshold = med + (hi - med) * .18;
    const pts = [];
    for (let x = phase; x < values.length; x += spacing) {
      let bestX = x, bestV = -Infinity;
      for (let q = Math.max(0, x - 2); q <= Math.min(values.length - 1, x + 2); q++) if (values[q] > bestV) { bestV = values[q]; bestX = q; }
      pts.push({ x: bestX, score: bestV, good: bestV >= threshold });
    }
    return pts;
  }

  function longestUsefulRun(points) {
    if (!points.length) return null;
    let best = null;
    for (let a = 0; a < points.length; a++) {
      let good = 0, misses = 0;
      for (let b = a; b < points.length; b++) {
        if (points[b].good) good++; else misses++;
        const len = b - a + 1;
        if (len >= 9 && good / len >= .58 && misses <= Math.max(5, Math.floor(len * .42))) {
          const score = len + good * .4;
          if (!best || score > best.score) best = { a, b, score, good, len };
        }
      }
    }
    return best || { a: 0, b: points.length - 1 };
  }

  async function autoDetectGrid(silent = false) {
    if (!state.sourceCanvas) return;
    if (!silent) setProgress('正在寻找重复网格线…', 10);
    await waitFrame();
    const px = getEdgeProjection(state.sourceCanvas, 'x');
    const py = getEdgeProjection(state.sourceCanvas, 'y');
    const sx = estimateSpacing(px.values), sy = estimateSpacing(py.values);
    if (!sx || !sy) {
      hideProgress();
      showNotice('自动网格没有找到稳定周期。没关系：直接按图纸顶部和侧边的数字填写“列数 / 行数”，再拖动裁切边界。', 'warn');
      return;
    }
    const phx = bestPhase(px.values, sx), phy = bestPhase(py.values, sy);
    const xPts = linePositions(px.values, sx, phx), yPts = linePositions(py.values, sy, phy);
    const xr = longestUsefulRun(xPts), yr = longestUsefulRun(yPts);
    if (!xr || !yr) { hideProgress(); return; }
    const x0 = xPts[xr.a].x / px.scale, x1 = xPts[xr.b].x / px.scale;
    const y0 = yPts[yr.a].x / py.scale, y1 = yPts[yr.b].x / py.scale;
    const width = state.sourceCanvas.width, height = state.sourceCanvas.height;
    let cols = Math.max(1, xr.b - xr.a), rows = Math.max(1, yr.b - yr.a);

    // Common pattern sheets often have one numbered header cell on each side.
    // Keep the detected rectangle but only prefill dimensions when plausible.
    if (cols >= 8 && cols <= 100) els.colsInput.value = cols;
    if (rows >= 8 && rows <= 100) els.rowsInput.value = rows;
    state.crop = {
      l: Math.max(0, Math.min(.95, x0 / width)), r: Math.max(.05, Math.min(1, x1 / width)),
      t: Math.max(0, Math.min(.95, y0 / height)), b: Math.max(.05, Math.min(1, y1 / height))
    };
    if (state.crop.r - state.crop.l < .35 || state.crop.b - state.crop.t < .35) state.crop = { l: 0, r: 1, t: 0, b: 1 };
    syncCropUIFromState();
    updateCropOverlay();
    hideProgress();
    if (!silent) showNotice(`自动估算为约 ${els.colsInput.value || '?'} 列 × ${els.rowsInput.value || '?'} 行。请先对照图纸边缘数字；若图纸写着 20，就直接把列/行改成 20。`, 'ok');
  }
  els.autoGridBtn.addEventListener('click', () => autoDetectGrid(false));

  function syncCropUIFromState() {
    els.leftCrop.value = Math.round(state.crop.l * 100);
    els.rightCrop.value = Math.round(state.crop.r * 100);
    els.topCrop.value = Math.round(state.crop.t * 100);
    els.bottomCrop.value = Math.round(state.crop.b * 100);
    els.leftVal.textContent = `${Math.round(state.crop.l * 100)}%`; els.rightVal.textContent = `${Math.round(state.crop.r * 100)}%`;
    els.topVal.textContent = `${Math.round(state.crop.t * 100)}%`; els.bottomVal.textContent = `${Math.round(state.crop.b * 100)}%`;
  }

  function cropCanvas() {
    const r = cropRectPx();
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    c.getContext('2d').drawImage(state.sourceCanvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return c;
  }

  function normalizeCode(raw) {
    if (!raw) return '';
    let s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    // OCR confusions that are common in these charts.
    s = s.replace(/^([A-Z]{1,2})O(\d)$/,'$10$2');
    if (/^[A-Z]{1,2}[0-9]{1,2}$/.test(s)) return s;
    return '';
  }

  function rgbToHex(rgb) { return '#' + rgb.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join(''); }
  function luminance(rgb) { return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; }
  function colorDistance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  function sampleCellColor(ctx, x, y, w, h) {
    const mx = x + w * .5, my = y + h * .5;
    const rw = Math.max(2, Math.floor(w * .48)), rh = Math.max(2, Math.floor(h * .48));
    const sx = Math.max(0, Math.floor(mx - rw / 2)), sy = Math.max(0, Math.floor(my - rh / 2));
    const data = ctx.getImageData(sx, sy, Math.min(rw, ctx.canvas.width - sx), Math.min(rh, ctx.canvas.height - sy)).data;
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 150) continue;
      const r = Math.round(data[i] / 16) * 16, g = Math.round(data[i + 1] / 16) * 16, b = Math.round(data[i + 2] / 16) * 16;
      const key = `${r},${g},${b}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    let best = '255,255,255', n = -1;
    for (const [k, v] of buckets) if (v > n) { n = v; best = k; }
    return best.split(',').map(Number);
  }

  function cellInkScore(ctx, x, y, w, h) {
    const sx = Math.floor(x + w * .18), sy = Math.floor(y + h * .18), sw = Math.max(2, Math.floor(w * .64)), sh = Math.max(2, Math.floor(h * .64));
    const d = ctx.getImageData(sx, sy, Math.min(sw, ctx.canvas.width - sx), Math.min(sh, ctx.canvas.height - sy)).data;
    let dark = 0, total = 0;
    for (let i = 0; i < d.length; i += 4) {
      const L = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
      if (L < 105) dark++;
      total++;
    }
    return total ? dark / total : 0;
  }

  async function getWorker() {
    if (!window.Tesseract) throw new Error('OCR 组件没有加载成功，请确认网络后刷新页面。');
    if (state.worker) return state.worker;
    state.worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') setProgress('正在读取格内编号…', 30 + (m.progress || 0) * 58);
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
    const targetCell = rows * cols > 2500 ? 26 : rows * cols > 900 ? 34 : 48;
    const scale = Math.max(1, Math.min(4.5, targetCell / Math.max(6, Math.min(cellW, cellH))));
    const maxSide = 3600;
    const capped = Math.min(scale, maxSide / Math.max(crop.width, crop.height));
    const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(crop.width * capped)); out.height = Math.max(1, Math.round(crop.height * capped));
    const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(crop, 0, 0, out.width, out.height);
    return { canvas: out, scale: capped };
  }

  function wordsToCells(data, rows, cols, ocrW, ocrH) {
    const cellTexts = Array.from({ length: rows * cols }, () => []);
    const numericOnly = Array.from({ length: rows * cols }, () => []);
    const addToken = (text, bbox, confidence = 50) => {
      if (!text || !bbox) return;
      const cx = ((bbox.x0 || 0) + (bbox.x1 || 0)) / 2, cy = ((bbox.y0 || 0) + (bbox.y1 || 0)) / 2;
      const col = Math.floor(cx / ocrW * cols), row = Math.floor(cy / ocrH * rows);
      if (row < 0 || row >= rows || col < 0 || col >= cols) return;
      const idx = row * cols + col;
      const clean = String(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!clean) return;
      if (pureNumber.test(clean)) numericOnly[idx].push({ text: clean, x: bbox.x0 || 0, confidence });
      cellTexts[idx].push({ text: clean, x: bbox.x0 || 0, confidence });
    };
    if (data.symbols?.length) {
      for (const s of data.symbols) addToken(s.text, s.bbox, s.confidence);
    } else if (data.words?.length) {
      for (const w of data.words) addToken(w.text, w.bbox, w.confidence);
    }
    const out = cellTexts.map(items => {
      const sorted = items.sort((a, b) => a.x - b.x);
      const joined = normalizeCode(sorted.map(x => x.text).join(''));
      if (joined) return joined;
      for (const item of sorted) { const n = normalizeCode(item.text); if (n) return n; }
      return '';
    });
    return { codes: out, numericOnly };
  }

  function detectHeaderMargins(numericOnly, rows, cols) {
    const rowScore = Array(rows).fill(0), colScore = Array(cols).fill(0);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (numericOnly[r * cols + c].length) { rowScore[r]++; colScore[c]++; }
    }
    const top = rowScore[0] >= Math.min(8, Math.floor(cols * .35));
    const bottom = rowScore[rows - 1] >= Math.min(8, Math.floor(cols * .35));
    const left = colScore[0] >= Math.min(8, Math.floor(rows * .35));
    const right = colScore[cols - 1] >= Math.min(8, Math.floor(rows * .35));
    return { top, bottom, left, right };
  }

  function buildCells(crop, rows, cols, codes) {
    const ctx = crop.getContext('2d', { willReadFrequently: true });
    const cw = crop.width / cols, ch = crop.height / rows;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw, y = r * ch;
        const rgb = sampleCellColor(ctx, x, y, cw, ch);
        const ink = cellInkScore(ctx, x, y, cw, ch);
        const code = codes[r * cols + c] || '';
        const l = luminance(rgb);
        const spread = Math.max(...rgb) - Math.min(...rgb);
        const likelyColored = spread > 15 || l < 220;
        const likelyWhiteCode = ink > .018;
        cells.push({ r, c, code, rgb, hex: rgbToHex(rgb), ink, active: !!code || likelyColored || likelyWhiteCode, done: false });
      }
    }
    return cells;
  }

  function fillMissingCodesByColor(cells) {
    const known = new Map();
    for (const cell of cells) if (cell.code) {
      if (!known.has(cell.code)) known.set(cell.code, []);
      known.get(cell.code).push(cell.rgb);
    }
    const refs = [...known.entries()].map(([code, rgbs]) => ({
      code,
      rgb: [0, 1, 2].map(i => Math.round(rgbs.reduce((s, a) => s + a[i], 0) / rgbs.length))
    }));
    if (!refs.length) return;
    for (const cell of cells) {
      if (cell.code || !cell.active) continue;
      let best = null, bestD = Infinity;
      for (const ref of refs) { const d = colorDistance(cell.rgb, ref.rgb); if (d < bestD) { bestD = d; best = ref; } }
      if (best && bestD <= 42) { cell.code = best.code; cell.inferred = true; }
    }
  }

  function trimHeaderCells(cells, rows, cols, margins) {
    const r0 = margins.top ? 1 : 0, r1 = rows - (margins.bottom ? 1 : 0), c0 = margins.left ? 1 : 0, c1 = cols - (margins.right ? 1 : 0);
    if (r1 - r0 < 5 || c1 - c0 < 5) return { cells, rows, cols };
    const out = [];
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      const old = cells[r * cols + c];
      out.push({ ...old, r: r - r0, c: c - c0 });
    }
    return { cells: out, rows: r1 - r0, cols: c1 - c0 };
  }

  els.recognizeBtn.addEventListener('click', recognize);
  async function recognize() {
    if (!state.sourceCanvas) return;
    let cols = parseInt(els.colsInput.value, 10), rows = parseInt(els.rowsInput.value, 10);
    if (!(cols >= 5 && cols <= 120 && rows >= 5 && rows <= 120)) {
      showNotice('先填写正确的“列数”和“行数”。例如图纸顶部写 1–20、侧边写 1–20，就是 20 × 20。', 'warn');
      return;
    }
    setProgress('准备 OCR…', 8);
    els.recognizeBtn.disabled = true;
    try {
      const crop = cropCanvas();
      if (crop.width / cols < 5 || crop.height / rows < 5) throw new Error('每格像素太小。请上传更清晰的原图，或者缩小裁切范围。');
      const prepared = makeOCRCanvas(crop, rows, cols);
      setProgress('OCR 组件准备中…', 20);
      const worker = await getWorker();
      setProgress('正在读取格内编号…', 30);
      const result = await worker.recognize(prepared.canvas);
      const mapped = wordsToCells(result.data, rows, cols, prepared.canvas.width, prepared.canvas.height);
      let cells = buildCells(crop, rows, cols, mapped.codes);
      const margins = detectHeaderMargins(mapped.numericOnly, rows, cols);
      const trimmed = trimHeaderCells(cells, rows, cols, margins);
      cells = trimmed.cells; rows = trimmed.rows; cols = trimmed.cols;
      fillMissingCodesByColor(cells);

      const recognized = cells.filter(x => x.code).length;
      const active = cells.filter(x => x.active).length;
      if (!recognized) throw new Error('没有读到像 H5 / D12 / A22 这样的编号。请检查裁切和行列数是否对齐。');

      state.cells = cells; state.rows = rows; state.cols = cols; state.done.clear(); state.selectedCode = null; state.selectedCell = null;
      setProgress('正在生成可点击工作图…', 94);
      renderWork();
      setProgress('完成', 100);
      setTimeout(hideProgress, 450);
      els.workSection.classList.remove('hidden');
      const inferred = cells.filter(x => x.inferred).length;
      showNotice(`识别完成：读到 ${recognized} 个有编号格，另有 ${inferred} 格按底色自动补全。若个别编号读错，点那个格子后可以手动改。`, 'ok');
      els.workSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      hideProgress();
      showNotice(`识别失败：${err.message || err}`, 'error');
    } finally {
      els.recognizeBtn.disabled = false;
    }
  }

  function codeGroups() {
    const m = new Map();
    for (const cell of state.cells) if (cell.code) {
      if (!m.has(cell.code)) m.set(cell.code, { code: cell.code, cells: [], rgb: cell.rgb });
      m.get(cell.code).cells.push(cell);
    }
    return [...m.values()].sort((a, b) => b.cells.length - a.cells.length || a.code.localeCompare(b.code));
  }

  function renderWork() {
    renderStats(); renderPalette(); renderGrid(); updateCurrentCell();
  }

  function renderStats() {
    const groups = codeGroups();
    const coded = state.cells.filter(x => x.code).length;
    const done = state.done.size;
    const filteredTotal = state.selectedCode ? state.cells.filter(x => x.code === state.selectedCode).length : coded;
    const filteredDone = state.selectedCode ? state.cells.filter(x => x.code === state.selectedCode && state.done.has(`${x.r}:${x.c}`)).length : done;
    els.stats.innerHTML = `
      <div class="stat"><span>图纸</span><b>${state.cols}×${state.rows}</b></div>
      <div class="stat"><span>颜色</span><b>${groups.length}</b></div>
      <div class="stat"><span>${state.selectedCode ? '这一色' : '已识别'}</span><b>${filteredDone}/${filteredTotal}</b></div>`;
    els.activeCode.textContent = state.selectedCode || '全部';
  }

  function renderPalette() {
    const groups = codeGroups();
    els.palette.innerHTML = '';
    for (const g of groups) {
      const doneN = g.cells.filter(c => state.done.has(`${c.r}:${c.c}`)).length;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = `chip${state.selectedCode === g.code ? ' active' : ''}`;
      btn.innerHTML = `<div class="chip-color" style="background:${rgbToHex(g.rgb)}"></div><strong>${g.code}</strong><span>${doneN}/${g.cells.length} 颗</span>`;
      btn.addEventListener('click', () => { state.selectedCode = state.selectedCode === g.code ? null : g.code; renderWork(); });
      els.palette.appendChild(btn);
    }
  }

  els.showAllBtn.addEventListener('click', () => { state.selectedCode = null; renderWork(); });

  function contrastText(rgb) { return luminance(rgb) < 145 ? '#fff' : '#111'; }

  function renderGrid() {
    const cell = +els.zoomRange.value;
    els.zoomValue.textContent = cell;
    const header = Math.max(22, Math.round(cell * .82));
    const w = header + state.cols * cell + 1, h = header + state.rows * cell + 1;
    const c = els.gridCanvas; c.width = w * devicePixelRatio; c.height = h * devicePixelRatio; c.style.width = `${w}px`; c.style.height = `${h}px`;
    const ctx = c.getContext('2d'); ctx.scale(devicePixelRatio, devicePixelRatio); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4efe9'; ctx.fillRect(header, 0, state.cols * cell, header); ctx.fillRect(0, header, header, state.rows * cell);
    ctx.font = `700 ${Math.max(8, Math.min(12, cell * .3))}px system-ui`;
    ctx.fillStyle = '#4e4841';
    for (let col = 0; col < state.cols; col++) ctx.fillText(String(col + 1), header + col * cell + cell / 2, header / 2);
    for (let row = 0; row < state.rows; row++) ctx.fillText(String(row + 1), header / 2, header + row * cell + cell / 2);

    for (const item of state.cells) {
      const x = header + item.c * cell, y = header + item.r * cell;
      const match = !state.selectedCode || item.code === state.selectedCode;
      if (!item.active && !item.code) {
        ctx.fillStyle = '#fafafa'; ctx.fillRect(x, y, cell, cell);
      } else {
        ctx.fillStyle = item.hex || '#eee'; ctx.globalAlpha = match ? 1 : .12; ctx.fillRect(x, y, cell, cell); ctx.globalAlpha = 1;
      }
      if (item.code && match && cell >= 26) {
        ctx.fillStyle = contrastText(item.rgb); ctx.font = `700 ${Math.max(8, Math.min(12, cell * .29))}px ui-monospace,SFMono-Regular,Menlo,monospace`; ctx.fillText(item.code, x + cell / 2, y + cell / 2);
      } else if (item.code && match && cell < 26) {
        ctx.fillStyle = contrastText(item.rgb); ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, Math.max(2, cell * .12), 0, Math.PI * 2); ctx.fill();
      }
      const key = `${item.r}:${item.c}`;
      if (state.done.has(key)) {
        ctx.save(); ctx.globalAlpha = .72; ctx.strokeStyle = contrastText(item.rgb); ctx.lineWidth = Math.max(2, cell * .08); ctx.beginPath(); ctx.moveTo(x + cell * .22, y + cell * .52); ctx.lineTo(x + cell * .43, y + cell * .72); ctx.lineTo(x + cell * .78, y + cell * .28); ctx.stroke(); ctx.restore();
      }
      if (state.selectedCell && state.selectedCell.r === item.r && state.selectedCell.c === item.c) {
        ctx.strokeStyle = '#ff4f2d'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      }
    }
    // Fine grid.
    for (let col = 0; col <= state.cols; col++) {
      const x = header + col * cell + .5; ctx.beginPath(); ctx.moveTo(x, header); ctx.lineTo(x, header + state.rows * cell); ctx.strokeStyle = col % 5 === 0 ? '#151515' : 'rgba(0,0,0,.18)'; ctx.lineWidth = col % 5 === 0 ? 2.2 : .7; ctx.stroke();
    }
    for (let row = 0; row <= state.rows; row++) {
      const y = header + row * cell + .5; ctx.beginPath(); ctx.moveTo(header, y); ctx.lineTo(header + state.cols * cell, y); ctx.strokeStyle = row % 5 === 0 ? '#151515' : 'rgba(0,0,0,.18)'; ctx.lineWidth = row % 5 === 0 ? 2.2 : .7; ctx.stroke();
    }
    ctx.strokeStyle = '#d7cec4'; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, w - 1, h - 1);
    c.dataset.header = header;
  }

  els.zoomRange.addEventListener('input', renderGrid);

  els.gridCanvas.addEventListener('click', (e) => {
    const rect = els.gridCanvas.getBoundingClientRect();
    const sx = els.gridCanvas.width / devicePixelRatio / rect.width, sy = els.gridCanvas.height / devicePixelRatio / rect.height;
    const x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy;
    const cell = +els.zoomRange.value, header = +els.gridCanvas.dataset.header || Math.max(22, Math.round(cell * .82));
    const col = Math.floor((x - header) / cell), row = Math.floor((y - header) / cell);
    if (row < 0 || col < 0 || row >= state.rows || col >= state.cols) return;
    const item = state.cells[row * state.cols + col];
    state.selectedCell = item;
    const key = `${row}:${col}`;
    if (item.code && (!state.selectedCode || item.code === state.selectedCode)) {
      if (state.done.has(key)) state.done.delete(key); else state.done.add(key);
    }
    renderWork();
  });

  function updateCurrentCell() {
    const c = state.selectedCell;
    if (!c) { els.currentCell.classList.add('hidden'); els.editCodeInput.value = ''; return; }
    els.currentCell.classList.remove('hidden');
    const blockX = Math.floor(c.c / 5) + 1, blockY = Math.floor(c.r / 5) + 1, localX = c.c % 5 + 1, localY = c.r % 5 + 1;
    els.currentCell.innerHTML = `<b>${c.code || '未识别'}</b> · 总坐标 第 ${c.r + 1} 行 / 第 ${c.c + 1} 列<br>实体 5×5 模块：第 ${blockY} 行模块 × 第 ${blockX} 列模块；模块内第 ${localY} 行 / 第 ${localX} 列`;
    els.editCodeInput.value = c.code || '';
  }

  els.saveCodeBtn.addEventListener('click', () => {
    if (!state.selectedCell) return toast('请先点一个格子');
    const code = normalizeCode(els.editCodeInput.value);
    if (!code) return toast('编号格式例如 H5、D12、A22');
    state.selectedCell.code = code; state.selectedCell.active = true; state.selectedCell.inferred = false;
    renderWork(); toast('已修改编号');
  });

  els.nextBtn.addEventListener('click', () => {
    const candidates = state.cells.filter(c => c.code && (!state.selectedCode || c.code === state.selectedCode) && !state.done.has(`${c.r}:${c.c}`));
    if (!candidates.length) return toast(state.selectedCode ? `${state.selectedCode} 已全部完成` : '没有未完成的已识别格子');
    const next = candidates[0]; state.selectedCell = next; renderWork(); scrollCellIntoView(next); updateCurrentCell();
  });

  function scrollCellIntoView(c) {
    const cell = +els.zoomRange.value, header = +els.gridCanvas.dataset.header || 24;
    const x = header + c.c * cell + cell / 2, y = header + c.r * cell + cell / 2;
    els.gridScroller.scrollTo({ left: Math.max(0, x - els.gridScroller.clientWidth / 2), top: Math.max(0, y - els.gridScroller.clientHeight / 2), behavior: 'smooth' });
  }

  els.resetBtn.addEventListener('click', () => {
    if (!confirm('清空当前图纸和完成标记？')) return;
    state.file = null; state.image = null; state.sourceCanvas = null; state.cells = []; state.done.clear(); state.selectedCode = null; state.selectedCell = null;
    els.sourceSection.classList.add('hidden'); els.workSection.classList.add('hidden'); clearUploadError(); hideProgress(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('beforeunload', () => { try { state.worker?.terminate?.(); } catch (_) {} });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
