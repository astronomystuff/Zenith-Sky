  document.addEventListener("DOMContentLoaded", () => {
    try {
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
    if (e.target.id === "woit-identify") modal.style.display = "block";
    if (e.target.id === "woit-close") modal.style.display = "none";
  });

  // ------------------------------------------------------------
  // FILE INPUT
  // ------------------------------------------------------------
  btn.addEventListener("click", () => input.click());

  resetBtn.addEventListener("click", () => {
    input.value = "";
    if (fileName) fileName.textContent = "";
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
    if (fileName) fileName.textContent = file.name;

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

      // Filter by detected type (using short codes)
      const filtered = catalog.filter(obj => typeMatches(analysis.type, obj.type));

      setStatus(`Matching against ${filtered.length} objects of type ${analysis.type}…`);

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
      <strong>${match.name}</strong> (${match.id}${match.ngc ? " / NGC " + match.ngc : ""})<br>
      Type: ${match.type}<br>
      Mag: ${match.mag}<br>
      Size: ${match.size}<br>
      Constellation: ${match.con}<br>
      Season: ${match.season}<br><br>

      <strong>Catalog match confidence:</strong> ${(match.score * 100).toFixed(1)}%<br>
      <strong>Type classifier confidence:</strong> ${(analysis.typeConfidence * 100).toFixed(1)}%<br><br>
    `;
  }

  // ------------------------------------------------------------
  // IMAGE ANALYSIS + CLASSIFIER (same as before)
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
        const entropy = estimateEntropy(data);

        const { type, confidence } = classifyObject({ starDensity, nebulosity, entropy });

        resolve({
          width: canvas.width,
          height: canvas.height,
          starDensity,
          nebulosity,
          entropy,
          type,
          typeConfidence: confidence
        });
      };
    });
  }


  // ------------------------------------------------------------
  // UNIFIED CATALOG LOADING
  // ------------------------------------------------------------
  async function loadUnifiedCatalog() {
    const res = await fetch("objects.json");
    return res.json();
  }

  // ------------------------------------------------------------
  // TYPE MAPPING
  // ------------------------------------------------------------
  function typeMatches(classifierType, objType) {
    const map = {
      "Nebula": ["Nb", "Sn", "Pn"],
      "Galaxy": ["Gc"],
      "Open Cluster": ["Oc"],
      "Globular Cluster": ["Gc"],
    };
    return map[classifierType]?.includes(objType);
  }

  // ------------------------------------------------------------
  // SIZE PARSER ("WxH" strings → degrees)
  // ------------------------------------------------------------
  function parseSize(sizeStr) {
    if (!sizeStr) return null;
    const [w, h] = sizeStr.split("x").map(Number);
    return Math.max(w, h) / 60; // arcmin → degrees
  }

  // ------------------------------------------------------------
  // MATCHING USING ONLY YOUR FIELDS
  // ------------------------------------------------------------
  function estimateFOV(analysis) {
    return Math.max(0.3, Math.min(3.0, 1 / (analysis.starDensity * 50 + 0.1)));
  }

  function matchObject(analysis, catalog) {
    let best = null;
    let bestScore = -Infinity;

    for (const obj of catalog) {
      const objSize = parseSize(obj.size);
      const sizeScore = objSize ? 1 / (1 + Math.abs(objSize - estimateFOV(analysis))) : 0.5;

      const score = sizeScore; 

      if (score > bestScore) {
        bestScore = score;
        best = { ...obj, score };
      }
    }

    return bestScore > 0.2 ? best : null;
  }
});

    // ------------------------------------------------------------
    // FEATURE ESTIMATORS
    // ------------------------------------------------------------
    function estimateStarDensity(data) {
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // crude star detection: bright pixels
        if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) count++;
      }
      return count / (data.length / 4);
    }

    function estimateNebulosity(data) {
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += data[i] + data[i + 1] + data[i + 2];
      }
      return sum / (data.length * 3 * 255);
    }

    function estimateEntropy(data) {
      const hist = new Array(256).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        hist[data[i]]++;
      }
      let entropy = 0;
      for (const h of hist) {
        if (h > 0) {
          const p = h / (data.length / 4);
          entropy -= p * Math.log2(p);
        }
      }
      return entropy / 8; // normalize
    }

    // ------------------------------------------------------------
    // CLASSIFIER
    // ------------------------------------------------------------
    function classifyObject({ starDensity, nebulosity, entropy }) {
      if (nebulosity > 0.6) return { type: "Nebula", confidence: nebulosity };
      if (nebulosity > 0.3 && entropy > 0.5) return { type: "Galaxy", confidence: (nebulosity + entropy) / 2 };
      if (starDensity > 0.05) return { type: "Open Cluster", confidence: starDensity };
      if (starDensity > 0.1) return { type: "Globular Cluster", confidence: starDensity };
      return { type: "Not Astro", confidence: 0.9 };
    }

    // ------------------------------------------------------------
    // ERROR BOX FUNCTION
    // ------------------------------------------------------------
    function showError(err) {
      const result = document.getElementById("woit-result");
      result.style.display = "block";
      result.innerHTML = `
        <div style="border:2px solid red; padding:12px; background:#330000; color:#f2f2f7;">
          <strong>WOIT Error:</strong><br>
          ${err.message || "Unknown error"}<br><br>
          Please try again or reset.
        </div>
      `;
    }

  } catch (err) {
    // GLOBAL CATCH
    const result = document.getElementById("woit-result");
    if (result) {
      result.style.display = "block";
      result.innerHTML = `
        <div style="border:2px solid red; padding:12px; background:#330000; color:#f2f2f7;">
          <strong>WOIT Fatal Error:</strong><br>
          ${err.message || "Unknown error"}<br><br>
          The engine crashed before initialization.
        </div>
      `;
    }
  }
});
