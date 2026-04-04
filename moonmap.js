// --- CONFIG ---
const MOON_IMAGE_SRC =
  "https://github.com/astronomystuff/Zenith-Sky/releases/download/moonmap-v1/moonmap.png";

// --- DOM ELEMENTS ---
const moonOverlay = document.getElementById("moonmap-modal-overlay");
const modal = document.getElementById("moonmap-modal");
const canvas = document.getElementById("moonCanvas");
const ctx = canvas.getContext("2d");

const btnOpen = document.getElementById("moonmap-open");
const btnClose = document.getElementById("moonmap-close");
const btnReset = document.getElementById("moonmap-reset");
const btnFlip = document.getElementById("moonmap-flip");

// --- STATE ---
let img = new Image();
let loaded = false;
let scale = 1;
let minScale = 0.1;
let maxScale = 25;
let offsetX = 0;
let offsetY = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let flipped = false;
let needsRender = false;

// Render loop
function requestRender() {
  if (needsRender) return;
  needsRender = true;
  requestAnimationFrame(() => {
    needsRender = false;
    draw();
  });
}

// Load image
img.onload = () => {
  loaded = true;
  resizeCanvas();
  resetView();
  requestRender();
};
img.src = MOON_IMAGE_SRC;

// Draw
function draw() {
  if (!loaded) return;

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

  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// Reset view
function resetView() {
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / img.width;
  const sy = rect.height / img.height;

  scale = Math.min(sx, sy);

  offsetX = (rect.width - img.width * scale) / 2;
  offsetY = (rect.height - img.height * scale) / 2;

  requestRender();
}

// Resize canvas
function resizeCanvas() {
  const rect = modal.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height - 40; // header height
  requestRender();
}

// Zoom
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (!loaded) return;

  const zoom = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.12);
  const newScale = scale * zoom;

  if (newScale < minScale || newScale > maxScale) return;

  const mx = e.offsetX;
  const my = e.offsetY;

  offsetX = mx - (mx - offsetX) * zoom;
  offsetY = my - (my - offsetY) * zoom;

  scale = newScale;
  requestRender();
});

// Pan
canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  dragStartX = e.clientX - offsetX;
  dragStartY = e.clientY - offsetY;
  canvas.style.cursor = "grabbing";
});

window.addEventListener("mouseup", () => {
  dragging = false;
  canvas.style.cursor = "grab";
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  offsetX = e.clientX - dragStartX;
  offsetY = e.clientY - dragStartY;
  requestRender();
});

// Buttons
btnOpen.addEventListener("click", () => {
  moonOverlay.style.display = "block";
  setTimeout(() => {
    resizeCanvas();
    resetView();
  }, 30);
});

btnClose.addEventListener("click", () => {
  moonOverlay.style.display = "none";
});

btnReset.addEventListener("click", resetView);

btnFlip.addEventListener("click", () => {
  flipped = !flipped;
  requestRender();
});
