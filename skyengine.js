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
let sky3dLocked = false;
window.sky3dRaycaster = new THREE.Raycaster();
window.sky3dMouse = new THREE.Vector2();
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
window.J2000_MS = J2000_MS;
window.sky3dStarTexture = makeStarTexture();
const LY_TO_PC = 1 / 3.26156;
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

async function loadAllVSOP() {
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
      rebuildCelestialSphere();
    }

    clearTimeout(this.finalRebuildTimer);
    this.finalRebuildTimer = setTimeout(() => {
      rebuildCelestialSphere();
    }, 120);
  }
}

/* ============================================================
   CSV Loader
   ============================================================ */
async function loadStarCSV(url) {
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

    const x0   = parseFloat(cols[idx.x]);
    const y0   = parseFloat(cols[idx.y]);
    const z0   = parseFloat(cols[idx.z]);
    const dist = parseFloat(cols[idx.dist]);
    const pmRa = parseFloat(cols[idx.pmRa]);
    const pmDec= parseFloat(cols[idx.pmDec]);
    const rv   = parseFloat(cols[idx.rv]);
    const mag  = parseFloat(cols[idx.mag]);
    const raDeg  = parseFloat(cols[idx.ra]);
    const decDeg = parseFloat(cols[idx.dec]);

    if (
      isNaN(x0) || isNaN(y0) || isNaN(z0) ||
      isNaN(dist) || isNaN(mag) ||
      isNaN(raDeg) || isNaN(decDeg)
    ) continue;

    stars.push({
      id:     cols[idx.id],
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
      x0, y0, z0,
      dist,
      raDeg0: raDeg,
      decDeg0:  decDeg,
      pmRa, pmDec, rv, mag,
      vx: parseFloat(cols[idx.vx]),
      vy: parseFloat(cols[idx.vy]),
      vz: parseFloat(cols[idx.vz]),
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
   Proper Motion + RV
   ============================================================ */
function masToRad(mas) {
  return mas * (Math.PI / (180 * 3600 * 1000));
}

function rvToParsecPerYear(rvKmPerSec) {
  return rvKmPerSec / 977792.221;
}

const KM_S_TO_PC_YR = 1 / 977792.221;

function applyProperMotionFromXYZ(star, years) {
  
  // Require valid base position
  const hasPosition =
    Number.isFinite(star.x0) &&
    Number.isFinite(star.y0) &&
    Number.isFinite(star.z0);

  if (!hasPosition) {
    return { raDeg: 0, decDeg: 0, distance: 1 };
  }

  // Base position (parsecs)
  let x = star.x0;
  let y = star.y0;
  let z = star.z0;

  // Propagate using Cartesian velocity
  if (
    Number.isFinite(star.vx) &&
    Number.isFinite(star.vy) &&
    Number.isFinite(star.vz)
  ) {

    x += star.vx * KM_S_TO_PC_YR * years;
    y += star.vy * KM_S_TO_PC_YR * years;
    z += star.vz * KM_S_TO_PC_YR * years;
  }

  return xyzToRaDec(x, y, z);
}

/* ============================================================
   Civil Time → LMT → LST
   ============================================================ */
function toJulianDate(date) {
  const year = date.getUTCFullYear();

  if (year < 1 || year > 275000) {
    const y = year;
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds();

    let Y = y;
    let M = m;

    if (M <= 2) {
      Y -= 1;
      M += 12;
    }

    const A = Math.floor(Y / 100);
    const B = 2 - A + Math.floor(A / 4);

    return Math.floor(365.25 * (Y + 4716))
         + Math.floor(30.6001 * (M + 1))
         + d + B - 1524.5
         + (hh + mm/60 + ss/3600) / 24;
  }

  return (date.getTime() + date.getTimezoneOffset() * 60000) / 86400000 + 2440587.5;
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

function getLSTRadians(date, lonEastDeg) {
  const jd = toJulianDate(date);
  const gmst = gmstFromJulian(jd);
  let lst = gmst + lonEastDeg * Math.PI / 180;
  lst = ((lst % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return lst;
}

function getLSTRadiansFromCivil(dateCivil, lonDegUI) {
  return {
    lst: getLSTRadians(dateCivil, lonDegUI),
    dateLMT: dateCivil
  };
}

/* ============================================================
   RA/Dec → Unit Sphere XYZ
   ============================================================ */
function raDecToXYZ(raDeg, decDeg) {
  const ra = raDeg * Math.PI / 180;
  const dec = decDeg * Math.PI / 180;

  return {
    x: Math.cos(dec) * Math.cos(ra),
    y: Math.sin(dec),
    z: Math.cos(dec) * Math.sin(ra)
  };
}

/* ============================================================
   Helpers
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
  ground.renderOrder = 999;

  return ground;
}

function centerOnWorldPos(pos) {
  const starDir = pos.clone().normalize();
  const camForward = new THREE.Vector3(0, 0, -1);

  const q = new THREE.Quaternion().setFromUnitVectors(starDir, camForward);

  sky3dRootGroup.quaternion.premultiply(q);
}

function getStarNameFromRecord(s) {

  // --- Greek Letter Lookup ---
  const GREEK = {
    alf: "α", bet: "β", gam: "γ", del: "δ", eps: "ε",
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
          const SUP = { "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵" };
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

    return { x: X, y: Y, z: Z };
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
    return { mag, dist: delta };
}

// ===========================
// computeBody
// ===========================
async function computeBody(name, JD, latDeg, lonDeg) {
    const { ra, dec } = await computeBodyPosition(name, JD, latDeg, lonDeg);
    const { mag, dist } = await computeBodyMagnitude(name, JD);

    return { ra, dec, mag, dist };
}


/* ============================================================
   Build Celestial Sphere
   ============================================================ */
async function buildCelestialSphere(dateCivil, latDeg, lonDeg, maxPoints = 150000) {
  const { lst, dateLMT } = getLSTRadiansFromCivil(dateCivil, lonDeg);
  const years = (dateLMT.getTime() - J2000_MS) / 31557600000;
  const latRad = latDeg * Math.PI / 180;

  // Dynamic magnitude limit
  let fov = sky3dCamera ? sky3dCamera.fov : 60;
  let dynamicMagLimit = 6 + 1.8 * Math.log2(60 / fov);
  dynamicMagLimit = Math.max(2, Math.min(15, dynamicMagLimit));

  const chosen = [];

  for (let i = 0; i < sky3dStarBase.length; i++) {
    const s = sky3dStarBase[i];
    const pm = applyProperMotionFromXYZ(s, years);
    s.raDeg = pm.raDeg;
    s.decDeg = pm.decDeg;

    const raRad = pm.raDeg * Math.PI / 180;
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
  const planetNames = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

  for (const name of planetNames) {
    const date = dateCivil;
    const utcMs = date.getTime();
    const JD = utcMs / 86400000 + 2440587.5;
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

    const x = Math.cos(alt) * Math.sin(az);
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

  if (starHits.length > 0) {
    for (const hit of starHits) {
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



function searchSkyPlanet(planetPoint) {
  const body = planetPoint.userData;

  // --- 1. Compute direction in horizon frame ---
  const altRad = body.alt * Math.PI/180;
  const azRad  = body.az  * Math.PI/180;

  let dir = new THREE.Vector3(
    Math.cos(altRad) * Math.sin(azRad),
    Math.sin(altRad),
    Math.cos(altRad) * Math.cos(azRad)
  ).normalize();

  // --- 2. Convert Horizon to Sky Direction ---
  dir.applyQuaternion(sky3dRootGroup.quaternion.clone().invert());

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

  const worldUp = new THREE.Vector3(0, 1, 0);
  const skyUpWorld = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(sky3dRootGroup.quaternion)
    .normalize();

  const projectedSkyUp = skyUpWorld.clone().sub(
    camForwardWorld.clone().multiplyScalar(skyUpWorld.dot(camForwardWorld))
  ).normalize();

  const projectedWorldUp = worldUp.clone().sub(
    camForwardWorld.clone().multiplyScalar(worldUp.dot(camForwardWorld))
  ).normalize();

  const rollAngle = Math.acos(
    THREE.MathUtils.clamp(projectedSkyUp.dot(projectedWorldUp), -1, 1)
  );

  const cross = projectedSkyUp.clone().cross(projectedWorldUp);
  const sign = cross.dot(camForwardWorld) < 0 ? -1 : 1;

  const rollQuat = new THREE.Quaternion()
    .setFromAxisAngle(camForwardWorld, rollAngle * sign);

  sky3dRootGroup.quaternion.premultiply(rollQuat);

  // --- 6. Update UI ---
  document.getElementById("sky3d-object-name").textContent = body.name;
  document.getElementById("sky3d-object-type").textContent = "Planet";
  document.getElementById("sky3d-object-ra-dec").textContent =
    `RA: ${(body.ra/15).toFixed(2)}h, Dec: ${body.dec.toFixed(2)}°`;
  document.getElementById("sky3d-object-alt-az").textContent =
    `Alt: ${body.alt.toFixed(2)}°, Az: ${body.az.toFixed(2)}°`;
  document.getElementById("sky3d-object-mag").textContent = `Mag: ${body.mag.toFixed(2)}`;
  document.getElementById("sky3d-object-distance").textContent = `Dist: ${body.dist.toFixed(2)} AU`;

  const lockBtn = document.getElementById("sky3d-lock");
  if (lockBtn) lockBtn.disabled = false;
}



function searchSky3D() {
  const query = document.getElementById("sky3d-search").value.trim().toLowerCase();
  if (!query) return;

  if (sky3dPlanetMap[query]) {
    return searchSkyPlanet(sky3dPlanetMap[query]);
  }
  
  // 1. Find matching star
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

  // 2. Find star
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

  // 3. Get local position and convert to world
  const pos = new THREE.Vector3(
    positions.getX(geoIndex),
    positions.getY(geoIndex),
    positions.getZ(geoIndex)
  );
  points.localToWorld(pos);

  // 4. Compute direction
  const starDir = pos.clone().normalize();
  const camForwardLocal = new THREE.Vector3(0, 0, -1);
  const q = new THREE.Quaternion().setFromUnitVectors(starDir, camForwardLocal);
  sky3dRootGroup.quaternion.premultiply(q);

  // --- REMOVE ROLL ---
  const camForwardWorld = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(sky3dCamera.quaternion)
    .normalize();

  const worldUp = new THREE.Vector3(0, 1, 0);

  const skyUpWorld = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(sky3dRootGroup.quaternion)
    .normalize();

  const projectedSkyUp = skyUpWorld.clone().sub(
    camForwardWorld.clone().multiplyScalar(skyUpWorld.dot(camForwardWorld))
  ).normalize();

  const projectedWorldUp = worldUp.clone().sub(
    camForwardWorld.clone().multiplyScalar(worldUp.dot(camForwardWorld))
  ).normalize();

  const rollAngle = Math.acos(
    THREE.MathUtils.clamp(projectedSkyUp.dot(projectedWorldUp), -1, 1)
  );

  const cross = projectedSkyUp.clone().cross(projectedWorldUp);
  const sign = cross.dot(camForwardWorld) < 0 ? -1 : 1;

  const rollQuat = new THREE.Quaternion()
    .setFromAxisAngle(camForwardWorld, rollAngle * sign);

  sky3dRootGroup.quaternion.premultiply(rollQuat);

  // 5. Store
  window.sky3dSelectedWorldPos = pos.clone();

  // 6. Update info panel
  const dateCivil = getDateFromUICivil();
  const { latDeg, lonDeg } = getLocationFromUI();
  const { lst, dateLMT } = getLSTRadiansFromCivil(dateCivil, lonDeg);
  const years = (dateLMT.getTime() - J2000_MS) / 31557600000;
  const pm = applyProperMotionFromXYZ(star, years);

  const raRad = pm.raDeg * Math.PI / 180;
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

  document.getElementById("sky3d-object-name").textContent =
    getStarNameFromRecord(star);
  document.getElementById("sky3d-object-type").textContent = "Star";
  const raHoursDisplay = pm.raDeg / 15;
  document.getElementById("sky3d-object-ra-dec").textContent =
    `RA: ${raHoursDisplay.toFixed(2)}h, Dec: ${pm.decDeg.toFixed(2)}°`;
  document.getElementById("sky3d-object-alt-az").textContent =
    `Alt: ${(alt * 180/Math.PI).toFixed(2)}°, Az: ${(az * 180/Math.PI).toFixed(2)}°`;
  document.getElementById("sky3d-object-mag").textContent = `Mag: ${star.mag}`;
  document.getElementById("sky3d-object-distance").textContent =
    `Dist: ${(star.dist * 3.26156).toFixed(2)} ly`;

  const lockBtn = document.getElementById("sky3d-lock");
  if (lockBtn) lockBtn.disabled = false;
}

/* ============================================================
   Rebuild Sphere
   ============================================================ */
async function rebuildCelestialSphere() {
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

  const dateCivil = getDateFromUICivil();
  const { latDeg, lonDeg } = getLocationFromUI();

  sky3dCelestialSphere = await buildCelestialSphere(dateCivil, latDeg, lonDeg);
  sky3dRootGroup.add(sky3dCelestialSphere);
}

/* ============================================================
   Init Scene
   ============================================================ */
async function startSky3D() {
  const canvas = document.getElementById("sky3d-canvas");
  sky3dUpdateLoading("Loading Planetary Data…");
  await loadAllVSOP();
  
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
  
  sky3dUpdateLoading("Loading Stars…");
  sky3dStarBase = await loadStarCSV(
    "https://astro-proxy.niamnbhakta.workers.dev/?url=" +
    encodeURIComponent("https://github.com/astronomystuff/Zenith-Sky/releases/download/At-HYG/stars.csv")
  );
  
  sky3dUpdateLoading("Building Sky…");
  await rebuildCelestialSphere();
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
      rebuildCelestialSphere();
      animateSky3D();
      sky3dHideLoading();
    }
  }, 50);
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

window.sky3dStarBase = sky3dStarBase;
window.sky3dCelestialSphere = sky3dCelestialSphere;
window.sky3dCamera = sky3dCamera;
window.sky3dScene = sky3dScene;
window.sky3dRootGroup = sky3dRootGroup;
window.applyProperMotionFromXYZ = applyProperMotionFromXYZ;
window.getDateFromUICivil = getDateFromUICivil;
window.getLocationFromUI = getLocationFromUI;
window.getLSTRadiansFromCivil = getLSTRadiansFromCivil;
window.J2000_MS = J2000_MS;
window.buildCelestialSphere = buildCelestialSphere;
window.xyzToRaDec = xyzToRaDec;
window.loadAllVSOP = loadAllVSOP;
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
window.raDecToXYZ= raDecToXYZ;
window.saturnRingAngles = saturnRingAngles;
window.computePlanetMagnitude = computePlanetMagnitude;
window.computeBodyMagnitude = computeBodyMagnitude;
window.computeBody = computeBody;
