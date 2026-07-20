// LOADER GEOTIFF
// ══════════════════════════════════════════════════════════
function showLoader(msg){
  const lt=document.getElementById('loader-text'), ld=document.getElementById('loader');
  if(lt) lt.textContent=msg; if(ld) ld.classList.add('visible');
}
function hideLoader(){
  const ld=document.getElementById('loader'); if(ld) ld.classList.remove('visible');
}
function sigStatus(msg,ok=true){
  const el=document.getElementById('sig-status');
  if(!el) return; // panel SIG absent (version exportée)
  el.style.color=ok?'rgba(100,255,140,.85)':'rgba(255,120,100,.85)';
  el.textContent=msg;
}
function markLoaded(id){ const el=document.getElementById(id); if(el) el.classList.add('loaded'); }

function dismissEmpty(){
  const s=document.getElementById('empty-screen');
  if(!s) return;
  s.classList.add('hidden');
  setTimeout(()=>s.style.display='none',900);
}

async function loadGeoTIFF(input) {
  const file=input.files[0]; if(!file) return;
  showLoader('Lecture du GeoTIFF…');
  sigStatus('⏳ Lecture MNT…');
  try {
    const buf  = await file.arrayBuffer();
    showLoader('Décodage raster…');
    const tiff  = await GeoTIFF.fromArrayBuffer(buf);
    const image = await tiff.getImage();
    const bbox  = image.getBoundingBox(); // [minE,minN,maxE,maxN]
    const imgW  = image.getWidth();
    const imgH  = image.getHeight();
    const [minE,minN,maxE,maxN] = bbox;
    console.log('GeoTIFF bbox UTM:', {minE,minN,maxE,maxN});
    console.log('Image size:', imgW, '×', imgH);

    // Fixe le référentiel sur le coin SW du MNT
    setOrigin(minE, minN);

    showLoader('Extraction des altitudes…');
    const rasters = await image.readRasters({ interleave:true });
    let minAlt=Infinity, maxAlt=-Infinity;
    for(let i=0;i<rasters.length;i++){
      const v=rasters[i];
      if(isFinite(v)&&v>-9000){ if(v<minAlt)minAlt=v; if(v>maxAlt)maxAlt=v; }
    }

    // ── Lissage Gaussien 3×3 (atténue les marches d'escalier du MNT 30m) ──
    showLoader('Lissage du MNT…');
    await new Promise(r=>setTimeout(r,20));
    function gaussSmooth(data, w, h, passes=3) {
      // Noyau Gaussien 3×3 : [1,2,1 / 2,4,2 / 1,2,1] / 16
      const K = [1,2,1, 2,4,2, 1,2,1];
      let d = Float32Array.from(data);
      for (let p=0; p<passes; p++) {
        const out = new Float32Array(d.length);
        for (let y=0; y<h; y++) {
          for (let x=0; x<w; x++) {
            let sum=0, wsum=0, ki=0;
            for (let dy=-1; dy<=1; dy++) {
              for (let dx=-1; dx<=1; dx++) {
                const nx=x+dx, ny=y+dy;
                const w2 = K[ki++];
                if (nx>=0&&nx<w&&ny>=0&&ny<h) {
                  const v=d[ny*w+nx];
                  if (isFinite(v)&&v>-9000) { sum+=v*w2; wsum+=w2; }
                }
              }
            }
            out[y*w+x] = wsum>0 ? sum/wsum : d[y*w+x];
          }
        }
        d = out;
      }
      return d;
    }
    const smoothed = gaussSmooth(rasters, imgW, imgH, 3);

    // ── Suréchantillonnage bilinéaire ×4 (88×48 → 352×192) ──
    showLoader('Suréchantillonnage ×4…');
    await new Promise(r=>setTimeout(r,20));
    function upsample(data, w, h, scale) {
      const nw = Math.round(w*scale), nh = Math.round(h*scale);
      const out = new Float32Array(nw*nh);
      for (let y=0; y<nh; y++) {
        for (let x=0; x<nw; x++) {
          const fx = (x/(nw-1))*(w-1), fy = (y/(nh-1))*(h-1);
          const x0=Math.floor(fx), x1=Math.min(w-1,x0+1);
          const y0=Math.floor(fy), y1=Math.min(h-1,y0+1);
          const tx=fx-x0, ty=fy-y0;
          const v00=data[y0*w+x0], v10=data[y0*w+x1];
          const v01=data[y1*w+x0], v11=data[y1*w+x1];
          out[y*nw+x] = v00*(1-tx)*(1-ty)+v10*tx*(1-ty)+v01*(1-tx)*ty+v11*tx*ty;
        }
      }
      return { data:out, w:nw, h:nh };
    }
    const up = upsample(smoothed, imgW, imgH, 4);
    // Un 2e lissage léger après suréchantillonnage pour supprimer les artefacts
    const finalData = gaussSmooth(up.data, up.w, up.h, 1);
    const finalW = up.w, finalH = up.h;

    // Recalcule min/max sur données lissées
    let minAlt2=Infinity, maxAlt2=-Infinity;
    for(let i=0;i<finalData.length;i++){
      const v=finalData[i];
      if(isFinite(v)&&v>-9000){ if(v<minAlt2)minAlt2=v; if(v>maxAlt2)maxAlt2=v; }
    }

    const scSW = utmToScene(minE, minN);
    const scNE = utmToScene(maxE, maxN);
    const ext  = { minX:scSW.x, maxX:scNE.x, minZ:scNE.z, maxZ:scSW.z };
    console.log('Emprise scène:', ext);
    console.log('Centre scène: cx=', (ext.minX+ext.maxX)/2, 'cz=', (ext.minZ+ext.maxZ)/2);

    showLoader('Construction du terrain 3D…');
    await new Promise(r=>setTimeout(r,30));
    buildTerrainFromRaster(finalW, finalH, finalData, minAlt2, maxAlt2, ext);
    revealSky();
    dismissEmpty();

    // Adapte le frustum des caméras à l'emprise
    const diag = Math.sqrt(Math.pow((ext.maxX-ext.minX),2)+Math.pow((ext.maxZ-ext.minZ),2));
    aerialCam.far = diag * 4; aerialCam.updateProjectionMatrix();
    fpsCam.far    = Math.max(5000, diag * 2); fpsCam.updateProjectionMatrix();
    sun.shadow.camera.left   = -diag * 0.6; sun.shadow.camera.right = diag * 0.6;
    sun.shadow.camera.top    =  diag * 0.6; sun.shadow.camera.bottom = -diag * 0.6;
    sun.shadow.camera.far    = diag * 3;    sun.shadow.needsUpdate = true;
    // Recentre mapCam sur l'emprise du terrain
    const halfW = (ext.maxX - ext.minX) / 2 * 1.1;
    const halfH = (ext.maxZ - ext.minZ) / 2 * 1.1;
    mapCam.left = -halfW; mapCam.right = halfW;
    mapCam.top  =  halfH; mapCam.bottom = -halfH;
    mapCam.updateProjectionMatrix();

    sigStatus(`✓ MNT chargé\nSource: ${imgW}×${imgH} px (${Math.round((maxE-minE)/imgW)}m/px)\nTraité: ${finalW}×${finalH} px | ${Math.round(minAlt2)}–${Math.round(maxAlt2)} m\nEmprise ${Math.round((maxE-minE)/1000)}×${Math.round((maxN-minN)/1000)} km`);
    markLoaded('btn-tif');
    document.getElementById('story-chapter').textContent='MNT chargé — ajoutez le parcours et les couches';

    // Si parcours ou POI déjà chargés avant le MNT → les recaler sur le terrain
    if (pathPoints.length > 1) {
      buildPath(pathPoints); // buildPath recalcule getAltAt pour chaque point
      const sigEl = document.getElementById('sig-status');
      sigStatus((sigEl ? sigEl.textContent : '') + '\n(parcours recalé)');
    }
    if (poiData.length > 0) {
      poiData.forEach(p => { p.y = getAltAt(p.x, p.z); });
      buildPOIMarkers();
    }

    hideLoader();
  } catch(err) {
    hideLoader();
    sigStatus('✗ MNT: '+err.message, false);
    console.error(err);
  }
}

// ══════════════════════════════════════════════════════════
// CHARGEURS GEOJSON
// ══════════════════════════════════════════════════════════
function loadParcours(input){
  const file=input.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const g=JSON.parse(e.target.result);
      let coords=[];
      if(g.type==='FeatureCollection') g.features.forEach(f=>{ if(f.geometry&&f.geometry.type==='LineString') coords=f.geometry.coordinates; });
      else if(g.type==='Feature'&&g.geometry.type==='LineString') coords=g.geometry.coordinates;
      if(!coords.length) throw new Error('Aucune LineString trouvée');
      if(!geoOrigin){ const c=coords[0]; if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]); else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);} }
      pathPoints=coords.map(c=>{ const s=anyToScene(c[0],c[1]); const y=getAltAt(s.x,s.z)+0.2; return new THREE.Vector3(s.x,y,s.z); });
      buildPath(pathPoints);
      pathT=0;
      dismissEmpty();
      sigStatus('✓ Parcours: '+coords.length+' points\nLongueur: '+Math.round(pathTotalLength)+'m');
      markLoaded('btn-parcours');
      document.getElementById('story-chapter').textContent='Parcours chargé — appuyez sur Marcher';
    }catch(err){sigStatus('✗ Parcours: '+err.message,false);}
  };
  r.readAsText(file);
}

function loadPOI(input){
  const file=input.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const g=JSON.parse(e.target.result);
      if(!geoOrigin&&g.features.length){
        const c=g.features[0].geometry.coordinates;
        if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]); else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}
      }
      poiData=g.features.map(f=>{
        const c=f.geometry.coordinates, s=anyToScene(c[0],c[1]);
        const y=getAltAt(s.x,s.z);
        return {
          name:      f.properties.name||'Point',
          desc:      f.properties.description||f.properties.desc||'',
          audio_text:f.properties.audio_text||f.properties.description||'',
          x: s.x, z: s.z, y,
          props: f.properties
        };
      });
      buildPOIMarkers();
      narratives.length=0;
      sigStatus('✓ '+poiData.length+' POI chargés');
      markLoaded('btn-poi');
      updateDefaultViewCenter();
    }catch(err){sigStatus('✗ POI: '+err.message,false);}
  };
  r.readAsText(file);
}

function loadBati(input){
  const file=input.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const g=JSON.parse(e.target.result);
      if(g.type!=='FeatureCollection') throw new Error('Pas une FeatureCollection');
      // Vider l'ancien bâti
      while(batiGroup.children.length) batiGroup.remove(batiGroup.children[0]);
      buildingMeshes=[];
      let count=0;
      g.features.forEach(f=>{
        if(!f.geometry) return;
        let rings=[];
        if(f.geometry.type==='Polygon') rings=[f.geometry.coordinates[0]];
        else if(f.geometry.type==='MultiPolygon') f.geometry.coordinates.forEach(poly=>rings.push(poly[0]));
        rings.forEach(ring=>{
          if(!geoOrigin){ const c=ring[0]; if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]); else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);} }
          const sr=ring.slice(0,-1).map(c=>{ const s=anyToScene(c[0],c[1]); return [s.x,s.z]; });
          if(sr.length<3) return;
          const props=Object.assign({name:'Bâtiment'},f.properties||{});
          const hM = parseFloat(props.height||props.hauteur||(props['building:levels']&&props['building:levels']*3.2)||DEFAULT_HEIGHT_M)||DEFAULT_HEIGHT_M;
          extrudePolygon(sr, hM, props);
          count++;
        });
      });
      sigStatus('✓ '+count+' bâtiments extrudés');
      markLoaded('btn-bati');
      updateDefaultViewCenter();
    }catch(err){sigStatus('✗ Bâti: '+err.message,false);}
  };
  r.readAsText(file);
}
