/*
  MELT / SCRIPT
  Canvas 2D renderer — no WebGL, no external JavaScript libraries.

  This file is designed specifically for the matching MELT index.html
  and style.css.

  IMPORTANT:
  Do not rename this file to fluid.js unless you also change the
  <script src="script.js"> line in index.html.
*/

(() => {
  "use strict";

  // ============================================================
  // CONFIGURATION
  // ============================================================

  const CONFIG = {
    particles: {
      base: 2200,
      max: 8500,
      ambient: 650,
      size: 1.35,
      field: 0.055,
      home: 0.00085,
      trail: 0.105,
      mouseRadius: 175,
      mouseForce: 1.9
    },

    ascii: {
      chars: " .,:;irsXA253hMHGS#9B&@",
      minCell: 5,
      maxCell: 17,
      distortion: 28
    },

    palettes: {
      matrix: [
        [215, 255, 225],
        [125, 255, 171],
        [45, 190, 93],
        [8, 45, 20]
      ],

      amber: [
        [255, 244, 171],
        [255, 181, 47],
        [190, 91, 18],
        [48, 18, 3]
      ],

      mono: [
        [245, 245, 240],
        [175, 175, 170],
        [95, 95, 92],
        [28, 28, 27]
      ]
    }
  };


  // ============================================================
  // DOM REFERENCES
  // ============================================================

  const $ = (id) => document.getElementById(id);

  const fluidCanvas = $("fluid-canvas");
  const asciiCanvas = $("ascii-canvas");

  if (!fluidCanvas || !asciiCanvas) {
    console.error("MELT: required canvas elements were not found.");
    return;
  }

  const fluid = fluidCanvas.getContext("2d", {
    alpha: false
  });

  const ascii = asciiCanvas.getContext("2d", {
    alpha: true
  });

  const sourceCanvas = document.createElement("canvas");
  const source = sourceCanvas.getContext("2d", {
    willReadFrequently: true
  });


  // ============================================================
  // UI REFERENCES
  // ============================================================

  const boot = $("boot");
  const bootProgress = $("boot-progress");
  const bootText = $("boot-text");
  const bootPercent = $("boot-percent");

  const errorScreen = $("error");
  const errorText = $("error-text");

  const statusText = $("status-text");
  const statusDot = $("status-dot");

  const fileInput = $("file-input");
  const dropzone = $("dropzone");
  const imageMeta = $("image-meta");
  const imageName = $("image-name");
  const imageClear = $("image-clear");

  const textInput = $("text-input");
  const textApply = $("text-apply");
  const textCount = $("text-count");

  const pointerX = $("pointer-x");
  const pointerY = $("pointer-y");
  const pointerHint = $("pointer-hint");

  const panel = $("control-panel");
  const panelClose = $("panel-close");
  const panelToggle = $("panel-toggle");

  const turbulence = $("s-turbulence");
  const viscosity = $("s-viscosity");
  const density = $("s-density");

  const turbulenceValue = $("turbulence-value");
  const viscosityValue = $("viscosity-value");
  const densityValue = $("density-value");

  const densityLabel = $("density-label");
  const densityHint = $("density-hint");

  const resetButton = $("btn-reset");
  const saveButton = $("btn-save");
  const brandReset = $("brand-reset");

  const fpsCounter = $("fps-counter");


  // ============================================================
  // STATE
  // ============================================================

  const state = {
    width: 1,
    height: 1,
    dpr: 1,

    mode: "fluid",
    palette: "source",
    sourceType: "text",

    dirty: true,

    turbulence: 45,
    viscosity: 20,
    density: 55,

    particles: [],
    ambient: [],

    time: 0,
    lastTime: performance.now(),

    frameCount: 0,
    fpsClock: performance.now(),

    mouse: {
      x: 0,
      y: 0,

      previousX: 0,
      previousY: 0,

      velocityX: 0,
      velocityY: 0,

      active: false
    }
  };


  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  const clamp = (value, min, max) => {
    return Math.max(min, Math.min(max, value));
  };


  const lerp = (a, b, amount) => {
    return a + (b - a) * amount;
  };


  const random = (min = 0, max = 1) => {
    return min + Math.random() * (max - min);
  };


  function setStatus(message, ok = true) {
    if (statusText) {
      statusText.textContent = message;
    }

    if (statusDot) {
      statusDot.style.background =
        ok ? "var(--green)" : "var(--red)";
    }
  }


  function setBoot(progress, message) {
    if (!bootProgress || !bootText || !bootPercent) {
      return;
    }

    const amount = clamp(progress, 0, 1);

    bootProgress.style.width =
      `${amount * 100}%`;

    bootPercent.textContent =
      `${String(Math.round(amount * 100)).padStart(2, "0")}%`;

    bootText.textContent = message;
  }


  // ============================================================
  // CANVAS RESIZE
  // ============================================================

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;

    state.dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    const pixelWidth = Math.max(
      1,
      Math.floor(state.width * state.dpr)
    );

    const pixelHeight = Math.max(
      1,
      Math.floor(state.height * state.dpr)
    );

    [fluidCanvas, asciiCanvas].forEach((canvas) => {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;

      canvas.style.width =
        `${state.width}px`;

      canvas.style.height =
        `${state.height}px`;
    });

    fluid.setTransform(
      state.dpr,
      0,
      0,
      state.dpr,
      0,
      0
    );

    ascii.setTransform(
      state.dpr,
      0,
      0,
      state.dpr,
      0,
      0
    );

    state.dirty = true;
  }


  // ============================================================
  // SOURCE CANVAS
  // ============================================================

  function clearSource() {
    sourceCanvas.width = 700;
    sourceCanvas.height = 500;

    source.fillStyle = "#000000";
    source.fillRect(
      0,
      0,
      700,
      500
    );
  }


  function createTextSource(value = "MELT") {
    clearSource();

    const text =
      value.trim() || "MELT";

    let size = 155;

    while (size > 35) {
      source.font =
        `600 ${size}px "Space Grotesk", Arial, sans-serif`;

      if (
        source.measureText(text).width <= 620
      ) {
        break;
      }

      size -= 4;
    }

    source.textAlign = "center";
    source.textBaseline = "middle";

    source.fillStyle = "#ffffff";

    source.fillText(
      text,
      350,
      250
    );

    state.sourceType = "text";
    state.dirty = true;
  }


  function createImageSource(image) {
    clearSource();

    const scale = Math.min(
      650 / image.width,
      450 / image.height
    );

    const width =
      image.width * scale;

    const height =
      image.height * scale;

    source.drawImage(
      image,

      350 - width / 2,
      250 - height / 2,

      width,
      height
    );

    state.sourceType = "image";
    state.dirty = true;
  }


  // ============================================================
  // SAMPLE SOURCE IMAGE
  // ============================================================

  function getSourceSamples() {
    const pixels =
      source.getImageData(
        0,
        0,
        700,
        500
      ).data;

    const samples = [];

    const desired =
      Math.floor(
        CONFIG.particles.base +
        (state.density / 100) *
        (
          CONFIG.particles.max -
          CONFIG.particles.base
        )
      );

    const step = Math.max(
      3,
      Math.floor(
        Math.sqrt(
          350000 /
          (desired * 1.7)
        )
      )
    );

    for (
      let y = 0;
      y < 500;
      y += step
    ) {
      for (
        let x = 0;
        x < 700;
        x += step
      ) {
        const index =
          (y * 700 + x) * 4;

        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const alpha = pixels[index + 3];

        const luminance =
          (r + g + b) / 3;

        if (
          alpha > 25 &&
          luminance > 12
        ) {
          samples.push({
            x,
            y,
            r,
            g,
            b,
            luminance
          });
        }
      }
    }

    return samples;
  }


  // ============================================================
  // COLOR SYSTEM
  // ============================================================

  function getColor(sample) {
    if (state.palette === "source") {
      return `rgb(
        ${sample.r},
        ${sample.g},
        ${sample.b}
      )`;
    }

    const stops =
      CONFIG.palettes[state.palette] ||
      CONFIG.palettes.matrix;

    const normalized =
      sample.luminance / 255;

    const scaled =
      normalized * (stops.length - 1);

    const index = Math.min(
      stops.length - 2,
      Math.floor(scaled)
    );

    const amount =
      scaled - index;

    const a = stops[index];
    const b = stops[index + 1];

    return `rgb(
      ${Math.round(
        lerp(a[0], b[0], amount)
      )},
      ${Math.round(
        lerp(a[1], b[1], amount)
      )},
      ${Math.round(
        lerp(a[2], b[2], amount)
      )}
    )`;
  }


  // ============================================================
  // PARTICLE CLASS
  // ============================================================

  class Particle {
    constructor(
      x,
      y,
      color,
      alpha
    ) {
      this.homeX = x;
      this.homeY = y;

      this.x = x;
      this.y = y;

      this.velocityX =
        random(-0.2, 0.2);

      this.velocityY =
        random(-0.2, 0.2);

      this.color = color;
      this.alpha = alpha;

      this.size =
        random(
          0.45,
          CONFIG.particles.size + 1.1
        );

      this.seed =
        random(0, 10000);
    }


    update(delta) {
      const t =
        state.time * 0.001;

      const normalizedX =
        this.x /
        Math.max(1, state.width);

      const normalizedY =
        this.y /
        Math.max(1, state.height);

      const angle =
        Math.sin(
          normalizedX * 7 +
          t * 0.72 +
          this.seed * 0.01
        ) * 1.6 +

        Math.cos(
          normalizedY * 9 -
          t * 0.53 +
          this.seed * 0.013
        ) * 1.2 +

        Math.sin(
          (normalizedX + normalizedY) *
          12 +
          t * 0.31
        ) * 0.75;


      const fieldForce =
        CONFIG.particles.field *
        (
          0.45 +
          (state.turbulence / 100) *
          1.6
        );


      const viscosity =
        state.viscosity / 100;


      this.velocityX +=
        Math.cos(angle) *
        fieldForce *
        delta *
        60;

      this.velocityY +=
        Math.sin(angle) *
        fieldForce *
        delta *
        60;


      const homeForce =
        CONFIG.particles.home +
        viscosity * 0.0045;


      this.velocityX +=
        (this.homeX - this.x) *
        homeForce;

      this.velocityY +=
        (this.homeY - this.y) *
        homeForce;


      // Mouse interaction
      if (state.mouse.active) {
        const dx =
          this.x -
          state.mouse.x;

        const dy =
          this.y -
          state.mouse.y;

        const distance =
          Math.hypot(dx, dy);

        const radius =
          CONFIG.particles.mouseRadius;

        if (
          distance < radius &&
          distance > 0.001
        ) {
          const forceAmount =
            Math.pow(
              1 - distance / radius,
              2
            );

          const push =
            CONFIG.particles.mouseForce *
            (
              0.35 +
              (state.turbulence / 100) *
              2.2
            );

          this.velocityX +=
            (dx / distance) *
            push *
            forceAmount *
            delta *
            60;

          this.velocityY +=
            (dy / distance) *
            push *
            forceAmount *
            delta *
            60;

          this.velocityX +=
            state.mouse.velocityX *
            0.045 *
            forceAmount;

          this.velocityY +=
            state.mouse.velocityY *
            0.045 *
            forceAmount;
        }
      }


      // Damping
      const damping =
        0.90 +
        viscosity * 0.075;

      this.velocityX *= damping;
      this.velocityY *= damping;


      // Move
      this.x +=
        this.velocityX *
        delta *
        60;

      this.y +=
        this.velocityY *
        delta *
        60;


      // Wrap around
      const margin = 80;

      if (this.x < -margin) {
        this.x =
          state.width + margin;
      }

      if (this.x > state.width + margin) {
        this.x = -margin;
      }

      if (this.y < -margin) {
        this.y =
          state.height + margin;
      }

      if (this.y > state.height + margin) {
        this.y = -margin;
      }
    }


    draw(context) {
      context.globalAlpha =
        this.alpha;

      context.fillStyle =
        this.color;

      context.fillRect(
        this.x,
        this.y,
        this.size,
        this.size
      );
    }
  }


  // ============================================================
  // BUILD PARTICLES
  // ============================================================

  function buildParticles() {
    const samples =
      getSourceSamples();

    state.particles = [];

    if (!samples.length) {
      return;
    }

    const scaleX =
      state.width / 700;

    const scaleY =
      state.height / 500;

    const scale =
      Math.min(scaleX, scaleY);

    const offsetX =
      (state.width - 700 * scale) / 2;

    const offsetY =
      (state.height - 500 * scale) / 2;


    for (const sample of samples) {
      const x =
        offsetX +
        sample.x * scale;

      const y =
        offsetY +
        sample.y * scale;

      const color =
        getColor(sample);

      const alpha =
        clamp(
          sample.luminance / 220,
          0.25,
          1
        );

      state.particles.push(
        new Particle(
          x,
          y,
          color,
          alpha
        )
      );
    }
  }


  // ============================================================
  // AMBIENT PARTICLES
  // ============================================================

  function buildAmbientParticles() {
    state.ambient = [];

    for (
      let i = 0;
      i < CONFIG.particles.ambient;
      i++
    ) {
      state.ambient.push({
        x: random(0, state.width),
        y: random(0, state.height),

        size: random(0.2, 0.8),

        alpha: random(0.03, 0.16),

        speed: random(0.05, 0.4),

        seed: random(0, 10000)
      });
    }
  }


  // ============================================================
  // UPDATE PARTICLES
  // ============================================================

  function update(delta) {
    for (const particle of state.particles) {
      particle.update(delta);
    }


    for (const particle of state.ambient) {
      particle.y -=
        particle.speed *
        delta *
        60;

      particle.x +=
        Math.sin(
          state.time * 0.0005 +
          particle.seed
        ) *
        0.08;

      if (particle.y < -5) {
        particle.y =
          state.height + 5;

        particle.x =
          random(0, state.width);
      }
    }


    state.mouse.velocityX *= 0.82;
    state.mouse.velocityY *= 0.82;
  }


  // ============================================================
  // FLUID RENDERER
  // ============================================================

  function renderFluid() {
    fluid.globalCompositeOperation =
      "source-over";

    fluid.fillStyle =
      "rgba(2, 3, 2, 0.18)";

    fluid.fillRect(
      0,
      0,
      state.width,
      state.height
    );


    // Ambient field
    for (const particle of state.ambient) {
      fluid.globalAlpha =
        particle.alpha;

      fluid.fillStyle =
        "rgba(125,255,171,1)";

      fluid.fillRect(
        particle.x,
        particle.y,
        particle.size,
        particle.size
      );
    }


    // Main matter
    fluid.globalCompositeOperation =
      "lighter";


    for (const particle of state.particles) {
      particle.draw(fluid);
    }


    fluid.globalCompositeOperation =
      "source-over";

    fluid.globalAlpha = 1;
  }


  // ============================================================
  // ASCII RENDERER
  // ============================================================

  function renderASCII() {
    ascii.clearRect(
      0,
      0,
      state.width,
      state.height
    );


    const cellSize =
      clamp(
        Math.round(
          CONFIG.ascii.maxCell -
          (state.density / 100) *
          (
            CONFIG.ascii.maxCell -
            CONFIG.ascii.minCell
          )
        ),
        CONFIG.ascii.minCell,
        CONFIG.ascii.maxCell
      );


    const cols =
      Math.ceil(
        state.width /
        cellSize
      );

    const rows =
      Math.ceil(
        state.height /
        cellSize
      );


    ascii.font =
      `${cellSize}px "Space Mono", monospace`;

    ascii.textAlign =
      "center";

    ascii.textBaseline =
      "middle";


    const sourcePixels =
      source.getImageData(
        0,
        0,
        700,
        500
      ).data;


    const scaleX =
      700 /
      Math.max(1, state.width);

    const scaleY =
      500 /
      Math.max(1, state.height);


    const chars =
      CONFIG.ascii.chars;


    for (
      let row = 0;
      row < rows;
      row++
    ) {
      for (
        let col = 0;
        col < cols;
        col++
      ) {
        let x =
          col * cellSize +
          cellSize / 2;

        let y =
          row * cellSize +
          cellSize / 2;


        const wave =
          Math.sin(
            x * 0.018 +
            state.time * 0.0012
          ) *
          CONFIG.ascii.distortion *
          0.15;


        const wave2 =
          Math.cos(
            y * 0.022 -
            state.time * 0.001
          ) *
          CONFIG.ascii.distortion *
          0.15;


        const sourceX =
          clamp(
            Math.floor(
              (x + wave) *
              scaleX
            ),
            0,
            699
          );


        const sourceY =
          clamp(
            Math.floor(
              (y + wave2) *
              scaleY
            ),
            0,
            499
          );


        const index =
          (sourceY * 700 +
          sourceX) * 4;


        const r =
          sourcePixels[index];

        const g =
          sourcePixels[index + 1];

        const b =
          sourcePixels[index + 2];


        const brightness =
          (r + g + b) / 3;


        if (brightness < 18) {
          continue;
        }


        const charIndex =
          clamp(
            Math.floor(
              (brightness / 255) *
              (chars.length - 1)
            ),
            0,
            chars.length - 1
          );


        const character =
          chars[charIndex];


        let color;


        if (state.palette === "matrix") {
          color =
            `rgba(
              125,
              255,
              171,
              ${clamp(
                brightness / 255,
                0.12,
                0.95
              )}
            )`;
        }

        else if (state.palette === "amber") {
          color =
            `rgba(
              255,
              181,
              47,
              ${clamp(
                brightness / 255,
                0.12,
                0.95
              )}
            )`;
        }

        else if (state.palette === "mono") {
          color =
            `rgba(
              235,
              235,
              230,
              ${clamp(
                brightness / 255,
                0.12,
                0.95
              )}
            )`;
        }

        else {
          color =
            `rgba(
              ${r},
              ${g},
              ${b},
              ${clamp(
                brightness / 255,
                0.12,
                0.95
              )}
            )`;
        }


        ascii.fillStyle =
          color;

        ascii.fillText(
          character,
          x,
          y
        );
      }
    }
  }


  // ============================================================
  // RENDER
  // ============================================================

  function render() {
    if (
      state.mode === "fluid" ||
      state.mode === "both"
    ) {
      renderFluid();
      fluidCanvas.style.opacity = "1";
    } else {
      fluidCanvas.style.opacity = "0";
    }


    if (
      state.mode === "ascii" ||
      state.mode === "both"
    ) {
      renderASCII();
      asciiCanvas.style.opacity = "1";
    } else {
      asciiCanvas.style.opacity = "0";
    }
  }


  // ============================================================
  // ANIMATION LOOP
  // ============================================================

  function animationFrame(now) {
    const delta =
      clamp(
        (now - state.lastTime) / 1000,
        0.001,
        0.033
      );

    state.lastTime = now;
    state.time = now;


    update(delta);
    render();


    state.frameCount++;


    if (
      now - state.fpsClock >
      500
    ) {
      const seconds =
        (now - state.fpsClock) /
        1000;

      if (fpsCounter) {
        fpsCounter.textContent =
          `${Math.round(
            state.frameCount /
            seconds
          )} FPS`;
      }

      state.frameCount = 0;
      state.fpsClock = now;
    }


    requestAnimationFrame(
      animationFrame
    );
  }


  // ============================================================
  // POINTER / MOUSE
  // ============================================================

  function updatePointer(
    clientX,
    clientY
  ) {
    const rect =
      fluidCanvas.getBoundingClientRect();

    const x =
      clientX - rect.left;

    const y =
      clientY - rect.top;


    state.mouse.velocityX =
      x - state.mouse.previousX;

    state.mouse.velocityY =
      y - state.mouse.previousY;


    state.mouse.previousX = x;
    state.mouse.previousY = y;


    state.mouse.x = x;
    state.mouse.y = y;


    state.mouse.active = true;


    if (pointerX) {
      pointerX.textContent =
        String(
          Math.round(x)
        ).padStart(4, "0");
    }


    if (pointerY) {
      pointerY.textContent =
        String(
          Math.round(y)
        ).padStart(4, "0");
    }


    if (pointerHint) {
      pointerHint.classList.add(
        "hidden"
      );
    }
  }


  fluidCanvas.addEventListener(
    "pointermove",
    (event) => {
      updatePointer(
        event.clientX,
        event.clientY
      );
    }
  );


  fluidCanvas.addEventListener(
    "pointerleave",
    () => {
      state.mouse.active = false;
    }
  );


  // ============================================================
  // IMAGE INPUT
  // ============================================================

  function loadImageFile(file) {
    if (!file) {
      return;
    }


    if (
      !file.type.startsWith("image/")
    ) {
      setStatus(
        "INVALID IMAGE",
        false
      );

      return;
    }


    const reader =
      new FileReader();


    reader.onload = () => {
      const image =
        new Image();


      image.onload = () => {
        createImageSource(image);

        if (imageName) {
          imageName.textContent =
            file.name;
        }

        if (imageMeta) {
          imageMeta.hidden = false;
        }

        setStatus(
          "IMAGE LOADED"
        );
      };


      image.onerror = () => {
        setStatus(
          "IMAGE FAILED",
          false
        );
      };


      image.src =
        reader.result;
    };


    reader.onerror = () => {
      setStatus(
        "FILE READ FAILED",
        false
      );
    };


    reader.readAsDataURL(file);
  }


  if (fileInput) {
    fileInput.addEventListener(
      "change",
      (event) => {
        loadImageFile(
          event.target.files[0]
        );
      }
    );
  }


  if (dropzone) {
    dropzone.addEventListener(
      "dragover",
      (event) => {
        event.preventDefault();

        dropzone.classList.add(
          "drag"
        );
      }
    );


    dropzone.addEventListener(
      "dragleave",
      () => {
        dropzone.classList.remove(
          "drag"
        );
      }
    );


    dropzone.addEventListener(
      "drop",
      (event) => {
        event.preventDefault();

        dropzone.classList.remove(
          "drag"
        );

        loadImageFile(
          event.dataTransfer.files[0]
        );
      }
    );
  }


  if (imageClear) {
    imageClear.addEventListener(
      "click",
      () => {
        if (fileInput) {
          fileInput.value = "";
        }

        if (imageMeta) {
          imageMeta.hidden = true;
        }

        createTextSource("MELT");

        setStatus(
          "GENERATED SOURCE"
        );
      }
    );
  }


  // ============================================================
  // TEXT INPUT
  // ============================================================

  if (textInput) {
    textInput.addEventListener(
      "input",
      () => {
        if (textCount) {
          textCount.textContent =
            `${textInput.value.length} / 120`;
        }
      }
    );
  }


  function injectText() {
    createTextSource(
      textInput
        ? textInput.value
        : "MELT"
    );

    setStatus(
      "TEXT INJECTED"
    );
  }


  if (textApply) {
    textApply.addEventListener(
      "click",
      injectText
    );
  }


  if (textInput) {
    textInput.addEventListener(
      "keydown",
      (event) => {
        if (
          (event.ctrlKey ||
            event.metaKey) &&
          event.key === "Enter"
        ) {
          injectText();
        }
      }
    );
  }


  // ============================================================
  // SOURCE TABS
  // ============================================================

  document
    .querySelectorAll(".source-tab")
    .forEach((tab) => {

      tab.addEventListener(
        "click",
        () => {

          const imageMode =
            tab.id === "tab-image";


          document
            .querySelectorAll(".source-tab")
            .forEach((item) => {

              item.classList.toggle(
                "active",
                item === tab
              );

            });


          const inputImage =
            $("input-image");

          const inputText =
            $("input-text");


          if (inputImage) {
            inputImage.hidden =
              !imageMode;
          }


          if (inputText) {
            inputText.hidden =
              imageMode;
          }
        }
      );

    });


  // ============================================================
  // RENDER MODES
  // ============================================================

  document
    .querySelectorAll(".mode")
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          state.mode =
            button.dataset.mode;


          document
            .querySelectorAll(".mode")
            .forEach((item) => {

              item.classList.toggle(
                "active",
                item === button
              );

            });


          if (state.mode === "ascii") {

            if (densityLabel) {
              densityLabel.firstChild.textContent =
                "CELL SIZE ";
            }

            if (densityHint) {
              densityHint.textContent =
                "smaller = more characters";
            }

          } else {

            if (densityLabel) {
              densityLabel.firstChild.textContent =
                "GRAIN ";
            }

            if (densityHint) {
              densityHint.textContent =
                "controls particle density";
            }

          }


          setStatus(
            `${state.mode.toUpperCase()} FIELD`
          );
        }
      );

    });


  // ============================================================
  // SLIDERS
  // ============================================================

  function syncControls() {
    if (turbulence) {
      state.turbulence =
        Number(turbulence.value);
    }

    if (viscosity) {
      state.viscosity =
        Number(viscosity.value);
    }

    if (density) {
      state.density =
        Number(density.value);
    }


    if (turbulenceValue) {
      turbulenceValue.textContent =
        state.turbulence;
    }

    if (viscosityValue) {
      viscosityValue.textContent =
        state.viscosity;
    }

    if (densityValue) {
      densityValue.textContent =
        state.density;
    }


    state.dirty = true;
  }


  if (turbulence) {
    turbulence.addEventListener(
      "input",
      syncControls
    );
  }


  if (viscosity) {
    viscosity.addEventListener(
      "input",
      syncControls
    );
  }


  if (density) {
    density.addEventListener(
      "input",
      () => {
        syncControls();

        buildParticles();
      }
    );
  }


  // ============================================================
  // PALETTES
  // ============================================================

  document
    .querySelectorAll(".palette")
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          state.palette =
            button.dataset.palette;


          document
            .querySelectorAll(".palette")
            .forEach((item) => {

              item.classList.toggle(
                "active",
                item === button
              );

            });


          buildParticles();

          state.dirty = true;


          setStatus(
            `${state.palette.toUpperCase()} PALETTE`
          );
        }
      );

    });


  // ============================================================
  // RESET
  // ============================================================

  function reset() {

    if (turbulence) {
      turbulence.value = 45;
    }

    if (viscosity) {
      viscosity.value = 20;
    }

    if (density) {
      density.value = 55;
    }


    state.mode = "fluid";
    state.palette = "source";


    document
      .querySelectorAll(".mode")
      .forEach((button) => {

        button.classList.toggle(
          "active",
          button.dataset.mode === "fluid"
        );

      });


    document
      .querySelectorAll(".palette")
      .forEach((button) => {

        button.classList.toggle(
          "active",
          button.dataset.palette === "source"
        );

      });


    if (textInput) {
      textInput.value = "";
    }


    if (textCount) {
      textCount.textContent =
        "0 / 120";
    }


    if (fileInput) {
      fileInput.value = "";
    }


    if (imageMeta) {
      imageMeta.hidden = true;
    }


    createTextSource("MELT");

    syncControls();

    buildAmbientParticles();
    buildParticles();


    fluid.clearRect(
      0,
      0,
      state.width,
      state.height
    );


    ascii.clearRect(
      0,
      0,
      state.width,
      state.height
    );


    setStatus(
      "FIELD RESET"
    );
  }


  if (resetButton) {
    resetButton.addEventListener(
      "click",
      reset
    );
  }


  if (brandReset) {
    brandReset.addEventListener(
      "click",
      reset
    );
  }


  // ============================================================
  // SAVE FRAME
  // ============================================================

  if (saveButton) {
    saveButton.addEventListener(
      "click",
      () => {

        const output =
          document.createElement(
            "canvas"
          );


        output.width =
          fluidCanvas.width;

        output.height =
          fluidCanvas.height;


        const context =
          output.getContext("2d");


        context.fillStyle =
          "#020302";


        context.fillRect(
          0,
          0,
          output.width,
          output.height
        );


        if (
          state.mode !== "ascii"
        ) {
          context.drawImage(
            fluidCanvas,
            0,
            0
          );
        }


        if (
          state.mode !== "fluid"
        ) {
          context.drawImage(
            asciiCanvas,
            0,
            0
          );
        }


        const link =
          document.createElement("a");


        link.download =
          `melt-${Date.now()}.png`;


        link.href =
          output.toDataURL(
            "image/png"
          );


        link.click();
      }
    );
  }


  // ============================================================
  // PANEL
  // ============================================================

  function setPanelOpen(open) {

    if (!panel) {
      return;
    }

    panel.classList.toggle(
      "closed",
      !open
    );


    if (panelToggle) {
      panelToggle.setAttribute(
        "aria-expanded",
        String(open)
      );
    }
  }


  if (panelClose) {
    panelClose.addEventListener(
      "click",
      () => {
        setPanelOpen(false);
      }
    );
  }


  if (panelToggle) {
    panelToggle.addEventListener(
      "click",
      () => {

        const closed =
          panel.classList.contains(
            "closed"
          );

        setPanelOpen(closed);
      }
    );
  }


  // ============================================================
  // KEYBOARD
  // ============================================================

  window.addEventListener(
    "keydown",
    (event) => {

      if (event.key === "Escape") {
        setPanelOpen(false);
      }


      const activeElement =
        document.activeElement;


      const editing =
        activeElement &&
        (
          activeElement.tagName ===
            "TEXTAREA" ||

          activeElement.tagName ===
            "INPUT"
        );


      if (
        event.key.toLowerCase() === "r" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !editing
      ) {
        reset();
      }

    }
  );


  // ============================================================
  // RESIZE
  // ============================================================

  window.addEventListener(
    "resize",
    () => {

      resize();

      buildAmbientParticles();
      buildParticles();

    }
  );


  // ============================================================
  // ERROR HANDLING
  // ============================================================

  function showError(error) {

    console.error(
      "MELT error:",
      error
    );


    if (errorScreen) {
      errorScreen.hidden = false;
    }


    if (errorText) {
      errorText.textContent =
        error?.message ||
        "Renderer initialization failed.";
    }


    if (boot) {
      boot.classList.add("done");
    }


    setStatus(
      "FIELD ERROR",
      false
    );
  }


  if ($("error-retry")) {
    $("error-retry").addEventListener(
      "click",
      () => {

        if (errorScreen) {
          errorScreen.hidden = true;
        }

        start();

      }
    );
  }


  // ============================================================
  // STARTUP
  // ============================================================

  function start() {

    try {

      setBoot(
        0.10,
        "CREATING CANVAS..."
      );

      resize();


      setBoot(
        0.30,
        "CREATING SOURCE..."
      );

      createTextSource("MELT");


      setBoot(
        0.50,
        "CREATING MATTER..."
      );

      buildAmbientParticles();
      buildParticles();


      setBoot(
        0.75,
        "STARTING FIELD..."
      );

      syncControls();


      fluid.fillStyle =
        "#020302";

      fluid.fillRect(
        0,
        0,
        state.width,
        state.height
      );


      setBoot(
        1,
        "FIELD ONLINE"
      );

      setStatus(
        "FIELD ONLINE"
      );


      requestAnimationFrame(
        animationFrame
      );


      window.setTimeout(
        () => {

          if (boot) {
            boot.classList.add(
              "done"
            );
          }

        },
        300
      );

    } catch (error) {

      showError(error);

    }
  }


  // ============================================================
  // LAUNCH
  // ============================================================

  start();

})();
