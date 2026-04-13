const MoonMap = {
  // --- STATE ---
  img: new Image(),
  loaded: false,
  scale: 1,
  minScale: 0.1,
  maxScale: 25,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  needsRender: false,
  flipped: false,
  apolloMode: false,
  bHoldTimer: null,
  lastDrawOffsetX: 0,
  lastDrawOffsetY: 0,
  lastDrawScale: 0,
  lastDrawFlip: false,
  lastDrawApollo: false,

  // DOM refs (filled in init)
  overlay: null,
  modal: null,
  canvas: null,
  ctx: null,
  btnOpen: null,
  btnClose: null,
  btnReset: null,
  btnFlip: null,
  btnDownloadHighRes: null,
  zoomSlider: null,

  // ------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------
  init() {
    this.overlay = document.getElementById("moonmap-modal-overlay");
    this.modal   = document.getElementById("moonmap-modal");
    this.canvas  = document.getElementById("moonCanvas");
    this.ctx     = this.canvas.getContext("2d", { alpha: false });

    this.btnOpen  = document.getElementById("moonmap-open");
    this.btnClose = document.getElementById("moonmap-close");
    this.btnReset = document.getElementById("moonmap-reset");
    this.btnFlip  = document.getElementById("moonmap-flip");
    this.btnDownloadHighRes = document.getElementById("moonmap-download-highres");
    this.zoomSlider = document.getElementById("moonmap-zoom-slider");

    this.overlay.style.display = "none";

    // LOAD IMAGE
    this.img.onload = async () => {
      try { if (this.img.decode) await this.img.decode(); } catch {}
      this.loaded = true;
      this.resizeCanvas();
      this.resetView();
      this.requestRender();
    };

    fetch("moonmap_lowres.txt")
      .then(r => r.text())
      .then(base64 => {
        this.img.src = "data:image/png;base64," + base64;
      });

    // BUTTONS
    this.btnOpen.addEventListener("click", () => this.open());
    this.btnClose.addEventListener("click", () => this.close());
    this.btnReset.addEventListener("click", () => this.resetView());
    this.btnFlip.addEventListener("click", () => {
      this.flipped = !this.flipped;
      this.requestRender();
    });

    this.btnDownloadHighRes.addEventListener("click", () => {
      window.open(
        "https://github.com/astronomystuff/Zenith-Sky/releases/download/moonmap-v1/moonmap.png",
        "_blank",
        "noopener"
      );
    });

    // ZOOM
    this.zoomSlider.addEventListener("input", () => {
      const newScale = parseFloat(this.zoomSlider.value);
      if (!isFinite(newScale)) return;

      const clamped = Math.min(Math.max(newScale, this.minScale), this.maxScale);
      if (Math.abs(clamped - this.scale) < 0.0001) return;

      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;

      this.offsetX = cx - (cx - this.offsetX) * (clamped / this.scale);
      this.offsetY = cy - (cy - this.offsetY) * (clamped / this.scale);

      this.scale = clamped;
      this.requestRender();
    });

    // PAN (mouse)
    let lastPan = 0;
    this.canvas.addEventListener("mousedown", () => {
      this.dragging = true;
      this.canvas.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
      this.canvas.style.cursor = "grab";
      document.body.style.userSelect = "";
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      const now = performance.now();
      if (now - lastPan < 24) return;
      lastPan = now;

      this.offsetX += e.movementX;
      this.offsetY += e.movementY;
      this.requestRender();
    });

    // PAN (touch)
    let lastTouchX = 0;
    let lastTouchY = 0;
    let touchDragging = false;
    let touchQueued = false;

    this.canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      touchDragging = true;

      const t = e.touches[0];
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;

      this.canvas.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }, { passive: true });

    this.canvas.addEventListener("touchmove", (e) => {
      if (!touchDragging || e.touches.length !== 1) return;

      if (!touchQueued) {
        touchQueued = true;
        const t0 = e.touches[0];
        const startX = t0.clientX;
        const startY = t0.clientY;

        requestAnimationFrame(() => {
          touchQueued = false;

          const dx = startX - lastTouchX;
          const dy = startY - lastTouchY;

          lastTouchX = startX;
          lastTouchY = startY;

          this.offsetX += dx;
          this.offsetY += dy;

          this.requestRender();
        });
      }
    }, { passive: true });

    this.canvas.addEventListener("touchend", () => {
      touchDragging = false;
      this.canvas.style.cursor = "grab";
      document.body.style.userSelect = "";
    }, { passive: true });
  },

  // ------------------------------------------------------------
  // OPEN / CLOSE
  // ------------------------------------------------------------
  open() {
    this.overlay.style.display = "flex";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.resizeCanvas();
        this.resetView();
      });
    });
  },

  close() {
    this.overlay.style.display = "none";
  },

  // ------------------------------------------------------------
  // RENDER + VIEW
  // ------------------------------------------------------------
  requestRender() {
    if (this.needsRender) return;
    this.needsRender = true;
    requestAnimationFrame(() => {
      this.needsRender = false;
      this.draw();
    });
  },

  draw() {
    if (!this.loaded) return;

    if (
      this.offsetX === this.lastDrawOffsetX &&
      this.offsetY === this.lastDrawOffsetY &&
      this.scale === this.lastDrawScale &&
      this.flipped === this.lastDrawFlip &&
      this.apolloMode === this.lastDrawApollo
    ) {
      return;
    }

    this.lastDrawOffsetX = this.offsetX;
    this.lastDrawOffsetY = this.offsetY;
    this.lastDrawScale = this.scale;
    this.lastDrawFlip = this.flipped;
    this.lastDrawApollo = this.apolloMode;

    this.ctx.globalCompositeOperation = "copy";
    this.ctx.imageSmoothingEnabled = false;

    this.ctx.fillStyle = this.apolloMode ? "#787161" : "#808080";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    if (this.flipped) {
      this.ctx.scale(1, -1);
      this.ctx.translate(0, -this.img.height);
    }

    this.ctx.drawImage(
      this.img,
      1, 1, this.img.width - 2, this.img.height - 2,
      0, 0, this.img.width, this.img.height
    );

    if (this.apolloMode) {
      applyApolloPalette(this.ctx, this.canvas.width, this.canvas.height);
    }

    this.ctx.restore();
  },

  resizeCanvas() {
    const rect = this.modal.getBoundingClientRect();
    const newWidth = rect.width;
    const newHeight = rect.height - 40;

    if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
      this.requestRender();
    }
  },

  resetView() {
    if (!this.loaded) return;

    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width / this.img.width;
    const sy = rect.height / this.img.height;

    this.scale = Math.min(sx, sy);
    this.scale = Math.min(Math.max(this.scale, this.minScale), this.maxScale);

    this.offsetX = (rect.width - this.img.width * this.scale) / 2;
    this.offsetY = (rect.height - this.img.height * this.scale) / 2 + 12;

    this.zoomSlider.value = String(this.scale);
    this.requestRender();
  }
};

// ------------------------------------------------------------
// SAFE INITIALIZATION
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  MoonMap.init();
});
