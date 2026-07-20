// ── PATCH_EXPORT_START ──────────────────────────────────────────────────────
const _origLoadSatellite = loadSatellite;
async function loadSatellite(input) {
  const file=input.files[0]; if(!file) return;
  _rawSAT = await file.arrayBuffer();
  const clone = _rawSAT.slice(0);
  showLoader('Lecture GeoTIFF satellite…');
  sigStatus('⏳ Lecture satellite…');
  try {
    await loadSatellite_data(clone);
    const tiff=await GeoTIFF.fromArrayBuffer(_rawSAT.slice(0));
    const img=await tiff.getImage();
    sigStatus(`✓ Satellite chargé\n${img.getWidth()}×${img.getHeight()}px`);
    markLoaded('btn-sat');
    hideLoader();
  } catch(e){ hideLoader(); sigStatus('✗ Satellite: '+e.message,false); }
}
const _origLoadParcours=loadParcours;
function loadParcours(input){const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=e=>{try{const g=JSON.parse(e.target.result);_rawParcours=g;loadParcours_data(g);sigStatus('✓ Parcours chargé');}catch(err){sigStatus('✗ Parcours: '+err.message,false);}};r.readAsText(file);}

const _origLoadPOI=loadPOI;
function loadPOI(input){const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=e=>{try{const g=JSON.parse(e.target.result);loadPOI_data(g);sigStatus('✓ '+poiData.length+' POI chargés');}catch(err){sigStatus('✗ POI: '+err.message,false);}};r.readAsText(file);}

const _origLoadNarrations=loadNarrations;
function loadNarrations(input){const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=e=>{try{const g=JSON.parse(e.target.result);loadNarrations_data(g);sigStatus('✓ '+narrPoints.length+' narrations chargées');}catch(err){sigStatus('✗ Narrations: '+err.message,false);}};r.readAsText(file);}

const _origLoadBati=loadBati;
function loadBati(input){const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=e=>{try{const g=JSON.parse(e.target.result);loadBati_data(g);sigStatus('✓ bâtiments chargés');}catch(err){sigStatus('✗ Bâti: '+err.message,false);}};r.readAsText(file);}

const _origLoadOS=loadOS;
function loadOS(input){const file=input.files[0];if(!file)return;const r=new FileReader();r.onload=e=>{try{const g=JSON.parse(e.target.result);loadOS_data(g);sigStatus('✓ OS chargée');}catch(err){sigStatus('✗ OS: '+err.message,false);}};r.readAsText(file);}

// Capture du MNT brut pour export autonome
const _origLoadGeoTIFF=loadGeoTIFF;
async function loadGeoTIFF(input){
  const file=input.files[0];if(!file)return;
  _rawMNT=await file.arrayBuffer();
  // Clone pour ne pas consommer le buffer
  const clone=_rawMNT.slice(0);
  await loadGeoTIFF_data(clone, null);
  sigStatus('✓ MNT chargé');markLoaded('btn-tif');
}
