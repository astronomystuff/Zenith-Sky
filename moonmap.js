// --- CONFIG ---
const MOON_IMAGE_SRC =
  "https://github.com/astronomystuff/Zenith-Sky/releases/download/moonmap-v1/moonmap.png";

// --- DOM ELEMENTS (MATCH YOUR HTML) ---
const moonMapOverlay = document.getElementById("moonmap-modal-overlay");
const moonMapModal = document.getElementById("moonmap-modal");
const moonMapCanvas = document.getElementById("moonCanvas");
const moonMapCtx = moonMapCanvas.getContext("2d");
const moonMapOpenBtn = document.getElementById("moonmap-open");
const moonMapCloseBtn = document.getElementById("moonmap-close");
const moonMapResetBtn = document.getElementById("moonmap-reset");
const moonMapFlipBtn = document.getElementById("moonmap-flip");

// --- STATE ---
let moonImg = new Image();
let imgLoaded = false;
let scale = 1;
let minScale = 0.1;
let maxScale = 25; // capped for performance
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let flipped = false;
let needsRender = false;

// ===============================
// RENDER LOOP (PERF-FRIENDLY)
// ===============================
function requestRender() {
  if (needsRender) return;
  needsRender = true;
  requestAnimationFrame(() => {
    needsRender = false;
    drawMoonMap();
  });
}

// ===============================
// LOAD IMAGE
// ===============================
moonImg.onload = () => {
  imgLoaded = true;
  resizeMoonMapCanvas();
  resetMoonMapView();
  requestRender();
};

moonImg.src = MOON_IMAGE_SRC;

// ===============================
// DRAW FUNCTION
// ===============================
function drawMoonMap() {
  if (!imgLoaded) return;
  
  moonMapCtx.fillStyle = "#808080";
  moonMapCtx.fillRect(0, 0, moonMapCanvas.width, moonMapCanvas.height);
  moonMapCtx.imageSmoothingEnabled = false;
  moonMapCtx.save();
  moonMapCtx.translate(offsetX, offsetY);
  moonMapCtx.scale(scale, scale);

  if (flipped) {
    moonMapCtx.scale(1, -1);
    moonMapCtx.translate(0, -moonImg.height);
  }

  moonMapCtx.drawImage(moonImg, 0, 0);
  moonMapCtx.restore();
}

// ===============================
// RESET VIEW (AUTO-FIT)
// ===============================
function resetMoonMapView() {
  if (!imgLoaded) return;

  const rect = moonMapCanvas.getBoundingClientRect();
  const scaleX = rect.width / moonImg.width;
  const scaleY = rect.height / moonImg.height;

  scale = Math.min(scaleX, scaleY);

  offsetX = (rect.width - moonImg.width * scale) / 2;
  offsetY = (rect.height - moonImg.height * scale) / 2;

  requestRender();
}

// ===============================
// RESIZE HANDLER
// ===============================
function resizeMoonMapCanvas() {
  const rect = moonMapModal.getBoundingClientRect();
  moonMapCanvas.width = rect.width;
  moonMapCanvas.height = rect.height;
  requestRender();
}

window.addEventListener("resize", () => {
  if (moonMapOverlay.style.display !== "block") return;
  resizeMoonMapCanvas();
  resetMoonMapView();
});

// ===============================
// ZOOM (MOUSE WHEEL, THROTTLED)
// ===============================
let lastWheelTime = 0;

moonMapCanvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const now = performance.now();
  if (now - lastWheelTime < 16) return; // ~60fps throttle
  lastWheelTime = now;

  if (!imgLoaded) return;

  const zoomIntensity = 0.12;
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  const wheel = e.deltaY < 0 ? 1 : -1;
  const zoom = Math.exp(wheel * zoomIntensity);

  const newScale = scale * zoom;
  if (newScale < minScale || newScale > maxScale) return;

  // Zoom around cursor
  offsetX = mouseX - (mouseX - offsetX) * zoom;
  offsetY = mouseY - (mouseY - offsetY) * zoom;

  scale = newScale;
  requestRender();
});

// ===============================
// PAN (DRAG)
// ===============================
moonMapCanvas.addEventListener("mousedown", (e) => {
  if (!imgLoaded) return;
  isDragging = true;
  dragStartX = e.clientX - offsetX;
  dragStartY = e.clientY - offsetY;
  moonMapCanvas.style.cursor = "grabbing";
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  moonMapCanvas.style.cursor = "grab";
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging || !imgLoaded) return;

  offsetX = e.clientX - dragStartX;
  offsetY = e.clientY - dragStartY;

  requestRender();
});

// ===============================
// BUTTONS
// ===============================
moonMapOpenBtn.addEventListener("click", () => {
  moonMapOverlay.style.display = "block";

  setTimeout(() => {
    resizeMoonMapCanvas();
    resetMoonMapView();
  }, 30);
});

moonMapCloseBtn.addEventListener("click", () => {
  moonMapOverlay.style.display = "none";
});

moonMapResetBtn.addEventListener("click", () => {
  resetMoonMapView();
});

moonMapFlipBtn.addEventListener("click", () => {
  flipped = !flipped;
  requestRender();
});

