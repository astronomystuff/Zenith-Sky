/* -------------------------------------------------------
BUILD HOME UI
------------------------------------------------------- */
const root = document.getElementById("video-tool-root");

root.innerHTML = `
  <div class="tool-card">
    <h2>Video Stacking</h2>

    <input type="file" id="video-input" accept="video/*" hidden />
    <button id="video-file-btn">Choose Video</button>
    <span id="video-file-name"></span>

    <div id="video-progress-container" style="display:none;">
      <div id="video-progress-bar"></div>
    </div>
    <div id="video-progress-percent" style="display:none;">0%</div>

    <p id="video-status"></p>
    <canvas id="stack-canvas" style="display:none;"></canvas>
    <a id="download-link" style="display:none;">Download Stacked Image</a>
  </div>
`;

/* -------------------------------------------------------
   BUILD SLIDE-UP MODAL (~85% HEIGHT, ROUNDED TOP)
------------------------------------------------------- */
const overlay = document.createElement("div");
overlay.id = "result-modal-overlay";
overlay.innerHTML = `
  <div id="result-modal">
    <div id="result-modal-header">
      <button id="back-button">← Back</button>
      <div id="result-modal-title">Stacked Result</div>
    </div>

    <div id="result-modal-content">
      <div id="result-image-container">
        <canvas id="result-image-canvas"></canvas>
      </div>

      <div id="result-controls">

        <div class="slider-group">
          <label for="denoise-slider">Denoise</label>
          <input type="range" id="denoise-slider" min="0" max="100" value="0" />
        </div>

        <div class="slider-group">
          <label for="brightness-slider">Brightness</label>
          <input type="range" id="brightness-slider" min="-50" max="50" value="0" />
        </div>

        <div class="slider-group">
          <label for="contrast-slider">Contrast</label>
          <input type="range" id="contrast-slider" min="-50" max="50" value="0" />
        </div>

        <div class="slider-group">
          <label for="saturation-slider">Saturation</label>
          <input type="range" id="saturation-slider" min="-50" max="50" value="0" />
        </div>

        <div class="slider-group">
          <label for="gamma-slider">Gamma</label>
          <input type="range" id="gamma-slider" min="70" max="130" value="100" />
        </div>

        <div class="slider-group">
          <label>Histogram</label>
          <canvas id="histogram-canvas" width="200" height="80"></canvas>
        </div>

        <button id="download-image-btn">Download Image</button>
      </div>
    </div>
  </div>
`;
document.body.appendChild(overlay);

/* -------------------------------------------------------
   iOS FLOATING ALERT
------------------------------------------------------- */
const alertOverlay = document.createElement("div");
alertOverlay.id = "alert-overlay";
alertOverlay.style.cssText = `
  position:fixed; inset:0; display:none;
  align-items:center; justify-content:center;
  background:rgba(0,0,0,0.35);
  backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);
  z-index:1000;
`;

alertOverlay.innerHTML = `
  <div id="alert-box" style="
    min-width:260px; max-width:320px;
    padding:18px 20px 14px;
    border-radius:20px;
    background:rgba(20,20,25,0.9);
    border:1px solid rgba(255,255,255,0.25);
    backdrop-filter:blur(24px) saturate(180%);
    -webkit-backdrop-filter:blur(24px) saturate(180%);
    box-shadow:0 14px 40px rgba(0,0,0,0.6);
    text-align:center;
  ">
    <div style="font-size:16px;font-weight:600;margin-bottom:6px;">Start new stacking?</div>
    <div style="font-size:13px;color:#e5e5ea;margin-bottom:14px;">
      This will replace your current result.
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button id="alert-cancel-btn">Cancel</button>
      <button id="alert-confirm-btn">Start</button>
    </div>
  </div>
`;
document.body.appendChild(alertOverlay);

const alertCancelBtn = document.getElementById("alert-cancel-btn");
const alertConfirmBtn = document.getElementById("alert-confirm-btn");

/* -------------------------------------------------------
   ELEMENT REFERENCES
------------------------------------------------------- */
const fileInput = document.getElementById("video-input");
const fileBtn = document.getElementById("video-file-btn");
const fileName = document.getElementById("video-file-name");
const status = document.getElementById("video-status");
const canvas = document.getElementById("stack-canvas");
const downloadLink = document.getElementById("download-link");
const progressContainer = document.getElementById("video-progress-container");
const progressBar = document.getElementById("video-progress-bar");
const progressPercent = document.getElementById("video-progress-percent");

const backButton = document.getElementById("back-button");
const resultCanvas = document.getElementById("result-image-canvas");
const denoiseSlider = document.getElementById("denoise-slider");
const brightnessSlider = document.getElementById("brightness-slider");
const contrastSlider = document.getElementById("contrast-slider");
const saturationSlider = document.getElementById("saturation-slider");
const gammaSlider = document.getElementById("gamma-slider");
const downloadImageBtn = document.getElementById("download-image-btn");
const histogramCanvas = document.getElementById("histogram-canvas");

const resultCtx = resultCanvas.getContext("2d");
const histogramCtx = histogramCanvas.getContext("2d");

/* -------------------------------------------------------
   STATE
------------------------------------------------------- */
let originalImageData = null;
let lastFile = null;
let pendingFile = null;
let isProcessing = false;

/* -------------------------------------------------------
   FILE SELECTION
------------------------------------------------------- */
fileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files.length === 0) return;

  const newFile = fileInput.files[0];
  fileName.textContent = newFile.name;

  if (originalImageData) {
    pendingFile = newFile;
    showAlert();
  } else {
    lastFile = newFile;
    processVideo(lastFile);
  }
});

/* -------------------------------------------------------
   ALERT LOGIC
------------------------------------------------------- */
function showAlert() {
  alertOverlay.style.display = "flex";
}

function hideAlert() {
  alertOverlay.style.display = "none";
}

alertCancelBtn.addEventListener("click", () => {
  pendingFile = null;
  hideAlert();
});

alertConfirmBtn.addEventListener("click", () => {
  if (pendingFile) {
    lastFile = pendingFile;
    pendingFile = null;
    hideAlert();
    processVideo(lastFile);
  }
});

/* -------------------------------------------------------
   BACK BUTTON — FULL CLEAN RESET
------------------------------------------------------- */
backButton.addEventListener("click", () => {
  overlay.classList.remove("visible");

  originalImageData = null;
  lastFile = null;
  pendingFile = null;
  isProcessing = false;

  fileName.textContent = "";
  status.textContent = "";
  progressContainer.style.display = "none";
  progressPercent.style.display = "none";
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  downloadLink.style.display = "none";

  denoiseSlider.value = "0";
  brightnessSlider.value = "0";
  contrastSlider.value = "0";
  saturationSlider.value = "0";
  gammaSlider.value = "100";
});

/* -------------------------------------------------------
   HISTOGRAM
------------------------------------------------------- */
function updateHistogram(imageData) {
  const d = imageData.data;
  const bins = new Array(256).fill(0);

  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    bins[lum]++;
  }

  const maxCount = Math.max(...bins) || 1;

  histogramCtx.clearRect(0, 0, histogramCanvas.width, histogramCanvas.height);
  histogramCtx.fillStyle = "rgba(255,255,255,0.4)";

  const width = histogramCanvas.width;
  const height = histogramCanvas.height;
  const binWidth = width / 256;

  for (let i = 0; i < 256; i++) {
    const value = bins[i] / maxCount;
    const barHeight = value * height;
    histogramCtx.fillRect(i * binWidth, height - barHeight, binWidth, barHeight);
  }
}

/* -------------------------------------------------------
   SOFT BACKGROUND DENOISER (Option A)
------------------------------------------------------- */
function backgroundDenoise(imageData, strength) {
  if (strength <= 0) return imageData;

  const w = imageData.width;
  const h = imageData.height;
  const d = imageData.data;

  const targetBg = 0;
  const s = strength / 100;

  const samples = [];
  for (let i = 0; i < d.length; i += 16 * 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    samples.push(lum);
  }

  samples.sort((a, b) => a - b);
  const bgLum = samples[Math.floor(samples.length * 0.3)] || 20;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    const bgMask = Math.max(0, Math.min(1, 1 - (lum - bgLum) / 40));
    if (bgMask <= 0) continue;

    const newLum = lum + (targetBg - lum) * s * bgMask;
    const scale = newLum / (lum || 1);

    d[i]     = Math.max(0, Math.min(255, r * scale));
    d[i + 1] = Math.max(0, Math.min(255, g * scale));
    d[i + 2] = Math.max(0, Math.min(255, b * scale));
  }

  return imageData;
}

/* -------------------------------------------------------
   ADAPTIVE NEBULA SMOOTHER (Median-based)
------------------------------------------------------- */
function medianNebulaSmooth(imageData, strength) {
  if (strength <= 0) return imageData;

  const w = imageData.width;
  const h = imageData.height;
  const d = imageData.data;

  const out = new Uint8ClampedArray(d);

  let radius = 1;
  if (strength > 33 && strength <= 66) radius = 2;
  if (strength > 66) radius = 3;

  const mask = new Float32Array(w * h);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    const m = Math.max(0, Math.min(1, (lum - 5) / 60));
    mask[i / 4] = m;
  }

  const window = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const m = mask[y * w + x];
      if (m <= 0.05) continue;

      window.length = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;

          const ii = (yy * w + xx) * 4;
          const lum =
            0.299 * d[ii] +
            0.587 * d[ii + 1] +
            0.114 * d[ii + 2];
          window.push(lum);
        }
      }

      window.sort((a, b) => a - b);
      const med = window[Math.floor(window.length / 2)];

      const r = d[idx];
      const g = d[idx + 1];
      const b = d[idx + 2];
      const oldLum =
        0.299 * r + 0.587 * g + 0.114 * b || 1;

      const scale = med / oldLum;

      out[idx]     = Math.max(0, Math.min(255, r * scale));
      out[idx + 1] = Math.max(0, Math.min(255, g * scale));
      out[idx + 2] = Math.max(0, Math.min(255, b * scale));
    }
  }

  return new ImageData(out, w, h);
}

/* -------------------------------------------------------
   SLIDER ADJUSTMENTS + DENOISE
------------------------------------------------------- */

let debounceTimer = null;
function debounceAdjustments() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    applyAdjustments();
  }, 120);
}

function applyAdjustments() {
  if (!originalImageData) return;

  const w = resultCanvas.width;
  const h = resultCanvas.height;
  const img = new ImageData(new Uint8ClampedArray(originalImageData.data), w, h);
  const d = img.data;

  const brightness = parseInt(brightnessSlider.value, 10);
  const contrast = parseInt(contrastSlider.value, 10);
  const saturation = parseInt(saturationSlider.value, 10);
  const gamma = parseInt(gammaSlider.value, 10) / 100;
  const denoiseStrength = parseInt(denoiseSlider.value, 10);

  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const satFactor = 1 + saturation / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    r += brightness;
    g += brightness;
    b += brightness;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * satFactor;
    g = lum + (g - lum) * satFactor;
    b = lum + (b - lum) * satFactor;

    r = Math.pow(Math.max(r, 0) / 255, gamma) * 255;
    g = Math.pow(Math.max(g, 0) / 255, gamma) * 255;
    b = Math.pow(Math.max(b, 0) / 255, gamma) * 255;

    d[i]     = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, b));
  }

  let denoised = backgroundDenoise(img, denoiseStrength);
  denoised = medianNebulaSmooth(denoised, denoiseStrength);

  resultCtx.putImageData(denoised, 0, 0);
  updateHistogram(denoised);
}

[denoiseSlider, brightnessSlider, contrastSlider, saturationSlider, gammaSlider].forEach(
  (slider) => slider.addEventListener("input", debounceAdjustments)
);

/* -------------------------------------------------------
   NEBULA DETECTION
------------------------------------------------------- */
function detectNebula(frameData, w, h) {
  const lowFreq = [];
  const highFreq = [];

  const step = Math.max(4, Math.floor(Math.min(w, h) / 128));

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const lum =
        0.299 * frameData[idx] +
        0.587 * frameData[idx + 1] +
        0.114 * frameData[idx + 2];

      if ((x / step) % 4 === 0 && (y / step) % 4 === 0) lowFreq.push(lum);
      if ((x / step) % 4 === 2 && (y / step) % 4 === 2) highFreq.push(lum);
    }
  }

  return variance(lowFreq) > variance(highFreq) * 1.15;
}

function variance(arr) {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
}

/* -------------------------------------------------------
   AUTO-STRETCH
------------------------------------------------------- */
function nebulaStretch(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.pow(d[i]     / 255, 0.85) * 255;
    d[i + 1] = Math.pow(d[i + 1] / 255, 0.85) * 255;
    d[i + 2] = Math.pow(d[i + 2] / 255, 0.85) * 255;
  }

  ctx.putImageData(img, 0, 0);
}

/* -------------------------------------------------------
   MEDIAN FRAME (for chunked median stacking)
------------------------------------------------------- */
function medianFrame(frames, w, h) {
  const count = frames.length;
  const out = new Uint8ClampedArray(w * h * 4);

  for (let i = 0; i < out.length; i++) {
    const vals = new Array(count);
    for (let f = 0; f < count; f++) {
      vals[f] = frames[f][i];
    }
    vals.sort((a, b) => a - b);
    out[i] = vals[Math.floor(count / 2)];
  }

  return out;
}

/* -------------------------------------------------------
   MAIN PROCESSING FUNCTION (Median Stacking)
------------------------------------------------------- */
async function processVideo(file) {
  if (!file) return;
  if (isProcessing) return;
  isProcessing = true;

  overlay.classList.remove("visible");

  status.textContent = "Loading video…";
  progressContainer.style.display = "block";
  progressPercent.style.display = "block";
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  downloadLink.style.display = "none";

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  await video.play();
  await new Promise((r) => setTimeout(r, 300));

  const w = video.videoWidth;
  const h = video.videoHeight;

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");

  let interval;
  if (video.duration < 5) interval = 1 / 30;
  else if (video.duration < 15) interval = 0.1;
  else interval = 0.2;

  const estimatedFrames = Math.max(1, Math.floor(video.duration / interval));

  status.textContent = "Extracting frames…";

  const batchSize = 7; // tuned for Safari / memory
  let batch = [];
  let batchesUsed = 0;
  let framesSeen = 0;

  const accumulator = new Float32Array(w * h * 4);

  let nebulaDetected = false;
  let firstFrameChecked = false;

  while (video.currentTime < video.duration) {
    ctx.drawImage(video, 0, 0, w, h);
    const frameData = ctx.getImageData(0, 0, w, h).data;

    if (!firstFrameChecked) {
      nebulaDetected = detectNebula(frameData, w, h);
      firstFrameChecked = true;
    }

    batch.push(frameData);
    framesSeen++;

    if (batch.length === batchSize) {
      const med = medianFrame(batch, w, h);
      for (let i = 0; i < med.length; i++) {
        accumulator[i] += med[i];
      }
      batchesUsed++;
      batch = [];
    }

    const percent = Math.min(
      100,
      Math.floor((framesSeen / estimatedFrames) * 100)
    );
    progressBar.style.width = percent + "%";
    progressPercent.textContent = percent + "%";

    video.currentTime += interval;
    await new Promise((r) => setTimeout(r, 20));
  }

  // Handle remaining frames in last partial batch
  if (batch.length > 0) {
    const med = medianFrame(batch, w, h);
    for (let i = 0; i < med.length; i++) {
      accumulator[i] += med[i];
    }
    batchesUsed++;
  }

  status.textContent = "Stacking frames…";

  const output = ctx.createImageData(w, h);
  for (let i = 0; i < accumulator.length; i++) {
    output.data[i] = accumulator[i] / batchesUsed;
  }

  ctx.putImageData(output, 0, 0);

  if (nebulaDetected) {
    status.textContent = "Nebula detected — enhancing…";
    nebulaStretch(ctx, w, h);
  }

  resultCanvas.width = w;
  resultCanvas.height = h;
  const stackedImage = ctx.getImageData(0, 0, w, h);
  resultCtx.putImageData(stackedImage, 0, 0);
  originalImageData = stackedImage;

  denoiseSlider.value = "0";
  brightnessSlider.value = "0";
  contrastSlider.value = "0";
  saturationSlider.value = "0";
  gammaSlider.value = "100";
  applyAdjustments();

  overlay.classList.add("visible");

  const dataURL = canvas.toDataURL("image/png");
  downloadLink.href = dataURL;
  downloadLink.download = "stacked.png";
  downloadLink.textContent = "Download Stacked Image";
  downloadLink.style.display = "none";

  status.textContent = `Done! Median-stacked ${framesSeen} frames in ${batchesUsed} batches.`;
  isProcessing = false;
}

/* -------------------------------------------------------
   DOWNLOAD FROM MODAL
------------------------------------------------------- */
downloadImageBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = resultCanvas.toDataURL("image/png");
  link.download = "stacked_adjusted.png";
  link.click();
});
