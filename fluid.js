/* =========================================================
   MELT
   Experimental image / text liquefaction engine

   Effects:
   - FLUID
   - ASCII
   - BOTH

   Designed so additional effects can be added later:
   - BITS
   - PIXELS
   - HALFTONE
   - DISPLACE
   - etc.
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     USER CUSTOMIZATION AREA
     -----------------------------------------------
     This is intentionally separated from the engine.
  ======================================================= */

  const MELT_CONFIG = {

    palettes: {

      source: {
        name: "SOURCE"
      },

      matrix: {
        name: "MATRIX"
      },

      monochrome: {
        name: "MONO"
      },

      amber: {
        name: "AMBER"
      }

    },

    ascii: {
      characters: " .,:;irsXA253hMHGS#9B&@",
      minCell: 5,
      maxCell: 18
    },

    fluid: {
      simulationResolution: 128,
      dyeResolution: 512,

      curl: 18,
      velocityDissipation: 0.15,
      dyeDissipation: 0.65,

      pressureIterations: 12,

      splatRadius: 0.16,

      ambientStrength: 0.08
    }

  };


  /* =======================================================
     SHADERS
  ======================================================= */

  const VERT = `#version 300 es

    precision highp float;

    layout(location = 0) in vec2 aPosition;

    out vec2 vUv;
    out vec2 vL;
    out vec2 vR;
    out vec2 vT;
    out vec2 vB;

    uniform vec2 texelSize;

    void main() {

      vUv = aPosition * 0.5 + 0.5;

      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);

      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);

      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;


  const HEADER = `#version 300 es

    precision highp float;
    precision highp sampler2D;
  `;


  const COPY = HEADER + `

    in vec2 vUv;

    uniform sampler2D uTexture;

    out vec4 fragColor;

    void main() {
      fragColor = texture(uTexture, vUv);
    }
  `;


  const CLEAR = HEADER + `

    in vec2 vUv;

    uniform sampler2D uTexture;
    uniform float value;

    out vec4 fragColor;

    void main() {
      fragColor = value * texture(uTexture, vUv);
    }
  `;


  const SPLAT = HEADER + `

    in vec2 vUv;

    uniform sampler2D uTarget;

    uniform float aspectRatio;
    uniform vec3 color;

    uniform vec2 point;
    uniform float radius;

    out vec4 fragColor;

    void main() {

      vec2 p = vUv - point;

      p.x *= aspectRatio;

      float strength =
        exp(-dot(p, p) / radius);

      vec3 base =
        texture(uTarget, vUv).xyz;

      fragColor =
        vec4(base + strength * color, 1.0);
    }
  `;


  const ADVECTION = HEADER + `

    in vec2 vUv;

    uniform sampler2D uVelocity;
    uniform sampler2D uSource;

    uniform vec2 texelSize;

    uniform float dt;
    uniform float dissipation;

    out vec4 fragColor;

    void main() {

      vec2 coord =
        vUv -
        dt *
        texture(uVelocity, vUv).xy *
        texelSize;

      vec4 result =
        texture(uSource, coord);

      float decay =
        1.0 +
        dissipation *
        dt;

      fragColor =
        result / decay;
    }
  `;


  const DIVERGENCE = HEADER + `

    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;

    uniform sampler2D uVelocity;

    out vec4 fragColor;

    void main() {

      float L =
        texture(uVelocity, vL).x;

      float R =
        texture(uVelocity, vR).x;

      float T =
        texture(uVelocity, vT).y;

      float B =
        texture(uVelocity, vB).y;

      vec2 C =
        texture(uVelocity, vUv).xy;

      if (vL.x < 0.0)
        L = -C.x;

      if (vR.x > 1.0)
        R = -C.x;

      if (vT.y > 1.0)
        T = -C.y;

      if (vB.y < 0.0)
        B = -C.y;

      float div =
        0.5 *
        (R - L + T - B);

      fragColor =
        vec4(div, 0.0, 0.0, 1.0);
    }
  `;


  const CURL = HEADER + `

    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;

    uniform sampler2D uVelocity;

    out vec4 fragColor;

    void main() {

      float L =
        texture(uVelocity, vL).y;

      float R =
        texture(uVelocity, vR).y;

      float T =
        texture(uVelocity, vT).x;

      float B =
        texture(uVelocity, vB).x;

      float curl =
        R - L - T + B;

      fragColor =
        vec4(0.5 * curl, 0.0, 0.0, 1.0);
    }
  `;


  const VORTICITY = HEADER + `

    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;

    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;

    uniform float curl;
    uniform float dt;

    out vec4 fragColor;

    void main() {

      float L =
        texture(uCurl, vL).x;

      float R =
        texture(uCurl, vR).x;

      float T =
        texture(uCurl, vT).x;

      float B =
        texture(uCurl, vB).x;

      float C =
        texture(uCurl, vUv).x;

      vec2 force =
        0.5 *
        vec2(
          abs(T) - abs(B),
          abs(R) - abs(L)
        );

      force /=
        length(force) + 0.0001;

      force *=
        curl * C;

      force.y *= -1.0;

      vec2 vel =
        texture(uVelocity, vUv).xy;

      fragColor =
        vec4(
          vel + force * dt,
          0.0,
          1.0
        );
    }
  `;


  const PRESSURE = HEADER + `

    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;

    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    out vec4 fragColor;

    void main() {

      float L =
        texture(uPressure, vL).x;

      float R =
        texture(uPressure, vR).x;

      float T =
        texture(uPressure, vT).x;

      float B =
        texture(uPressure, vB).x;

      float divergence =
        texture(uDivergence, vUv).x;

      float pressure =
        (L + R + B + T - divergence)
        * 0.25;

      fragColor =
        vec4(
          pressure,
          0.0,
          0.0,
          1.0
        );
    }
  `;


  const GRADIENT = HEADER + `

    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;

    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    out vec4 fragColor;

    void main() {

      float L =
        texture(uPressure, vL).x;

      float R =
        texture(uPressure, vR).x;

      float T =
        texture(uPressure, vT).x;

      float B =
        texture(uPressure, vB).x;

      vec2 velocity =
        texture(uVelocity, vUv).xy;

      velocity -=
        vec2(
          R - L,
          T - B
        );

      fragColor =
        vec4(
          velocity,
          0.0,
          1.0
        );
    }
  `;


  const DISPLAY = HEADER + `

    in vec2 vUv;

    uniform sampler2D uTexture;

    uniform int uPalette;

    out vec4 fragColor;

    void main() {

      vec4 c =
        texture(uTexture, vUv);

      float lum =
        dot(
          c.rgb,
          vec3(
            0.299,
            0.587,
            0.114
          )
        );

      vec3 col;

      if (uPalette == 1) {

        // matrix
        col =
          vec3(
            0.02,
            0.35,
            0.11
          )
          *
          (0.25 + lum * 2.2);

      } else if (uPalette == 2) {

        // monochrome
        col =
          vec3(lum);

      } else if (uPalette == 3) {

        // amber
        col =
          vec3(
            lum * 1.0,
            lum * 0.55,
            lum * 0.08
          );

      } else {

        // source / default
        col =
          c.rgb;
      }

      fragColor =
        vec4(col, 1.0);
    }
  `;


  /* =======================================================
     WEBGL HELPERS
  ======================================================= */

  function compileShader(gl, type, source) {

    const shader =
      gl.createShader(type);

    gl.shaderSource(
      shader,
      source
    );

    gl.compileShader(shader);

    if (!gl.getShaderParameter(
      shader,
      gl.COMPILE_STATUS
    )) {

      const info =
        gl.getShaderInfoLog(shader);

      gl.deleteShader(shader);

      throw new Error(
        "Shader error:\n" + info
      );
    }

    return shader;
  }


  class Program {

    constructor(gl, vert, frag) {

      this.gl = gl;

      const vs =
        compileShader(
          gl,
          gl.VERTEX_SHADER,
          vert
        );

      const fs =
        compileShader(
          gl,
          gl.FRAGMENT_SHADER,
          frag
        );

      this.program =
        gl.createProgram();

      gl.attachShader(
        this.program,
        vs
      );

      gl.attachShader(
        this.program,
        fs
      );

      gl.linkProgram(
        this.program
      );

      if (!gl.getProgramParameter(
        this.program,
        gl.LINK_STATUS
      )) {

        throw new Error(
          "Program link error:\n" +
          gl.getProgramInfoLog(
            this.program
          )
        );
      }

      this.uniforms = {};

      const count =
        gl.getProgramParameter(
          this.program,
          gl.ACTIVE_UNIFORMS
        );

      for (let i = 0; i < count; i++) {

        const info =
          gl.getActiveUniform(
            this.program,
            i
          );

        this.uniforms[info.name] =
          gl.getUniformLocation(
            this.program,
            info.name
          );
      }
    }

    bind() {

      this.gl.useProgram(
        this.program
      );
    }

    set1i(name, value) {

      const location =
        this.uniforms[name];

      if (location !== null &&
          location !== undefined) {

        this.gl.uniform1i(
          location,
          value
        );
      }
    }

    set1f(name, value) {

      const location =
        this.uniforms[name];

      if (location !== null &&
          location !== undefined) {

        this.gl.uniform1f(
          location,
          value
        );
      }
    }

    set2f(name, a, b) {

      const location =
        this.uniforms[name];

      if (location !== null &&
          location !== undefined) {

        this.gl.uniform2f(
          location,
          a,
          b
        );
      }
    }

    set3f(name, a, b, c) {

      const location =
        this.uniforms[name];

      if (location !== null &&
          location !== undefined) {

        this.gl.uniform3f(
          location,
          a,
          b,
          c
        );
      }
    }
  }


  /* =======================================================
     FLUID SIMULATION
  ======================================================= */

  class FluidSim {

    constructor(canvas) {

      this.canvas = canvas;

      this.supported = false;

      const gl =
        canvas.getContext(
          "webgl2",
          {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: true
          }
        );

      if (!gl)
        return;

      const floatExtension =
        gl.getExtension(
          "EXT_color_buffer_float"
        );

      if (!floatExtension)
        return;

      gl.getExtension(
        "OES_texture_float_linear"
      );

      this.gl = gl;

      this.type =
        gl.HALF_FLOAT;

      this.internalFormatRGBA =
        gl.RGBA16F;

      this.internalFormatR =
        gl.R16F;

      this.supported = true;

      const config =
        MELT_CONFIG.fluid;

      this.simRes =
        config.simulationResolution;

      this.dyeRes =
        config.dyeResolution;

      this.params = {

        curl: config.curl,

        velocityDissipation:
          config.velocityDissipation,

        dyeDissipation:
          config.dyeDissipation,

        pressureIterations:
          config.pressureIterations,

        splatRadius:
          config.splatRadius
      };

      this._createQuad();

      this._compile();

      this._allocate();

      this._ambientPhase =
        Math.random() * 1000;

      this._sourceImageEl = null;
    }


    _createQuad() {

      const gl = this.gl;

      this.vao =
        gl.createVertexArray();

      gl.bindVertexArray(
        this.vao
      );

      const vertices =
        new Float32Array([
          -1, -1,
          -1,  1,
           1,  1,
           1, -1
        ]);

      const indices =
        new Uint16Array([
          0, 1, 2,
          0, 2, 3
        ]);

      const buffer =
        gl.createBuffer();

      gl.bindBuffer(
        gl.ARRAY_BUFFER,
        buffer
      );

      gl.bufferData(
        gl.ARRAY_BUFFER,
        vertices,
        gl.STATIC_DRAW
      );

      gl.enableVertexAttribArray(0);

      gl.vertexAttribPointer(
        0,
        2,
        gl.FLOAT,
        false,
        0,
        0
      );

      const element =
        gl.createBuffer();

      gl.bindBuffer(
        gl.ELEMENT_ARRAY_BUFFER,
        element
      );

      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        indices,
        gl.STATIC_DRAW
      );

      gl.bindVertexArray(null);
    }


    _draw() {

      const gl = this.gl;

      gl.bindVertexArray(
        this.vao
      );

      gl.drawElements(
        gl.TRIANGLES,
        6,
        gl.UNSIGNED_SHORT,
        0
      );

      gl.bindVertexArray(null);
    }


    _compile() {

      const gl = this.gl;

      this.copy =
        new Program(
          gl,
          VERT,
          COPY
        );

      this.clear =
        new Program(
          gl,
          VERT,
          CLEAR
        );

      this.splatProgram =
        new Program(
          gl,
          VERT,
          SPLAT
        );

      this.advection =
        new Program(
          gl,
          VERT,
          ADVECTION
        );

      this.divergence =
        new Program(
          gl,
          VERT,
          DIVERGENCE
        );

      this.curl =
        new Program(
          gl,
          VERT,
          CURL
        );

      this.vorticity =
        new Program(
          gl,
          VERT,
          VORTICITY
        );

      this.pressure =
        new Program(
          gl,
          VERT,
          PRESSURE
        );

      this.gradient =
        new Program(
          gl,
          VERT,
          GRADIENT
        );

      this.display =
        new Program(
          gl,
          VERT,
          DISPLAY
        );
    }


    _createFBO(
      w,
      h,
      internalFormat,
      format,
      type,
      filter
    ) {

      const gl = this.gl;

      const texture =
        gl.createTexture();

      gl.bindTexture(
        gl.TEXTURE_2D,
        texture
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        filter
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        filter
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE
      );

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        w,
        h,
        0,
        format,
        type,
        null
      );

      const fbo =
        gl.createFramebuffer();

      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        fbo
      );

      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );

      const status =
        gl.checkFramebufferStatus(
          gl.FRAMEBUFFER
        );

      if (
        status !==
        gl.FRAMEBUFFER_COMPLETE
      ) {

        console.warn(
          "MELT FBO incomplete:",
          status,
          w,
          h
        );
      }

      return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX: 1 / w,
        texelSizeY: 1 / h
      };
    }


    _doubleFBO(
      w,
      h,
      internalFormat,
      format,
      type,
      filter
    ) {

      let a =
        this._createFBO(
          w,
          h,
          internalFormat,
          format,
          type,
          filter
        );

      let b =
        this._createFBO(
          w,
          h,
          internalFormat,
          format,
          type,
          filter
        );

      return {

        get read() {
          return a;
        },

        get write() {
          return b;
        },

        swap() {
          const temp = a;
          a = b;
          b = temp;
        },

        width: w,
        height: h,

        texelSizeX: 1 / w,
        texelSizeY: 1 / h
      };
    }


    _allocate() {

      const aspect =
        this.canvas.clientWidth /
        Math.max(
          1,
          this.canvas.clientHeight
        );

      const s =
        this.simRes;

      const d =
        this.dyeRes;

      const simW =
        aspect >= 1
          ? s
          : Math.max(
              1,
              Math.round(s * aspect)
            );

      const simH =
        aspect >= 1
          ? Math.max(
              1,
              Math.round(s / aspect)
            )
          : s;

      const dyeW =
        aspect >= 1
          ? d
          : Math.max(
              1,
              Math.round(d * aspect)
            );

      const dyeH =
        aspect >= 1
          ? Math.max(
              1,
              Math.round(d / aspect)
            )
          : d;

      const gl = this.gl;

      this.velocity =
        this._doubleFBO(
          simW,
          simH,
          this.internalFormatRGBA,
          gl.RGBA,
          this.type,
          gl.LINEAR
        );

      this.pressure =
        this._doubleFBO(
          simW,
          simH,
          this.internalFormatR,
          gl.RED,
          this.type,
          gl.NEAREST
        );

      this.divergenceFBO =
        this._createFBO(
          simW,
          simH,
          this.internalFormatR,
          gl.RED,
          this.type,
          gl.NEAREST
        );

      this.curlFBO =
        this._createFBO(
          simW,
          simH,
          this.internalFormatR,
          gl.RED,
          this.type,
          gl.NEAREST
        );

      this.dye =
        this._doubleFBO(
          dyeW,
          dyeH,
          this.internalFormatRGBA,
          gl.RGBA,
          this.type,
          gl.LINEAR
        );

      this.sourceFBO =
        this._createFBO(
          dyeW,
          dyeH,
          this.internalFormatRGBA,
          gl.RGBA,
          this.type,
          gl.LINEAR
        );

      this.aspect =
        aspect;
    }


    resize() {

      const dpr =
        Math.min(
          window.devicePixelRatio || 1,
          2
        );

      const w =
        Math.max(
          1,
          Math.round(
            this.canvas.clientWidth *
            dpr
          )
        );

      const h =
        Math.max(
          1,
          Math.round(
            this.canvas.clientHeight *
            dpr
          )
        );

      if (
        this.canvas.width !== w ||
        this.canvas.height !== h
      ) {

        this.canvas.width = w;
        this.canvas.height = h;

        this._allocate();

        if (
          this._sourceImageEl
        ) {

          this.setSourceImage(
            this._sourceImageEl
          );
        }
      }
    }


    _blit(fbo) {

      const gl = this.gl;

      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        fbo
      );

      this._draw();
    }


    _copy(src, dst) {

      const gl = this.gl;

      gl.viewport(
        0,
        0,
        dst.width,
        dst.height
      );

      this.copy.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        src.texture
      );

      this.copy.set1i(
        "uTexture",
        0
      );

      this._blit(dst.fbo);
    }


    setSourceImage(el) {

      const gl = this.gl;

      this._sourceImageEl =
        el;

      const texture =
        gl.createTexture();

      gl.bindTexture(
        gl.TEXTURE_2D,
        texture
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        gl.LINEAR
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE
      );

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE
      );

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        el
      );

      gl.viewport(
        0,
        0,
        this.sourceFBO.width,
        this.sourceFBO.height
      );

      this.copy.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        texture
      );

      this.copy.set1i(
        "uTexture",
        0
      );

      this._blit(
        this.sourceFBO.fbo
      );

      gl.deleteTexture(
        texture
      );

      this._copy(
        this.sourceFBO,
        this.dye.read
      );

      this._copy(
        this.sourceFBO,
        this.dye.write
      );
    }


    splat(
      x,
      y,
      dx,
      dy
    ) {

      const gl = this.gl;

      /* velocity */

      gl.viewport(
        0,
        0,
        this.velocity.width,
        this.velocity.height
      );

      this.splatProgram.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.velocity.read.texture
      );

      this.splatProgram.set1i(
        "uTarget",
        0
      );

      this.splatProgram.set1f(
        "aspectRatio",
        this.aspect
      );

      this.splatProgram.set2f(
        "point",
        x,
        1 - y
      );

      this.splatProgram.set3f(
        "color",
        dx * 0.9,
        -dy * 0.9,
        0
      );

      this.splatProgram.set1f(
        "radius",
        this.params.splatRadius
      );

      this._blit(
        this.velocity.write.fbo
      );

      this.velocity.swap();


      /* dye */

      gl.viewport(
        0,
        0,
        this.dye.width,
        this.dye.height
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.dye.read.texture
      );

      this.splatProgram.set1i(
        "uTarget",
        0
      );

      const energy =
        Math.min(
          1,
          Math.hypot(dx, dy) * 7
        );

      this.splatProgram.set3f(
        "color",
        energy * 0.05,
        energy * 0.05,
        energy * 0.05
      );

      this._blit(
        this.dye.write.fbo
      );

      this.dye.swap();
    }


    ambient(strength) {

      this._ambientPhase +=
        0.006;

      const a =
        this._ambientPhase;

      const x =
        0.5 +
        0.35 *
        Math.sin(a * 0.9) *
        Math.cos(a * 0.31);

      const y =
        0.5 +
        0.35 *
        Math.cos(a * 0.7) *
        Math.sin(a * 0.23);

      const dx =
        Math.cos(a * 1.7) *
        strength;

      const dy =
        Math.sin(a * 1.3) *
        strength;

      this.splat(
        x,
        y,
        dx,
        dy
      );
    }


    step(dt) {

      const gl = this.gl;

      dt =
        Math.min(
          dt,
          1 / 30
        );

      /* CURL */

      gl.viewport(
        0,
        0,
        this.velocity.width,
        this.velocity.height
      );

      this.curl.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.velocity.read.texture
      );

      this.curl.set1i(
        "uVelocity",
        0
      );

      this.curl.set2f(
        "texelSize",
        this.velocity.texelSizeX,
        this.velocity.texelSizeY
      );

      this._blit(
        this.curlFBO.fbo
      );


      /* VORTICITY */

      this.vorticity.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.velocity.read.texture
      );

      this.vorticity.set1i(
        "uVelocity",
        0
      );

      gl.activeTexture(
        gl.TEXTURE1
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.curlFBO.texture
      );

      this.vorticity.set1i(
        "uCurl",
        1
      );

      this.vorticity.set1f(
        "curl",
        this.params.curl
      );

      this.vorticity.set1f(
        "dt",
        dt
      );

      this.vorticity.set2f(
        "texelSize",
        this.velocity.texelSizeX,
        this.velocity.texelSizeY
      );

      this._blit(
        this.velocity.write.fbo
      );

      this.velocity.swap();


      /* DIVERGENCE */

      this.divergence.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.velocity.read.texture
      );

      this.divergence.set1i(
        "uVelocity",
        0
      );

      this.divergence.set2f(
        "texelSize",
        this.velocity.texelSizeX,
        this.velocity.texelSizeY
      );

      this._blit(
        this.divergenceFBO.fbo
      );


      /* PRESSURE */

      this.clear.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.pressure.read.texture
      );

      this.clear.set1i(
        "uTexture",
        0
      );

      this.clear.set1f(
        "value",
        0.8
      );

      this._blit(
        this.pressure.write.fbo
      );

      this.pressure.swap();


      this.pressure.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.divergenceFBO.texture
      );

      this.pressure.set1i(
        "uDivergence",
        0
      );

      this.pressure.set2f(
        "texelSize",
        this.velocity.texelSizeX,
        this.velocity.texelSizeY
      );

      for (
        let i = 0;
        i <
        this.params.pressureIterations;
        i++
      ) {

        gl.activeTexture(
          gl.TEXTURE1
        );

        gl.bindTexture(
          gl.TEXTURE_2D,
          this.pressure.read.texture
        );

        this.pressure.set1i(
          "uPressure",
          1
        );

        this._blit(
          this.pressure.write.fbo
        );

        this.pressure.swap();
      }


      /* GRADIENT */

      this.gradient.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.pressure.read.texture
      );

      this.gradient.set1i(
        "uPressure",
        0
      );

      gl.activeTexture(
        gl.TEXTURE1
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.velocity.read.texture
      );

      this.gradient.set1i(
        "uVelocity",
        1
      );

      this.gradient.set2f(
        "texelSize",
        this.velocity.texelSizeX,
        this.velocity.texelSizeY
      );

      this._blit(
        this.velocity.write.fbo
      );

      this.velocity.swap();


      /* ADVECT VELOCITY */

      this.advection.bind();

      gl.viewport(
        0,
        0,
        this.velocity.width,
        this.velocity.height
      );

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.velocity.read.texture
      );

      this.advection.set1i(
        "uVelocity",
        0
      );

      gl.activeTexture(
        gl.TEXTURE1
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.velocity.read.texture
      );

      this.advection.set1i(
        "uSource",
        1
      );

      this.advection.set2f(
        "texelSize",
        this.velocity.texelSizeX,
        this.velocity.texelSizeY
      );

      this.advection.set1f(
        "dt",
        dt
      );

      this.advection.set1f(
        "dissipation",
        this.params.velocityDissipation
      );

      this._blit(
        this.velocity.write.fbo
      );

      this.velocity.swap();


      /* ADVECT DYE */

      gl.viewport(
        0,
        0,
        this.dye.width,
        this.dye.height
      );

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.velocity.read.texture
      );

      this.advection.set1i(
        "uVelocity",
        0
      );

      gl.activeTexture(
        gl.TEXTURE1
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.dye.read.texture
      );

      this.advection.set1i(
        "uSource",
        1
      );

      this.advection.set2f(
        "texelSize",
        this.velocity.texelSizeX,
        this.velocity.texelSizeY
      );

      this.advection.set1f(
        "dissipation",
        this.params.dyeDissipation
      );

      this._blit(
        this.dye.write.fbo
      );

      this.dye.swap();
    }


    render(
      palette = 1
    ) {

      const gl = this.gl;

      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        null
      );

      gl.viewport(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

      this.display.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.dye.read.texture
      );

      this.display.set1i(
        "uTexture",
        0
      );

      this.display.set1i(
        "uPalette",
        palette
      );

      this._draw();
    }


    readPixels(
      width,
      height
    ) {

      const gl = this.gl;

      const fbo =
        this._createFBO(
          width,
          height,
          gl.RGBA8,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          gl.LINEAR
        );

      gl.viewport(
        0,
        0,
        width,
        height
      );

      this.copy.bind();

      gl.activeTexture(
        gl.TEXTURE0
      );

      gl.bindTexture(
        gl.TEXTURE_2D,
        this.dye.read.texture
      );

      this.copy.set1i(
        "uTexture",
        0
      );

      this._blit(
        fbo.fbo
      );

      const pixels =
        new Uint8Array(
          width *
          height *
          4
        );

      gl.readPixels(
        0,
        0,
        width,
        height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );

      return {
        pixels,
        width,
        height
      };
    }
  }


  /* =======================================================
     ASCII ENGINE
  ======================================================= */

  class ASCIIEffect {

    constructor(canvas) {

      this.canvas = canvas;

      this.ctx =
        canvas.getContext(
          "2d"
        );

      this.source = null;
    }


    setSource(source) {

      this.source =
        source;
    }


    render(cellSize) {

      if (!this.source)
        return;

      const canvas =
        this.canvas;

      const ctx =
        this.ctx;

      const w =
        canvas.width;

      const h =
        canvas.height;

      ctx.clearRect(
        0,
        0,
        w,
        h
      );

      const cols =
        Math.max(
          20,
          Math.floor(
            w / cellSize
          )
        );

      const rows =
        Math.max(
          10,
          Math.floor(
            h /
            (cellSize * 2)
          )
        );

      const off =
        document.createElement(
          "canvas"
        );

      off.width =
        cols;

      off.height =
        rows;

      const octx =
        off.getContext(
          "2d"
        );

      octx.drawImage(
        this.source,
        0,
        0,
        cols,
        rows
      );

      const data =
        octx.getImageData(
          0,
          0,
          cols,
          rows
        ).data;

      const chars =
        MELT_CONFIG.ascii.characters;

      const fontSize =
        cellSize;

      ctx.font =
        `${fontSize}px IBM Plex Mono, monospace`;

      ctx.textBaseline =
        "top";

      ctx.fillStyle =
        "#7dffab";

      for (
        let y = 0;
        y < rows;
        y++
      ) {

        for (
          let x = 0;
          x < cols;
          x++
        ) {

          const i =
            (y * cols + x) * 4;

          const r =
            data[i];

          const g =
            data[i + 1];

          const b =
            data[i + 2];

          const lum =
            (
              r * 0.299 +
              g * 0.587 +
              b * 0.114
            ) / 255;

          const index =
            Math.floor(
              lum *
              (chars.length - 1)
            );

          const char =
            chars[index];

          if (char === " ")
            continue;

          ctx.fillText(
            char,
            x * cellSize,
            y * cellSize * 2
          );
        }
      }
    }
  }


  /* =======================================================
     SOURCE CREATION
  ======================================================= */

  function createTextSource(
    text
  ) {

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      1200;

    canvas.height =
      700;

    const ctx =
      canvas.getContext(
        "2d"
      );

    ctx.fillStyle =
      "#050706";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle =
      "#d7e4da";

    ctx.font =
      "600 150px Fraunces, Georgia, serif";

    ctx.textAlign =
      "center";

    ctx.textBaseline =
      "middle";

    ctx.fillText(
      text || "MELT",
      canvas.width / 2,
      canvas.height / 2
    );

    return canvas;
  }


  /* =======================================================
     APPLICATION
  ======================================================= */

  function boot() {

    const canvas =
      document.getElementById(
        "glcanvas"
      );

    const asciiCanvas =
      document.getElementById(
        "asciicanvas"
      );

    const loading =
      document.getElementById(
        "loading"
      );

    if (!canvas) {
      console.error(
        "MELT: canvas missing."
      );
      return;
    }

    let sim;

    try {

      sim =
        new FluidSim(
          canvas
        );

    } catch (error) {

      console.error(
        "MELT initialization failed:",
        error
      );

      loading.innerHTML =
        "<span>WEBGL INITIALIZATION FAILED</span>";

      return;
    }


    if (!sim.supported) {

      loading.innerHTML =
        "<span>WEBGL2 FLOAT BUFFER NOT SUPPORTED</span>";

      return;
    }


    const ascii =
      new ASCIIEffect(
        asciiCanvas
      );


    /* -----------------------------------------------------
       STATE
    ----------------------------------------------------- */

    let mode =
      "fluid";

    let palette =
      "matrix";

    let source =
      createTextSource(
        "MELT"
      );

    let pointerActive =
      false;

    let lastX = 0;
    let lastY = 0;

    let lastTime =
      performance.now();


    /* -----------------------------------------------------
       RESIZE
    ----------------------------------------------------- */

    function resize() {

      sim.resize();

      const dpr =
        Math.min(
          window.devicePixelRatio || 1,
          2
        );

      asciiCanvas.width =
        Math.max(
          1,
          Math.round(
            asciiCanvas.clientWidth *
            dpr
          )
        );

      asciiCanvas.height =
        Math.max(
          1,
          Math.round(
            asciiCanvas.clientHeight *
            dpr
          )
        );
    }

    window.addEventListener(
      "resize",
      resize
    );

    resize();


    /* -----------------------------------------------------
       INITIAL SOURCE
    ----------------------------------------------------- */

    sim.setSourceImage(
      source
    );

    ascii.setSource(
      source
    );


    /* -----------------------------------------------------
       MOUSE
    ----------------------------------------------------- */

    function pointerMove(
      event
    ) {

      const rect =
        canvas.getBoundingClientRect();

      const x =
        (
          event.clientX -
          rect.left
        ) /
        rect.width;

      const y =
        (
          event.clientY -
          rect.top
        ) /
        rect.height;

      if (pointerActive) {

        const dx =
          x - lastX;

        const dy =
          y - lastY;

        sim.splat(
          x,
          y,
          dx,
          dy
        );
      }

      lastX = x;
      lastY = y;
    }


    canvas.addEventListener(
      "pointerdown",
      event => {

        pointerActive =
          true;

        canvas.setPointerCapture(
          event.pointerId
        );

        pointerMove(
          event
        );
      }
    );


    canvas.addEventListener(
      "pointermove",
      pointerMove
    );


    canvas.addEventListener(
      "pointerup",
      event => {

        pointerActive =
          false;

        try {

          canvas.releasePointerCapture(
            event.pointerId
          );

        } catch {}
      }
    );


    canvas.addEventListener(
      "pointerleave",
      () => {

        pointerActive =
          false;
      }
    );


    /* -----------------------------------------------------
       IMAGE UPLOAD
    ----------------------------------------------------- */

    const fileInput =
      document.getElementById(
        "file-input"
      );

    const dropzone =
      document.getElementById(
        "dropzone"
      );


    function loadImage(
      file
    ) {

      if (!file ||
          !file.type.startsWith(
            "image/"
          )) {

        return;
      }

      const url =
        URL.createObjectURL(
          file
        );

      const img =
        new Image();

      img.onload = () => {

        source =
          img;

        sim.setSourceImage(
          img
        );

        ascii.setSource(
          img
        );

        URL.revokeObjectURL(
          url
        );
      };

      img.src =
        url;
    }


    fileInput.addEventListener(
      "change",
      event => {

        const file =
          event.target.files[0];

        loadImage(
          file
        );
      }
    );


    /* drag/drop */

    dropzone.addEventListener(
      "dragover",
      event => {

        event.preventDefault();

        dropzone.classList.add(
          "is-drag"
        );
      }
    );


    dropzone.addEventListener(
      "dragleave",
      () => {

        dropzone.classList.remove(
          "is-drag"
        );
      }
    );


    dropzone.addEventListener(
      "drop",
      event => {

        event.preventDefault();

        dropzone.classList.remove(
          "is-drag"
        );

        loadImage(
          event.dataTransfer.files[0]
        );
      }
    );


    /* -----------------------------------------------------
       TEXT
    ----------------------------------------------------- */

    const textInput =
      document.getElementById(
        "text-input"
      );

    const textApply =
      document.getElementById(
        "text-apply"
      );


    function applyText() {

      const text =
        textInput.value.trim();

      if (!text)
        return;

      source =
        createTextSource(
          text
        );

      sim.setSourceImage(
        source
      );

      ascii.setSource(
        source
      );
    }


    textApply.addEventListener(
      "click",
      applyText
    );


    /* -----------------------------------------------------
       INPUT TABS
    ----------------------------------------------------- */

    const tabImage =
      document.getElementById(
        "tab-image"
      );

    const tabText =
      document.getElementById(
        "tab-text"
      );

    const inputImage =
      document.getElementById(
        "input-image"
      );

    const inputText =
      document.getElementById(
        "input-text"
      );


    tabImage.addEventListener(
      "click",
      () => {

        tabImage.setAttribute(
          "aria-selected",
          "true"
        );

        tabText.setAttribute(
          "aria-selected",
          "false"
        );

        inputImage.hidden =
          false;

        inputText.hidden =
          true;
      }
    );


    tabText.addEventListener(
      "click",
      () => {

        tabImage.setAttribute(
          "aria-selected",
          "false"
        );

        tabText.setAttribute(
          "aria-selected",
          "true"
        );

        inputImage.hidden =
          true;

        inputText.hidden =
          false;
      }
    );


    /* -----------------------------------------------------
       EFFECT MODE
    ----------------------------------------------------- */

    document
      .querySelectorAll(
        ".seg-btn"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              document
                .querySelectorAll(
                  ".seg-btn"
                )
                .forEach(
                  b =>
                    b.classList.remove(
                      "is-active"
                    )
                );

              button.classList.add(
                "is-active"
              );

              mode =
                button.dataset.mode;

              asciiCanvas.style.display =
                mode === "ascii" ||
                mode === "both"
                  ? "block"
                  : "none";
            }
          );
        }
      );


    /* -----------------------------------------------------
       PALETTE
    ----------------------------------------------------- */

    const paletteMap = {

      source: 0,
      matrix: 1,
      monochrome: 2,
      amber: 3

    };


    document
      .querySelectorAll(
        ".swatch"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              document
                .querySelectorAll(
                  ".swatch"
                )
                .forEach(
                  b =>
                    b.classList.remove(
                      "is-active"
                    )
                );

              button.classList.add(
                "is-active"
              );

              palette =
                button.dataset.palette;
            }
          );
        }
      );


    /* -----------------------------------------------------
       SLIDERS
    ----------------------------------------------------- */

    const turbulence =
      document.getElementById(
        "s-turbulence"
      );

    const viscosity =
      document.getElementById(
        "s-viscosity"
      );

    const density =
      document.getElementById(
        "s-density"
      );


    turbulence.addEventListener(
      "input",
      () => {

        sim.params.curl =
          Number(
            turbulence.value
          ) * 0.5;
      }
    );


    viscosity.addEventListener(
      "input",
      () => {

        sim.params.dyeDissipation =
          Number(
            viscosity.value
          ) / 100;
      }
    );


    /* -----------------------------------------------------
       RESET
    ----------------------------------------------------- */

    document
      .getElementById(
        "btn-reset"
      )
      .addEventListener(
        "click",
        () => {

          sim.setSourceImage(
            source
          );
        }
      );


    /* -----------------------------------------------------
       SAVE
    ----------------------------------------------------- */

    document
      .getElementById(
        "btn-save"
      )
      .addEventListener(
        "click",
        () => {

          const link =
            document.createElement(
              "a"
            );

          link.download =
            "melt-frame.png";

          link.href =
            canvas.toDataURL(
              "image/png"
            );

          link.click();
        }
      );


    /* -----------------------------------------------------
       LOADING
    ----------------------------------------------------- */

    loading.hidden =
      true;


    /* -----------------------------------------------------
       LOOP
    ----------------------------------------------------- */

    function frame(now) {

      const dt =
        Math.min(
          (now - lastTime) /
            1000,
          1 / 30
        );

      lastTime =
        now;


      /* automatic movement */

      sim.ambient(
        MELT_CONFIG.fluid
          .ambientStrength
      );


      sim.step(
        dt
      );


      /* fluid */

      if (
        mode === "fluid" ||
        mode === "both"
      ) {

        sim.render(
          paletteMap[
            palette
          ]
        );
      }


      /* ascii */

      if (
        mode === "ascii" ||
        mode === "both"
      ) {

        const cell =
          Number(
            density.value
          ) / 5;

        ascii.render(
          Math.max(
            MELT_CONFIG.ascii.minCell,
            Math.min(
              MELT_CONFIG.ascii.maxCell,
              cell
            )
          )
        );
      }


      requestAnimationFrame(
        frame
      );
    }


    requestAnimationFrame(
      frame
    );


    console.log(
      "%cMELT",
      "font-size:24px;font-weight:bold"
    );

    console.log(
      "experimental image liquefaction engine online"
    );
  }


  /* =======================================================
     START
  ======================================================= */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      boot
    );

  } else {

    boot();
  }

})();
