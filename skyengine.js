let sky3dScene, sky3dCamera, sky3dRenderer, sky3dStars;
let sky3dModalOpen = false;
let sky3dControls;
let sky3dStarBase = [];

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

// ---------------- Minimal Camera Controls ----------------
class MinimalCameraControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.2;

    this.isRotating = false;
    this.lastX = 0;
    this.lastY = 0;

    domElement.addEventListener("mousedown", e => this.onMouseDown(e));
    domElement.addEventListener("mousemove", e => this.onMouseMove(e));
    domElement.addEventListener("mouseup",   () => this.onMouseUp());
    domElement.addEventListener("mouseleave",() => this.onMouseUp());
    domElement.addEventListener("wheel",     e => this.onWheel(e), { passive: false });
    domElement.addEventListener("contextmenu", e => e.preventDefault());
  }

  onMouseDown(e) {
    if (e.button !== 0) return;
    this.isRotating = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  onMouseMove(e) {
    if (!this.isRotating) return;

    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;

    const rotY = dx * this.rotateSpeed;
    const rotX = dy * this.rotateSpeed;

    const offset = this.camera.position.clone();
    const radius = offset.length();

    const theta = Math.atan2(offset.x, offset.z);
    const phi   = Math.acos(offset.y / radius);

    const newTheta = theta + rotY;
    const newPhi   = Math.min(Math.max(phi + rotX, 0.01), Math.PI - 0.01);

    offset.x = radius * Math.sin(newPhi) * Math.sin(newTheta);
    offset.y = radius * Math.cos(newPhi);
    offset.z = radius * Math.sin(newPhi) * Math.cos(newTheta);

    this.camera.position.copy(offset);
    this.camera.lookAt(0, 0, 0);

    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  onMouseUp() {
    this.isRotating = false;
  }

  onWheel(e) {
    e.preventDefault();
    const dir = this.camera.position.clone().normalize();
    const delta = e.deltaY * this.zoomSpeed * 0.01;
    const newPos = this.camera.position.clone().addScaledVector(dir, delta);
    const r = newPos.length();
    const minR = 1.5;
    const maxR = 6.0;
    if (r >= minR && r <= maxR) {
      this.camera.position.copy(newPos);
      this.camera.lookAt(0, 0, 0);
    }
  }
}

// ---------------- CSV loader (with quote‑stripping) ----------------
async function loadStarCSV(url) {
  const response = await fetch(url);
  const text = await response.text();

  const lines = text.split("\n");
  if (!lines.length) return [];

  // strip quotes from header fields
  const rawHeader = lines[0].split(",");
  const header = rawHeader.map(h => h.replace(/"/g, "").trim());

  const xIndex    = header.indexOf("x0");
  const yIndex    = header.indexOf("y0");
  const zIndex    = header.indexOf("z0");
  const distIndex = header.indexOf("dist");
  const pmRaIndex = header.indexOf("pm_ra");
  const pmDecIndex= header.indexOf("pm_dec");
  const rvIndex   = header.indexOf("rv");
  const magIndex  = header.indexOf("mag");

  const stars = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;

    const rawCols = row.split(",");
    const cols = rawCols.map(c => c.replace(/"/g, "").trim());

    const x0   = parseFloat(cols[xIndex]);
    const y0   = parseFloat(cols[yIndex]);
    const z0   = parseFloat(cols[zIndex]);
    const dist = parseFloat(cols[distIndex]);
    const pmRa = parseFloat(cols[pmRaIndex]);
    const pmDec= parseFloat(cols[pmDecIndex]);
    const rv   = parseFloat(cols[rvIndex]);
    const mag  = parseFloat(cols[magIndex]);

    if (isNaN(x0) || isNaN(y0) || isNaN(z0) || isNaN(dist) || isNaN(mag)) continue;

    stars.push({ x0, y0, z0, dist, pmRa, pmDec, rv, mag });
  }

  console.log("Loaded stars:", stars.length);
  return stars;
}

// ---------------- xyz <-> RA/Dec + proper motion ----------------
const LY_TO_PC = 1 / 3.26156;

function xyzToRaDec(x, y, z) {
  const rLY = Math.sqrt(x*x + y*y + z*z);
  const rPC = rLY * LY_TO_PC;

  const ra  = Math.atan2(z, x);
  const dec = Math.asin(y / rLY);

  let raHours = (ra < 0 ? ra + 2*Math.PI : ra) * 12 / Math.PI;
  let decDeg  = dec * 180 / Math.PI;

  return { raHours, decDeg, distance: rPC };
}


function masToRad(mas) {
  return mas * (Math.PI / (180 * 3600 * 1000));
}

function rvToParsecPerYear(rvKmPerSec) {
  return rvKmPerSec / 977792.221;
}

function applyProperMotionFromXYZ(star, yearsSinceJ2000) {
  const { x0, y0, z0, pmRa, pmDec, rv } = star;

  const base = xyzToRaDec(x0, y0, z0);
  const ra  = base.raHours * 15 * Math.PI/180;
  const dec = base.decDeg * Math.PI/180;
  const dist = base.distance;

  const pmRaRad  = masToRad(pmRa || 0);
  const pmDecRad = masToRad(pmDec || 0);
  const rvPcy    = rvToParsecPerYear(rv || 0);

const x = dist * Math.cos(dec) * Math.cos(ra);
const y = dist * Math.sin(dec);
const z = dist * Math.cos(dec) * Math.sin(ra);

  const vx = -pmRaRad * y - pmDecRad * Math.sin(ra) * Math.sin(dec) + rvPcy * Math.cos(dec) * Math.cos(ra);
  const vy =  pmRaRad * x - pmDecRad * Math.cos(ra) * Math.sin(dec) + rvPcy * Math.sin(dec);
  const vz =  pmDecRad * Math.cos(dec) + rvPcy * Math.cos(dec) * Math.sin(ra);

  const x2 = x + vx * yearsSinceJ2000;
  const y2 = y + vy * yearsSinceJ2000;
  const z2 = z + vz * yearsSinceJ2000;

  return xyzToRaDec(x2, y2, z2);
}

// ---------------- Time / LST / AltAz ----------------
function toJulianDate(date) {
  const time = date.getTime();
  return time / 86400000 + 2440587.5;
}

function gmstFromJulian(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 +
             360.98564736629 * (jd - 2451545.0) +
             0.000387933 * T * T -
             (T * T * T) / 38710000.0;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst * Math.PI / 180;
}

function getLSTRadians(date, lonDeg) {
  const jd   = toJulianDate(date);
  const gmst = gmstFromJulian(jd);
  const lon  = lonDeg * Math.PI / 180;
  let lst = gmst + lon;
  lst = ((lst % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return lst;
}

function raDecToAltAz(raHours, decDeg, latDeg, lstRad) {
  const ra  = raHours * 15 * Math.PI/180;
  const dec = decDeg * Math.PI/180;
  const lat = latDeg * Math.PI/180;

  const ha = lstRad - ra;

  const sinAlt = Math.sin(dec)*Math.sin(lat) + Math.cos(dec)*Math.cos(lat)*Math.cos(ha);
  const alt = Math.asin(sinAlt);

  const cosAz = (Math.sin(dec) - Math.sin(alt)*Math.sin(lat)) / (Math.cos(alt)*Math.cos(lat));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));

  if (Math.sin(ha) > 0) az = 2*Math.PI - az;

  return { alt, az };
}

function altAzToXYZ(alt, az) {
  const x = Math.cos(alt) * Math.sin(az);
  const y = Math.sin(alt);
  const z = Math.cos(alt) * Math.cos(az);
  return { x, y, z };
}

// ---------------- UI helpers ----------------
function getDateFromUI() {
  const year  = parseInt(document.getElementById("sky3d-year").value, 10);
  const month = parseInt(document.getElementById("sky3d-month").value, 10);
  const day   = parseInt(document.getElementById("sky3d-day").value, 10);
  const timeStr = document.getElementById("sky3d-time").value || "00:00";
  const era  = document.getElementById("sky3d-era").value;

  let [hh, mm] = timeStr.split(":").map(v => parseInt(v, 10));
  if (isNaN(hh)) hh = 0;
  if (isNaN(mm)) mm = 0;

  let y = year;
  if (era === "BCE") y = 1 - year;

  return new Date(Date.UTC(y, month - 1, day, hh, mm, 0));
}

function getLocationFromUI() {
  const latDeg = parseFloat(document.getElementById("sky3d-lat").value) || 0;
  const lonDeg = parseFloat(document.getElementById("sky3d-lon").value) || 0;
  return { latDeg, lonDeg };
}

// ---------------- Build geometry for given date/location ----------------
function buildEarthSkyGeometry(date, latDeg, lonDeg) {
  const lst = getLSTRadians(date, lonDeg);
  const yearsSinceJ2000 = (date.getTime() - J2000_MS) / 31557600000;

  const positions = new Float32Array(sky3dStarBase.length * 3);
  let ptr = 0;

  for (let i = 0; i < sky3dStarBase.length; i++) {
    const s = sky3dStarBase[i];

    const { raHours, decDeg } = applyProperMotionFromXYZ(s, yearsSinceJ2000);
    const { alt, az } = raDecToAltAz(raHours, decDeg, latDeg, lst);
    const p = altAzToXYZ(alt, az);

    positions[ptr++] = p.x;
    positions[ptr++] = p.y;
    positions[ptr++] = p.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function updateSkyFromUI() {
  if (!sky3dScene || sky3dStarBase.length === 0 || !sky3dStars) return;

  const date = getDateFromUI();
  const { latDeg, lonDeg } = getLocationFromUI();

  const geometry = buildEarthSkyGeometry(date, latDeg, lonDeg);
  sky3dStars.geometry.dispose();
  sky3dStars.geometry = geometry;
}

// ---------------- Init scene ----------------
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
    100
  );
  sky3dCamera.position.set(0, 0, 3);
  sky3dCamera.lookAt(0, 0, 0);

  sky3dControls = new MinimalCameraControls(sky3dCamera, canvas);

  const stars = await loadStarCSV(
    "https://astro-proxy.niamnbhakta.workers.dev/?url=" +
    encodeURIComponent("https://github.com/astronomystuff/Zenith-Sky/releases/download/At-HYG/stars.csv")
  );
  sky3dStarBase = stars;

  const date = getDateFromUI();
  const { latDeg, lonDeg } = getLocationFromUI();
  const geometry = buildEarthSkyGeometry(date, latDeg, lonDeg);

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2,
    sizeAttenuation: true
  });

  sky3dStars = new THREE.Points(geometry, material);
  sky3dScene.add(sky3dStars);

  animateSky3D();
}

// ---------------- Animation ----------------
function animateSky3D() {
  if (!sky3dModalOpen) return;
  requestAnimationFrame(animateSky3D);
  sky3dRenderer.render(sky3dScene, sky3dCamera);
}

// ---------------- Modal wiring ----------------
function initSky3DModal() {
  const openBtn = document.getElementById("sky3d-open");
  const closeBtn = document.getElementById("sky3d-close");
  const overlay = document.getElementById("sky3d-modal-overlay");

  openBtn.onclick = () => {
    overlay.style.display = "flex";
    sky3dModalOpen = true;
    if (!sky3dScene) {
      startSky3D();
    } else {
      animateSky3D();
    }
  };

  closeBtn.onclick = () => {
    overlay.style.display = "none";
    sky3dModalOpen = false;
  };

  document.getElementById("sky3d-apply-datetime").onclick = () => {
    updateSkyFromUI();
  };

  document.getElementById("sky3d-apply-location").onclick = () => {
    updateSkyFromUI();
  };
}

window.addEventListener("DOMContentLoaded", () => {
  initSky3DModal();
});
