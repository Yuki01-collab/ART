(() => {
    "use strict";


    /* =========================================================
       CONFIG
    ========================================================= */

    const CONFIG = {

        particles: 6200,

        ambient: 900,

        trailAlpha: 0.075,

        particleSize: 1.15,

        mouseRadius: 190,

        mouseForce: 4.2,

        fieldScale: 0.0024,

        swirl: 0.8,

        ribbonCount: 16,

        asciiChars:
            " .·:+*#%@&$",

        asciiCell: 8
    };


    /* =========================================================
       DOM
    ========================================================= */

    const $ = id =>
        document.getElementById(id);


    const fluidCanvas =
        $("fluid-canvas");

    const asciiCanvas =
        $("ascii-canvas");

    const miniCanvas =
        $("mini-canvas");


    if (
        !fluidCanvas ||
        !asciiCanvas
    ) {
        console.error(
            "MELT: Canvas not found."
        );

        return;
    }


    const fluid =
        fluidCanvas.getContext(
            "2d",
            {
                alpha: false
            }
        );


    const ascii =
        asciiCanvas.getContext(
            "2d"
        );


    const mini =
        miniCanvas
            ? miniCanvas.getContext("2d")
            : null;


    /* =========================================================
       SOURCE CANVAS
    ========================================================= */

    const sourceCanvas =
        document.createElement(
            "canvas"
        );


    const source =
        sourceCanvas.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );


    sourceCanvas.width = 800;
    sourceCanvas.height = 500;


    /* =========================================================
       STATE
    ========================================================= */

    const state = {

        width: 1,
        height: 1,

        dpr: 1,

        mode: "fluid",

        palette: "matrix",

        sourceType: "text",

        turbulence: 58,

        viscosity: 32,

        density: 72,

        time: 0,

        lastTime:
            performance.now(),

        mouse: {

            x: 0,
            y: 0,

            px: 0,
            py: 0,

            vx: 0,
            vy: 0,

            active: false
        },

        particles: [],

        ambient: [],

        sourcePoints: [],

        ribbons: [],

        fpsFrames: 0,

        fpsTime:
            performance.now()
    };


    /* =========================================================
       PALETTES
    ========================================================= */

    const PALETTES = {

        matrix: [
            "#e7fff0",
            "#8affbd",
            "#38ff91",
            "#0cae5a",
            "#063d25"
        ],

        amber: [
            "#fff4c4",
            "#ffd166",
            "#ff9f1c",
            "#c85b0b",
            "#421804"
        ],

        mono: [
            "#ffffff",
            "#d4d4d4",
            "#999999",
            "#555555",
            "#161616"
        ],

        cyan: [
            "#eaffff",
            "#8ffff1",
            "#35ead0",
            "#099f91",
            "#033d39"
        ]
    };


    /* =========================================================
       UTILS
    ========================================================= */

    function clamp(
        value,
        min,
        max
    ) {
        return Math.max(
            min,
            Math.min(max, value)
        );
    }


    function lerp(
        a,
        b,
        t
    ) {
        return a +
            (b - a) * t;
    }


    function random(
        min,
        max
    ) {
        return min +
            Math.random() *
            (max - min);
    }


    function choose(array) {
        return array[
            Math.floor(
                Math.random() *
                array.length
            )
        ];
    }


    function hexToRgb(hex) {

        const value =
            hex.replace("#", "");

        return {

            r:
                parseInt(
                    value.substring(0, 2),
                    16
                ),

            g:
                parseInt(
                    value.substring(2, 4),
                    16
                ),

            b:
                parseInt(
                    value.substring(4, 6),
                    16
                )
        };
    }


    function colorAt(t) {

        const colors =
            PALETTES[
                state.palette
            ];


        const position =
            clamp(t, 0, 1) *
            (colors.length - 1);


        const index =
            Math.min(
                colors.length - 2,
                Math.floor(position)
            );


        const amount =
            position - index;


        const a =
            hexToRgb(
                colors[index]
            );


        const b =
            hexToRgb(
                colors[index + 1]
            );


        return {

            r: Math.round(
                lerp(
                    a.r,
                    b.r,
                    amount
                )
            ),

            g: Math.round(
                lerp(
                    a.g,
                    b.g,
                    amount
                )
            ),

            b: Math.round(
                lerp(
                    a.b,
                    b.b,
                    amount
                )
            )
        };
    }


    /* =========================================================
       SIMPLE NOISE
    ========================================================= */

    function noise(x, y, t) {

        return (

            Math.sin(
                x * 1.7 +
                t * 0.71
            ) +

            Math.sin(
                y * 2.1 -
                t * 0.53
            ) +

            Math.sin(
                (x + y) * 1.3 +
                t * 0.37
            ) +

            Math.cos(
                (x - y) * 1.8 -
                t * 0.29
            )

        ) / 4;
    }


    /* =========================================================
       FLOW FIELD
    ========================================================= */

    function flowAngle(
        x,
        y,
        time
    ) {

        const nx =
            x *
            CONFIG.fieldScale;


        const ny =
            y *
            CONFIG.fieldScale;


        const t =
            time * 0.00022;


        let angle =

            Math.sin(
                nx * 5.7 +
                t * 2.1
            ) * 1.8 +

            Math.cos(
                ny * 6.2 -
                t * 1.7
            ) * 1.4 +

            Math.sin(
                (nx + ny) * 4.1 +
                t
            ) * 2.2 +

            noise(
                nx * 2,
                ny * 2,
                t
            ) * 2.5;


        /*
          Add several rotating attractors.
          This creates the "liquid vortex" appearance.
        */

        const cx =
            state.width * .52;

        const cy =
            state.height * .50;


        const dx =
            x - cx;

        const dy =
            y - cy;


        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            ) + 1;


        const vortex =
            Math.atan2(
                dy,
                dx
            ) +
            Math.PI / 2;


        const vortexStrength =
            clamp(
                650 / distance,
                0,
                2.2
            );


        angle +=
            vortex *
            vortexStrength *
            CONFIG.swirl;


        return angle;
    }


    /* =========================================================
       RESIZE
    ========================================================= */

    function resize() {

        state.width =
            window.innerWidth;

        state.height =
            window.innerHeight;


        state.dpr =
            Math.min(
                window.devicePixelRatio || 1,
                2
            );


        const w =
            Math.floor(
                state.width *
                state.dpr
            );


        const h =
            Math.floor(
                state.height *
                state.dpr
            );


        fluidCanvas.width = w;
        fluidCanvas.height = h;

        asciiCanvas.width = w;
        asciiCanvas.height = h;


        fluidCanvas.style.width =
            `${state.width}px`;

        fluidCanvas.style.height =
            `${state.height}px`;

        asciiCanvas.style.width =
            `${state.width}px`;

        asciiCanvas.style.height =
            `${state.height}px`;


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


        if (miniCanvas) {

            miniCanvas.width =
                170;

            miniCanvas.height =
                110;
        }
    }


    /* =========================================================
       TEXT SOURCE
    ========================================================= */

    function makeTextSource(
        text
    ) {

        source.clearRect(
            0,
            0,
            800,
            500
        );


        const value =
            text.trim() ||
            "MELT";


        let fontSize = 180;


        while (
            fontSize > 30
        ) {

            source.font =
                `900 ${fontSize}px Arial`;

            if (
                source.measureText(
                    value
                ).width <
                730
            ) {
                break;
            }

            fontSize -= 5;
        }


        source.textAlign =
            "center";

        source.textBaseline =
            "middle";


        source.fillStyle =
            "#ffffff";


        source.fillText(
            value,
            400,
            250
        );


        state.sourceType =
            "text";


        buildSourcePoints();
    }


    /* =========================================================
       IMAGE SOURCE
    ========================================================= */

    function makeImageSource(
        image
    ) {

        source.clearRect(
            0,
            0,
            800,
            500
        );


        const scale =
            Math.min(
                740 / image.width,
                440 / image.height
            );


        const width =
            image.width * scale;

        const height =
            image.height * scale;


        source.drawImage(
            image,

            400 -
                width / 2,

            250 -
                height / 2,

            width,
            height
        );


        state.sourceType =
            "image";


        buildSourcePoints();
    }


    /* =========================================================
       SOURCE POINTS
    ========================================================= */

    function buildSourcePoints() {

        const pixels =
            source.getImageData(
                0,
                0,
                800,
                500
            ).data;


        state.sourcePoints = [];


        /*
          Density changes the sampling resolution.
        */

        const spacing =
            lerp(
                8,
                3,
                state.density / 100
            );


        for (
            let y = 0;
            y < 500;
            y += spacing
        ) {

            for (
                let x = 0;
                x < 800;
                x += spacing
            ) {

                const ix =
                    Math.floor(x);

                const iy =
                    Math.floor(y);


                const index =
                    (
                        iy * 800 +
                        ix
                    ) * 4;


                const r =
                    pixels[index];

                const g =
                    pixels[index + 1];

                const b =
                    pixels[index + 2];

                const alpha =
                    pixels[index + 3];


                const brightness =
                    (
                        r +
                        g +
                        b
                    ) / 3;


                if (
                    alpha > 40 &&
                    brightness > 18
                ) {

                    state.sourcePoints.push({

                        x,
                        y,

                        brightness:
                            brightness / 255
                    });
                }
            }
        }


        rebuildParticles();
    }


    /* =========================================================
       PARTICLE
    ========================================================= */

    class Particle {

        constructor(
            point,
            index
        ) {

            const scale =
                Math.min(
                    state.width / 800,
                    state.height / 500
                );


            const offsetX =
                (
                    state.width -
                    800 * scale
                ) / 2;


            const offsetY =
                (
                    state.height -
                    500 * scale
                ) / 2;


            this.homeX =
                offsetX +
                point.x *
                scale;


            this.homeY =
                offsetY +
                point.y *
                scale;


            /*
              Don't start exactly at the source.
              This creates the "melt" reveal.
            */

            const spread =
                random(
                    0,
                    140
                );


            const angle =
                random(
                    0,
                    Math.PI * 2
                );


            this.x =
                this.homeX +
                Math.cos(angle) *
                spread;


            this.y =
                this.homeY +
                Math.sin(angle) *
                spread;


            this.vx =
                random(
                    -1.5,
                    1.5
                );


            this.vy =
                random(
                    -1.5,
                    1.5
                );


            this.size =
                random(
                    .35,
                    1.7
                );


            this.alpha =
                random(
                    .35,
                    .95
                ) *
                point.brightness;


            this.brightness =
                point.brightness;


            this.seed =
                random(
                    0,
                    10000
                );


            this.index =
                index;
        }


        update(dt) {

            const angle =
                flowAngle(
                    this.x,
                    this.y,
                    state.time +
                    this.seed * 100
                );


            const turbulence =
                state.turbulence /
                100;


            /*
              FLOW
            */

            const force =
                (
                    0.018 +
                    turbulence *
                    0.045
                ) *
                dt *
                60;


            this.vx +=
                Math.cos(angle) *
                force;


            this.vy +=
                Math.sin(angle) *
                force;


            /*
              SOURCE GRAVITY

              This is what allows text/image
              to remain recognizable while
              still behaving like liquid.
            */

            const dx =
                this.homeX -
                this.x;

            const dy =
                this.homeY -
                this.y;


            const homeDistance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            const viscosity =
                state.viscosity /
                100;


            const homeForce =
                (
                    .00025 +
                    viscosity *
                    .0018
                );


            this.vx +=
                dx *
                homeForce;


            this.vy +=
                dy *
                homeForce;


            /*
              LOCAL VORTEX
            */

            const cx =
                state.width * .50;

            const cy =
                state.height * .50;


            const rx =
                this.x - cx;

            const ry =
                this.y - cy;


            const radius =
                Math.sqrt(
                    rx * rx +
                    ry * ry
                ) + 1;


            const swirl =
                clamp(
                    280 / radius,
                    0,
                    1.8
                ) *
                turbulence *
                .018;


            this.vx +=
                (-ry / radius) *
                swirl *
                dt *
                60;


            this.vy +=
                (rx / radius) *
                swirl *
                dt *
                60;


            /*
              MOUSE FORCE
            */

            if (
                state.mouse.active
            ) {

                const mx =
                    this.x -
                    state.mouse.x;


                const my =
                    this.y -
                    state.mouse.y;


                const distance =
                    Math.sqrt(
                        mx * mx +
                        my * my
                    );


                const radius =
                    CONFIG.mouseRadius;


                if (
                    distance <
                    radius &&
                    distance >
                    0.01
                ) {

                    const amount =
                        Math.pow(
                            1 -
                            distance /
                            radius,
                            2
                        );


                    const force =
                        CONFIG.mouseForce *
                        amount *
                        dt;


                    this.vx +=
                        (
                            mx /
                            distance
                        ) *
                        force;


                    this.vy +=
                        (
                            my /
                            distance
                        ) *
                        force;


                    /*
                      Mouse movement also drags
                      the liquid.
                    */

                    this.vx +=
                        state.mouse.vx *
                        amount *
                        .025;


                    this.vy +=
                        state.mouse.vy *
                        amount *
                        .025;
                }
            }


            /*
              DRAG
            */

            const drag =
                lerp(
                    .985,
                    .90,
                    viscosity
                );


            this.vx *= drag;
            this.vy *= drag;


            /*
              POSITION
            */

            this.x +=
                this.vx *
                dt *
                60;


            this.y +=
                this.vy *
                dt *
                60;


            /*
              KEEP FIELD ALIVE
            */

            const margin = 100;


            if (
                this.x < -margin
            ) {
                this.x =
                    state.width +
                    margin;
            }


            if (
                this.x >
                state.width +
                margin
            ) {
                this.x = -margin;
            }


            if (
                this.y < -margin
            ) {
                this.y =
                    state.height +
                    margin;
            }


            if (
                this.y >
                state.height +
                margin
            ) {
                this.y = -margin;
            }


            /*
              Prevent extremely distant particles
              from permanently leaving the composition.
            */

            if (
                homeDistance >
                Math.max(
                    state.width,
                    state.height
                ) * 1.2
            ) {

                this.x =
                    lerp(
                        this.x,
                        this.homeX,
                        .02
                    );

                this.y =
                    lerp(
                        this.y,
                        this.homeY,
                        .02
                    );
            }
        }


        draw() {

            const color =
                colorAt(
                    this.brightness
                );


            fluid.globalAlpha =
                this.alpha;


            fluid.fillStyle =
                `rgb(
                    ${color.r},
                    ${color.g},
                    ${color.b}
                )`;


            fluid.fillRect(
                this.x,
                this.y,
                this.size,
                this.size
            );
        }
    }


    /* =========================================================
       BUILD PARTICLES
    ========================================================= */

    function rebuildParticles() {

        state.particles = [];


        if (
            !state.sourcePoints.length
        ) {
            return;
        }


        /*
          Don't use every source point.
          This prevents slowdowns on large images.
        */

        const target =
            Math.floor(
                lerp(
                    1800,
                    CONFIG.particles,
                    state.density / 100
                )
            );


        const points =
            state.sourcePoints;


        const step =
            Math.max(
                1,
                Math.floor(
                    points.length /
                    target
                )
            );


        let index = 0;


        for (
            let i = 0;
            i < points.length;
            i += step
        ) {

            state.particles.push(
                new Particle(
                    points[i],
                    index
                )
            );


            index++;


            if (
                state.particles.length >=
                target
            ) {
                break;
            }
        }


        const count =
            state.particles.length;


        const countElement =
            $("particle-count");


        if (countElement) {

            countElement.textContent =
                count.toLocaleString();
        }


        const sourceElement =
            $("source-data");


        if (sourceElement) {

            sourceElement.textContent =
                state.sourceType
                    .toUpperCase();
        }
    }


    /* =========================================================
       AMBIENT PARTICLES
    ========================================================= */

    function buildAmbient() {

        state.ambient = [];


        for (
            let i = 0;
            i < CONFIG.ambient;
            i++
        ) {

            state.ambient.push({

                x:
                    random(
                        0,
                        state.width
                    ),

                y:
                    random(
                        0,
                        state.height
                    ),

                size:
                    random(
                        .2,
                        1.1
                    ),

                alpha:
                    random(
                        .03,
                        .25
                    ),

                speed:
                    random(
                        .03,
                        .22
                    ),

                seed:
                    random(
                        0,
                        10000
                    )
            });
        }
    }


    /* =========================================================
       RIBBON SYSTEM
    ========================================================= */

    function drawRibbons() {

        const t =
            state.time *
            .00035;


        for (
            let r = 0;
            r < CONFIG.ribbonCount;
            r++
        ) {

            const base =
                r /
                CONFIG.ribbonCount;


            let x =
                state.width *
                (
                    .18 +
                    base *
                    .64
                );


            let y =
                state.height *
                (
                    .20 +
                    Math.sin(
                        base *
                        Math.PI *
                        4 +
                        t
                    ) *
                    .25
                );


            fluid.beginPath();


            fluid.moveTo(
                x,
                y
            );


            for (
                let i = 0;
                i < 28;
                i++
            ) {

                const progress =
                    i / 27;


                const wave =
                    Math.sin(
                        progress *
                        9 +
                        r *
                        .7 +
                        t *
                        2
                    );


                const wave2 =
                    Math.cos(
                        progress *
                        7 -
                        r *
                        .35 +
                        t
                    );


                x +=
                    state.width *
                    .025;


                y +=
                    wave *
                    (
                        4 +
                        state.turbulence *
                        .10
                    );


                y +=
                    wave2 *
                    2;


                fluid.lineTo(
                    x,
                    y
                );
            }


            const color =
                colorAt(
                    .25 +
                    base *
                    .65
                );


            fluid.strokeStyle =
                `rgba(
                    ${color.r},
                    ${color.g},
                    ${color.b},
                    .025
                )`;


            fluid.lineWidth =
                1 +
                base * 3;


            fluid.stroke();
        }
    }


    /* =========================================================
       FLUID RENDER
    ========================================================= */

    function renderFluid() {

        /*
          Transparent black overlay = trails.
        */

        fluid.globalCompositeOperation =
            "source-over";


        fluid.fillStyle =
            `rgba(
                1,
                4,
                2,
                ${CONFIG.trailAlpha}
            )`;


        fluid.fillRect(
            0,
            0,
            state.width,
            state.height
        );


        /*
          Large subtle ribbons.
        */

        drawRibbons();


        /*
          Ambient dust.
        */

        for (
            const p of
            state.ambient
        ) {

            const color =
                colorAt(
                    .45
                );


            fluid.globalAlpha =
                p.alpha;


            fluid.fillStyle =
                `rgb(
                    ${color.r},
                    ${color.g},
                    ${color.b}
                )`;


            fluid.fillRect(
                p.x,
                p.y,
                p.size,
                p.size
            );


            p.y -=
                p.speed;


            p.x +=
                Math.sin(
                    state.time *
                    .0004 +
                    p.seed
                ) *
                .15;


            if (
                p.y < -5
            ) {

                p.y =
                    state.height +
                    5;
            }
        }


        /*
          Main particles.
        */

        fluid.globalCompositeOperation =
            "lighter";


        for (
            const particle of
            state.particles
        ) {

            particle.draw();
        }


        /*
          Glow pass.

          A few larger particles create
          the luminous liquid-core effect.
        */

        fluid.globalAlpha =
            .08;


        for (
            let i = 0;
            i < state.particles.length;
            i += 35
        ) {

            const p =
                state.particles[i];


            const color =
                colorAt(
                    p.brightness
                );


            fluid.fillStyle =
                `rgb(
                    ${color.r},
                    ${color.g},
                    ${color.b}
                )`;


            fluid.beginPath();


            fluid.arc(
                p.x,
                p.y,
                3 +
                    p.brightness *
                    8,
                0,
                Math.PI * 2
            );


            fluid.fill();
        }


        fluid.globalAlpha = 1;

        fluid.globalCompositeOperation =
            "source-over";
    }


    /* =========================================================
       ASCII
    ========================================================= */

    function renderASCII() {

        ascii.clearRect(
            0,
            0,
            state.width,
            state.height
        );


        /*
          ASCII is deliberately sparse.

          It is an extra visual layer rather
          than the entire artwork.
        */

        const cell =
            clamp(
                7 +
                (100 -
                    state.density) *
                .08,
                7,
                15
            );


        ascii.font =
            `${cell}px "Space Mono", monospace`;


        ascii.textAlign =
            "center";

        ascii.textBaseline =
            "middle";


        const characters =
            CONFIG.asciiChars;


        /*
          Sample PARTICLES instead of the source image.

          This is why ASCII now follows
          the moving fluid.
        */

        const amount =
            Math.min(
                1700,
                state.particles.length
            );


        for (
            let i = 0;
            i < amount;
            i += 2
        ) {

            const p =
                state.particles[
                    (
                        i * 7
                    ) %
                    state.particles.length
                ];


            if (
                !p
            ) {
                continue;
            }


            const brightness =
                clamp(
                    p.brightness +
                    Math.sin(
                        state.time *
                        .001 +
                        p.seed
                    ) *
                    .15,
                    0,
                    1
                );


            const charIndex =
                Math.floor(
                    brightness *
                    (
                        characters.length -
                        1
                    )
                );


            const character =
                characters[
                    charIndex
                ];


            const color =
                colorAt(
                    brightness
                );


            ascii.fillStyle =
                `rgba(
                    ${color.r},
                    ${color.g},
                    ${color.b},
                    ${.15 +
                        brightness *
                        .55}
                )`;


            ascii.fillText(
                character,
                p.x,
                p.y
            );
        }
    }


    /* =========================================================
       MINI MAP
    ========================================================= */

    function renderMiniMap() {

        if (
            !mini
        ) {
            return;
        }


        mini.clearRect(
            0,
            0,
            170,
            110
        );


        mini.fillStyle =
            "rgba(2,10,6,.9)";


        mini.fillRect(
            0,
            0,
            170,
            110
        );


        const color =
            colorAt(
                .65
            );


        mini.fillStyle =
            `rgba(
                ${color.r},
                ${color.g},
                ${color.b},
                .65
            )`;


        const scaleX =
            170 /
            state.width;


        const scaleY =
            110 /
            state.height;


        for (
            let i = 0;
            i <
            Math.min(
                state.particles.length,
                900
            );
            i += 4
        ) {

            const p =
                state.particles[i];


            mini.fillRect(
                p.x * scaleX,
                p.y * scaleY,
                1,
                1
            );
        }


        /*
          Pointer.
        */

        if (
            state.mouse.active
        ) {

            mini.strokeStyle =
                "#ffffff";

            mini.strokeRect(
                state.mouse.x *
                    scaleX -
                    2,

                state.mouse.y *
                    scaleY -
                    2,

                4,
                4
            );
        }
    }


    /* =========================================================
       UPDATE
    ========================================================= */

    function update(dt) {

        for (
            const particle of
            state.particles
        ) {

            particle.update(
                dt
            );
        }


        state.mouse.vx *= .84;
        state.mouse.vy *= .84;
    }


    /* =========================================================
       MAIN RENDER
    ========================================================= */

    function render() {

        if (
            state.mode ===
            "fluid"
        ) {

            fluidCanvas.style.opacity =
                "1";

            asciiCanvas.style.opacity =
                "0";

            renderFluid();

        }

        else if (
            state.mode ===
            "ascii"
        ) {

            fluidCanvas.style.opacity =
                "0";

            asciiCanvas.style.opacity =
                "1";

            renderASCII();

        }

        else {

            fluidCanvas.style.opacity =
                "1";

            asciiCanvas.style.opacity =
                "1";

            renderFluid();
            renderASCII();
        }


        renderMiniMap();
    }


    /* =========================================================
       ANIMATION
    ========================================================= */

    function animate(now) {

        const dt =
            clamp(
                (
                    now -
                    state.lastTime
                ) / 1000,

                .001,

                .033
            );


        state.lastTime =
            now;


        state.time =
            now;


        update(dt);

        render();


        /*
          FPS
        */

        state.fpsFrames++;


        if (
            now -
            state.fpsTime >
            500
        ) {

            const fps =
                Math.round(
                    state.fpsFrames /
                    (
                        (
                            now -
                            state.fpsTime
                        ) / 1000
                    )
                );


            const fpsElement =
                $("fps-counter");


            if (
                fpsElement
            ) {

                fpsElement.textContent =
                    `${fps} FPS`;
            }


            state.fpsFrames = 0;

            state.fpsTime =
                now;
        }


        requestAnimationFrame(
            animate
        );
    }


    /* =========================================================
       POINTER
    ========================================================= */

    fluidCanvas.addEventListener(
        "pointermove",
        event => {

            const rect =
                fluidCanvas
                    .getBoundingClientRect();


            const x =
                event.clientX -
                rect.left;


            const y =
                event.clientY -
                rect.top;


            state.mouse.vx =
                x -
                state.mouse.px;


            state.mouse.vy =
                y -
                state.mouse.py;


            state.mouse.px =
                x;

            state.mouse.py =
                y;


            state.mouse.x =
                x;

            state.mouse.y =
                y;


            state.mouse.active =
                true;


            const xElement =
                $("pointer-x");


            const yElement =
                $("pointer-y");


            if (
                xElement
            ) {

                xElement.textContent =
                    `X ${String(
                        Math.round(x)
                    ).padStart(
                        4,
                        "0"
                    )}`;
            }


            if (
                yElement
            ) {

                yElement.textContent =
                    `Y ${String(
                        Math.round(y)
                    ).padStart(
                        4,
                        "0"
                    )}`;
            }
        }
    );


    fluidCanvas.addEventListener(
        "pointerleave",
        () => {

            state.mouse.active =
                false;
        }
    );


    /* =========================================================
       IMAGE INPUT
    ========================================================= */

    function loadImage(
        file
    ) {

        if (
            !file ||
            !file.type.startsWith(
                "image/"
            )
        ) {
            return;
        }


        const reader =
            new FileReader();


        reader.onload =
            event => {

                const image =
                    new Image();


                image.onload =
                    () => {

                        makeImageSource(
                            image
                        );


                        const meta =
                            $("image-meta");


                        const name =
                            $("image-name");


                        if (
                            meta
                        ) {
                            meta.hidden =
                                false;
                        }


                        if (
                            name
                        ) {
                            name.textContent =
                                file.name;
                        }


                        setStatus(
                            "IMAGE INJECTED"
                        );
                    };


                image.src =
                    event.target.result;
            };


        reader.readAsDataURL(
            file
        );
    }


    const fileInput =
        $("file-input");


    if (
        fileInput
    ) {

        fileInput.addEventListener(
            "change",
            event => {

                loadImage(
                    event.target.files[0]
                );
            }
        );
    }


    /* =========================================================
       DROPZONE
    ========================================================= */

    const dropzone =
        $("dropzone");


    if (
        dropzone
    ) {

        dropzone.addEventListener(
            "dragover",
            event => {

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
            event => {

                event.preventDefault();

                dropzone.classList.remove(
                    "drag"
                );


                loadImage(
                    event
                        .dataTransfer
                        .files[0]
                );
            }
        );
    }


    /* =========================================================
       TEXT INPUT
    ========================================================= */

    const textInput =
        $("text-input");


    const textApply =
        $("text-apply");


    const textCount =
        $("text-count");


    function injectText() {

        const value =
            textInput
                ? textInput.value
                : "";


        makeTextSource(
            value ||
            "MELT"
        );


        setStatus(
            "TEXT INJECTED"
        );
    }


    if (
        textApply
    ) {

        textApply.addEventListener(
            "click",
            injectText
        );
    }


    if (
        textInput
    ) {

        textInput.addEventListener(
            "input",
            () => {

                if (
                    textCount
                ) {

                    textCount.textContent =
                        `${textInput.value.length} / 120`;
                }
            }
        );


        textInput.addEventListener(
            "keydown",
            event => {

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


    /* =========================================================
       SOURCE TABS
    ========================================================= */

    document
        .querySelectorAll(
            ".source-tab"
        )
        .forEach(
            tab => {

                tab.addEventListener(
                    "click",
                    () => {

                        const isImage =
                            tab.id ===
                            "tab-image";


                        document
                            .querySelectorAll(
                                ".source-tab"
                            )
                            .forEach(
                                item => {

                                    item.classList.toggle(
                                        "active",
                                        item === tab
                                    );
                                }
                            );


                        const imagePanel =
                            $("input-image");


                        const textPanel =
                            $("input-text");


                        if (
                            imagePanel
                        ) {

                            imagePanel.hidden =
                                !isImage;
                        }


                        if (
                            textPanel
                        ) {

                            textPanel.hidden =
                                isImage;
                        }
                    }
                );
            }
        );


    /* =========================================================
       MODES
    ========================================================= */

    document
        .querySelectorAll(
            ".mode"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        state.mode =
                            button.dataset.mode;


                        document
                            .querySelectorAll(
                                ".mode"
                            )
                            .forEach(
                                item => {

                                    item.classList.toggle(
                                        "active",
                                        item ===
                                        button
                                    );
                                }
                            );


                        setStatus(
                            `${state.mode.toUpperCase()} FIELD`
                        );
                    }
                );
            }
        );


    /* =========================================================
       SLIDERS
    ========================================================= */

    const turbulence =
        $("s-turbulence");

    const viscosity =
        $("s-viscosity");

    const density =
        $("s-density");


    function syncSliders() {

        state.turbulence =
            Number(
                turbulence.value
            );


        state.viscosity =
            Number(
                viscosity.value
            );


        state.density =
            Number(
                density.value
            );


        $("turbulence-value")
            .textContent =
            state.turbulence;


        $("viscosity-value")
            .textContent =
            state.viscosity;


        $("density-value")
            .textContent =
            state.density;
    }


    turbulence.addEventListener(
        "input",
        syncSliders
    );


    viscosity.addEventListener(
        "input",
        syncSliders
    );


    density.addEventListener(
        "input",
        () => {

            syncSliders();

            /*
              Rebuild source density.
            */

            buildSourcePoints();
        }
    );


    /* =========================================================
       PALETTES
    ========================================================= */

    document
        .querySelectorAll(
            ".palette"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        state.palette =
                            button.dataset.palette;


                        document
                            .querySelectorAll(
                                ".palette"
                            )
                            .forEach(
                                item => {

                                    item.classList.toggle(
                                        "active",
                                        item ===
                                        button
                                    );
                                }
                            );


                        /*
                          Recolor existing
                          particles without
                          rebuilding their positions.
                        */

                        setStatus(
                            `${state.palette.toUpperCase()} PALETTE`
                        );
                    }
                );
            }
        );


    /* =========================================================
       RESET
    ========================================================= */

    function reset() {

        turbulence.value = 58;
        viscosity.value = 32;
        density.value = 72;


        syncSliders();


        state.mode =
            "fluid";


        state.palette =
            "matrix";


        document
            .querySelectorAll(
                ".mode"
            )
            .forEach(
                item => {

                    item.classList.toggle(
                        "active",
                        item.dataset.mode ===
                        "fluid"
                    );
                }
            );


        document
            .querySelectorAll(
                ".palette"
            )
            .forEach(
                item => {

                    item.classList.toggle(
                        "active",
                        item.dataset.palette ===
                        "matrix"
                    );
                }
            );


        makeTextSource(
            "MELT"
        );


        setStatus(
            "FIELD RESET"
        );
    }


    $("btn-reset")
        .addEventListener(
            "click",
            reset
        );


    $("brand-reset")
        .addEventListener(
            "click",
            reset
        );


    /* =========================================================
       SAVE
    ========================================================= */

    $("btn-save")
        .addEventListener(
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


                const ctx =
                    output.getContext(
                        "2d"
                    );


                ctx.fillStyle =
                    "#020403";


                ctx.fillRect(
                    0,
                    0,
                    output.width,
                    output.height
                );


                if (
                    state.mode !==
                    "ascii"
                ) {

                    ctx.drawImage(
                        fluidCanvas,
                        0,
                        0
                    );
                }


                if (
                    state.mode !==
                    "fluid"
                ) {

                    ctx.drawImage(
                        asciiCanvas,
                        0,
                        0
                    );
                }


                const link =
                    document.createElement(
                        "a"
                    );


                link.download =
                    `MELT-${Date.now()}.png`;


                link.href =
                    output.toDataURL(
                        "image/png"
                    );


                link.click();
            }
        );


    /* =========================================================
       PANEL
    ========================================================= */

    const panel =
        $("control-panel");


    $("panel-close")
        .addEventListener(
            "click",
            () => {

                panel.classList.add(
                    "closed"
                );
            }
        );


    $("panel-toggle")
        .addEventListener(
            "click",
            () => {

                panel.classList.toggle(
                    "closed"
                );
            }
        );


    /* =========================================================
       STATUS
    ========================================================= */

    function setStatus(
        text
    ) {

        const element =
            $("status-text");


        if (
            element
        ) {

            element.textContent =
                text;
        }
    }


    /* =========================================================
       KEYBOARD
    ========================================================= */

    window.addEventListener(
        "keydown",
        event => {

            if (
                event.ctrlKey &&
                event.key.toLowerCase() ===
                "r"
            ) {

                event.preventDefault();

                reset();
            }
        }
    );


    /* =========================================================
       START
    ========================================================= */

    function start() {

        resize();


        /*
          Default source.
        */

        makeTextSource(
            "MELT"
        );


        buildAmbient();


        syncSliders();


        /*
          Initial dark field.
        */

        fluid.fillStyle =
            "#020403";


        fluid.fillRect(
            0,
            0,
            state.width,
            state.height
        );


        /*
          Boot sequence.
        */

        const boot =
            $("boot");


        const bootText =
            $("boot-text");


        const bootPercent =
            $("boot-percent");


        const progress =
            $("boot-progress");


        const steps = [
            "LOADING FIELD",
            "BUILDING PARTICLES",
            "CALCULATING FLOW",
            "INITIALIZING MATTER",
            "FIELD ACTIVE"
        ];


        let current = 0;


        const bootTimer =
            setInterval(
                () => {

                    current++;


                    if (
                        bootText
                    ) {

                        bootText.textContent =
                            steps[
                                Math.min(
                                    current,
                                    steps.length - 1
                                )
                            ];
                    }


                    if (
                        bootPercent
                    ) {

                        bootPercent.textContent =
                            `${Math.min(
                                current * 20,
                                100
                            )
                            .toString()
                            .padStart(
                                2,
                                "0"
                            )}%`;
                    }


                    if (
                        progress
                    ) {

                        progress.style.width =
                            `${Math.min(
                                current * 20,
                                100
                            )}%`;
                    }


                    if (
                        current >= 5
                    ) {

                        clearInterval(
                            bootTimer
                        );


                        setTimeout(
                            () => {

                                if (
                                    boot
                                ) {

                                    boot.classList.add(
                                        "done"
                                    );
                                }

                            },
                            300
                        );
                    }

                },
                180
            );


        requestAnimationFrame(
            animate
        );
    }


    /* =========================================================
       RESIZE
    ========================================================= */

    window.addEventListener(
        "resize",
        () => {

            resize();

            buildAmbient();

            /*
              Rebuild the particle positions so
              text/image remains centered.
            */

            if (
                state.sourcePoints.length
            ) {

                rebuildParticles();
            }
        }
    );


    /* =========================================================
       GO
    ========================================================= */

    try {

        start();

    } catch (error) {

        console.error(
            error
        );


        const errorScreen =
            $("error");


        const errorText =
            $("error-text");


        if (
            errorScreen
        ) {

            errorScreen.hidden =
                false;
        }


        if (
            errorText
        ) {

            errorText.textContent =
                error.message;
        }
    }

})();
