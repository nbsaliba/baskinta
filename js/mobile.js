// ---- État et réglages du podomètre / détection mobile ----------------------
let accelMode = false;          // true = mode accéléromètre actif
let lastMagnitude = null;       // magnitude accélération précédente (null = pas encore de référence)
let lastStepTime  = 0;          // timestamp du dernier pas détecté
let noStepTimer   = null;       // timer d'arrêt si plus de pas
const STEP_THRESHOLD  = 1.1;   // seuil de détection de pas (m/s²) — abaissé pour capter la marche lente
const STEP_MIN_INTERVAL = 280;  // intervalle minimum entre deux pas (ms)
const NO_STEP_TIMEOUT   = 2000; // ms sans pas → on arrête la marche (marge pour un pas posé)

function isMobile() { return _mobile; }

// Affiche le bouton accéléromètre si on est sur mobile
function initMobileUI() {
  if (isMobile()) {
    document.getElementById('accel-btn').style.display = 'block';
    // Sur mobile, le bouton Marcher classique passe en mode secondaire
    document.getElementById('step-btn').innerHTML = '▶ Manuel';
  }
}

async function toggleAccelMode() {
  if (accelMode) {
    // Désactive
    accelMode = false;
    window.removeEventListener('devicemotion', onDeviceMotion);
    if (noStepTimer) { clearTimeout(noStepTimer); noStepTimer = null; }
    stopWalking();
    document.getElementById('accel-btn').textContent = '📱 Mode marche';
    document.getElementById('accel-btn').style.background = 'rgba(120,200,255,.15)';
    return;
  }

  // iOS 13+ nécessite une permission explicite
  if (typeof DeviceMotionEvent !== 'undefined'
      && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== 'granted') {
        alert('Permission refusée. Active le capteur de mouvement dans les réglages Safari.');
        return;
      }
    } catch(e) {
      alert('Erreur permission capteur : ' + e.message);
      return;
    }
  } else if (typeof DeviceMotionEvent === 'undefined') {
    alert('Accéléromètre non disponible sur cet appareil.');
    return;
  }

  // Active le mode
  accelMode = true;
  lastMagnitude = null; // pas encore de référence — la 1ère mesure du capteur ne doit pas compter comme un pas
  lastStepTime  = 0;
  document.getElementById('accel-btn').textContent = '🔴 Arrêter capteur';
  document.getElementById('accel-btn').style.background = 'rgba(255,100,80,.25)';
  window.addEventListener('devicemotion', onDeviceMotion);
}

function onDeviceMotion(e) {
  if (!accelMode) return;
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;

  const mag = Math.sqrt(Math.pow((acc.x||0),2) + Math.pow((acc.y||0),2) + Math.pow((acc.z||0),2));

  // 1ère mesure après activation : sert uniquement de référence (évite un faux
  // "pas" géant dû à la gravité ambiante, ex. |9.8 - 0| bien au-dessus du seuil).
  if (lastMagnitude === null) { lastMagnitude = mag; return; }

  const delta = Math.abs(mag - lastMagnitude);
  lastMagnitude = mag;

  const now = Date.now();
  if (delta > STEP_THRESHOLD && (now - lastStepTime) > STEP_MIN_INTERVAL) {
    lastStepTime = now;
    onStepDetected();
  }
}

function onStepDetected() {
  unlockSynth();

  // Démarre la marche si elle n'était pas en cours
  if (!isWalking && !blockedAtNarr) {
    isWalking = true;
    document.getElementById('step-btn').style.background = 'rgba(255,210,140,.35)';
  }

  // Remet le timer d'arrêt à zéro
  if (noStepTimer) clearTimeout(noStepTimer);
  noStepTimer = setTimeout(() => {
    // Plus de pas depuis NO_STEP_TIMEOUT ms → on arrête
    stopWalking();
    noStepTimer = null;
  }, NO_STEP_TIMEOUT);
}

// Lance la détection mobile au chargement
window.addEventListener('load', initMobileUI);

// Stocke les GeoJSON bruts au moment du chargement
let _rawParcours   = null;
let _rawPOI        = null;
let _rawNarrations = null;
let _rawBati       = null;
let _rawOS         = null;
let _rawMNT        = null; // ArrayBuffer du GeoTIFF MNT
let _rawSAT        = null; // ArrayBuffer du GeoTIFF satellite

let _exportMode = 'autonome';