// TEXTURE SATELLITE (GeoTIFF RGB)
// ══════════════════════════════════════════════════════════
let satTexture = null;

async function loadSatellite(input) {
  const file = input.files[0]; if (!file) return;
  showLoader('Lecture GeoTIFF satellite…');
  sigStatus('⏳ Lecture satellite…');
  try {
    const buf   = await file.arrayBuffer();
    showLoader('Décodage image…');
    const tiff  = await GeoTIFF.fromArrayBuffer(buf);
    const image = await tiff.getImage();

    const bbox  = image.getBoundingBox(); // [minE, minN, maxE, maxN]
    const imgW  = image.getWidth();
    const imgH  = image.getHeight();
    const [minE, minN, maxE, maxN] = bbox;
    const nbBands = image.getSamplesPerPixel();

    // Vérifie qu'on a bien une image couleur (3 ou 4 bandes)
    if (nbBands < 3) throw new Error(`Image à ${nbBands} bande(s) — attendu RGB (3 bandes). Exportez en couleur depuis QGIS.`);

    showLoader('Extraction RGB…');
    await new Promise(r => setTimeout(r, 20));

    // Lit les 3 bandes R, G, B séparément
    const rasters = await image.readRasters({ interleave: false });
    const R = rasters[0], G = rasters[1], B = rasters[2];

    // Construit un canvas RGBA pleine résolution
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width  = imgW;
    rawCanvas.height = imgH;
    const ctx = rawCanvas.getContext('2d');
    const imgData = ctx.createImageData(imgW, imgH);
    const d = imgData.data;

    // Détermine si les valeurs sont uint8 (0-255) ou uint16 (0-65535)
    const maxVal = Math.max(...Array.from(R.slice(0, 100)));
    const scale  = maxVal > 255 ? 1/256 : 1; // normalise uint16 → uint8

    for (let i = 0; i < imgW * imgH; i++) {
      d[i*4]   = Math.min(255, Math.round(R[i] * scale));
      d[i*4+1] = Math.min(255, Math.round(G[i] * scale));
      d[i*4+2] = Math.min(255, Math.round(B[i] * scale));
      d[i*4+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // Sur mobile, réduit la résolution à 1024px max pour économiser la VRAM
    const maxSatSize = _mobile ? 1024 : 4096;
    let satCanvas = rawCanvas;
    if (imgW > maxSatSize || imgH > maxSatSize) {
      const ratio = Math.min(maxSatSize / imgW, maxSatSize / imgH);
      const rw = Math.round(imgW * ratio), rh = Math.round(imgH * ratio);
      satCanvas = document.createElement('canvas');
      satCanvas.width = rw; satCanvas.height = rh;
      satCanvas.getContext('2d').drawImage(rawCanvas, 0, 0, rw, rh);
      showLoader(`Satellite réduit à ${rw}×${rh}px pour mobile…`);
      await new Promise(r => setTimeout(r, 20));
    }

    showLoader('Application sur le terrain…');
    await new Promise(r => setTimeout(r, 20));

    // Calcule l'emprise satellite en coordonnées scène
    if (!geoOrigin) setOrigin(minE, minN);
    const scSW = utmToScene(minE, minN);
    const scNE = utmToScene(maxE, maxN);
    const satExt = { minX: scSW.x, maxX: scNE.x, minZ: scNE.z, maxZ: scSW.z };

    // Crée la texture Three.js
    if (satTexture) satTexture.dispose();
    satTexture = new THREE.CanvasTexture(satCanvas);
    satTexture.wrapS = satTexture.wrapT = THREE.ClampToEdgeWrapping;
    satTexture.minFilter = THREE.LinearFilter;
    satTexture.magFilter = THREE.LinearFilter;
    setAnisotropy(satTexture);

    // Cale la texture sur l'emprise du terrain
    if (terrainMesh) {
      const terrExt = altGrid ? altGrid.ext : satExt;
      const terrW = terrExt.maxX - terrExt.minX;
      const terrH = terrExt.maxZ - terrExt.minZ;
      const satW  = satExt.maxX  - satExt.minX;
      const satH  = satExt.maxZ  - satExt.minZ;
      satTexture.repeat.set(terrW / satW, terrH / satH);
      satTexture.offset.set((terrExt.minX - satExt.minX) / satW, (terrExt.minZ - satExt.minZ) / satH);
    }

    // Applique via le gestionnaire — satellite prend la priorité sur OS
    applyTerrainTexture();

    const statusMsg = `✓ Satellite appliqué\n${imgW}×${imgH}px | ${nbBands} bandes\n`
      + `Emprise: ${Math.round((maxE-minE)/1000)}×${Math.round((maxN-minN)/1000)}km`
      + (osTexture ? '\n(OS visible en fallback si retiré)' : '');
    sigStatus(statusMsg);

    markLoaded('btn-sat');
    hideLoader();

  } catch(err) {
    hideLoader();
    sigStatus('✗ Satellite: ' + err.message, false);
    console.error(err);
  }
}

// Bouton pour revenir à la texture procédurale / OS
function removeSatellite() {
  if (!terrainMesh) return;
  if (satTexture) { satTexture.dispose(); satTexture = null; }
  applyTerrainTexture(); // revient à OS ou procédural
  const btnSat = document.getElementById('btn-sat');
  if (btnSat) btnSat.classList.remove('loaded');
  sigStatus('Satellite retiré — ' + (osTexture ? 'OS active' : 'texture procédurale'));
}

let narrAudio = null; // HTMLAudioElement pour MP3
let narrPoints  = [];        // points de déclenchement chargés
const DEFAULT_TRIGGER_RADIUS = 30;

function narrRadiusToScene(meters) {
  return meters; // SCENE_SCALE=1 donc 1m=1 unité
}