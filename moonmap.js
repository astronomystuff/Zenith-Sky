const MoonMap = (() => {

  // --- CONFIG ---
  const HIGH_RES_SRC =
    "https://github.com/astronomystuff/Zenith-Sky/releases/download/moonmap-v1/moonmap.png";

  const MED_RES_SRC =
    "https://github.com/astronomystuff/Zenith-Sky/releases/download/medMoonMap/medMoonMap.png";

  const LOW_RES_TXT = "moonmap_lowres.txt"; // base64 text file

  // --- TILE SIZES ---
  function getTileSizeForTier(tier) {
    if (tier === "high") return 1024;
    if (tier === "med") return 512;
    return 256; // low
  }

  // --- SHARED WEBGL CONTEXT ---
  let sharedGL = null;
  function getGL() {
    if (sharedGL) return sharedGL;
    const canvas = document.createElement("canvas");
    sharedGL = canvas.getContext("webgl", {
      antialias: false,
      preserveDrawingBuffer: false
    });
    return sharedGL;
  }

  // --- GPU / CAPABILITY HELPERS ---
  function getGPUInfo() {
    const gl = getGL();
    if (!gl) return { renderer: "", vendor: "", maxTex: 0 };

    return {
      renderer: gl.getParameter(gl.RENDERER) || "",
      vendor: gl.getParameter(gl.VENDOR) || "",
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE)
    };
  }

  function canHandleHighRes() {
    const { maxTex } = getGPUInfo();
    if (!maxTex || maxTex <= 0) return false;
    return maxTex >= 8192;
  }

  function canHandleMedRes() {
    const { maxTex } = getGPUInfo();
    if (!maxTex || maxTex <= 0) return false;
    return maxTex >= 4096;
  }

  // --- REAL-WORLD HIGH-RES SAFETY TEST ---
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
      } catch (e) {
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
  let loaded = false;
  let tilesReady = false;

  let scale = 1;
  const minScale = 0.1;
  const maxScale = 25;

  let offsetX = 0;
  let offsetY = 0;

  let dragging = false;
  let flipped = false;
  let needsRender = false;

  let currentSrcTier = "none"; // "high" | "med" | "low"
  let loadToken = 0;

  // map dimensions
  let mapWidth = 0;
  let mapHeight = 0;

  // tiling
  let tiles = [];
  let tilesX = 0;
  let tilesY = 0;
  let tileSize = 0;

  // --- BUILD TILES FROM FULL IMAGE (STRIP-BASED) ---
  function buildTilesFromImage(image, tier) {
    tiles = [];
    tilesReady = false;

    mapWidth = image.width;
    mapHeight = image.height;
    tileSize = getTileSizeForTier(tier);

    if (!mapWidth || !mapHeight || !tileSize) return;

    tilesX = Math.ceil(mapWidth / tileSize);
    tilesY = Math.ceil(mapHeight / tileSize);

    const stripCanvas = document.createElement("canvas");
    stripCanvas.width = mapWidth;
    stripCanvas.height = tileSize;
    const stripCtx = stripCanvas.getContext("2d", { alpha: false });

    for (let sy = 0; sy < mapHeight; sy += tileSize) {
      const stripHeight = Math.min(tileSize, mapHeight - sy);
      stripCanvas.height = stripHeight;

      stripCtx.clearRect(0, 0, stripCanvas.width, stripCanvas.height);

      stripCtx.drawImage(
        image,
        0,
        sy,
        mapWidth,
        stripHeight,
        0,
        0,
        mapWidth,
        stripHeight
      );

      for (let tx = 0; tx < tilesX; tx++) {
        const tw = Math.min(tileSize, mapWidth - tx * tileSize);
        const th = stripHeight;

        const tCanvas = document.createElement("canvas");
        tCanvas.width = tw;
        tCanvas.height = th;
        const tCtx = tCanvas.getContext("2d", { alpha: false });

        tCtx.drawImage(
          stripCanvas,
          tx * tileSize,
          0,
          tw,
          th,
          0,
          0,
          tw,
          th
        );

        tiles.push({
          x: tx * tileSize,
          y: sy,
          w: tw,
          h: th,
          canvas: tCanvas
        });
      }
    }

    // discard original image content
    image.src = "";
    tilesReady = true;
  }

  // --- LOAD IMAGE (3 TIERS + REAL-WORLD SAFETY TEST) ---
  function loadImage() {
    const token = ++loadToken;

    // TIER 1: Strong candidate → verify with real-world test
    if (canHandleHighRes()) {
      verifyHighResIsSafe().then(safe => {
        if (token !== loadToken) return;

        if (safe) {
          currentSrcTier = "high";
          btnForceHighRes.style.display = "none";
          loaded = false;
          tilesReady = false;
          img.src = HIGH_RES_SRC;
        } else {
          if (canHandleMedRes()) {
            currentSrcTier = "med";
            btnForceHighRes.style.display = "inline-block";
            loaded = false;
            tilesReady = false;
            img.src = MED_RES_SRC;
          } else {
            currentSrcTier = "low";
            btnForceHighRes.style.display = "none";
            fetch(LOW_RES_TXT)
              .then(r => r.text())
              .then(base64 => {
                if (token !== loadToken) return;
                loaded = false;
                tilesReady = false;
                img.src = "data:image/png;base64," + base64;
              });
          }
        }
      });
      return;
    }

    // TIER 2: Medium → auto med-res + allow override
    if (canHandleMedRes()) {
      currentSrcTier = "med";
      btnForceHighRes.style.display = "inline-block";
      loaded = false;
      tilesReady = false;
      img.src = MED_RES_SRC;
      return;
    }

    // TIER 3: Weak → low-res only, no override
    currentSrcTier = "low";
    btnForceHighRes.style.display = "none";

    fetch(LOW_RES_TXT)
      .then(r => r.text())
      .then(base64 => {
        if (token !== loadToken) return;
        loaded = false;
        tilesReady = false;
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

  // --- DRAW USING TILES ---
  function draw() {
    if (!loaded || !tilesReady) return;

    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "copy";

    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (flipped) {
      ctx.scale(1, -1);
      ctx.translate(0, -mapHeight);
    }

    const invScale = 1 / scale;

    const viewLeft = -offsetX * invScale;
    const viewTop = -offsetY * invScale;
    const viewRight = viewLeft + canvas.width * invScale;
    const viewBottom = viewTop + canvas.height * invScale;

    const startTileX = Math.max(0, Math.floor(viewLeft / tileSize));
    const endTileX = Math.min(tilesX - 1, Math.floor(viewRight / tileSize));
    const startTileY = Math.max(0, Math.floor(viewTop / tileSize));
    const endTileY = Math.min(tilesY - 1, Math.floor(viewBottom / tileSize));

    for (let ty = startTileY; ty <= endTileY; ty++) {
      for (let tx = startTileX; tx <= endTileX; tx++) {
        const idx = ty * tilesX + tx;
        const tile = tiles[idx];
        if (!tile) continue;

        ctx.drawImage(
          tile.canvas,
          tile.x,
          tile.y
        );
      }
    }

    ctx.restore();
  }

  // --- RESET VIEW ---
  function resetView() {
    if (!mapWidth || !mapHeight) return;

    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / mapWidth;
    const sy = rect.height / mapHeight;

    scale = Math.min(sx, sy);

    offsetX = (rect.width - mapWidth * scale) / 2;
    offsetY = (rect.height - mapHeight * scale) / 2;

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

  // --- ZOOM (Slider) ---
  zoomSlider.addEventListener("input", () => {
    const newScale = parseFloat(zoomSlider.value);
    if (!isFinite(newScale)) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    offsetX = cx - (cx - offsetX) * (newScale / scale);
    offsetY = cy - (cy - offsetY) * (newScale / scale);

    scale = Math.min(Math.max(newScale, minScale), maxScale);
    requestRender();
  });

  // --- PAN (throttled) ---
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
  }, { passive: true });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const now = performance.now();
    if (now - lastPan < 16) return;
    lastPan = now;

    offsetX += e.movementX;
    offsetY += e.movementY;
    requestRender();
  }, { passive: true });

  // --- OPEN / CLOSE ---
  function open() {
    overlay.style.display = "flex";
    setTimeout(() => {
      resizeCanvas();
      resetView();
    }, 30);
  }

  function close() {
    overlay.style.display = "none";
  }

  // --- FORCE HIGH RESOLUTION ---
  btnForceHighRes.addEventListener("click", () => {
    currentSrcTier = "high";
    btnForceHighRes.style.display = "none";
    loaded = false;
    tilesReady = false;
    img.src = HIGH_RES_SRC;
  });

  // --- INIT ---
  function init() {
    img.onload = () => {
      loaded = true;
      buildTilesFromImage(img, currentSrcTier);
      resizeCanvas();
      resetView();
      requestRender();
    };

    img.onerror = () => {
      if (currentSrcTier === "high") {
        if (canHandleMedRes()) {
          currentSrcTier = "med";
          btnForceHighRes.style.display = "inline-block";
          loaded = false;
          tilesReady = false;
          img.src = MED_RES_SRC;
        } else {
          currentSrcTier = "low";
          btnForceHighRes.style.display = "none";
          fetch(LOW_RES_TXT)
            .then(r => r.text())
            .then(base64 => {
              loaded = false;
              tilesReady = false;
              img.src = "data:image/png;base64," + base64;
            });
        }
      } else if (currentSrcTier === "med") {
        currentSrcTier = "low";
        btnForceHighRes.style.display = "none";
        fetch(LOW_RES_TXT)
          .then(r => r.text())
          .then(base64 => {
            loaded = false;
            tilesReady = false;
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
