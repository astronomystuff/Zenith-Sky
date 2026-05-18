let sky3dScene, sky3dCamera, sky3dRenderer;
let sky3dModalOpen = false;
let sky3dControls;
let sky3dStarBase = [];
let sky3dCelestialSphere = null;
let sky3dGround = null;
let sky3dTooltip = null;
let sky3dRootGroup = null;
let sky3dRaycaster = new THREE.Raycaster();
  sky3dRaycaster.params.Points.threshold = 0.01;
let sky3dMouse = new THREE.Vector2();

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

    // Touch state
    this.touchMode = null; // "rotate" or "pinch"
    this.lastTouchDist = 0;

    // Desktop
    domElement.addEventListener("mousedown", e => this.onMouseDown(e));
    domElement.addEventListener("mousemove", e => this.onMouseMove(e));
    domElement.addEventListener("mouseup", () => this.onMouseUp());
    domElement.addEventListener("mouseleave", () => this.onMouseUp());
    domElement.addEventListener("wheel", e => this.onWheel(e), { passive: false });
    domElement.addEventListener("contextmenu", e => e.preventDefault());

    // Mobile
    domElement.addEventListener("touchstart", e => this.onTouchStart(e), { passive: false });
    domElement.addEventListener("touchmove", e => this.onTouchMove(e), { passive: false });
    domElement.addEventListener("touchend", () => this.onTouchEnd());
    domElement.addEventListener("touchcancel", () => this.onTouchEnd());
  }

  /* ============================
     DESKTOP CONTROLS
  ============================ */
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

    if (sky3dRootGroup) {
      sky3dRootGroup.rotation.y += dx * this.rotateSpeed;
      sky3dRootGroup.rotation.x += dy * this.rotateSpeed;

      const limit = Math.PI / 2;
      sky3dRootGroup.rotation.x = Math.max(
        -limit,
        Math.min(limit, sky3dRootGroup.rotation.x)
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

  /* ============================
     MOBILE CONTROLS
  ============================ */
  onTouchStart(e) {
    if (e.touches.length === 1) {
      // One finger → rotate
      this.touchMode = "rotate";
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      // Two fingers → pinch zoom
      this.touchMode = "pinch";
      this.lastTouchDist = this.getTouchDistance(e);
    }
  }

  onTouchMove(e) {
    e.preventDefault();

    if (this.touchMode === "rotate" && e.touches.length === 1) {
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;

      const dx = x - this.lastX;
      const dy = y - this.lastY;

      if (sky3dRootGroup) {
        sky3dRootGroup.rotation.y += dx * this.rotateSpeed;
        sky3dRootGroup.rotation.x += dy * this.rotateSpeed;

        const limit = Math.PI / 2;
        sky3dRootGroup.rotation.x = Math.max(
          -limit,
          Math.min(limit, sky3dRootGroup.rotation.x)
        );
      }

      this.lastX = x;
      this.lastY = y;
    }

    if (this.touchMode === "pinch" && e.touches.length === 2) {
      const newDist = this.getTouchDistance(e);
      const delta = this.lastTouchDist - newDist;

      this.camera.fov += delta * 0.15; // pinch zoom sensitivity
      this.camera.fov = Math.max(20, Math.min(100, this.camera.fov));
      this.camera.updateProjectionMatrix();

      this.lastTouchDist = newDist;
    }
  }

  onTouchEnd() {
    this.touchMode = null;
  }

  getTouchDistance(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

/* ============================================================
   CSV Loader
   ============================================================ */
async function loadStarCSV(url) {
  let text;

  try {
    // Try direct fetch first
    const response = await fetch(url);
    if (!response.ok) throw new Error("Direct fetch failed");
    text = await response.text();
  } catch (err) {
    console.warn("Direct fetch failed, falling back to Worker:", err);

    const workerURL =
      "https://astro-proxy.niamnbhakta.workers.dev/?url=" +
      encodeURIComponent(url);

    const response2 = await fetch(workerURL);
    if (!response2.ok) throw new Error("Worker fetch failed");
    text = await response2.text();
  }

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
  const jd = toJulianDate(dateCivil);
  const gmst = gmstFromJulian(jd);
  let lst = gmst + lonEastDeg * Math.PI / 180;
  lst = ((lst % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { lst, dateLMT: dateCivil };
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

function centerOnWorldPos(pos) {
  const starDir = pos.clone().normalize();
  const camForward = new THREE.Vector3(0, 0, -1);

  const q = new THREE.Quaternion().setFromUnitVectors(starDir, camForward);

  sky3dRootGroup.quaternion.premultiply(q);
}

/* ============================================================
   Build Celestial Sphere
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
  s.raHours = pm.raHours;
  s.decDeg = pm.decDeg;
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
  const starIndices = new Uint32Array(chosen.length);

  let ptr = 0;
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i];
    starIndices[i] = c.idx;

    positions[ptr++] = c.x;
    positions[ptr++] = c.y;
    positions[ptr++] = c.z;

    const mag = sky3dStarBase[c.idx].mag;
    sizes[i] = 0.0375 * Math.pow(1.5, -mag);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("sizeAttr", new THREE.BufferAttribute(sizes, 1));
  geometry.userData.starIndices = starIndices;

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
   onSky3DClick
   ============================================================ */
function onSky3DClick(event) {
  const rect = sky3dRenderer.domElement.getBoundingClientRect();

  sky3dMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  sky3dMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  sky3dRaycaster.setFromCamera(sky3dMouse, sky3dCamera);

  if (!sky3dCelestialSphere) return;

  const points = sky3dCelestialSphere.children[0];
  const intersects = sky3dRaycaster.intersectObject(points);
  if (intersects.length === 0) return;

  const i = intersects[0].index;
  const starIdx = points.geometry.userData.starIndices[i];
  const star = sky3dStarBase[starIdx];

  // Project star to screen
  const pos = new THREE.Vector3(
  points.geometry.attributes.position.getX(i),
  points.geometry.attributes.position.getY(i),
  points.geometry.attributes.position.getZ(i)
);
   
  pos.applyMatrix4(points.matrixWorld);
  pos.project(sky3dCamera);


  const sx = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
  const sy = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
  const dx = event.clientX - sx;
  const dy = event.clientY - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Show tooltip
  sky3dTooltip.innerHTML =
    `<b>${star.proper || "Unnamed star"}</b><br>` +
    `Mag: ${star.mag}<br>` +
    `Dist: ${star.dist} ly`;

  sky3dTooltip.style.left = (event.clientX + 12) + "px";
  sky3dTooltip.style.top = (event.clientY + 12) + "px";
  sky3dTooltip.style.display = "block";

  clearTimeout(sky3dTooltip.hideTimer);
  sky3dTooltip.hideTimer = setTimeout(() => {
    sky3dTooltip.style.display = "none";
  }, 5000);
}

function searchSky3D() {
  const query = document.getElementById("sky3d-search").value.trim().toLowerCase();
  if (!query) return;

  // 1. Find matching star in base catalog
  let best = null;
  for (let i = 0; i < sky3dStarBase.length; i++) {
    const s = sky3dStarBase[i];

    if (s.proper && s.proper.toLowerCase().includes(query)) {
      best = { star: s, idx: i };
      break;
    }

    if (query.startsWith("hip")) {
      const hip = query.replace("hip", "").trim();
      if (s.hip && String(s.hip) === hip) {
        best = { star: s, idx: i };
        break;
      }
    }
  }

  if (!best) {
    alert("Object not found.");
    return;
  }

  const star = best.star;
  const starIdx = best.idx;

  const points = sky3dCelestialSphere.children[0];
  const geom = points.geometry;
  const starIndices = geom.userData.starIndices;
  const positions = geom.attributes.position;

  // 2. Find this star in the rendered geometry
  let geoIndex = -1;
  for (let i = 0; i < starIndices.length; i++) {
    if (starIndices[i] === starIdx) {
      geoIndex = i;
      break;
    }
  }

  if (geoIndex === -1) {
    alert("That object is currently below the horizon or filtered out.");
    return;
  }

  // 3. Get its local position and convert to world
  const pos = new THREE.Vector3(
    positions.getX(geoIndex),
    positions.getY(geoIndex),
    positions.getZ(geoIndex)
  );
  points.localToWorld(pos);

  // 4. Compute direction from camera to star
  const starDir = pos.clone().normalize();

  // Camera forward direction (0,0,-1) in world space
  const camForward = new THREE.Vector3(0, 0, -1);

  // 5. Compute quaternion that rotates starDir → camForward
  const q = new THREE.Quaternion().setFromUnitVectors(starDir, camForward);

  // 6. Apply rotation to the sphere
  sky3dRootGroup.quaternion.premultiply(q);

  // 7. Store for center button
  window.sky3dSelectedWorldPos = pos.clone();

  // 8. Update info panel (unchanged)
  const dateCivil = getDateFromUICivil();
  const { latDeg, lonDeg } = getLocationFromUI();
  const { lst, dateLMT } = getLSTRadiansFromCivil(dateCivil, lonDeg);
  const years = (dateLMT.getTime() - J2000_MS) / 31557600000;
  const pm = applyProperMotionFromXYZ(star, years);

  const raRad  = pm.raHours * 15 * Math.PI / 180;
  const decRad = pm.decDeg * Math.PI / 180;
  const latRad = latDeg * Math.PI / 180;
  const H = lst - raRad;

  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                 Math.cos(latRad) * Math.cos(decRad) * Math.cos(H);
  const alt = Math.asin(sinAlt);

  const sinAz = -Math.cos(decRad) * Math.sin(H) / Math.cos(alt);
  const cosAz = (Math.sin(decRad) - Math.sin(alt) * Math.sin(latRad)) /
                (Math.cos(alt) * Math.cos(latRad));
  const az = Math.atan2(sinAz, cosAz);

  document.getElementById("sky3d-object-name").textContent = star.proper || "Unnamed star";
  document.getElementById("sky3d-object-type").textContent = "Star";
  document.getElementById("sky3d-object-ra-dec").textContent =
    `RA: ${pm.raHours.toFixed(2)}h, Dec: ${pm.decDeg.toFixed(2)}°`;
  document.getElementById("sky3d-object-alt-az").textContent =
    `Alt: ${(alt * 180/Math.PI).toFixed(2)}°, Az: ${(az * 180/Math.PI).toFixed(2)}°`;
  document.getElementById("sky3d-object-mag").textContent = `Mag: ${star.mag}`;
  document.getElementById("sky3d-object-distance").textContent =
    `Dist: ${star.dist} ly`;

  const centerBtn = document.getElementById("sky3d-center");
  const lockBtn   = document.getElementById("sky3d-lock");
  if (centerBtn) centerBtn.disabled = false;
  if (lockBtn)   lockBtn.disabled = false;
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
  sky3dRootGroup.add(sky3dCelestialSphere);
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
  sky3dTooltip = document.getElementById("sky3d-tooltip");
  sky3dGround = makeGround();
  sky3dRootGroup = new THREE.Group();
  sky3dScene.add(sky3dRootGroup);
  sky3dRootGroup.add(sky3dGround);
  sky3dCamera = new THREE.PerspectiveCamera(
    60,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    10
  );
sky3dCamera.position.set(0, 0, 0);
sky3dCamera.lookAt(0, 0, -1);
sky3dRootGroup.add(sky3dCamera);

  sky3dControls = new MinimalCameraControls(sky3dCamera, canvas);
  canvas.addEventListener("click", onSky3DClick);
   
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
   
  setTimeout(() => {
    if (!sky3dScene) {
      startSky3D();
    } else {
      rebuildCelestialSphere();
      animateSky3D();
    }
  }, 0);
};


  closeBtn.onclick = () => {
    overlay.style.display = "none";
    sky3dModalOpen = false;
  };

if (applyDT) applyDT.onclick = rebuildCelestialSphere;
if (applyLoc) applyLoc.onclick = rebuildCelestialSphere;

// Search wiring
const searchBtn = document.getElementById("sky3d-search-btn");
if (searchBtn) searchBtn.onclick = searchSky3D;
const searchInput = document.getElementById("sky3d-search");
if (searchInput) {
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") searchSky3D();
  });
}
  
}

/* ============================================================
   Ensure modal wiring runs
   ============================================================ */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSky3DModal);
} else {
  initSky3DModal();
}
