/* =========================================================
   MELT — DIGITAL MATTER EXPERIMENT
   Canvas 2D Visual Engine
   No WebGL
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       HELPERS
       ===================================================== */

    const $ = (id) => document.getElementById(id);

    const clamp = (v, min, max) =>
        Math.max(min, Math.min(max, v));

    const lerp = (a, b, t) =>
        a + (b - a) * t;

    const rand = (min = 0, max = 1) =>
        Math.random() * (max - min) + min;

    const choose = (arr) =>
        arr[Math.floor(Math.random() * arr.length)];

    const dist = (x1, y1, x2, y2) =>
        Math.hypot(x2 - x1, y2 - y1);


    /* =====================================================
       CANVAS
       ===================================================== */

    const fluidCanvas =
        $("fluid-canvas") ||
        $("glcanvas") ||
        document.querySelector("canvas");

    const asciiCanvas =
        $("ascii-canvas") ||
        $("asciicanvas");

    if (!fluidCanvas) {
        console.warn("MELT: fluid canvas not found.");
        return;
    }

    const fluid =
        fluidCanvas.getContext("2d", {
            alpha: true
        });

    const ascii =
        asciiCanvas
            ? asciiCanvas.getContext("2d", {
                alpha: true
            })
            : null;

    if (!fluid) {
        console.warn("MELT: Canvas 2D context unavailable.");
        return;
    }


    /* =====================================================
       UI
       ===================================================== */

    const boot = $("boot");
    const bootProgress = $("boot-progress");
    const bootText = $("boot-text");
    const bootPercent = $("boot-percent");

    const statusText =
        $("status-text") ||
        $("status");

    const statusDot =
        $("status-dot");

    const fileInput =
        $("file-input");

    const dropzone =
        $("dropzone");

    const textInput =
        $("text-input");

    const textApply =
        $("text-apply");

    const resetButton =
        $("reset") ||
        $("reset-button");

    const saveButton =
        $("save") ||
        $("save-frame");

    const panelToggle =
        $("panel-toggle");

    const turbulenceInput =
        $("turbulence");

    const viscosityInput =
        $("viscosity");

    const grainInput =
        $("grain");

    const modeButtons = [
        ...document.querySelectorAll(
            ".seg-btn, .mode-btn, [data-mode]"
        )
    ];

    const paletteButtons = [
        ...document.querySelectorAll(
            ".swatch, .palette-btn, [data-palette]"
        )
    ];


    /* =====================================================
       CONFIG
       ===================================================== */

    const CONFIG = {

        particleCount: 1700,

        trailParticles: 260,

        maxParticles: 2600,

        sourceWidth: 620,

        sourceHeight: 320,

        sampleStep: 5,

        particleSize: 1.4,

        defaultTurbulence: 0.55,

        defaultViscosity: 0.88,

        defaultGrain: 0.16,

        interactionRadius: 170,

        textSize: 118,

        textMaxWidth: 580,

        idleSpeed: 0.00045,

        waveStrength: 0.9,

        distortionStrength: 1.0

    };


    /* =====================================================
       STATE
       ===================================================== */

    const S = {

        w: 1,

        h: 1,

        dpr: Math.min(
            window.devicePixelRatio || 1,
            2
        ),

        time: 0,

        lastTime: performance.now(),

        frame: 0,

        mode: "both",

        palette: "matrix",

        sourceType: "text",

        sourceText: "MELT",

        sourceImage: null,

        sourceCanvas: null,

        sourceCtx: null,

        sourcePoints: [],

        particles: [],

        ribbons: [],

        blocks: [],

        sparks: [],

        mouse: {

            x: 0,

            y: 0,

            px: 0,

            py: 0,

            active: false,

            down: false

        },

        settings: {

            turbulence: CONFIG.defaultTurbulence,

            viscosity: CONFIG.defaultViscosity,

            grain: CONFIG.defaultGrain

        },

        paletteData: null,

        initialized: false,

        booted: false

    };


    /* =====================================================
       PALETTES
       ===================================================== */

    const PALETTES = {

        matrix: {

            background: "#020503",

            primary: "#8affb4",

            secondary: "#2f9b59",

            dim: "#174b2d",

            light: "#d8ffe5",

            dark: "#07150c"

        },

        ember: {

            background: "#080303",

            primary: "#ff8f7a",

            secondary: "#a9342b",

            dim: "#4d1713",

            light: "#ffe1da",

            dark: "#160706"

        },

        ice: {

            background: "#03080a",

            primary: "#9feaff",

            secondary: "#397e9a",

            dim: "#173d4a",

            light: "#e0f8ff",

            dark: "#06151a"

        },

        mono: {

            background: "#050505",

            primary: "#eeeeee",

            secondary: "#888888",

            dim: "#333333",

            light: "#ffffff",

            dark: "#111111"

        }

    };


    S.paletteData =
        PALETTES[S.palette];


    /* =====================================================
       BOOT
       ===================================================== */

    function bootSet(progress, message) {

        progress = clamp(progress, 0, 1);

        if (bootProgress) {
            bootProgress.style.width =
                `${progress * 100}%`;
        }

        if (bootPercent) {
            bootPercent.textContent =
                `${String(
                    Math.round(progress * 100)
                ).padStart(2, "0")}%`;
        }

        if (bootText) {
            bootText.textContent = message;
        }
    }


    function statusSet(message, online = true) {

        if (statusText) {
            statusText.textContent = message;
        }

        if (statusDot) {
            statusDot.style.opacity =
                online ? "1" : "0.35";
        }
    }


    /* =====================================================
       SOURCE CANVAS
       ===================================================== */

    function createSourceCanvas() {

        S.sourceCanvas =
            document.createElement("canvas");

        S.sourceCanvas.width =
            CONFIG.sourceWidth;

        S.sourceCanvas.height =
            CONFIG.sourceHeight;

        S.sourceCtx =
            S.sourceCanvas.getContext("2d", {
                willReadFrequently: true
            });
    }


    /* =====================================================
       CREATE TEXT SOURCE
       ===================================================== */

    function createTextSource(text) {

        if (!S.sourceCtx) {
            createSourceCanvas();
        }

        const ctx = S.sourceCtx;

        const w = CONFIG.sourceWidth;
        const h = CONFIG.sourceHeight;

        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);

        text =
            String(text || "MELT")
                .trim()
                .slice(0, 42);

        if (!text) {
            text = "MELT";
        }

        let size = CONFIG.textSize;

        ctx.font =
            `900 ${size}px Arial, Helvetica, sans-serif`;

        while (
            ctx.measureText(text).width >
                CONFIG.textMaxWidth &&
            size > 35
        ) {

            size -= 4;

            ctx.font =
                `900 ${size}px Arial, Helvetica, sans-serif`;
        }

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const centerX = w / 2;
        const centerY = h / 2;

        /* Main source */
        ctx.fillStyle = "#ffffff";

        ctx.fillText(
            text,
            centerX,
            centerY
        );

        /* Slight secondary source creates
           depth for the liquid simulation. */

        ctx.globalAlpha = 0.32;

        ctx.fillText(
            text,
            centerX + 5,
            centerY + 3
        );

        ctx.globalAlpha = 1;

        /* Thin horizontal distortion marks */

        for (let i = 0; i < 14; i++) {

            const y =
                rand(
                    centerY - size * 0.45,
                    centerY + size * 0.45
                );

            const width =
                rand(30, 190);

            ctx.globalAlpha =
                rand(0.04, 0.18);

            ctx.fillRect(
                rand(30, w - width - 30),
                y,
                width,
                rand(1, 3)
            );
        }

        ctx.globalAlpha = 1;

        S.sourceType = "text";
        S.sourceText = text;

        extractSourcePoints();

        rebuildParticles();

        createRibbons();

        createBlocks();

        statusSet("TEXT INJECTED", true);
    }


    /* =====================================================
       IMAGE SOURCE
       ===================================================== */

    function createImageSource(image) {

        if (!S.sourceCtx) {
            createSourceCanvas();
        }

        const ctx = S.sourceCtx;

        const w = CONFIG.sourceWidth;
        const h = CONFIG.sourceHeight;

        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);

        const scale =
            Math.min(
                w / image.width,
                h / image.height
            );

        const dw =
            image.width * scale;

        const dh =
            image.height * scale;

        const dx =
            (w - dw) / 2;

        const dy =
            (h - dh) / 2;

        ctx.drawImage(
            image,
            dx,
            dy,
            dw,
            dh
        );

        /* Convert image to strong monochrome
           source for the matter field. */

        const imageData =
            ctx.getImageData(
                0,
                0,
                w,
                h
            );

        const data =
            imageData.data;

        for (
            let i = 0;
            i < data.length;
            i += 4
        ) {

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const brightness =
                (r * 0.299) +
                (g * 0.587) +
                (b * 0.114);

            const value =
                brightness > 100
                    ? 255
                    : brightness * 0.35;

            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
        }

        ctx.putImageData(
            imageData,
            0,
            0
        );

        S.sourceType = "image";
        S.sourceImage = image;

        extractSourcePoints();

        rebuildParticles();

        createRibbons();

        createBlocks();

        statusSet("IMAGE INJECTED", true);
    }


    /* =====================================================
       EXTRACT SOURCE POINTS
       ===================================================== */

    function extractSourcePoints() {

        S.sourcePoints.length = 0;

        if (!S.sourceCtx) {
            return;
        }

        const w = CONFIG.sourceWidth;
        const h = CONFIG.sourceHeight;

        const image =
            S.sourceCtx.getImageData(
                0,
                0,
                w,
                h
            );

        const data = image.data;

        const step =
            CONFIG.sampleStep;

        for (
            let y = 0;
            y < h;
            y += step
        ) {

            for (
                let x = 0;
                x < w;
                x += step
            ) {

                const index =
                    ((y * w) + x) * 4;

                const brightness =
                    data[index];

                if (brightness > 55) {

                    S.sourcePoints.push({

                        x,

                        y,

                        strength:
                            brightness / 255

                    });
                }
            }
        }

        /* Avoid excessive source points */

        if (
            S.sourcePoints.length >
            CONFIG.maxParticles
        ) {

            const reduced = [];

            const ratio =
                CONFIG.maxParticles /
                S.sourcePoints.length;

            for (
                const point
                of S.sourcePoints
            ) {

                if (Math.random() < ratio) {
                    reduced.push(point);
                }
            }

            S.sourcePoints =
                reduced;
        }
    }


    /* =====================================================
       MAP SOURCE TO SCREEN
       ===================================================== */

    function sourceToScreen(point) {

        const scale =
            Math.min(
                S.w / CONFIG.sourceWidth,
                S.h / CONFIG.sourceHeight
            ) * 0.72;

        const width =
            CONFIG.sourceWidth * scale;

        const height =
            CONFIG.sourceHeight * scale;

        const ox =
            (S.w - width) / 2;

        const oy =
            (S.h - height) / 2;

        return {

            x:
                ox + point.x * scale,

            y:
                oy + point.y * scale,

            scale

        };
    }


    /* =====================================================
       PARTICLES
       ===================================================== */

    function makeParticle(point, index) {

        const p =
            sourceToScreen(point);

        return {

            ox: p.x,

            oy: p.y,

            x:
                p.x + rand(-10, 10),

            y:
                p.y + rand(-10, 10),

            vx: rand(-0.2, 0.2),

            vy: rand(-0.2, 0.2),

            size:
                rand(0.5, 1.9) *
                (0.6 + point.strength),

            life:
                rand(0, Math.PI * 2),

            seed:
                rand(0, 10000),

            strength:
                point.strength,

            index

        };
    }


    function rebuildParticles() {

        S.particles.length = 0;

        const points =
            S.sourcePoints;

        if (!points.length) {
            return;
        }

        const amount =
            Math.min(
                CONFIG.particleCount,
                points.length
            );

        for (
            let i = 0;
            i < amount;
            i++
        ) {

            const point =
                points[
                    Math.floor(
                        Math.random() *
                        points.length
                    )
                ];

            S.particles.push(
                makeParticle(
                    point,
                    i
                )
            );
        }

        for (
            let i = 0;
            i < CONFIG.trailParticles;
            i++
        ) {

            const point =
                choose(points);

            const p =
                sourceToScreen(point);

            S.particles.push({

                ox: p.x,

                oy: p.y,

                x:
                    p.x + rand(-100, 100),

                y:
                    p.y + rand(-100, 100),

                vx: rand(-1, 1),

                vy: rand(-1, 1),

                size: rand(0.4, 1.2),

                life: rand(0, 6),

                seed: rand(0, 99999),

                strength:
                    point.strength * 0.5,

                index:
                    points.length + i

            });
        }
    }


    /* =====================================================
       FLOW FIELD
       ===================================================== */

    function flowField(x, y, t, seed) {

        const turbulence =
            S.settings.turbulence;

        const scale = 0.0065;

        const a =
            Math.sin(
                x * scale +
                t * 1.2 +
                seed
            );

        const b =
            Math.cos(
                y * scale * 1.3 -
                t * 0.9 +
                seed * 0.4
            );

        const c =
            Math.sin(
                (x + y) *
                scale *
                0.45 +
                t * 0.65
            );

        const d =
            Math.cos(
                (x - y) *
                scale *
                0.35 -
                t * 0.5
            );

        return {

            x:
                (a + c) *
                turbulence,

            y:
                (b - d) *
                turbulence

        };
    }


    /* =====================================================
       PARTICLE UPDATE
       ===================================================== */

    function updateParticles(dt) {

        const mouse =
            S.mouse;

        const time =
            S.time;

        const viscosity =
            S.settings.viscosity;

        for (
            const p
            of S.particles
        ) {

            const flow =
                flowField(
                    p.x,
                    p.y,
                    time,
                    p.seed * 0.001
                );

            p.vx +=
                flow.x *
                0.025 *
                dt;

            p.vy +=
                flow.y *
                0.025 *
                dt;

            /* Return force toward source */

            const dx =
                p.ox - p.x;

            const dy =
                p.oy - p.y;

            const distance =
                Math.hypot(dx, dy) + 0.001;

            const returnForce =
                0.0035 *
                viscosity;

            p.vx +=
                dx *
                returnForce;

            p.vy +=
                dy *
                returnForce;

            /* Organic oscillation */

            const wave =
                Math.sin(
                    time * 2.0 +
                    p.seed
                );

            p.vx +=
                wave *
                0.006;

            p.vy +=
                Math.cos(
                    time * 1.7 +
                    p.seed * 0.7
                ) *
                0.006;

            /* Mouse interaction */

            if (mouse.active) {

                const md =
                    dist(
                        p.x,
                        p.y,
                        mouse.x,
                        mouse.y
                    );

                if (
                    md <
                    CONFIG.interactionRadius
                ) {

                    const force =
                        1 -
                        md /
                        CONFIG.interactionRadius;

                    const angle =
                        Math.atan2(
                            p.y - mouse.y,
                            p.x - mouse.x
                        );

                    const push =
                        force *
                        force *
                        (mouse.down
                            ? 1.7
                            : 0.65);

                    p.vx +=
                        Math.cos(angle) *
                        push;

                    p.vy +=
                        Math.sin(angle) *
                        push;

                    /* swirl */

                    p.vx +=
                        -Math.sin(angle) *
                        force *
                        0.7;

                    p.vy +=
                        Math.cos(angle) *
                        force *
                        0.7;
                }
            }

            /* Damping */

            p.vx *=
                Math.pow(
                    viscosity,
                    dt * 0.06
                );

            p.vy *=
                Math.pow(
                    viscosity,
                    dt * 0.06
                );

            p.x +=
                p.vx * dt;

            p.y +=
                p.vy * dt;

            /* Very soft screen containment */

            if (
                p.x < -100 ||
                p.x > S.w + 100 ||
                p.y < -100 ||
                p.y > S.h + 100
            ) {

                p.x =
                    lerp(
                        p.x,
                        p.ox,
                        0.02
                    );

                p.y =
                    lerp(
                        p.y,
                        p.oy,
                        0.02
                    );
            }
        }
    }


    /* =====================================================
       RIBBONS
       ===================================================== */

    function createRibbons() {

        S.ribbons.length = 0;

        const count = 34;

        for (
            let i = 0;
            i < count;
            i++
        ) {

            const points = [];

            const y =
                S.h * 0.25 +
                (i / count) *
                S.h * 0.5;

            for (
                let j = 0;
                j < 30;
                j++
            ) {

                points.push({

                    x:
                        -100 +
                        j *
                        ((S.w + 200) / 29),

                    y:
                        y +
                        rand(-25, 25),

                    phase:
                        rand(
                            0,
                            Math.PI * 2
                        ),

                    speed:
                        rand(
                            0.4,
                            1.2
                        )

                });
            }

            S.ribbons.push(points);
        }
    }


    function updateRibbons() {

        for (
            const ribbon
            of S.ribbons
        ) {

            for (
                const p
                of ribbon
            ) {

                p.y +=
                    Math.sin(
                        S.time *
                        p.speed +
                        p.phase +
                        p.x * 0.003
                    ) *
                    0.45;

                p.y +=
                    Math.sin(
                        S.time * 0.7 +
                        p.x * 0.008
                    ) *
                    0.25;
            }
        }
    }


    function drawRibbons() {

        const P =
            S.paletteData;

        fluid.save();

        fluid.globalCompositeOperation =
            "screen";

        fluid.lineWidth = 0.7;

        for (
            let r = 0;
            r < S.ribbons.length;
            r++
        ) {

            const ribbon =
                S.ribbons[r];

            fluid.beginPath();

            for (
                let i = 0;
                i < ribbon.length;
                i++
            ) {

                const p =
                    ribbon[i];

                const wave =
                    Math.sin(
                        S.time * 1.2 +
                        i * 0.35 +
                        r
                    ) *
                    10 *
                    S.settings.turbulence;

                const x = p.x;

                const y =
                    p.y + wave;

                if (i === 0) {
                    fluid.moveTo(x, y);
                } else {
                    fluid.lineTo(x, y);
                }
            }

            const alpha =
                0.025 +
                (r % 5) * 0.006;

            fluid.strokeStyle =
                `rgba(138,255,180,${alpha})`;

            fluid.stroke();
        }

        fluid.restore();
    }


    /* =====================================================
       BLOCKS
       ===================================================== */

    function createBlocks() {

        S.blocks.length = 0;

        for (
            let i = 0;
            i < 75;
            i++
        ) {

            S.blocks.push({

                x: rand(0, S.w),

                y: rand(
                    S.h * 0.2,
                    S.h * 0.8
                ),

                w:
                    rand(3, 40),

                h:
                    rand(1, 6),

                speed:
                    rand(
                        0.2,
                        1.4
                    ),

                phase:
                    rand(0, 10),

                alpha:
                    rand(
                        0.05,
                        0.3
                    )

            });
        }
    }


    function updateBlocks() {

        for (
            const b
            of S.blocks
        ) {

            b.x -=
                b.speed *
                S.settings.turbulence;

            b.y +=
                Math.sin(
                    S.time +
                    b.phase
                ) *
                0.15;

            if (b.x < -60) {
                b.x = S.w + 60;
            }
        }
    }


    function drawBlocks() {

        const P =
            S.paletteData;

        fluid.save();

        fluid.globalCompositeOperation =
            "screen";

        for (
            const b
            of S.blocks
        ) {

            fluid.globalAlpha =
                b.alpha;

            fluid.fillStyle =
                P.secondary;

            fluid.fillRect(
                b.x,
                b.y,
                b.w,
                b.h
            );
        }

        fluid.restore();
    }


    /* =====================================================
       SPARKS
       ===================================================== */

    function createSparks() {

        S.sparks.length = 0;

        for (
            let i = 0;
            i < 110;
            i++
        ) {

            S.sparks.push({

                x: rand(0, S.w),

                y: rand(0, S.h),

                size:
                    rand(0.3, 1.4),

                phase:
                    rand(0, 20),

                speed:
                    rand(0.2, 1.5),

                alpha:
                    rand(0.15, 0.8)

            });
        }
    }


    function drawSparks() {

        const P =
            S.paletteData;

        fluid.save();

        fluid.fillStyle =
            P.light;

        for (
            const s
            of S.sparks
        ) {

            const flicker =
                (
                    Math.sin(
                        S.time *
                        s.speed *
                        4 +
                        s.phase
                    ) + 1
                ) / 2;

            fluid.globalAlpha =
                s.alpha *
                flicker;

            fluid.fillRect(
                s.x,
                s.y,
                s.size,
                s.size
            );
        }

        fluid.restore();
    }


    /* =====================================================
       PARTICLE DRAW
       ===================================================== */

    function drawParticles() {

        const P =
            S.paletteData;

        fluid.save();

        fluid.globalCompositeOperation =
            "lighter";

        for (
            const p
            of S.particles
        ) {

            const energy =
                clamp(
                    Math.hypot(
                        p.vx,
                        p.vy
                    ) * 0.7,
                    0,
                    1
                );

            const alpha =
                clamp(
                    0.18 +
                    p.strength *
                    0.62 +
                    energy *
                    0.2,
                    0,
                    1
                );

            fluid.globalAlpha =
                alpha;

            fluid.fillStyle =
                p.strength > 0.7
                    ? P.light
                    : P.primary;

            const size =
                p.size *
                (
                    0.7 +
                    energy
                );

            fluid.fillRect(
                p.x,
                p.y,
                size,
                size
            );

            /* Motion trail */

            if (
                energy >
                0.35
            ) {

                fluid.globalAlpha =
                    alpha *
                    0.22;

                fluid.beginPath();

                fluid.moveTo(
                    p.x,
                    p.y
                );

                fluid.lineTo(
                    p.x -
                    p.vx * 8,
                    p.y -
                    p.vy * 8
                );

                fluid.strokeStyle =
                    P.primary;

                fluid.lineWidth =
                    size * 0.65;

                fluid.stroke();
            }
        }

        fluid.restore();
    }


    /* =====================================================
       LIQUID BLOOMS
       ===================================================== */

    function drawLiquidBloom() {

        const P =
            S.paletteData;

        const centerX =
            S.w / 2;

        const centerY =
            S.h / 2;

        fluid.save();

        fluid.globalCompositeOperation =
            "screen";

        for (
            let i = 0;
            i < 8;
            i++
        ) {

            const angle =
                S.time *
                (0.1 + i * 0.017) +
                i;

            const radius =
                80 +
                Math.sin(
                    S.time * 0.8 +
                    i
                ) *
                50;

            const x =
                centerX +
                Math.cos(angle) *
                radius;

            const y =
                centerY +
                Math.sin(angle * 1.4) *
                radius *
                0.5;

            const size =
                40 +
                Math.sin(
                    S.time +
                    i
                ) *
                20;

            const gradient =
                fluid.createRadialGradient(
                    x,
                    y,
                    0,
                    x,
                    y,
                    size
                );

            gradient.addColorStop(
                0,
                "rgba(138,255,180,0.08)"
            );

            gradient.addColorStop(
                1,
                "rgba(138,255,180,0)"
            );

            fluid.fillStyle =
                gradient;

            fluid.fillRect(
                x - size,
                y - size,
                size * 2,
                size * 2
            );
        }

        fluid.restore();
    }


    /* =====================================================
       SCANLINES
       ===================================================== */

    function drawScanlines() {

        const P =
            S.paletteData;

        fluid.save();

        fluid.globalAlpha = 0.025;

        fluid.fillStyle =
            P.primary;

        for (
            let y = 0;
            y < S.h;
            y += 5
        ) {

            fluid.fillRect(
                0,
                y,
                S.w,
                1
            );
        }

        fluid.restore();
    }


    /* =====================================================
       GRAIN
       ===================================================== */

    function drawGrain() {

        const amount =
            S.settings.grain;

        if (amount <= 0) {
            return;
        }

        const P =
            S.paletteData;

        fluid.save();

        fluid.globalAlpha =
            amount * 0.13;

        fluid.fillStyle =
            P.light;

        const count =
            Math.floor(
                S.w *
                S.h *
                0.0007
            );

        for (
            let i = 0;
            i < count;
            i++
        ) {

            fluid.fillRect(
                Math.random() * S.w,
                Math.random() * S.h,
                1,
                1
            );
        }

        fluid.restore();
    }


    /* =====================================================
       ASCII
       ===================================================== */

    const ASCII_CHARS =
        "@#%*+=-:. ";

    function drawASCII() {

        if (!ascii) {
            return;
        }

        ascii.clearRect(
            0,
            0,
            S.w,
            S.h
        );

        if (
            S.mode !== "ascii" &&
            S.mode !== "both"
        ) {
            return;
        }

        const P =
            S.paletteData;

        const cell =
            Math.max(
                7,
                Math.min(
                    13,
                    Math.floor(
                        S.w / 120
                    )
                )
            );

        const source =
            S.sourceCanvas;

        if (!source) {
            return;
        }

        const sw =
            source.width;

        const sh =
            source.height;

        const small =
            document.createElement("canvas");

        small.width =
            Math.ceil(
                sw / cell
            );

        small.height =
            Math.ceil(
                sh / cell
            );

        const sctx =
            small.getContext("2d", {
                willReadFrequently: true
            });

        sctx.drawImage(
            source,
            0,
            0,
            small.width,
            small.height
        );

        const data =
            sctx.getImageData(
                0,
                0,
                small.width,
                small.height
            ).data;

        const scale =
            Math.min(
                S.w / sw,
                S.h / sh
            ) * 0.72;

        const drawW =
            sw * scale;

        const drawH =
            sh * scale;

        const ox =
            (S.w - drawW) / 2;

        const oy =
            (S.h - drawH) / 2;

        ascii.save();

        ascii.font =
            `${Math.max(
                8,
                cell * 0.95
            )}px monospace`;

        ascii.textBaseline =
            "top";

        ascii.textAlign =
            "left";

        for (
            let y = 0;
            y < small.height;
            y++
        ) {

            for (
                let x = 0;
                x < small.width;
                x++
            ) {

                const index =
                    (
                        y *
                        small.width +
                        x
                    ) * 4;

                const brightness =
                    data[index];

                if (
                    brightness <
                    35
                ) {
                    continue;
                }

                const normalized =
                    brightness / 255;

                const charIndex =
                    Math.floor(
                        (
                            1 -
                            normalized
                        ) *
                        (
                            ASCII_CHARS.length - 1
                        )
                    );

                const char =
                    ASCII_CHARS[
                        clamp(
                            charIndex,
                            0,
                            ASCII_CHARS.length - 1
                        )
                    ];

                const wave =
                    Math.sin(
                        S.time * 2 +
                        x * 0.2 +
                        y * 0.15
                    ) *
                    2;

                const px =
                    ox +
                    x *
                    cell *
                    scale +
                    wave;

                const py =
                    oy +
                    y *
                    cell *
                    scale;

                ascii.globalAlpha =
                    0.18 +
                    normalized *
                    0.72;

                ascii.fillStyle =
                    normalized >
                    0.7
                        ? P.light
                        : P.primary;

                ascii.fillText(
                    char,
                    px,
                    py
                );
            }
        }

        ascii.restore();
    }


    /* =====================================================
       FLUID SOURCE GHOST
       ===================================================== */

    function drawFluidSource() {

        if (
            S.mode !== "fluid" &&
            S.mode !== "both"
        ) {
            return;
        }

        if (!S.sourceCanvas) {
            return;
        }

        /*
         * Very subtle source image.
         * This means FLUID mode isn't dependent
         * on ASCII to make the injected text visible.
         */

        const P =
            S.paletteData;

        const scale =
            Math.min(
                S.w / CONFIG.sourceWidth,
                S.h / CONFIG.sourceHeight
            ) * 0.72;

        const w =
            CONFIG.sourceWidth *
            scale;

        const h =
            CONFIG.sourceHeight *
            scale;

        const x =
            (S.w - w) / 2;

        const y =
            (S.h - h) / 2;

        fluid.save();

        fluid.globalAlpha = 0.025;

        fluid.globalCompositeOperation =
            "screen";

        fluid.drawImage(
            S.sourceCanvas,
            x,
            y,
            w,
            h
        );

        fluid.restore();
    }


    /* =====================================================
       DISTORTION LINES
       ===================================================== */

    function drawDistortionLines() {

        const P =
            S.paletteData;

        fluid.save();

        fluid.globalCompositeOperation =
            "screen";

        for (
            let i = 0;
            i < 24;
            i++
        ) {

            const y =
                S.h * 0.2 +
                (
                    i /
                    24
                ) *
                S.h * 0.6;

            const offset =
                Math.sin(
                    S.time * 1.3 +
                    i * 0.8
                ) *
                (
                    5 +
                    S.settings.turbulence *
                    12
                );

            const width =
                rand(
                    40,
                    S.w * 0.35
                );

            fluid.globalAlpha =
                0.02 +
                Math.random() *
                0.025;

            fluid.strokeStyle =
                P.secondary;

            fluid.beginPath();

            fluid.moveTo(
                S.w / 2 -
                width / 2 +
                offset,
                y
            );

            fluid.lineTo(
                S.w / 2 +
                width / 2 +
                offset,
                y
            );

            fluid.stroke();
        }

        fluid.restore();
    }


    /* =====================================================
       BACKGROUND
       ===================================================== */

    function drawBackground() {

        const P =
            S.paletteData;

        fluid.globalCompositeOperation =
            "source-over";

        fluid.fillStyle =
            P.background;

        fluid.fillRect(
            0,
            0,
            S.w,
            S.h
        );

        /* subtle radial atmosphere */

        const gradient =
            fluid.createRadialGradient(
                S.w / 2,
                S.h / 2,
                0,
                S.w / 2,
                S.h / 2,
                Math.max(
                    S.w,
                    S.h
                ) * 0.7
            );

        gradient.addColorStop(
            0,
            "rgba(20,70,40,0.08)"
        );

        gradient.addColorStop(
            1,
            "rgba(0,0,0,0)"
        );

        fluid.fillStyle =
            gradient;

        fluid.fillRect(
            0,
            0,
            S.w,
            S.h
        );
    }


    /* =====================================================
       FRAME
       ===================================================== */

    function frame(now) {

        const delta =
            Math.min(
                32,
                now -
                S.lastTime
            );

        S.lastTime =
            now;

        const dt =
            delta /
            16.666;

        S.time +=
            delta *
            CONFIG.idleSpeed;

        S.frame++;

        updateParticles(dt);

        updateRibbons();

        updateBlocks();

        drawBackground();

        drawLiquidBloom();

        drawFluidSource();

        drawRibbons();

        drawBlocks();

        drawDistortionLines();

        drawParticles();

        drawSparks();

        drawScanlines();

        drawGrain();

        drawASCII();

        requestAnimationFrame(frame);
    }


    /* =====================================================
       RESIZE
       ===================================================== */

    function resizeCanvas(canvas, ctx) {

        if (!canvas || !ctx) {
            return;
        }

        const rect =
            canvas.getBoundingClientRect();

        const width =
            Math.max(
                1,
                Math.floor(
                    rect.width
                )
            );

        const height =
            Math.max(
                1,
                Math.floor(
                    rect.height
                )
            );

        canvas.width =
            Math.floor(
                width * S.dpr
            );

        canvas.height =
            Math.floor(
                height * S.dpr
            );

        ctx.setTransform(
            S.dpr,
            0,
            0,
            S.dpr,
            0,
            0
        );
    }


    function resize() {

        S.dpr =
            Math.min(
                window.devicePixelRatio || 1,
                2
            );

        const rect =
            fluidCanvas.getBoundingClientRect();

        S.w =
            Math.max(
                1,
                rect.width
            );

        S.h =
            Math.max(
                1,
                rect.height
            );

        resizeCanvas(
            fluidCanvas,
            fluid
        );

        if (
            asciiCanvas &&
            ascii
        ) {

            resizeCanvas(
                asciiCanvas,
                ascii
            );
        }

        createRibbons();

        createBlocks();

        createSparks();

        /*
         * Re-map particle origins after resize.
         */

        if (
            S.sourcePoints.length
        ) {

            rebuildParticles();
        }
    }


    /* =====================================================
       MOUSE
       ===================================================== */

    function pointerMove(event) {

        const rect =
            fluidCanvas.getBoundingClientRect();

        S.mouse.px =
            S.mouse.x;

        S.mouse.py =
            S.mouse.y;

        S.mouse.x =
            event.clientX -
            rect.left;

        S.mouse.y =
            event.clientY -
            rect.top;

        S.mouse.active =
            true;
    }


    function pointerDown() {

        S.mouse.down =
            true;
    }


    function pointerUp() {

        S.mouse.down =
            false;
    }


    fluidCanvas.addEventListener(
        "pointermove",
        pointerMove,
        { passive: true }
    );

    fluidCanvas.addEventListener(
        "pointerdown",
        pointerDown
    );

    window.addEventListener(
        "pointerup",
        pointerUp
    );

    fluidCanvas.addEventListener(
        "pointerleave",
        () => {
            S.mouse.active =
                false;
        }
    );


    /* =====================================================
       TEXT
       ===================================================== */

    function injectText() {

        const value =
            textInput
                ? textInput.value.trim()
                : "";

        if (!value) {
            createTextSource("MELT");
            return;
        }

        createTextSource(value);
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
                    event.key ===
                    "Enter" &&
                    (
                        event.ctrlKey ||
                        event.metaKey
                    )
                ) {

                    injectText();
                }
            }
        );
    }


    /* =====================================================
       IMAGE INPUT
       ===================================================== */

    function loadImageFile(file) {

        if (!file) {
            return;
        }

        if (
            !file.type.startsWith(
                "image/"
            )
        ) {

            statusSet(
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

                createImageSource(
                    image
                );
            };

            image.src =
                reader.result;
        };

        reader.readAsDataURL(file);
    }


    if (fileInput) {

        fileInput.addEventListener(
            "change",
            () => {

                const file =
                    fileInput.files?.[0];

                loadImageFile(file);
            }
        );
    }


    if (dropzone) {

        [
            "dragenter",
            "dragover"
        ].forEach(
            (eventName) => {

                dropzone.addEventListener(
                    eventName,
                    (event) => {

                        event.preventDefault();

                        dropzone.classList.add(
                            "dragging"
                        );
                    }
                );
            }
        );

        [
            "dragleave",
            "drop"
        ].forEach(
            (eventName) => {

                dropzone.addEventListener(
                    eventName,
                    () => {

                        dropzone.classList.remove(
                            "dragging"
                        );
                    }
                );
            }
        );

        dropzone.addEventListener(
            "drop",
            (event) => {

                event.preventDefault();

                const file =
                    event.dataTransfer
                        ?.files?.[0];

                loadImageFile(file);
            }
        );
    }


    /* =====================================================
       MODE
       ===================================================== */

    function setMode(mode) {

        if (
            ![
                "fluid",
                "ascii",
                "both"
            ].includes(mode)
        ) {
            mode = "both";
        }

        S.mode =
            mode;

        modeButtons.forEach(
            (button) => {

                const buttonMode =
                    button.dataset.mode ||
                    button.dataset.value ||
                    button.textContent
                        .trim()
                        .toLowerCase();

                button.classList.toggle(
                    "active",
                    buttonMode === mode
                );

                button.setAttribute(
                    "aria-pressed",
                    buttonMode === mode
                        ? "true"
                        : "false"
                );
            }
        );

        statusSet(
            `${mode.toUpperCase()} MODE`,
            true
        );
    }


    modeButtons.forEach(
        (button) => {

            button.addEventListener(
                "click",
                () => {

                    const mode =
                        button.dataset.mode ||
                        button.dataset.value ||
                        button.textContent
                            .trim()
                            .toLowerCase();

                    setMode(mode);
                }
            );
        }
    );


    /* =====================================================
       PALETTE
       ===================================================== */

    function setPalette(name) {

        if (!PALETTES[name]) {
            return;
        }

        S.palette =
            name;

        S.paletteData =
            PALETTES[name];

        paletteButtons.forEach(
            (button) => {

                const value =
                    button.dataset.palette ||
                    button.dataset.value;

                button.classList.toggle(
                    "active",
                    value === name
                );
            }
        );

        statusSet(
            `${name.toUpperCase()} PALETTE`,
            true
        );
    }


    paletteButtons.forEach(
        (button) => {

            button.addEventListener(
                "click",
                () => {

                    const value =
                        button.dataset.palette ||
                        button.dataset.value;

                    if (value) {
                        setPalette(value);
                    }
                }
            );
        }
    );


    /* =====================================================
       SLIDERS
       ===================================================== */

    function sliderValue(input, fallback) {

        if (!input) {
            return fallback;
        }

        const value =
            parseFloat(
                input.value
            );

        return Number.isFinite(value)
            ? value
            : fallback;
    }


    function syncSettings() {

        S.settings.turbulence =
            sliderValue(
                turbulenceInput,
                CONFIG.defaultTurbulence
            );

        S.settings.viscosity =
            sliderValue(
                viscosityInput,
                CONFIG.defaultViscosity
            );

        S.settings.grain =
            sliderValue(
                grainInput,
                CONFIG.defaultGrain
            );
    }


    [
        turbulenceInput,
        viscosityInput,
        grainInput
    ]
        .filter(Boolean)
        .forEach(
            (input) => {

                input.addEventListener(
                    "input",
                    syncSettings
                );
            }
        );


    /* =====================================================
       RESET
       ===================================================== */

    function resetField() {

        S.mouse.down =
            false;

        S.time =
            0;

        S.frame =
            0;

        S.settings.turbulence =
            CONFIG.defaultTurbulence;

        S.settings.viscosity =
            CONFIG.defaultViscosity;

        S.settings.grain =
            CONFIG.defaultGrain;

        if (turbulenceInput) {
            turbulenceInput.value =
                CONFIG.defaultTurbulence;
        }

        if (viscosityInput) {
            viscosityInput.value =
                CONFIG.defaultViscosity;
        }

        if (grainInput) {
            grainInput.value =
                CONFIG.defaultGrain;
        }

        createTextSource(
            S.sourceText || "MELT"
        );

        statusSet(
            "FIELD RESET",
            true
        );
    }


    if (resetButton) {

        resetButton.addEventListener(
            "click",
            resetField
        );
    }


    /* =====================================================
       SAVE FRAME
       ===================================================== */

    function saveFrame() {

        const output =
            document.createElement("canvas");

        output.width =
            fluidCanvas.width;

        output.height =
            fluidCanvas.height;

        const ctx =
            output.getContext("2d");

        ctx.drawImage(
            fluidCanvas,
            0,
            0
        );

        if (
            asciiCanvas &&
            (
                S.mode === "ascii" ||
                S.mode === "both"
            )
        ) {

            ctx.drawImage(
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

        statusSet(
            "FRAME SAVED",
            true
        );
    }


    if (saveButton) {

        saveButton.addEventListener(
            "click",
            saveFrame
        );
    }


    /* =====================================================
       PANEL
       ===================================================== */

    if (panelToggle) {

        panelToggle.addEventListener(
            "click",
            () => {

                document.body.classList.toggle(
                    "panel-hidden"
                );
            }
        );
    }


    /* =====================================================
       KEYBOARD
       ===================================================== */

    window.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key ===
                "Escape"
            ) {

                document.body.classList.toggle(
                    "panel-hidden"
                );
            }

            if (
                event.key.toLowerCase() ===
                "r"
            ) {

                resetField();
            }

            if (
                event.key.toLowerCase() ===
                "s"
            ) {

                if (
                    event.ctrlKey ||
                    event.metaKey
                ) {
                    return;
                }

                saveFrame();
            }
        }
    );


    /* =====================================================
       WINDOW
       ===================================================== */

    window.addEventListener(
        "resize",
        () => {

            resize();
        }
    );


    /* =====================================================
       INITIALIZATION
       ===================================================== */

    function init() {

        bootSet(
            0.05,
            "INITIALIZING FIELD"
        );

        resize();

        bootSet(
            0.20,
            "CREATING SOURCE"
        );

        createSourceCanvas();

        bootSet(
            0.35,
            "GENERATING MATTER"
        );

        createTextSource("MELT");

        bootSet(
            0.55,
            "BUILDING PARTICLES"
        );

        createRibbons();

        createBlocks();

        createSparks();

        bootSet(
            0.72,
            "CALCULATING FIELD"
        );

        syncSettings();

        setMode("both");

        setPalette("matrix");

        bootSet(
            0.88,
            "STARTING EFFECTS"
        );

        statusSet(
            "FIELD ONLINE",
            true
        );

        bootSet(
            1,
            "FIELD ONLINE"
        );

        if (boot) {

            setTimeout(
                () => {

                    boot.classList.add(
                        "done"
                    );

                },
                350
            );
        }

        S.initialized =
            true;

        S.booted =
            true;

        S.lastTime =
            performance.now();

        requestAnimationFrame(
            frame
        );
    }


    /* =====================================================
       START
       ===================================================== */

    init();

})();
