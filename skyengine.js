let sky3dScene, sky3dCamera, sky3dRenderer;
let sky3dModalOpen = false;
let sky3dControls;
let sky3dStarBase = [];
let sky3dCelestialSphere = null;

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const LY_TO_PC = 1 / 3.26156;

/* ============================================================
   Star texture (round sprite)
   ============================================================ */
function makeStarTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  return texture;
}


/* ============================================================
   Minimal Camera Controls — rotate sphere + zoom
   ============================================================ */
class MinimalCameraControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.05;
    this.isRotating = false;
    this.lastX = 0;
    this.lastY = 0;

    domElement.addEventListener("mousedown", e => this.onMouseDown(e));
    domElement.addEventListener("mousemove", e => this.onMouseMove(e));
    domElement.addEventListener("mouseup", () => this.onMouseUp());
    domElement.addEventListener("mouseleave", () => this.onMouseUp());
    domElement.addEventListener("wheel", e => this.onWheel(e), { passive: false });
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

  if (sky3dCelestialSphere) {
    sky3dCelestialSphere.rotation.y += dx * this.rotateSpeed;

    sky3dCelestialSphere.rotation.x += dy * this.rotateSpeed;

    const limit = Math.PI / 2;
    sky3dCelestialSphere.rotation.x = Math.max(
      -limit,
      Math.min(limit, sky3dCelestialSphere.rotation.x)
    );
  }

  this.lastX = e.clientX;
  this.lastY = e.clientY;
}

  onMouseUp() {
    this.isRotating = false;
  }

  onWheel(e) {
  e.preventDefault();
  if (!this.camera) return;

  const delta = e.deltaY > 0 ? 1 : -1;
  this.camera.fov += delta * (this.camera.fov * this.zoomSpeed);
  this.camera.fov = Math.max(20, Math.min(100, this.camera.fov));
  this.camera.updateProjectionMatrix();
}

}

/* ============================================================
   CSV Loader
   ============================================================ */
async function loadStarCSV(url) {
  const response = await fetch(url);
  const text = await response.text();

  const lines = text.split("\n");
  if (!lines.length) return [];

  const header = lines[0].split(",").map(h => h.replace(/"/g, "").trim());

  const idx = {
  proper: header.indexOf("proper"),
  x: header.indexOf("x0"),
  y: header.indexOf("y0"),
  z: header.indexOf("z0"),
  dist: header.indexOf("dist"),
  pmRa: header.indexOf("pm_ra"),
  pmDec: header.indexOf("pm_dec"),
  rv: header.indexOf("rv"),
  mag: header.indexOf("mag")
};

  const stars = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;

    const cols = row.split(",").map(c => c.replace(/"/g, "").trim());

    const proper = cols[idx.proper]?.trim();
    if (proper && proper.toLowerCase() === "sol") continue;
     
    const x0   = parseFloat(cols[idx.x]);
    const y0   = parseFloat(cols[idx.y]);
    const z0   = parseFloat(cols[idx.z]);
    const dist = parseFloat(cols[idx.dist]);
    const pmRa = parseFloat(cols[idx.pmRa]);
    const pmDec= parseFloat(cols[idx.pmDec]);
    const rv   = parseFloat(cols[idx.rv]);
    const mag  = parseFloat(cols[idx.mag]);

    if (isNaN(x0) || isNaN(y0) || isNaN(z0) || isNaN(dist) || isNaN(mag)) continue;

    stars.push({ proper, x0, y0, z0, dist, pmRa, pmDec, rv, mag });
  }

  console.log("Loaded stars:", stars.length);
  return stars;
}

/* ============================================================
   XYZ → RA/Dec (LY → parsec)
   ============================================================ */
function xyzToRaDec(x, y, z) {
  const rLY = Math.sqrt(x * x + y * y + z * z);
  const rPC = rLY * LY_TO_PC;

  const ra  = Math.atan2(z, x);
  const dec = Math.asin(y / rLY);

  return {
    raHours: (ra < 0 ? ra + 2 * Math.PI : ra) * 12 / Math.PI,
    decDeg: dec * 180 / Math.PI,
    distance: rPC
  };
}

/* ============================================================
   Proper Motion + RV
   ============================================================ */
function masToRad(mas) {
  return mas * (Math.PI / (180 * 3600 * 1000));
}

function rvToParsecPerYear(rvKmPerSec) {
  return rvKmPerSec / 977792.221;
}

function applyProperMotionFromXYZ(star, years) {
  const base = xyzToRaDec(star.x0, star.y0, star.z0);

  const ra  = base.raHours * 15 * Math.PI / 180;
  const dec = base.decDeg * Math.PI / 180;
  const dist = base.distance;

  const pmRaRad  = masToRad(star.pmRa || 0);
  const pmDecRad = masToRad(star.pmDec || 0);
  const rvPcy    = rvToParsecPerYear(star.rv || 0);

  const x = dist * Math.cos(dec) * Math.cos(ra);
  const y = dist * Math.sin(dec);
  const z = dist * Math.cos(dec) * Math.sin(ra);

  const vx = -pmRaRad * y - pmDecRad * Math.sin(ra) * Math.sin(dec) + rvPcy * Math.cos(dec) * Math.cos(ra);
  const vy =  pmRaRad * x - pmDecRad * Math.cos(ra) * Math.sin(dec) + rvPcy * Math.sin(dec);
  const vz =  pmDecRad * Math.cos(dec) + rvPcy * Math.cos(dec) * Math.sin(ra);

  return xyzToRaDec(
    x + vx * years,
    y + vy * years,
    z + vz * years
  );
}

/* ============================================================
   Civil Time → LMT → LST
   ============================================================ */
function toJulianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function gmstFromJulian(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 +
             360.98564736629 * (jd - 2451545.0) +
             0.000387933 * T * T -
             (T * T * T) / 38710000.0;
  return ((gmst % 360) + 360) % 360 * Math.PI / 180;
}

function getLSTRadiansFromCivil(dateCivil, lonDegUI) {
  const lonEastDeg = -lonDegUI;
  const tzOffsetHours = -dateCivil.getTimezoneOffset() / 60;

  const lmtMinusCivilHours = lonEastDeg / 15 - tzOffsetHours;
  const dateLMT = new Date(dateCivil.getTime() + lmtMinusCivilHours * 3600000);

  const jd = toJulianDate(dateLMT);
  const gmst = gmstFromJulian(jd);

  return {
    lst: gmst + lonEastDeg * Math.PI / 180,
    dateLMT
  };
}

/* ============================================================
   RA/Dec → Unit Sphere XYZ
   ============================================================ */
function raDecToXYZ(raHours, decDeg) {
  const ra = raHours * 15 * Math.PI / 180;
  const dec = decDeg * Math.PI / 180;

  return {
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.sin(dec),
    z: Math.cos(dec) * Math.sin(ra)
  };
}

/* ============================================================
   UI Helpers
   ============================================================ */
function getDateFromUICivil() {
  const year  = parseInt(document.getElementById("sky3d-year").value, 10);
  const month = parseInt(document.getElementById("sky3d-month").value, 10);
  const day   = parseInt(document.getElementById("sky3d-day").value, 10);
  const timeStr = document.getElementById("sky3d-time").value || "00:00";
  const era  = document.getElementById("sky3d-era").value;

  let [hh, mm] = timeStr.split(":").map(Number);
  let y = year;
  if (era === "BCE") y = 1 - year;

  return new Date(y, month - 1, day, hh, mm, 0, 0);
}

function getLocationFromUI() {
  return {
    latDeg: parseFloat(document.getElementById("sky3d-lat").value) || 0,
    lonDeg: parseFloat(document.getElementById("sky3d-lon").value) || 0
  };
}

function makeGround() {
  const geometry = new THREE.SphereGeometry(
    5,
    64, 32,
    0, Math.PI * 2,
    0, Math.PI / 2
  );

  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide
  });

  const ground = new THREE.Mesh(geometry, material);

  ground.rotation.x = Math.PI / 2;
  ground.renderOrder = 999;

  return ground;
}


/* ============================================================
   Build Celestial Sphere (with per‑star sizes + dynamic mag limit)
   ============================================================ */
function buildCelestialSphere(dateCivil, latDeg, lonDeg, maxPoints = 150000) {
  const { lst, dateLMT } = getLSTRadiansFromCivil(dateCivil, lonDeg);
  const years = (dateLMT.getTime() - J2000_MS) / 31557600000;
  const latRad = latDeg * Math.PI / 180;

  // Dynamic magnitude limit
  let fov = sky3dCamera ? sky3dCamera.fov : 60;
  let dynamicMagLimit = 6 - (fov - 60) * 0.08;
  dynamicMagLimit = Math.max(3, Math.min(10, dynamicMagLimit));

  const chosen = [];

  for (let i = 0; i < sky3dStarBase.length; i++) {
  const s = sky3dStarBase[i];

  const pm = applyProperMotionFromXYZ(s, years);

  const raRad  = pm.raHours * 15 * Math.PI / 180;
  const decRad = pm.decDeg * Math.PI / 180;

  // Hour angle
  const H = lst - raRad;

  // Altitude
  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                 Math.cos(latRad) * Math.cos(decRad) * Math.cos(H);
  const alt = Math.asin(sinAlt);

  if (alt <= 0) continue;
  if (s.mag > dynamicMagLimit) continue;

  // Azimuth
  const cosAz = (Math.sin(decRad) - Math.sin(alt) * Math.sin(latRad)) /
                (Math.cos(alt) * Math.cos(latRad));
  const sinAz = -Math.cos(decRad) * Math.sin(H) / Math.cos(alt);
  const az = Math.atan2(sinAz, cosAz);

  // Convert alt/az → XYZ
  const x = Math.cos(alt) * Math.sin(az);
  const y = Math.sin(alt);
  const z = Math.cos(alt) * Math.cos(az);

  chosen.push({ idx: i, x, y, z });
}

  chosen.sort((a, b) => sky3dStarBase[a.idx].mag - sky3dStarBase[b.idx].mag);
  if (chosen.length > maxPoints) chosen.length = maxPoints;

  const positions = new Float32Array(chosen.length * 3);
  const sizes = new Float32Array(chosen.length);

  let ptr = 0;
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i];

    positions[ptr++] = c.x;
    positions[ptr++] = c.y;
    positions[ptr++] = c.z;

    const mag = sky3dStarBase[c.idx].mag;
    sizes[i] = 0.0375 * Math.pow(1.5, -mag);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("sizeAttr", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.0,
    sizeAttenuation: true,
    map: makeStarTexture(),
    transparent: true,
    alphaTest: 0.5,
    depthTest: true,
    depthWrite: false
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "void main() {",
      "attribute float sizeAttr;\nvoid main() {"
    );
    shader.vertexShader = shader.vertexShader.replace(
      "gl_PointSize = size;",
      "gl_PointSize = size * sizeAttr;"
    );
  };

  const points = new THREE.Points(geometry, material);
  const group = new THREE.Group();
  group.add(points);

  return group;
}


/* ============================================================
   Rebuild Sphere
   ============================================================ */
function rebuildCelestialSphere() {
  if (!sky3dScene || sky3dStarBase.length === 0) return;

  if (sky3dCelestialSphere) {
    sky3dScene.remove(sky3dCelestialSphere);
  }

  const dateCivil = getDateFromUICivil();
  const { latDeg, lonDeg } = getLocationFromUI();

  sky3dCelestialSphere = buildCelestialSphere(dateCivil, latDeg, lonDeg);
  sky3dScene.add(sky3dCelestialSphere);
  if (sky3dGround) {
  sky3dGround.rotation.x = sky3dCelestialSphere.rotation.x;
  sky3dGround.rotation.y = sky3dCelestialSphere.rotation.y;
  }
}

/* ============================================================
   Init Scene
   ============================================================ */
async function startSky3D() {
  const canvas = document.getElementById("sky3d-canvas");

  sky3dRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  sky3dRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
  sky3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  sky3dScene = new THREE.Scene();
  sky3dScene.background = new THREE.Color(0x000000);

  sky3dGround = makeGround();
  sky3dScene.add(sky3dGround);

  sky3dCamera = new THREE.PerspectiveCamera(
    60,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    10
  );
  sky3dCamera.position.set(0, 0, 0);
  sky3dCamera.lookAt(0, 0, -1);

  sky3dControls = new MinimalCameraControls(sky3dCamera, canvas);

  sky3dStarBase = await loadStarCSV(
    "https://astro-proxy.niamnbhakta.workers.dev/?url=" +
    encodeURIComponent("https://github.com/astronomystuff/Zenith-Sky/releases/download/At-HYG/stars.csv")
  );

  rebuildCelestialSphere();
  animateSky3D();
}

/* ============================================================
   Animation Loop
   ============================================================ */
function animateSky3D() {
  if (!sky3dModalOpen) return;
  requestAnimationFrame(animateSky3D);
  sky3dRenderer.render(sky3dScene, sky3dCamera);
}

/* ============================================================
   Modal Wiring
   ============================================================ */
function initSky3DModal() {
  const openBtn  = document.getElementById("sky3d-open");
  const closeBtn = document.getElementById("sky3d-close");
  const overlay  = document.getElementById("sky3d-modal-overlay");
  const applyDT  = document.getElementById("sky3d-apply-datetime");
  const applyLoc = document.getElementById("sky3d-apply-location");

  if (!openBtn || !closeBtn || !overlay) return;

  openBtn.onclick = () => {
    overlay.style.display = "flex";
    sky3dModalOpen = true;

    if (!sky3dScene) {
      startSky3D();
    } else {
      rebuildCelestialSphere();
      animateSky3D();
    }
  };

  closeBtn.onclick = () => {
    overlay.style.display = "none";
    sky3dModalOpen = false;
  };

  if (applyDT) applyDT.onclick = rebuildCelestialSphere;
  if (applyLoc) applyLoc.onclick = rebuildCelestialSphere;
}

/* ============================================================
   Ensure modal wiring runs
   ============================================================ */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSky3DModal);
} else {
  initSky3DModal();
}
