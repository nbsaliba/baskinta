// RENDERER
// ══════════════════════════════════════════════════════════
const canvas = document.getElementById('canvas');
const _mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
             || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !_mobile });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !_mobile; // ombres désactivées sur mobile (coûteux)
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Anisotropie maximale supportée par le GPU — limitée à 4 sur mobile
const MAX_ANISO = _mobile ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : renderer.capabilities.getMaxAnisotropy();

function setAnisotropy(tex) {
  if (!tex) return tex;
  tex.anisotropy = MAX_ANISO;
  tex.needsUpdate = true;
  return tex;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f); // noir au départ, bleu ciel après MNT chargé

const W = window.innerWidth, H = window.innerHeight;
const fpsCam    = new THREE.PerspectiveCamera(68, W/H, 0.1, 5000);
const aerialCam = new THREE.PerspectiveCamera(52, W/H, 1, 50000);
const mapCam    = new THREE.OrthographicCamera(-2000,2000,1400,-1400, 1, 100000);
mapCam.position.set(0, 5000, 0); mapCam.lookAt(0,0,0);
let activeCamera = fpsCam, currentView = 'fps';

// Réajuste le rendu quand la taille de la fenêtre change réellement
// (rotation d'écran, ou barre d'adresse mobile qui apparaît/disparaît).
// Sans ceci, le canvas garde la taille calculée au chargement et peut
// devenir plus grand ou plus petit que l'espace visible réel.
function onViewportResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  fpsCam.aspect = w / h;
  fpsCam.updateProjectionMatrix();
  aerialCam.aspect = w / h;
  aerialCam.updateProjectionMatrix();
  // mapCam (orthographique) garde son cadrage existant ; seul le rendu est redimensionné.
}
window.addEventListener('resize', onViewportResize);
window.addEventListener('orientationchange', () => setTimeout(onViewportResize, 200));

// ---- Regarder autour à l'arrêt (rotation horizontale) ----------------------
// lookYaw : angle (radians) ajouté par-dessus la direction du chemin pour le
// regard de la caméra FPS. Modifiable par glisser tactile/souris UNIQUEMENT
// à l'arrêt ; revient en douceur vers 0 (face à la route) dès que la marche
// reprend — voir animate.js pour l'amortissement et l'application à la caméra.
let lookYaw = 0;
let lookPitch = 0; // angle vertical (radians) — négatif = regarde vers le bas (vallée), positif = vers le haut
const PITCH_MIN = -Math.PI/3;   // ~-60° : voir loin en contrebas depuis un sommet
const PITCH_MAX =  Math.PI/4.5; // ~+40° : lever les yeux, sans aller jusqu'au ciel pur
let _lookDragActive = false, _lookDragLastX = 0, _lookDragLastY = 0;
const LOOK_SENSITIVITY = 0.006; // radians par pixel glissé

canvas.style.touchAction = 'none'; // empêche le navigateur de gérer pan/zoom sur le canvas — on gère nous-mêmes le glisser

canvas.addEventListener('pointerdown', e => {
  if (isWalking) return; // pas de rotation caméra pendant la marche
  _lookDragActive = true;
  _lookDragLastX = e.clientX;
  _lookDragLastY = e.clientY;
});
window.addEventListener('pointermove', e => {
  if (!_lookDragActive) return;
  const dx = e.clientX - _lookDragLastX;
  const dy = e.clientY - _lookDragLastY;
  _lookDragLastX = e.clientX;
  _lookDragLastY = e.clientY;
  lookYaw -= dx * LOOK_SENSITIVITY;
  lookPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, lookPitch + dy * LOOK_SENSITIVITY));
});
window.addEventListener('pointerup',     () => { _lookDragActive = false; });
window.addEventListener('pointercancel', () => { _lookDragActive = false; });

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let buildingMeshes = [];

// ══════════════════════════════════════════════════════════
// LUMIÈRES
// ══════════════════════════════════════════════════════════
scene.add(new THREE.AmbientLight(0xffe8cc, 0.45));
const sun = new THREE.DirectionalLight(0xfff5cc, 1.7);
sun.position.set(800, 1300, 400);
sun.castShadow = true;
sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
Object.assign(sun.shadow.camera, {near:1, far:8000, left:-3000, right:3000, top:3000, bottom:-3000});
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xfff0dd, 0xb89050, 0.35));

// Ciel (ajouté dès le départ mais invisible sur fond noir)
const skyMesh = new THREE.Mesh(
  new THREE.SphereGeometry(30000, 16, 8),
  new THREE.MeshBasicMaterial({color:0x7ab4d8, side:THREE.BackSide, transparent:true, opacity:0})
);
scene.add(skyMesh);
const horizonMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(25000, 25000, 2000, 32, 1, true),
  new THREE.MeshBasicMaterial({color:0xd4b87a, transparent:true, opacity:0, side:THREE.BackSide})
);
horizonMesh.position.y=4; scene.add(horizonMesh);

function revealSky() {
  scene.background = new THREE.Color(0x9ab8d0);
  scene.fog = new THREE.FogExp2(0xb8cce0, 0.00008); // ~12km de visibilité, très doux
  skyMesh.material.opacity = 1;
  skyMesh.material.transparent = false;
  horizonMesh.material.opacity = 0.14;
}
