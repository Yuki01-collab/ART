/**
 * fluid.js
 * A compact WebGL2 implementation of Jos Stam's "stable fluids" method
 * (semi-Lagrangian advection + Jacobi pressure projection + vorticity
 * confinement). The image or text the user supplies is uploaded as the
 * dye field and gets carried along by a velocity field that's driven by
 * pointer input plus a small amount of ambient curl noise, so it looks
 * like the source is slowly melting / swirling.
 *
 * Requires WebGL2 with EXT_color_buffer_float (or _half_float). Both are
 * supported by every evergreen browser released after ~2021. If neither
 * is available, FluidSim.supported will be false and the caller should
 * show a fallback message instead of starting the render loop.
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // Shader sources
  // ---------------------------------------------------------------------

  const VERT = `#version 300 es
    precision highp float;
    in vec2 aPosition;
    out vec2 vUv;
    out vec2 vL;
    out vec2 vR;
    out vec2 vT;
    out vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const FRAG_HEADER = `#version 300 es
    precision highp float;
    precision highp sampler2D;
  `;

  const COPY_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    uniform sampler2D uTexture;
    out vec4 fragColor;
    void main () { fragColor = texture(uTexture, vUv); }
  `;

  const CLEAR_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    out vec4 fragColor;
    void main () { fragColor = value * texture(uTexture, vUv); }
  `;

  const SPLAT_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    out vec4 fragColor;
    void main () {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture(uTarget, vUv).xyz;
      fragColor = vec4(base + splat, 1.0);
    }
  `;

  const ADVECTION_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;
    out vec4 fragColor;
    void main () {
      vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
      vec4 result = texture(uSource, coord);
      float decay = 1.0 + dissipation * dt;
      fragColor = result / decay;
    }
  `;

  const DIVERGENCE_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uVelocity;
    out vec4 fragColor;
    void main () {
      float L = texture(uVelocity, vL).x;
      float R = texture(uVelocity, vR).x;
      float T = texture(uVelocity, vT).y;
      float B = texture(uVelocity, vB).y;
      vec2 C = texture(uVelocity, vUv).xy;
      if (vL.x < 0.0) L = -C.x;
      if (vR.x > 1.0) R = -C.x;
      if (vT.y > 1.0) T = -C.y;
      if (vB.y < 0.0) B = -C.y;
      float div = 0.5 * (R - L + T - B);
      fragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `;

  const CURL_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uVelocity;
    out vec4 fragColor;
    void main () {
      float L = texture(uVelocity, vL).y;
      float R = texture(uVelocity, vR).y;
      float T = texture(uVelocity, vT).x;
      float B = texture(uVelocity, vB).x;
      float vorticity = R - L - T + B;
      fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
  `;

  const VORTICITY_FRAG = FRAG_HEADER + `
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
    void main () {
      float L = texture(uCurl, vL).x;
      float R = texture(uCurl, vR).x;
      float T = texture(uCurl, vT).x;
      float B = texture(uCurl, vB).x;
      float C = texture(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 vel = texture(uVelocity, vUv).xy;
      fragColor = vec4(vel + force * dt, 0.0, 1.0);
    }
  `;

  const PRESSURE_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    out vec4 fragColor;
    void main () {
      float L = texture(uPressure, vL).x;
      float R = texture(uPressure, vR).x;
      float T = texture(uPressure, vT).x;
      float B = texture(uPressure, vB).x;
      float divergence = texture(uDivergence, vUv).x;
      float pressure = (L + R + B + T - divergence) * 0.25;
      fragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
  `;

  const GRADIENT_SUBTRACT_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    out vec4 fragColor;
    void main () {
      float L = texture(uPressure, vL).x;
      float R = texture(uPressure, vR).x;
      float T = texture(uPressure, vT).x;
      float B = texture(uPressure, vB).x;
      vec2 velocity = texture(uVelocity, vUv).xy;
      velocity -= vec2(R - L, T - B);
      fragColor = vec4(velocity, 0.0, 1.0);
    }
  `;

  const SOURCE_MIX_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    uniform sampler2D uDye;
    uniform sampler2D uSource;
    uniform float amount;
    out vec4 fragColor;
    void main () {
      vec4 dye = texture(uDye, vUv);
      vec4 src = texture(uSource, vUv);
      fragColor = mix(dye, src, amount);
    }
  `;

  const DISPLAY_FRAG = FRAG_HEADER + `
    in vec2 vUv;
    uniform sampler2D uTexture;
    uniform int uPalette;
    out vec4 fragColor;
    void main () {
      vec4 c = texture(uTexture, vUv);
      vec3 col = c.rgb;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      if (uPalette == 1) {
        vec3 a = vec3(0.169, 0.039, 0.239);
        vec3 b = mix(vec3(0.486, 0.361, 1.0), vec3(1.0, 0.302, 0.651), lum);
        col = mix(a, b, lum);
      } else if (uPalette == 2) {
        vec3 a = vec3(0.0, 0.231, 0.212);
        vec3 b = mix(vec3(0.0, 0.702, 0.624), vec3(1.0, 0.824, 0.302), lum);
        col = mix(a, b, lum);
      } else if (uPalette == 3) {
        col = vec3(lum);
      }
      fragColor = vec4(col, 1.0);
    }
  `;

  // ---------------------------------------------------------------------
  // GL helpers
  // ---------------------------------------------------------------------

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile error: ' + info);
    }
    return shader;
  }

  class Program {
    constructor(gl, vertSrc, fragSrc) {
      this.gl = gl;
      const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
      }
      this.program = program;
      this.uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        this.uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
    }
    bind() { this.gl.useProgram(this.program); }
    set1i(name, v) { if (this.uniforms[name]) this.gl.uniform1i(this.uniforms[name], v); }
    set1f(name, v) { if (this.uniforms[name]) this.gl.uniform1f(this.uniforms[name], v); }
    set2f(name, a, b) { if (this.uniforms[name]) this.gl.uniform2f(this.uniforms[name], a, b); }
    set3f(name, a, b, c) { if (this.uniforms[name]) this.gl.uniform3f(this.uniforms[name], a, b, c); }
  }

  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  class FluidSim {
    constructor(canvas) {
      this.canvas = canvas;
      this.supported = false;

      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
      if (!gl) return;

      const halfFloat = gl.getExtension('EXT_color_buffer_half_float');
      const floatBuf = gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('OES_texture_float_linear');
      if (!halfFloat && !floatBuf) return; // no renderable float targets — bail, caller shows fallback

      this.gl = gl;
      this.type = halfFloat ? gl.HALF_FLOAT : gl.FLOAT;
      this.internalFormatRGBA = gl.RGBA16F;
      this.internalFormatR = gl.R16F;
      this.supported = true;

      this.simRes = 128;
      this.dyeRes = 512;

      this.params = {
        curl: 22,
        velocityDissipation: 0.25,
        dyeDissipation: 1.1,
        cohesion: 0.0025,
        pressureIterations: 18,
        splatRadius: 0.22,
      };

      this._quad(gl);
      this._compilePrograms(gl);
      this._allocTargets(gl);

      this._lastAmbient = 0;
      this._ambientPhase = Math.random() * 1000;
    }

    _quad(gl) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      const elem = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elem);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      this._quadBuffer = buffer;
      this._quadElem = elem;
    }

    _blit(destFBO) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, destFBO);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    _compilePrograms(gl) {
      this.copyProgram = new Program(gl, VERT, COPY_FRAG);
      this.clearProgram = new Program(gl, VERT, CLEAR_FRAG);
      this.splatProgram = new Program(gl, VERT, SPLAT_FRAG);
      this.advectionProgram = new Program(gl, VERT, ADVECTION_FRAG);
      this.divergenceProgram = new Program(gl, VERT, DIVERGENCE_FRAG);
      this.curlProgram = new Program(gl, VERT, CURL_FRAG);
      this.vorticityProgram = new Program(gl, VERT, VORTICITY_FRAG);
      this.pressureProgram = new Program(gl, VERT, PRESSURE_FRAG);
      this.gradientSubtractProgram = new Program(gl, VERT, GRADIENT_SUBTRACT_FRAG);
      this.sourceMixProgram = new Program(gl, VERT, SOURCE_MIX_FRAG);
      this.displayProgram = new Program(gl, VERT, DISPLAY_FRAG);
    }

    _createFBO(gl, w, h, internalFormat, format, type, filter) {
      gl.activeTexture(gl.TEXTURE0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return {
        texture, fbo, width: w, height: h,
        texelSizeX: 1 / w, texelSizeY: 1 / h,
        attach(id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        },
      };
    }

    _createDoubleFBO(gl, w, h, internalFormat, format, type, filter) {
      let fbo1 = this._createFBO(gl, w, h, internalFormat, format, type, filter);
      let fbo2 = this._createFBO(gl, w, h, internalFormat, format, type, filter);
      return {
        width: w, height: h,
        texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
        get read() { return fbo1; },
        set read(v) { fbo1 = v; },
        get write() { return fbo2; },
        set write(v) { fbo2 = v; },
        swap() { const tmp = fbo1; fbo1 = fbo2; fbo2 = tmp; },
      };
    }

    _allocTargets(gl) {
      const s = this.simRes;
      const d = this.dyeRes;
      const aspect = this.canvas.clientWidth && this.canvas.clientHeight
        ? this.canvas.clientWidth / this.canvas.clientHeight
        : 1;
      const simW = aspect >= 1 ? s : Math.round(s * aspect);
      const simH = aspect >= 1 ? Math.round(s / aspect) : s;
      const dyeW = aspect >= 1 ? d : Math.round(d * aspect);
      const dyeH = aspect >= 1 ? Math.round(d / aspect) : d;

      this.velocity = this._createDoubleFBO(gl, simW, simH, this.internalFormatRGBA, gl.RGBA, this.type, gl.LINEAR);
      this.pressure = this._createDoubleFBO(gl, simW, simH, this.internalFormatR, gl.RED, this.type, gl.NEAREST);
      this.divergenceFBO = this._createFBO(gl, simW, simH, this.internalFormatR, gl.RED, this.type, gl.NEAREST);
      this.curlFBO = this._createFBO(gl, simW, simH, this.internalFormatR, gl.RED, this.type, gl.NEAREST);
      this.dye = this._createDoubleFBO(gl, dyeW, dyeH, this.internalFormatRGBA, gl.RGBA, this.type, gl.LINEAR);
      this.sourceFBO = this._createFBO(gl, dyeW, dyeH, this.internalFormatRGBA, gl.RGBA, this.type, gl.LINEAR);

      this.aspect = aspect;
    }

    resize() {
      const gl = this.gl;
      const canvas = this.canvas;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      this._allocTargets(gl);
      if (this._sourceImageEl) this.setSourceImage(this._sourceImageEl);
    }

    /** Upload a <canvas>/<img>/<video> as the dye source, seeding the dye field. */
    setSourceImage(el) {
      const gl = this.gl;
      this._sourceImageEl = el;
      gl.bindTexture(gl.TEXTURE_2D, this.sourceFBO.texture);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormatRGBA, gl.RGBA, this.type === gl.FLOAT ? gl.FLOAT : gl.HALF_FLOAT, el);
      } catch (e) {
        // Some browsers reject direct HALF_FLOAT uploads from canvas elements;
        // fall back to drawing into the FBO with the copy program instead.
        this._uploadViaFramebuffer(el);
        return;
      }
      this._copyInto(this.sourceFBO, this.dye.read);
      this._copyInto(this.sourceFBO, this.dye.write);
    }

    _uploadViaFramebuffer(el) {
      const gl = this.gl;
      const tmp = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tmp);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);

      gl.viewport(0, 0, this.sourceFBO.width, this.sourceFBO.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sourceFBO.fbo);
      this.copyProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tmp);
      this.copyProgram.set1i('uTexture', 0);
      this._blit(this.sourceFBO.fbo);
      gl.deleteTexture(tmp);

      this._copyInto(this.sourceFBO, this.dye.read);
      this._copyInto(this.sourceFBO, this.dye.write);
    }

    _copyInto(srcFbo, dstFbo) {
      const gl = this.gl;
      gl.viewport(0, 0, dstFbo.width, dstFbo.height);
      this.copyProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcFbo.texture);
      this.copyProgram.set1i('uTexture', 0);
      this._blit(dstFbo.fbo);
    }

    setParams(p) {
      Object.assign(this.params, p);
    }

    /** x,y in [0,1] canvas space (y-down); dx,dy are pointer velocity for this frame. */
    splat(x, y, dx, dy, colorScale) {
      const gl = this.gl;
      colorScale = colorScale || 1;

      gl.viewport(0, 0, this.velocity.width, this.velocity.height);
      this.splatProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      this.splatProgram.set1i('uTarget', 0);
      this.splatProgram.set1f('aspectRatio', this.aspect);
      this.splatProgram.set2f('point', x, 1 - y);
      this.splatProgram.set3f('color', dx * colorScale, -dy * colorScale, 0);
      this.splatProgram.set1f('radius', this.params.splatRadius / 100 * 3.0 + 0.0025);
      this._blit(this.velocity.write.fbo);
      this.velocity.swap();

      gl.viewport(0, 0, this.dye.width, this.dye.height);
      gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
      this.splatProgram.set1i('uTarget', 0);
      const speed = Math.min(1, Math.hypot(dx, dy) * 6);
      this.splatProgram.set3f('color', speed * 0.06, speed * 0.06, speed * 0.06);
      this._blit(this.dye.write.fbo);
      this.dye.swap();
    }

    /** small automatic motion so the piece stays alive between pointer moves */
    ambient(t, strength) {
      this._ambientPhase += 0.006 + strength * 0.01;
      const a = this._ambientPhase;
      const x = 0.5 + 0.34 * Math.sin(a * 0.9) * Math.cos(a * 0.31);
      const y = 0.5 + 0.34 * Math.cos(a * 0.7) * Math.sin(a * 0.23);
      const dx = Math.cos(a * 1.7) * strength;
      const dy = Math.sin(a * 1.3) * strength;
      this.splat(x, y, dx, dy, 3.0);
    }

    step(dt) {
      const gl = this.gl;
      dt = Math.min(dt, 1 / 30);
      gl.disable(gl.BLEND);

      // curl
      gl.viewport(0, 0, this.velocity.width, this.velocity.height);
      this.curlProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      this.curlProgram.set1i('uVelocity', 0);
      this.curlProgram.set2f('texelSize', this.velocity.texelSizeX, this.velocity.texelSizeY);
      this._blit(this.curlFBO.fbo);

      // vorticity confinement
      this.vorticityProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      this.vorticityProgram.set1i('uVelocity', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.curlFBO.texture);
      this.vorticityProgram.set1i('uCurl', 1);
      this.vorticityProgram.set1f('curl', this.params.curl);
      this.vorticityProgram.set1f('dt', dt);
      this.vorticityProgram.set2f('texelSize', this.velocity.texelSizeX, this.velocity.texelSizeY);
      this._blit(this.velocity.write.fbo);
      this.velocity.swap();

      // divergence
      this.divergenceProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      this.divergenceProgram.set1i('uVelocity', 0);
      this.divergenceProgram.set2f('texelSize', this.velocity.texelSizeX, this.velocity.texelSizeY);
      this._blit(this.divergenceFBO.fbo);

      // clear pressure partially (helps stability, cheap relaxation)
      this.clearProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
      this.clearProgram.set1i('uTexture', 0);
      this.clearProgram.set1f('value', 0.8);
      this._blit(this.pressure.write.fbo);
      this.pressure.swap();

      // pressure jacobi iterations
      this.pressureProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.divergenceFBO.texture);
      this.pressureProgram.set1i('uDivergence', 0);
      this.pressureProgram.set2f('texelSize', this.velocity.texelSizeX, this.velocity.texelSizeY);
      for (let i = 0; i < this.params.pressureIterations; i++) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
        this.pressureProgram.set1i('uPressure', 1);
        this._blit(this.pressure.write.fbo);
        this.pressure.swap();
      }

      // subtract pressure gradient
      this.gradientSubtractProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
      this.gradientSubtractProgram.set1i('uPressure', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      this.gradientSubtractProgram.set1i('uVelocity', 1);
      this.gradientSubtractProgram.set2f('texelSize', this.velocity.texelSizeX, this.velocity.texelSizeY);
      this._blit(this.velocity.write.fbo);
      this.velocity.swap();

      // advect velocity
      gl.viewport(0, 0, this.velocity.width, this.velocity.height);
      this.advectionProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      this.advectionProgram.set1i('uVelocity', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      this.advectionProgram.set1i('uSource', 1);
      this.advectionProgram.set2f('texelSize', this.velocity.texelSizeX, this.velocity.texelSizeY);
      this.advectionProgram.set1f('dt', dt);
      this.advectionProgram.set1f('dissipation', this.params.velocityDissipation);
      this._blit(this.velocity.write.fbo);
      this.velocity.swap();

      // advect dye
      gl.viewport(0, 0, this.dye.width, this.dye.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      this.advectionProgram.set1i('uVelocity', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
      this.advectionProgram.set1i('uSource', 1);
      this.advectionProgram.set2f('texelSize', this.velocity.texelSizeX, this.velocity.texelSizeY);
      this.advectionProgram.set1f('dissipation', this.params.dyeDissipation);
      this._blit(this.dye.write.fbo);
      this.dye.swap();

      // pull a small fraction back toward the original source so the
      // subject stays legible instead of dissolving into noise ("cohesion")
      if (this.params.cohesion > 0) {
        gl.viewport(0, 0, this.dye.width, this.dye.height);
        this.sourceMixProgram.bind();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
        this.sourceMixProgram.set1i('uDye', 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceFBO.texture);
        this.sourceMixProgram.set1i('uSource', 1);
        this.sourceMixProgram.set1f('amount', clamp01(this.params.cohesion));
        this._blit(this.dye.write.fbo);
        this.dye.swap();
      }
    }

    render(paletteMode) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.displayProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
      this.displayProgram.set1i('uTexture', 0);
      this.displayProgram.set1i('uPalette', paletteMode || 0);
      this._blit(null);
    }

    /** Read back the current dye field as RGBA8 pixels at (outW x outH), for ASCII mode. */
    readDyePixels(outW, outH) {
      const gl = this.gl;
      if (!this._readFBO || this._readFBO.width !== outW || this._readFBO.height !== outH) {
        if (this._readFBO) gl.deleteTexture(this._readFBO.texture), gl.deleteFramebuffer(this._readFBO.fbo);
        this._readFBO = this._createFBO(gl, outW, outH, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      }
      gl.viewport(0, 0, outW, outH);
      this.copyProgram.bind();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
      this.copyProgram.set1i('uTexture', 0);
      this._blit(this._readFBO.fbo);

      const pixels = new Uint8Array(outW * outH * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._readFBO.fbo);
      gl.readPixels(0, 0, outW, outH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    }
  }

  global.FluidSim = FluidSim;
})(window);
