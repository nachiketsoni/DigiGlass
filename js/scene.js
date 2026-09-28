/* DigiGlass | WebGL scenes
   Hero:  cyber globe with threat network nodes, data streams,
          and the DigiGlass shield at the core inside a hexagonal energy barrier.
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
     HERO — Cyber globe with threat network, data streams,
     scanning rings, and the DigiGlass shield at its core.
     ========================================================= */
  function initHero(canvas) {
    const small = innerWidth < 800;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const BG = new THREE.Color(0x0a0f1c);
    scene.background = BG;
    scene.environment = studioEnv(renderer);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.5, 13);

    const hero = new THREE.Group();
    scene.add(hero);

    /* ---- wireframe globe ---- */
    const GR = 3.6;
    const globe = new THREE.Group();
    hero.add(globe);

    const icoWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(GR, 2)),
      new THREE.LineBasicMaterial({ color: 0x1e3a5a, transparent: true, opacity: 0.22, depthWrite: false })
    );
    globe.add(icoWire);

    for (let i = 0; i < 7; i++) {
      const lat = -0.72 + i * 0.24;
      const y = GR * lat, r = GR * Math.cos(Math.asin(clamp(lat, -0.99, 0.99)));
      const pts = [];
      for (let j = 0; j <= 96; j++) {
        const a = (j / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      globe.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: i === 3 ? 0x8a6a3a : 0x182d48, transparent: true, opacity: i === 3 ? 0.35 : 0.15, depthWrite: false })
      ));
    }

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pts = [];
      for (let j = 0; j <= 48; j++) {
        const phi = (j / 48) * Math.PI;
        pts.push(new THREE.Vector3(GR * Math.sin(phi) * Math.cos(a), GR * Math.cos(phi), GR * Math.sin(phi) * Math.sin(a)));
      }
      globe.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x182d48, transparent: true, opacity: 0.12, depthWrite: false })
      ));
    }

    /* ---- network nodes ---- */
    const NC = small ? 20 : 30;
    const nodes = [];
    const nodeGeo = new THREE.OctahedronGeometry(0.055, 0);
    const nGold = new THREE.MeshBasicMaterial({ color: 0xf2d59c, toneMapped: false });
    const goldGlowTex = glowTexture('#f2d59c', 'rgba(0,0,0,0)');
    const PHI_R = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < NC; i++) {
      const theta = Math.acos(1 - 2 * (i + 0.5) / NC);
      const phi = 2 * Math.PI * i / PHI_R;
      const pos = new THREE.Vector3(
        GR * Math.sin(theta) * Math.cos(phi),
        GR * Math.cos(theta),
        GR * Math.sin(theta) * Math.sin(phi)
      );
      const mesh = new THREE.Mesh(nodeGeo, nGold);
      mesh.position.copy(pos);
      mesh.lookAt(0, 0, 0);

      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: goldGlowTex,
        transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      sp.scale.setScalar(0.35);
      mesh.add(sp);

      nodes.push({ mesh, pos, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.8, glow: sp });
      globe.add(mesh);
    }

    /* ---- connection arcs (all nodes interconnected) ---- */
    const arcs = [];
    const edgeSet = new Set();
    const nodeDegrees = new Array(nodes.length).fill(0);
    const edgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

    const addArc = (i, j) => {
      const key = edgeKey(i, j);
      if (edgeSet.has(key)) return false;
      edgeSet.add(key);
      nodeDegrees[i]++;
      nodeDegrees[j]++;

      const d = nodes[i].pos.distanceTo(nodes[j].pos);
      const mid = new THREE.Vector3().addVectors(nodes[i].pos, nodes[j].pos).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(GR * (1.06 + d * 0.04));
      const curve = new THREE.QuadraticBezierCurve3(nodes[i].pos.clone(), mid, nodes[j].pos.clone());
      globe.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),
        new THREE.LineBasicMaterial({
          color: 0xc9a063,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      ));
      arcs.push({ curve });
      return true;
    };

    // Calculate nearest neighbors for each node sorted by distance
    const nodeNeighbors = [];
    for (let i = 0; i < nodes.length; i++) {
      const list = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i !== j) {
          list.push({ j, d: nodes[i].pos.distanceTo(nodes[j].pos) });
        }
      }
      list.sort((a, b) => a.d - b.d);
      nodeNeighbors.push(list);
    }

    // Connect every node to its 2 nearest neighbors
    for (let i = 0; i < nodes.length; i++) {
      for (let k = 0; k < 2 && k < nodeNeighbors[i].length; k++) {
        addArc(i, nodeNeighbors[i][k].j);
      }
    }

    // Connect 3rd closest neighbor if within reasonable distance to build a rich mesh
    for (let i = 0; i < nodes.length; i++) {
      if (nodeDegrees[i] < 3 && nodeNeighbors[i].length > 2) {
        const candidate = nodeNeighbors[i][2];
        if (candidate.d < GR * 1.25 && nodeDegrees[candidate.j] < 4) {
          addArc(i, candidate.j);
        }
      }
    }

    // Guaranteed connectivity pass: ensure every node has degree >= 2
    for (let i = 0; i < nodes.length; i++) {
      let idx = 0;
      while (nodeDegrees[i] < 2 && idx < nodeNeighbors[i].length) {
        addArc(i, nodeNeighbors[i][idx].j);
        idx++;
      }
    }

    /* ---- data stream particles ---- */
    const STREAMS = small ? 30 : 55;
    const stPos = new Float32Array(STREAMS * 3), stCol = new Float32Array(STREAMS * 3);
    const stGeo = new THREE.BufferGeometry();
    stGeo.setAttribute('position', new THREE.BufferAttribute(stPos, 3));
    stGeo.setAttribute('color', new THREE.BufferAttribute(stCol, 3));
    globe.add(new THREE.Points(stGeo, new THREE.PointsMaterial({
      size: 0.055, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    })));
    const stData = [];
    for (let i = 0; i < STREAMS; i++) stData.push({ arc: i % Math.max(1, arcs.length), t: Math.random(), v: 0.15 + Math.random() * 0.35 });

    /* ---- central shield ---- */
    const { parts, ring } = monogram();
    const goldMat = new THREE.MeshPhysicalMaterial({ color: 0xdcb272, metalness: 1, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.15, envMapIntensity: 1.5 });
    const goldLt = new THREE.MeshPhysicalMaterial({ color: 0xf1d096, metalness: 1, roughness: 0.16, clearcoat: 0.6, envMapIntensity: 1.6 });
    const bevel = { bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.022, bevelSegments: 3, curveSegments: 40 };
    const logo = new THREE.Group();
    parts.forEach(sh => {
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.32, ...bevel });
      g.translate(0, 0, -0.16);
      logo.add(new THREE.Mesh(g, goldMat));
    });
    const rGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.44, ...bevel });
    rGeo.translate(0, 0, -0.22);
    logo.add(new THREE.Mesh(rGeo, goldLt));
    logo.scale.setScalar(0.5);
    hero.add(logo);

    const barrierMat = new THREE.LineBasicMaterial({ color: 0xc9a063, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
    const barrier = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.65, 1), 1), barrierMat
    );
    hero.add(barrier);
    hero.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.68, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xc9a063, transparent: true, opacity: 0.03, depthWrite: false, side: THREE.BackSide })
    ));

    /* ---- background ---- */
    const bgGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ map: glowTexture('#3a2a15', '#000000'), depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })
    );
    bgGlow.position.z = -5;
    hero.add(bgGlow);

    const DUST = small ? 200 : 400;
    const dArr = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dArr[i * 3] = (Math.random() - 0.5) * 28;
      dArr[i * 3 + 1] = (Math.random() - 0.5) * 18;
      dArr[i * 3 + 2] = -4 - Math.random() * 14;
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dArr, 3));
    scene.add(new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0xc9a063, size: 0.025, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));

    const OD = small ? 160 : 320;
    const oArr = new Float32Array(OD * 3);
    for (let i = 0; i < OD; i++) {
      const r2 = GR + 0.3 + Math.random() * 2.5, t2 = Math.random() * Math.PI * 2, ph2 = Math.acos(2 * Math.random() - 1);
      oArr[i * 3] = r2 * Math.sin(ph2) * Math.cos(t2);
      oArr[i * 3 + 1] = r2 * Math.cos(ph2) * 0.7;
      oArr[i * 3 + 2] = r2 * Math.sin(ph2) * Math.sin(t2) * 0.6;
    }
    const oGeo = new THREE.BufferGeometry();
    oGeo.setAttribute('position', new THREE.BufferAttribute(oArr, 3));
    const orbitDust = new THREE.Points(oGeo, new THREE.PointsMaterial({ color: 0xf2d59c, size: 0.03, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    hero.add(orbitDust);

    /* ---- lights ---- */
    const keyL = new THREE.PointLight(0xffe2b0, 35, 40, 1.6);
    keyL.position.set(4, 5, 8);
    scene.add(keyL);
    const fillL = new THREE.PointLight(0x223048, 4, 20, 1.8);
    fillL.position.set(-5, -2, 4);
    scene.add(fillL);
    const innerL = new THREE.PointLight(0xffd9a0, 10, 6, 1.4);
    innerL.position.set(0, 0.5, 1.5);
    hero.add(innerL);

    /* ---- layout ---- */
    const place = { x: 0, y: 0, s: 1 };
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (camera.aspect < 0.8) {
        const halfH0 = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
        const cy = Math.min(250, h * 0.27);
        Object.assign(place, { x: 0, y: ((h / 2 - cy) / (h / 2)) * halfH0 * 0.5, s: Math.min(0.48, (halfH0 * camera.aspect * 0.8) / GR) });
      } else if (camera.aspect < 1.25) {
        Object.assign(place, { x: 0.5, y: 0.35, s: 0.68 });
      } else {
        Object.assign(place, { x: 0.3, y: 0.2, s: 0.72 });
      }
    };
    new ResizeObserver(resize).observe(canvas);
    resize();

    /* ---- threat pulse pool ---- */
    const POOL = 6;
    const pulsePool = [];
    const pulseRingGeo = new THREE.RingGeometry(0.01, 0.04, 16);
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xf2d59c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(pulseRingGeo, m);
      mesh.visible = false;
      globe.add(mesh);
      pulsePool.push({ mesh, m, life: -1 });
    }
    let nextPulse = 1.5, poolIdx = 0, barrierFlash = 0;

    /* ---- animation ---- */
    let intro = 0, introOn = !!window.__dgReady;
    document.addEventListener('dg:ready', () => (introOn = true));
    const mouse = { x: 0, y: 0 };

    const frame = (dt, t) => {
      if (introOn) intro = Math.min(1, intro + dt / 2.2);
      const e = 1 - Math.pow(1 - intro, 4);
      const scroll = clamp(scrollY / innerHeight, 0, 1.2);
      mouse.x = damp(mouse.x, pointer.x, 3, dt);
      mouse.y = damp(mouse.y, pointer.y, 3, dt);

      hero.position.set(place.x + mouse.x * 0.18, place.y + mouse.y * 0.1 + scroll * 2.2 + (1 - e) * -1.5, 0);
      hero.scale.setScalar(place.s * (0.5 + 0.5 * e) * (1 - scroll * 0.15));

      const spin = reduce ? 0 : 1;

      globe.rotation.y += dt * 0.07 * spin;
      globe.rotation.x = 0.18 + mouse.y * 0.12 * spin;

      logo.rotation.y = (Math.sin(t * 0.4) * 0.28 + mouse.x * 0.4) * spin + (1 - e) * -2.5;
      logo.rotation.x = -mouse.y * 0.22 * spin;
      logo.position.y = Math.sin(t * 0.7) * 0.05 * spin;

      barrierFlash = damp(barrierFlash, 0, 4, dt);
      barrier.rotation.y = t * 0.12 * spin;
      barrier.rotation.x = t * 0.07 * spin;
      barrierMat.opacity = 0.12 + 0.08 * Math.sin(t * 1.8) + barrierFlash * 0.25;


      nodes.forEach(n => {
        const p = 0.5 + 0.5 * Math.abs(Math.sin(t * n.sp + n.ph));
        n.mesh.scale.setScalar(0.85 + p * 0.35);
        n.glow.material.opacity = p * 0.45;
      });

      for (let i = 0; i < STREAMS; i++) {
        const s = stData[i];
        s.t = (s.t + s.v * dt) % 1;
        if (arcs.length > 0) {
          const arc = arcs[s.arc];
          const pt = arc.curve.getPoint(s.t);
          stPos[i * 3] = pt.x;
          stPos[i * 3 + 1] = pt.y;
          stPos[i * 3 + 2] = pt.z;
          stCol[i * 3] = 0.95; stCol[i * 3 + 1] = 0.83; stCol[i * 3 + 2] = 0.61;
        }
      }
      stGeo.attributes.position.needsUpdate = true;
      stGeo.attributes.color.needsUpdate = true;

      orbitDust.rotation.y = t * 0.015 * spin;

      if (!reduce) {
        nextPulse -= dt;
        if (nextPulse <= 0) {
          nextPulse = 1.2 + Math.random() * 2.5;
          const ni = Math.floor(Math.random() * nodes.length);
          const slot = pulsePool[poolIdx % POOL];
          poolIdx++;
          slot.mesh.position.copy(nodes[ni].pos);
          slot.mesh.lookAt(0, 0, 0);
          slot.m.color.set(0xf2d59c);
          slot.life = 0;
          slot.mesh.visible = true;
          barrierFlash = 0.8;
        }
      }
      pulsePool.forEach(p => {
        if (p.life < 0) return;
        p.life += dt;
        const frac = p.life / 1.4;
        if (frac >= 1) { p.mesh.visible = false; p.life = -1; return; }
        p.mesh.scale.setScalar(1 + frac * 10);
        p.m.opacity = 0.5 * (1 - frac);
      });

      camera.position.x = damp(camera.position.x, mouse.x * 0.25, 2, dt);
      camera.position.y = damp(camera.position.y, 0.5 + mouse.y * 0.12, 2, dt);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };

    frame(0, 0);
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
