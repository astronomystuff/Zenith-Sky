document.addEventListener("DOMContentLoaded", () => {
  // ------------------------------------------------------------
  // DOM WIRING
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

  // Open / close modal
  function runWOIT() {
    if (!modal) return;
    modal.style.display = "block";
  }

  document.addEventListener("click", (e) => {
    if (e.target.id === "woit-identify") {
      runWOIT();
    }
    if (e.target.id === "woit-close") {
      if (modal) modal.style.display = "none";
    }
  });

  // Button → file input
  if (btn && input) {
    btn.addEventListener("click", () => input.click());
  }

  // Reset behavior
  resetBtn.addEventListener("click", () => {
    if (!input) return;
    input.value = "";
    if (fileName) fileName.textContent = "";
    if (previewContainer) previewContainer.style.display = "none";
    if (preview) preview.src = "";
    if (status) status.textContent = "";
    if (result) {
      result.style.display = "none";
      result.innerHTML = "";
    }
    resetBtn.style.display = "none";
  });

  // ------------------------------------------------------------
  // MAIN FLOW: IMAGE SELECTED
  // ------------------------------------------------------------
  if (input) {
    input.addEventListener("change", async () => {
      if (!input.files || !input.files.length) return;

      const file = input.files[0];
      if (fileName) fileName.textContent = file.name;

      const url = URL.createObjectURL(file);
      if (preview) preview.src = url;
      if (previewContainer) previewContainer.style.display = "block";

      if (result) {
        result.style.display = "none";
        result.innerHTML = "";
      }
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

        const catalog = await loadCatalogForType(analysis.type);

        setStatus(`Matching against ${catalog.length} ${analysis.type} objects…`);

        const match = matchObject(analysis, catalog);

        setStatus("Identification complete.");
        showResult(analysis, match);
        resetBtn.style.display = "inline-block";
      } catch (err) {
        console.error(err);
        setStatus("Identification failed.");
        if (result) {
          result.style.display = "block";
          result.innerHTML = `
            <strong>Error:</strong><br>
            ${err.message || "Unknown error."}<br><br>
          `;
        }
        resetBtn.style.display = "inline-block";
      }
    });
  }

  function setStatus(msg) {
    if (status) status.textContent = msg;
  }

  // ------------------------------------------------------------
  // SHOW RESULT
  // ------------------------------------------------------------
  function showResult(analysis, match) {
    if (!result) return;
    result.style.display = "block";

    if (analysis.type === "Not Astro") {
      result.innerHTML = `
        <strong>This does not look like an astronomical object.</strong><br><br>
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

        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        const starDensity = estimateStarDensity(data);
        const nebulosity = estimateNebulosity(data);
        const colorTint = estimateColorTint(data);
        const edgeComplexity = estimateEdgeComplexity(data, canvas.width, canvas.height);
        const colorVariance = estimateColorVariance(data);
        const starRoundness = estimateStarRoundness(data, canvas.width, canvas.height);
        const entropy = estimateEntropy(data);

        const { type, confidence } = classifyObject({
          starDensity,
          nebulosity,
          colorTint,
          edgeComplexity,
          colorVariance,
          starRoundness,
          entropy
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
      if (r > 80 && g > 40 && b > 40) smooth++;
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
        const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        if (lum < 40 || lum > 220) continue;
        total++;
        const iL = i - 4;
        const iR = i + 4;
        const iT = i - w * 4;
        const iB = i + w * 4;
        const lumL = 0.299 * data[iL] + 0.587 * data[iL+1] + 0.114 * data[iL+2];
        const lumR = 0.299 * data[iR] + 0.587 * data[iR+1] + 0.114 * data[iR+2];
        const lumT = 0.299 * data[iT] + 0.587 * data[iT+1] + 0.114 * data[iT+2];
        const lumB = 0.299 * data[iB] + 0.587 * data[iB+1] + 0.114 * data[iB+2];
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
        const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        if (lum < 200) continue;

        total++;

        const neighbors = [
          data[i - 4],     // left R
          data[i + 4],     // right R
          data[i - w*4],   // top R
          data[i + w*4]    // bottom R
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

  // ------------------------------------------------------------
  // TYPE CLASSIFIER WITH REAL CONFIDENCE
  // ------------------------------------------------------------
  function classifyObject(features) {
    const {
      starDensity,
      nebulosity,
      colorTint,
      edgeComplexity,
      colorVariance,
      starRoundness,
      entropy
    } = features;

    let scores = {
      "Emission Nebula": 0,
      "Reflection Nebula": 0,
      "Nebula": 0,
      "Open Cluster": 0,
      "Globular Cluster": 0,
      "Galaxy": 0,
      "Not Astro": 0
    };

// Base astro vs non-astro
if (entropy < 2.0) scores["Not Astro"] += 2.0;
if (colorVariance.rVar < 10 && colorVariance.gVar < 10 && colorVariance.bVar < 10) {
  scores["Not Astro"] += 2.0;
}

// Printed edges: strong edges + low nebulosity = not astro
if (edgeComplexity > 0.25 && nebulosity < 0.05) {
  scores["Not Astro"] += 1.5;
}


    // Nebula-like
    if (nebulosity > 0.15 && starRoundness < 0.3) {
      scores["Nebula"] += 2.0;
      if (colorTint.r > colorTint.g + 20) scores["Emission Nebula"] += 1.5;
      if (colorTint.b > colorTint.r + 20) scores["Reflection Nebula"] += 1.5;
    }

    // Cluster-like
    if (starDensity > 0.02 && starRoundness > 0.4) {
      scores["Open Cluster"] += starDensity > 0.05 ? 2.0 : 1.0;
      scores["Globular Cluster"] += starDensity <= 0.05 ? 2.0 : 1.0;
    }

    // Galaxy-like
    if (edgeComplexity > 0.15 && entropy > 4.5) {
      scores["Galaxy"] += 2.0;
    }

    // If nothing stands out, lean to Not Astro
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore < 1.0) {
      return { type: "Not Astro", confidence: 0.6 };
    }

    let bestType = "Not Astro";
    let bestScore = -Infinity;
    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    const sumPos = Object.values(scores).reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const confidence = Math.max(0.1, Math.min(0.99, bestScore / sumPos));

    return { type: bestType, confidence };
  }

  // ------------------------------------------------------------
  // LOAD CATALOG BY TYPE
  // ------------------------------------------------------------
  async function loadCatalogForType(type) {
    const map = {
      "Emission Nebula": "nebulae.json",
      "Reflection Nebula": "nebulae.json",
      "Nebula": "nebulae.json",
      "Open Cluster": "open_clusters.json",
      "Globular Cluster": "globulars.json",
      "Galaxy": "galaxies.json"
    };

    const file = map[type] || "galaxies.json";
    const res = await fetch(`catalog/dso/${file}`);
    return res.json();
  }

  // ------------------------------------------------------------
  // MATCH OBJECT WITHIN TYPE CATALOG
  // ------------------------------------------------------------
  function estimateFOV(analysis) {
    return Math.max(0.3, Math.min(3.0, 1 / (analysis.starDensity * 50 + 0.1)));
  }

  function matchObject(analysis, catalog) {
    let best = null;
    let bestScore = -Infinity;

    for (const obj of catalog) {
      const sizeScore = 1 / (1 + Math.abs(obj.sizeDeg - estimateFOV(analysis)));
      const nebScore = 1 - Math.abs((obj.nebulosity || 0.5) - analysis.nebulosity);
      const starScore = 1 - Math.abs((obj.starDensity || 0.03) - analysis.starDensity);

      const score = (sizeScore * 0.5) + (nebScore * 0.3) + (starScore * 0.2);

      if (score > bestScore) {
        bestScore = score;
        best = { ...obj, score };
      }
    }

    return bestScore > 0.2 ? best : null;
  }
});
