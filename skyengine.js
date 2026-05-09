let sky3dScene, sky3dCamera, sky3dRenderer, sky3dStars;
let sky3dModalOpen = false;

// ------------------------------------------------------
// Minimal Camera Controls (OrbitControls replacement)
// ------------------------------------------------------
class MinimalCameraControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.1;
    this.panSpeed = 0.002;

    this.isRotating = false;
    this.isPanning = false;

    this.lastX = 0;
    this.lastY = 0;

    domElement.addEventListener("mousedown", e => this.onMouseDown(e));
    domElement.addEventListener("mousemove", e => this.onMouseMove(e));
    domElement.addEventListener("mouseup",   () => this.onMouseUp());
    domElement.addEventListener("wheel",     e => this.onWheel(e), { passive: false });
  }

  onMouseDown(e) {
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (e.button === 0) this.isRotating = true;
    if (e.button === 2) this.isPanning = true;
  }

  onMouseMove(e) {
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;

    if (this.isRotating) {
      this.camera.rotation.y -= dx * this.rotateSpeed;
      this.camera.rotation.x -= dy * this.rotateSpeed;
    }

    if (this.isPanning) {
      const panX = -dx * this.panSpeed;
      const panY =  dy * this.panSpeed;
      this.camera.position.x += panX;
      this.camera.position.y += panY;
    }

    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  onMouseUp() {
    this.isRotating = false;
    this.isPanning = false;
  }

  onWheel(e) {
    e.preventDefault();
    this.camera.position.z += e.deltaY * this.zoomSpeed;
  }
}

// -------------------------------
// Load CSV
// -------------------------------
async function loadStarCSV(url) {
  const response = await fetch(url);
  const text = await response.text();

  const lines = text.split("\n");
  const header = lines[0].split(",");

  const xIndex = header.indexOf("x0");
  const yIndex = header.indexOf("y0");
  const zIndex = header.indexOf("z0");
  const magIndex = header.indexOf("mag");

  const stars = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;

    const cols = row.split(",");

    const x = parseFloat(cols[xIndex]);
    const y = parseFloat(cols[yIndex]);
    const z = parseFloat(cols[zIndex]);
    const mag = parseFloat(cols[magIndex]);

    if (isNaN(x) || isNaN(y) || isNaN(z) || isNaN(mag)) continue;

    stars.push({ x, y, z, mag });
  }

  return stars;
}

// -------------------------------
// Build Star Geometry (direct XYZ)
// -------------------------------
function buildStarGeometry(stars) {
  const positions = new Float32Array(stars.length * 3);

  let ptr = 0;
  for (const s of stars) {
    positions[ptr++] = s.x;
    positions[ptr++] = s.y;
    positions[ptr++] = s.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  return geometry;
}

// -------------------------------
// Initialize 3D Scene
// -------------------------------
async function startSky3D() {
  const canvas = document.getElementById("sky3d-canvas");

  sky3dRenderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
  });
  sky3dRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
  sky3dRenderer.setPixelRatio(window.devicePixelRatio);

  sky3dScene = new THREE.Scene();
  sky3dScene.background = new THREE.Color(0x000000);

  sky3dCamera = new THREE.PerspectiveCamera(
    60,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    50000
  );
  sky3dCamera.position.set(0, 0, 3000);

  // NEW: custom camera controls
  const controls = new MinimalCameraControls(sky3dCamera, canvas);

  // Load CSV (now using xθ,yθ,zθ)
  const stars = await loadStarCSV(
  "https://astro-proxy.niamnbhakta.workers.dev/?url=" +
  encodeURIComponent("https://github.com/astronomystuff/Zenith-Sky/releases/download/At-HYG/stars.csv")
);

  // Build geometry
  const geometry = buildStarGeometry(stars);

  // Simple white points
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 3
  });

  sky3dStars = new THREE.Points(geometry, material);
  sky3dScene.add(sky3dStars);

  animateSky3D();
}

// -------------------------------
// Animation Loop
// -------------------------------
function animateSky3D() {
  if (!sky3dModalOpen) return;

  requestAnimationFrame(animateSky3D);
  sky3dRenderer.render(sky3dScene, sky3dCamera);
}

// -------------------------------
// Modal Open/Close
// -------------------------------
function initSky3DModal() {
  const openBtn = document.getElementById("sky3d-open");
  const closeBtn = document.getElementById("sky3d-close");
  const overlay = document.getElementById("sky3d-modal-overlay");

  openBtn.onclick = () => {
    overlay.style.display = "flex";
    sky3dModalOpen = true;
    startSky3D();
  };

  closeBtn.onclick = () => {
    overlay.style.display = "none";
    sky3dModalOpen = false;
  };
}

// -------------------------------
// Boot
// -------------------------------
window.addEventListener("DOMContentLoaded", () => {
  initSky3DModal();
});
