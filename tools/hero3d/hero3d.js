// ONIV page heroes: a wine bottle that turns to show its front and back labels.
// It spins slowly on its own, turns further as the page scrolls, and can be dragged sideways.
// The page sets the bottle with data attributes on [data-hero3d]:
//   data-front / data-back   label images
//   data-bottle              "still" (Bordeaux, screwcap; default) or "sparkling" (cork and cage that pop on scroll)
//   data-cap                 still bottles only: "black" (gloss black; default), "gold" (brushed gold) or "silver"
//   data-glass               still bottles only: "flint" for clear glass showing the wine (default: dark glass)
//   data-wine                with flint glass: "white" (pale straw; default) or "rose"
//   data-view                "label" frames the label close up (still bottles); otherwise the whole bottle
//   data-turn                "click": the bottle stands still and a click or tap turns it to the other label
//                            (the page can also dispatch "hero3d:face"; the stage fires "hero3d:faced" { face })
// Every [data-hero3d] stage on the page gets its own bottle. Once a bottle is live the stage fires "hero3d:ready";
// dispatch a "hero3d:label" CustomEvent on the stage with detail { front, back: <canvas>, face: "front" | "back" }
// to swap the labels, and the bottle turns to show that face; "hero3d:bottle" with { type: "still" | "sparkling" }
// changes the bottle. data-pop="off" stops a sparkling bottle's cork popping on scroll. "hero3d:snapshot" with
// { callback } calls back with { front, back } JPEG pictures of the bottle.
// Falls back to the still image (the poster) if WebGL is unavailable; holds still for reduced motion.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Vector2, LatheGeometry, CylinderGeometry,
  PlaneGeometry, MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial, TextureLoader,
  CanvasTexture, SRGBColorSpace, ACESFilmicToneMapping, PMREMGenerator, DirectionalLight, Color, DoubleSide,
  TorusGeometry, BufferGeometry, BufferAttribute, Points, PointsMaterial, Vector3, ShaderChunk, AdditiveBlending,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Bottle measurements in centimetres (a standard 750 mL Bordeaux-style bottle).
const BODY_R = 3.8;
const HEIGHT = 30;
const LABEL = { w: 9, h: 10, bottom: 5.5 };

function bottleProfile() {
  // Bordeaux shape: straight body, rounded shoulder, then a slim neck the screwcap sits flush on.
  const pts = [];
  pts.push(new Vector2(0, 0.25), new Vector2(3.55, 0), new Vector2(3.75, 0.15), new Vector2(BODY_R, 0.6));
  pts.push(new Vector2(BODY_R, 18.8));
  const steps = 18;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    pts.push(new Vector2(BODY_R - (BODY_R - 1.44) * ease, 18.8 + 4.4 * t));
  }
  // The neck below the cap is as before; the glass under the cap is narrower so the cap can sit flush with the neck.
  pts.push(new Vector2(1.429, 25.0), new Vector2(1.36, 25.3), new Vector2(1.36, HEIGHT - 0.15), new Vector2(1.3, HEIGHT), new Vector2(0, HEIGHT));
  return pts;
}

// The wine inside a clear (flint) bottle: the inside of the glass, filled to just into the neck.
const FILL = 24.3;
const WINES = { white: { tint: "#d0c05a", depth: 11 }, rose: { tint: "#eaa078", depth: 3.2 } };
function liquidProfile() {
  const pts = [new Vector2(0, 0.7)];
  bottleProfile().forEach((v) => { if (v.x > 0 && v.y > 0.4 && v.y <= FILL) pts.push(new Vector2(v.x * 0.94, Math.max(0.7, v.y))); });
  const top = pts[pts.length - 1];
  pts.push(new Vector2(top.x, FILL), new Vector2(0, FILL));
  return pts;
}

// Screwcap, modelled on a gloss-black wine screwcap: smooth top section with a crisp rounded edge,
// a knurled tamper band set between two grooves, then a smooth skirt down to a rolled hem.
const CAP = { R: 1.44, top: HEIGHT + 0.1, base: HEIGHT - 5.0, bandTop: HEIGHT + 0.1 - 2.05, bandH: 0.48 };

function capProfile() {
  const { R, top, base, bandTop, bandH } = CAP;
  const bandBottom = bandTop - bandH;
  const pts = [
    new Vector2(R - 0.05, base), new Vector2(R - 0.035, base - 0.01), new Vector2(R + 0.015, base + 0.05), // rolled hem
    new Vector2(R + 0.02, base + 0.13), new Vector2(R, base + 0.22),
    new Vector2(R, bandBottom - 0.16), new Vector2(R - 0.06, bandBottom - 0.1), new Vector2(R - 0.07, bandBottom), // lower groove
    new Vector2(R - 0.07, bandTop), new Vector2(R - 0.06, bandTop + 0.1), new Vector2(R, bandTop + 0.16), // upper groove
    new Vector2(R, top - 0.16),
  ];
  for (let i = 1; i <= 8; i++) { // crisp rounded top edge
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new Vector2(R - 0.16 + 0.16 * Math.cos(a), top - 0.16 + 0.16 * Math.sin(a)));
  }
  pts.push(new Vector2(0, top));
  return pts;
}

// The knurled band: fine vertical ribs around the cap.
function knurlGeometry() {
  const { R, bandTop, bandH } = CAP;
  const ribs = 80, segs = ribs * 6;
  const geo = new CylinderGeometry(R, R, bandH, segs, 1, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const theta = Math.atan2(x, z);
    const wave = 0.5 + 0.5 * Math.cos(theta * ribs);       // 1 at a rib's crest, 0 in the gap
    const r = R - 0.06 + 0.055 * Math.pow(wave, 0.6);
    const k = r / Math.hypot(x, z);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  geo.translate(0, bandTop - bandH / 2, 0);
  return geo;
}

// ---- Sparkling bottle (Champagne shape) -------------------------------------------------------
const SPK = { R: 4.35, H: 29.45, label: { w: 9, h: 10, bottom: 4.2 } };

function sparklingProfile() {
  const pts = [new Vector2(0, 0.3), new Vector2(4.1, 0), new Vector2(4.3, 0.15), new Vector2(SPK.R, 0.6), new Vector2(SPK.R, 15.5)];
  const steps = 24;
  for (let i = 1; i <= steps; i++) { // long, gentle shoulder
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    pts.push(new Vector2(SPK.R - (SPK.R - 1.52) * ease, 15.5 + 8.5 * t));
  }
  pts.push(new Vector2(1.5, 28.55), new Vector2(1.76, 28.68), new Vector2(1.79, 29.15), new Vector2(1.62, 29.38), new Vector2(1.46, SPK.H), new Vector2(0, SPK.H));
  return pts;
}

// Foil collar hugging the neck, from the shoulder to the lip.
function foilProfile() {
  return sparklingProfile()
    .filter((v) => v.y >= 22.6 && v.y <= SPK.H && v.x > 0)
    .map((v) => new Vector2(v.x + 0.035, v.y))
    .concat([new Vector2(1.3, SPK.H + 0.03)]);
}

function corkProfile() {
  // Mushroom-shaped cork sitting on the lip, as it does after the foil hood is removed.
  const base = SPK.H - 0.05;
  const pts = [new Vector2(1.38, base), new Vector2(1.42, base + 0.35), new Vector2(1.6, base + 0.75), new Vector2(1.7, base + 1.05)];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push(new Vector2(1.7 * Math.cos(a), base + 1.05 + 0.75 * Math.sin(a)));
  }
  return pts;
}

function dropletTexture() {
  // A soft champagne droplet: bright centre, pale gold rim, transparent edge.
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(28, 28, 2, 32, 32, 30);
  r.addColorStop(0, "rgba(255,252,236,1)");
  r.addColorStop(0.45, "rgba(236,214,150,0.95)");
  r.addColorStop(0.8, "rgba(186,150,74,0.75)");
  r.addColorStop(1, "rgba(186,150,74,0)");
  g.fillStyle = r;
  g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function corkTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#c9a774";
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1400; i++) { // speckled grain
    const s = Math.random();
    g.fillStyle = s < 0.5 ? "rgba(120,86,48,0.35)" : "rgba(240,220,180,0.25)";
    g.fillRect(Math.random() * 256, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 1.5);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Wire cage (muselet): a cap plaque on top, four legs and a ring around the lip.
function cage(wire, plaqueMat) {
  const g = new Group();
  const top = SPK.H + 1.8;
  const plaque = new Mesh(new CylinderGeometry(0.95, 0.98, 0.1, 48), plaqueMat);
  plaque.position.y = top + 0.03;
  g.add(plaque);
  const ring = new Mesh(new TorusGeometry(1.84, 0.045, 10, 64), wire);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = SPK.H - 0.32;
  g.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p1 = new Vector3(Math.sin(a) * 0.92, top, Math.cos(a) * 0.92);
    const p2 = new Vector3(Math.sin(a) * 1.84, SPK.H - 0.32, Math.cos(a) * 1.84);
    const mid = new Vector3(Math.sin(a) * 1.78, SPK.H + 1.0, Math.cos(a) * 1.78); // bows out over the cork
    for (const [a1, b1] of [[p1, mid], [mid, p2]]) {
      const len = a1.distanceTo(b1);
      const leg = new Mesh(new CylinderGeometry(0.04, 0.04, len, 8), wire);
      leg.position.copy(a1).add(b1).multiplyScalar(0.5);
      leg.lookAt(b1);
      leg.rotateX(Math.PI / 2);
      g.add(leg);
    }
  }
  return g;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(28,25,23,0.42)");
  grad.addColorStop(0.45, "rgba(28,25,23,0.16)");
  grad.addColorStop(1, "rgba(28,25,23,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new CanvasTexture(c);
}

function backdropTexture() {
  const c = document.createElement("canvas");
  c.width = 400; c.height = 500;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(200, 160, 0, 200, 160, 430);
  grad.addColorStop(0, "#FCFBF8");
  grad.addColorStop(0.55, "#F1ECE4");
  grad.addColorStop(1, "#E4DBCF");
  g.fillStyle = grad;
  g.fillRect(0, 0, 400, 500);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function loadTexture(loader, url, renderer) {
  return new Promise((resolve, reject) => {
    loader.load(url, (tex) => {
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      resolve(tex);
    }, undefined, reject);
  });
}

async function start(stage, index = 0) {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-canvas";
  canvas.setAttribute("aria-hidden", "true");

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  } catch (e) {
    return; // no WebGL: the poster image stays
  }
  // Software-only graphics (no GPU) would make the page sluggish, so keep the still image there.
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|llvmpipe|softpipe|software/i.test(gpu) && !/[?&]3d\b/.test(location.search)) {
    renderer.dispose();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  scene.background = backdropTexture();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new DirectionalLight(0xffffff, 1.25);
  key.position.set(-30, 40, 40);
  scene.add(key);

  const camera = new PerspectiveCamera(24, 4 / 5, 1, 400);
  camera.position.set(0, 16.5, 80);
  camera.lookAt(0, 15, 0);
  if (stage.dataset.view === "label") {
    // Closer in, for reading a label: from the base of the bottle up to its shoulder.
    camera.position.set(0, 12.2, 56);
    camera.lookAt(0, 11.6, 0);
  }

  const loader = new TextureLoader();
  const [front, back] = await Promise.all([
    loadTexture(loader, stage.dataset.front, renderer),
    loadTexture(loader, stage.dataset.back, renderer),
  ]);

  const type = stage.dataset.bottle === "sparkling" ? "sparkling" : "still";
  const bottle = new Group();            // turns; holds the current bottle model
  const paper = (map) => new MeshStandardMaterial({ map, color: new Color(0.56, 0.56, 0.56), roughness: 0.82, metalness: 0, side: DoubleSide, toneMapped: false });
  function labels(model, radius, label) {
    // Front and back labels, wrapped around the body. The colour multiplier keeps printed colours true to the artwork.
    const r = radius + 0.015;
    const theta = label.w / r;
    model.front = new Mesh(new CylinderGeometry(r, r, label.h, 64, 1, true, -theta / 2, theta), paper(front));
    model.back = new Mesh(new CylinderGeometry(r, r, label.h, 64, 1, true, Math.PI - theta / 2, theta), paper(back));
    model.front.position.y = model.back.position.y = label.bottom + label.h / 2;
    model.group.add(model.front, model.back);
  }

  function buildBottle(kind) {
    const model = { kind, group: new Group(), front: null, back: null, cork: null, shine: null };
    const g = model.group;
    if (kind === "still") {
      if (stage.dataset.glass === "flint") {
        // Clear glass, so the wine shows: the wine itself, then a thin glossy skin of glass over it.
        // The wine lets light through and tints it, more where it is deeper, like a real bottle.
        const w = Object.assign({}, WINES[stage.dataset.wine] || WINES.white);
        if (stage.dataset.wineTint) w.tint = stage.dataset.wineTint;          // overrides, for trying colours
        if (stage.dataset.wineDepth) w.depth = Number(stage.dataset.wineDepth);
        const wine = new MeshPhysicalMaterial({
          color: new Color("#ffffff"), metalness: 0, roughness: 0.03, transmission: 1, ior: 1.34, thickness: 7,
          attenuationColor: new Color(w.tint), attenuationDistance: w.depth, envMapIntensity: 1.2,
          clearcoat: 1, clearcoatRoughness: 0.03,
        });
        // As in a photo of a real bottle, the wine looks lighter where you see straight through it and
        // deeper towards the sides, where the light bends through more glass and wine, and towards the bottom.
        wine.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace("#include <transmission_fragment>",
            ShaderChunk.transmission_fragment.replace("material.thickness = thickness;",
              "material.thickness = thickness * (0.55 + 0.8 * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 1.5)) * mix(1.55, 0.5, clamp((vWorldPosition.y - 1.0) / 22.0, 0.0, 1.0));"));
        };
        // Long vertical highlights, as a studio light makes on glass. They stay put while the bottle turns,
        // and the labels hide them, as they would on a real bottle.
        if (!model.shine) {
          model.shine = new Group();
          // Soft at the ends and soft at the sides.
          const fade = document.createElement("canvas"); fade.width = 64; fade.height = 128;
          const fg = fade.getContext("2d"), gr = fg.createLinearGradient(0, 0, 0, 128);
          gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.18, "rgba(255,255,255,1)");
          gr.addColorStop(0.85, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
          fg.fillStyle = gr; fg.fillRect(0, 0, 64, 128);
          fg.globalCompositeOperation = "destination-in";
          const across = fg.createLinearGradient(0, 0, 64, 0);
          across.addColorStop(0, "rgba(0,0,0,0)"); across.addColorStop(0.35, "rgba(0,0,0,1)");
          across.addColorStop(0.65, "rgba(0,0,0,1)"); across.addColorStop(1, "rgba(0,0,0,0)");
          fg.fillStyle = across; fg.fillRect(0, 0, 64, 128);
          const fadeTex = new CanvasTexture(fade);
          [[-0.62, 0.14, 0.55], [0.98, 0.09, 0.35], [-1.12, 0.05, 0.3], [-0.4, 0.55, 0.14]].forEach(([at, wide, strength]) => {
            const m = new MeshBasicMaterial({ map: fadeTex, color: new Color(strength, strength, strength), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
            const strip = new Mesh(new CylinderGeometry(BODY_R + 0.006, BODY_R + 0.006, 17.4, 6, 1, true, at - wide / 2, wide), m);
            strip.position.y = 0.9 + 8.7;
            model.shine.add(strip);
          });
        }
        g.add(new Mesh(new LatheGeometry(liquidProfile(), 96), wine));
        // Glass: nearly invisible face-on, denser and greener towards the edges, as thick clear glass looks.
        const glass = new MeshPhysicalMaterial({
          color: new Color(stage.dataset.glassTint || "#aebdb4"), roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
          envMapIntensity: 2.4, transparent: true, opacity: 1, depthWrite: false,
        });
        glass.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", `#include <dithering_fragment>
            float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
            gl_FragColor.a *= mix(0.85, 0.05, smoothstep(0.05, 0.55, facing));`);
        };
        const skin = new Mesh(new LatheGeometry(bottleProfile(), 96), glass);
        skin.renderOrder = 2;
        g.add(skin);
      } else {
        // Dark "antique" glass, so the label is the hero.
        const glass = new MeshPhysicalMaterial({
          color: new Color("#0f1913"), roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5,
        });
        g.add(new Mesh(new LatheGeometry(bottleProfile(), 96), glass));
      }
      // Screwcap: gloss black, brushed gold or brushed silver.
      const cap = stage.dataset.cap === "gold"
        ? new MeshPhysicalMaterial({ color: new Color("#c09a5c"), metalness: 1, roughness: 0.26, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.2 })
        : stage.dataset.cap === "silver"
          ? new MeshPhysicalMaterial({ color: new Color("#c8ccd0"), metalness: 1, roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.2 })
          : new MeshPhysicalMaterial({ color: new Color("#0a0a0a"), metalness: 0.15, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 });
      g.add(new Mesh(new LatheGeometry(capProfile(), 160), cap));
      g.add(new Mesh(knurlGeometry(), cap));
      labels(model, BODY_R, LABEL);
    } else {
      // Deep green Champagne-style glass, gold foil collar, natural cork under a wire cage.
      const glass = new MeshPhysicalMaterial({
        color: new Color("#10231a"), roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6,
      });
      g.add(new Mesh(new LatheGeometry(sparklingProfile(), 110), glass));
      const gold = new MeshStandardMaterial({ color: new Color("#b8955a"), metalness: 1, roughness: 0.32, envMapIntensity: 1.2 });
      g.add(new Mesh(new LatheGeometry(foilProfile(), 110), gold));
      const wire = new MeshStandardMaterial({ color: new Color("#d8d8d4"), metalness: 1, roughness: 0.28 });
      model.cork = new Group();
      model.cork.add(new Mesh(new LatheGeometry(corkProfile(), 64), new MeshStandardMaterial({ map: corkTexture(), roughness: 0.9, metalness: 0 })));
      model.cork.add(cage(wire, gold));
      g.add(model.cork);
      labels(model, SPK.R, SPK.label);
    }
    return model;
  }

  const models = {};
  let model = models[type] = buildBottle(type);
  bottle.add(model.group);
  if (model.shine) scene.add(model.shine);
  let frontLabel = model.front, backLabel = model.back, cork = model.cork;
  if (type === "sparkling" && stage.dataset.view !== "label") {
    camera.position.set(0, 18, 92);
    camera.lookAt(0, 17.2, 0);
  }
  // The cork pops as the page scrolls, unless the stage turns that off (data-pop="off").
  const popOn = stage.dataset.pop !== "off";

  scene.add(bottle);

  const shadow = new Mesh(new PlaneGeometry(22, 22), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  scene.add(shadow);

  // Champagne for the cork pop: a fast spray of droplets and slower foam welling over the lip.
  // Each droplet is a soft gold-rimmed dot so it shows against the cream backdrop.
  const dropTex = dropletTexture();
  function burst(count, size) {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    const mat = new PointsMaterial({ map: dropTex, size, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const points = new Points(geo, mat);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    return { count, pos, vel, geo, mat, points };
  }
  const droplets = burst(200, 0.8);
  const foam = burst(110, 0.55);

  function launch(b, speedUp, speedOut) {
    for (let i = 0; i < b.count; i++) {
      const a = Math.random() * Math.PI * 2, s = speedOut[0] + Math.random() * speedOut[1];
      b.pos[i * 3] = Math.sin(a) * 0.5; b.pos[i * 3 + 1] = SPK.H + 0.3; b.pos[i * 3 + 2] = Math.cos(a) * 0.5;
      b.vel[i * 3] = Math.sin(a) * s; b.vel[i * 3 + 1] = speedUp[0] + Math.random() * speedUp[1]; b.vel[i * 3 + 2] = Math.cos(a) * s + 2;
    }
    b.geo.attributes.position.needsUpdate = true;
    b.points.visible = true;
  }
  function fly(b, dt, gravity, opacity) {
    if (!b.points.visible) return;
    for (let i = 0; i < b.count; i++) {
      b.vel[i * 3 + 1] -= gravity * dt;
      b.pos[i * 3] += b.vel[i * 3] * dt;
      b.pos[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
      b.pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
    }
    b.geo.attributes.position.needsUpdate = true;
    b.mat.opacity = opacity;
    if (opacity <= 0) b.points.visible = false;
  }

  let popped = false;
  let popTime = 0;
  const corkFlight = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

  function pop(now) {
    popped = true;
    popTime = now;
    // The cork leaves the (spinning) bottle and flies out towards the viewer, tumbling, then drops away to one side.
    scene.attach(cork);
    const dir = Math.random() < 0.5 ? -1 : 1;
    Object.assign(corkFlight, { x: cork.position.x, y: cork.position.y, z: cork.position.z, vx: dir * (8 + Math.random() * 3), vy: 16, vz: 34 });
    launch(droplets, [8, 22], [1.5, 6]);
    launch(foam, [2, 6], [0.4, 1.6]);
  }

  function resetCork() {
    popped = false;
    model.group.attach(cork);
    cork.position.set(0, 0, 0);
    cork.rotation.set(0, 0, 0);
    cork.visible = true;
  }

  function updateCork(now, dt) {
    if (!cork) return;
    // Progress is based on where the cork is on screen, so it always pops in view, below the sticky header.
    const rect = stage.getBoundingClientRect();
    const corkY = rect.top + rect.height * 0.14;
    const header = document.querySelector(".site-header");
    const headerH = header ? header.offsetHeight : 0;
    const startY = Math.min(corkY + window.scrollY, window.innerHeight * 0.7);
    const popY = Math.max(headerH + 60, Math.min(window.innerHeight * 0.38, startY - 80));
    const p = Math.max(0, Math.min(1, (startY - corkY) / Math.max(1, startY - popY)));
    if (!popped) {
      // The cork eases up out of the neck as the page scrolls, trembling just before it goes.
      const lift = p * p * 1.1;
      cork.position.set(0, lift, 0);
      cork.rotation.set(0, 0, p > 0.4 ? Math.sin(now / 26) * 0.035 * p : 0);
      if (p >= 1) pop(now);
      return;
    }
    const t = (now - popTime) / 1000;
    if (t < 1.8) {
      corkFlight.vy -= 30 * dt;
      corkFlight.x += corkFlight.vx * dt;
      corkFlight.y += corkFlight.vy * dt;
      corkFlight.z += corkFlight.vz * dt;
      cork.position.set(corkFlight.x, corkFlight.y, corkFlight.z);
      cork.rotation.x += 7 * dt;
      cork.rotation.z -= Math.sign(corkFlight.vx) * 5 * dt;
    } else {
      cork.visible = false;
    }
    fly(droplets, dt, 34, Math.max(0, 1 - Math.max(0, t - 0.5) * 1.4));
    fly(foam, dt, 9, Math.max(0, 1 - Math.max(0, t - 0.9) * 0.9));
    // Scroll back up and the cork is back in place, ready to pop again.
    if (t > 1.8 && p < 0.15) resetCork();
  }

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SPIN = 0.42 * [1, 0.84, 1.16, 0.93][index % 4]; // radians per second when idle (varied, so bottles side by side drift apart)
  const SCROLL = 0.0055;    // radians per pixel scrolled
  const DRAG = 0.012;       // radians per pixel dragged
  let angle = 0;
  let dragAngle = 0;
  let last = performance.now();
  let turn = null;          // easing the bottle round to face the viewer after a new label
  let holdUntil = 0;        // pause the idle spin so a new label can be read
  let visible = true;
  let running = false;
  const clickTurn = stage.dataset.turn === "click";
  let face = "front";

  function size() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const scrolled = reduce.matches || clickTurn ? 0 : window.scrollY * SCROLL;
    if (turn) {
      // Timed against the clock rather than the frame's timestamp, which some browsers set slightly before the tap.
      const k = Math.max(0, Math.min(1, (performance.now() - turn.t0) / 900));
      angle = turn.from + (turn.to - turn.from) * (1 - Math.pow(1 - k, 3));
      if (k >= 1) { angle = turn.to; turn = null; }
    } else if (!reduce.matches && !clickTurn && now > holdUntil) {
      angle += SPIN * dt;
    }
    bottle.rotation.y = angle + scrolled + dragAngle;
    if (!reduce.matches && popOn) updateCork(now, dt);
    try {
      renderer.render(scene, camera);
    } catch (err) {
      running = false;   // never leave the loop marked as running when it has stopped
      throw err;
    }
    if (clickTurn && !turn) { running = false; return; }   // standing still: nothing more to draw until the next tap
    if (turn || (visible && !document.hidden)) {          // a turn always finishes
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function run() {
    if (reduce.matches) { renderer.render(scene, camera); return; } // reduced motion: hold still
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // Tap-to-turn bottles: a click turns the bottle round to the other label. It always comes to rest square on a
  // label, even when tapped again mid-turn (it carries on round to the label asked for).
  function turnTo(next) {
    if (next === face) return;
    face = next;
    const offset = next === "back" ? Math.PI : 0;
    let target = offset + Math.ceil((angle - offset) / (Math.PI * 2) - 1e-6) * Math.PI * 2;
    if (target <= angle + 1e-6) target += Math.PI * 2;
    if (reduce.matches) {
      turn = null; angle = target; bottle.rotation.y = angle; renderer.render(scene, camera);
    } else {
      turn = { from: angle, to: target, t0: performance.now() };
      run();
    }
    stage.dispatchEvent(new CustomEvent("hero3d:faced", { detail: { face } }));
  }
  // If the browser takes the graphics away (too many 3D views at once on some phones), show the still image again.
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); running = false; stage.classList.remove("is-live"); });
  canvas.addEventListener("webglcontextrestored", () => { stage.classList.add("is-live"); renderer.render(scene, camera); });
  if (clickTurn) {
    canvas.addEventListener("click", () => turnTo(face === "front" ? "back" : "front"));
    stage.addEventListener("hero3d:face", (e) => turnTo((e.detail && e.detail.face) || (face === "front" ? "back" : "front")));
  }

  // Sideways drag turns the bottle; vertical swipes still scroll the page.
  let dragX = null;
  canvas.addEventListener("pointerdown", (e) => { if (clickTurn) return; dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (dragX === null) return;
    dragAngle += (e.clientX - dragX) * DRAG;
    dragX = e.clientX;
    if (reduce.matches) { bottle.rotation.y = dragAngle; renderer.render(scene, camera); }
  });
  const endDrag = () => { dragX = null; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) run();
  }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible) run(); });
  window.addEventListener("resize", () => { size(); renderer.render(scene, camera); });

  // A new front label (from the "see your logo on a bottle" preview): swap it in and turn the bottle to face the viewer.
  const custom = { front: null, back: null };   // labels made in the page, kept across bottle changes
  const swap = (side, src) => {
    if (!src) return;
    const tex = new CanvasTexture(src);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (custom[side]) custom[side].dispose();
    custom[side] = tex;
    const mesh = side === "front" ? frontLabel : backLabel;
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
  };
  // Change the bottle ("still" or "sparkling"), keeping the labels and the angle.
  stage.addEventListener("hero3d:bottle", (e) => {
    const kind = e.detail && e.detail.type === "sparkling" ? "sparkling" : "still";
    if (kind === model.kind) return;
    bottle.remove(model.group);
    model = models[kind] || (models[kind] = buildBottle(kind));
    bottle.add(model.group);
    frontLabel = model.front; backLabel = model.back; cork = model.cork;
    frontLabel.material.map = custom.front || front; frontLabel.material.needsUpdate = true;
    backLabel.material.map = custom.back || back; backLabel.material.needsUpdate = true;
    run();
    if (reduce.matches) renderer.render(scene, camera);
  });
  stage.addEventListener("hero3d:label", (e) => {
    const d = e.detail || {};
    if (!frontLabel) return;
    swap("front", d.front);
    swap("back", d.back);
    const scrolled = reduce.matches ? 0 : window.scrollY * SCROLL;
    const total = angle + scrolled + dragAngle;
    const offset = d.face === "back" ? Math.PI : 0;                     // the back label faces the viewer half a turn round
    const facing = Math.round((total - offset) / (Math.PI * 2)) * Math.PI * 2 + offset;
    const target = angle + (facing - total);
    if (reduce.matches) { angle = target; bottle.rotation.y = angle + dragAngle; renderer.render(scene, camera); return; }
    turn = { from: angle, to: target, t0: performance.now() };
    holdUntil = performance.now() + 3200;
    run();
  });

  // Pictures of the bottle from the front and the back (for emailing a preview), as JPEG data URLs.
  // Rendered and read in one go, so the canvas doesn't need to keep its drawing buffer.
  stage.addEventListener("hero3d:snapshot", (e) => {
    const cb = e.detail && e.detail.callback;
    if (typeof cb !== "function") return;
    const keep = bottle.rotation.y;
    const shot = (r) => { bottle.rotation.y = r; renderer.render(scene, camera); return canvas.toDataURL("image/jpeg", 0.9); };
    const pics = { front: shot(0), back: shot(Math.PI) };
    bottle.rotation.y = keep;
    renderer.render(scene, camera);
    cb(pics);
  });

  stage.appendChild(canvas);
  size();
  renderer.render(scene, camera);
  stage.classList.add("is-live");
  stage.dispatchEvent(new CustomEvent("hero3d:ready"));
  run();
}

const stages = document.querySelectorAll("[data-hero3d]");
if (stages.length) {
  // Each bottle starts once it is near the screen, so one further down the page costs nothing until it's wanted.
  const go = () => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        start(e.target, Array.prototype.indexOf.call(stages, e.target)).catch(() => {});
      });
    }, { rootMargin: "400px 0px" });
    stages.forEach((stage) => io.observe(stage));
  };
  const later = () => ("requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 300));
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
}
