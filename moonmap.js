const MoonMap = (() => {

  // --- CONFIG ---
  const HIGH_RES_SRC =
    "https://github.com/astronomystuff/Zenith-Sky/releases/download/moonmap-v1/moonmap.png";

  // --- CAPABILITY CHECK ---
  function canHandleHighRes() {
    const mem = navigator.deviceMemory || 2;

    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return false;

    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    return mem >= 4 && maxTex >= 8192;
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

  // --- LOAD IMAGE (HIGH OR LOW RES) ---
 function loadImage() {
  if (canHandleHighRes()) {
    img.src = HIGH_RES_SRC;
    return;
  }

  btnForceHighRes.style.display = "inline-block";

  fetch("moonmap_lowres.txt")
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
  btnForceHighRes.style.display = "none"; // hide after use
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
