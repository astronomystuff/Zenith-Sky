const MoonMap = (() => {
  // --- CONFIG ---
  const LOW_RES_TXT = "moonmap_lowres.txt"; // base64 text file
  const HIGH_RES_SRC =
    "https://github.com/astronomystuff/Zenith-Sky/releases/download/moonmap-v1/moonmap.png";

  // --- DOM ---
  const overlay = document.getElementById("moonmap-modal-overlay");
  const modal = document.getElementById("moonmap-modal");
  const canvas = document.getElementById("moonCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const btnOpen = document.getElementById("moonmap-open");
  const btnClose = document.getElementById("moonmap-close");
  const btnReset = document.getElementById("moonmap-reset");
  const btnFlip = document.getElementById("moonmap-flip");
  const btnDownloadHighRes = document.getElementById("moonmap-download-highres");
  const zoomSlider = document.getElementById("moonmap-zoom-slider");

  // --- STATE ---
  const img = new Image();
  let loaded = false;
  let scale = 1;
  const minScale = 0.1;
  const maxScale = 25;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let needsRender = false;
  let flipped = false;
  let apolloMode = false;
  let bHoldTimer = null;
  let lastDrawOffsetX = 0;
  let lastDrawOffsetY = 0;
  let lastDrawScale = 0;
  let lastDrawFlip = false;
  let lastDrawApollo = false;

  function applyApolloPalette(ctx, w, h) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      r *= 1.08;
      g *= 1.03;
      b *= 0.92;

      r = r * 0.92 + 12;
      g = g * 0.92 + 10;
      b = b * 0.92 + 8;

      d[i] = Math.min(255, r);
      d[i + 1] = Math.min(255, g);
      d[i + 2] = Math.min(255, b);
    }

    ctx.putImageData(imgData, 0, 0);
  }

  function showToast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.position = "absolute";
    t.style.top = "10px";
    t.style.left = "50%";
    t.style.transform = "translateX(-50%)";
    t.style.padding = "6px 12px";
    t.style.background = "rgba(0,0,0,0.6)";
    t.style.color = "white";
    t.style.borderRadius = "6px";
    t.style.fontSize = "12px";
    t.style.opacity = "0";
    t.style.transition = "opacity 0.4s ease";
    modal.appendChild(t);

    requestAnimationFrame(() => (t.style.opacity = "1"));
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 400);
    }, 1200);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "b" && !bHoldTimer) {
      bHoldTimer = setTimeout(() => {
        apolloMode = !apolloMode;
        showToast(apolloMode ? "Apollo Mode Enabled" : "Apollo Mode Disabled");
        requestRender();
      }, 2000);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key.toLowerCase() === "b") {
      clearTimeout(bHoldTimer);
      bHoldTimer = null;
    }
  });

  // --- LOAD LOW-RES IMAGE ONLY ---
  function loadImage() {
    fetch(LOW_RES_TXT)
      .then(r => r.text())
      .then(base64 => {
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
    if (!loaded) return;

    if (
      offsetX === lastDrawOffsetX &&
      offsetY === lastDrawOffsetY &&
      scale === lastDrawScale &&
      flipped === lastDrawFlip &&
      apolloMode === lastDrawApollo
    ) {
      return;
    }

    lastDrawOffsetX = offsetX;
    lastDrawOffsetY = offsetY;
    lastDrawScale = scale;
    lastDrawFlip = flipped;
    lastDrawApollo = apolloMode;

    ctx.globalCompositeOperation = "copy";
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (flipped) {
      ctx.scale(1, -1);
      ctx.translate(0, -img.height);
    }

    // --- BORDER CROP ---
    ctx.drawImage(img, 1, 1, img.width - 2, img.height - 2, 0, 0, img.width, img.height);

    if (apolloMode) {
      applyApolloPalette(ctx, canvas.width, canvas.height);
    }

    ctx.restore();
  }

  // --- RESET VIEW ---
  function resetView() {
    if (!loaded) return;

    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / img.width;
    const sy = rect.height / img.height;

    scale = Math.min(sx, sy);
    scale = Math.min(Math.max(scale, minScale), maxScale);

    offsetX = (rect.width - img.width * scale) / 2;
    offsetY = (rect.height - img.height * scale) / 2;
    offsetY += 12;

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

  // --- PAN (touch) ---
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

  // --- DOWNLOAD HIGH-RES ---
  btnDownloadHighRes.addEventListener("click", () => {
    window.open(HIGH_RES_SRC, "_blank", "noopener");
  });

  // --- INIT ---
  function init() {
    img.onload = async () => {
      try {
        if (img.decode) await img.decode();
      } catch {}

      loaded = true;
      resizeCanvas();
      resetView();
      requestRender();
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
