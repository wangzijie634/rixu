/* A static, image-backed glass lens. Only the wallpaper is refracted: the
   application's real text and controls stay in an independent DOM layer. */
const PANELS = '.activity-card, .focus-card, .studio-calendar, .snippet-card, .studio-agenda, .studio-brand';
const WALLPAPER_TEXT = '.studio-heading > div, .studio-metrics > div, .rhythm-label, .page-heading > div:first-child, .breadcrumb-row, .result-label, .page-footer';
const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * .5 + .5;
    gl_Position = vec4(aPosition, 0., 1.);
  }
`;
const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D uWallpaper;
  uniform vec2 uPanel;
  uniform vec2 uPosition;
  uniform vec2 uViewport;
  uniform vec2 uImage;
  uniform float uRadius;
  uniform vec2 uLight;
  varying vec2 vUv;

  vec3 wallpaper(vec2 screen) {
    float scale = max(uViewport.x / uImage.x, uViewport.y / uImage.y);
    vec2 displayed = uImage * scale;
    vec2 origin = (uViewport - displayed) * .5;
    return texture2D(uWallpaper, clamp((screen - origin) / displayed, .001, .999)).rgb;
  }

  void main() {
    // Work in top-left CSS pixels, exactly like background-size:cover with a
    // fixed, centered wallpaper. Pixel density never changes this mapping.
    vec2 local = vec2(vUv.x, 1. - vUv.y) * uPanel;
    vec2 center = local - uPanel * .5;
    float radius = min(uRadius, min(uPanel.x, uPanel.y) * .5);
    vec2 q = abs(center) - (uPanel * .5 - radius);
    float sdf = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
    float depth = max(-sdf, 0.);
    vec2 normal;
    if (q.x > 0. && q.y > 0.) normal = normalize(max(q, .0001));
    else normal = q.x > q.y ? vec2(1., 0.) : vec2(0., 1.);
    normal *= sign(center + vec2(.0001));

    // The thick convex rim bends a sharp view of the actual image. The
    // center is almost flat, so this reads as clear glass rather than frost.
    float width = min(clamp(min(uPanel.x, uPanel.y) * .075, 18., 28.), min(uPanel.x, uPanel.y) * .24);
    float edge = 1. - smoothstep(0., width, depth);
    float bend = pow(edge, 1.65) * width * .86;
    vec2 centerPull = center * .002;
    vec2 ray = uPosition + local - normal * bend - centerPull;
    float dispersion = pow(edge, 2.1) * 2.3;
    vec3 red = wallpaper(ray + normal * dispersion);
    vec3 green = wallpaper(ray);
    vec3 blue = wallpaper(ray - normal * dispersion);
    vec3 color = vec3(red.r, green.g, blue.b);

    // Subpixel frosting belongs to the transmitted image, never the DOM text.
    // Preserve the sharp rim; a tiny five-tap kernel calms the flat interior.
    float interior = 1. - edge;
    float frost = 1.25;
    vec3 softened = (green * 4.
      + wallpaper(ray + vec2(frost, 0.)) + wallpaper(ray - vec2(frost, 0.))
      + wallpaper(ray + vec2(0., frost)) + wallpaper(ray - vec2(0., frost))) / 8.;
    color = mix(color, softened, interior * .68);
    float luminance = dot(color, vec3(.2126, .7152, .0722));
    color = mix(vec3(luminance), color, 1.045);

    // A narrow Fresnel reflection and a second interior bevel are visible
    // on an otherwise completely transparent, unblurred surface.
    float fresnel = pow(edge, 5.);
    float restingLight = .42 + .58 * max(dot(normal, normalize(vec2(-.65, -.8))), 0.);
    float pointerLight = .25 + .75 * max(dot(normal, normalize(uLight + vec2(.0001))), 0.);
    float light = mix(restingLight, pointerLight, min(length(uLight), 1.) * .8);
    float rim = exp(-pow((depth - 1.4) / 1.2, 2.));
    float bevel = exp(-pow((depth - 7.) / 1.9, 2.));
    color = mix(color, vec3(.95, .98, 1.), fresnel * light * .17 + rim * (.12 + light * .25));
    color += bevel * vec3(.012, .017, .022);
    color *= 1. - exp(-pow((depth - 4.) / 1.7, 2.)) * .065;
    gl_FragColor = vec4(clamp(color, 0., 1.), 1.);
  }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('No shader allocation');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error('Glass shader unavailable');
  }
  return shader;
}

function createRenderer(onLost) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: true, powerPreference: 'low-power',
  });
  if (!gl) throw new Error('WebGL unavailable');
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('No program allocation');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Glass program unavailable');
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const uniforms = Object.fromEntries(['uPanel', 'uPosition', 'uViewport', 'uImage', 'uRadius', 'uLight', 'uWallpaper']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(uniforms.uWallpaper, 0);
  const lost = event => { event.preventDefault(); onLost(); };
  canvas.addEventListener('webglcontextlost', lost);
  let imageWidth = 1;
  let imageHeight = 1;

  return {
    upload(image) {
      const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      let source = image;
      if (Math.max(image.naturalWidth, image.naturalHeight) > maxSize) {
        source = document.createElement('canvas');
        const ratio = maxSize / Math.max(image.naturalWidth, image.naturalHeight);
        source.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        source.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Glass texture unavailable');
      imageWidth = image.naturalWidth;
      imageHeight = image.naturalHeight;
    },
    draw(target, rect, viewport, radius, light) {
      // One shared GPU context serves every card, including long snippet lists.
      // Only visible cards are copied; no animation loop runs while idle.
      let density = Math.min(window.devicePixelRatio || 1, 1.25);
      density = Math.min(density, Math.sqrt(1100000 / (rect.width * rect.height)));
      const width = Math.max(1, Math.round(rect.width * density));
      const height = Math.max(1, Math.round(rect.height * density));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.uPanel, rect.width, rect.height);
      gl.uniform2f(uniforms.uPosition, rect.left, rect.top);
      gl.uniform2f(uniforms.uViewport, viewport.width, viewport.height);
      gl.uniform2f(uniforms.uImage, imageWidth, imageHeight);
      gl.uniform1f(uniforms.uRadius, radius);
      gl.uniform2f(uniforms.uLight, light.x, light.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (gl.isContextLost()) throw new Error('Glass context lost');
      if (target.width !== width) target.width = width;
      if (target.height !== height) target.height = height;
      const output = target.getContext('2d', { alpha: false });
      if (!output) throw new Error('Canvas unavailable');
      output.drawImage(canvas, 0, 0);
    },
    destroy() {
      canvas.removeEventListener('webglcontextlost', lost);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.width = canvas.height = 1;
    },
  };
}

function wallpaperSource() {
  const value = document.body.dataset.wallpaperSrc;
  const css = document.body.style.getPropertyValue('--wallpaper-image').trim();
  const raw = value || /^url\(["']?(.*?)["']?\)$/.exec(css)?.[1];
  if (!raw) return '';
  try {
    const url = new URL(raw, location.href);
    return url.origin === location.origin ? url.href : '';
  } catch { return ''; }
}

export function initGlassOptics() {
  const panels = new Map();
  const root = document.documentElement;
  const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 24;
  sampleCanvas.height = 16;
  const sampler = sampleCanvas.getContext('2d', { willReadFrequently: true });
  let renderer = null;
  let rendererFailed = false;
  let image = null;
  let source = '';
  let loading = false;
  let uploadedSource = '';
  let imageGeneration = 0;
  let frame = 0;
  let destroyed = false;
  let force = true;
  let resizeObserver;
  let textToneCache = new WeakMap();
  const panelToneCache = new Map();
  let motionDeadline = 0;
  let illuminatedPanel = null;

  const glassEnabled = () => root.dataset.material !== 'plain' && !reducedTransparency.matches;
  function fallback(active) {
    if (active) document.body.dataset.glassFallback = 'true';
    else delete document.body.dataset.glassFallback;
  }

  function hide(panel, entry) {
    panel.classList.remove('glass-optics-ready');
    delete panel.dataset.glassTone;
    entry.canvas.hidden = true;
    entry.signature = '';
  }
  function hidePanels() {
    for (const [panel, entry] of panels) hide(panel, entry);
  }
  function hideAll() {
    hidePanels();
    delete document.body.dataset.wallpaperTone;
    for (const element of document.querySelectorAll('[data-wallpaper-text-tone]')) delete element.dataset.wallpaperTextTone;
    textToneCache = new WeakMap();
  }
  function refresh() {
    if (destroyed) return;
    force = true;
    schedule();
  }
  function schedule() {
    if (!destroyed && !frame) frame = requestAnimationFrame(paint);
  }
  function trackTransform(event) {
    if (event.propertyName !== 'transform' || reducedMotion.matches || !event.target.matches?.(PANELS)) return;
    // Follow only the short CSS lift transition. A still or merely hovered
    // panel never starts an endless graphics loop.
    motionDeadline = performance.now() + 420;
    schedule();
  }
  function resetPointer() {
    if (!illuminatedPanel) return;
    const entry = panels.get(illuminatedPanel);
    if (entry) entry.light = { x: 0, y: 0 };
    for (const property of ['--glass-light-angle', '--glass-light-x', '--glass-light-y']) illuminatedPanel.style.removeProperty(property);
    illuminatedPanel = null;
    schedule();
  }
  function trackPointer(event) {
    if (event.pointerType === 'touch' || !finePointer.matches || reducedMotion.matches || !glassEnabled()) { resetPointer(); return; }
    const panel = event.target.closest?.(PANELS);
    const entry = panel && panels.get(panel);
    if (!entry) { resetPointer(); return; }
    if (illuminatedPanel !== panel) resetPointer();
    illuminatedPanel = panel;
    const rect = panel.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    entry.light = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    panel.style.setProperty('--glass-light-angle', `${(135 + x * 48 - y * 24).toFixed(1)}deg`);
    panel.style.setProperty('--glass-light-x', `${((x + 1) * 50).toFixed(1)}%`);
    panel.style.setProperty('--glass-light-y', `${((y + 1) * 50).toFixed(1)}%`);
    schedule();
  }
  function leavePointer(event) {
    if (illuminatedPanel && !illuminatedPanel.contains(event.relatedTarget)) resetPointer();
  }
  function pointerPreferenceChanged() { resetPointer(); refresh(); }
  function tone(rect, viewport) {
    if (!sampler || !image) return root.dataset.themeTone === 'dark' ? 'dark' : 'light';
    const scale = Math.max(viewport.width / image.naturalWidth, viewport.height / image.naturalHeight);
    const x = (rect.left + (image.naturalWidth * scale - viewport.width) / 2) / scale;
    const y = (rect.top + (image.naturalHeight * scale - viewport.height) / 2) / scale;
    sampler.clearRect(0, 0, 24, 16);
    sampler.drawImage(image, x, y, rect.width / scale, rect.height / scale, 0, 0, 24, 16);
    const pixels = sampler.getImageData(0, 0, 24, 16).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      // Linear relative luminance: choose the polarity that needs the least
      // extra tint, rather than covering the photograph with a white veil.
      const linear = value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; };
      sum += linear(pixels[i]) * .2126 + linear(pixels[i + 1]) * .7152 + linear(pixels[i + 2]) * .0722;
      count++;
    }
    return count && sum / count < .22 ? 'dark' : 'light';
  }
  function collect() {
    for (const [panel, entry] of panels) {
      if (panel.isConnected && panel.matches(PANELS)) continue;
      resizeObserver?.unobserve(panel);
      entry.canvas.remove();
      if (illuminatedPanel === panel) resetPointer();
      panel.classList.remove('glass-optics-host', 'glass-optics-ready');
      delete panel.dataset.glassTone;
      panels.delete(panel);
    }
    for (const panel of document.querySelectorAll(PANELS)) {
      if (panels.has(panel)) continue;
      const canvas = document.createElement('canvas');
      canvas.className = 'glass-optics-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('role', 'presentation');
      canvas.hidden = true;
      canvas.style.pointerEvents = 'none';
      panel.prepend(canvas);
      panel.classList.add('glass-optics-host');
      panels.set(panel, { canvas, signature: '', light: { x: 0, y: 0 } });
      resizeObserver?.observe(panel);
    }
  }
  function ensureImage(nextSource) {
    if (nextSource === source) return;
    source = nextSource;
    image = null;
    uploadedSource = '';
    loading = Boolean(source);
    const generation = ++imageGeneration;
    hideAll();
    if (!source) return;
    const next = new Image();
    next.decoding = 'async';
    next.onload = () => {
      if (destroyed || generation !== imageGeneration) return;
      loading = false;
      image = next;
      refresh();
    };
    next.onerror = () => {
      if (destroyed || generation !== imageGeneration) return;
      loading = false;
      image = null;
      hideAll();
      fallback(document.body.classList.contains('wallpaper-on') && glassEnabled());
    };
    next.src = source;
  }
  function paint() {
    frame = 0;
    if (destroyed) return;
    collect();
    if (!glassEnabled() || reducedMotion.matches || !finePointer.matches) resetPointer();
    if (!document.body.classList.contains('wallpaper-on')) {
      hideAll();
      fallback(false);
      force = false;
      return;
    }
    ensureImage(wallpaperSource());
    if (!image || loading || document.hidden) {
      hideAll();
      fallback(glassEnabled() && !document.hidden);
      return;
    }
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const theme = root.dataset.theme || 'signal';
    try {
      document.body.dataset.wallpaperTone = tone({ left: 0, top: 0, width: viewport.width, height: Math.min(viewport.height * .3, 280) }, viewport);
      for (const element of document.querySelectorAll(WALLPAPER_TEXT)) {
        const bounds = element.getBoundingClientRect();
        if (bounds.width && bounds.height && bounds.bottom > 0 && bounds.top < viewport.height) {
          const signature = [source, theme, viewport.width, viewport.height].join('|');
          let cached = textToneCache.get(element);
          if (!cached || cached.signature !== signature) {
            cached = { signature, tone: tone(bounds, viewport) };
            textToneCache.set(element, cached);
          }
          element.dataset.wallpaperTextTone = cached.tone;
        }
      }
      // Header contrast depends on the wallpaper, independently of card
      // material or graphics support. Plain cards need no GPU allocation.
      const enabled = glassEnabled();
      if (!enabled || rendererFailed) {
        hidePanels();
        fallback(enabled && rendererFailed);
        force = false;
        return;
      }
      if (!renderer) renderer = createRenderer(() => {
        rendererFailed = true;
        hidePanels();
        fallback(document.body.classList.contains('wallpaper-on') && glassEnabled());
      });
      if (uploadedSource !== source) {
        renderer.upload(image);
        uploadedSource = source;
      }
      for (const [panel, entry] of panels) {
        const rect = panel.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= viewport.height || rect.right <= 0 || rect.left >= viewport.width) {
          hide(panel, entry);
          continue;
        }
        const signature = [source, theme, rect.left, rect.top, rect.width, rect.height, viewport.width, viewport.height, window.devicePixelRatio, entry.light.x, entry.light.y].join('|');
        if (!force && signature === entry.signature) continue;
        const radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0;
        renderer.draw(entry.canvas, rect, viewport, radius, entry.light);
        entry.canvas.dataset.renderer = 'webgl';
        // Pick readable ink once for this picture and screen size. The semantic
        // key survives app rerenders; scrolling or hovering never flips it.
        // The identity plaque retains its theme's solid, protected lettering.
        const identity = panel.dataset.snippet ? `snippet:${panel.dataset.snippet}` : panel.classList[0];
        const toneKey = [source, theme, viewport.width, viewport.height, identity, panel.offsetLeft, panel.offsetTop, panel.offsetWidth, panel.offsetHeight].join('|');
        let panelTone = panelToneCache.get(toneKey);
        if (!panelTone) {
          panelTone = root.dataset.themeTone === 'dark' || !panel.matches('.studio-brand') && tone(rect, viewport) === 'dark' ? 'dark' : 'light';
          if (panelToneCache.size > 1000) panelToneCache.clear();
          panelToneCache.set(toneKey, panelTone);
        }
        panel.dataset.glassTone = panelTone;
        const timer = panel.querySelector('#focusTime');
        if (timer) {
          const timerKey = `${toneKey}|timer`;
          let timerTone = panelToneCache.get(timerKey);
          if (!timerTone) {
            timerTone = root.dataset.themeTone === 'dark' ? 'dark' : tone(timer.getBoundingClientRect(), viewport);
            panelToneCache.set(timerKey, timerTone);
          }
          timer.parentElement.dataset.glassTextTone = timerTone;
        }
        entry.canvas.hidden = false;
        panel.classList.add('glass-optics-ready');
        entry.signature = signature;
      }
      fallback(false);
      force = false;
      if (performance.now() < motionDeadline && !reducedMotion.matches) schedule();
    } catch {
      rendererFailed = true;
      hidePanels();
      fallback(true);
    }
  }

  if ('ResizeObserver' in window) resizeObserver = new ResizeObserver(schedule);
  const observer = new MutationObserver(refresh);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-material'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-wallpaper-src'] });
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', refresh, { passive: true });
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('transitionrun', trackTransform);
  document.addEventListener('pointermove', trackPointer, { passive: true });
  document.addEventListener('pointerout', leavePointer, { passive: true });
  window.addEventListener('blur', resetPointer);
  reducedMotion.addEventListener?.('change', pointerPreferenceChanged);
  finePointer.addEventListener?.('change', pointerPreferenceChanged);
  reducedTransparency.addEventListener?.('change', refresh);
  refresh();

  return {
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      imageGeneration++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', refresh);
      document.removeEventListener('visibilitychange', refresh);
      document.removeEventListener('transitionrun', trackTransform);
      document.removeEventListener('pointermove', trackPointer);
      document.removeEventListener('pointerout', leavePointer);
      window.removeEventListener('blur', resetPointer);
      reducedMotion.removeEventListener?.('change', pointerPreferenceChanged);
      finePointer.removeEventListener?.('change', pointerPreferenceChanged);
      reducedTransparency.removeEventListener?.('change', refresh);
      hideAll();
      resetPointer();
      fallback(false);
      for (const [panel, entry] of panels) {
        entry.canvas.remove();
        panel.classList.remove('glass-optics-host');
      }
      panels.clear();
      panelToneCache.clear();
      renderer?.destroy();
      renderer = image = null;
      source = '';
    },
  };
}
