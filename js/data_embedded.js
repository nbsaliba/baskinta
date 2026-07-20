// ── Fonctions _data : versions acceptant un objet GeoJSON directement ──
// (utilisées par le loader embarqué ET pour stocker les raw)

async function loadGeoTIFF_data(arrayBuffer, originOverride) {
  try {
    showLoader('Chargement MNT embarqué…');
    const tiff  = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const bbox  = image.getBoundingBox();
    const imgW  = image.getWidth(), imgH = image.getHeight();
    const [minE,minN,maxE,maxN] = bbox;
    if (originOverride) { geoOrigin = originOverride; }
    else { setOrigin(minE, minN); }
    showLoader('Extraction altitudes…');
    const rasters = await image.readRasters({interleave:true});
    let minAlt=Infinity, maxAlt=-Infinity;
    for(let i=0;i<rasters.length;i++){const v=rasters[i];if(isFinite(v)&&v>-9000){if(v<minAlt)minAlt=v;if(v>maxAlt)maxAlt=v;}}
    function gaussSmooth(data,w,h,passes=3){const K=[1,2,1,2,4,2,1,2,1];let d=Float32Array.from(data);for(let p=0;p<passes;p++){const out=new Float32Array(d.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,wsum=0,ki=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,w2=K[ki++];if(nx>=0&&nx<w&&ny>=0&&ny<h){const v=d[ny*w+nx];if(isFinite(v)&&v>-9000){sum+=v*w2;wsum+=w2;}}}out[y*w+x]=wsum>0?sum/wsum:d[y*w+x];}d=out;}return d;}
    function upsample(data,w,h,scale){const nw=Math.round(w*scale),nh=Math.round(h*scale),out=new Float32Array(nw*nh);for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const fx=(x/(nw-1))*(w-1),fy=(y/(nh-1))*(h-1),x0=Math.floor(fx),x1=Math.min(w-1,x0+1),y0=Math.floor(fy),y1=Math.min(h-1,y0+1),tx=fx-x0,ty=fy-y0;out[y*nw+x]=data[y0*w+x0]*(1-tx)*(1-ty)+data[y0*w+x1]*tx*(1-ty)+data[y1*w+x0]*(1-tx)*ty+data[y1*w+x1]*tx*ty;}return{data:out,w:nw,h:nh};}
    const smoothed=gaussSmooth(rasters,imgW,imgH,3);
    const up=upsample(smoothed,imgW,imgH,4);
    const finalData=gaussSmooth(up.data,up.w,up.h,1);
    let minAlt2=Infinity,maxAlt2=-Infinity;
    for(let i=0;i<finalData.length;i++){const v=finalData[i];if(isFinite(v)&&v>-9000){if(v<minAlt2)minAlt2=v;if(v>maxAlt2)maxAlt2=v;}}
    const scSW=utmToScene(minE,minN),scNE=utmToScene(maxE,maxN);
    const ext={minX:scSW.x,maxX:scNE.x,minZ:scNE.z,maxZ:scSW.z};
    buildTerrainFromRaster(up.w,up.h,finalData,minAlt2,maxAlt2,ext);
    revealSky(); dismissEmpty();
    if(pathPoints.length>1){buildPath(pathPoints);}
    if(poiData.length>0){poiData.forEach(p=>{p.y=getAltAt(p.x,p.z);});buildPOIMarkers();}
    hideLoader();
  } catch(e){hideLoader();console.error('MNT embarqué:',e);}
}

function loadParcours_data(g) {
  if(!g||!g.features) return;
  _rawParcours = g;
  let coords=[];
  g.features.forEach(f=>{if(f.geometry&&f.geometry.type==='LineString')coords=f.geometry.coordinates;});
  if(!coords.length) return;
  if(!geoOrigin){const c=coords[0];if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
  pathPoints=coords.map(c=>{const s=anyToScene(c[0],c[1]);return new THREE.Vector3(s.x,.2,s.z);});
  buildPath(pathPoints); pathT=0; dismissEmpty();
  markLoaded('btn-parcours');
}

function loadPOI_data(g) {
  if(!g||!g.features) return;
  _rawPOI = g;
  if(!geoOrigin&&g.features.length){const c=g.features[0].geometry.coordinates;if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
  poiData=g.features.map(f=>{const c=f.geometry.coordinates,s=anyToScene(c[0],c[1]),y=getAltAt(s.x,s.z);return{name:f.properties.name||'Point',desc:f.properties.description||f.properties.desc||'',audio_text:f.properties.audio_text||f.properties.description||'',x:s.x,z:s.z,y,props:f.properties};});
  buildPOIMarkers(); narratives.length=0;
  markLoaded('btn-poi');
  updateDefaultViewCenter();
}

function loadNarrations_data(g) {
  if(!g||!g.features) return;
  _rawNarrations = g;
  if(!geoOrigin&&g.features.length){const c=g.features[0].geometry.coordinates;if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
  narrPoints=g.features.filter(f=>f.geometry&&f.geometry.type==='Point').map(f=>{
    const c=f.geometry.coordinates,sc=anyToScene(c[0],c[1]),p=f.properties||{};
    const radiusM=parseFloat(p.trigger_radius||DEFAULT_TRIGGER_RADIUS);
    return{x:sc.x,z:sc.z,radiusScene:narrRadiusToScene(radiusM),radiusM,name:p.name||'',texte:p.texte||p.text||p.description||'',audio_text:p.audio_text||p.texte||p.text||'',audio_file:p.audio_file||null,audioBlobURL:null,delai:parseFloat(p.delai||0),categorie:p.categorie||'',triggered:false};
  });
  narrPoints.forEach(n=>{const rg=new THREE.RingGeometry(n.radiusScene-.05,n.radiusScene,24);rg.rotateX(-Math.PI/2);const rm=new THREE.Mesh(rg,new THREE.MeshBasicMaterial({color:0xff6600,transparent:true,opacity:.4}));rm.position.set(n.x,getAltAt(n.x,n.z)+.15,n.z);scene.add(rm);n.debugMesh=rm;});
  markLoaded('btn-narr');
}

function loadBati_data(g) {
  if(!g||!g.features) return;
  _rawBati = g;
  while(batiGroup.children.length)batiGroup.remove(batiGroup.children[0]);
  buildingMeshes=[];
  g.features.forEach(f=>{
    if(!f.geometry)return;
    let rings=[];
    if(f.geometry.type==='Polygon')rings=[f.geometry.coordinates[0]];
    else if(f.geometry.type==='MultiPolygon')f.geometry.coordinates.forEach(p=>rings.push(p[0]));
    rings.forEach(ring=>{
      if(!geoOrigin){const c=ring[0];if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
      const sr=ring.slice(0,-1).map(c=>{const s=anyToScene(c[0],c[1]);return[s.x,s.z];});
      if(sr.length<3)return;
      const props=Object.assign({name:'Bâtiment'},f.properties||{});
      const hM=parseFloat(props.height||props.hauteur||(props['building:levels']&&props['building:levels']*3.2)||DEFAULT_HEIGHT_M)||DEFAULT_HEIGHT_M;
      extrudePolygon(sr,hM,props);
    });
  });
  markLoaded('btn-bati');
  updateDefaultViewCenter();
}

function loadOS_data(g) {
  if(!g||!g.features) return;
  _rawOS = g;
  while(osGroup.children.length)osGroup.remove(osGroup.children[0]);
  if(!geoOrigin&&g.features.length){const c=g.features[0].geometry.coordinates[0][0];if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  const converted=g.features.map(f=>{
    if(!f.geometry)return null;
    const rings=f.geometry.type==='Polygon'?[f.geometry.coordinates[0]]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates.map(p=>p[0]):[];
    const scRings=rings.map(ring=>ring.map(c=>{const s=anyToScene(c[0],c[1]);if(s.x<minX)minX=s.x;if(s.x>maxX)maxX=s.x;if(s.z<minZ)minZ=s.z;if(s.z>maxZ)maxZ=s.z;return[s.x,s.z];}));
    return{properties:f.properties,geometry:{type:f.geometry.type,coordinates:scRings}};
  }).filter(Boolean);
  buildOSTexture(converted,{minX,maxX,minZ,maxZ});
  converted.forEach(f=>{const type=normalizeOSType(f.properties),style=type?OS_STYLE[type]:null;if(!style)return;f.geometry.coordinates.forEach(ring=>{if(type==='eau')makeWaterPlane(ring);else if(style.treeColor)plantTrees(ring,style);});});
  markLoaded('btn-os');
}

async function loadSatellite_data(arrayBuffer) {
  try {
    const tiff  = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const bbox  = image.getBoundingBox();
    const imgW  = image.getWidth(), imgH = image.getHeight();
    const [minE,minN,maxE,maxN] = bbox;
    const nbBands = image.getSamplesPerPixel();
    if (nbBands < 3) throw new Error(`${nbBands} bande(s) — attendu RGB`);
    const rasters = await image.readRasters({ interleave:false });
    const R=rasters[0], G=rasters[1], B=rasters[2];
    const satCanvas=document.createElement('canvas');
    satCanvas.width=imgW; satCanvas.height=imgH;
    const ctx=satCanvas.getContext('2d');
    const imgData=ctx.createImageData(imgW,imgH); const d=imgData.data;
    const maxVal=Math.max(...Array.from(R.slice(0,100)));
    const scale=maxVal>255?1/256:1;
    for(let i=0;i<imgW*imgH;i++){d[i*4]=Math.min(255,Math.round(R[i]*scale));d[i*4+1]=Math.min(255,Math.round(G[i]*scale));d[i*4+2]=Math.min(255,Math.round(B[i]*scale));d[i*4+3]=255;}
    ctx.putImageData(imgData,0,0);
    if(!geoOrigin)setOrigin(minE,minN);
    const scSW=utmToScene(minE,minN),scNE=utmToScene(maxE,maxN);
    const satExt={minX:scSW.x,maxX:scNE.x,minZ:scNE.z,maxZ:scSW.z};
    if(satTexture)satTexture.dispose();
    satTexture=new THREE.CanvasTexture(satCanvas);
    satTexture.wrapS=satTexture.wrapT=THREE.ClampToEdgeWrapping;
    satTexture.minFilter=satTexture.magFilter=THREE.LinearFilter;
    setAnisotropy(satTexture);
    if(terrainMesh){
      const terrExt=altGrid?altGrid.ext:satExt;
      const terrW=terrExt.maxX-terrExt.minX,terrH=terrExt.maxZ-terrExt.minZ;
      const satW=satExt.maxX-satExt.minX,satH=satExt.maxZ-satExt.minZ;
      satTexture.repeat.set(terrW/satW,terrH/satH);
      satTexture.offset.set((terrExt.minX-satExt.minX)/satW,(terrExt.minZ-satExt.minZ)/satH);
    }
    applyTerrainTexture();
    markLoaded('btn-sat');
  } catch(e){ console.error('Satellite data:',e); }
}
