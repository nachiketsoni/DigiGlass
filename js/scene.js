/* DigiGlass | WebGL scenes
   Hero:  the DigiGlass shield, cast in gold, suspended inside a refractive glass
          crystal, in front of a pixel wall that reacts to the cursor.
   Model: one obsidian-and-gold form per step of the operating model.
   Loaded with a dynamic import so the page also works when opened from file://. */
(async () => {
  const root = document.documentElement;
  const heroCv = document.getElementById('heroGL');
  const modelCv = document.getElementById('modelGL');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let THREE;
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL unavailable');
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js');
  } catch (err) {
    root.classList.add('no-gl');
    console.warn('[DigiGlass] 3D disabled:', err.message);
    return;
  }

  /* ---------- shared helpers ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  // Studio lighting baked into an environment map: warm softboxes give the gold its colour.
  function studioEnv(renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x05070d);
    const dome = new THREE.SphereGeometry(20, 32, 16);
    const top = new THREE.Color(0xb08a55).multiplyScalar(0.8), mid = new THREE.Color(0x222c44), bot = new THREE.Color(0x06080e);
    const col = [], dp = dome.attributes.position, c = new THREE.Color();
    for (let i = 0; i < dp.count; i++) {
      const t = dp.getY(i) / 20;
      c.copy(mid).lerp(t > 0 ? top : bot, Math.abs(t));
      col.push(c.r, c.g, c.b);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    s.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
    const box = (w, h, color, k, pos) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })
      );
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      s.add(m);
    };
    box(10, 3, 0xfff1d6, 4.5, [0, 7, 3]);
    box(3, 10, 0xffffff, 3.0, [-7, 0, 2]);
    box(3, 8, 0xf0c27b, 3.6, [7, 1, -1]);
    box(12, 2, 0x3a4a70, 1.4, [0, -6, -2]);
    box(4, 4, 0xffd9a0, 2.4, [3, 3, -7]);
    box(3, 3, 0xffffff, 2.0, [-3, -2, 7]);
    const tex = pm.fromScene(s, 0.035).texture;
    pm.dispose();
    return tex;
  }

  // The DigiGlass monogram as extrudable shapes (same geometry as the SVG sprite).
  function monogram() {
    const S = 1 / 100, ox = 200, oy = 227;
    const p = (x, y) => [(x - ox) * S, -(y - oy) * S];
    const shape = (cmds) => {
      const sh = new THREE.Shape();
      cmds.forEach(([op, ...a]) => {
        if (op === 'M') sh.moveTo(...p(a[0], a[1]));
        else if (op === 'L') sh.lineTo(...p(a[0], a[1]));
        else sh.bezierCurveTo(...p(a[0], a[1]), ...p(a[2], a[3]), ...p(a[4], a[5]));
      });
      sh.closePath();
      return sh;
    };
    const parts = [
      shape([['M', 0, 0], ['L', 400, 0], ['L', 400, 32], ['L', 0, 32]]),
      shape([['M', 187, 160], ['L', 187, 41], ['L', 0, 41], ['L', 0, 258], ['C', 0, 340, 100, 420, 187, 454], ['L', 187, 270], ['L', 172, 270], ['L', 172, 410], ['C', 100, 385, 18, 330, 18, 250], ['L', 18, 73], ['L', 172, 73], ['L', 172, 160]]),
      shape([['M', 210, 41], ['L', 400, 41], ['L', 400, 93], ['L', 370, 93], ['L', 370, 73], ['L', 242, 73], ['L', 242, 160], ['L', 210, 160]]),
      shape([['M', 210, 270], ['L', 242, 270], ['L', 242, 400], ['C', 320, 368, 370, 310, 370, 218], ['L', 314, 218], ['L', 314, 191], ['L', 400, 191], ['L', 400, 258], ['C', 400, 360, 300, 425, 210, 454]]),
    ];
    const [rx, ry] = p(202, 215);
    const ring = new THREE.Shape();
    ring.absarc(rx, ry, 0.77, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(rx, ry, 0.5, 0, Math.PI * 2, true);
    ring.holes.push(hole);
    return { parts, ring };
  }

  // Average normals across vertices that share a position (sphere seams and poles).
  function smoothNormals(geo) {
    geo.computeVertexNormals();
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const map = new Map();
    const key = (i) => `${Math.round(pos.getX(i) * 1e4)}|${Math.round(pos.getY(i) * 1e4)}|${Math.round(pos.getZ(i) * 1e4)}`;
    for (let i = 0; i < pos.count; i++) {
      const k = key(i);
      const acc = map.get(k) || [0, 0, 0];
      acc[0] += nor.getX(i); acc[1] += nor.getY(i); acc[2] += nor.getZ(i);
      map.set(k, acc);
    }
    for (let i = 0; i < pos.count; i++) {
      const a = map.get(key(i));
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
    }
    nor.needsUpdate = true;
  }

  function glowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function runWhenVisible(el, frame) {
    let visible = false, raf = 0, last = performance.now();
    const loop = (t) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      frame(dt, t / 1000);
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(el);
    document.addEventListener('visibilitychange', start);
  }

  const pointer = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  }, { passive: true });

  /* =========================================================
     HERO
     ========================================================= */
  function initHero(canvas) {
    const small = innerWidth < 800;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const BG = new THREE.Color(0x0a0f1c);
    scene.background = BG;
    scene.environment = studioEnv(renderer);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 14);

    /* pixel wall (the CPX mosaic, rebuilt in 3D so the glass can refract it) */
    const WALL_Z = -6, CELL = 0.56, COLS = 52, ROWS = 30, N = COLS * ROWS;
    const wall = new THREE.InstancedMesh(
      new THREE.BoxGeometry(CELL * 0.93, CELL * 0.93, 0.14),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      N
    );
    wall.position.z = WALL_Z;
    scene.add(wall);
    const cells = [];
    const dummy = new THREE.Object3D();
    const cWarm = new THREE.Color(0xc9a063), cHot = new THREE.Color(0xf2d59c), cCool = new THREE.Color(0x2c3b60), tmp = new THREE.Color();
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        cells.push({ x: (i - (COLS - 1) / 2) * CELL, y: (j - (ROWS - 1) / 2) * CELL, base: 0, warm: true, ph: Math.random() * 6.28, sp: 0.5 + Math.random() * 1.2, n: Math.random(), glow: 0 });
      }
    }
    let halfW = 10, halfH = 5.4;
    const layoutWall = () => {
      const dist = camera.position.z - WALL_Z;
      halfH = Math.tan((camera.fov * Math.PI) / 360) * dist;
      halfW = halfH * camera.aspect;
      const narrow = camera.aspect < 1;
      cells.forEach((c) => {
        const u = (c.x / halfW + 1) / 2, v = (c.y / halfH + 1) / 2;
        const l = Math.max(0, 1 - u / (narrow ? 0.45 : 0.32));
        const r = Math.max(0, 1 - (1 - u) / (narrow ? 0.4 : 0.26));
        const b = Math.max(0, 1 - v / 0.25) * 0.5;
        c.warm = l >= r;
        c.base = Math.pow(Math.max(l, r, b), 1.35) * (0.45 + c.n * 0.55);
      });
    };

    /* backdrop glow */
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({ map: glowTexture('#6e5433', '#000000'), depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })
    );
    glow.renderOrder = 1;
    glow.position.z = -3.2;

    /* hero group */
    const hero = new THREE.Group();
    hero.add(glow);
    scene.add(hero);

    // glass crystal
    const seg = small ? [120, 90] : [180, 130];
    const sphere = new THREE.SphereGeometry(2.55, seg[0], seg[1]);
    const pa = sphere.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const n = 0.11 * Math.sin(1.9 * x + 0.6) * Math.sin(2.2 * y + 1.1) * Math.sin(1.7 * z + 2.3)
              + 0.055 * Math.sin(3.6 * x + 2.1 * y + 0.4) * Math.cos(3.1 * z + 1.2)
              + 0.025 * Math.sin(6.3 * y + 1.7 * z + 0.9);
      pa.setXYZ(i, x * (1 + n), y * (1 + n), z * (1 + n));
    }
    smoothNormals(sphere);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.05,
      transmission: 1, thickness: 1.1, ior: 1.3, dispersion: 3,
      attenuationColor: new THREE.Color(0xfff1d8), attenuationDistance: 9,
      clearcoat: 1, clearcoatRoughness: 0.06,
      specularIntensity: 1, envMapIntensity: 1.25,
      iridescence: 0.25, iridescenceIOR: 1.3,
    });
    const crystal = new THREE.Mesh(sphere, glassMat);
    hero.add(crystal);

    // gold monogram inside
    const { parts, ring } = monogram();
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xdcb272, metalness: 1, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.15, envMapIntensity: 1.5 });
    const goldLight = new THREE.MeshPhysicalMaterial({ color: 0xf1d096, metalness: 1, roughness: 0.16, clearcoat: 0.6, envMapIntensity: 1.6 });
    const bevel = { bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.022, bevelSegments: 3, curveSegments: 40 };
    const logo = new THREE.Group();
    parts.forEach((sh) => {
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.32, ...bevel });
      g.translate(0, 0, -0.16);
      logo.add(new THREE.Mesh(g, gold));
    });
    const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.44, ...bevel });
    rg.translate(0, 0, -0.22);
    logo.add(new THREE.Mesh(rg, goldLight));
    logo.scale.setScalar(0.74);
    hero.add(logo);

    // orbiting data pixels
    const cubes = [];
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const cubeGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transmission: 1, thickness: 0.5, ior: 1.5, clearcoat: 1, envMapIntensity: 1.3 });
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(cubeGeo, k % 2 ? gold : cubeGlass);
      const s = 0.14 + Math.random() * 0.2;
      m.scale.setScalar(s);
      m.userData = { r: 3.2 + Math.random() * 1.3, a: (k / 7) * Math.PI * 2, sp: 0.12 + Math.random() * 0.14, tilt: (Math.random() - 0.5) * 1.1, bob: Math.random() * 6 };
      cubes.push(m);
      hero.add(m);
    }

    // gold dust
    const DUST = small ? 220 : 420;
    const dp = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      const r = 3.4 + Math.random() * 5, t = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      dp[i * 3] = r * Math.sin(ph) * Math.cos(t);
      dp[i * 3 + 1] = r * Math.cos(ph) * 0.7;
      dp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(t) * 0.6;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xf2d59c, size: 0.035, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    hero.add(dust);

    const key = new THREE.PointLight(0xffe2b0, 40, 40, 1.6);
    key.position.set(4, 5, 8);
    scene.add(key);
    const inner = new THREE.PointLight(0xffd9a0, 14, 6, 1.4);
    inner.position.set(-0.6, 0.8, 1.6);
    hero.add(inner);

    /* layout */
    const place = { x: 0, y: 0, s: 1 };
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      layoutWall();
      const halfH0 = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      if (camera.aspect < 0.8) {
        const cy = Math.min(250, h * 0.27);
        Object.assign(place, { x: 0, y: ((h / 2 - cy) / (h / 2)) * halfH0, s: Math.min(0.62, (halfH0 * camera.aspect * 0.9) / 2.7) });
      }
      else if (camera.aspect < 1.25) Object.assign(place, { x: 0.4, y: 0.9, s: 0.82 });
      else Object.assign(place, { x: -0.15, y: 0.45, s: 0.86 });
    };
    new ResizeObserver(resize).observe(canvas);
    resize();

    /* intro */
    let intro = 0, introOn = !!window.__dgReady;
    document.addEventListener('dg:ready', () => (introOn = true));

    const mouse = { x: 0, y: 0 };
    const mw = new THREE.Vector2();
    const frame = (dt, t) => {
      if (introOn) intro = Math.min(1, intro + dt / 2.2);
      const e = 1 - Math.pow(1 - intro, 4);
      const scroll = clamp(scrollY / innerHeight, 0, 1.2);

      mouse.x = damp(mouse.x, pointer.x, 3, dt);
      mouse.y = damp(mouse.y, pointer.y, 3, dt);

      hero.position.set(place.x + mouse.x * 0.25, place.y + mouse.y * 0.15 + scroll * 2.2 + (1 - e) * -1.2, 0);
      hero.scale.setScalar(place.s * (0.55 + 0.45 * e) * (1 - scroll * 0.18));

      const spin = reduce ? 0 : 1;
      crystal.rotation.y += dt * 0.13 * spin;
      crystal.rotation.x = Math.sin(t * 0.3) * 0.18 * spin;
      logo.rotation.y = (Math.sin(t * 0.45) * 0.38 + mouse.x * 0.55) * spin + (1 - e) * -2.4;
      logo.rotation.x = -mouse.y * 0.32 * spin;
      logo.position.y = Math.sin(t * 0.8) * 0.07 * spin;
      dust.rotation.y = t * 0.02 * spin;

      cubes.forEach((m) => {
        const u = m.userData;
        const a = u.a + t * u.sp * spin;
        m.position.set(Math.cos(a) * u.r, Math.sin(a) * u.r * 0.35 + u.tilt + Math.sin(t + u.bob) * 0.12, Math.sin(a) * u.r * 0.6);
        m.rotation.x = t * 0.5 + u.bob;
        m.rotation.y = t * 0.7;
      });

      // wall: twinkle + cursor glow
      mw.set(pointer.x * halfW, pointer.y * halfH);
      for (let i = 0; i < N; i++) {
        const c = cells[i];
        const dx = c.x - mw.x, dy = c.y - mw.y;
        const target = finePointerActive ? Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 1.7) : 0;
        c.glow = damp(c.glow, target, target > c.glow ? 10 : 2.2, dt);
        const tw = reduce ? 0.8 : 0.62 + 0.38 * Math.sin(t * c.sp + c.ph);
        const k = clamp(c.base * tw * e + c.glow * 0.55, 0, 1);
        tmp.copy(BG).lerp(c.warm ? cWarm : cCool, k);
        if (c.glow > 0.5) tmp.lerp(cHot, (c.glow - 0.5) * 0.6);
        wall.setColorAt(i, tmp);
        dummy.position.set(c.x, c.y, c.glow * 0.7);
        dummy.updateMatrix();
        wall.setMatrixAt(i, dummy.matrix);
      }
      wall.instanceColor.needsUpdate = true;
      wall.instanceMatrix.needsUpdate = true;

      camera.position.x = damp(camera.position.x, mouse.x * 0.35, 2, dt);
      camera.position.y = damp(camera.position.y, mouse.y * 0.2, 2, dt);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    let finePointerActive = false;
    addEventListener('pointermove', (e) => { finePointerActive = e.pointerType === 'mouse'; }, { passive: true });
    frame(0, 0); // allocate instanceColor before the first visible frame
    runWhenVisible(canvas, frame);
  }

  /* =========================================================
     OPERATING MODEL
     ========================================================= */
  function initModel(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.environment = studioEnv(renderer);
    scene.add(new THREE.HemisphereLight(0xffe6c0, 0x0a0f1c, 0.9));
    const rim = new THREE.DirectionalLight(0xffd79a, 2.2);
    rim.position.set(3, 4, 2);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.6, 10);
    camera.lookAt(0, 0, 0);

    const body = new THREE.MeshPhysicalMaterial({ color: 0x141b2b, metalness: 0.55, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.1, flatShading: true, envMapIntensity: 1.15 });
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xdcb272, metalness: 1, roughness: 0.2, flatShading: true, envMapIntensity: 1.5 });
    const edge = new THREE.LineBasicMaterial({ color: 0xe9c88a, transparent: true, opacity: 0.85 });
    const mk = (geo, mat = body, thr = 20) => {
      const m = new THREE.Mesh(geo, mat);
      if (mat === body) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, thr), edge));
      return m;
    };

    const forms = [];
    // 01 Integrate: four blocks that close into one
    {
      const g = new THREE.Group();
      const geo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
      const blocks = [];
      for (let i = 0; i < 4; i++) { const b = mk(geo, i === 3 ? gold : body); blocks.push(b); g.add(b); }
      g.userData.tick = (t) => {
        const k = 0.5 + 0.5 * Math.sin(t * 1.1);
        const gap = 0.04 + Math.pow(k, 2) * 0.75;
        const o = 0.575 + gap / 2;
        [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], i) => blocks[i].position.set(sx * o, sy * o, (i % 2 ? 1 : -1) * gap * 0.4));
      };
      forms.push(g);
    }
    // 02 Tune: a gyroscope of rings that settle into alignment
    {
      const g = new THREE.Group();
      const rings = [1.75, 1.35, 0.95].map((r, i) => {
        const m = mk(new THREE.TorusGeometry(r, 0.11, 6, 44), body, 25);
        m.userData.axis = i;
        g.add(m);
        return m;
      });
      g.add(mk(new THREE.IcosahedronGeometry(0.42, 0), gold));
      g.userData.tick = (t) => {
        const settle = Math.pow(0.5 + 0.5 * Math.cos(t * 0.7), 3);
        rings[0].rotation.set(settle * 1.2, t * 0.4, 0);
        rings[1].rotation.set(t * 0.5, settle * 1.4, 0);
        rings[2].rotation.set(settle * 0.9 + t * 0.2, 0, t * 0.6);
      };
      forms.push(g);
    }
    // 03 Investigate & Respond: a faceted lens with a scanning ring
    {
      const g = new THREE.Group();
      const geo = new THREE.OctahedronGeometry(1.45, 0);
      geo.scale(1, 1.4, 1);
      g.add(mk(geo));
      g.add(mk(new THREE.IcosahedronGeometry(0.34, 0), gold));
      const scan = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 8, 64), gold);
      scan.rotation.x = Math.PI / 2;
      g.add(scan);
      g.userData.tick = (t) => {
        const y = Math.sin(t * 1.2) * 1.6;
        scan.position.y = y;
        const r = (1.45 * (1 - Math.abs(y) / 2.03)) / 1.2 + 0.12;
        scan.scale.setScalar(Math.max(0.12, r));
      };
      forms.push(g);
    }
    // 04 Improve: stepped bars rising
    {
      const g = new THREE.Group();
      const base = mk(new THREE.BoxGeometry(3.6, 0.16, 1.4));
      base.position.y = -1.3;
      g.add(base);
      const bars = [0.8, 1.35, 1.95, 2.7].map((h, i) => {
        const m = mk(new THREE.BoxGeometry(0.62, 1, 0.62), i === 3 ? gold : body);
        m.position.x = -1.2 + i * 0.8;
        m.userData.h = h;
        g.add(m);
        return m;
      });
      g.rotation.y = -0.5;
      g.userData.tick = (t) => {
        bars.forEach((b, i) => {
          const grow = 0.75 + 0.25 * Math.sin(t * 1.3 - i * 0.6);
          const h = b.userData.h * grow;
          b.scale.y = h;
          b.position.y = -1.22 + h / 2;
        });
      };
      forms.push(g);
    }

    const stage = new THREE.Group();
    scene.add(stage);
    forms.forEach((f, i) => { f.scale.setScalar(i === 0 ? 1 : 0.001); f.userData.v = i === 0 ? 1 : 0; stage.add(f); });

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: glowTexture('rgba(201,160,99,0.35)', 'rgba(201,160,99,0)'), transparent: true, depthWrite: false, toneMapped: false })
    );
    glow.position.z = -3;
    scene.add(glow);

    let step = +(canvas.closest('#model')?.dataset.step || 0);
    let spinBoost = 0;
    document.addEventListener('dg:step', (e) => { step = e.detail; spinBoost = 1; });

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas);
    resize();

    const mouse = { x: 0, y: 0 };
    runWhenVisible(canvas, (dt, t) => {
      mouse.x = damp(mouse.x, pointer.x, 2.5, dt);
      mouse.y = damp(mouse.y, pointer.y, 2.5, dt);
      spinBoost = damp(spinBoost, 0, 2.2, dt);
      forms.forEach((f, i) => {
        const target = i === step ? 1 : 0;
        f.userData.v = damp(f.userData.v, target, target ? 5 : 8, dt);
        const v = f.userData.v;
        f.visible = v > 0.01;
        if (!f.visible) return;
        f.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - v, 3)));
        if (!reduce) f.userData.tick(t);
      });
      stage.rotation.y += dt * (reduce ? 0 : 0.35 + spinBoost * 6);
      stage.rotation.x = damp(stage.rotation.x, -mouse.y * 0.25 + 0.12, 3, dt);
      stage.position.x = damp(stage.position.x, mouse.x * 0.2, 3, dt);
      stage.position.y = Math.sin(t * 0.9) * 0.08;
      renderer.render(scene, camera);
    });
  }

  try {
    if (heroCv) initHero(heroCv);
    if (modelCv) initModel(modelCv);
  } catch (err) {
    root.classList.add('no-gl');
    console.warn('[DigiGlass] 3D init failed:', err);
  }
})();
