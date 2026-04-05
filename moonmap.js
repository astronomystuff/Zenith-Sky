const MoonMap = (() => {

  // --- CONFIG ---
  const HIGH_RES_SRC =
    "https://github.com/astronomystuff/Zenith-Sky/releases/download/moonmap-v1/moonmap.png";

  const MED_RES_SRC =
    "https://github.com/astronomystuff/Zenith-Sky/releases/download/medMoonMap/medMoonMap.png";

  const LOW_RES_TXT = "moonmap_lowres.txt";

  // --- SHARED WEBGL CONTEXT (for capability checks only) ---
  let sharedGL = null;
  function getGL() {
    if (sharedGL) return sharedGL;
    const c = document.createElement("canvas");
    sharedGL = c.getContext("webgl", {
      antialias: false,
      preserveDrawingBuffer: false
    });
    return sharedGL;
  }

  // --- GPU INFO ---
  function getGPUInfo() {
    const gl = getGL();
    if (!gl) return { renderer: "", vendor: "", maxTex: 0 };
    return {
      renderer: gl.getParameter(gl.RENDERER) || "",
      vendor: gl.getParameter(gl.VENDOR) || "",
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE)
    };
  }

  // --- TIER LOGIC ---
  function canHandleHighRes() {
    const { renderer, maxTex } = getGPUInfo();
    if (/apple a1[4-9]/i.test(renderer)) return true;
    if (/apple m[1-9]/i.test(renderer)) return true;
    if (maxTex >= 8192 && !/intel hd/i.test(renderer)) return true;
    return false;
  }

  function canHandleMedRes() {
    const { renderer, maxTex } = getGPUInfo();
    if (/apple a1[1-3]/i.test(renderer)) return true;
    if (maxTex >= 4096) return true;
    return false;
  }

  function verifyHighResIsSafe() {
    return new Promise(resolve => {
      const gl = getGL();
      if (!gl) return resolve(false);

      try {
        const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
        if (!maxTex || maxTex < 4096) return resolve(false);

        const testSize = Math.min(8192, maxTex);

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);

        const start = performance.now();
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          testSize,
          testSize,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );
        const err = gl.getError();
        const end = performance.now();

        gl.deleteTexture(tex);

        if (err !== gl.NO_ERROR) return resolve(false);
        if (end - start > 150) return resolve(false);

        resolve(true);
      } catch {
        resolve(false);
      }
    });
  }

  // --- DOM ---
  const overlay = document.getElementById("moonmap-modal-overlay");
  const modal = document.getElementById("moonmap-modal");
  const canvas = document.getElementById("moonCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const btnForceHighRes = document.getElementById("moonmap-force-highres");
  const btnOpen = document.getElementById("moonmap-open");
  const btnClose = document.getElementById("moonmap-close");
  const btnReset = document.getElementById("moonmap-reset");
  const btnFlip = document.getElementById("moonmap-flip");
  const zoomSlider = document.getElementById("moonmap-zoom-slider");

  // --- STATE ---
  const img = new Image();
  let off = null;
  let offCtx = null;

  let loaded = false;
  let currentTier = "none";
  let loadToken = 0;

  let scale = 1;
  const minScale = 0.1;
  const maxScale = 25;

  let offsetX = 0;
  let offsetY = 0;

  let dragging = false;
  let flipped = false;
  let needsRender = false;

  // Render dedupe
  let lastDrawOffsetX = 0;
  let lastDrawOffsetY = 0;
  let lastDrawScale = 0;
  let lastDrawFlip = false;

  // --- LOAD IMAGE (3 TIERS + SAFETY TEST) ---
  function loadImage() {
    const token = ++loadToken;

    if (canHandleHighRes()) {
      verifyHighResIsSafe().then(safe => {
        if (token !== loadToken) return;

        if (safe) {
          currentTier = "high";
          btnForceHighRes.style.display = "none";
          img.src = HIGH_RES_SRC;
        } else {
          if (canHandleMedRes()) {
            currentTier = "med";
            btnForceHighRes.style.display = "inline-block";
            img.src = MED_RES_SRC;
          } else {
            currentTier = "low";
            btnForceHighRes.style.display = "none";
            fetch(LOW_RES_TXT)
              .then(r => r.text())
              .then(base64 => {
                if (token !== loadToken) return;
                img.src = "data:image/png;base64," + base64;
              });
          }
        }
      });
      return;
    }

    if (canHandleMedRes()) {
      currentTier = "med";
      btnForceHighRes.style.display = "inline-block";
      img.src = MED_RES_SRC;
      return;
    }

    currentTier = "low";
    btnForceHighRes.style.display = "none";

    fetch(LOW_RES_TXT)
      .then(r => r.text())
      .then(base64 => {
        if (token !== loadToken) return;
        img.src = "data:image/png;base64," + base64;
      });
  }

  // --- RENDER LOOP ---
  function requestRender() {
    if (needsRender) return;
    needsRender = true;
    requestAnimationFrame(() => {
      needsRender = false;
      draw();
    });
  }

  // --- DRAW ---
  function draw() {
    if (!loaded || !off) return;

    if (
      offsetX === lastDrawOffsetX &&
      offsetY === lastDrawOffsetY &&
      scale === lastDrawScale &&
      flipped === lastDrawFlip
    ) {
      return;
    }

    lastDrawOffsetX = offsetX;
    lastDrawOffsetY = offsetY;
    lastDrawScale = scale;
    lastDrawFlip = flipped;

    ctx.globalCompositeOperation = "copy";
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;

    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (flipped) {
      ctx.scale(1, -1);
      ctx.translate(0, -off.height);
    }

    ctx.drawImage(off, 0, 0);
    ctx.restore();
  }

  // --- RESET VIEW ---
  function resetView() {
    if (!off) return;

    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / off.width;
    const sy = rect.height / off.height;

    scale = Math.min(sx, sy);
    scale = Math.min(Math.max(scale, minScale), maxScale);

    offsetX = (rect.width - off.width * scale) / 2;
    offsetY = (rect.height - off.height * scale) / 2;

    zoomSlider.value = String(scale);
    requestRender();
  }

  // --- RESIZE CANVAS ---
  function resizeCanvas() {
    const rect = modal.getBoundingClientRect();
    const newWidth = rect.width;
    const newHeight = rect.height - 40;

    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth;
      canvas.height = newHeight;
      requestRender();
    }
  }

  // --- ZOOM ---
  zoomSlider.addEventListener("input", () => {
    const newScale = parseFloat(zoomSlider.value);
    if (!isFinite(newScale)) return;

    const clamped = Math.min(Math.max(newScale, minScale), maxScale);
    if (Math.abs(clamped - scale) < 0.0001) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    offsetX = cx - (cx - offsetX) * (clamped / scale);
    offsetY = cy - (cy - offsetY) * (clamped / scale);

    scale = clamped;
    requestRender();
  });

  // --- PAN (mouse) ---
  let lastPan = 0;
  canvas.addEventListener("mousedown", () => {
    dragging = true;
    canvas.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
    canvas.style.cursor = "grab";
    document.body.style.userSelect = "";
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const now = performance.now();
    if (now - lastPan < 24) return;
    lastPan = now;

    offsetX += e.movementX;
    offsetY += e.movementY;
    requestRender();
  });

  // --- TOUCH PAN ---
  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchDragging = false;
  let touchQueued = false;

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    touchDragging = true;

    const t = e.touches[0];
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;

    canvas.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    if (!touchDragging || e.touches.length !== 1) return;

    if (!touchQueued) {
      touchQueued = true;
      const t0 = e.touches[0];
      const startX = t0.clientX;
      const startY = t0.clientY;

      requestAnimationFrame(() => {
        touchQueued = false;

        const dx = startX - lastTouchX;
        const dy = startY - lastTouchY;

        lastTouchX = startX;
        lastTouchY = startY;

        offsetX += dx;
        offsetY += dy;

        requestRender();
      });
    }
  }, { passive: true });

  canvas.addEventListener("touchend", () => {
    touchDragging = false;
    canvas.style.cursor = "grab";
    document.body.style.userSelect = "";
  }, { passive: true });

  // --- OPEN / CLOSE ---
  function open() {
    overlay.style.display = "flex";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizeCanvas();
        resetView();
      });
    });
  }

  function close() {
    overlay.style.display = "none";
  }

  // --- FORCE HIGH RES ---
  btnForceHighRes.addEventListener("click", () => {
    currentTier = "high";
    btnForceHighRes.style.display = "none";
    img.src = HIGH_RES_SRC;
  });

  // --- INIT ---
  function init() {
    img.onload = async () => {
      try {
        if (img.decode) {
          await img.decode(); // wait for actual decode → no black frame
        }
      } catch {
        // Safari can throw here even when decode succeeds; ignore
      }

      loaded = true;

      off = document.createElement("canvas");
      offCtx = off.getContext("2d", { alpha: false });

      off.width = img.width;
      off.height = img.height;

      offCtx.imageSmoothingEnabled = false;
      offCtx.webkitImageSmoothingEnabled = false;
      offCtx.msImageSmoothingEnabled = false;
      offCtx.mozImageSmoothingEnabled = false;

      offCtx.drawImage(img, 0, 0);

      img.src = "";
      img.onload = null;
      img.onerror = null;

      resizeCanvas();
      resetView();
      requestRender();
    };

    img.onerror = () => {
      if (currentTier === "high") {
        if (canHandleMedRes()) {
          currentTier = "med";
          btnForceHighRes.style.display = "inline-block";
          img.src = MED_RES_SRC;
        } else {
          currentTier = "low";
          btnForceHighRes.style.display = "none";
          fetch(LOW_RES_TXT)
            .then(r => r.text())
            .then(base64 => {
              img.src = "data:image/png;base64," + base64;
            });
        }
      } else if (currentTier === "med") {
        currentTier = "low";
        btnForceHighRes.style.display = "none";
        fetch(LOW_RES_TXT)
          .then(r => r.text())
          .then(base64 => {
            img.src = "data:image/png;base64," + base64;
          });
      }
    };

    loadImage();

    btnOpen.addEventListener("click", open);
    btnClose.addEventListener("click", close);
    btnReset.addEventListener("click", resetView);

    btnFlip.addEventListener("click", () => {
      flipped = !flipped;
      requestRender();
    });
  }

  return { init, open, close, resetView };
})();

// Initialize
MoonMap.init();
