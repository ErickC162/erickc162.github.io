import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MODEL_URL = 'assets/avatar-anim.glb?v=1';   // subir el número al reemplazar el modelo

/* ---------------------------------------------------------------- carga */
const ui = {
  loader: document.getElementById('loader'),
  pill: document.getElementById('loaderPill'),
  label: document.getElementById('loaderLabel'),
  pct: document.getElementById('loaderPct'),
  bar: document.getElementById('loaderBar'),
};
let shown = 0, target = 0;
function tickLoader() {
  shown += (target - shown) * 0.12;
  if (target - shown < 0.5) shown = target;
  const v = Math.round(shown);
  ui.pct.textContent = v;
  ui.bar.style.width = v + '%';
  if (v < 100) requestAnimationFrame(tickLoader);
  else finishLoading();
}
requestAnimationFrame(tickLoader);

let finished = false;
const onReady = [];
function finishLoading() {
  if (finished) return; finished = true;
  ui.pill.classList.add('is-done');
  ui.label.textContent = 'Bienvenido';
  setTimeout(() => {
    ui.loader.classList.add('is-out');
    document.body.classList.remove('is-loading');
    setTimeout(() => ui.loader.remove(), 1100);
    onReady.forEach((f) => f());
  }, 650);
}

/* ---------------------------------------------------------------- escena */
const canvas = document.getElementById('avatar');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(22, 1, 0.05, 20);

// luz principal suave + contornos con la paleta
scene.add(new THREE.HemisphereLight('#cbd5e1', '#0F172A', 0.6));
const key = new THREE.DirectionalLight('#ffffff', 1.9); key.position.set(-1, 1.3, 2.2); scene.add(key);
const rimV = new THREE.DirectionalLight('#8B5CF6', 3.2); rimV.position.set(-2.2, 1.1, -1.4); scene.add(rimV);
const rimS = new THREE.DirectionalLight('#38BDF8', 3.0); rimS.position.set(2.2, 1.3, -1.4); scene.add(rimS);

/* ---------------------------------------------------------------- avatar */
let avatar = null, mixer = null, bones = {}, actions = {}, height = 1;

// capa interior negra: las caras internas que se ven por los huecos del cabello se pintan de negro
function darkBackfaces(material) {
  material.side = THREE.DoubleSide;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
        if (!gl_FrontFacing) gl_FragColor = vec4(0.012, 0.012, 0.016, 1.0);`);
  };
  material.needsUpdate = true;
}

// volumen negro bajo los rizos (tapa los huecos del contorno); va pegado al hueso de la cabeza
function buildHairCore(mesh, headBone) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const H = box.max.y - box.min.y;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3(), pts = [];
  const c = new THREE.Vector3(0, 0.95, -0.012);                  // centro del cráneo (unidades normalizadas)
  for (let i = 0; i < pos.count; i += 2) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);   // posición de reposo en el mundo
    const n = new THREE.Vector3((v.x - cx) / H, (v.y - box.min.y) / H, (v.z - cz) / H);
    if (n.y < 0.952 + 0.25 * Math.max(0, n.z - 0.02)) continue;
    n.sub(c).multiplyScalar(0.88).add(c);
    n.z = Math.min(n.z, 0.040);
    pts.push(new THREE.Vector3(n.x * H + cx, n.y * H + box.min.y, n.z * H + cz));
  }
  if (pts.length < 20) return;
  headBone.updateMatrixWorld(true);
  const inv = headBone.matrixWorld.clone().invert();
  const geo = new ConvexGeometry(pts.map((p) => p.applyMatrix4(inv)));
  headBone.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x050507 })));
}

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    avatar = gltf.scene;
    let skinned = null;
    avatar.traverse((o) => {
      if (o.isSkinnedMesh) { skinned = o; o.frustumCulled = false; darkBackfaces(o.material); }
      if (o.isBone) bones[o.name.replace('mixamorig', '')] = o;
    });
    scene.add(avatar);
    avatar.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(avatar);
    height = box.max.y - box.min.y;
    avatar.position.y -= box.min.y;                // pies en y = 0
    avatar.updateMatrixWorld(true);
    if (skinned && bones.Head) buildHairCore(skinned, bones.Head);

    mixer = new THREE.AnimationMixer(avatar);
    const clip = (n) => gltf.animations.find((a) => a.name === n);
    for (const n of ['saludo', 'pose', 'mirar', 'gesto']) {
      const c = clip(n); if (!c) continue;
      const a = mixer.clipAction(c);
      if (n !== 'pose') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[n] = a;
    }
    // respiración sumada encima de la pose (movimiento sutil del pecho y los hombros)
    const breathe = clip('respirar');
    if (breathe) {
      THREE.AnimationUtils.makeClipAdditive(breathe);
      const a = mixer.clipAction(breathe);
      a.blendMode = THREE.AdditiveAnimationBlendMode;
      a.setEffectiveWeight(0.6).play();
      actions.respirar = a;
    }
    actions.pose?.play();
    mixer.addEventListener('finished', onGestureEnd);
    resize();
    target = 100;
    setTimeout(finishLoading, 1800);   // respaldo si la pestaña está en segundo plano
  },
  (e) => { if (e.total) target = Math.min(95, (e.loaded / e.total) * 95); },
  (err) => { console.error(err); target = 100; },
);

/* ---------------------------------------------------------------- secuencia de gestos */
let current = 'pose', nextGestureAt = Infinity;
function playGesture(name, fade = 0.45) {
  const a = actions[name]; if (!a || current === name) return;
  const from = actions[current];
  a.reset().setEffectiveWeight(1).play();
  if (from) from.crossFadeTo(a, fade, false);
  current = name;
}
function onGestureEnd(e) {
  if (e.action === actions.pose) return;
  const pose = actions.pose;
  pose.reset().setEffectiveWeight(1).play();
  e.action.crossFadeTo(pose, 0.6, false);
  current = 'pose';
  nextGestureAt = clock.elapsedTime + 7 + Math.random() * 5;
}
onReady.push(() => {
  if (reduceMotion) return;
  setTimeout(() => playGesture('saludo', 0.35), 250);   // saluda al terminar la carga
});
// responde al presionar (no al soltar), como un botón físico
canvas.addEventListener('pointerdown', () => { if (current === 'pose' && !reduceMotion) playGesture('saludo', 0.3); });

/* ---------------------------------------------------------------- encuadre */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const mobile = w < 760;
  // de los muslos para arriba (deja ver el saludo y los gestos)
  const viewH = (mobile ? Math.max(0.82, 0.62 / camera.aspect) : 0.82) * height;
  const topY = (mobile ? 1.0 + 0.30 * (viewH / height) : 1.09) * height;
  const centerY = topY - viewH / 2;
  const dist = (viewH / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, centerY + 0.02 * height, dist);
  camera.lookAt(0, centerY, 0);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ---------------------------------------------------------------- interacción */
const pointer = { x: 0, y: 0, active: false };
addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = (e.clientY / innerHeight) * 2 - 1;
  pointer.active = true;
}, { passive: true });
document.addEventListener('pointerleave', () => { pointer.active = false; });
if (new URLSearchParams(location.search).has('debug')) window.__dbg = { camera, pointer, resize, playGesture, actions };

// giro de la cabeza encima de la animación (repartido entre cuello y cabeza)
const qTmp = new THREE.Quaternion(), qParent = new THREE.Quaternion(), qDelta = new THREE.Quaternion();
const AX_Y = new THREE.Vector3(0, 1, 0), AX_X = new THREE.Vector3(1, 0, 0);
function addWorldRotation(bone, yaw, pitch) {
  if (!bone) return;
  qDelta.setFromAxisAngle(AX_Y, yaw).multiply(qTmp.setFromAxisAngle(AX_X, pitch));
  bone.parent.getWorldQuaternion(qParent);
  // q_local' = parentᵀ · delta · parent · q_local
  bone.quaternion.premultiply(qParent.clone().invert().multiply(qDelta).multiply(qParent));
}

const clock = new THREE.Clock();
const clamp = THREE.MathUtils.clamp;
let yaw = 0, pitch = 0, follow = 1;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (mixer) mixer.update(dt);

  if (avatar) {
    if (current === 'pose' && t > nextGestureAt && !reduceMotion) {
      playGesture(Math.random() < 0.5 ? 'mirar' : 'gesto');
      nextGestureAt = Infinity;
    }
    // durante "mirar" y "gesto" la animación ya mueve la cabeza: se sigue menos al cursor
    const wantFollow = (current === 'mirar' || current === 'gesto') ? 0.25 : 1;
    follow += (wantFollow - follow) * 0.05;

    let tx = 0, ty = 0;
    if (!reduceMotion) {
      if (pointer.active) { tx = pointer.x; ty = pointer.y; }
      else { tx = Math.sin(t * 0.35) * 0.3; ty = Math.sin(t * 0.23) * 0.1; }
    }
    tx = clamp(tx, -1, 1); ty = clamp(ty, -1, 1);
    yaw += (tx * 0.45 - yaw) * 0.06;
    pitch += (ty * 0.2 - pitch) * 0.06;
    addWorldRotation(bones.Neck, yaw * 0.4 * follow, pitch * 0.4 * follow);
    addWorldRotation(bones.Head, yaw * 0.6 * follow, pitch * 0.6 * follow);
    avatar.rotation.y = yaw * 0.12;                 // el cuerpo acompaña un poco
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

/* ---------------------------------------------------------------- rol rotativo */
const words = [...document.querySelectorAll('.role-word')];
let wi = 0;
if (words.length > 1 && !reduceMotion) {
  setInterval(() => {
    const cur = words[wi];
    wi = (wi + 1) % words.length;
    const next = words[wi];
    cur.classList.remove('is-on'); cur.classList.add('is-out');
    next.classList.add('is-on');
    // al terminar de salir, vuelve abajo sin animación (para no cruzar por el centro)
    setTimeout(() => {
      cur.classList.add('no-anim');
      cur.classList.remove('is-out');
      void cur.offsetWidth;
      cur.classList.remove('no-anim');
    }, 900);
  }, 2600);
}
