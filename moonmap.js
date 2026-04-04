const MoonMap = (() => {

  // --- CONFIG ---
  const HIGH_RES_SRC =
    "https://github.com/astronomystuff/Zenith-Sky/releases/download/moonmap-v1/moonmap.png";

  const MED_RES_SRC =
    "https://github.com/astronomystuff/Zenith-Sky/releases/download/medMoonMap/medMoonMap.png";

  // --- SHARED WEBGL CONTEXT ---
  let sharedGL = null;
  function getGL() {
    if (sharedGL) return sharedGL;
    const canvas = document.createElement("canvas");
    sharedGL = canvas.getContext("webgl");
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

  // Tier 1: Strong → candidate for high-res (but must pass real test)
  function canHandleHighRes() {
    const { maxTex } = getGPUInfo();
    if (!maxTex || maxTex <= 0) return false;
    return maxTex >= 8192;
  }

  // Tier 2: Medium → auto med-res + allow override
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
  const ctx = canvas.getContext("2d");

  const btnForceHighRes = document.getElementById("moonmap-force-highres");
  const btnOpen = document.getElementById("moonmap-open");
  const btnClose = document.getElementById("moonmap-close");
  const btnReset = document.getElementById("moonmap-reset");
  const btnFlip = document.getElementById("moonmap-flip");
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
  let flipped = false;
  let needsRender = false;

  let currentSrcTier = "none";
  let loadToken = 0;

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
          img.src = HIGH_RES_SRC;
        } else {
          if (canHandleMedRes()) {
            currentSrcTier = "med";
            btnForceHighRes.style.display = "inline-block";
            img.src = MED_RES_SRC;
          } else {
            currentSrcTier = "low";
            btnForceHighRes.style.display = "none";
            fetch("moonmap_lowres.txt")
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

    // TIER 2: Medium → auto med-res + allow override
    if (canHandleMedRes()) {
      currentSrcTier = "med";
      btnForceHighRes.style.display = "inline-block";
      img.src = MED_RES_SRC;
      return;
    }

    // TIER 3: Weak → low-res only, no override
    currentSrcTier = "low";
    btnForceHighRes.style.display = "none";

    fetch("moonmap_lowres.txt")
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
    if (!loaded) return;

    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;

    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (flipped) {
      ctx.scale(1, -1);
      ctx.translate(0, -img.height);
    }

    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  // --- RESET VIEW ---
  function resetView() {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / img.width;
    const sy = rect.height / img.height;

    scale = Math.min(sx, sy);

    offsetX = (rect.width - img.width * scale) / 2;
    offsetY = (rect.height - img.height * scale) / 2;

    zoomSlider.value = scale;
    requestRender();
  }

  // --- RESIZE CANVAS ---
  function resizeCanvas() {
    const rect = modal.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height - 40;
    requestRender();
  }

  // --- ZOOM (Slider) ---
  zoomSlider.addEventListener("input", () => {
    const newScale = parseFloat(zoomSlider.value);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    offsetX = cx - (cx - offsetX) * (newScale / scale);
    offsetY = cy - (cy - offsetY) * (newScale / scale);

    scale = newScale;
    requestRender();
  });

  // --- PAN ---
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
    offsetX += e.movementX;
    offsetY += e.movementY;
    requestRender();
  });

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
    img.src = HIGH_RES_SRC;
  });

  // --- INIT ---
  function init() {
    img.onload = () => {
      loaded = true;
      resizeCanvas();
      resetView();
      requestRender();
    };

    img.onerror = () => {
      if (currentSrcTier === "high") {
        if (canHandleMedRes()) {
          currentSrcTier = "med";
          btnForceHighRes.style.display = "inline-block";
          img.src = MED_RES_SRC;
        } else {
          currentSrcTier = "low";
          btnForceHighRes.style.display = "none";
          fetch("moonmap_lowres.txt")
            .then(r => r.text())
            .then(base64 => {
              img.src = "data:image/png;base64," + base64;
            });
        }
      } else if (currentSrcTier === "med") {
        currentSrcTier = "low";
        btnForceHighRes.style.display = "none";
        fetch("moonmap_lowres.txt")
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
