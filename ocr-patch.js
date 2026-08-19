(() => {
  'use strict';

  // V4 OCR patch: the app already knows the exact row/column grid.
  // Instead of asking Tesseract to read hundreds of tiny codes on one dense sheet,
  // this removes each cell background/grid, enlarges the text, and OCRs clean row batches.
  const T = window.Tesseract;
  if (!T || typeof T.createWorker !== 'function' || T.__pindouGridPatch) return;
  T.__pindouGridPatch = true;

  const originalCreateWorker = T.createWorker.bind(T);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function dominantBg(ctx, x, y, w, h) {
    // Keep away from the border/grid; quantize so JPEG noise does not split one color.
    const px = Math.max(1, w * 0.13), py = Math.max(1, h * 0.13);
    const sx = clamp(Math.floor(x + px), 0, ctx.canvas.width - 1);
    const sy = clamp(Math.floor(y + py), 0, ctx.canvas.height - 1);
    const sw = Math.max(1, Math.min(ctx.canvas.width - sx, Math.floor(w - px * 2)));
    const sh = Math.max(1, Math.min(ctx.canvas.height - sy, Math.floor(h - py * 2)));
    const d = ctx.getImageData(sx, sy, sw, sh).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 100) continue;
      const r = Math.round(d[i] / 12) * 12;
      const g = Math.round(d[i + 1] / 12) * 12;
      const b = Math.round(d[i + 2] / 12) * 12;
      const k = `${r},${g},${b}`;
      buckets.set(k, (buckets.get(k) || 0) + 1);
    }
    let best = '255,255,255', n = -1;
    for (const [k, count] of buckets) {
      if (count > n) { n = count; best = k; }
    }
    return best.split(',').map(Number);
  }

  function makeTextTile(ctx, x, y, w, h, tileW, tileH) {
    // Crop 10% from every side so grid lines never enter OCR.
    const mx = Math.max(1, w * 0.10), my = Math.max(1, h * 0.10);
    const sx = clamp(Math.floor(x + mx), 0, ctx.canvas.width - 1);
    const sy = clamp(Math.floor(y + my), 0, ctx.canvas.height - 1);
    const sw = Math.max(1, Math.min(ctx.canvas.width - sx, Math.floor(w - mx * 2)));
    const sh = Math.max(1, Math.min(ctx.canvas.height - sy, Math.floor(h - my * 2)));
    const src = ctx.getImageData(sx, sy, sw, sh);
    const bg = dominantBg(ctx, x, y, w, h);
    const bgLum = .2126 * bg[0] + .7152 * bg[1] + .0722 * bg[2];

    const raw = document.createElement('canvas');
    raw.width = sw; raw.height = sh;
    const rctx = raw.getContext('2d');
    const out = rctx.createImageData(sw, sh);
    let foreground = 0;

    for (let i = 0; i < src.data.length; i += 4) {
      const R = src.data[i], G = src.data[i + 1], B = src.data[i + 2], A = src.data[i + 3];
      const dist = Math.hypot(R - bg[0], G - bg[1], B - bg[2]);
      const lum = .2126 * R + .7152 * G + .0722 * B;
      // Works for black letters on pastel/white cells AND white letters on dark cells.
      // Checkerboard/background compression is much weaker than printed text.
      let fg = A > 80 && dist > 33 && Math.abs(lum - bgLum) > 27;
      if (fg) foreground++;
      const v = fg ? 0 : 255;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    rctx.putImageData(out, 0, 0);

    const tile = document.createElement('canvas');
    tile.width = tileW; tile.height = tileH;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, tileW, tileH);
    const pad = Math.max(5, Math.floor(Math.min(tileW, tileH) * 0.10));
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(raw, pad, pad, tileW - pad * 2, tileH - pad * 2);
    return { canvas: tile, ink: foreground / Math.max(1, sw * sh) };
  }

  function sanitizeToken(raw) {
    let s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s) return '';
    if (/^[A-Z]{1,2}\d{1,2}$/.test(s)) return s;

    // Typical code OCR mistakes: H5→HS, H2→HZ, D12→DI2, C20→C2O.
    const m = s.match(/^([A-Z]{1,2})([0-9OILSZGB]{1,3})$/);
    if (m) {
      const number = m[2]
        .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/Z/g, '2')
        .replace(/S/g, '5').replace(/G/g, '6').replace(/B/g, '8');
      const fixed = m[1] + number;
      if (/^[A-Z]{1,2}\d{1,2}$/.test(fixed)) return fixed;
    }
    return '';
  }

  function batchCanvas(source, rows, cols, rowStart, rowEnd) {
    const ctx = source.getContext('2d', { willReadFrequently: true });
    const cellW = source.width / cols, cellH = source.height / rows;
    const total = rows * cols;
    const dense = total > 2500;
    const tileW = dense ? 58 : 82;
    const tileH = dense ? 42 : 58;
    const gapX = dense ? 12 : 18;
    const gapY = dense ? 10 : 14;
    const slotW = tileW + gapX, slotH = tileH + gapY;
    const batchRows = rowEnd - rowStart;

    const canvas = document.createElement('canvas');
    canvas.width = cols * slotW + gapX;
    canvas.height = batchRows * slotH + gapY;
    const out = canvas.getContext('2d');
    out.fillStyle = '#fff';
    out.fillRect(0, 0, canvas.width, canvas.height);

    const ink = new Float32Array(batchRows * cols);
    for (let r = rowStart; r < rowEnd; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = makeTextTile(ctx, c * cellW, r * cellH, cellW, cellH, tileW, tileH);
        ink[(r - rowStart) * cols + c] = tile.ink;
        out.drawImage(tile.canvas, gapX / 2 + c * slotW, gapY / 2 + (r - rowStart) * slotH);
      }
    }
    return { canvas, slotW, slotH, rowStart, rowEnd, ink };
  }

  function wordsToOriginal(words, batch, source, rows, cols) {
    const result = [];
    const cw = source.width / cols, ch = source.height / rows;
    const bestByCell = new Map();

    for (const word of words || []) {
      if (!word.bbox) continue;
      const code = sanitizeToken(word.text);
      if (!code) continue;
      const cx = ((word.bbox.x0 || 0) + (word.bbox.x1 || 0)) / 2;
      const cy = ((word.bbox.y0 || 0) + (word.bbox.y1 || 0)) / 2;
      const c = Math.floor(cx / batch.slotW);
      const localR = Math.floor(cy / batch.slotH);
      const r = batch.rowStart + localR;
      if (c < 0 || c >= cols || r < batch.rowStart || r >= batch.rowEnd) continue;

      const ink = batch.ink[localR * cols + c];
      if (ink < 0.008 || ink > 0.46) continue;
      const key = `${r},${c}`;
      const conf = Number(word.confidence || 0);
      const prev = bestByCell.get(key);
      if (!prev || conf > prev.confidence) bestByCell.set(key, { r, c, code, confidence: conf });
    }

    for (const item of bestByCell.values()) {
      // Return synthetic word boxes in the ORIGINAL OCR canvas coordinate system.
      // The existing app will map these boxes back into cells as usual.
      const x0 = item.c * cw + cw * .22;
      const x1 = (item.c + 1) * cw - cw * .22;
      const y0 = item.r * ch + ch * .22;
      const y1 = (item.r + 1) * ch - ch * .22;
      result.push({
        text: item.code,
        confidence: item.confidence,
        bbox: { x0, y0, x1, y1 }
      });
    }
    return result;
  }

  T.createWorker = async (...args) => {
    const worker = await originalCreateWorker(...args);
    const rawRecognize = worker.recognize.bind(worker);
    const rawSetParameters = worker.setParameters.bind(worker);

    return new Proxy(worker, {
      get(target, prop) {
        if (prop === 'recognize') {
          return async (image, options, output) => {
            const cols = parseInt(document.getElementById('colsInput')?.value || '', 10);
            const rows = parseInt(document.getElementById('rowsInput')?.value || '', 10);
            const isCanvas = image && typeof image.getContext === 'function' && image.width && image.height;
            if (!isCanvas || !cols || !rows || cols < 1 || rows < 1 || cols > 160 || rows > 160) {
              return rawRecognize(image, options, output);
            }

            const total = cols * rows;
            const rowsPerBatch = total > 3000 ? 5 : total > 1200 ? 7 : Math.min(rows, 10);
            const allWords = [];
            try {
              await rawSetParameters({
                tessedit_pageseg_mode: '6',
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                preserve_interword_spaces: '1',
                user_defined_dpi: '220'
              });

              for (let rs = 0; rs < rows; rs += rowsPerBatch) {
                const re = Math.min(rows, rs + rowsPerBatch);
                const batch = batchCanvas(image, rows, cols, rs, re);
                const sub = await rawRecognize(batch.canvas);
                allWords.push(...wordsToOriginal(sub.data?.words || [], batch, image, rows, cols));
              }

              // If preprocessing somehow finds nothing, keep the old OCR as a safety net.
              if (!allWords.length) return rawRecognize(image, options, output);
              return {
                data: {
                  words: allWords,
                  text: allWords.map(w => w.text).join(' '),
                  confidence: allWords.reduce((s, w) => s + (w.confidence || 0), 0) / Math.max(1, allWords.length)
                }
              };
            } catch (err) {
              console.warn('[pindou OCR patch] enhanced OCR failed; falling back', err);
              return rawRecognize(image, options, output);
            }
          };
        }
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };
})();
