const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// The crop is always expressed in original image pixels. The same rectangle is
// used for the preview and export, so the saved image is exactly what was chosen.
export function getCropRect({ imageWidth, imageHeight, aspect, zoom = 1, centerX = imageWidth / 2, centerY = imageHeight / 2 }) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const width = Math.min(imageWidth, imageHeight * ratio) / clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const height = width / ratio;
  const x = clamp(centerX - width / 2, 0, Math.max(0, imageWidth - width));
  const y = clamp(centerY - height / 2, 0, Math.max(0, imageHeight - height));
  return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

export function zoomCropAt(state, zoom, anchorX = .5, anchorY = .5) {
  const before = getCropRect(state);
  const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const after = getCropRect({ ...state, zoom: nextZoom });
  return {
    ...state,
    zoom: nextZoom,
    centerX: before.x + before.width * anchorX + (.5 - anchorX) * after.width,
    centerY: before.y + before.height * anchorY + (.5 - anchorY) * after.height,
  };
}

export function getCropOutputSize(rect, kind) {
  const longest = kind === 'cover' ? 1800 : 2560;
  const scale = Math.min(1, longest / Math.max(rect.width, rect.height));
  return { width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) };
}

async function decodeImage(file) {
  if (file.size > 24 * 1024 * 1024) throw new Error('图片超过 24 MB，请选择较小的图片。');
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('请选择 JPG、PNG、WebP 等图片，暂不支持 SVG。');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('无法读取这张图片，请换一张 JPG、PNG 或 WebP 图片。'); }
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 64000000) {
    bitmap.close();
    throw new Error('图片尺寸过大，请缩小到 6400 万像素以内。');
  }
  return bitmap;
}

async function exportImage(bitmap, rect, kind) {
  const size = getCropOutputSize(rect, kind);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理图片，请更新浏览器后重试。');
  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .92));
    if (!blob || blob.type !== 'image/webp') throw new Error('此浏览器不支持保存 WebP 图片，请使用新版 Chrome 或 Edge。');
    return blob;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

export function createImageCropEditor({ icon, dialog = document.querySelector('#imageCropDialog') }) {
  let current = null;
  let pending = false;
  let paintId = 0;
  const pointers = new Map();
  let gesture = null;

  const $ = selector => dialog.querySelector(selector);
  const glyph = name => icon?.(name) || '';
  function setState(patch) {
    current.state = { ...current.state, ...patch };
    const bounded = getCropRect(current.state);
    current.state.centerX = bounded.centerX;
    current.state.centerY = bounded.centerY;
    schedulePaint();
  }
  function schedulePaint() {
    if (current && !paintId) paintId = requestAnimationFrame(() => { paintId = 0; paint(); });
  }
  function paint() {
    if (!current) return;
    const stage = $('#imageCropStage');
    const canvas = stage.querySelector('canvas');
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const rect = getCropRect(current.state);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(box.width * dpr));
    const height = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法预览图片，请更新浏览器后重试。');
    context.clearRect(0, 0, width, height);
    context.drawImage(current.bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
    Object.assign(stage.dataset, {
      sourceWidth: String(current.bitmap.width), sourceHeight: String(current.bitmap.height),
      cropX: String(rect.x), cropY: String(rect.y), cropWidth: String(rect.width), cropHeight: String(rect.height),
    });
    const range = $('#imageCropZoom');
    range.value = String(current.state.zoom);
    range.setAttribute('aria-valuetext', `${Math.round(current.state.zoom * 100)}%`);
    $('#imageCropZoomValue').textContent = `${Math.round(current.state.zoom * 100)}%`;
    $('[data-crop-action="zoom-out"]').disabled = current.busy || current.state.zoom <= MIN_ZOOM;
    $('[data-crop-action="zoom-in"]').disabled = current.busy || current.state.zoom >= MAX_ZOOM;
    const size = getCropOutputSize(rect, current.kind);
    $('#imageCropOutput').textContent = `${size.width} × ${size.height} px`;
  }
  function reset() {
    if (!current || current.busy) return;
    setState({ zoom: 1, centerX: current.bitmap.width / 2, centerY: current.bitmap.height / 2 });
  }
  function panImage(dx, dy) {
    const stage = $('#imageCropStage').getBoundingClientRect();
    const crop = getCropRect(current.state);
    setState({ centerX: current.state.centerX - dx * crop.width / stage.width, centerY: current.state.centerY - dy * crop.height / stage.height });
  }
  function changeZoom(zoom, x = .5, y = .5) {
    if (!current || current.busy) return;
    setState(zoomCropAt(current.state, zoom, x, y));
  }
  function setBusy(busy) {
    current.busy = busy;
    dialog.setAttribute('aria-busy', String(busy));
    dialog.querySelectorAll('button,input').forEach(control => { control.disabled = busy; });
    $('#imageCropStage').setAttribute('aria-disabled', String(busy));
    $('[data-crop-action="save"]').textContent = busy ? '正在保存…' : '保存并应用';
    $('#imageCropStatus').textContent = busy ? '正在保存图片，请稍候。' : '';
    paint();
  }
  function finish(saved, failure) {
    if (!current || current.busy) return;
    const previous = current;
    current = null;
    pointers.clear(); gesture = null;
    if (paintId) cancelAnimationFrame(paintId);
    paintId = 0;
    previous.observer?.disconnect();
    previous.bitmap.close();
    if (dialog.open) dialog.close(saved ? 'saved' : 'cancelled');
    dialog.innerHTML = '';
    dialog.removeAttribute('aria-busy');
    document.body.style.overflow = previous.overflow;
    document.documentElement.style.scrollbarGutter = previous.scrollbarGutter;
    window.scrollTo(previous.scrollX, previous.scrollY);
    if (failure) previous.reject(failure); else previous.resolve(saved);
  }
  async function save() {
    if (!current || current.busy) return;
    $('#imageCropError').textContent = '';
    pointers.clear(); gesture = null;
    setBusy(true);
    try {
      const blob = await exportImage(current.bitmap, getCropRect(current.state), current.kind);
      await current.onSave(blob);
      setBusy(false);
      finish(true);
    } catch (cause) {
      setBusy(false);
      $('#imageCropError').textContent = cause.message || '图片未能保存，请重试。';
      $('#imageCropStatus').textContent = '未保存，可重试或取消。';
      $('#imageCropError').focus();
    }
  }
  function startGesture() {
    if (pointers.size < 2) { gesture = null; return; }
    const [a, b] = [...pointers.values()];
    const box = $('#imageCropStage').getBoundingClientRect();
    const crop = getCropRect(current.state);
    const x = ((a.x + b.x) / 2 - box.left) / box.width;
    const y = ((a.y + b.y) / 2 - box.top) / box.height;
    gesture = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: current.state.zoom, sourceX: crop.x + crop.width * x, sourceY: crop.y + crop.height * y };
  }
  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-crop-action]')?.dataset.cropAction;
    if (!action || !current || current.busy) return;
    if (action === 'save') void save();
    else if (action === 'cancel') finish(false);
    else if (action === 'reset') reset();
    else if (action === 'zoom-in') changeZoom(current.state.zoom + .1);
    else if (action === 'zoom-out') changeZoom(current.state.zoom - .1);
    else if (action === 'left') panImage(-24, 0);
    else if (action === 'right') panImage(24, 0);
    else if (action === 'up') panImage(0, -24);
    else if (action === 'down') panImage(0, 24);
  });
  // Capture backdrop clicks before the app's shared dialog dismiss handler. A
  // save in progress must not leave the editor or accidentally discard the crop.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || !current) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!current.busy) finish(false);
  }, true);
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (current && !current.busy) finish(false); });
  dialog.addEventListener('close', () => { if (!dialog.open && current && !current.busy) finish(false); });
  dialog.addEventListener('input', event => {
    if (event.target.id === 'imageCropZoom') changeZoom(Number(event.target.value));
  });
  dialog.addEventListener('pointerdown', event => {
    if (!current || current.busy || !event.target.closest('#imageCropStage') || event.button !== 0) return;
    event.preventDefault();
    const stage = $('#imageCropStage');
    stage.focus({ preventScroll: true });
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.classList.add('is-dragging');
    startGesture();
  });
  dialog.addEventListener('pointermove', event => {
    if (!current || current.busy || !pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && gesture) {
      const [a, b] = [...pointers.values()];
      const box = $('#imageCropStage').getBoundingClientRect();
      const zoom = clamp(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance, MIN_ZOOM, MAX_ZOOM);
      const crop = getCropRect({ ...current.state, zoom });
      const x = ((a.x + b.x) / 2 - box.left) / box.width;
      const y = ((a.y + b.y) / 2 - box.top) / box.height;
      setState({ zoom, centerX: gesture.sourceX + (.5 - x) * crop.width, centerY: gesture.sourceY + (.5 - y) * crop.height });
    } else panImage(event.clientX - previous.x, event.clientY - previous.y);
  });
  const stopPointer = event => {
    if (!current || !pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!pointers.size) $('#imageCropStage').classList.remove('is-dragging');
    startGesture();
  };
  dialog.addEventListener('pointerup', stopPointer);
  dialog.addEventListener('pointercancel', stopPointer);
  dialog.addEventListener('lostpointercapture', stopPointer);
  dialog.addEventListener('wheel', event => {
    if (!current || current.busy || !event.target.closest('#imageCropStage')) return;
    event.preventDefault();
    const box = $('#imageCropStage').getBoundingClientRect();
    changeZoom(current.state.zoom * Math.exp(-event.deltaY * .0015), clamp((event.clientX - box.left) / box.width, 0, 1), clamp((event.clientY - box.top) / box.height, 0, 1));
  }, { passive: false });
  dialog.addEventListener('keydown', event => {
    if (!current || current.busy || event.target.id !== 'imageCropStage') return;
    const step = event.shiftKey ? 40 : 12;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) { event.preventDefault(); panImage(...moves[event.key]); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(current.state.zoom + .1); }
    else if (event.key === '-') { event.preventDefault(); changeZoom(current.state.zoom - .1); }
    else if (event.key === 'Home') { event.preventDefault(); reset(); }
  });
  window.addEventListener('resize', schedulePaint);

  return {
    async open({ file, kind, aspect, onSave, onReady }) {
      if (pending || current) throw new Error('请先完成当前图片的编辑。');
      pending = true;
      let bitmap;
      try { bitmap = await decodeImage(file); }
      finally { pending = false; }
      const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
      const title = kind === 'cover' ? '调整封面展示区域' : '调整壁纸展示区域';
      dialog.innerHTML = `<div class="image-crop-heading"><div><h2 id="imageCropTitle">${title}</h2><p id="imageCropHelp">拖动图片选择位置，滚轮或滑条调整大小。</p></div><button class="icon-btn" data-crop-action="cancel" aria-label="取消图片编辑">${glyph('close')}</button></div><div class="image-crop-body"><div class="image-crop-stage-wrap"><div id="imageCropStage" class="image-crop-stage" style="--crop-aspect:${ratio}" tabindex="0" role="group" aria-label="图片展示区域，可用方向键移动，按加减键缩放" aria-describedby="imageCropHelp"><canvas aria-hidden="true"></canvas><span class="image-crop-guides" aria-hidden="true"></span></div></div><div class="image-crop-preview-note"><span>框内即为保存后的展示区域</span><output id="imageCropOutput"></output></div><div class="image-crop-zoom"><label for="imageCropZoom">缩放</label><button class="image-crop-step" data-crop-action="zoom-out" aria-label="缩小图片">−</button><input id="imageCropZoom" type="range" min="1" max="4" step="0.01" value="1"><button class="image-crop-step" data-crop-action="zoom-in" aria-label="放大图片">+</button><output id="imageCropZoomValue" for="imageCropZoom">100%</output></div><div class="image-crop-position"><span>移动图片</span><div class="image-crop-pan" role="group" aria-label="移动图片位置"><button class="image-crop-step" data-crop-action="left" aria-label="向左移动图片">${glyph('left')}</button><button class="image-crop-step" data-crop-action="right" aria-label="向右移动图片">${glyph('chevron')}</button><button class="image-crop-step crop-pan-up" data-crop-action="up" aria-label="向上移动图片">${glyph('left')}</button><button class="image-crop-step crop-pan-down" data-crop-action="down" aria-label="向下移动图片">${glyph('chevron')}</button></div><button class="text-btn" data-crop-action="reset">重置位置</button></div><p id="imageCropError" class="form-error" role="alert" tabindex="-1"></p><p id="imageCropStatus" class="image-crop-status" role="status" aria-live="polite"></p></div><div class="image-crop-footer"><button class="btn" data-crop-action="cancel">取消</button><button class="btn primary" data-crop-action="save">保存并应用</button></div>`;
      return new Promise((resolve, reject) => {
        current = { bitmap, kind, onSave, resolve, reject, busy: false, overflow: document.body.style.overflow, scrollbarGutter: document.documentElement.style.scrollbarGutter, scrollX: window.scrollX, scrollY: window.scrollY, state: { imageWidth: bitmap.width, imageHeight: bitmap.height, aspect: ratio, zoom: 1, centerX: bitmap.width / 2, centerY: bitmap.height / 2 } };
        try {
          onReady?.();
          document.documentElement.style.scrollbarGutter = 'stable';
          document.body.style.overflow = 'hidden';
          dialog.showModal();
          current.observer = new ResizeObserver(schedulePaint);
          current.observer.observe($('#imageCropStage'));
          paint();
          $('#imageCropStage').focus({ preventScroll: true });
        } catch (cause) {
          finish(false, cause);
        }
      });
    },
  };
}
