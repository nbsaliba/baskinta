// RÉFÉRENTIEL PARTAGÉ UTM
// Fixé par le premier fichier chargé (idéalement le MNT)
// Toutes les couches suivantes s'y réfèrent automatiquement
// ══════════════════════════════════════════════════════════
let geoOrigin = null;        // { e, n } mètres UTM
const SCENE_SCALE = 1; // 1 unité = 1 mètre réel

function setOrigin(e, n) {
  if (geoOrigin) return;
  geoOrigin = { e, n };
  const el = document.getElementById('sig-origin');
  if (el) el.textContent =
    'Origine UTM 36N fixée :\nE ' + Math.round(e) + '\nN ' + Math.round(n) +
    '\n(1 unité = 1 m)';
}

function utmToScene(e, n) {
  return {
    x:  (e - geoOrigin.e) * SCENE_SCALE,
    z: -(n - geoOrigin.n) * SCENE_SCALE
  };
}

function isUTM(x, y) {
  return Math.abs(x) > 180 || Math.abs(y) > 180;
}

function wgs84ToUTM(lon, lat) {
  // Approximation Mercator sphérique → mètres
  return {
    e: (lon + 180) / 360 * 40075017,
    n: Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 111320
  };
}

function anyToScene(cx, cy) {
  if (isUTM(cx, cy)) {
    if (!geoOrigin) setOrigin(cx, cy);
    return utmToScene(cx, cy);
  } else {
    const m = wgs84ToUTM(cx, cy);
    if (!geoOrigin) setOrigin(m.e, m.n);
    return utmToScene(m.e, m.n);
  }
}
