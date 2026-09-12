/*
  룰렛 전사 김전사 타이틀 화면을 게임과 같은 방식으로 그립니다.

  값은 전부 KJSS 의 Scene/UI/Main screen UI.tscn 에서 옮겼습니다.
  - CanvasModulate(보라)는 shaded 레이어(구름·산·풀·슬롯머신)에만 곱합니다.
    light_mode = unshaded 인 하늘·별·유성·로고는 그대로입니다.
  - 슬롯머신 PointLight2D 는 light alpha 1.png 를 더하고, 켜짐·밝기·색은 GameMachine.cs 처럼 프레임마다 바뀝니다.
  - 인트로도 MainScreenUI.cs 순서 그대로입니다: 검정 페이드 2.6초 → 슬롯머신 1회 재생 → 로고가 28px 올라오며 등장.
    유성은 페이드가 끝나고 각자 StartDelay 뒤에 시작합니다.
  - 구름은 SKY.gdshader, 풀은 wind_sway.gdshader 를 GLSL 로 옮겼습니다.
  - WorldEnvironment 글로우는 임계값·bloom·6단계 가중치를 그대로 쓰는 블룸 패스입니다.
    사이트에서는 번짐이 없는 쪽이 낫다고 해서 꺼 두었습니다(CFG.glow.enabled).
  - 게임은 hdr_2d 라 선형 색공간 HDR 로 계산하므로 여기서도 그렇게 합니다.

  사용:  GizmoTitleScene.mount(canvas, { images: {...}, glowGain })  → 성공하면 true
  WebGL2 가 없으면 false 를 돌려주고, 페이지는 원래의 CSS 레이어를 그대로 씁니다.
*/
window.GizmoTitleScene = (() => {
  const BASE_W = 640;
  const BASE_H = 360;
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const linear = (r, g, b) => [toLinear(r), toLinear(g), toLinear(b)];

  const CFG = {
    canvasModulate: linear(0.22925657, 0.14050582, 0.4799664),
    light: { x: 321 - 51.2, y: 240 - 51.2, size: 102.4 },
    glow: { enabled: false, threshold: 1.16, hdrScale: 3.16, bloom: 0.55, intensity: 0.23, strength: 0.4, cap: 168.33,
            levels: [3.87, 2.59, 2.4, 0.85, 1.92, 0.91] },
    stars: { count: 100, life: 3.0, lifeRand: 0.5, cx: 325, cy: 175, ex: 360 * 0.92, ey: 180, hdr: 18.178162, scaleMin: 0.3 },
    windSpeed: 3.0,
    windStrength: 5.0 * 2.0,   // 풀 텍스처가 2배로 늘어나 있어 흔들림 폭도 두 배입니다
    clouds: [ { key: "cloud2", speed: 0.03 }, { key: "cloud", speed: 0.02 } ],
    sheets: { meteor: 24, meteor2: 14, machine: 17 },
    intro: { fade: 2.6, machineFps: 5 * 2, logoReveal: 1.0, logoRise: 28 },
    meteors: [
      { key: "meteor2", x: -41, y: -3, fps: 5 * 2, delay: 2.5 },
      { key: "meteor", x: -4, y: -3, fps: 5 * 2.5, delay: 2.0 },
      { key: "meteor", x: 1, y: -5, fps: 5 * 2.5, delay: 3.0 }
    ],
    // GameMachine 의 LightOnPerFrame · EnergyPerFrame · ColorPerFrame (선형 색 × 밝기)
    machineLight: (() => {
      const amber = [0.9882353, 0.69411767, 0.23137255];
      const on = [1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1];
      const energy = [1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1.1, 1.2, 1.3];
      const color = [...Array(14).fill(amber), [1, 0.7571243, 0.375], [1, 0.8421308, 0.59375], [1, 0.85882854, 0.63671875]];
      return on.map((o, i) => (o ? linear(...color[i]).map((c) => c * energy[i]) : [0, 0, 0]));
    })()
  };

  const VS_LAYER = `#version 300 es
  in vec2 a_uv;
  uniform vec4 u_rect;
  uniform float u_shearTop;
  out vec2 v_uv;
  out vec2 v_world;
  void main() {
    vec2 p = u_rect.xy + a_uv * u_rect.zw;
    p.x += u_shearTop * (1.0 - a_uv.y);
    v_uv = a_uv;
    v_world = p;
    vec2 c = p / vec2(${BASE_W}.0, ${BASE_H}.0) * 2.0 - 1.0;
    gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  }`;

  const FS_LAYER = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  in vec2 v_world;
  uniform sampler2D u_tex;
  uniform vec4 u_frame;
  uniform float u_scroll;
  uniform int u_mode;
  uniform vec2 u_texSize;
  uniform bool u_shaded;
  uniform vec3 u_modulate;
  uniform sampler2D u_lightTex;
  uniform vec4 u_lightRect;
  uniform vec3 u_lightColor;
  uniform float u_alpha;
  out vec4 o;
  bool inside(vec2 u) { return all(greaterThanEqual(u, vec2(0.0))) && all(lessThanEqual(u, vec2(1.0))); }
  void main() {
    vec2 uv = v_uv;
    vec4 col;
    if (u_mode == 1) {
      // SKY.gdshader: shifted_uv.x = fract(UV.x + TIME * scroll_speed)
      uv.x = fract(uv.x + u_scroll);
      col = texture(u_tex, u_frame.xy + uv * u_frame.zw);
    } else if (u_mode == 2) {
      // wind_sway.gdshader 의 fragment (buffer_scale 1)
      vec4 c = inside(uv) ? texture(u_tex, uv) : vec4(0.0);
      vec2 ps = 1.0 / u_texSize;
      vec2 us = uv + vec2(0.625, 0.325) * ps;
      float decalx = (us.y - ps.x * u_texSize.x) * -0.415;
      float decaly = (us.y - ps.y * u_texSize.y) * 0.755;
      us += vec2(decalx, decaly);
      vec4 shadow = inside(us) ? vec4(0.0, 0.0, 0.0, texture(u_tex, us).a * 0.5) : vec4(0.0);
      col = mix(shadow, c, c.a);
    } else if (u_mode == 3) {
      // IntroFadeOverlay: 검정 ColorRect
      col = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      col = texture(u_tex, u_frame.xy + uv * u_frame.zw);
    }
    if (u_shaded) {
      vec3 light = vec3(0.0);
      vec2 lu = (v_world - u_lightRect.xy) / u_lightRect.zw;
      if (inside(lu)) light = texture(u_lightTex, lu).rgb * u_lightColor;
      col.rgb *= (u_modulate + light);
    }
    col.a *= u_alpha;
    o = col;
  }`;

  const VS_STAR = `#version 300 es
  in vec2 a_pos;
  in vec2 a_sizeAlpha;
  uniform float u_px;
  out float v_alpha;
  void main() {
    vec2 c = a_pos / vec2(${BASE_W}.0, ${BASE_H}.0) * 2.0 - 1.0;
    gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
    float px = a_sizeAlpha.x * u_px;
    gl_PointSize = max(1.0, px);
    // 1px 보다 작은 파티클은 덮는 면적만큼 옅게
    v_alpha = a_sizeAlpha.y * min(1.0, px * px);
  }`;
  const FS_STAR = `#version 300 es
  precision highp float;
  in float v_alpha;
  uniform float u_hdr;
  out vec4 o;
  void main() { o = vec4(vec3(u_hdr), v_alpha); }`;

  const VS_QUAD = `#version 300 es
  in vec2 a_uv;
  out vec2 v_uv;
  void main() { v_uv = a_uv; gl_Position = vec4(a_uv * 2.0 - 1.0, 0.0, 1.0); }`;

  // 글로우 입력: Godot 4 와 같이 임계값 위는 smoothstep 으로, 아래는 bloom 비율만큼
  const FS_PREFILTER = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_src;
  uniform float u_threshold, u_hdrScale, u_bloom, u_cap;
  out vec4 o;
  void main() {
    vec3 c = texture(u_src, v_uv).rgb;
    float lum = max(c.r, max(c.g, c.b));
    float feedback = max(smoothstep(u_threshold, u_threshold + u_hdrScale, lum), u_bloom);
    o = vec4(min(c * feedback, vec3(u_cap)), 1.0);
  }`;
  const FS_BLUR = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_src;
  uniform vec2 u_dir;
  uniform float u_mul;
  out vec4 o;
  void main() {
    const float w0 = 0.2270270, w1 = 0.1945946, w2 = 0.1216216, w3 = 0.0540541, w4 = 0.0162162;
    vec3 s = texture(u_src, v_uv).rgb * w0;
    s += (texture(u_src, v_uv + u_dir).rgb + texture(u_src, v_uv - u_dir).rgb) * w1;
    s += (texture(u_src, v_uv + u_dir * 2.0).rgb + texture(u_src, v_uv - u_dir * 2.0).rgb) * w2;
    s += (texture(u_src, v_uv + u_dir * 3.0).rgb + texture(u_src, v_uv - u_dir * 3.0).rgb) * w3;
    s += (texture(u_src, v_uv + u_dir * 4.0).rgb + texture(u_src, v_uv - u_dir * 4.0).rgb) * w4;
    o = vec4(s * u_mul, 1.0);
  }`;
  const FS_COMPOSITE = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_scene;
  uniform sampler2D u_l0, u_l1, u_l2, u_l3, u_l4, u_l5;
  uniform float u_w[6];
  uniform float u_gain;
  out vec4 o;
  vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec3 g = texture(u_l0, v_uv).rgb * u_w[0] + texture(u_l1, v_uv).rgb * u_w[1]
           + texture(u_l2, v_uv).rgb * u_w[2] + texture(u_l3, v_uv).rgb * u_w[3]
           + texture(u_l4, v_uv).rgb * u_w[4] + texture(u_l5, v_uv).rgb * u_w[5];
    vec3 c = texture(u_scene, v_uv).rgb + g * u_gain;   // glow_blend_mode 0 = additive
    o = vec4(toSrgb(c), 1.0);
  }`;

  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 못 읽었습니다: " + src.slice(0, 60)));
    img.src = src;
  });

  function mount(canvas, options) {
    const gl = canvas && canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, alpha: false });
    if (!gl) return false;
    const floatOk = !!gl.getExtension("EXT_color_buffer_float");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gain = CFG.glow.enabled ? CFG.glow.intensity * (options.glowGain ?? 1) : 0;

    let progLayer, progStar, progPre, progBlur, progComp;
    try {
      progLayer = compile(gl, VS_LAYER, FS_LAYER);
      progStar = compile(gl, VS_STAR, FS_STAR);
      progPre = compile(gl, VS_QUAD, FS_PREFILTER);
      progBlur = compile(gl, VS_QUAD, FS_BLUR);
      progComp = compile(gl, VS_QUAD, FS_COMPOSITE);
    } catch (err) {
      console.warn("[GizmoTitleScene]", err);
      return false;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const starBuf = gl.createBuffer();
    const starData = new Float32Array(CFG.stars.count * 4);

    const textures = {};
    // 가로로 긴 스프라이트 시트(유성 15360px 등)는 GPU 최대 텍스처 크기를 넘을 수 있습니다.
    // 넘으면 업로드가 실패하고 불완전 텍스처가 불투명 검정으로 그려져 하늘을 덮으므로,
    // 프레임을 격자로 다시 배치해서 올립니다.
    const grids = {};
    const packSheet = (img, frames) => {
      const cols = Math.ceil(Math.sqrt(frames));
      const rows = Math.ceil(frames / cols);
      const fw = img.naturalWidth / frames;
      const fh = img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = fw * cols;
      c.height = fh * rows;
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      for (let i = 0; i < frames; i++)
        g.drawImage(img, i * fw, 0, fw, fh, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
      return { source: c, cols, rows };
    };
    const makeTexture = (img, smooth) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (smooth) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      }
      return { tex: t, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
    };

    let targets = null;
    let introStart = null;
    const makeTarget = (w, h) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, floatOk ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
                    floatOk ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
                            [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
        gl.texParameteri(gl.TEXTURE_2D, k, v);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fb, w, h };
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.min(1920, Math.round(rect.width * dpr)));
      const h = Math.round(w * BASE_H / BASE_W);
      if (targets && canvas.width === w) return;
      canvas.width = w;
      canvas.height = h;
      targets = { scene: makeTarget(w, h), levels: [] };
      let lw = w, lh = h;
      for (let i = 0; i < 6; i++) {
        lw = Math.max(1, lw >> 1);
        lh = Math.max(1, lh >> 1);
        targets.levels.push([makeTarget(lw, lh), makeTarget(lw, lh)]);
      }
    };

    // 별: 수명 1.5~3초, 알파 1 → 0.51(49%) → 0, 크기 0 → (0.3~1)
    const stars = Array.from({ length: CFG.stars.count }, () => ({}));
    const spawn = (s, age) => {
      s.x = CFG.stars.cx + (Math.random() * 2 - 1) * CFG.stars.ex;
      s.y = CFG.stars.cy + (Math.random() * 2 - 1) * CFG.stars.ey;
      s.life = CFG.stars.life * (1 - Math.random() * CFG.stars.lifeRand);
      s.scale = CFG.stars.scaleMin + Math.random() * (1 - CFG.stars.scaleMin);
      s.age = age;
    };
    stars.forEach((s) => spawn(s, Math.random() * CFG.stars.life));
    const ramp = (t) => (t < 0.48913044 ? 1 - (t / 0.48913044) * (1 - 0.51086956) : 0.51086956 * (1 - (t - 0.48913044) / (1 - 0.48913044)));

    const bindQuad = (prog) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      const loc = gl.getAttribLocation(prog.p, "a_uv");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    };

    const drawLayer = (key, rect, opt = {}) => {
      const t = textures[key];
      const u = progLayer.u;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform1i(u.u_tex, 0);
      gl.uniform4f(u.u_rect, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform1f(u.u_shearTop, opt.shear || 0);
      const f = opt.frame || [0, 0, 1, 1];
      gl.uniform4f(u.u_frame, f[0], f[1], f[2], f[3]);
      gl.uniform1f(u.u_scroll, opt.scroll || 0);
      gl.uniform1i(u.u_mode, opt.mode || 0);
      gl.uniform2f(u.u_texSize, t.w, t.h);
      gl.uniform1i(u.u_shaded, opt.shaded ? 1 : 0);
      gl.uniform1f(u.u_alpha, opt.alpha ?? 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const sheet = (key, i) => {
      const g = grids[key];
      return [(i % g.cols) / g.cols, Math.floor(i / g.cols) / g.rows, 1 / g.cols, 1 / g.rows];
    };

    const render = (time) => {
      resize();
      const t = time / 1000;
      const { scene, levels } = targets;
      // 인트로는 처음 화면에 보인 순간부터 셉니다. 동작 줄이기 설정이면 끝난 상태로 바로 그립니다.
      if (introStart === null) introStart = time;
      const it = reduce ? 1e3 : (time - introStart) / 1000;
      const I = CFG.intro;
      const machineFrame = Math.min(CFG.sheets.machine - 1, Math.max(0, Math.floor((it - I.fade) * I.machineFps)));
      const logoT = Math.min(1, Math.max(0, (it - I.fade - CFG.sheets.machine / I.machineFps) / I.logoReveal));
      const logoAlpha = Math.sin(logoT * Math.PI * 0.5);
      const fadeT = Math.min(1, it / I.fade);
      const fadeAlpha = 1 - fadeT * fadeT * (3 - 2 * fadeT);

      // 1) 장면을 HDR 버퍼에
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
      gl.viewport(0, 0, scene.w, scene.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(progLayer.p);
      bindQuad(progLayer);
      const u = progLayer.u;
      gl.uniform3fv(u.u_modulate, CFG.canvasModulate);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures.light.tex);
      gl.uniform1i(u.u_lightTex, 1);
      gl.uniform4f(u.u_lightRect, CFG.light.x, CFG.light.y, CFG.light.size, CFG.light.size);
      gl.uniform3fv(u.u_lightColor, CFG.machineLight[machineFrame]);

      drawLayer("sky", [0, 0, 640, 360]);

      // 별 (unshaded, 하늘 위·구름 아래)
      gl.useProgram(progStar.p);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const life = s.age / s.life;
        const k = i * 4;
        starData[k] = s.x;
        starData[k + 1] = s.y;
        starData[k + 2] = life * s.scale;
        starData[k + 3] = ramp(life);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
      gl.bufferData(gl.ARRAY_BUFFER, starData, gl.DYNAMIC_DRAW);
      const aPos = gl.getAttribLocation(progStar.p, "a_pos");
      const aSa = gl.getAttribLocation(progStar.p, "a_sizeAlpha");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aSa);
      gl.vertexAttribPointer(aSa, 2, gl.FLOAT, false, 16, 8);
      gl.uniform1f(progStar.u.u_px, scene.w / BASE_W);
      gl.uniform1f(progStar.u.u_hdr, CFG.stars.hdr);
      gl.drawArrays(gl.POINTS, 0, stars.length);
      gl.disableVertexAttribArray(aSa);

      gl.useProgram(progLayer.p);
      bindQuad(progLayer);
      for (const m of CFG.meteors) {
        // 시작 전에는 Stop() 상태라 0번 프레임(빈 하늘)에 머뭅니다
        const e = it - I.fade - m.delay;
        const f = e < 0 ? 0 : Math.floor(e * m.fps) % CFG.sheets[m.key];
        drawLayer(m.key, [m.x, m.y, 640, 360], { frame: sheet(m.key, f) });
      }
      for (const c of CFG.clouds)
        drawLayer(c.key, [0, 104, 660, 180], { mode: 1, scroll: (t * c.speed) % 1, shaded: true });
      drawLayer("mountain2", [0, 27, 640, 360], { shaded: true });
      drawLayer("mountain", [0, 20, 640, 360], { shaded: true });
      drawLayer("grass3", [0, -19, 640, 360], { shaded: true });
      drawLayer("machine", [280, 202, 80, 112], { frame: sheet("machine", machineFrame), shaded: true });
      drawLayer("grass", [0, 0, 640, 360], {
        mode: 2, shaded: true, shear: Math.sin(t * CFG.windSpeed) * CFG.windStrength
      });
      if (logoAlpha > 0)
        drawLayer("logo", [180, 24 + I.logoRise * (1 - logoT), 280, 140], { alpha: logoAlpha });
      if (fadeAlpha > 0)
        drawLayer("sky", [0, 0, 640, 360], { mode: 3, alpha: fadeAlpha });
      gl.disable(gl.BLEND);

      // 2) 글로우: 입력 추출 → 6단계 축소·흐림
      let src = scene;
      for (let i = 0; gain > 0 && i < 6; i++) {
        const [a, b] = levels[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
        gl.viewport(0, 0, a.w, a.h);
        if (i === 0) {
          gl.useProgram(progPre.p);
          bindQuad(progPre);
          gl.uniform1f(progPre.u.u_threshold, CFG.glow.threshold);
          gl.uniform1f(progPre.u.u_hdrScale, CFG.glow.hdrScale);
          gl.uniform1f(progPre.u.u_bloom, CFG.glow.bloom);
          gl.uniform1f(progPre.u.u_cap, CFG.glow.cap);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, src.tex);
          gl.uniform1i(progPre.u.u_src, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else {
          gl.useProgram(progBlur.p);
          bindQuad(progBlur);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, src.tex);
          gl.uniform1i(progBlur.u.u_src, 0);
          gl.uniform2f(progBlur.u.u_dir, 0, 0);
          gl.uniform1f(progBlur.u.u_mul, 1);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.useProgram(progBlur.p);
        bindQuad(progBlur);
        gl.uniform1i(progBlur.u.u_src, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.uniform2f(progBlur.u.u_dir, 1 / a.w, 0);
        // Godot 는 가로 블러마다 glow_strength 를 곱하고, 다음 단계는 이 결과에서 만들므로
        // 단계 i 는 strength^(i+1) 만큼 약해집니다. 먼 단계일수록 넓게 번지지 않는 이유입니다.
        gl.uniform1f(progBlur.u.u_mul, CFG.glow.strength);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.uniform2f(progBlur.u.u_dir, 0, 1 / a.h);
        gl.uniform1f(progBlur.u.u_mul, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        src = a;
      }

      // 3) 합성 후 sRGB 로
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(progComp.p);
      bindQuad(progComp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.tex);
      gl.uniform1i(progComp.u.u_scene, 0);
      for (let i = 0; i < 6; i++) {
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, levels[i][0].tex);
        gl.uniform1i(progComp.u["u_l" + i], 1 + i);
      }
      gl.uniform1fv(progComp.u.u_w, CFG.glow.levels);
      gl.uniform1f(progComp.u.u_gain, gain);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const keys = Object.keys(options.images);
    Promise.all(keys.map((k) => loadImage(options.images[k]))).then((imgs) => {
      imgs.forEach((img, i) => {
        const k = keys[i];
        let src = img;
        if (CFG.sheets[k]) {
          const packed = packSheet(img, CFG.sheets[k]);
          grids[k] = packed;
          src = packed.source;
        }
        textures[k] = makeTexture(src, k === "logo");
      });
      let last = performance.now();
      let visible = true;
      if (reduce) {
        stars.forEach((s) => { s.age = s.life * 0.3; });
        render(1500);
        return;
      }
      const loop = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        for (const s of stars) {
          s.age += dt;
          if (s.age >= s.life) spawn(s, 0);
        }
        if (visible) render(now);
        requestAnimationFrame(loop);
      };
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(canvas);
      }
      requestAnimationFrame(loop);
    }).catch((err) => {
      console.warn("[GizmoTitleScene]", err);
      canvas.dispatchEvent(new CustomEvent("titlescene:failed"));
    });
    return true;
  }

  return { mount, config: CFG };
})();
