// ONIV homepage hero: a wine bottle that turns to show its front and back labels.
// It spins slowly on its own, turns further as the page scrolls, and can be dragged sideways.
// Falls back to the still image (the poster) if WebGL is unavailable; holds still for reduced motion.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Vector2, LatheGeometry, CylinderGeometry,
  PlaneGeometry, MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial, TextureLoader,
  CanvasTexture, SRGBColorSpace, ACESFilmicToneMapping, PMREMGenerator, DirectionalLight, Color, DoubleSide,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Bottle measurements in centimetres (a standard 750 mL Bordeaux-style bottle).
const BODY_R = 3.8;
const HEIGHT = 30;
const LABEL = { w: 9, h: 10, bottom: 5.5 };

function bottleProfile() {
  const pts = [];
  pts.push(new Vector2(0, 0.25), new Vector2(3.55, 0), new Vector2(3.75, 0.15), new Vector2(BODY_R, 0.6));
  pts.push(new Vector2(BODY_R, 19.6));
  // Shoulder: a smooth S-curve from the body to the neck.
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    pts.push(new Vector2(BODY_R - (BODY_R - 1.48) * ease, 19.6 + 4.6 * t));
  }
  pts.push(new Vector2(1.45, 28.9), new Vector2(1.6, 29.1), new Vector2(1.6, HEIGHT - 0.15), new Vector2(1.5, HEIGHT), new Vector2(0, HEIGHT));
  return pts;
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

async function start(stage) {
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

  const loader = new TextureLoader();
  const [front, back] = await Promise.all([
    loadTexture(loader, stage.dataset.front, renderer),
    loadTexture(loader, stage.dataset.back, renderer),
  ]);

  const bottle = new Group();

  // Dark "antique" glass, so the label is the hero.
  const glass = new MeshPhysicalMaterial({
    color: new Color("#0f1913"), roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    envMapIntensity: 1.5,
  });
  bottle.add(new Mesh(new LatheGeometry(bottleProfile(), 96), glass));

  // Screwcap / capsule over the neck.
  const cap = new MeshStandardMaterial({ color: new Color("#1c1917"), roughness: 0.38, metalness: 0.55 });
  const capMesh = new Mesh(new CylinderGeometry(1.66, 1.66, 5.2, 64), cap);
  capMesh.position.y = HEIGHT - 2.55;
  bottle.add(capMesh);
  const capTop = new Mesh(new CylinderGeometry(1.6, 1.66, 0.12, 64), cap);
  capTop.position.y = HEIGHT + 0.08;
  bottle.add(capTop);

  // Front and back labels, wrapped around the body.
  const r = BODY_R + 0.015;
  const theta = LABEL.w / r;
  const paper = (map) => new MeshStandardMaterial({ map, roughness: 0.82, metalness: 0, side: DoubleSide, toneMapped: false });
  const frontLabel = new Mesh(new CylinderGeometry(r, r, LABEL.h, 64, 1, true, -theta / 2, theta), paper(front));
  const backLabel = new Mesh(new CylinderGeometry(r, r, LABEL.h, 64, 1, true, Math.PI - theta / 2, theta), paper(back));
  frontLabel.position.y = backLabel.position.y = LABEL.bottom + LABEL.h / 2;
  bottle.add(frontLabel, backLabel);

  scene.add(bottle);

  const shadow = new Mesh(new PlaneGeometry(22, 22), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  scene.add(shadow);

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SPIN = 0.42;        // radians per second when idle
  const SCROLL = 0.0055;    // radians per pixel scrolled
  const DRAG = 0.012;       // radians per pixel dragged
  let angle = 0;
  let dragAngle = 0;
  let last = performance.now();
  let visible = true;
  let running = false;

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
    if (!reduce.matches) angle += SPIN * dt;
    const scrolled = reduce.matches ? 0 : window.scrollY * SCROLL;
    bottle.rotation.y = angle + scrolled + dragAngle;
    renderer.render(scene, camera);
    if (visible && !document.hidden) {
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

  // Sideways drag turns the bottle; vertical swipes still scroll the page.
  let dragX = null;
  canvas.addEventListener("pointerdown", (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
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
  window.addEventListener("resize", size);

  stage.appendChild(canvas);
  size();
  renderer.render(scene, camera);
  stage.classList.add("is-live");
  run();
}

const stage = document.querySelector("[data-hero3d]");
if (stage) {
  const go = () => start(stage).catch(() => {});
  const later = () => ("requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 300));
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
}
