let sky3dScene, sky3dCamera, sky3dRenderer, sky3dStars;
let sky3dModalOpen = false;

// -------------------------------
// Load CSV
// -------------------------------
async function loadStarCSV(url) {
  const response = await fetch(url);
  const text = await response.text();

  const lines = text.split("\n");
  const header = lines[0].split(",");

  const raIndex = header.indexOf("ra");
  const decIndex = header.indexOf("dec");
  const magIndex = header.indexOf("mag");

  const stars = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;

    const cols = row.split(",");

    const ra = parseFloat(cols[raIndex]);   // hours
    const dec = parseFloat(cols[decIndex]); // degrees
    const mag = parseFloat(cols[magIndex]); // magnitude

    if (isNaN(ra) || isNaN(dec) || isNaN(mag)) continue;

    stars.push({ ra, dec, mag });
  }

  return stars;
}

// -------------------------------
// Convert RA/Dec → 3D XYZ
// -------------------------------
function raDecToXYZ(raHours, decDeg) {
  const ra = raHours * 15 * Math.PI / 180; // hours → degrees → radians
  const dec = decDeg * Math.PI / 180;

  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.sin(dec);
  const z = Math.cos(dec) * Math.sin(ra);

  return { x, y, z };
}

// -------------------------------
// Build Star Geometry
// -------------------------------
function buildStarGeometry(stars) {
  const positions = new Float32Array(stars.length * 3);

  let ptr = 0;
  for (const s of stars) {
    const { x, y, z } = raDecToXYZ(s.ra, s.dec);
    positions[ptr++] = x;
    positions[ptr++] = y;
    positions[ptr++] = z;
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
    1000
  );
  sky3dCamera.position.set(0, 0, 3);

  const controls = new THREE.OrbitControls(sky3dCamera, canvas);
  controls.enableDamping = true;

  // Load CSV
  const stars = await loadStarCSV("stars.csv");

  // Build geometry
  const geometry = buildStarGeometry(stars);

  // Simple white points
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.01
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
