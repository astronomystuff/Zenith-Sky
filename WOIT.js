document.addEventListener("click", (e) => {
  if (e.target.id === "woit-identify") {
    runWOIT();
  }

  if (e.target.id === "woit-close") {
    const modal = document.getElementById("woit-modal");
    modal.style.display = "none";
  }
});

  const input = document.getElementById("woit-input");
  const btn = document.getElementById("woit-btn");
  const fileName = document.getElementById("woit-file-name");
  const previewContainer = document.getElementById("woit-preview-container");
  const preview = document.getElementById("woit-preview");
  const status = document.getElementById("woit-status");
  const result = document.getElementById("woit-result");

  // Reset button
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  resetBtn.id = "woit-reset-btn";
  resetBtn.style.display = "none";
  resetBtn.style.marginTop = "10px";
  result.insertAdjacentElement("afterend", resetBtn);

  btn.addEventListener("click", () => input.click());

  resetBtn.addEventListener("click", () => {
    input.value = "";
    fileName.textContent = "";
    previewContainer.style.display = "none";
    preview.src = "";
    status.textContent = "";
    result.style.display = "none";
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

      setStatus(`Detected object type: ${analysis.type}`);

      const catalog = await loadCatalogForType(analysis.type);

      setStatus(`Matching against ${catalog.length} ${analysis.type} objects…`);

      const match = matchObject(analysis, catalog);

      setStatus("Identification complete.");
      showResult(analysis, match);
      resetBtn.style.display = "inline-block";
    } catch (err) {
      console.error(err);
      setStatus("Identification failed.");
      result.style.display = "block";
      result.innerHTML = `
        <strong>Error:</strong><br>
        ${err.message || "Unknown error."}<br><br>
      `;
      resetBtn.style.display = "inline-block";
    }
  });

  function setStatus(msg) {
    status.textContent = msg;
  }

  function showResult(analysis, match) {
    result.style.display = "block";

    if (!match) {
      result.innerHTML = `
        <strong>No confident match found.</strong><br><br>
        <em>Object type:</em> ${analysis.type}<br>
      `;
      return;
    }

    result.innerHTML = `
      <strong>Identified Object:</strong><br><br>
      <strong>${match.name}</strong> (${match.catalog})<br>
      ${match.type}<br>
      Mag ${match.mag}<br>
      Size ~${match.sizeDeg}°<br><br>

      <strong>Confidence:</strong> ${(match.score * 100).toFixed(1)}%<br><br>

      <em>Object type detected:</em> ${analysis.type}<br>
    `;
  }

  // ------------------------------------------------------------
  // IMAGE ANALYSIS → OBJECT TYPE CLASSIFIER
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

        const type = classifyObject(starDensity, nebulosity, colorTint);

        resolve({
          width: canvas.width,
          height: canvas.height,
          starDensity,
          nebulosity,
          colorTint,
          type
        });
      };
    });
  }

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

  function classifyObject(starDensity, nebulosity, tint) {
    if (nebulosity > 0.15) {
      if (tint.r > tint.g + 20) return "Emission Nebula";
      if (tint.b > tint.r + 20) return "Reflection Nebula";
      return "Nebula";
    }

    if (starDensity > 0.02) {
      if (starDensity > 0.05) return "Open Cluster";
      return "Globular Cluster";
    }

    return "Galaxy";
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

    return fetch(`catalog/dso/${file}`).then(r => r.json());
  }

  // ------------------------------------------------------------
  // MATCH OBJECT WITHIN TYPE CATALOG
  // ------------------------------------------------------------
  function matchObject(analysis, catalog) {
    let best = null;
    let bestScore = -Infinity;

    for (const obj of catalog) {
      const sizeScore = 1 / (1 + Math.abs(obj.sizeDeg - estimateFOV(analysis)));
      const nebScore = 1 - Math.abs(obj.nebulosity - analysis.nebulosity);
      const starScore = 1 - Math.abs(obj.starDensity - analysis.starDensity);

      const score = (sizeScore * 0.5) + (nebScore * 0.3) + (starScore * 0.2);

      if (score > bestScore) {
        bestScore = score;
        best = { ...obj, score };
      }
    }

    return bestScore > 0.2 ? best : null;
  }

    function estimateFOV(analysis) {
  return Math.max(0.3, Math.min(3.0, 1 / (analysis.starDensity * 50 + 0.1)));
}

});  // closes DOMContentLoaded
