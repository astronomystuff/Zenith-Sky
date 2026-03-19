document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (e) => {
    if (e.target.id === "planner-generate") {
      runPlanner();
    }

    if (e.target.id === "planner-modal-close") {
      const modalOverlay = document.getElementById("planner-modal-overlay");
      if (modalOverlay) modalOverlay.style.display = "none";
    }
  });

  console.log("planner.js loaded — delegation attached");
});


function deg2rad(d) { return d * Math.PI / 180; }
function rad2deg(r) { return r * 180 / Math.PI; }
function toJulianDate(date) { return date.getTime() / 86400000 + 2440587.5; }
function normalizeAngle(x) { const twoPi = 2 * Math.PI; x = x % twoPi; if (x < 0) x += twoPi; return x; }

function el(id) { return document.getElementById(id); }
function safeText(v) { return (v === undefined || v === null) ? "—" : v; }

// ------------------------------------------------------------
// LOAD OBJECTS
// ------------------------------------------------------------
async function loadObjects() {
  try {
    const res = await fetch("objects.json");
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.warn("Failed to load objects.json", e);
    return [];
  }
}

  // ------------------------------------------------------------
  // STAR CATALOG + CONSTELLATION LINES
  // ------------------------------------------------------------
  function decodeStarCatalog() {
    const STAR_CATALOG_300 = [
      { id: "Sirius", ra: 6 + 45/60, dec: -16.7, mag: -1.46, con: "CMa" },
      { id: "Canopus", ra: 6 + 24/60, dec: -52.7, mag: -0.73, con: "Car" },
      { id: "Rigil Kentaurus", ra: 14 + 40/60, dec: -60.8, mag: -0.29, con: "Cen" },
      { id: "Arcturus", ra: 14 + 16/60, dec: +19.2, mag: -0.05, con: "Boo" },
      { id: "Vega", ra: 18 + 37/60, dec: +38.8, mag: 0.03, con: "Lyr" },
      { id: "Capella", ra: 5 + 17/60, dec: +46.0, mag: 0.07, con: "Aur" },
      { id: "Rigel", ra: 5 + 15/60, dec: -8.2, mag: 0.15, con: "Ori" },
      { id: "Procyon", ra: 7 + 39/60, dec: +5.2, mag: 0.36, con: "CMi" },
      { id: "Achernar", ra: 1 + 38/60, dec: -57.2, mag: 0.45, con: "Eri" },
      { id: "Betelgeuse", ra: 5 + 55/60, dec: +7.4, mag: 0.55, con: "Ori" },

      { id: "Hadar", ra: 14 + 4/60, dec: -60.4, mag: 0.61, con: "Cen" },
      { id: "Altair", ra: 19 + 51/60, dec: +8.9, mag: 0.77, con: "Aql" },
      { id: "Acrux", ra: 12 + 27/60, dec: -63.1, mag: 0.79, con: "Cru" },
      { id: "Aldebaran", ra: 4 + 36/60, dec: +16.5, mag: 0.86, con: "Tau" },
      { id: "Antares", ra: 16 + 29/60, dec: -26.4, mag: 0.95, con: "Sco" },
      { id: "Spica", ra: 13 + 25/60, dec: -11.2, mag: 0.97, con: "Vir" },
      { id: "Pollux", ra: 7 + 45/60, dec: +28.0, mag: 1.14, con: "Gem" },
      { id: "Fomalhaut", ra: 22 + 58/60, dec: -29.6, mag: 1.15, con: "PsA" },
      { id: "Deneb", ra: 20 + 41/60, dec: +45.3, mag: 1.24, con: "Cyg" },
      { id: "Mimosa", ra: 12 + 48/60, dec: -59.7, mag: 1.26, con: "Cru" },

      { id: "Regulus", ra: 10 + 8/60, dec: +12.0, mag: 1.36, con: "Leo" },
      { id: "Adhara", ra: 6 + 59/60, dec: -29.0, mag: 1.50, con: "CMa" },
      { id: "Castor", ra: 7 + 35/60, dec: +31.9, mag: 1.58, con: "Gem" },
      { id: "Shaula", ra: 17 + 34/60, dec: -37.1, mag: 1.62, con: "Sco" },
      { id: "Gacrux", ra: 12 + 31/60, dec: -57.1, mag: 1.63, con: "Cru" },
      { id: "Bellatrix", ra: 5 + 25/60, dec: +6.3, mag: 1.64, con: "Ori" },
      { id: "Elnath", ra: 5 + 26/60, dec: +28.6, mag: 1.66, con: "Tau" },
      { id: "Miaplacidus", ra: 9 + 13/60, dec: -69.7, mag: 1.67, con: "Car" },
      { id: "Alnilam", ra: 5 + 36/60, dec: -1.2, mag: 1.69, con: "Ori" },
      { id: "Alnair", ra: 22 + 8/60, dec: -47.0, mag: 1.74, con: "Gru" },

      { id: "Alnitak", ra: 5 + 41/60, dec: -1.9, mag: 1.75, con: "Ori" },
      { id: "Alioth", ra: 12 + 54/60, dec: +56.0, mag: 1.77, con: "UMa" },
      { id: "Mirfak", ra: 3 + 24/60, dec: +49.9, mag: 1.80, con: "Per" },
      { id: "Dubhe", ra: 11 + 4/60, dec: +61.8, mag: 1.80, con: "UMa" },
      { id: "Regor", ra: 8 + 10/60, dec: -47.3, mag: 1.81, con: "Vel" },
      { id: "Wezen", ra: 7 + 8/60, dec: -26.4, mag: 1.83, con: "CMa" },
      { id: "Kaus Australis", ra: 18 + 24/60, dec: -34.4, mag: 1.84, con: "Sgr" },
      { id: "Alkaid", ra: 13 + 48/60, dec: +49.3, mag: 1.86, con: "UMa" },
      { id: "Sargas", ra: 17 + 37/60, dec: -43.0, mag: 1.86, con: "Sco" },
      { id: "Avior", ra: 8 + 23/60, dec: -59.5, mag: 1.87, con: "Car" },

      { id: "Menkalinan", ra: 6 + 0/60, dec: +44.9, mag: 1.90, con: "Aur" },
      { id: "Atria", ra: 16 + 49/60, dec: -69.0, mag: 1.92, con: "TrA" },
      { id: "Alhena", ra: 6 + 38/60, dec: +16.4, mag: 1.93, con: "Gem" },
      { id: "Peacock", ra: 20 + 26/60, dec: -56.7, mag: 1.93, con: "Pav" },
      { id: "Koo She", ra: 8 + 45/60, dec: -54.7, mag: 1.95, con: "Vel" },
      { id: "Mirzam", ra: 6 + 23/60, dec: -18.0, mag: 1.98, con: "CMa" },
      { id: "Alphard", ra: 9 + 28/60, dec: -8.7, mag: 1.98, con: "Hya" },
      { id: "Polaris", ra: 2 + 32/60, dec: +89.3, mag: 1.99, con: "UMi" },
      { id: "Algieba", ra: 10 + 20/60, dec: +19.8, mag: 2.00, con: "Leo" },
      { id: "Hamal", ra: 2 + 7/60, dec: +23.5, mag: 2.01, con: "Ari" },

      { id: "Diphda", ra: 0 + 44/60, dec: -18.0, mag: 2.04, con: "Cet" },
      { id: "Nunki", ra: 18 + 55/60, dec: -26.3, mag: 2.05, con: "Sgr" },
      { id: "Menkent", ra: 14 + 7/60, dec: -36.4, mag: 2.06, con: "Cen" },
      { id: "Alpheratz", ra: 0 + 8/60, dec: +29.1, mag: 2.07, con: "And" },
      { id: "Mirach", ra: 1 + 10/60, dec: +35.6, mag: 2.07, con: "And" },
      { id: "Saiph", ra: 5 + 48/60, dec: -9.7, mag: 2.07, con: "Ori" },
      { id: "Kochab", ra: 14 + 51/60, dec: +74.2, mag: 2.07, con: "UMi" },
      { id: "Al Dhanab", ra: 22 + 43/60, dec: -46.9, mag: 2.07, con: "Gru" },
      { id: "Rasalhague", ra: 17 + 35/60, dec: +12.6, mag: 2.08, con: "Oph" },
      { id: "Algol", ra: 3 + 8/60, dec: +41.0, mag: 2.09, con: "Per" },

      { id: "Almach", ra: 2 + 4/60, dec: +42.3, mag: 2.10, con: "And" },
      { id: "Denebola", ra: 11 + 49/60, dec: +14.6, mag: 2.14, con: "Leo" },
      { id: "Cih", ra: 0 + 57/60, dec: +60.7, mag: 2.15, con: "Cas" },
      { id: "Muhlifain", ra: 12 + 42/60, dec: -49.0, mag: 2.20, con: "Cen" },
      { id: "Naos", ra: 8 + 4/60, dec: -40.0, mag: 2.21, con: "Pup" },
      { id: "Aspidiske", ra: 9 + 17/60, dec: -59.3, mag: 2.21, con: "Car" },
      { id: "Alphecca", ra: 15 + 35/60, dec: +26.7, mag: 2.22, con: "CrB" },
      { id: "Suhail", ra: 9 + 8/60, dec: -43.4, mag: 2.23, con: "Vel" },
      { id: "Mizar", ra: 13 + 24/60, dec: +54.9, mag: 2.23, con: "UMa" },
      { id: "Sadr", ra: 20 + 22/60, dec: +40.3, mag: 2.23, con: "Cyg" },

      { id: "Schedar", ra: 0 + 41/60, dec: +56.5, mag: 2.24, con: "Cas" },
      { id: "Eltanin", ra: 17 + 57/60, dec: +51.5, mag: 2.24, con: "Dra" },
      { id: "Mintaka", ra: 5 + 32/60, dec: -0.3, mag: 2.25, con: "Ori" },
      { id: "Caph", ra: 0 + 9/60, dec: +59.2, mag: 2.28, con: "Cas" },
      { id: "Epsilon Centauri", ra: 13 + 40/60, dec: -53.5, mag: 2.29, con: "Cen" },
      { id: "Dschubba", ra: 16 + 0/60, dec: -22.6, mag: 2.29, con: "Sco" },
      { id: "Wei", ra: 16 + 50/60, dec: -34.3, mag: 2.29, con: "Sco" },
      { id: "Men", ra: 14 + 42/60, dec: -47.4, mag: 2.30, con: "Lup" },
      { id: "Eta Centauri", ra: 14 + 36/60, dec: -42.2, mag: 2.33, con: "Cen" },
      { id: "Merak", ra: 11 + 2/60, dec: +56.4, mag: 2.34, con: "UMa" },

      { id: "Izar", ra: 14 + 45/60, dec: +27.1, mag: 2.35, con: "Boo" },
      { id: "Enif", ra: 21 + 44/60, dec: +9.9, mag: 2.38, con: "Peg" },
      { id: "Girtab", ra: 17 + 42/60, dec: -39.0, mag: 2.39, con: "Sco" },
      { id: "Ankaa", ra: 0 + 26/60, dec: -42.3, mag: 2.40, con: "Phe" },
      { id: "Phecda", ra: 11 + 54/60, dec: +53.7, mag: 2.41, con: "UMa" },
      { id: "Sabik", ra: 17 + 10/60, dec: -15.7, mag: 2.43, con: "Oph" },
      { id: "Scheat", ra: 23 + 4/60, dec: +28.1, mag: 2.44, con: "Peg" },
      { id: "Aludra", ra: 7 + 24/60, dec: -29.3, mag: 2.45, con: "CMa" },
      { id: "Alderamin", ra: 21 + 19/60, dec: +62.6, mag: 2.45, con: "Cep" },
      { id: "Markeb", ra: 9 + 22/60, dec: -55.0, mag: 2.47, con: "Vel" },

      { id: "Gienah", ra: 20 + 46/60, dec: +34.0, mag: 2.48, con: "Cyg" },
      { id: "Markab", ra: 23 + 5/60, dec: +15.2, mag: 2.49, con: "Peg" },
      { id: "Menkar", ra: 3 + 2/60, dec: +4.1, mag: 2.54, con: "Cet" },
      { id: "Han", ra: 16 + 37/60, dec: -10.6, mag: 2.54, con: "Oph" },
      { id: "Al Nair al Kentaurus", ra: 13 + 56/60, dec: -47.3, mag: 2.55, con: "Cen" },
      { id: "Zosma", ra: 11 + 14/60, dec: +20.5, mag: 2.56, con: "Leo" },
      { id: "Graffias", ra: 16 + 5/60, dec: -19.8, mag: 2.56, con: "Sco" },
      { id: "Arneb", ra: 5 + 33/60, dec: -17.8, mag: 2.58, con: "Lep" },
      { id: "Delta Centauri", ra: 12 + 8/60, dec: -50.7, mag: 2.58, con: "Cen" },
      { id: "Gienah Ghurab", ra: 12 + 16/60, dec: -17.5, mag: 2.58, con: "Crv" },
      { id: "Ascella", ra: 19 + 3/60, dec: -29.9, mag: 2.60, con: "Sgr" },

      { id: "Zubeneschamali", ra: 15 + 17/60, dec: -9.4, mag: 2.61, con: "Lib" },
      { id: "Unukalhai", ra: 15 + 44/60, dec: +6.4, mag: 2.63, con: "Ser" },
      { id: "Sheratan", ra: 1 + 55/60, dec: +20.8, mag: 2.64, con: "Ari" },
      { id: "Zubenelgenubi", ra: 14 + 51/60, dec: -16.0, mag: 2.64, con: "Lib" },
      { id: "Phact", ra: 5 + 40/60, dec: -34.1, mag: 2.65, con: "Col" },
      { id: "Theta Aurigae", ra: 6 + 0/60, dec: +37.2, mag: 2.65, con: "Aur" },
      { id: "Kraz", ra: 12 + 34/60, dec: -23.4, mag: 2.65, con: "Crv" },
      { id: "Ruchbah", ra: 1 + 26/60, dec: +60.2, mag: 2.66, con: "Cas" },
      { id: "Muphrid", ra: 13 + 55/60, dec: +18.4, mag: 2.68, con: "Boo" },

      { id: "Ke Kouan", ra: 14 + 59/60, dec: -43.1, mag: 2.68, con: "Lup" },
      { id: "Hassaleh", ra: 4 + 57/60, dec: +33.2, mag: 2.69, con: "Aur" },
      { id: "Mu Velorum", ra: 10 + 47/60, dec: -49.4, mag: 2.69, con: "Vel" },
      { id: "Alpha Muscae", ra: 12 + 37/60, dec: -69.1, mag: 2.69, con: "Mus" },
      { id: "Lesath", ra: 17 + 31/60, dec: -37.3, mag: 2.70, con: "Sco" },
      { id: "Pi Puppis", ra: 7 + 17/60, dec: -37.1, mag: 2.71, con: "Pup" },
      { id: "Kaus Meridionalis", ra: 18 + 21/60, dec: -29.8, mag: 2.72, con: "Sgr" },
      { id: "Tarazed", ra: 19 + 46/60, dec: +10.6, mag: 2.72, con: "Aql" },
      { id: "Yed Prior", ra: 16 + 14/60, dec: -3.7, mag: 2.73, con: "Oph" },
      { id: "Aldhibain", ra: 16 + 24/60, dec: +61.5, mag: 2.73, con: "Dra" },

      { id: "Theta Carinae", ra: 10 + 43/60, dec: -64.4, mag: 2.74, con: "Car" },
      { id: "Porrima", ra: 12 + 42/60, dec: -1.5, mag: 2.74, con: "Vir" },
      { id: "Hatysa", ra: 5 + 35/60, dec: -5.9, mag: 2.75, con: "Ori" },
      { id: "Iota Centauri", ra: 13 + 21/60, dec: -36.7, mag: 2.75, con: "Cen" },
      { id: "Cebalrai", ra: 17 + 43/60, dec: +4.6, mag: 2.76, con: "Oph" },
      { id: "Kursa", ra: 5 + 8/60, dec: -5.1, mag: 2.78, con: "Eri" },
      { id: "Kornephoros", ra: 16 + 30/60, dec: +21.5, mag: 2.78, con: "Her" },
      { id: "Decrux", ra: 12 + 15/60, dec: -58.7, mag: 2.79, con: "Cru" },
      { id: "Rastaban", ra: 17 + 30/60, dec: +52.3, mag: 2.79, con: "Dra" },
      { id: "Cor Caroli", ra: 12 + 56/60, dec: +38.3, mag: 2.80, con: "CVn" },

      { id: "Gamma Lupi", ra: 15 + 35/60, dec: -41.2, mag: 2.80, con: "Lup" },
      { id: "Nihal", ra: 5 + 28/60, dec: -20.8, mag: 2.81, con: "Lep" },
      { id: "Zeta Herculis", ra: 16 + 41/60, dec: +31.6, mag: 2.81, con: "Her" },
      { id: "Beta Hydri", ra: 0 + 26/60, dec: -77.3, mag: 2.82, con: "Hyi" },
      { id: "Tau Scorpii", ra: 16 + 36/60, dec: -28.2, mag: 2.82, con: "Sco" },
      { id: "Kaus Borealis", ra: 18 + 28/60, dec: -25.4, mag: 2.82, con: "Sgr" },
      { id: "Algenib", ra: 0 + 13/60, dec: +15.2, mag: 2.83, con: "Peg" },
      { id: "Turais", ra: 8 + 8/60, dec: -24.3, mag: 2.83, con: "Pup" },
      { id: "Beta Trianguli Australis", ra: 15 + 55/60, dec: -63.4, mag: 2.83, con: "TrA" },
      { id: "Zeta Persei", ra: 3 + 54/60, dec: +31.9, mag: 2.84, con: "Per" },

      { id: "Beta Arae", ra: 17 + 25/60, dec: -55.5, mag: 2.84, con: "Ara" },
      { id: "Alpha Arae", ra: 17 + 32/60, dec: -49.9, mag: 2.84, con: "Ara" },
      { id: "Alcyone", ra: 3 + 47/60, dec: +24.1, mag: 2.85, con: "Tau" },
      { id: "Vindemiatrix", ra: 13 + 2/60, dec: +11.0, mag: 2.85, con: "Vir" },
      { id: "Deneb Algedi", ra: 21 + 47/60, dec: -16.1, mag: 2.85, con: "Cap" },
      { id: "Head of Hydrus", ra: 1 + 59/60, dec: -61.6, mag: 2.86, con: "Hyi" },
      { id: "Delta Cygni", ra: 19 + 45/60, dec: +45.1, mag: 2.86, con: "Cyg" },
      { id: "Tejat", ra: 6 + 23/60, dec: +22.5, mag: 2.87, con: "Gem" },
      { id: "Gamma Trianguli Australis", ra: 15 + 19/60, dec: -68.7, mag: 2.87, con: "TrA" },
      { id: "Alpha Tucanae", ra: 22 + 19/60, dec: -60.3, mag: 2.87, con: "Tuc" },

      { id: "Acamar", ra: 2 + 58/60, dec: -40.3, mag: 2.88, con: "Eri" },
      { id: "Albaldah", ra: 19 + 10/60, dec: -21.0, mag: 2.88, con: "Sgr" },
      { id: "Gomeisa", ra: 7 + 27/60, dec: +8.3, mag: 2.89, con: "CMi" },
      { id: "Pi Scorpii", ra: 15 + 59/60, dec: -26.1, mag: 2.89, con: "Sco" },
      { id: "Epsilon Persei", ra: 3 + 58/60, dec: +40.0, mag: 2.90, con: "Per" },
      { id: "Alniyat", ra: 16 + 21/60, dec: -25.6, mag: 2.90, con: "Sco" },
      { id: "Albireo", ra: 19 + 31/60, dec: +28.0, mag: 2.90, con: "Cyg" },
      { id: "Sadalsuud", ra: 21 + 32/60, dec: -5.6, mag: 2.90, con: "Aqr" },
      { id: "Gamma Persei", ra: 3 + 5/60, dec: +53.5, mag: 2.91, con: "Per" },
      { id: "Upsilon Carinae", ra: 9 + 47/60, dec: -65.1, mag: 2.92, con: "Car" },

      { id: "Matar", ra: 22 + 43/60, dec: +30.2, mag: 2.93, con: "Peg" },
      { id: "Tau Puppis", ra: 6 + 50/60, dec: -50.6, mag: 2.94, con: "Pup" },
      { id: "Algorel", ra: 12 + 30/60, dec: -16.5, mag: 2.94, con: "Crv" },
      { id: "Sadalmelik", ra: 22 + 6/60, dec: -0.3, mag: 2.95, con: "Aqr" },
      { id: "Zaurak", ra: 3 + 58/60, dec: -13.5, mag: 2.97, con: "Eri" },
      { id: "Alheka", ra: 5 + 38/60, dec: +21.1, mag: 2.97, con: "Tau" },
      { id: "Ras Elased Australis", ra: 9 + 46/60, dec: +23.8, mag: 2.97, con: "Leo" },
      { id: "Alnasl", ra: 18 + 6/60, dec: -30.4, mag: 2.98, con: "Sgr" },
      { id: "Gamma Hydrae", ra: 13 + 19/60, dec: -23.2, mag: 2.99, con: "Hya" },
      { id: "Iota¹ Scorpii", ra: 17 + 48/60, dec: -40.1, mag: 2.99, con: "Sco" },

      { id: "Deneb el Okab", ra: 19 + 5/60, dec: +13.9, mag: 2.99, con: "Aql" },
      { id: "Beta Trianguli", ra: 2 + 10/60, dec: +35.0, mag: 3.00, con: "Tri" },
      { id: "Psi Ursae Majoris", ra: 11 + 10/60, dec: +44.5, mag: 3.00, con: "UMa" },
      { id: "Pherkad", ra: 15 + 21/60, dec: +71.8, mag: 3.00, con: "UMi" },
      { id: "Mu¹ Scorpii", ra: 16 + 52/60, dec: -38.0, mag: 3.00, con: "Sco" },
      { id: "Gamma Gruis", ra: 21 + 54/60, dec: -37.4, mag: 3.00, con: "Gru" },
      { id: "Delta Persei", ra: 3 + 43/60, dec: +47.8, mag: 3.01, con: "Per" },
      { id: "Phurad", ra: 6 + 20/60, dec: -30.1, mag: 3.02, con: "CMa" },
      { id: "Omicron² Canis Majoris", ra: 7 + 3/60, dec: -23.8, mag: 3.02, con: "CMa" },
      { id: "Minkar", ra: 12 + 10/60, dec: -22.6, mag: 3.02, con: "Crv" },

      { id: "Almaaz", ra: 5 + 2/60, dec: +43.8, mag: 3.03, con: "Aur" },
      { id: "Beta Muscae", ra: 12 + 46/60, dec: -68.1, mag: 3.04, con: "Mus" },
      { id: "Seginus", ra: 14 + 32/60, dec: +38.3, mag: 3.04, con: "Boo" },
      { id: "Dabih", ra: 20 + 21/60, dec: -14.8, mag: 3.05, con: "Cap" },
      { id: "Mebsuta", ra: 6 + 44/60, dec: +25.1, mag: 3.06, con: "Gem" },
      { id: "Tania Australis", ra: 10 + 22/60, dec: +41.5, mag: 3.06, con: "UMa" },
      { id: "Delta Draconis", ra: 19 + 13/60, dec: +67.7, mag: 3.07, con: "Dra" },
      { id: "Eta Sagittarii", ra: 18 + 18/60, dec: -36.8, mag: 3.10, con: "Sgr" },
      { id: "Zeta Hydrae", ra: 8 + 55/60, dec: +5.9, mag: 3.11, con: "Hya" },
      { id: "Nu Hydrae", ra: 10 + 50/60, dec: -16.2, mag: 3.11, con: "Hya" },

      { id: "Lambda Centauri", ra: 11 + 36/60, dec: -63.0, mag: 3.11, con: "Cen" },
      { id: "Alpha Indi", ra: 20 + 38/60, dec: -47.3, mag: 3.11, con: "Ind" },
      { id: "Wazn", ra: 5 + 51/60, dec: -35.8, mag: 3.12, con: "Col" },
      { id: "Talita", ra: 8 + 59/60, dec: +48.0, mag: 3.12, con: "UMa" },
      { id: "Zeta Arae", ra: 16 + 59/60, dec: -56.0, mag: 3.12, con: "Ara" },
      { id: "Sarin", ra: 17 + 15/60, dec: +24.8, mag: 3.12, con: "Her" },
      { id: "Kappa Centauri", ra: 14 + 59/60, dec: -42.1, mag: 3.13, con: "Cen" },
      { id: "Alpha Lyncis", ra: 9 + 21/60, dec: +34.4, mag: 3.14, con: "Lyn" },
      { id: "N Velorum", ra: 9 + 31/60, dec: -57.0, mag: 3.16, con: "Vel" },
      { id: "Pi Herculis", ra: 17 + 15/60, dec: +36.8, mag: 3.16, con: "Her" },

      { id: "Nu Puppis", ra: 6 + 38/60, dec: -43.2, mag: 3.17, con: "Pup" },
      { id: "Al Haud", ra: 9 + 33/60, dec: +51.7, mag: 3.17, con: "UMa" },
      { id: "Aldhibah", ra: 17 + 9/60, dec: +65.7, mag: 3.17, con: "Dra" },
      { id: "Phi Sagittarii", ra: 18 + 46/60, dec: -27.0, mag: 3.17, con: "Sgr" },
      { id: "Hoedus II", ra: 5 + 7/60, dec: +41.2, mag: 3.18, con: "Aur" },
      { id: "Alpha Circini", ra: 14 + 43/60, dec: -65.0, mag: 3.18, con: "Cir" },
      { id: "Tabit", ra: 4 + 50/60, dec: +7.0, mag: 3.19, con: "Ori" },
      { id: "Epsilon Leporis", ra: 5 + 5/60, dec: -22.4, mag: 3.19, con: "Lep" },
      { id: "Kappa Ophiuchi", ra: 16 + 58/60, dec: +9.4, mag: 3.19, con: "Oph" },
      { id: "G Scorpii", ra: 17 + 50/60, dec: -37.0, mag: 3.19, con: "Sco" },

      { id: "Zeta Cygni", ra: 21 + 13/60, dec: +30.2, mag: 3.21, con: "Cyg" },
      { id: "Errai", ra: 23 + 39/60, dec: +77.6, mag: 3.21, con: "Cep" },
      { id: "Delta Lupi", ra: 15 + 21/60, dec: -40.6, mag: 3.22, con: "Lup" },
      { id: "Yed Posterior", ra: 16 + 18/60, dec: -4.7, mag: 3.23, con: "Oph" },
      { id: "Eta Serpentis", ra: 18 + 21/60, dec: -2.9, mag: 3.23, con: "Ser" },
      { id: "Alphirk", ra: 21 + 29/60, dec: +70.6, mag: 3.23, con: "Cep" },
      { id: "Alpha Pictoris", ra: 6 + 48/60, dec: -61.9, mag: 3.24, con: "Pic" },
      { id: "Theta Aquilae", ra: 20 + 11/60, dec: -0.8, mag: 3.24, con: "Aql" },
      { id: "Sigma Puppis", ra: 7 + 29/60, dec: -43.3, mag: 3.25, con: "Pup" },
      { id: "Pi Hydrae", ra: 14 + 6/60, dec: -26.7, mag: 3.25, con: "Hya" },

      { id: "Brachium", ra: 15 + 4/60, dec: -25.3, mag: 3.25, con: "Lib" },
      { id: "Sulaphat", ra: 18 + 59/60, dec: +32.7, mag: 3.25, con: "Lyr" },
      { id: "Gamma Hydri", ra: 3 + 47/60, dec: -74.2, mag: 3.26, con: "Hyi" },
      { id: "Delta Andromedae", ra: 0 + 39/60, dec: +30.9, mag: 3.27, con: "And" },
      { id: "Theta Ophiuchi", ra: 17 + 22/60, dec: -25.0, mag: 3.27, con: "Oph" },
      { id: "Skat", ra: 22 + 55/60, dec: -15.8, mag: 3.27, con: "Aqr" },
      { id: "Mu Leporis", ra: 5 + 13/60, dec: -16.2, mag: 3.29, con: "Lep" },
      { id: "Omega Carinae", ra: 10 + 14/60, dec: -70.0, mag: 3.29, con: "Car" },
      { id: "Edasich", ra: 15 + 25/60, dec: +59.0, mag: 3.29, con: "Dra" },
      { id: "Alpha Doradus", ra: 4 + 34/60, dec: -55.0, mag: 3.30, con: "Dor" },

      { id: "p Carinae", ra: 10 + 32/60, dec: -61.7, mag: 3.30, con: "Car" },
      { id: "Mu Centauri", ra: 13 + 50/60, dec: -42.5, mag: 3.30, con: "Cen" },
      { id: "Propus", ra: 6 + 15/60, dec: +22.5, mag: 3.31, con: "Gem" },
      { id: "Rasalgethi", ra: 17 + 15/60, dec: +14.4, mag: 3.31, con: "Her" },
      { id: "Gamma Arae", ra: 17 + 25/60, dec: -56.4, mag: 3.31, con: "Ara" },
      { id: "Beta Phoenicis", ra: 1 + 6/60, dec: -46.7, mag: 3.32, con: "Phe" },
      { id: "Rho Persei", ra: 3 + 5/60, dec: +38.8, mag: 3.32, con: "Per" },
      { id: "Megrez", ra: 12 + 15/60, dec: +57.0, mag: 3.32, con: "UMa" },
      { id: "Eta Scorpii", ra: 17 + 12/60, dec: -43.2, mag: 3.32, con: "Sco" },
      { id: "Nu Ophiuchi", ra: 17 + 59/60, dec: -9.8, mag: 3.32, con: "Oph" },

      { id: "Tau Sagittarii", ra: 19 + 7/60, dec: -27.7, mag: 3.32, con: "Sgr" },
      { id: "Alpha Reticuli", ra: 4 + 14/60, dec: -62.5, mag: 3.33, con: "Ret" },
      { id: "Chort", ra: 11 + 14/60, dec: +15.4, mag: 3.33, con: "Leo" },
      { id: "Asmidiske", ra: 7 + 49/60, dec: -24.9, mag: 3.34, con: "Pup" },
      { id: "Segin", ra: 1 + 54/60, dec: +63.7, mag: 3.35, con: "Cas" },
      { id: "Algjebbah", ra: 5 + 24/60, dec: -2.4, mag: 3.35, con: "Ori" },
      { id: "Alzirr", ra: 6 + 45/60, dec: +12.9, mag: 3.35, con: "Gem" },
      { id: "Muscida", ra: 8 + 30/60, dec: +60.7, mag: 3.35, con: "UMa" },
      { id: "Delta Aquilae", ra: 19 + 25/60, dec: +3.1, mag: 3.36, con: "Aql" },
      { id: "Epsilon Lupi", ra: 15 + 23/60, dec: -44.7, mag: 3.37, con: "Lup" },

      { id: "Heze", ra: 13 + 35/60, dec: -0.6, mag: 3.38, con: "Vir" },
      { id: "Epsilon Hydrae", ra: 8 + 47/60, dec: +6.4, mag: 3.38, con: "Hya" },
      { id: "Meissa", ra: 5 + 35/60, dec: +9.9, mag: 3.39, con: "Ori" },
      { id: "q Carinae", ra: 10 + 17/60, dec: -61.3, mag: 3.39, con: "Car" },
      { id: "Auva", ra: 12 + 56/60, dec: +3.4, mag: 3.39, con: "Vir" },
      { id: "Zeta Cephei", ra: 22 + 11/60, dec: +58.2, mag: 3.39, con: "Cep" },
      { id: "Theta² Tauri", ra: 4 + 29/60, dec: +15.9, mag: 3.40, con: "Tau" },
      { id: "Gamma Phoenicis", ra: 1 + 28/60, dec: -43.3, mag: 3.41, con: "Phe" },
      { id: "Tauri", ra: 4 + 1/60, dec: +12.5, mag: 3.41, con: "Tau" },
      { id: "Nu Centauri", ra: 13 + 50/60, dec: -41.7, mag: 3.41, con: "Cen" },

      { id: "Zeta Lupi", ra: 15 + 12/60, dec: -52.1, mag: 3.41, con: "Lup" },
      { id: "Eta Cephei", ra: 20 + 45/60, dec: +61.8, mag: 3.41, con: "Cep" },
      { id: "Homam", ra: 22 + 41/60, dec: +10.8, mag: 3.41, con: "Peg" },
      { id: "Mothallah", ra: 1 + 53/60, dec: +29.6, mag: 3.42, con: "Tri" },
      { id: "Eta Lupi", ra: 16 + 0/60, dec: -38.4, mag: 3.42, con: "Lup" },
      { id: "Mu Herculis", ra: 17 + 46/60, dec: +27.7, mag: 3.42, con: "Her" },
      { id: "Beta Pavonis", ra: 20 + 45/60, dec: -66.2, mag: 3.42, con: "Pav" },
      { id: "a Carinae", ra: 9 + 11/60, dec: -58.9, mag: 3.43, con: "Car" },
      { id: "Adhafera", ra: 10 + 17/60, dec: +23.4, mag: 3.43, con: "Leo" },
      { id: "Althalimain", ra: 19 + 6/60, dec: -4.9, mag: 3.43, con: "Aql" },

      { id: "Tania Borealis", ra: 10 + 17/60, dec: +42.9, mag: 3.45, con: "UMa" },
      { id: "Sheliak", ra: 18 + 50/60, dec: +33.4, mag: 3.45, con: "Lyr" },
      { id: "Achird", ra: 0 + 49/60, dec: +57.8, mag: 3.46, con: "Cas" },
      { id: "Dheneb", ra: 1 + 9/60, dec: -10.2, mag: 3.46, con: "Cet" },
      { id: "Chi Carinae", ra: 7 + 57/60, dec: -53.0, mag: 3.46, con: "Car" },
      { id: "Delta Bootis", ra: 15 + 16/60, dec: +33.3, mag: 3.46, con: "Boo" },
      { id: "Kaffaljidhma", ra: 2 + 43/60, dec: +3.2, mag: 3.47, con: "Cet" },
      { id: "Eta Leonis", ra: 10 + 7/60, dec: +16.8, mag: 3.48, con: "Leo" },
      { id: "Eta Herculis", ra: 16 + 43/60, dec: +38.9, mag: 3.48, con: "Her" },
      { id: "Tau Ceti", ra: 1 + 44/60, dec: -15.9, mag: 3.49, con: "Cet" },

      { id: "Sigma Canis Majoris", ra: 7 + 2/60, dec: -27.9, mag: 3.49, con: "CMa" },
      { id: "Nu Ursae Majoris", ra: 11 + 18/60, dec: +33.1, mag: 3.49, con: "UMa" },
      { id: "Nekkar", ra: 15 + 2/60, dec: +40.4, mag: 3.49, con: "Boo" },
      { id: "Alpha Telescopii", ra: 18 + 27/60, dec: -46.0, mag: 3.49, con: "Tel" },
      { id: "Epsilon Gruis", ra: 22 + 49/60, dec: -51.3, mag: 3.49, con: "Gru" },
      { id: "Kappa Canis Majoris", ra: 6 + 50/60, dec: -32.5, mag: 3.50, con: "CMa" },
      { id: "Wasat", ra: 7 + 20/60, dec: +22.0, mag: 3.50, con: "Gem" },
      { id: "Iota Cephei", ra: 22 + 50/60, dec: +66.2, mag: 3.50, con: "Cep" },
      { id: "Gamma Sagittae", ra: 19 + 59/60, dec: +19.5, mag: 3.51, con: "Sge" },
      { id: "Sadalbari", ra: 22 + 50/60, dec: +24.6, mag: 3.51, con: "Peg" },

      { id: "Rana", ra: 3 + 43/60, dec: -9.8, mag: 3.52, con: "Eri" },
      { id: "Subra", ra: 9 + 41/60, dec: +9.9, mag: 3.52, con: "Leo" },
      { id: "Tseen Ke", ra: 9 + 57/60, dec: -54.6, mag: 3.52, con: "Vel" },
      { id: "Xi² Sagittarii", ra: 18 + 58/60, dec: -21.1, mag: 3.52, con: "Sgr" },
      { id: "Baham", ra: 22 + 10/60, dec: +6.2, mag: 3.52, con: "Peg" },
      { id: "Ain", ra: 4 + 29/60, dec: +19.2, mag: 3.53, con: "Tau" },
      { id: "Tarf", ra: 8 + 17/60, dec: +9.2, mag: 3.53, con: "Cnc" },
      { id: "Xi Hydrae", ra: 11 + 33/60, dec: -31.9, mag: 3.54, con: "Hya" },
      { id: "Mu Serpentis", ra: 15 + 50/60, dec: -3.4, mag: 3.54, con: "Ser" },
      { id: "Xi Serpentis", ra: 17 + 38/60, dec: -15.4, mag: 3.54, con: "Ser" },
    ];
    return STAR_CATALOG_300;
  }

  const CONST_LINES = [
    // ORION
    ["Meissa", "Bellatrix"],
    ["Meissa", "Betelgeuse"],
    ["Bellatrix", "Mintaka"],
    ["Alnitak", "Alnilam"],
    ["Alnilam", "Mintaka"],
    ["Betelgeuse", "Alnitak"],
    ["Alnitak", "Saiph"],
    ["Saiph", "Rigel"],
    ["Rigel", "Mintaka"],

    // URSA MAJOR
    ["Dubhe", "Merak"],
    ["Merak", "Phecda"],
    ["Phecda", "Megrez"],
    ["Megrez", "Alioth"],
    ["Alioth", "Mizar"],
    ["Mizar", "Alkaid"],
    ["Al Haud", "Talita"],
    ["Phecda", "Psi Ursae Majoris"],
    ["Megrez", "Dubhe"],
    ["Psi Ursae Majoris", "Tania Borealis"],
    ["Tania Borealis", "Tania Australis"],
    ["Dubhe", "Muscida"],
    ["Merak", "Muscida"],
    ["Merak", "Al Haud"],
    ["Nu Ursae Majoris", "Psi Ursae Majoris"],

    // URSA MINOR
    ["Polaris", "Kochab"],
    ["Kochab", "Pherkad"],

    // CASSIOPEIA
    ["Schedar", "Caph"],
    ["Schedar", "Achird"],
    ["Achird", "Cih"],
    ["Cih", "Ruchbah"],
    ["Ruchbah", "Segin"],

    // CYGNUS
    ["Deneb", "Sadr"],
    ["Sadr", "Gienah"],
    ["Gienah", "Zeta Cygni"],
    ["Albireo", "Sadr"],
    ["Sadr", "Delta Cygni"],

    // SCORPIUS
    ["Antares", "Alniyat"],
    ["Alniyat", "Dschubba"],
    ["Dschubba", "Pi Scorpii"],
    ["Antares", "Tau Scorpii"],
    ["Tau Scorpii", "Wei"],
    ["Girtab", "Shaula"],
    ["Shaula", "Lesath"],
    ["Graffias", "Dschubba"],
    ["Wei", "Mu¹ Scorpii"],
    ["Mu¹ Scorpii", "Eta Scorpii"],
    ["Eta Scorpii", "Sargas"],
    ["Sargas", "Iota¹ Scorpii"],
    ["Girtab", "Iota¹ Scorpii"],

    // CRUX
    ["Mimosa", "Decrux"],
    ["Gacrux", "Acrux"],

    // Argo Navis (Carina, Vela, Puppis)
    ["Canopus", "Miaplacidus"],
    ["Miaplacidus", "Omega Carinae"],
    ["Omega Carinae", "Theta Carinae"],
    ["p Carinae", "Theta Carinae"],
    ["p Carinae", "q Carinae"],
    ["Aspidiske", "q Carinae"],
    ["Aspidiske", "Avior"],
    ["Chi Carinae", "Avior"],
    ["Aspidiske", "Koo She"],
    ["Koo She", "Markeb"],
    ["Markeb", "Tseen Ke"],
    ["Tseen Ke", "Mu Velorum"],
    ["Mu Velorum", "Suhail"],
    ["Suhail", "Regor"],
    ["Regor", "Koo She"],
    ["Regor", "Naos"],
    ["Naos", "Turais"],
    ["Turais", "Asmidiske"],
    ["Chi Carinae", "Regor"],
    ["Asmidiske", "Pi Puppis"],
    ["Pi Puppis", "Nu Puppis"],
    ["Nu Puppis", "Canopus"],

    // CENTAURUS
    ["Rigil Kentaurus", "Hadar"],
    ["Hadar", "Epsilon Centauri"],
    ["Epsilon Centauri", "Muhlifain"],
    ["Muhlifain", "Delta Centauri"],
    ["Al Nair al Kentaurus", "Epsilon Centauri"],
    ["Al Nair al Kentaurus", "Mu Centauri"],
    ["Mu Centauri", "Nu Centauri"],
    ["Nu Centauri", "Menkent"],
    ["Menkent", "Iota Centauri"],

    // Lupus
    ["Men", "Zeta Lupi"],
    ["Zeta Lupi", "Eta Lupi"],
    ["Zeta Lupi", "Epsilon Lupi"],
    ["Epsilon Lupi", "Gamma Lupi"],
    ["Gamma Lupi", "Eta Lupi"],
    ["Gamma Lupi", "Delta Lupi"],
    ["Delta Lupi", "Beta Lupi"],

    // ARA 
    ["Alpha Arae", "Beta Arae"],
    ["Beta Arae", "Gamma Arae"],
    ["Gamma Arae", "Zeta Arae"],
    ["Zeta Arae", "Alpha Arae"],

    // SAGITTARIUS 
    ["Ascella", "Tau Sagittarii"],
    ["Tau Sagittarii", "Nunki"],
    ["Nunki", "Phi Sagittarii"],
    ["Phi Sagittarii", "Kaus Borealis"],
    ["Kaus Borealis", "Kaus Meridionalis"],
    ["Kaus Meridionalis", "Kaus Australis"],
    ["Alnasl", "Kaus Australis"],
    ["Kaus Meridionalis", "Alnasl"],
    ["Eta Sagittarii", "Kaus Australis"],
    ["Kaus Australis", "Ascella"],
    ["Nunki", "Albaldah"],
    ["Nunki", "Ascella"],
    ["Albaldah", "Xi² Sagittarii"],

    // AQUILA
    ["Altair", "Tarazed"],
    ["Delta Aquilae", "Altair"],
    ["Delta Aquilae", "Deneb el Okab"],
    ["Theta Aquilae", "Delta Aquilae"],
    ["Theta Aquilae", "Althalimain"],

    // HERCULES
    ["Pi Herculis", "Eta Herculis"],
    ["Eta Herculis", "Zeta Herculis"],
    ["Zeta Herculis", "Sarin"],
    ["Sarin", "Pi Herculis"],
    ["Sarin", "Rasalgethi"],
    ["Kornephoros", "Rasalgethi"],
    ["Sarin", "Mu Herculis"],
    ["Zeta Herculis", "Kornephoros"],

    // Ophiuchus & Serpens (Cauda and Caput)
    ["Rasalhague", "Cebalrai"],
    ["Rasalhague", "Rasalgethi"],
    ["Cebalrai", "Nu Ophiuchi"],
    ["Yed Prior", "Yed Posterior"],
    ["Yed Posterior", "Han"],
    ["Han", "Sabik"],
    ["Sabik", "Xi Serpentis"],
    ["Xi Serpentis", "Nu Ophiuchi"],
    ["Kappa Ophiuchi", "Rasalgethi"],
    ["Yed Prior", "Kappa Ophiuchi"],
    ["Yed Prior", "Mu Serpentis"],
    ["Mu Serpentis", "Unukalhai"],
    ["Nu Ophiuchi", "Eta Serpentis"],

    // PEGASUS
    ["Markab", "Scheat"],
    ["Scheat", "Alpheratz"],
    ["Scheat", "Matar"],
    ["Alpheratz", "Algenib"],
    ["Algenib", "Markab"],
    ["Markab", "Homam"],
    ["Homam", "Baham"],
    ["Baham", "Enif"],

    // ANDROMEDA
    ["Mirach", "Almach"],
    ["Mirach", "Delta Andromedae"],
    ["Delta Andromedae", "Alpheratz"],

    // PERSEUS
    ["Mirfak", "Algol"],
    ["Algol", "Rho Persei"],
    ["Mirfak", "Delta Persei"],
    ["Delta Persei", "Epsilon Persei"],
    ["Epsilon Persei", "Zeta Persei"],
    ["Mirfak", "Gamma Persei"],

    // TAURUS
    ["Aldebaran", "Ain"],
    ["Ain", "Alcyone"],
    ["Aldebaran", "Alheka"],
    ["Elnath", "Aldebaran"],

    // LEO
    ["Regulus", "Chort"],
    ["Chort", "Denebola"],
    ["Denebola", "Zosma"],
    ["Zosma", "Chort"],
    ["Zosma", "Algieba"],
    ["Adhafera", "Algieba"],
    ["Adhafera", "Ras Elased Australis"],
    ["Algieba", "Regulus"],

    // VIRGO
    ["Spica", "Porrima"],
    ["Heze", "Spica"],
    ["Porrima", "Auva"],
    ["Vindemiatrix", "Auva"],

    // HYDRA
    ["Pi Hydrae", "Gamma Hydrae"],
    ["Gamma Hydrae", "Xi Hydrae"],
    ["Xi Hydrae", "Nu Hydrae"],
    ["Nu Hydrae", "Alphard"],
    ["Alphard", "Zeta Hydrae"],
    ["Zeta Hydrae", "Epsilon Hydrae"],

    // BOOTES
    ["Arcturus", "Muphrid"],
    ["Arcturus", "Izar"],
    ["Izar", "Delta Bootis"],
    ["Delta Bootis", "Nekkar"],
    ["Nekkar", "Seginus"],
    ["Arcturus", "Seginus"],

    // CANIS MAJOR
    ["Sirius", "Mirzam"],
    ["Sirius", "Omicron² Canis Majoris"],
    ["Omicron² Canis Majoris", "Wezen"],
    ["Wezen", "Aludra"],
    ["Sigma Canis Majoris", "Wezen"],
    ["Sigma Canis Majoris", "Adhara"],
    ["Adhara", "Kappa Canis Majoris"],
    ["Adhara", "Phurad"],

    // CANIS MINOR
    ["Procyon", "Gomeisa"],

    // AURIGA
    ["Capella", "Menkalinan"],
    ["Menkalinan", "Theta Aurigae"],
    ["Theta Aurigae", "Elnath"],
    ["Hassaleh", "Elnath"],
    ["Hassaleh", "Capella"],

    // GEMINI
    ["Castor", "Pollux"],
    ["Pollux", "Wasat"],
    ["Wasat", "Alhena"],
    ["Mebsuta", "Tejat"],
    ["Castor", "Mebsuta"],
    ["Alzirr", "Alhena"],
    ["Propus", "Tejat"],

    // LYRA
    ["Vega", "Sulaphat"],
    ["Sulaphat", "Sheliak"],
    ["Sheliak", "Vega"],
    ["Sulaphat", "Zeta Lyrae"],
    ["Zeta Lyrae", "Delta Lyrae"],
    ["Delta Lyrae", "Vega"],

    // ERIDANUS
    ["Achernar", "Acamar"],
    ["Acamar", "Zaurak"],
    ["Zaurak", "Rana"],
    ["Rana", "Kursa"],

    // PHOENIX
    ["Ankaa", "Beta Phoenicis"],
    ["Beta Phoenicis", "Gamma Phoenicis"],

    // TUCANA
    ["Alpha Tucanae", "Gamma Tucanae"],
    ["Gamma Tucanae", "Zeta Tucanae"],

    // GRUS
    ["Alnair", "Beta Gruis"],
    ["Beta Gruis", "Gamma Gruis"],
    ["Gamma Gruis", "Alnair"],

    // MUSCA
    ["Alpha Muscae", "Beta Muscae"],

    // COLUMBA
    ["Phact", "Wazn"],

    // TRIANGULUM AUSTRALE
    ["Atria", "Beta Trianguli Australis"],
    ["Beta Trianguli Australis", "Gamma Trianguli Australis"],
    ["Gamma Trianguli Australis", "Atria"],
  ];

  async function runPlanner() {

  const modalOverlay = document.getElementById("planner-modal-overlay");
  const modalContent = document.getElementById("planner-modal-content");

  if (!modalOverlay || !modalContent) {
    console.warn("Planner modal elements missing");
    return;
  }

  const dateStr = document.getElementById("planner-date").value;
  const timeStr = document.getElementById("planner-time").value;
  const lat = parseFloat(document.getElementById("planner-lat").value);
  const lon = parseFloat(document.getElementById("planner-lon").value);

  if (!dateStr || !timeStr || isNaN(lat) || isNaN(lon)) {
    alert("Please enter date, time, latitude, and longitude.");
    return;
  }

  const dt = new Date(`${dateStr}T${timeStr}:00`);

  // Load objects + planets
  const objects = await loadObjects();
  const planets = computeAllPlanets(dt).map(p => ({
    id: p.id,
    name: p.name,
    type: "Planet",
    mag: p.mag,
    ra_h: p.raHours,
    dec_deg: p.decDeg
  }));

  const objectsNoPlanets = objects.filter(o => (o.type || "").toLowerCase() !== "planet");

  const objMap = new Map();
  objectsNoPlanets.forEach(o => objMap.set(o.id.toLowerCase(), { ...o }));
  planets.forEach(p => {
    const key = p.id.toLowerCase();
    objMap.set(key, { ...(objMap.get(key) || {}), ...p });
  });

  const allObjects = Array.from(objMap.values());

  // Compute ephemeris + score
  const resultsRaw = allObjects.map(obj => {
    const eph = computeEphemerisForNight(lat, lon, dt, {
      ra: Number(obj.ra_h),
      dec: Number(obj.dec_deg)
    });
    const score = visibilityScore(eph, obj.mag, dt);
    return { ...obj, ...eph, score };
  });

  const results = resultsRaw
  .filter(r => r.altAtObs >= 25 && r.score >= 30 && r.mag <= 10)
  .sort((a, b) => b.score - a.score);

window.lastPlannerResults = results;
window.lastPlannerLat = lat;
window.lastPlannerLon = lon;
window.lastPlannerDt = dt;
window.lastPlannerDateStr = dateStr;
window.lastPlannerTimeStr = timeStr;
    
modalOverlay.style.display = "flex";

  const canvas = document.getElementById("planner-star-map");
  drawAzimuthalStarMap(canvas, lat, lon, dt);
}

// ------------------------------------------------------------
// VISIBILITY SCORE
// ------------------------------------------------------------
function visibilityScore(eph, magInput, observationDate, obj, moon) {
  if (!eph || !isFinite(eph.maxAlt) || eph.maxAlt < 10) return 0;

  let mag = Number(magInput);
  if (!isFinite(mag)) mag = 99;
  mag = parseFloat(mag.toFixed(1));

  const magNorm = Math.max(0, Math.min(1, (6 - mag) / 6));
  const altNorm = Math.max(0, Math.min(1, eph.altAtObs / 90));

  let transitNorm = 0;
  if (eph.transit) {
    const obsH = observationDate.getHours() + observationDate.getMinutes() / 60;
    const trH = eph.transit.getHours() + eph.transit.getMinutes() / 60;
    let diff = Math.abs(obsH - trH);
    if (diff > 12) diff = 24 - diff;
    transitNorm = Math.max(0, 1 - diff / 6);
  }

  let score = altNorm * 50 + magNorm * 30 + transitNorm * 20;

  // ------------------------------------------------------------
  // ⭐ MOON PROXIMITY + ILLUMINATION PENALTY (DSOs only)
  // ------------------------------------------------------------
  if (obj && obj.type && obj.type !== "Planet" && moon) {

    // Require RA/Dec for both object and Moon
    if (isFinite(obj.ra_h) && isFinite(obj.dec_deg) &&
        isFinite(moon.raHours) && isFinite(moon.decDeg)) {

      const sep = angularSeparation(
        obj.ra_h, obj.dec_deg,
        moon.raHours, moon.decDeg
      );

      // proximity penalty (0–1)
      let prox = 0;
      if (sep < 5)       prox = 1.0;
      else if (sep < 10) prox = 0.6;
      else if (sep < 15) prox = 0.4;
      else if (sep < 25) prox = 0.2;

      // illumination penalty (0.1–1.0)
      const illum = Math.max(0, Math.min(1, moon.illumination || 0));
      const illumFactor = 0.1 + 0.9 * illum;

      const finalPenalty = prox * illumFactor;

      score *= (1 - finalPenalty);
    }
  }

  score = Math.min(100, score);
  if (score < 20) score = 20;

  return score;
}

// ------------------------------------------------------------
// EPHEMERIS ENGINE
// ------------------------------------------------------------
function sampleTimes(start, end, stepMinutes) {
  const out = [];
  let t = new Date(start);
  while (t <= end) {
    out.push(new Date(t));
    t = new Date(t.getTime() + stepMinutes * 60000);
  }
  return out;
}

function localSiderealTime(jd, lonRad) {
  const T = (jd - 2451545.0) / 36525.0;
  let GMST =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000;
  GMST = (GMST % 360 + 360) % 360;
  return deg2rad(GMST) + lonRad;
}

function altitudeAtTime(date, latRad, lonRad, raRad, decRad) {
  const jd = toJulianDate(date);
  const lst = localSiderealTime(jd, lonRad);
  const ha = normalizeAngle(lst - raRad);
  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(ha);
  return rad2deg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));
}

function refineCrossing(t1, t2, latRad, lonRad, raRad, decRad, targetAltDeg) {
  let a = new Date(t1);
  let b = new Date(t2);
  for (let i = 0; i < 12; i++) {
    const mid = new Date((a.getTime() + b.getTime()) / 2);
    const alt = altitudeAtTime(mid, latRad, lonRad, raRad, decRad);
    if (alt > targetAltDeg) b = mid;
    else a = mid;
  }
  return new Date((a.getTime() + b.getTime()) / 2);
}

function computeEphemerisForNight(lat, lon, dt, target) {
  const start = new Date(dt);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const samples = sampleTimes(start, end, 5);
  const latRad = deg2rad(lat);
  const lonRad = deg2rad(lon);
  const raRad = deg2rad(target.ra * 15);
  const decRad = deg2rad(target.dec);

  let maxAlt = -90;
  let maxAltTime = null;
  let riseTime = null;
  let setTime = null;
  let prevAlt = null;
  let prevTime = null;

  for (const t of samples) {
    const alt = altitudeAtTime(t, latRad, lonRad, raRad, decRad);
    if (alt > maxAlt) {
      maxAlt = alt;
      maxAltTime = t;
    }
    if (prevAlt !== null) {
      if (prevAlt < 0 && alt >= 0 && !riseTime)
        riseTime = refineCrossing(prevTime, t, latRad, lonRad, raRad, decRad, 0);
      if (prevAlt >= 0 && alt < 0 && !setTime)
        setTime = refineCrossing(prevTime, t, latRad, lonRad, raRad, decRad, 0);
    }
    prevAlt = alt;
    prevTime = t;
  }

  const altAtObs = altitudeAtTime(dt, latRad, lonRad, raRad, decRad);

  return {
    rise: riseTime,
    set: setTime,
    transit: maxAltTime,
    maxAlt,
    altAtObs
  };
}

// ------------------------------------------------------------
// STAR MAP
// ------------------------------------------------------------
function drawAzimuthalStarMap(canvas, latDeg, lonDeg, date) {
  if (!canvas) return;

  // Clamp latitude at poles
  if (latDeg > 89.9) latDeg = 89.9;
  if (latDeg < -89.9) latDeg = -89.9;

  const dpr = window.devicePixelRatio || 1;
  const cssSize = canvas.clientWidth || 400;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const size = cssSize;
  const w = size;
  const h = size;
  const cx = w / 2;
  const cy = h / 2;
  const padding = 40;
  const radius = size / 2 - padding;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Horizon circle
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Cardinal directions
  const cardinals = [
    { label: "N", azDeg: 0 },
    { label: "E", azDeg: 90 },
    { label: "S", azDeg: 180 },
    { label: "W", azDeg: 270 },
  ];

  ctx.fillStyle = "#000000";
  ctx.font = `${Math.round(radius * 0.05)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  cardinals.forEach((c) => {
    const azRad = deg2rad(c.azDeg);
    const r = radius + 18;
    const x = cx + -r * Math.sin(azRad);
    const y = cy + -r * Math.cos(azRad);
    ctx.fillText(c.label, x, y);
  });

  const latRad = deg2rad(latDeg);
  const lonRad = deg2rad(lonDeg);
  const jd = toJulianDate(date);
  const lst = localSiderealTime(jd, lonRad);

  const stars = decodeStarCatalog();
  const projectedStars = [];

  // --- Project stars ---
  stars.forEach((star) => {
    const raRad = deg2rad(star.ra * 15);
    const decRad = deg2rad(star.dec);
    const ha = normalizeAngle(lst - raRad);

    const sinAlt =
      Math.sin(latRad) * Math.sin(decRad) +
      Math.cos(latRad) * Math.cos(decRad) * Math.cos(ha);
    const alt = Math.asin(sinAlt);
    const altDeg = rad2deg(alt);

    const cosAz =
      (Math.sin(decRad) - Math.sin(alt) * Math.sin(latRad)) /
      (Math.cos(alt) * Math.cos(latRad));

    let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (Math.sin(ha) > 0) az = 2 * Math.PI - az;

    // Projection
    const r = radius * (90 - altDeg) / 90;
    const x = cx + -r * Math.sin(az);
    const y = cy + -r * Math.cos(az);

    projectedStars.push({
      id: star.id,
      x,
      y,
      mag: star.mag,
      altDeg,
    });
  });

  // --- Planets ---
  const planets = computeAllPlanets(date);
  planets.forEach((p) => {
    const raRad = deg2rad(p.raHours * 15);
    const decRad = deg2rad(p.decDeg);
    const ha = normalizeAngle(lst - raRad);

    const sinAlt =
      Math.sin(latRad) * Math.sin(decRad) +
      Math.cos(latRad) * Math.cos(decRad) * Math.cos(ha);
    const alt = Math.asin(sinAlt);
    const altDeg = rad2deg(alt);

    const cosAz =
      (Math.sin(decRad) - Math.sin(alt) * Math.sin(latRad)) /
      (Math.cos(alt) * Math.cos(latRad));
    let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (Math.sin(ha) > 0) az = 2 * Math.PI - az;

    const r = radius * (90 - altDeg) / 90;
    const x = cx + -r * Math.sin(az);
    const y = cy + -r * Math.cos(az);

    projectedStars.push({
      id: p.id,
      x,
      y,
      mag: p.mag,
      altDeg,
      isPlanet: true,
    });
  });

  // --- Constellation lines ---
  ctx.strokeStyle = "#888888";
  ctx.lineWidth = 1;

  function clipLineToCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;

    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;

    const s = Math.sqrt(disc);
    const t1 = (-b - s) / (2 * a);
    const t2 = (-b + s) / (2 * a);

    let t = null;
    if (t1 >= 0 && t1 <= 1) t = t1;
    else if (t2 >= 0 && t2 <= 1) t = t2;
    else return null;

    return { x: x1 + t * dx, y: y1 + t * dy };
  }

  CONST_LINES.forEach((pair) => {
    const a = projectedStars.find((s) => s.id === pair[0]);
    const b = projectedStars.find((s) => s.id === pair[1]);
    if (!a || !b) return;

    const da = Math.hypot(a.x - cx, a.y - cy);
    const db = Math.hypot(b.x - cx, b.y - cy);
    const aInside = da <= radius;
    const bInside = db <= radius;

    if (aInside && bInside) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }

    if (aInside && !bInside) {
      const p = clipLineToCircle(a.x, a.y, b.x, b.y, cx, cy, radius);
      if (p) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      return;
    }
    
    if (!aInside && bInside) {
      const p = clipLineToCircle(b.x, b.y, a.x, a.y, cx, cy, radius);
      if (p) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      return;
    }
  });
  
// --- Stars & Planets ---
const scale = canvas.width / 1050; // 1050px = 3.5 inches @ 300 DPI

projectedStars.forEach((s) => {
  if (s.altDeg <= 0) return;

  // --- MOON ---
if (s.isMoon) {
  const moonR = 10 * scale;

  // Draw full dark disk
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(s.x, s.y, moonR, 0, Math.PI * 2);
  ctx.fill();

  const sun = computeSun(date); 
  const sunRA = deg2rad(sun.raHours * 15);
  const sunDec = deg2rad(sun.decDeg);

  const moonRA = deg2rad(s.raHours * 15);
  const moonDec = deg2rad(s.decDeg);

  const angleToSun = Math.atan2(
    Math.cos(moonDec) * Math.sin(sunRA - moonRA),
    Math.sin(sunDec) * Math.cos(moonDec) -
    Math.cos(sunDec) * Math.sin(moonDec) * Math.cos(sunRA - moonRA)
  );

  const k = s.illumination;      // 0=new, 1=full
  const phase = 2 * k - 1;       // -1=new → +1=full

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angleToSun);        // orient crescent toward Sun
  ctx.translate(-s.x, -s.y);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();

  if (phase >= 0) {
    ctx.ellipse(s.x, s.y, moonR * phase, moonR, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(s.x, s.y, moonR * -phase, moonR, 0, Math.PI, Math.PI * 3);
  }

  ctx.fill();
  ctx.restore();
  return;
}

  
  // PLANETS
  if (s.isPlanet) {
    ctx.fillStyle = "#000000";

    const planetPx = (12 - s.mag * 0.8) * scale;
    const finalSize = Math.max(8 * scale, planetPx);

    ctx.font = finalSize + "px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✦", s.x, s.y);
    return;
  }

  // STARS
  const starPx = (2.2 - s.mag * 0.25) * scale;
  const size = Math.max(0.4 * scale, starPx);

  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
  ctx.fill();
});
}

// ------------------------------------------------------------
// PLANETARY + MOON EPHEMERIS (Meeus-style, unified)
// ------------------------------------------------------------
const planetElements = {
  Mercury: { a: 0.387098, e: 0.205635, i: 7.005,   L: 252.250, Ldot: 149472.674, w: 77.457,  o: 48.330 },
  Venus:   { a: 0.723330, e: 0.006773, i: 3.394,   L: 181.979, Ldot: 58517.815,  w: 131.602, o: 76.680 },
  Earth:   { a: 1.000000, e: 0.016709, i: 0.000,   L: 100.464, Ldot: 35999.373,  w: 102.937, o: 0.000 },
  Mars:    { a: 1.523679, e: 0.093400, i: 1.850,   L: -4.553,  Ldot: 19140.303,  w: -23.943, o: 49.558 },
  Jupiter: { a: 5.20260,  e: 0.048498, i: 1.303,   L: 34.396,  Ldot: 3034.906,   w: 14.728,  o: 100.473 },
  Saturn:  { a: 9.55491,  e: 0.055508, i: 2.489,   L: 49.954,  Ldot: 1222.114,   w: 92.598,  o: 113.662 },
  Uranus:  { a: 19.2184,  e: 0.046295, i: 0.773,   L: 313.238, Ldot: 428.379,    w: 170.954, o: 74.016 },
  Neptune: { a: 30.1104,  e: 0.008988, i: 1.770,   L: -55.120, Ldot: 218.461,    w: 44.964,  o: 131.784 }
};

function d2r(d) { return d * Math.PI / 180; }
function r2d(r) { return r * 180 / Math.PI; }

function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 8; i++) {
    E = M + e * Math.sin(E);
  }
  return E;
}

function heliocentricPosition(planet, jd) {
  const T = (jd - 2451545.0) / 36525;
  const el = planetElements[planet];

  const a = el.a;
  const e = el.e;
  const i = d2r(el.i);

  const L = el.L + el.Ldot * T;      // mean longitude (deg)
  const wBar = el.w;                 // longitude of perihelion ϖ (deg)
  const O = el.o;                    // longitude of ascending node Ω (deg)

  const M = d2r((L - wBar) % 360);   // mean anomaly (rad)
  const E = solveKepler(M, e);

  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const v = Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);

  const O_rad = d2r(O);
  const w_arg = d2r(wBar - O);       // argument of perihelion ω = ϖ − Ω
  const u = v + w_arg;

  const xh = r * (Math.cos(O_rad) * Math.cos(u) - Math.sin(O_rad) * Math.sin(u) * Math.cos(i));
  const yh = r * (Math.sin(O_rad) * Math.cos(u) + Math.cos(O_rad) * Math.sin(u) * Math.cos(i));
  const zh = r * (Math.sin(u) * Math.sin(i));

  return { xh, yh, zh, r };
}

function eclipticToEquatorial(xe, ye, ze) {
  const eps = d2r(23.439291); // J2000 obliquity
  const x = xe;
  const y = ye * Math.cos(eps) - ze * Math.sin(eps);
  const z = ye * Math.sin(eps) + ze * Math.cos(eps);

  let ra = Math.atan2(y, x);
  if (ra < 0) ra += 2 * Math.PI;

  const dec = Math.atan2(z, Math.sqrt(x * x + y * y));

  return { raHours: r2d(ra) / 15, decDeg: r2d(dec) };
}

function getPlanetPositionEquatorial(planetId, jd) {
  const earth = heliocentricPosition("Earth", jd);
  const p = heliocentricPosition(planetId, jd);

  const xe = p.xh - earth.xh;
  const ye = p.yh - earth.yh;
  const ze = p.zh - earth.zh;

  const delta = Math.sqrt(xe * xe + ye * ye + ze * ze);
  const r = p.r;

  const eq = eclipticToEquatorial(xe, ye, ze);

  const cosAlpha = (r * r + delta * delta - earth.r * earth.r) / (2 * r * delta);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));

  return {
    raHours: eq.raHours,
    decDeg: eq.decDeg,
    rAu: r,
    deltaAu: delta,
    phaseDeg: r2d(alpha)
  };
}

function computePlanetMagnitude(planetId, r, delta, alpha) {
  switch (planetId) {
    case "Mercury":
      return 5 * Math.log10(r * delta) + 0.02 * alpha - 0.000007 * alpha * alpha + 0.00000003 * alpha * alpha * alpha;
    case "Venus":
      return 5 * Math.log10(r * delta) - 4.384 - 0.0009 * alpha + 0.000239 * alpha * alpha - 0.00000065 * alpha * alpha * alpha;
    case "Mars":
      return 5 * Math.log10(r * delta) - 1.52 + 0.016 * alpha;
    case "Jupiter":
      return 5 * Math.log10(r * delta) - 9.40 + 0.005 * alpha;
    case "Saturn":
      return 5 * Math.log10(r * delta) - 8.88 + 0.044 * alpha;
    case "Uranus":
      return 5 * Math.log10(r * delta) - 7.19;
    case "Neptune":
      return 5 * Math.log10(r * delta) - 6.87;
    default:
      return 99;
  }
}

function computePlanetEphemeris(planetId, date) {
  const jd = toJulianDate(date);
  const pos = getPlanetPositionEquatorial(planetId, jd);
  const mag = computePlanetMagnitude(planetId, pos.rAu, pos.deltaAu, pos.phaseDeg);

  return {
    id: planetId,
    name: planetId,
    raHours: pos.raHours,
    decDeg: pos.decDeg,
    mag: parseFloat(mag.toFixed(1))
  };
}

function computeAllPlanets(date) {
  const ids = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
  return ids.map(id => computePlanetEphemeris(id, date));
}

// ------------------------------------------------------------
// MOON (Meeus-style, RA/Dec + phase only)
// ------------------------------------------------------------
function computeMoon(dt) {
  const jd = toJulianDate(dt);
  const T = (jd - 2451545.0) / 36525;

  const L1 = d2r(218.3164477 + 481267.88123421 * T);
  const M  = d2r(357.5291092 + 35999.0502909 * T);
  const M1 = d2r(134.9633964 + 477198.8675055 * T);
  const D  = d2r(297.8501921 + 445267.1114034 * T);
  const F  = d2r(93.2720950 + 483202.0175233 * T);

  const lon = L1
    + d2r(6.289 * Math.sin(M1))
    + d2r(1.274 * Math.sin(2 * D - M1))
    + d2r(0.658 * Math.sin(2 * D))
    + d2r(0.214 * Math.sin(2 * M1))
    + d2r(0.110 * Math.sin(D));

  const lat = d2r(5.128 * Math.sin(F))
    + d2r(0.280 * Math.sin(M1 + F))
    + d2r(0.277 * Math.sin(M1 - F))
    + d2r(0.173 * Math.sin(2 * D - F));

  const eps = d2r(23.439291 - 0.0130042 * T);

  const sinDec = Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon);
  const dec = Math.asin(sinDec);

  const y = Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps);
  const x = Math.cos(lon);
  let ra = Math.atan2(y, x);
  if (ra < 0) ra += 2 * Math.PI;

  const raHours = r2d(ra) / 15;
  const decDeg = r2d(dec);

  const phaseAngle =
    180 -
    r2d(D) -
    6.289 * Math.sin(M1) +
    2.1 * Math.sin(M) -
    1.274 * Math.sin(2 * D - M1);

  const illumination = (1 + Math.cos(d2r(phaseAngle))) / 2;

  let phaseName = "New Moon";
  if (illumination > 0.03 && illumination <= 0.25) phaseName = "Waxing Crescent";
  else if (illumination > 0.25 && illumination <= 0.48) phaseName = "First Quarter";
  else if (illumination > 0.48 && illumination <= 0.97) phaseName = "Waxing Gibbous";
  else if (illumination > 0.97) phaseName = "Full Moon";

  return {
    raHours,
    decDeg,
    illumination,
    phaseName
  };
}


// ------------------------------------------------------------
// Formatting helpers
// ------------------------------------------------------------
function formatRA(hours) {
  if (!isFinite(hours)) return "—";
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatDec(deg) {
  if (!isFinite(deg)) return "—";
  const sign = deg >= 0 ? "+" : "−";
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  return `${sign}${d}° ${m.toString().padStart(2, "0")}′`;
}

function computeRiseSet(latDeg, decDeg, raHours, date) {
  const latRad = deg2rad(latDeg);
  const decRad = deg2rad(decDeg);

  const cosH = (Math.cos(deg2rad(90.833)) - Math.sin(latRad)*Math.sin(decRad)) /
               (Math.cos(latRad)*Math.cos(decRad));

  if (cosH < -1) return { rise: "Always Up", set: "Always Up" };
  if (cosH > 1)  return { rise: "Never Rises", set: "Never Rises" };

  const H = rad2deg(Math.acos(cosH)) / 15;

  const lst0 = localSiderealTime(toJulianDate(date), 0);
  const gmst = lst0 / 15;

  const riseLST = raHours - H;
  const setLST  = raHours + H;

  const rise = new Date(date.getTime() + (riseLST - gmst) * 3600000);
  const set  = new Date(date.getTime() + (setLST - gmst) * 3600000);

  return {
    rise: rise.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}),
    set:  set.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})
  };
}

// RUN PLANNER
async function runPlanner() {
  const modalOverlay = document.getElementById("planner-modal-overlay");
  const modalContent = document.getElementById("planner-modal-content");
  if (!modalOverlay || !modalContent) {
    console.warn("Planner modal elements missing");
    return;
  }

  const dateStr = document.getElementById("planner-date").value;
  const timeStr = document.getElementById("planner-time").value;
  const lat = parseFloat(document.getElementById("planner-lat").value);
  const lon = parseFloat(document.getElementById("planner-lon").value);
  if (!dateStr || !timeStr || isNaN(lat) || isNaN(lon)) {
    alert("Please enter date, time, latitude, and longitude.");
    return;
  }

  const dt = new Date(`${dateStr}T${timeStr}:00`);
  const objects = await loadObjects();
  const planets = computeAllPlanets(dt).map(p => ({
    id: p.id, name: p.name, type: "Planet", mag: p.mag, ra_h: p.raHours, dec_deg: p.decDeg
  }));
  const objectsNoPlanets = objects.filter(o => (o.type || "").toLowerCase() !== "planet");
  const objMap = new Map();
  objectsNoPlanets.forEach(o => objMap.set(o.id.toLowerCase(), { ...o }));
  planets.forEach(p => objMap.set(p.id.toLowerCase(), { ...(objMap.get(p.id.toLowerCase()) || {}), ...p }));
  const allObjects = Array.from(objMap.values());

  const resultsRaw = allObjects.map(obj => {
    const eph = computeEphemerisForNight(lat, lon, dt, { ra: Number(obj.ra_h), dec: Number(obj.dec_deg) });
    const score = visibilityScore(eph, obj.mag, dt);
    return { ...obj, ...eph, score };
  });

  const results = resultsRaw
    .filter(r => r.altAtObs >= 25 && r.score >= 30 && r.mag <= 9.5)
    .sort((a, b) => b.score - a.score);

  window.lastPlannerResults = results;
  window.lastPlannerLat = lat;
  window.lastPlannerLon = lon;
  window.lastPlannerDt = dt;
  window.lastPlannerDateStr = dateStr;
  window.lastPlannerTimeStr = timeStr;

  modalContent.innerHTML = `
<div style="display:flex;flex-direction:row;width:100%;height:100%;gap:20px;">
  <div style="flex:1;display:flex;flex-direction:column;gap:20px;">
    <div style="background:#f5f5f5;border:1px solid #ccc;border-radius:12px;padding:12px;height:180px;">
      <h3 style="margin-top:0;">Observation Details – Zenith Sky</h3>
      <p>Date: ${dateStr}</p>
      <p>Time: ${timeStr}</p>
      <p>Latitude: ${lat}</p>
      <p>Longitude: ${lon}</p>
    </div>

    <div style="background:#ffffff;border-radius:12px;padding:10px;flex:1;display:flex;align-items:center;justify-content:center;border:1px solid #ccc;">
      <canvas id="planner-star-map" style="width:100%;height:100%;border-radius:8px;"></canvas>
    </div>
  </div>

  <div style="flex:1;background:#f5f5f5;border:1px solid #ccc;border-radius:12px;padding:12px;overflow:auto;">
    <h3 style="margin-top:0;">Visible Objects</h3>
    <table border="1" cellspacing="0" cellpadding="6" style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr>
        <th>Object</th><th>Type</th><th>Mag</th><th>RA</th><th>Dec</th><th>Transit</th><th>Alt</th><th>Score</th>
      </tr>
      ${results.map(r => `
        <tr>
          <td>${r.type === "Planet" ? r.name : (r.name && r.name !== r.id ? `${r.id} — ${r.name}` : r.id)}</td>
          <td>${safeText(r.type)}</td>
          <td>${safeText(r.mag)}</td>
          <td>${formatRA(r.ra_h)}</td>
          <td>${formatDec(r.dec_deg)}</td>
          <td>${r.transit ? r.transit.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false}) : "Never"}</td>
          <td>${r.altAtObs ? r.altAtObs.toFixed(1) + "°" : "N/A"}</td>
          <td>${r.score ? r.score.toFixed(0) : "—"}</td>
        </tr>`).join("")}
    </table>
  </div>
</div>
`;

  modalOverlay.style.display = "flex";

  drawOnScreenMap(lat, lon, dt);
}

function prepareCanvasForDrawing(canvas, cssWidth, cssHeight) {
  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = cssWidth + "px";
  canvas.style.height = cssHeight + "px";

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels

  return ctx;
}

function drawOnScreenMap(lat, lon, dt) {
  const canvas = document.getElementById("planner-star-map");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(200, Math.floor(rect.width));
  const cssH = Math.max(200, Math.floor(rect.height));

  prepareCanvasForDrawing(canvas, cssW, cssH);

  drawAzimuthalStarMap(canvas, lat, lon, dt);
}

function renderMapImageForPrint(lat, lon, dt) {
  const inches = 3.5;
  const dpi = 300;
  const px = Math.round(inches * dpi);   // 1050 px

  const off = document.createElement("canvas");
  off.width = px;
  off.height = px;

  drawAzimuthalStarMap(off, lat, lon, dt);

  const img = document.createElement("img");
  img.src = off.toDataURL("image/png");
  img.className = "planner-pdf-map";

  img.style.width = "100%";
  img.style.height = "auto";
  img.style.display = "block";

  return img;
}

async function buildPlannerPdfContent(results, lat, lon, dt, dateStr, timeStr) {
  const root = document.getElementById("planner-pdf-root");
  if (!root) return;
  root.innerHTML = "";

  const PAGE_HEIGHT = 1056;
  const ROW_HEIGHT = 22;

  function createPage() {
    const page = document.createElement("div");
    page.className = "planner-pdf-page";

    const left = document.createElement("div");
    left.className = "planner-pdf-left";

    const right = document.createElement("div");
    right.className = "planner-pdf-right";

    page.appendChild(left);
    page.appendChild(right);
    return { page, left, right };
  }

 function buildDetails(moon, moonRS) {
  const d = document.createElement("div");
  d.className = "planner-pdf-details";

  d.innerHTML = `
    <h3 style="font-size:12pt; margin:0 0 4px 0; line-height:1.1;">
      Observation Details – Zenith Sky
    </h3>

    <p>Date: ${dateStr}</p>
    <p>Time: ${timeStr}</p>
    <p>Latitude: ${lat}</p>
    <p>Longitude: ${lon}</p>

    <h4 style="margin:8px 0 2px 0;">Moon</h4>
    <p>Phase: ${moon.phaseName} (${Math.round(moon.illumination * 100)}%)</p>
    <p>Altitude: ${moon.altDeg.toFixed(1)}°</p>
    <p>RA: ${formatRA(moon.raHours)}</p>
    <p>Dec: ${formatDec(moon.decDeg)}</p>
    <p>Rise: ${moonRS.rise}</p>
    <p>Set: ${moonRS.set}</p>
  `;

  return d;
}

  function buildTableRows(rows) {
    const table = document.createElement("table");
    table.className = "planner-pdf-table-inner";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Object</th><th>Type</th><th>Mag</th><th>RA</th><th>Dec</th>
          <th>Transit</th><th>Alt</th><th>Score</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.name || r.id}</td>
        <td>${r.type || ""}</td>
        <td>${r.mag}</td>
        <td>${formatRA(r.ra_h)}</td>
        <td>${formatDec(r.dec_deg)}</td>
        <td>${r.transit ? r.transit.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",hour12:false}) : "—"}</td>
        <td>${r.altAtObs ? r.altAtObs.toFixed(1) + "°" : "—"}</td>
        <td>${r.score ? r.score.toFixed(0) : "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    return table;
  }

  const rowsPerPage = Math.max(1, Math.floor((PAGE_HEIGHT - 160) / ROW_HEIGHT));
  let index = 0;

  const { page: firstPage, left: firstLeft, right: firstRight } = createPage();
  const moon = computeMoon(dt);

const latRad = deg2rad(lat);
const lonRad = deg2rad(lon);
const jd = toJulianDate(dt);
const lst = localSiderealTime(jd, lonRad);
const raRad = deg2rad(moon.raHours * 15);
const decRad = deg2rad(moon.decDeg);
const ha = normalizeAngle(lst - raRad);
const sinAlt =
  Math.sin(latRad) * Math.sin(decRad) +
  Math.cos(latRad) * Math.cos(decRad) * Math.cos(ha);
moon.altDeg = rad2deg(Math.asin(sinAlt));
const moonRS = computeRiseSet(lat, moon.decDeg, moon.raHours, dt);

firstLeft.appendChild(buildDetails(moon, moonRS));

  firstLeft.appendChild(renderMapImageForPrint(lat, lon, dt));

  const firstRows = results.slice(0, rowsPerPage);
  const firstTableContainer = document.createElement("div");
  firstTableContainer.className = "planner-pdf-table";
  firstTableContainer.appendChild(buildTableRows(firstRows));
  firstRight.appendChild(firstTableContainer);

  root.appendChild(firstPage);
  index += rowsPerPage;

  while (index < results.length) {
    const { page, left, right } = createPage();
    left.innerHTML = "";

    const pageRows = results.slice(index, index + rowsPerPage);
    const tableContainer = document.createElement("div");
    tableContainer.className = "planner-pdf-table";
    tableContainer.appendChild(buildTableRows(pageRows));
    right.appendChild(tableContainer);

    root.appendChild(page);
    index += rowsPerPage;
  }
}

// ===============================
// openPlannerModalAndPrint
// ===============================
async function openPlannerModalAndPrint(win, lat, lon, dt, results, dateStr, timeStr) {

  drawOnScreenMap(lat, lon, dt);
  await buildPlannerPdfContent(results, lat, lon, dt, dateStr, timeStr);

  const root = document.getElementById("planner-pdf-root");
  if (!root) return;

  win.onload = async () => {

    win.document.body.innerHTML = "";

    const style = win.document.createElement("style");
    style.textContent = `
      @page { size: 8.5in 11in; margin: 0; }
      html, body { width: 8.5in; height: 11in; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

      .planner-pdf-page {
        width: 8.5in;
        min-height: 11in;
        page-break-after: always;
        box-sizing: border-box;
        display: flex;
        flex-direction: row;
      }

      .planner-pdf-left {
        width: 3.5in;
        padding: 0.25in;
        box-sizing: border-box;
      }

      .planner-pdf-right {
        width: 5in;
        padding: 0.25in;
        box-sizing: border-box;
        overflow: visible !important;
      }

      .planner-pdf-table {
        width: 100%;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 9pt;
        page-break-inside: auto;
      }

      thead { display: table-header-group; }
      tbody tr { page-break-inside: avoid; }

      th, td {
        padding: 4px 6px;
        border-bottom: 1px solid #ddd;
        text-align: left;
      }

      img {
        max-width: 100%;
        height: auto;
        display: block;
      }
    `;
    win.document.head.appendChild(style);

    const container = win.document.createElement("div");
    container.id = "planner-pdf-print-root";
    win.document.body.appendChild(container);

    const pages = root.querySelectorAll(".planner-pdf-page");
    pages.forEach(page => container.appendChild(page.cloneNode(true)));

    const imgs = Array.from(win.document.images || []);
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => { img.onload = img.onerror = res; });
    }));

    win.focus();
    win.print();
  };
}

// ===============================
// ATTACH PRINT BUTTON HANDLER
// ===============================
window.addEventListener("DOMContentLoaded", () => {
  const plannerPrintBtn = document.getElementById("planner-print");
  if (!plannerPrintBtn) return;

  plannerPrintBtn.addEventListener("click", async () => {

    const win = window.open("planner-print.html", "_blank");
    if (!win) {
      alert("Popup blocked — please allow popups for this site.");
      return;
    }

    const modalOverlay = document.getElementById("planner-modal-overlay");
    if (modalOverlay) modalOverlay.style.display = "flex";

    const results = window.lastPlannerResults || [];
    const lat = window.lastPlannerLat || 0;
    const lon = window.lastPlannerLon || 0;
    const dt = window.lastPlannerDt || new Date();
    const dateStr = window.lastPlannerDateStr || dt.toLocaleDateString();
    const timeStr = window.lastPlannerTimeStr || dt.toLocaleTimeString();

    await openPlannerModalAndPrint(win, lat, lon, dt, results, dateStr, timeStr);
  });
});

