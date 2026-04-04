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
let scale = 1;
let minScale = 0.1;
let maxScale = 50;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let flipped = false;

// ===============================
// LOAD IMAGE
// ===============================
moonImg.onload = () => {
  resizeMoonMapCanvas();
  resetMoonMapView();
  drawMoonMap();
};

moonImg.src = MOON_IMAGE_SRC;

// ===============================
// DRAW FUNCTION
// ===============================
function drawMoonMap() {
  moonMapCtx.imageSmoothingEnabled = false;
  moonMapCtx.fillStyle = "#363636";
  moonMapCtx.fillRect(0, 0, moonMapCanvas.width, moonMapCanvas.height);
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
// RESET VIEW (AUTO-FIT TO SCREEN)
// ===============================
function resetMoonMapView() {
  const scaleX = moonMapCanvas.width / moonImg.width;
  const scaleY = moonMapCanvas.height / moonImg.height;

  scale = Math.min(scaleX, scaleY);

  offsetX = (moonMapCanvas.width - moonImg.width * scale) / 2;
  offsetY = (moonMapCanvas.height - moonImg.height * scale) / 2;

  drawMoonMap();
}

// ===============================
// RESIZE HANDLER
// ===============================
function resizeMoonMapCanvas() {
  moonMapCanvas.width = moonMapModal.clientWidth;
  moonMapCanvas.height = moonMapModal.clientHeight;
  drawMoonMap();
}

window.addEventListener("resize", resizeMoonMapCanvas);

// ===============================
// ZOOM (MOUSE WHEEL)
// ===============================
moonMapCanvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const zoomIntensity = 0.1;
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  const wheel = e.deltaY < 0 ? 1 : -1;
  const zoom = Math.exp(wheel * zoomIntensity);

  const newScale = scale * zoom;
  if (newScale < minScale || newScale > maxScale) return;

  offsetX = mouseX - (mouseX - offsetX) * zoom;
  offsetY = mouseY - (mouseY - offsetY) * zoom;

  scale = newScale;
  drawMoonMap();
});

// ===============================
// PAN (DRAG)
// ===============================
moonMapCanvas.addEventListener("mousedown", (e) => {
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
  if (!isDragging) return;

  offsetX = e.clientX - dragStartX;
  offsetY = e.clientY - dragStartY;

  drawMoonMap();
});

// ===============================
// BUTTONS
// ===============================
moonMapOpenBtn.addEventListener("click", () => {
  moonMapOverlay.style.display = "flex"; // show full-screen overlay
  resizeMoonMapCanvas();
  resetMoonMapView();
});

moonMapCloseBtn.addEventListener("click", () => {
  moonMapOverlay.style.display = "none";
});

moonMapResetBtn.addEventListener("click", () => {
  resetMoonMapView();
});

moonMapFlipBtn.addEventListener("click", () => {
  flipped = !flipped;
  drawMoonMap();
});

