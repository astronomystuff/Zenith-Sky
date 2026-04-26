document.addEventListener("DOMContentLoaded", () => {

  // ------------------------------------------------------------
  // DOM ELEMENTS
  // ------------------------------------------------------------
  const input = document.getElementById("woit-input");
  const btn = document.getElementById("woit-btn");
  const fileName = document.getElementById("woit-file-name");
  const previewContainer = document.getElementById("woit-preview-container");
  const preview = document.getElementById("woit-preview");
  const status = document.getElementById("woit-status");
  const result = document.getElementById("woit-result");
  const modal = document.getElementById("woit-modal");

  // Reset button
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  resetBtn.id = "woit-reset-btn";
  resetBtn.style.display = "none";
  resetBtn.style.marginTop = "10px";
  result.insertAdjacentElement("afterend", resetBtn);

  // ------------------------------------------------------------
  // MODAL OPEN/CLOSE
  // ------------------------------------------------------------
  document.addEventListener("click", (e) => {
    if (e.target.id === "woit-identify") {
      modal.style.display = "block";
    }
    if (e.target.id === "woit-close") {
      modal.style.display = "none";
    }
  });

  // ------------------------------------------------------------
  // FILE INPUT
  // ------------------------------------------------------------
  btn.addEventListener("click", () => input.click());

  resetBtn.addEventListener("click", () => {
    input.value = "";
    fileName.textContent = "";
    previewContainer.style.display = "none";
    preview.src = "";
    status.textContent = "";
    result.style.display = "none";
    result.innerHTML = "";
    resetBtn.style.display = "none";
  });

  input.addEventListener("change", async () => {
    if (!input.files.length) return;

    const file = input.files[0];
    fileName.textContent = file.name;

    const url = URL.createObjectURL(file);
    preview.src = url;
    previewContainer.style.display = "block";

    result.style.display = "none";
    resetBtn.style.display = "none";

    try {
      setStatus("Analyzing image…");

      const analysis = await analyzeImage(preview);

      setStatus(`Detected object type: ${analysis.type} (${(analysis.typeConfidence * 100).toFixed(1)}% confidence)`);

      if (analysis.type === "Not Astro") {
        showResult(analysis, null);
        resetBtn.style.display = "inline-block";
        return;
      }

      // Load unified catalog
      const catalog = await loadUnifiedCatalog();

      // Filter by detected type
      const filtered = catalog.filter(obj => obj.type === analysis.type);

      setStatus(`Matching against ${filtered.length} ${analysis.type} objects…`);

      const match = matchObject(analysis, filtered);

      setStatus("Identification complete.");
      showResult(analysis, match);
      resetBtn.style.display = "inline-block";

    } catch (err) {
      console.error(err);
      setStatus("Identification failed.");
      result.style.display = "block";
      result.innerHTML = `<strong>Error:</strong><br>${err.message || "Unknown error."}<br><br>`;
      resetBtn.style.display = "inline-block";
    }
  });

  function setStatus(msg) {
    status.textContent = msg;
  }

  // ------------------------------------------------------------
  // SHOW RESULT
  // ------------------------------------------------------------
  function showResult(analysis, match) {
    result.style.display = "block";

    if (analysis.type === "Not Astro") {
      result.innerHTML = `
        <strong>This does not appear to be an astronomical object.</strong><br><br>
        <em>Classifier confidence:</em> ${(analysis.typeConfidence * 100).toFixed(1)}%<br>
      `;
      return;
    }

    if (!match) {
      result.innerHTML = `
        <strong>No confident catalog match found.</strong><br><br>
        <em>Detected type:</em> ${analysis.type}<br>
        <em>Type confidence:</em> ${(analysis.typeConfidence * 100).toFixed(1)}%<br>
      `;
      return;
    }

    result.innerHTML = `
      <strong>Identified Object:</strong><br><br>
      <strong>${match.name}</strong> (${match.catalog})<br>
      ${match.type}<br>
      Mag ${match.mag}<br>
      Size ~${match.sizeDeg}°<br><br>

      <strong>Catalog match confidence:</strong> ${(match.score * 100).toFixed(1)}%<br>
      <strong>Type classifier confidence:</strong> ${(analysis.typeConfidence * 100).toFixed(1)}%<br><br>

      <em>Object type detected:</em> ${analysis.type}<br>
    `;
  }

  // ------------------------------------------------------------
  // IMAGE ANALYSIS
  // ------------------------------------------------------------
  async function analyzeImage(imgElement) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = imgElement.src;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const maxDim = 800;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const starDensity = estimateStarDensity(data);
        const nebulosity = estimateNebulosity(data);
        const colorTint = estimateColorTint(data);
        const edgeComplexity = estimateEdgeComplexity(data, canvas.width, canvas.height);
        const colorVariance = estimateColorVariance(data);
        const starRoundness = estimateStarRoundness(data, canvas.width, canvas.height);
        const entropy = estimateEntropy(data);
        const gradientSmoothness = estimateGradientSmoothness(data, canvas.width, canvas.height);

        const { type, confidence } = classifyObject({
          starDensity,
          nebulosity,
          colorTint,
          edgeComplexity,
          colorVariance,
          starRoundness,
          entropy,
          gradientSmoothness
        });

        resolve({
          width: canvas.width,
          height: canvas.height,
          starDensity,
          nebulosity,
          colorTint,
          edgeComplexity,
          colorVariance,
          starRoundness,
          entropy,
          gradientSmoothness,
          type,
          typeConfidence: confidence
        });
      };
    });
  }

  // ------------------------------------------------------------
  // FEATURE ESTIMATORS
  // ------------------------------------------------------------
  function estimateStarDensity(data) {
    let bright = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      if (lum > 200) bright++;
    }
    return bright / (data.length / 4);
  }

  function estimateNebulosity(data) {
    let smooth = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      if (r > 70 && g > 40 && b > 40) smooth++;
    }
    return smooth / (data.length / 4);
  }

  function estimateColorTint(data) {
    let r = 0, g = 0, b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i+1];
      b += data[i+2];
    }
    return { r: r/n, g: g/n, b: b/n };
  }

  function estimateEdgeComplexity(data, w, h) {
    let edges = 0;
    let total = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const lum = (data[i] + data[i+1] + data[i+2]) / 3;
        if (lum < 40 || lum > 220) continue;
        total++;

        const lumL = (data[i-4] + data[i-3] + data[i-2]) / 3;
        const lumR = (data[i+4] + data[i+5] + data[i+6]) / 3;
        const lumT = (data[i - w*4] + data[i - w*4 + 1] + data[i - w*4 + 2]) / 3;
        const lumB = (data[i + w*4] + data[i + w*4 + 1] + data[i + w*4 + 2]) / 3;

        const diff = Math.abs(lum - lumL) + Math.abs(lum - lumR) + Math.abs(lum - lumT) + Math.abs(lum - lumB);
        if (diff > 80) edges++;
      }
    }
    return total ? edges / total : 0;
  }

  function estimateColorVariance(data) {
    let r = 0, g = 0, b = 0;
    let r2 = 0, g2 = 0, b2 = 0;
    const n = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const R = data[i], G = data[i+1], B = data[i+2];
      r += R; g += G; b += B;
      r2 += R*R; g2 += G*G; b2 += B*B;
    }

    const rMean = r / n, gMean = g / n, bMean = b / n;
    return {
      rVar: r2/n - rMean*rMean,
      gVar: g2/n - gMean*gMean,
      bVar: b2/n - bMean*bMean
    };
  }

  function estimateStarRoundness(data, w, h) {
    let roundish = 0;
    let total = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const lum = (data[i] + data[i+1] + data[i+2]) / 3;
        if (lum < 200) continue;

        total++;

        const neighbors = [
          data[i - 4],
          data[i + 4],
          data[i - w*4],
          data[i + w*4]
        ];
        const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
        if (Math.abs(avg - data[i]) < 40) roundish++;
      }
    }

    return total ? roundish / total : 0;
  }

  function estimateEntropy(data) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] + data[i+1] + data[i+2]) / 3;
      hist[Math.floor(lum)]++;
    }
    const n = data.length / 4;
    let H = 0;
    for (let i = 0; i < 256; i++) {
      if (!hist[i]) continue;
      const p = hist[i] / n;
      H -= p * Math.log2(p);
    }
    return H;
  }

  function estimateGradientSmoothness(data, w, h) {
    let total = 0;
    let smooth = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const lum = (data[i] + data[i+1] + data[i+2]) / 3;

        const lumR = (data[i+4] + data[i+5] + data[i+6]) / 3;
        const lumB = (data[i + w*4] + data[i + w*4 + 1] + data[i + w*4 + 2]) / 3;

        const dx = Math.abs(lum - lumR);
        const dy = Math.abs(lum - lumB);

        const grad = dx + dy;

        total++;
        if (grad < 25) smooth++;
      }
    }

    return smooth / total;
  }

  // ------------------------------------------------------------
  // CLASSIFIER (C1 — Balanced Hybrid)
  // ------------------------------------------------------------
  function classifyObject(f) {
    const {
      starDensity,
      nebulosity,
      colorTint,
      edgeComplexity,
      colorVariance,
      starRoundness,
      entropy,
      gradientSmoothness
    } = f;

    let scores = {
      "Emission Nebula": 0,
      "Reflection Nebula": 0,
      "Nebula": 0,
      "Open Cluster": 0,
      "Globular Cluster": 0,
      "Galaxy": 0,
      "Not Astro": 0
    };

    // ------------------------------------------------------------
    // ASTRO vs NON-ASTRO GATE (C1)
    // ------------------------------------------------------------
    if (entropy < 1.8) scores["Not Astro"] += 2.0;

    if (colorVariance.rVar < 5 && colorVariance.gVar < 5 && colorVariance.bVar < 5) {
      scores["Not Astro"] += 2.0;
    }

    if (edgeComplexity > 0.25 && nebulosity < 0.05) {
      scores["Not Astro"] += 1.5;
    }

    if (gradientSmoothness > 0.95 && nebulosity < 0.05) {
      scores["Not Astro"] += 1.5;
    }

    // ------------------------------------------------------------
    // NEBULA CLASSIFICATION
    // ------------------------------------------------------------
    if (nebulosity > 0.10) {
      scores["Nebula"] += 3.0;

      if (colorTint.r > colorTint.g + 15) scores["Emission Nebula"] += 2.0;
      if (colorTint.b > colorTint.r + 15) scores["Reflection Nebula"] += 2.0;
    }

    // ------------------------------------------------------------
    // CLUSTERS
    // ------------------------------------------------------------
    if (starDensity > 0.02 && starRoundness > 0.4) {
      if (starDensity > 0.05) scores["Open Cluster"] += 2.0;
      else scores["Globular Cluster"] += 2.0;
    }

    // ------------------------------------------------------------
    // GALAXIES
    // ------------------------------------------------------------
    if (edgeComplexity > 0.12 && entropy > 3.0) {
      scores["Galaxy"] += 2.0;
    }

    // ------------------------------------------------------------
    // PICK BEST TYPE
    // ------------------------------------------------------------
    let bestType = "Not Astro";
    let bestScore = -Infinity;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // Confidence: ratio of best score to total positive scores
    const positiveScores = Object.entries(scores)
      .filter(([t]) => t !== "Not Astro")
      .map(([_, s]) => Math.max(0, s));

    const sumPos = positiveScores.reduce((a, b) => a + b, 0) || 1;
    const confidence = Math.max(0.1, Math.min(0.99, bestScore / sumPos));

    return { type: bestType, confidence };
  }

  // ------------------------------------------------------------
  // UNIFIED CATALOG LOADING
  // ------------------------------------------------------------
  async function loadUnifiedCatalog() {
    const res = await fetch("objects.json");
    return res.json();
  }

  // ------------------------------------------------------------
  // CATALOG MATCHING
  // ------------------------------------------------------------
  function estimateFOV(analysis) {
    return Math.max(0.3, Math.min(3.0, 1 / (analysis.starDensity * 50 + 0.1)));
  }

  function matchObject(analysis, catalog) {
    let best = null;
    let bestScore = -Infinity;

    for (const obj of catalog) {
      const sizeScore = 1 / (1 + Math.abs(obj.sizeDeg - estimateFOV(analysis)));
      const nebScore = 1 - Math.abs((obj.nebulosity ?? 0.5) - analysis.nebulosity);
      const starScore = 1 - Math.abs((obj.starDensity ?? 0.03) - analysis.starDensity);

      const score =
        sizeScore * 0.5 +
        nebScore * 0.3 +
        starScore * 0.2;

      if (score > bestScore) {
        bestScore = score;
        best = { ...obj, score };
      }
    }

    return bestScore > 0.2 ? best : null;
  }

});
