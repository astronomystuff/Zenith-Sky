window.onerror = function (msg, src, line, col, err) {
  alert(
    "JS ERROR:\n" +
    msg + "\n" +
    "Source: " + src + "\n" +
    "Line: " + line + ", Col: " + col
  );
};

window.sky3dScene = null;
window.sky3dCamera = null;
window.sky3dRenderer = null;
window.sky3dModalOpen = false;
window.sky3dControls = null;
window.sky3dCelestialSphere = null;
window.sky3dGround = null;
window.sky3dTooltip = null;
window.sky3dRootGroup = null;
window.sky3dStarBase = [];
window.sky3dPlanetMeshes = [];
window.sky3dPlanetMap = {};
window.sky3dStarTexture = makeStarTexture();
let sky3dLocked = false;
const LY_TO_PC = 1 / 3.26156;
window.sky3dRaycaster = new THREE.Raycaster();
window.sky3dMouse = new THREE.Vector2();
const VSOP = {
    Mercury: null,
    Venus: null,
    Earth: null,
    Mars: null,
    Jupiter: null,
    Saturn: null,
    Uranus: null,
    Neptune: null
};

async function loadAllCoefficients() {
    VSOP.Mercury = await loadVSOP87File("vsop/VSOP87A.mer.txt");
    VSOP.Venus   = await loadVSOP87File("vsop/VSOP87A.ven.txt");
    VSOP.Earth   = await loadVSOP87File("vsop/VSOP87A.ear.txt");
    VSOP.Mars    = await loadVSOP87File("vsop/VSOP87A.mar.txt");
    VSOP.Jupiter = await loadVSOP87File("vsop/VSOP87A.jup.txt");
    VSOP.Saturn  = await loadVSOP87File("vsop/VSOP87A.sat.txt");
    VSOP.Uranus  = await loadVSOP87File("vsop/VSOP87A.ura.txt");
    VSOP.Neptune = await loadVSOP87File("vsop/VSOP87A.nep.txt");
}

async function loadVSOP87File(url) {
    const text = await fetch(url).then(r => r.text());
    const lines = text.split(/\r?\n/);

    const data = {
        X0: [], X1: [], X2: [], X3: [], X4: [], X5: [],
        Y0: [], Y1: [], Y2: [], Y3: [], Y4: [], Y5: [],
        Z0: [], Z1: [], Z2: [], Z3: [], Z4: [], Z5: []
    };

    let current = null;

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        if (line.includes("VARIABLE")) {
            const varMatch = line.match(/VARIABLE\s+(\d)/);
            const varIndex = varMatch ? Number(varMatch[1]) : null;
            const powMatch = line.match(/T\*\*(\d)/);
            const power = powMatch ? Number(powMatch[1]) : null;

            if (varIndex !== null && power !== null) {
                const axis = (varIndex === 1 ? "X" :
                              varIndex === 2 ? "Y" : "Z");

                current = axis + power;
            }

            continue;
        }

        if (!current) continue;

        if (!/^\d/.test(line)) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 3) continue;

        const A = parseFloat(parts[parts.length - 3]);
        const B = parseFloat(parts[parts.length - 2]);
        const C = parseFloat(parts[parts.length - 1]);

        if (Number.isFinite(A) && Number.isFinite(B) && Number.isFinite(C)) {
            data[current].push([A, B, C]);
        }
    }

    return data;
}

/* ============================================================
   Star texture
   ============================================================ */
function normalizeSpectral(raw) {
  if (!raw) return "";
  let s = raw.trim();

  // Remove leading parentheses or colon
  s = s.replace(/^[(:]+/, "");

  // Remove leading "d" only if followed by a letter
  if (/^d[A-Za-z]/.test(s)) s = s.slice(1);

  // Remove "k-" metallicity prefix
  if (s.startsWith("k-") || s.startsWith("K-")) {
    s = s.slice(2); // remove "k-"
  }

  // Do NOT remove "p" unless the whole thing is "pec"
  if (s.toLowerCase() === "pec") return "pec";

  // 0 → O
  if (s.startsWith("0")) return "O" + s.slice(1);

  return s;
}

function estimateStarAgeAndLifetime(star) {
  const spect = normalizeSpectral(star.spect || "");
  const classMatch = spect.match(/^([OBAFGKMLTYCRNSDWHQZ])([0-9]?)/i);
  const lumMatch   = spect.match(/(Ia|Ib|I{1,3}|II|III|IV|V)/i);
  const cls = classMatch ? classMatch[1].toUpperCase() : null;
  const subtype = classMatch && classMatch[2] ? Number(classMatch[2]) : 5;
  const lumClass = lumMatch ? lumMatch[1].toUpperCase() : "V";

  // --- Luminosity from absolute magnitude ---
  const Mv = star.absmag;
  const L = Math.pow(10, (4.83 - Mv) / 2.5); // L/Lsun

  // --- Mass from luminosity ---
  let massLum;
  if (L < 0.03) {
    massLum = Math.pow(L / 0.23, 1 / 2.3);     // low-mass regime
  } else if (L < 16) {
    massLum = Math.pow(L, 1 / 4.0);            // solar-like
  } else {
    massLum = Math.pow(L / 1.4, 1 / 3.5);      // high-mass
  }

  // --- Spectral-based mass estimate ---
  let massSpec = null;
  if (cls && "OBAFGKM".includes(cls)) {
    const subtypeFrac = Math.min(1, Math.max(0, subtype / 9));
    const classMass = {
      O: [16, 60],
      B: [2.5, 16],
      A: [1.4, 2.5],
      F: [1.04, 1.4],
      G: [0.8, 1.04],
      K: [0.45, 0.8],
      M: [0.08, 0.45]
    }[cls];

    if (classMass) {
      const [minM, maxM] = classMass;
      massSpec = minM + (maxM - minM) * (1 - subtypeFrac);
    }
  }

  // --- Blend mass estimates ---
  const mass = (massSpec == null)
    ? massLum
    : 0.7 * massLum + 0.3 * massSpec;

  // --- Lifetime from mass ---
  let lifetime;
  if (mass < 0.7) {
    lifetime = 1e11 * Math.pow(mass, -2.0);   // red dwarfs
  } else if (mass < 1.5) {
    lifetime = 1e10 * Math.pow(mass, -2.5);   // sun-like
  } else {
    lifetime = 5e9 * Math.pow(mass, -3.0);    // massive stars
  }

  // --- White dwarfs ---
  if (cls === "D") {
    return {
      age: 0,
      lifetime: 1e12,
      remnant: true
    };
  }

  // --- Age fraction ---
  let ageFrac;
  if (lumClass === "V") {
    if (mass > 2) {
      ageFrac = 0.5 + Math.random() * 0.4;
    } else if (mass < 0.7) {
      ageFrac = 0.05 + Math.random() * 0.2;
    } else {
      ageFrac = 0.1 + Math.random() * 0.8;
    }
  } else if (lumClass === "IV") {
    ageFrac = 0.75 + Math.random() * 0.15;
  } else if (lumClass === "III") {
    ageFrac = 0.85 + Math.random() * 0.10;
  } else if (lumClass === "II") {
    ageFrac = 0.90 + Math.random() * 0.08;
  } else if (lumClass === "I" || lumClass === "Ia" || lumClass === "Ib") {
    ageFrac = 0.95 + Math.random() * 0.04;
  } else {
    ageFrac = 0.5;
  }

  const age = lifetime * ageFrac;

  return {
    age,
    lifetime,
    remnant: false
  };
}


function colorForSpectralType(raw) {
  if (!raw) return 0xffffff;

  const s = normalizeSpectral(raw);
  const first = s[0].toUpperCase();

  // OBAFGKM
  const canonical = {
    O: 0x9bb0ff,
    B: 0xaabfff,
    A: 0xcad7ff,
    F: 0xfbf8ff,
    G: 0xfff4e8,
    K: 0xffddb4,
    M: 0xffbd6f
  };
  if (canonical[first]) return canonical[first];

  // Carbon stars (R)
  if (first === "R") return 0x8b0000;

  // S-type stars
  if (first === "S") return 0xff8c4a;

  // Wolf-Rayet
  if (first === "W") return 0x6A00FF;

  // White dwarfs
  if (first === "D") return 0xd0e0ff;

  // N-type
  if (first === "N") {
    if (s.includes("C")) return 0x8b0000; // carbon-N
    if (s.includes("NEB")) return 0xffffff; // nebular central star
    if (s.includes("NOV") || s.includes("0v") || s.includes("var"))
      return 0xd0e0ff; // nova / variable
    return 0xffffff;
  }

  // P-type inspection
  if (first === "P") {
    if (s.includes("PLANETARY")) return 0xd0e0ff;
    return 0xffffff;
  }

  // E-type
  if (first === "E") return 0xffffff;

  // k-type already normalized
  if (first === "M") return canonical.M;
  if (first === "K") return canonical.K;

  return 0xffffff;
}

function makeStarTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(
    size/2, size/2, 0,
    size/2, size/2, size/2
  );

  grad.addColorStop(0.0, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.15, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.35)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");

  ctx.fillStyle = grad;
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
   minimalCameraControls
   ============================================================ */
class minimalCameraControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = true;
    this.locked = false;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.05;
    this.isRotating = false;
    this.lastX = 0;
    this.lastY = 0;
    this.touchMode = null;
    this.lastTouchDist = 0;
    this.lastRebuild = 0;
    this.finalRebuildTimer = null;

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
      const fovFactor = this.camera.fov / 60;
      const rotSpeed = this.rotateSpeed * fovFactor;
      sky3dRootGroup.rotation.y += dx * rotSpeed;
      sky3dRootGroup.rotation.x += dy * rotSpeed;

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
    const delta = (e.deltaY > 0 ? 1 : -1) * (this.camera.fov * this.zoomSpeed);
    this.onZoom(delta);
  }

  /* ============================
     MOBILE CONTROLS
  ============================ */
  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.touchMode = "rotate";
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;

    } else if (e.touches.length === 2) {
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
      const fovFactor = this.camera.fov / 60;
      const rotSpeed = this.rotateSpeed * fovFactor;
      sky3dRootGroup.rotation.y += dx * rotSpeed;
      sky3dRootGroup.rotation.x += dy * rotSpeed;


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
        this.onZoom(delta * 0.15);
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

  onZoom(delta) {
    this.camera.fov = Math.max(1, Math.min(180, this.camera.fov + delta));
    this.camera.updateProjectionMatrix();
    window.sky3dRaycaster.params.Points.threshold =
      0.015 * (this.camera.fov / 60);
    const now = performance.now();
    if (now - this.lastRebuild > 50) {
      this.lastRebuild = now;
      rebuildCelestialSphere(
        window.linesJson,
        window.sky3dStarBase,
        window.sky3dRootGroup
      );
    }

    clearTimeout(this.finalRebuildTimer);
    this.finalRebuildTimer = setTimeout(() => {
      rebuildCelestialSphere(
        window.linesJson,
        window.sky3dStarBase,
        window.sky3dRootGroup
      );
    }, 120);
  }
}

/* ============================================================
   CSV Loader
   ============================================================ */
async function loadStarCSV(url) {
  const deg2rad = Math.PI / 180;
  const KM_PER_AU_PER_YEAR = 977792.221;
  let text;

  try {
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

  // Build index map
  const idx = {
    id:     header.indexOf("id"),
    tyc:    header.indexOf("tyc"),
    gaia:   header.indexOf("gaia"),
    hyg:    header.indexOf("hyg"),
    hip:    header.indexOf("hip"),
    hd:     header.indexOf("hd"),
    hr:     header.indexOf("hr"),
    gl:     header.indexOf("gl"),
    bayer:  header.indexOf("bayer"),
    flam:   header.indexOf("flam"),
    con:    header.indexOf("con"),
    proper: header.indexOf("proper"),
    ra:     header.indexOf("ra"),
    dec:    header.indexOf("dec"),
    dist:   header.indexOf("dist"),
    x:      header.indexOf("x0"),
    y:      header.indexOf("y0"),
    z:      header.indexOf("z0"),
    mag:    header.indexOf("mag"),
    absmag: header.indexOf("absmag"),
    rv:     header.indexOf("rv"),
    pmRa:   header.indexOf("pm_ra"),
    pmDec:  header.indexOf("pm_dec"),
    vx:     header.indexOf("vx"),
    vy:     header.indexOf("vy"),
    vz:     header.indexOf("vz"),
    spect:  header.indexOf("spect")
  };

  const stars = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;

    const cols = row.split(",").map(c => c.replace(/"/g, "").trim());

    const proper = cols[idx.proper];
    if (proper && proper.toLowerCase() === "sol") continue;
    
    if (i % 20000 === 0) {
      sky3dUpdateLoading(`Loading stars… ${i.toLocaleString()} loaded`);
      await new Promise(requestAnimationFrame);  // <-- THIS is the magic
    }

    const id   = parseInt(cols[idx.id], 10);
    let x0   = parseFloat(cols[idx.x]);
    let y0   = parseFloat(cols[idx.y]);
    let z0   = parseFloat(cols[idx.z]);
    let dist = parseFloat(cols[idx.dist]);
    let pmRa = parseFloat(cols[idx.pmRa]);
    let pmDec= parseFloat(cols[idx.pmDec]);
    let rv   = parseFloat(cols[idx.rv]);
    let mag  = parseFloat(cols[idx.mag]);
    let absmag = parseFloat(cols[idx.absmag]);
    let raDeg = parseFloat(cols[idx.ra]) * 15;
    let decDeg = parseFloat(cols[idx.dec]);
    let vx = parseFloat(cols[idx.vx]);
    let vy = parseFloat(cols[idx.vy]);
    let vz = parseFloat(cols[idx.vz]);

const finite = Number.isFinite;

// ---------- 1. Distance ----------
if (!finite(dist) || dist <= 0) {

    // If XYZ exists, compute distance
    if (finite(x0) && finite(y0) && finite(z0)) {
        dist = Math.sqrt(x0*x0 + y0*y0 + z0*z0);
    }

    // If absolute magnitude exists, compute distance from absmag + mag
    else if (finite(absmag) && finite(mag)) {
        // m - M = 5 log10(d) - 5
        dist = Math.pow(10, ((mag - absmag + 5) / 5));
    }

    // If only apparent magnitude exists, estimate distance
    else if (finite(mag)) {
        const M = 5;
        dist = Math.pow(10, (mag - M + 5) / 5);
    }

    else {
        dist = 1000;
    }
}

// ---------- 2. XYZ ----------
// Always reconstruct XYZ from RA/Dec + sanitized dist
const raRad  = raDeg  * deg2rad;
const decRad = decDeg * deg2rad;

x0 = dist * Math.cos(decRad) * Math.cos(raRad);
y0 = dist * Math.cos(decRad) * Math.sin(raRad);
z0 = dist * Math.sin(decRad);

// ---------- 3. Magnitude ----------
if (!finite(mag)) {

    // If absmag exists, compute apparent magnitude
    if (finite(absmag) && finite(dist) && dist > 0) {
        mag = absmag + 5 * Math.log10(dist) - 5;
    }

    // If XYZ exists, estimate brightness from distance
    else if (finite(x0) && finite(y0) && finite(z0)) {
        const d = Math.sqrt(x0*x0 + y0*y0 + z0*z0);
        mag = 5 * Math.log10(d) + 5; // assume M=0
    }

    else {
        mag = 10;
    }
}

// ---------- 4. Proper Motion / Velocity Reconstruction ----------

// Precompute shared values ONCE
const r = Math.sqrt(x0*x0 + y0*y0 + z0*z0);
const ux = x0 / r;
const uy = y0 / r;
const uz = z0 / r;

const sinRA = Math.sin(raRad);
const cosRA = Math.cos(raRad);
const sinDec = Math.sin(decRad);
const cosDec = Math.cos(decRad);

// RA/Dec basis vectors (compute ONCE)
const erax = -sinRA;
const eray =  cosRA;
const eraz =  0;

const edecx = -cosRA * sinDec;
const edecy = -sinRA * sinDec;
const edeccz =  cosDec;

// ---------- PM reconstruction from velocities ----------
if (!finite(pmRa) || !finite(pmDec)) {

    if (finite(vx) && finite(vy) && finite(vz)) {

        const vr = vx*ux + vy*uy + vz*uz;
        const vtx = vx - vr * ux;
        const vty = vy - vr * uy;
        const vtz = vz - vr * uz;

        const pmRaRadPerYear  = (vtx*erax + vty*eray + vtz*eraz) / (dist * 977792.221);
        const pmDecRadPerYear = (vtx*edecx + vty*edecy + vtz*edeccz) / (dist * 977792.221);

        pmRa  = pmRaRadPerYear  * rad2deg * 3600 * 1000;
        pmDec = pmDecRadPerYear * rad2deg * 3600 * 1000;

    } else {
        pmRa = 0;
        pmDec = 0;
    }
}

// ---------- Velocity reconstruction from PM ----------
if (!finite(vx) || !finite(vy) || !finite(vz)) {

    if (finite(pmRa) && finite(pmDec)) {

        const pmRaRad  = pmRa  / (3600 * 1000) * deg2rad;
        const pmDecRad = pmDec / (3600 * 1000) * deg2rad;

        const vtRa  = pmRaRad  * dist * 977792.221;
        const vtDec = pmDecRad * dist * 977792.221;

        const vtx = vtRa * erax + vtDec * edecx;
        const vty = vtRa * eray + vtDec * edecy;
        const vtz = vtRa * eraz + vtDec * edeccz;

        if (finite(rv)) {
            vx = vtx + rv * ux;
            vy = vty + rv * uy;
            vz = vtz + rv * uz;
        } else {
            vx = vtx;
            vy = vty;
            vz = vtz;
        }

    } else {
        vx = 0;
        vy = 0;
        vz = 0;
    }
}



if (!finite(dist) || dist <= 0) dist = 1000;

    stars.push({
      tyc:    cols[idx.tyc],
      gaia:   cols[idx.gaia],
      hyg:    cols[idx.hyg],
      hip:    cols[idx.hip],
      hd:     cols[idx.hd],
      hr:     cols[idx.hr],
      gl:     cols[idx.gl],
      bayer:  cols[idx.bayer],
      flam:   cols[idx.flam],
      con:    cols[idx.con],
      proper: cols[idx.proper],
      id, x0, y0, z0,
      dist,
      raDeg0: raDeg,
      decDeg0:  decDeg,
      pmRa, pmDec, rv, mag, absmag, 
      vx, vy, vz,
      spect: cols[idx.spect]
    });
  }

  console.log("Loaded stars:", stars.length);
  return stars;
}

/* ============================================================
   XYZ → RA/Dec (parsec → parsec)
   ============================================================ */
function xyzToRaDec(x, y, z) {
  const r = Math.sqrt(x*x + y*y + z*z);

  const ra  = Math.atan2(y, x);
  const dec = Math.asin(z / r);

  return {
    raDeg: (ra < 0 ? ra + 2*Math.PI : ra) * 180/Math.PI,
    decDeg: dec * 180/Math.PI,
    distance: r
  };
}

/* ============================================================
   Proper Motion & Precession
   ============================================================ */
const KM_S_TO_PC_YR = 1 / 977792.221;

function applyProperMotionFromXYZ (star, years) {
    let x = star.x0 + star.vx * KM_S_TO_PC_YR * years;
    let y = star.y0 + star.vy * KM_S_TO_PC_YR * years;
    let z = star.z0 + star.vz * KM_S_TO_PC_YR * years;
    return xyzToRaDec(x, y, z);
}

function precessionMatrixIAU2006(jd) {
  const PI = Math.PI;
  const DJ00 = 2451545.0;
  const DJC  = 36525.0;
  const DAS2R = (PI / 180) / 3600;

  function meanObliquityIAU2006(jd) {
    const t = (jd - DJ00) / DJC;
    const epsArcsec =
      84381.406 +
      (-46.836769 +
      (-0.0001831 +
      (0.00200340 +
      (-0.000000576 +
      (-0.0000000434)*t)*t)*t)*t)*t;
    return epsArcsec * DAS2R;
  }

  function computeP03Angles(jd) {
    const t = (jd - DJ00) / DJC;

    const gamb =
      (-0.052928 +
      (10.556378 +
      (0.4932044 +
      (-0.00031238 +
      (-0.000002788 +
      (0.0000000260)*t)*t)*t)*t)*t) * DAS2R;

    const phib =
      (84381.412819 +
      (-46.811016 +
      (0.0511268 +
      (0.00053289 +
      (-0.000000440 +
      (-0.0000000176)*t)*t)*t)*t)*t) * DAS2R;

    const psib =
      (-0.041775 +
      (5038.481484 +
      (1.5584175 +
      (-0.00018522 +
      (-0.000026452 +
      (-0.0000000148)*t)*t)*t)*t)*t) * DAS2R;

    const epsa = meanObliquityIAU2006(jd);
    return { gamb, phib, psib, epsa };
  }

  function matMul(a, b) {
    const r = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        r[i][j] = a[i][0]*b[0][j] + a[i][1]*b[1][j] + a[i][2]*b[2][j];
      }
    }
    return r;
  }

  function rotZ(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [
      [ c,  s, 0],
      [-s,  c, 0],
      [ 0,  0, 1]
    ];
  }

  function rotX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [
      [1, 0,  0],
      [0, c,  s],
      [0,-s,  c]
    ];
  }

  function fw2m(gamb, phib, psi, eps) {
    let r = [
      [1,0,0],
      [0,1,0],
      [0,0,1]
    ];
    r = matMul(rotZ(gamb), r);
    r = matMul(rotX(phib), r);
    r = matMul(rotZ(-psi), r);
    r = matMul(rotX(-eps), r);
    return r;
  }

  const { gamb, phib, psib, epsa } = computeP03Angles(jd);
  return fw2m(gamb, phib, psib, epsa);
}

function applyPrecession(raDeg, decDeg, rbp) {
  const PI = Math.PI;
  const deg2rad = PI / 180;
  const rad2deg = 180 / PI;

  const ra = raDeg * deg2rad;
  const dec = decDeg * deg2rad;

  const x0 = Math.cos(dec) * Math.cos(ra);
  const y0 = Math.cos(dec) * Math.sin(ra);
  const z0 = Math.sin(dec);

  const x = rbp[0][0]*x0 + rbp[0][1]*y0 + rbp[0][2]*z0;
  const y = rbp[1][0]*x0 + rbp[1][1]*y0 + rbp[1][2]*z0;
  const z = rbp[2][0]*x0 + rbp[2][1]*y0 + rbp[2][2]*z0;

  const r = Math.sqrt(x*x + y*y + z*z);
  const decNew = Math.asin(z / r);
  let raNew = Math.atan2(y, x);
  if (raNew < 0) raNew += 2*PI;

  return {
    raDeg: raNew * rad2deg,
    decDeg: decNew * rad2deg
  };
}


/* ============================================================
   Civil Time → LMT → LST
   ============================================================ */
function toJulianDate(civil) {
  let { year, month, day, hour, minute, second } = civil;

  let Y = year;
  let M = month;

  if (M <= 2) {
    Y -= 1;
    M += 12;
  }

  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);

  return Math.floor(365.25 * (Y + 4716))
       + Math.floor(30.6001 * (M + 1))
       + day + B - 1524.5
       + (hour + minute/60 + second/3600) / 24;
}


function gmstFromJulian(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst * Math.PI / 180;
}

function getLSTRadians(civil, lonEastDeg) {
  const jd = toJulianDate(civil);
  const gmst = gmstFromJulian(jd);
  let lst = gmst + lonEastDeg * Math.PI / 180;
  lst = ((lst % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  return lst;
}

/* ============================================================
   Helpers
   ============================================================ */
function getCivilFieldsFromUI() {
  const year  = parseInt(document.getElementById("sky3d-year").value, 10);
  const month = parseInt(document.getElementById("sky3d-month").value, 10);
  const day   = parseInt(document.getElementById("sky3d-day").value, 10);
  const timeStr = document.getElementById("sky3d-time").value || "00:00";
  const era  = document.getElementById("sky3d-era").value;

  let [hh, mm] = timeStr.split(":").map(Number);
  let y = year;
  if (era === "BCE") y = 1 - year;

  return { year: y, month, day, hour: hh, minute: mm, second: 0 };
}

function getLocationFromUI() {
  let lat = parseFloat(document.getElementById("sky3d-lat").value) || 0;
  let lon = parseFloat(document.getElementById("sky3d-lon").value) || 0;
  
  if (lat >= 90)  lat = 89.99999;
  if (lat <= -90) lat = -89.99999;

  return { latDeg: lat, lonDeg: lon };
}


function validateInputs(lat, lon, year, month, day) {
  const errors = [];

  // Latitude
  if (lat < -90 || lat > 90) {
    errors.push("Latitude must be between -90 and +90 degrees");
  }

  // Longitude
  if (lon < -180 || lon > 180) {
    errors.push("Longitude must be between -180 and +180 degrees");
  }

  // Month
  if (month < 1 || month > 12) {
    errors.push("Month must be between 1 and 12");
  }

  // Day
  if (month >= 1 && month <= 12) {
    const maxDay = new Date(year, month, 0).getDate();
    if (day < 1 || day > maxDay) {
      errors.push(`Day must be between 1 and ${maxDay} for month ${month}`);
    }
  } else {
    errors.push("Day cannot be validated because month is invalid");
  }

  return errors;
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
  ground.renderOrder = 999;

  return ground;
}

function getStarNameFromRecord(s) {

  // --- Greek Letter Lookup ---
  const GREEK = {
    alp: "α", bet: "β", gam: "γ", del: "δ", eps: "ε",
    zet: "ζ", eta: "η", the: "θ", iot: "ι", kap: "κ",
    lam: "λ", mu: "μ",  nu: "ν",  xi: "ξ", omi: "ο",
    pi:  "π", rho: "ρ", sig: "σ", tau: "τ", ups: "υ",
    phi: "φ", chi: "χ", psi: "ψ", ome: "ω"
  };

  // --- Constellation Abbreviations ---
  const CONST = {
    And:"Andromeda", Ant:"Antlia", Aps:"Apus", Aqr:"Aquarius", Aql:"Aquila",
    Ara:"Ara", Ari:"Aries", Aur:"Auriga", Boo:"Boötes", Cae:"Caelum",
    Cam:"Camelopardalis", Cnc:"Cancer", CVn:"Canes Venatici", CMa:"Canis Major",
    CMi:"Canis Minor", Cap:"Capricornus", Car:"Carina", Cas:"Cassiopeia",
    Cen:"Centaurus", Cep:"Cepheus", Cet:"Cetus", Cha:"Chamaeleon",
    Cir:"Circinus", Col:"Columba", Com:"Coma Berenices", CrA:"Corona Australis",
    CrB:"Corona Borealis", Crv:"Corvus", Crt:"Crater", Cru:"Crux",
    Cyg:"Cygnus", Del:"Delphinus", Dor:"Dorado", Dra:"Draco", Equ:"Equuleus",
    Eri:"Eridanus", For:"Fornax", Gem:"Gemini", Gru:"Grus", Her:"Hercules",
    Hor:"Horologium", Hya:"Hydra", Hyi:"Hydrus", Ind:"Indus", Lac:"Lacerta",
    Leo:"Leo", LMi:"Leo Minor", Lep:"Lepus", Lib:"Libra", Lup:"Lupus",
    Lyn:"Lynx", Lyr:"Lyra", Men:"Mensa", Mic:"Microscopium", Mon:"Monoceros",
    Mus:"Musca", Nor:"Norma", Oct:"Octans", Oph:"Ophiuchus", Ori:"Orion",
    Pav:"Pavo", Peg:"Pegasus", Per:"Perseus", Phe:"Phoenix", Pic:"Pictor",
    PsA:"Piscis Austrinus", Psc:"Pisces", Pup:"Puppis", Pyx:"Pyxis",
    Ret:"Reticulum", Sge:"Sagitta", Sgr:"Sagittarius", Sco:"Scorpius",
    Scl:"Sculptor", Sct:"Scutum", Ser:"Serpens", Sxt:"Sextans", Tau:"Taurus",
    Tel:"Telescopium", TrA:"Triangulum Australe", Tri:"Triangulum",
    Tuc:"Tucana", UMa:"Ursa Major", UMi:"Ursa Minor", Vel:"Vela",
    Vir:"Virgo", Vol:"Volans", Vul:"Vulpecula"
  };

  if (s.proper && s.proper.trim() !== "") return s.proper;
  if (s.bayer && s.con) {
    let b = s.bayer.toLowerCase().trim();
      b = b.replace(/\s+/g, "").replace("-", "");
      const match = b.match(/^([a-z]+)(\d*)$/);
      if (match) {
        const root = match[1];   // e.g. "gam"
        const comp = match[2];   // e.g. "2"

        const greek = GREEK[root];
        if (greek) {
          const SUP = {
            "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵",
            "6":"⁶","7":"⁷","8":"⁸","9":"⁹",
            "10":"¹⁰","11":"¹¹","12":"¹²"
          };
          const sup = SUP[comp] || (comp || "");
          return `${greek}${sup} ${s.con}`;
        }
      }
    return `${s.bayer} ${s.con}`;
  }

  if (s.flam && s.con) return `${s.flam} ${s.con}`;
  if (s.hd) return `HD ${s.hd}`;
  if (s.hip) return `HIP ${s.hip}`;
  if (s.hr) return `HR ${s.hr}`;
  if (s.gl) return `Gl ${s.gl}`;
  if (s.tyc) return `TYC ${s.tyc}`;
  if (s.gaia) return `Gaia ${s.gaia}`;
  if (s.hyg) return `HYG ${s.hyg}`;
  if (s.id) return `Star ${s.id}`;

  return "Unnamed star";
}

function sky3dShowLoading(text = "Loading…") {
  const el = document.getElementById("sky3d-loading");
  const label = document.getElementById("sky3d-loading-text");
  if (label) label.textContent = text;
  if (el) el.style.display = "flex";
}

function sky3dUpdateLoading(text) {
  const label = document.getElementById("sky3d-loading-text");
  if (label) label.textContent = text;
}

function sky3dHideLoading() {
  const el = document.getElementById("sky3d-loading");
  if (el) el.style.display = "none";
}

function formatBayer(rawBayer, con) {
  if (!rawBayer || !con) return null;
  let b = rawBayer.toLowerCase().replace(/\s+/g, "");

  const match = b.match(/^([a-z]+)(\d*)$/);
  if (!match) return null;

  const greekKey = match[1];
  const comp     = match[2];

  const GREEK = {
    alp:"α", bet:"β", gam:"γ", del:"δ", eps:"ε", zet:"ζ", eta:"η",
    the:"θ", iot:"ι", kap:"κ", lam:"λ", mu:"μ",  nu:"ν",  xi:"ξ",
    omi:"ο", pi:"π",  rho:"ρ", sig:"σ", tau:"τ", ups:"υ", phi:"φ",
    chi:"χ", psi:"ψ", ome:"ω"
  };

  const greek = GREEK[greekKey];
  if (!greek) return null;

  const SUP = {
      "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵",
      "6":"⁶","7":"⁷","8":"⁸","9":"⁹",
      "10":"¹⁰","11":"¹¹","12":"¹²"
  };
  const sup = comp ? (SUP[comp] || comp) : "";

  return `${greek}${sup} ${con}`;
}

function isStarAboveHorizon(star) {
  const civil = getCivilFieldsFromUI();
  const { latDeg, lonDeg } = getLocationFromUI();
  const lst = getLSTRadians(civil, lonDeg);
  const jd = toJulianDate(civil);
  const years = (jd - 2451545.0) / 365.25;
  const rbp = precessionMatrixIAU2006(jd);
  const pm = applyProperMotionFromXYZ(star, years);
  const prec = applyPrecession(pm.raDeg, pm.decDeg, rbp);
  const raRad  = prec.raDeg * Math.PI / 180;
  const decRad = prec.decDeg * Math.PI / 180;
  const latRad = latDeg * Math.PI / 180;
  const H = lst - raRad;
  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                 Math.cos(latRad) * Math.cos(decRad) * Math.cos(H);
  return sinAlt > 0;
}

function nearestStarConstellation(raDeg, decDeg, stars) {
    let best = null;
    let bestDist = Infinity;

    const raRad = raDeg * Math.PI/180;
    const decRad = decDeg * Math.PI/180;

    for (const s of stars) {
        const sRa = s.raDeg * Math.PI/180;
        const sDec = s.decDeg * Math.PI/180;

        const cosD = Math.sin(decRad)*Math.sin(sDec) +
                     Math.cos(decRad)*Math.cos(sDec)*Math.cos(raRad - sRa);

        const angDist = Math.acos(Math.max(-1, Math.min(1, cosD)));

        if (angDist < bestDist) {
            bestDist = angDist;
            best = s;
        }
    }

    return best ? best.con : "Unknown";
}

async function horizonsStateVector(name, JD) {
    const jdString = JD.toFixed(6);
    const url =
        "https://ssd.jpl.nasa.gov/api/horizons.api?" +
        `format=json&COMMAND='${name}'&OBJ_DATA='NO'&MAKE_EPHEM='YES'` +
        "&EPHEM_TYPE='VECTORS'&CENTER='500@10'" +
        `&TLIST='${jdString}'`;

    const data = await fetch(url).then(r => r.json());
    const vec = data.result[0].vector;

    return {
        x: vec.x,   // AU
        y: vec.y,
        z: vec.z
    };
}

function toObserverRADEC(x, y, z, JD, latDeg, lonDeg) {
    const earth = VSOP87_Earth(JD);
    const obs = observerPosition(earth, JD, latDeg, lonDeg);
    const dx = x - obs.x;
    const dy = y - obs.y;
    const dz = z - obs.z;
    const {ra, dec} = eclipticToEquatorial(dx, dy, dz);

    return {ra, dec};
}

function observerPosition(earth, JD, latDeg, lonDeg) {
    const R_EARTH_AU = 6378.137 / 149597870.7;
    const lat = latDeg * Math.PI/180;
    const lon = lonDeg * Math.PI/180;

    // GMST
    const T = (JD - 2451545.0) / 36525;
    let GMST = 280.46061837 +
               360.98564736629*(JD - 2451545.0) +
               0.000387933*T*T -
               T*T*T/38710000;
    GMST = ((GMST % 360) + 360) % 360;
    const theta = GMST * Math.PI/180 + lon;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    const cosTh  = Math.cos(theta), sinTh = Math.sin(theta);

    const x_site = R_EARTH_AU * cosLat * cosTh;
    const y_site = R_EARTH_AU * cosLat * sinTh;
    const z_site = R_EARTH_AU * sinLat;

    return {
        x: earth.x + x_site,
        y: earth.y + y_site,
        z: earth.z + z_site
    };
}

function eclipticToEquatorial(x, y, z) {
    const eps = 23.439291 * Math.PI/180; // J2000 obliquity
    const cosE = Math.cos(eps), sinE = Math.sin(eps);
    const xe = x;
    const ye = y*cosE - z*sinE;
    const ze = y*sinE + z*cosE;
    const rxy = Math.sqrt(xe*xe + ye*ye);
    let ra  = Math.atan2(ye, xe);
    let dec = Math.atan2(ze, rxy);
    if (ra < 0) ra += 2*Math.PI;

    return {
        ra:  ra * 180/Math.PI,
        dec: dec * 180/Math.PI
    };
}

function VSOP87_Planet(name, JD) {
    switch(name) {
        case "Mercury": return VSOP87_Mercury(JD);
        case "Venus":   return VSOP87_Venus(JD);
        case "Earth":   return VSOP87_Earth(JD);
        case "Mars":    return VSOP87_Mars(JD);
        case "Jupiter": return VSOP87_Jupiter(JD);
        case "Saturn":  return VSOP87_Saturn(JD);
        case "Uranus":  return VSOP87_Uranus(JD);
        case "Neptune": return VSOP87_Neptune(JD);
        default:
            throw new Error("Unknown planet for VSOP87: " + name);
    }
}

function sphericalToCartesian(L, B, R) {
    const cosB = Math.cos(B), sinB = Math.sin(B);
    const cosL = Math.cos(L), sinL = Math.sin(L);

    return {
        x: R * cosB * cosL,
        y: R * cosB * sinL,
        z: R * sinB
    };
}

function vsopSeries(terms, t) {
    let sum = 0;
    for (const [A, B, C] of terms) {
        sum += A * Math.cos(B + C * t);
    }
    return sum;
}

async function computeLightTime(body, JD) {
    const C_AU_PER_DAY = 173.144632674240;
    const earth = VSOP87_Generic("Earth", JD);
    let planet = VSOP87_Generic(body, JD);

    let dx = planet.x - earth.x;
    let dy = planet.y - earth.y;
    let dz = planet.z - earth.z;
    let R = Math.sqrt(dx*dx + dy*dy + dz*dz);

    let lightTime = R / C_AU_PER_DAY;
    const JD_ret = JD - lightTime;
    planet = VSOP87_Generic(body, JD_ret);

    return { 
        x: planet.x, 
        y: planet.y, 
        z: planet.z, 
        lightTime 
    };
}

function VSOP87_Mercury(JD) { return VSOP87_Generic("Mercury", JD); }
function VSOP87_Venus(JD)   { return VSOP87_Generic("Venus", JD); }
function VSOP87_Earth(JD)   { return VSOP87_Generic("Earth", JD); }
function VSOP87_Mars(JD)    { return VSOP87_Generic("Mars", JD); }
function VSOP87_Jupiter(JD) { return VSOP87_Generic("Jupiter", JD); }
function VSOP87_Saturn(JD)  { return VSOP87_Generic("Saturn", JD); }
function VSOP87_Uranus(JD)  { return VSOP87_Generic("Uranus", JD); }
function VSOP87_Neptune(JD) { return VSOP87_Generic("Neptune", JD); }
function VSOP87_Generic(planet, JD) {
    const T = VSOP[planet];
    const t = (JD - 2451545.0) / 365250.0;

    const X = (
        vsopSeries(T.X0, t) +
        vsopSeries(T.X1, t) * t +
        vsopSeries(T.X2, t) * t*t +
        vsopSeries(T.X3, t) * t*t*t +
        vsopSeries(T.X4, t) * t*t*t*t +
        vsopSeries(T.X5, t) * t*t*t*t*t
    );

    const Y = (
        vsopSeries(T.Y0, t) +
        vsopSeries(T.Y1, t) * t +
        vsopSeries(T.Y2, t) * t*t +
        vsopSeries(T.Y3, t) * t*t*t +
        vsopSeries(T.Y4, t) * t*t*t*t +
        vsopSeries(T.Y5, t) * t*t*t*t*t
    );

    const Z = (
        vsopSeries(T.Z0, t) +
        vsopSeries(T.Z1, t) * t +
        vsopSeries(T.Z2, t) * t*t +
        vsopSeries(T.Z3, t) * t*t*t +
        vsopSeries(T.Z4, t) * t*t*t*t +
        vsopSeries(T.Z5, t) * t*t*t*t*t
    );

    // Velocity
    const VX = (
        vsopSeries(T.X1, t) +
        2 * vsopSeries(T.X2, t) * t +
        3 * vsopSeries(T.X3, t) * t*t +
        4 * vsopSeries(T.X4, t) * t*t*t +
        5 * vsopSeries(T.X5, t) * t*t*t*t
    );

    const VY = (
        vsopSeries(T.Y1, t) +
        2 * vsopSeries(T.Y2, t) * t +
        3 * vsopSeries(T.Y3, t) * t*t +
        4 * vsopSeries(T.Y4, t) * t*t*t +
        5 * vsopSeries(T.Y5, t) * t*t*t*t
    );

    const VZ = (
        vsopSeries(T.Z1, t) +
        2 * vsopSeries(T.Z2, t) * t +
        3 * vsopSeries(T.Z3, t) * t*t +
        4 * vsopSeries(T.Z4, t) * t*t*t +
        5 * vsopSeries(T.Z5, t) * t*t*t*t
    );

    return { x: X, y: Y, z: Z, vx: VX, vy: VY, vz: VZ };
}

function phaseAngle(sunToPlanet, earthToPlanet) {
    const sx = sunToPlanet.x;
    const sy = sunToPlanet.y;
    const sz = sunToPlanet.z;

    const ex = earthToPlanet.x;
    const ey = earthToPlanet.y;
    const ez = earthToPlanet.z;

    const rs = Math.hypot(sx, sy, sz);
    const re = Math.hypot(ex, ey, ez);

    const ux = sx / rs;
    const uy = sy / rs;
    const uz = sz / rs;

    const vx = ex / re;
    const vy = ey / re;
    const vz = ez / re;

    let cosA = ux*vx + uy*vy + uz*vz;
    cosA = Math.max(-1, Math.min(1, cosA));

    return Math.acos(cosA) * 180/Math.PI;
}

function saturnRingAngles(saturn, earth) {
    // Saturn pole orientation (IAU 2009)
    const alphaP = 40.589 * Math.PI/180;
    const deltaP = 83.537 * Math.PI/180;

    const nx = Math.cos(deltaP) * Math.cos(alphaP);
    const ny = Math.cos(deltaP) * Math.sin(alphaP);
    const nz = Math.sin(deltaP);
    const sx = saturn.x;
    const sy = saturn.y;
    const sz = saturn.z;
    const ex = saturn.x - earth.x;
    const ey = saturn.y - earth.y;
    const ez = saturn.z - earth.z;
    const rs = Math.hypot(sx, sy, sz);
    const re = Math.hypot(ex, ey, ez);

    const cosB  = (sx*nx + sy*ny + sz*nz) / rs;
    const cosBp = (ex*nx + ey*ny + ez*nz) / re;

    return {
        B:  Math.asin(cosB)  * 180/Math.PI,
        Bp: Math.asin(cosBp) * 180/Math.PI
    };
}

function computePlanetMagnitude(name, r, delta, phaseDeg, B = null, Bp = null) {
    const a = phaseDeg;
    const logTerm = 5 * Math.log10(r * delta);

    switch (name) {

        case "Mercury":
            return logTerm
                 - 0.613
                 + 0.06328*a
                 - 0.0016336*a*a
                 + 0.000033644*a*a*a;

        case "Venus":
            return logTerm
                 - 4.384
                 + 0.0009*a
                 + 0.000239*a*a
                 - 0.00000065*a*a*a;

        case "Mars":
            return logTerm
                 - 1.601
                 + 0.02267*a
                 - 0.0001302*a*a
                 + 0.000000435*a*a*a;

        case "Jupiter":
            return logTerm
                 - 9.395
                 + 0.0005*a;

        case "Saturn":
            return logTerm
                 - 8.914
                 + 0.044 * a
                 - 2.60 * Math.sin(Math.abs(B) * Math.PI/180)
                 + 1.25 * Math.pow(Math.sin(Bp * Math.PI/180), 2);

        case "Uranus":
            return logTerm
                 - 7.110
                 + 0.001*a;
        case "Neptune":
            return logTerm
                 - 6.87
                 + 0.0012 * a;

        case "Pluto":
            return logTerm
                 - 1.01
                 + 0.041*a;

        default:
            return null;
    }
}

function computePlanetElongation(name, JD) {
    const planet = VSOP87_Planet(name, JD);   // heliocentric XYZ
    const earth  = VSOP87_Earth(JD);          // heliocentric XYZ

    const vecSub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
    const dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
    const mag = (v) => Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);

    const rPE = vecSub(planet, earth);
    const rSE = vecSub({x:0,y:0,z:0}, earth);

    const elongRad = Math.acos(
        dot(rPE, rSE) / (mag(rPE) * mag(rSE))
    );

    return elongRad * 180 / Math.PI;  // degrees
}

function computePlanetHeliocentricDistance(name, JD) {
    const planet = VSOP87_Planet(name, JD); // heliocentric XYZ in AU

    return Math.sqrt(
        planet.x * planet.x +
        planet.y * planet.y +
        planet.z * planet.z
    );
}

function computePlanetOrbitalVelocity(name, JD) {
    const p = VSOP87_Planet(name, JD);
    const v = Math.sqrt(
        p.vx*p.vx +
        p.vy*p.vy +
        p.vz*p.vz
    );

    const AU_KM = 149597870.7;
    const v_kms = v * AU_KM / 86400;

    return v_kms;
}

// ===========================
// computeBodyPosition 
// ===========================
async function computeBodyPosition(name, JD, latDeg, lonDeg) {
    const planets = [
        "Mercury","Venus","Earth","Mars",
        "Jupiter","Saturn","Uranus","Neptune"
    ];

  
    // 1. VSOP
    if (planets.includes(name)) {
        const { x, y, z } = await computeLightTime(name, JD);
        let { ra, dec } = toObserverRADEC(x, y, z, JD, latDeg, lonDeg);
        return { ra, dec };
    }


    // 2. Pluto
    if (name === "Pluto") {
        const {x, y, z} = VSOP87_Pluto(JD);
        return toObserverRADEC(x, y, z, JD, latDeg, lonDeg);
    }

    // 3. Horizons API
    const {x, y, z} = await horizonsStateVector(name, JD);
    return toObserverRADEC(x, y, z, JD, latDeg, lonDeg);
}

// ===========================
// computeBodyMagnitude 
// ===========================
async function computeBodyMagnitude(name, JD) {
    const planet = VSOP87_Planet(name, JD);
    const earth  = VSOP87_Earth(JD);
    const r = Math.hypot(planet.x, planet.y, planet.z);

    const dx = planet.x - earth.x;
    const dy = planet.y - earth.y;
    const dz = planet.z - earth.z;
    const delta = Math.hypot(dx, dy, dz);

    const phaseDeg = phaseAngle(
        {x: planet.x, y: planet.y, z: planet.z},
        {x: dx,       y: dy,       z: dz}
    );

    let B = null, Bp = null;

    if (name === "Saturn") {
        ({ B, Bp } = saturnRingAngles(planet, earth));
    }

    const mag = computePlanetMagnitude(name, r, delta, phaseDeg, B, Bp);
    return { mag, dist: delta, phaseDeg};
}

// ===========================
// computeBody
// ===========================
async function computeBody(name, JD, latDeg, lonDeg) {
    const { ra, dec } = await computeBodyPosition(name, JD, latDeg, lonDeg);
    const { mag, dist, phaseDeg } = await computeBodyMagnitude(name, JD);

    return { ra, dec, mag, dist, phaseDeg };
}


/* ============================================================
   Build Celestial Sphere
   ============================================================ */
async function buildCelestialSphere(dateCivil, latDeg, lonDeg, maxPoints = 150000) {
  const lst = getLSTRadians(dateCivil, lonDeg);
  const jd = toJulianDate(dateCivil);
  const years = (jd - 2451545.0) / 365.25;
  const latRad = latDeg * Math.PI / 180;

  // Dynamic magnitude limit
  let fov = sky3dCamera ? sky3dCamera.fov : 60;
  let dynamicMagLimit = 6 + 1.8 * Math.log2(60 / fov);
  dynamicMagLimit = Math.max(2, Math.min(15, dynamicMagLimit));
  const rbp = precessionMatrixIAU2006(jd);

  const chosen = [];

  for (let i = 0; i < sky3dStarBase.length; i++) {
    const s = sky3dStarBase[i];
    const pm = applyProperMotionFromXYZ(s, years);
    const prec = applyPrecession(pm.raDeg, pm.decDeg, rbp);
    s.raDeg = prec.raDeg;
    s.decDeg = prec.decDeg;
    const raRad  = prec.raDeg * Math.PI / 180;
    const decRad = prec.decDeg * Math.PI / 180;

    // Hour angle
    const H = lst - raRad;

    // Altitude
    const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                   Math.cos(latRad) * Math.cos(decRad) * Math.cos(H);
    const alt = Math.asin(sinAlt);
    s._aboveHorizon = (alt > 0);
    if (alt <= 0) continue;
    if (s.mag > dynamicMagLimit) continue;
    const { age, lifetime, remnant } = estimateStarAgeAndLifetime(s);
    if (!remnant && years > (lifetime - age)) continue;

    // Azimuth
    const cosAz = (Math.sin(decRad) - Math.sin(alt) * Math.sin(latRad)) /
                  (Math.cos(alt) * Math.cos(latRad));
    const sinAz = -Math.cos(decRad) * Math.sin(H) / Math.cos(alt);
    const az = Math.atan2(sinAz, cosAz);

    // Convert alt/az → XYZ
    const x = -Math.cos(alt) * Math.sin(az);
    const y = Math.sin(alt);
    const z = Math.cos(alt) * Math.cos(az);

    chosen.push({ idx: i, x, y, z });
  }

  // Sort by magnitude
  chosen.sort((a, b) => sky3dStarBase[a.idx].mag - sky3dStarBase[b.idx].mag);
  if (chosen.length > maxPoints) chosen.length = maxPoints;

  const positions = new Float32Array(chosen.length * 3);
  const sizes = new Float32Array(chosen.length);
  const starIndices = new Uint32Array(chosen.length);
  const colors = new Float32Array(chosen.length * 3);

  let ptr = 0;
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i];
    const star = sky3dStarBase[c.idx];

    starIndices[i] = c.idx;

    // Position
    positions[ptr++] = c.x;
    positions[ptr++] = c.y;
    positions[ptr++] = c.z;

    // Size
    const mag = star.mag;
    sizes[i] = 0.001 + 0.0375 * Math.pow(1.5, -0.9 * mag);

    // Color
    const hex = colorForSpectralType(star.spect);
    colors[i*3]   = ((hex >> 16) & 255) / 255;
    colors[i*3+1] = ((hex >> 8)  & 255) / 255;
    colors[i*3+2] = ( hex        & 255) / 255;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("sizeAttr", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.userData.starIndices = starIndices;

  const material = new THREE.PointsMaterial({
    size: 1.5,
    sizeAttenuation: true,
    map: window.sky3dStarTexture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending
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

  // Bodies
  sky3dPlanetMeshes.length = 0;
  sky3dPlanetMap = {};
  const planetNames = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

  for (const name of planetNames) {
    const JD = toJulianDate(dateCivil);
    const body = await computeBody(name, JD, latDeg, lonDeg);

    // Convert RA/Dec → Alt/Az
    const raRad  = body.ra * Math.PI/180;
    const decRad = body.dec * Math.PI/180;

    const H = lst - raRad;

    const sinAlt = Math.sin(latRad)*Math.sin(decRad) +
                   Math.cos(latRad)*Math.cos(decRad)*Math.cos(H);
    const alt = Math.asin(sinAlt);
    if (alt <= 0) continue;

    const cosAz = (Math.sin(decRad) - Math.sin(alt)*Math.sin(latRad)) /
                  (Math.cos(alt)*Math.cos(latRad));
    const sinAz = -Math.cos(decRad)*Math.sin(H) / Math.cos(alt);
    const az = Math.atan2(sinAz, cosAz);

    const x = -Math.cos(alt) * Math.sin(az);
    const y = Math.sin(alt);
    const z = Math.cos(alt) * Math.cos(az);

    const size = 0.001 + 0.0375 * Math.pow(1.5, -0.9 * body.mag);

    const color = {
      Mercury: 0xffffff,
      Venus:   0xffeedd,
      Mars:    0xff5533,
      Jupiter: 0xffddaa,
      Saturn:  0xffeebb,
      Uranus:  0x33ffff,
      Neptune: 0x2033cc
    }[name];

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
geo.setAttribute("sizeAttr", new THREE.Float32BufferAttribute([size], 1));
geo.setAttribute("color", new THREE.Float32BufferAttribute([
  ((color >> 16) & 255) / 255,
  ((color >> 8)  & 255) / 255,
  ( color        & 255) / 255
], 3));

const mat = material.clone();
mat.onBeforeCompile = material.onBeforeCompile;

const planetPoint = new THREE.Points(geo, mat);
planetPoint.position.set(x, y, z);
planetPoint.userData = {
  type: "planet",
  name,
  mag: body.mag,
  dist: body.dist,
  phaseDeg: body.phaseDeg,
  ra: body.ra,
  dec: body.dec,
  alt: alt * 180/Math.PI,
  az: (az * 180/Math.PI + 360) % 360
};

sky3dPlanetMeshes.push(planetPoint);
sky3dPlanetMap[name.toLowerCase()] = planetPoint;
group.add(planetPoint);
}
  
  return group;
}


// ============================
// drawConstellationLines
// ============================
export function drawConstellationLines(linesJson, sky3dStarBase, sky3dRootGroup) {
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    opacity: 0.85,
    transparent: true
  });

  const group = new THREE.Group();
  group.name = "sky3dConstellationLines";

  const civil = getCivilFieldsFromUI();
  const { latDeg, lonDeg } = getLocationFromUI();
  const latRad = latDeg * Math.PI/180;
  const lstRad = getLSTRadians(civil, lonDeg);
  let fov = sky3dCamera ? sky3dCamera.fov : 60;
  let dynamicMagLimit = 6 + 1.8 * Math.log2(60 / fov);
  dynamicMagLimit = Math.max(2, Math.min(15, dynamicMagLimit));
  
  for (const [constName, segments] of Object.entries(linesJson)) {
    const positions = [];

    const visibleStars = segments
      .flatMap(([idA, idB]) => [idA, idB])
      .map(id => sky3dStarBase[sky3dStarIndexMap[id]])
      .filter(star => star && star.mag <= dynamicMagLimit);
    if (visibleStars.length < 2) continue;
    const x = segments.length;
    let frac = Math.pow(Math.log(x) / Math.log(25), 1.01) / 2;
    if (frac > 0.35) frac = 0.35;
    const uniqueStarIds = new Set(
      segments.flatMap(([idA, idB]) => [idA, idB])
    );
    const totalStars = uniqueStarIds.size;
    if (visibleStars.length < 2) continue;
    const visibleFraction = visibleStars.length / totalStars;
    if (visibleFraction < frac) continue;

    for (const [idA, idB] of segments) {
      const idxA = sky3dStarIndexMap[idA];
      const idxB = sky3dStarIndexMap[idB];
      const A = sky3dStarBase[idxA];
      const B = sky3dStarBase[idxB];
      if (!A || !B) continue;

      // --- A ---
      const raA  = A.raDeg  * Math.PI/180;
      const decA = A.decDeg * Math.PI/180;
      const haA = lstRad - raA;

      const sinAltA = Math.sin(decA)*Math.sin(latRad) +
                      Math.cos(decA)*Math.cos(latRad)*Math.cos(haA);
      const altA = Math.asin(sinAltA);

      const sinAzA = -Math.cos(decA) * Math.sin(haA) / Math.cos(altA);
      const cosAzA = (Math.sin(decA) - Math.sin(altA)*Math.sin(latRad)) /
                     (Math.cos(altA)*Math.cos(latRad));
      const azA = Math.atan2(sinAzA, cosAzA);

      const pA = {
        x: -Math.cos(altA) * Math.sin(azA),
        y:  Math.sin(altA),
        z:  Math.cos(altA) * Math.cos(azA)
      };

      // --- B ---
      const raB  = B.raDeg  * Math.PI/180;
      const decB = B.decDeg * Math.PI/180;
      const haB = lstRad - raB;

      const sinAltB = Math.sin(decB)*Math.sin(latRad) +
                      Math.cos(decB)*Math.cos(latRad)*Math.cos(haB);
      const altB = Math.asin(sinAltB);

      const sinAzB = -Math.cos(decB) * Math.sin(haB) / Math.cos(altB);
      const cosAzB = (Math.sin(decB) - Math.sin(altB)*Math.sin(latRad)) /
                     (Math.cos(altB)*Math.cos(latRad));
      const azB = Math.atan2(sinAzB, cosAzB);

      const pB = {
        x: -Math.cos(altB) * Math.sin(azB),
        y:  Math.sin(altB),
        z:  Math.cos(altB) * Math.cos(azB)
      };

      const yA = pA.y;
      const yB = pB.y;

      // Case 1: both above horizon
      if (yA > 0 && yB > 0) {
        positions.push(pA.x, pA.y, pA.z);
        positions.push(pB.x, pB.y, pB.z);
        continue;
      }

      // Case 2: both below horizon
      if (yA <= 0 && yB <= 0) {
        continue;
      }

      // Case 3: one above, one below
      const t = -yA / (yB - yA);

      const xI = pA.x + t * (pB.x - pA.x);
      const zI = pA.z + t * (pB.z - pA.z);

      if (yA > 0) {
        positions.push(pA.x, pA.y, pA.z);
        positions.push(xI, 0, zI);
      } else {
        positions.push(xI, 0, zI);
        positions.push(pB.x, pB.y, pB.z);
      }
    }

    if (positions.length === 0) continue;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lineSeg = new THREE.LineSegments(geom, material);
    lineSeg.name = `constellation-${constName}`;

    group.add(lineSeg);
  }

  sky3dRootGroup.add(group);
  return group;
}

/* ============================================================
   Proxima (Alpha)
   ============================================================ */
function proximaCore() {
    let raw = document.getElementById("sky3d-search").value.trim().toLowerCase();
    if (!raw) return;

    raw = raw.replace(/[^a-z0-9\s]/g, " ");
  
const phraseGenitiveToAbbrev = {
  "andromedae":"and","antliae":"ant","apus":"aps","aquarii":"aqr","aquilae":"aql",
  "arae":"ara","arietis":"ari","aurigae":"aur","boötis":"boo","caeli":"cae",
  "camelopardalis":"cam","capricorni":"cap","carinae":"car","cassiopeiae":"cas","centauri":"cen",
  "cephei":"cep","ceti":"cet","chamaeleontis":"cha","circini":"cir","canis majoris":"cma",
  "canis minoris":"cmi","comae berenices":"com","coronae australis":"cra","coronae borealis":"crb","piscis austrini":"psa",
  "ursae majoris":"uma","ursae minoris":"umi","trianguli australis":"tra","corvi":"crv","crateris":"crt",
  "crucis":"cru","cygni":"cyg","delphini":"del","doradus":"dor","draconis":"dra",
  "equulei":"equ","eridani":"eri","fornacis":"for","geminorum":"gem","gruis":"gru",
  "herculis":"her","horologii":"hor","hydrae":"hya","hydri":"hyi","indis":"ind",
  "lacertae":"lac","leonis":"leo","leporis":"lep","librae":"lib","lupi":"lup",
  "lyncis":"lyn","lyrae":"lyr","mensae":"men","microscopii":"mic","monocerotis":"mon",
  "muscae":"mus","normae":"nor","octantis":"oct","ophiuchi":"oph","orionis":"ori",
  "pavonis":"pav","pegasi":"peg","persei":"per","phoenicis":"phe","pictoris":"pic",
  "piscium":"psc","puppi":"pup","pyxidis":"pyx","reticuli":"ret","sculptoris":"scl",
  "scorpii":"sco","scuti":"sct","serpentis":"ser","sextantis":"sex","sagittae":"sge",
  "sagittarii":"sgr","tauri":"tau","telescopii":"tel","trianguli":"tri","tucanae":"tuc",
  "velorum":"vel","virginis":"vir","volantis":"vol","vulpeculae":"vul"
};

    for (const [phrase, abbr] of Object.entries(phraseGenitiveToAbbrev)) {
        raw = raw.replace(new RegExp("\\b" + phrase + "\\b", "g"), abbr);
    }
    let tokens = raw.split(/\s+/).filter(Boolean);
    const greek = new Set([
      "alpha","beta","gamma","delta","epsilon","zeta","eta","theta",
      "iota","kappa","lambda","mu","nu","xi","omicron","pi","rho",
      "sigma","tau","upsilon","phi","chi","psi","omega"
    ]);

    const con3 = new Set([
      "and","ant","aps","aqr","aql","ara","ari","aur","boo","cae","cam","cap",
      "car","cas","cen","cep","cet","cha","cir","cma","cmi","cnc","col","com",
      "cra","crb","crv","crt","cru","crx","cyg","del","dor","dra","equ","eri",
      "for","gem","gru","her","hor","hya","hyi","ind","lac","leo","lep","lib",
      "lup","lyn","lyr","men","mic","mon","mus","nor","oct","oph","ori","pav",
      "peg","per","phe","pic","psa","psc","pup","pyx","ret","scl","sco","sct",
      "ser","sex","sge","sgr","tau","tel","tri","tra","tuc","uma","umi","vel",
      "vir","vol","vul"
    ]);

    const conFull = new Set([
      "andromedae","antliae","apus","aquarii","aquilae","arae","arietis","aurigae",
      "boötis","caeli","camelopardalis","capricorni","carinae","cassiopeiae",
      "centauri","cephei","ceti","chamaeleontis","circini","canis majoris",
      "canis minoris","cancri","columbae","comae berenices","coronae australis",
      "coronae borealis","corvi","crateris","crucis","cygni","delphini","doradus",
      "draconis","equulei","eridani","fornacis","geminorum","gruis","herculis",
      "horologii","hydrae","hydri","indis","lacertae","leonis","leporis","librae",
      "lupi","lyncis","lyrae","mensae","microscopii","monocerotis","muscae",
      "normae","octantis","ophiuchi","orionis","pavonis","pegasi","persei",
      "phoenicis","pictoris","piscis austrini","piscium","puppi","pyxidis",
      "reticuli","sculptoris","scorpii","scuti","serpentis","sextantis",
      "sagittae","sagittarii","tauri","telescopii","trianguli",
      "trianguli australis","tucanae","ursae majoris","ursae minoris","velorum",
      "virginis","volantis","vulpeculae"
    ]);

    function shouldKeep(t, prev, next) {
        if (t !== "the" && t !== "and" && t !== "for") return true;
        if (t === "the" && (con3.has(next) || conFull.has(next))) return true;
        if (t === "and" && greek.has(prev)) return true;
        if (t === "for" && greek.has(prev)) return true;
        if ((t === "and" || t === "for") && con3.has(next)) return true;

        return false;
    }

    const filler = new Set([
      "select","show","me","center","star","please","find","look","at",
      "go","to","goto","object","bright","called"
    ]);

    tokens = tokens.filter(t => !filler.has(t));
    tokens = tokens.filter((t, i) => {
      const prev = tokens[i - 1] || "";
      const next = tokens[i + 1] || "";
      return shouldKeep(t, prev, next);
    });


    // --- FAST LEVENSHTEIN (single-row DP) ---
    function lev(a, b) {
        const m = a.length, n = b.length;
        if (Math.abs(m - n) > 3) return 99;

        let prev = new Array(n + 1);
        let curr = new Array(n + 1);

        for (let j = 0; j <= n; j++) prev[j] = j;

        for (let i = 1; i <= m; i++) {
            curr[0] = i;
            const ai = a.charCodeAt(i - 1);

            for (let j = 1; j <= n; j++) {
                const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
                curr[j] = Math.min(
                    prev[j] + 1,
                    curr[j - 1] + 1,
                    prev[j - 1] + cost
                );
            }

            [prev, curr] = [curr, prev];
        }

        return prev[n];
    }

    // --- SCORING ENGINE ---
    function scoreStar(star) {
        let score = 0;

        // Build all searchable names for this star
        const names = [];

        if (star.proper) names.push(star.proper.toLowerCase());
        if (star.bayer)  names.push(star.bayer.toLowerCase());
        if (star.flam)   names.push(String(star.flam).toLowerCase());
        if (star.con)    names.push(star.con.toLowerCase());

        if (star.hip)    names.push("hip " + String(star.hip));
        if (star.hd)     names.push("hd "  + String(star.hd));
        if (star.hr)     names.push("hr "  + String(star.hr));
        if (star.gl)     names.push("gl "  + String(star.gl));
        if (star.gj)     names.push("gj "  + String(star.gj));
        if (star.tyc)    names.push("tyc " + String(star.tyc));
        if (star.gaia)   names.push("gaia " + String(star.gaia));
        if (star.hyg)    names.push("hyg " + String(star.hyg));
        if (star.id)     names.push(String(star.id));
    
        // --- BAYER → GREEK NORMALIZATION ---
        if (star.bayer && star.con) {
        const greekMap = {
            alp: "alpha", bet: "beta", gam: "gamma", del: "delta", eps: "epsilon",
            zet: "zeta", eta: "eta", the: "theta", iot: "iota", kap: "kappa",
            lam: "lambda", mu: "mu", nu: "nu", xi: "xi", omi: "omicron",
            pi: "pi", rho: "rho", sig: "sigma", tau: "tau", ups: "upsilon",
            phi: "phi", chi: "chi", psi: "psi", ome: "omega"
        };

        let b = star.bayer.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = b.match(/^([a-z]+)(\d*)$/);
        if (match) {
            const root = match[1];
            const greek = greekMap[root];
            if (greek) {
                // e.g. "alpha cru", "alpha crucis"
                names.push(greek);
                names.push(`${greek} ${star.con.toLowerCase()}`);
            }
        }
    }

        // Score each token against each name
        for (const t of tokens) {
            for (const name of names) {

                if (name === t) {
                    score += 200;
                    continue;
                }

                const d = lev(t, name);
                if (d === 1) score += 75;
                else if (d === 2) score += 35;
                else if (d === 3) score += 7;

                // Partial matches (Bayer Greek, constellation roots)
                if (name.includes(t)) score += 50;
            }
        }

        return score;
    }

    // --- FIND BEST STAR ---
    let bestStar = null;
    let bestScore = 0;

    for (const star of sky3dStarBase) {
        const s = scoreStar(star);
        if (s > bestScore) {
            bestScore = s;
            bestStar = star;
        }
    }

    // --- THRESHOLD ---
    if (bestStar && bestScore >= 60) {
        let bestName = bestStar.proper || bestStar.bayer || bestStar.con || bestStar.hip || bestStar.hd;
        searchSky3D(bestName.toLowerCase());
    }
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

  const starPoints = sky3dCelestialSphere.children[0];
  const starHits = sky3dRaycaster.intersectObject(starPoints);

  let bestStar = null;
  let bestStarHit = null;
  let bestStarMag = Infinity;
  const MAX_HIT_DISTANCE = 0.005;

  if (starHits.length > 0) {
    for (const hit of starHits) {
      if (hit.distanceToRay > MAX_HIT_DISTANCE) continue;

      const idx = hit.index;
      const starIdx = starPoints.geometry.userData.starIndices[idx];
      const star = sky3dStarBase[starIdx];

      if (star.mag < bestStarMag) {
        bestStarMag = star.mag;
        bestStar = star;
        bestStarHit = hit;
      }
    }
  }

  const planetHits = sky3dRaycaster.intersectObjects(sky3dPlanetMeshes || []);

  let bestPlanet = null;
  let bestPlanetHit = null;

  if (planetHits.length > 0) {
    bestPlanetHit = planetHits[0]; // planets are single meshes
    bestPlanet = bestPlanetHit.object.userData;
  }

  let picked = null;

  if (bestStar && bestPlanet) {
    // Choose whichever is visually brighter (lower mag)
    picked = (bestStar.mag < bestPlanet.mag) ? bestStar : bestPlanet;
  } else if (bestStar) {
    picked = bestStar;
  } else if (bestPlanet) {
    picked = bestPlanet;
  } else {
    return;
  }

  let html = "";

  if (picked.type === "planet") {
    html =
      `<b>${picked.name}</b><br>` +
      `Mag: ${picked.mag.toFixed(2)}<br>` +
      `Dist: ${(picked.dist).toFixed(2)} AU`;
  } else {
    const name = getStarNameFromRecord(picked);
    html =
      `<b>${name}</b><br>` +
      `Mag: ${picked.mag}<br>` +
      `Dist: ${(picked.dist * 3.26156).toFixed(2)} ly`;
  }

  sky3dTooltip.innerHTML = html;
  sky3dTooltip.style.left = (event.clientX + 12) + "px";
  sky3dTooltip.style.top = (event.clientY + 12) + "px";
  sky3dTooltip.style.display = "block";

  clearTimeout(sky3dTooltip.hideTimer);
  sky3dTooltip.hideTimer = setTimeout(() => {
    sky3dTooltip.style.display = "none";
  }, 5000);
}


function sky3dClearInfo() {
  document.getElementById("sky3d-selected-heading").style.display = "";
  document.getElementById("sky3d-object-name").textContent = "";
  document.getElementById("sky3d-object-type").textContent = "";
  document.getElementById("sky3d-object-ra-dec").textContent = "";
  document.getElementById("sky3d-object-alt-az").textContent = "";
  document.getElementById("sky3d-object-pm-speed").textContent = "";
  document.getElementById("sky3d-object-mag").textContent = "";
  document.getElementById("sky3d-object-absmag").textContent = "";
  document.getElementById("sky3d-object-distance").textContent = "";
  document.getElementById("sky3d-object-spectral").textContent = "";
  document.getElementById("sky3d-object-designations").textContent = "";
  document.getElementById("sky3d-object-luminosity").textContent = "";
  document.getElementById("sky3d-object-helio-dist").textContent = "";
  document.getElementById("sky3d-object-elongation").textContent = "";
  document.getElementById("sky3d-object-constellation").textContent = "";
  document.getElementById("sky3d-object-size").textContent = "";
  document.getElementById("sky3d-object-velocity").textContent = "";
  document.getElementById("sky3d-object-phase").textContent = "";
}

function searchSkyPlanet(planetPoint) {
  const body = planetPoint.userData;
  
// --- 1. Get planet position ---
const pos = new THREE.Vector3();
planetPoint.getWorldPosition(pos);

// --- 2. Direction ---
const dir = pos.clone().normalize();


  // --- 3. Center Planet ---
  const camForward = new THREE.Vector3(0, 0, -1);
  const q = new THREE.Quaternion().setFromUnitVectors(dir, camForward);
  sky3dRootGroup.quaternion.premultiply(q);

  // --- 4. Store ---
  window.sky3dSelectedWorldPos = dir.clone();

  // --- 5. Remove Roll ---
const camForwardWorld = new THREE.Vector3(0, 0, -1)
  .applyQuaternion(sky3dCamera.quaternion)
  .normalize();

// World up (fixed reference)
const worldUp = new THREE.Vector3(0, 1, 0);

// Sky up
const skyUpWorld = new THREE.Vector3(0, 1, 0)
  .applyQuaternion(sky3dRootGroup.quaternion)
  .normalize();

const projectedSkyUp = skyUpWorld.clone().sub(
  camForwardWorld.clone().multiplyScalar(skyUpWorld.dot(camForwardWorld))
).normalize();

const projectedWorldUp = worldUp.clone().sub(
  camForwardWorld.clone().multiplyScalar(worldUp.dot(camForwardWorld))
).normalize();

let dot = projectedSkyUp.dot(projectedWorldUp);
dot = THREE.MathUtils.clamp(dot, -1, 1);

const angle = Math.acos(dot);

const cross = projectedSkyUp.clone().cross(projectedWorldUp);
const sign = cross.dot(camForwardWorld) < 0 ? -1 : 1;

// Apply roll correction
const rollQuat = new THREE.Quaternion()
  .setFromAxisAngle(camForwardWorld, angle * sign);

sky3dRootGroup.quaternion.premultiply(rollQuat);


  // --- 6. Update UI ---
  const civil = getCivilFieldsFromUI();
  const { latDeg, lonDeg } = getLocationFromUI();
  const lst = getLSTRadians(civil, lonDeg);
  const jd = toJulianDate(civil);
  const years = (jd - 2451545.0) / 365.25;
  const phaseDeg = body.phaseDeg;
  const phaseRad = phaseDeg * Math.PI / 180;
  const phase = (1 + Math.cos(phaseRad)) / 2;
  const PLANET_RADII_KM = {
    Mercury: 2439.7,
    Venus:   6051.8,
    Earth:   6378.1,
    Mars:    3389.5,
    Jupiter: 69911,
    Saturn:  58232,
    Uranus:  25362,
    Neptune: 24622
  };
  const R = PLANET_RADII_KM[body.name];
  const D = body.dist * 149597870.7;
  const theta = 2 * Math.atan(R / D);
  const arcsec = theta * 206265;
  const elongDeg = computePlanetElongation(body.name, jd);
  const constellation = nearestStarConstellation(body.ra, body.dec, sky3dStarBase);
  const helioDist = computePlanetHeliocentricDistance(body.name, jd);
  const velocity = computePlanetOrbitalVelocity(body.name, jd);

  sky3dClearInfo();
  document.getElementById("sky3d-object-name").textContent = body.name;
  document.getElementById("sky3d-object-type").textContent = "Planet";
  document.getElementById("sky3d-object-ra-dec").textContent =
  `RA: ${(body.ra/15).toFixed(2)}h, Dec: ${body.dec.toFixed(2)}°`;
  document.getElementById("sky3d-object-alt-az").textContent =
  `Alt: ${body.alt.toFixed(2)}°, Az: ${body.az.toFixed(2)}°`;
  document.getElementById("sky3d-object-elongation").textContent =
  `Elongation: ${elongDeg.toFixed(1)}°`;
  document.getElementById("sky3d-object-helio-dist").textContent =
  `Helio Dist: ${helioDist.toFixed(3)} AU`;
  document.getElementById("sky3d-object-mag").textContent = 
  `Mag: ${body.mag.toFixed(2)}`;
  document.getElementById("sky3d-object-phase").textContent =
  `Phase: ${(phase * 100).toFixed(1)}%`;
  document.getElementById("sky3d-object-size").textContent =
  `Angular Size: ${arcsec.toFixed(2)}″`;
  document.getElementById("sky3d-object-distance").textContent =
  `Dist: ${body.dist.toFixed(2)} AU`;
  document.getElementById("sky3d-object-velocity").textContent =
  `Velocity: ${velocity.toFixed(2)} km/s`;
  document.getElementById("sky3d-object-constellation").textContent =
  `Constellation: ${constellation}`;

  const lockBtn = document.getElementById("sky3d-lock");
  if (lockBtn) lockBtn.disabled = false;
}


function searchSky3D(query) {
  query = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")   // remove punctuation, greek chars, etc.
    .replace(/\s+/g, " ")
    .trim();

  if (!query) return;

  // --- 1. Planet search ---
  if (sky3dPlanetMap[query]) {
    return searchSkyPlanet(sky3dPlanetMap[query]);
  }

  // --- 2. Star search ---
  let best = null;
  for (let i = 0; i < sky3dStarBase.length; i++) {
    const s = sky3dStarBase[i];

    // --- Proper name ---
    if (s.proper && s.proper.toLowerCase().includes(query)) {
      best = { star: s, idx: i };
      break;
    }

    // --- HIP search ---
    if (query.startsWith("hip")) {
      const hip = query.replace("hip", "").trim();
      if (s.hip && String(s.hip) === hip) {
        best = { star: s, idx: i };
        break;
      }
    }

    // --- Bayer search ---
    if (s.bayer && s.con) {
      let b = s.bayer.toLowerCase().trim();
      b = b.replace(/\s+/g, "").replace("-", "");

      const bayerKey = `${b} ${s.con.toLowerCase()}`;

      if (bayerKey.includes(query)) {
        best = { star: s, idx: i };
        break;
      }
    }

    // --- Flamsteed search ---
    if (s.flam && s.con) {
      const flamKey = `${s.flam} ${s.con.toLowerCase()}`;
      if (flamKey.includes(query)) {
        best = { star: s, idx: i };
        break;
      }
    }

    // --- Constellation-only search ---
    if (s.con && s.con.toLowerCase() === query) {
      best = { star: s, idx: i };
      break;
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

  // Find star
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

// --- 3. Position ---
const posAttr = geom.attributes.position;

// Get XYZ in local space
const pos = new THREE.Vector3(
  posAttr.getX(geoIndex),
  posAttr.getY(geoIndex),
  posAttr.getZ(geoIndex)
);

// Convert to world space
points.localToWorld(pos);

// --- 4. Direction ---
const dir = pos.clone().normalize();
const camForward = new THREE.Vector3( 0, 0, -1);
if (dir.dot(camForward) < -0.9999) {
    dir.x += 0.001;
    dir.normalize();
}
  
// --- 5. Center Star ---
const q = new THREE.Quaternion().setFromUnitVectors(dir, camForward);
sky3dRootGroup.quaternion.premultiply(q);

// --- 6. Compute camera forward in world space ---
let camForwardWorld = new THREE.Vector3(0, 0, -1)
  .applyQuaternion(sky3dCamera.quaternion)
  .normalize();

const worldUp = new THREE.Vector3(0, 1, 0);

// --- 7. Detect zenith crossing (camera flipped) ---
if (camForwardWorld.dot(worldUp) < 0) {

  // Rotate sky 180° around world-up
  const flipQuat = new THREE.Quaternion()
    .setFromAxisAngle(worldUp, Math.PI);

  sky3dRootGroup.quaternion.premultiply(flipQuat);

  // Recompute forward after flip
  camForwardWorld = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(sky3dCamera.quaternion)
    .normalize();
}

// --- 8. Remove Roll ---
const skyUpWorld = new THREE.Vector3(0, 1, 0)
  .applyQuaternion(sky3dRootGroup.quaternion)
  .normalize();

const projectedSkyUp = skyUpWorld.clone().sub(
  camForwardWorld.clone().multiplyScalar(skyUpWorld.dot(camForwardWorld))
).normalize();

const projectedWorldUp = worldUp.clone().sub(
  camForwardWorld.clone().multiplyScalar(worldUp.dot(camForwardWorld))
).normalize();

let dot = projectedSkyUp.dot(projectedWorldUp);
dot = THREE.MathUtils.clamp(dot, -1, 1);

const angle = Math.acos(dot);

const cross = projectedSkyUp.clone().cross(projectedWorldUp);
const sign = cross.dot(camForwardWorld) < 0 ? -1 : 1;

const rollQuat = new THREE.Quaternion()
  .setFromAxisAngle(camForwardWorld, angle * sign);

sky3dRootGroup.quaternion.premultiply(rollQuat);


  // 7. Update info panel
  const civil = getCivilFieldsFromUI();
  const { latDeg, lonDeg } = getLocationFromUI();
  const lst = getLSTRadians(civil, lonDeg);
  const jd = toJulianDate(civil);
  const years = (jd - 2451545.0) / 365.25;
  const rbp = precessionMatrixIAU2006(jd);
  const pm = applyProperMotionFromXYZ(star, years);
  const pmRaMas  = star.pmRa;   // mas/yr
  const pmDecMas = star.pmDec;  // mas/yr
  const pmTotalMas = Math.sqrt(pmRaMas * pmRaMas + pmDecMas * pmDecMas);
  const pmTotal = pmTotalMas / 1000;
  const prec = applyPrecession(pm.raDeg, pm.decDeg, rbp);
  const desigs = [];
    if (star.proper) desigs.push(star.proper);
    if (star.bayer) {
    const bayerFormatted = formatBayer(star.bayer, star.con);
    if (bayerFormatted) desigs.push(bayerFormatted);
    }
    if (star.flam) {
    const flamFormatted = `${star.flam} ${star.con}`;
    desigs.push(flamFormatted);
    }
    if (star.hd)  desigs.push(`HD ${star.hd}`);
    if (star.hip) desigs.push(`HIP ${star.hip}`);
    if (star.hr)  desigs.push(`HR ${star.hr}`);
    if (star.gl)  desigs.push(`GL ${star.gl}`);
    if (star.tyc) desigs.push(`TYC ${star.tyc}`);
    if (star.gaia) desigs.push(`Gaia ${star.gaia}`);
  const absMag = star.absmag;
  const lum = Math.pow(10, (4.83 - absMag) / 2.5);  // L/L☉
  const raRad  = prec.raDeg * Math.PI / 180;
  const decRad = prec.decDeg * Math.PI / 180;
  const latRad = latDeg * Math.PI / 180;
  const H = lst - raRad;

  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                 Math.cos(latRad) * Math.cos(decRad) * Math.cos(H);
  const alt = Math.asin(sinAlt);

  const sinAz = -Math.cos(decRad) * Math.sin(H) / Math.cos(alt);
  const cosAz = (Math.sin(decRad) - Math.sin(alt) * Math.sin(latRad)) /
                (Math.cos(alt) * Math.cos(latRad));
  const az = Math.atan2(sinAz, cosAz);

  sky3dClearInfo();
  document.getElementById("sky3d-object-name").textContent =
    getStarNameFromRecord(star);
  document.getElementById("sky3d-object-type").textContent = "Star";
  const raHoursDisplay = pm.raDeg / 15;
  document.getElementById("sky3d-object-ra-dec").textContent =
    `RA: ${raHoursDisplay.toFixed(2)}h, Dec: ${pm.decDeg.toFixed(2)}°`;
  document.getElementById("sky3d-object-alt-az").textContent =
    `Alt: ${(alt * 180/Math.PI).toFixed(2)}°, Az: ${(az * 180/Math.PI).toFixed(2)}°`;
  document.getElementById("sky3d-object-pm-speed").textContent =
    `PM: ${pmTotal.toFixed(3)}″/yr`;
  document.getElementById("sky3d-object-mag").textContent = `Mag: ${star.mag}`;
  document.getElementById("sky3d-object-absmag").textContent =
  `Abs Mag: ${star.absmag.toFixed(2)}`;
  document.getElementById("sky3d-object-luminosity").textContent =
  `Luminosity: ${lum.toFixed(2)} L☉`;
  document.getElementById("sky3d-object-distance").textContent =
    `Dist: ${(star.dist * 3.26156).toFixed(2)} ly`;
  document.getElementById("sky3d-object-spectral").textContent =
    `Spectral: ${star.spect}`;
  document.getElementById("sky3d-object-designations").textContent =
    `Designations: ${desigs.join(", ")}`;

  const lockBtn = document.getElementById("sky3d-lock");
  if (lockBtn) lockBtn.disabled = false;
}

/* ============================================================
   Rebuild Sphere
   ============================================================ */
async function rebuildCelestialSphere(linesJson, sky3dStarBase, sky3dRootGroup) {
  if (!sky3dScene || sky3dStarBase.length === 0) return;

  if (sky3dCelestialSphere) {
    sky3dCelestialSphere.traverse(obj => {
      if (obj.isPoints) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });

    sky3dRootGroup.remove(sky3dCelestialSphere);
  }

  const dateCivil = getCivilFieldsFromUI();
  const { latDeg, lonDeg } = getLocationFromUI();

  sky3dCelestialSphere = await buildCelestialSphere(dateCivil, latDeg, lonDeg);
  sky3dRootGroup.add(sky3dCelestialSphere);

  const oldLines = sky3dRootGroup.getObjectByName("sky3dConstellationLines");
  if (oldLines) {
    oldLines.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    sky3dRootGroup.remove(oldLines);
  }
  
  const showConstellations =
    document.getElementById("sky3d-constellations").checked;
  if (showConstellations) {
      drawConstellationLines(linesJson, sky3dStarBase, sky3dRootGroup);
  }
}

/* ============================================================
   Init Scene
   ============================================================ */
async function startSky3D() {
  const canvas = document.getElementById("sky3d-canvas");
  sky3dUpdateLoading("Loading Planetary Data…");
  await loadAllCoefficients();
  sky3dUpdateLoading("Loading Constellations…");
  const linesJson = await fetch("lines.json").then(r => r.json());
  window.linesJson = linesJson;
  
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
  window.sky3dRaycaster.params.Points.threshold =
    0.015 * (sky3dCamera.fov / 60);
  sky3dCamera.position.set(0, 0, 0);
  sky3dCamera.lookAt(0, 0, -1);

  sky3dControls = new minimalCameraControls(sky3dCamera, canvas);
  installSky3DLockSystem();
  canvas.addEventListener("click", onSky3DClick);
  
  sky3dUpdateLoading("Loading Star Data…");
  sky3dStarBase = await window.sky3dStarBasePromise;

  window.sky3dStarIndexMap = {};
  for (let i = 0; i < sky3dStarBase.length; i++) {
    const id = sky3dStarBase[i].id;
    if (id) window.sky3dStarIndexMap[id] = i;
  }

  sky3dUpdateLoading("Building Sky…");
  await rebuildCelestialSphere(linesJson, sky3dStarBase, sky3dRootGroup);
  animateSky3D();
  sky3dHideLoading();
}

/* ============================================================
   Lock Button
   ============================================================ */
function installSky3DLockSystem() {
  const controls = window.sky3dControls;
  const btn = document.getElementById("sky3d-lock");

  if (!controls || !btn) return;

  btn.disabled = false;

  if (!controls._originalHandlers) {
    controls._originalHandlers = {
      onMouseDown:  controls.onMouseDown,
      onMouseMove:  controls.onMouseMove,
      onMouseUp:    controls.onMouseUp,
      onWheel:      controls.onWheel,
      onTouchStart: controls.onTouchStart,
      onTouchMove:  controls.onTouchMove,
      onTouchEnd:   controls.onTouchEnd
    };
  }

  function lockSky3D() {
    controls.onMouseDown  = function(){};
    controls.onMouseMove  = function(){};
    controls.onMouseUp    = function(){};
    controls.onWheel      = function(){};
    controls.onTouchStart = function(){};
    controls.onTouchMove  = function(){};
    controls.onTouchEnd   = function(){};
    window.sky3dLocked = true;
  }

  function unlockSky3D() {
    const h = controls._originalHandlers;
    controls.onMouseDown  = h.onMouseDown;
    controls.onMouseMove  = h.onMouseMove;
    controls.onMouseUp    = h.onMouseUp;
    controls.onWheel      = h.onWheel;
    controls.onTouchStart = h.onTouchStart;
    controls.onTouchMove  = h.onTouchMove;
    controls.onTouchEnd   = h.onTouchEnd;
    window.sky3dLocked = false;
  }

  btn.onclick = () => {
    if (!window.sky3dLocked) {
      lockSky3D();
      btn.textContent = "Unlock View";
    } else {
      unlockSky3D();
      btn.textContent = "Lock View";
    }
  };

  btn.textContent = window.sky3dLocked ? "Unlock View" : "Lock View";
}


/* ============================================================
   Animation Loop
   ============================================================ */
function animateSky3D() {
  if (!sky3dModalOpen) return;
  requestAnimationFrame(animateSky3D);

  if (sky3dLocked && sky3dRootGroup.userData.lockQuat) {
    sky3dRootGroup.quaternion.copy(sky3dRootGroup.userData.lockQuat);
  }

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

  sky3dShowLoading("Initializing sky engine…");

  setTimeout(() => {
    if (!sky3dScene) {
      startSky3D();
    } else {
      sky3dUpdateLoading("Updating sky…");
      rebuildCelestialSphere(
        window.linesJson,
        window.sky3dStarBase,
        window.sky3dRootGroup
      );
      animateSky3D();
      sky3dHideLoading();
    }
  }, 50);
};

  closeBtn.onclick = () => {
    overlay.style.display = "none";
    sky3dModalOpen = false;
  };

if (applyDT) {
  applyDT.onclick = () => {
    const civil = getCivilFieldsFromUI();
    const { latDeg, lonDeg } = getLocationFromUI();
    const { year, month, day } = civil;

    const errors = validateInputs(latDeg, lonDeg, year, month, day);

    if (errors.length > 0) {
      alert("Please input a real value:\n\n" + errors.join("\n"));
      return;
    }
    
      rebuildCelestialSphere(
        window.linesJson,
        window.sky3dStarBase,
        window.sky3dRootGroup
      );
  };
}

if (applyLoc) {
  applyLoc.onclick = () => {
    const civil = getCivilFieldsFromUI();
    const { latDeg, lonDeg } = getLocationFromUI();
    const { year, month, day } = civil;

    const errors = validateInputs(latDeg, lonDeg, year, month, day);

    if (errors.length > 0) {
      alert("Please input a real value:\n\n" + errors.join("\n"));
      return;
    }

      rebuildCelestialSphere(
        window.linesJson,
        window.sky3dStarBase,
        window.sky3dRootGroup
      );
  };
}

// Search wiring
const searchBtn = document.getElementById("sky3d-search-btn");
if (searchBtn) searchBtn.onclick = proximaCore;

const searchInput = document.getElementById("sky3d-search");
if (searchInput) {
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") proximaCore();
  });
}

const planetToggle = document.getElementById("sky3d-planets");
if (planetToggle) {
  planetToggle.addEventListener("change", () => {
    const visible = planetToggle.checked;
    for (const mesh of sky3dPlanetMeshes) {
      mesh.visible = visible;
    }
  });
}

}


document.getElementById("sky3d-constellations").addEventListener("change", (e) => {
    if (!window.sky3dRootGroup) return;

    const group = window.sky3dRootGroup.getObjectByName("sky3dConstellationLines");
    if (group) group.visible = e.target.checked;
});


/* ============================================================
   Ensure modal wiring runs
   ============================================================ */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSky3DModal);
} else {
  initSky3DModal();
}

window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("sky3d-selected-heading").style.display = "none";
    document.getElementById("sky3d-object-name").textContent = "";
    document.getElementById("sky3d-object-type").textContent = "";
    document.getElementById("sky3d-object-ra-dec").textContent = "";
    document.getElementById("sky3d-object-alt-az").textContent = "";
    document.getElementById("sky3d-object-pm-speed").textContent = "";
    document.getElementById("sky3d-object-elongation").textContent = "";
    document.getElementById("sky3d-object-mag").textContent = "";
    document.getElementById("sky3d-object-absmag").textContent = "";
    document.getElementById("sky3d-object-luminosity").textContent = "";
    document.getElementById("sky3d-object-phase").textContent = "";
    document.getElementById("sky3d-object-size").textContent = "";
    document.getElementById("sky3d-object-distance").textContent = "";
    document.getElementById("sky3d-object-helio-dist").textContent = "";
    document.getElementById("sky3d-object-spectral").textContent = "";
    document.getElementById("sky3d-object-velocity").textContent = "";
    document.getElementById("sky3d-object-designations").textContent = "";
    document.getElementById("sky3d-object-constellation").textContent = "";
});

window.sky3dStarBasePromise = loadStarCSV(
  "https://astro-proxy.niamnbhakta.workers.dev/?url=" +
  encodeURIComponent("https://github.com/astronomystuff/Zenith-Sky/releases/download/At-HYG/stars.csv")
);


window.sky3dStarBase = sky3dStarBase;
window.sky3dCelestialSphere = sky3dCelestialSphere;
window.sky3dCamera = sky3dCamera;
window.sky3dScene = sky3dScene;
window.sky3dRootGroup = sky3dRootGroup;
window.applyProperMotionFromXYZ = applyProperMotionFromXYZ;
window.applyPrecession = applyPrecession;
window.getCivilFieldsFromUI = getCivilFieldsFromUI;
window.getLocationFromUI = getLocationFromUI;
window.getLSTRadians = getLSTRadians;
window.buildCelestialSphere = buildCelestialSphere;
window.xyzToRaDec = xyzToRaDec;
window.loadAllCoefficients = loadAllCoefficients;
window.loadVSOP87File = loadVSOP87File;
window.VSOP87_Mercury = VSOP87_Mercury;
window.VSOP87_Venus   = VSOP87_Venus;
window.VSOP87_Earth   = VSOP87_Earth;
window.VSOP87_Mars    = VSOP87_Mars;
window.VSOP87_Jupiter = VSOP87_Jupiter;
window.VSOP87_Saturn  = VSOP87_Saturn;
window.VSOP87_Uranus  = VSOP87_Uranus;
window.VSOP87_Neptune = VSOP87_Neptune;
window.VSOP87_Generic = VSOP87_Generic;
window.computeBodyPosition = computeBodyPosition;
window.VSOP = VSOP;
window.vsopSeries = vsopSeries;
window.saturnRingAngles = saturnRingAngles;
window.computePlanetMagnitude = computePlanetMagnitude;
window.computeBodyMagnitude = computeBodyMagnitude;
window.computeBody = computeBody;
window.drawConstellationLines = drawConstellationLines;
window.estimateStarAgeAndLifetime = estimateStarAgeAndLifetime;
window.formatBayer = formatBayer;
window.rebuildCelestialSphere = rebuildCelestialSphere;
window.colorForSpectralType = colorForSpectralType;
window.precessionMatrixIAU2006 = precessionMatrixIAU2006;
