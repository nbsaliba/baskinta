// PARCOURS
// ══════════════════════════════════════════════════════════
let pathMesh = null;
let pathPoints = [];
let pathTotalLength = 0;
let pathT = 0;

function buildPath(pts) {
  if (pathMesh) { scene.remove(pathMesh); pathMesh.geometry.dispose(); }
  if (pts.length < 2) return;

  // Densifie le tracé ET cale chaque point sur le terrain
  const dense = [];
  for (let i=0; i<pts.length-1; i++) {
    const a = pts[i], b = pts[i+1];
    const segLen = Math.sqrt(Math.pow((b.x-a.x),2)+Math.pow((b.z-a.z),2));
    const steps = Math.max(1, Math.ceil(segLen / 0.1)); // point tous les 0.1u (~2m)
    for (let s=0; s<steps; s++) {
      const u = s/steps;
      const x = a.x + (b.x-a.x)*u;
      const z = a.z + (b.z-a.z)*u;
      dense.push(new THREE.Vector3(x, getAltAt(x,z)+0.08, z));
    }
  }
  // Dernier point
  const last = pts[pts.length-1];
  dense.push(new THREE.Vector3(last.x, getAltAt(last.x,last.z)+0.08, last.z));

  // pathPoints devient les points densifiés — getPosOnPath s'en servira
  pathPoints = dense;

  pathTotalLength = 0;
  for (let i=1; i<pathPoints.length; i++) pathTotalLength += pathPoints[i].distanceTo(pathPoints[i-1]);

  const curve = new THREE.CatmullRomCurve3(pathPoints);

  // Chemin plat : ruban au sol, pas un tube — plus réaliste et sans extrémités énormes
  const pathWidth = 5; // 5m réels
  const segments  = Math.min(pathPoints.length*2, 800);
  const positions = [], uvs2 = [], indices2 = [], normals2 = [];

  const pts2 = curve.getPoints(segments);
  for (let i=0; i<pts2.length; i++) {
    const p = pts2[i];
    // Direction tangente
    const prev = pts2[Math.max(0,i-1)];
    const next = pts2[Math.min(pts2.length-1,i+1)];
    const tx = next.x-prev.x, tz = next.z-prev.z;
    const tlen = Math.sqrt(tx*tx+tz*tz)||1;
    // Perpendiculaire au sol
    const rx = -tz/tlen * pathWidth/2;
    const rz =  tx/tlen * pathWidth/2;
    const y = p.y + 0.01; // légèrement au-dessus du terrain
    positions.push(p.x-rx, y, p.z-rz);
    positions.push(p.x+rx, y, p.z+rz);
    uvs2.push(0, i/pts2.length);
    uvs2.push(1, i/pts2.length);
    if (i < pts2.length-1) {
      const b2 = i*2;
      indices2.push(b2,b2+1,b2+2, b2+1,b2+3,b2+2);
    }
    normals2.push(0,1,0, 0,1,0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals2,3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs2,2));
  geo.setIndex(indices2);

  const sz=128, c=document.createElement('canvas'); c.width=c.height=sz;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#d8c078'; ctx.fillRect(0,0,sz,sz);
  const pg=ctx.createLinearGradient(0,0,sz,0);
  pg.addColorStop(0,'rgba(200,175,100,0)'); pg.addColorStop(.5,'rgba(235,215,160,.8)'); pg.addColorStop(1,'rgba(200,175,100,0)');
  ctx.fillStyle=pg; ctx.fillRect(0,0,sz,sz);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1, Math.ceil(pathTotalLength/2)); setAnisotropy(t);

  pathMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({map:t, color:0xe8d898, side:THREE.DoubleSide}));
  pathMesh.receiveShadow = true;
  scene.add(pathMesh);
}

// Point de vue par défaut quand aucun parcours n'est chargé
// Se centre automatiquement sur le bâti ou les POI si présents
let defaultViewCenter = new THREE.Vector3(0, 0, 0);
function updateDefaultViewCenter() {
  const pts = [];
  buildingMeshes.forEach(m => pts.push(m.position));
  poiObjects.forEach(o => pts.push(o.marker.position));
  if (pts.length === 0) return;
  const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
  const cz = pts.reduce((s,p)=>s+p.z,0)/pts.length;
  defaultViewCenter.set(cx, getAltAt(cx,cz), cz);
}

function getPosOnPath(t01) {
  if (pathPoints.length < 2) {
    return new THREE.Vector3(
      defaultViewCenter.x,
      getAltAt(defaultViewCenter.x, defaultViewCenter.z) + 0.08,
      defaultViewCenter.z
    );
  }
  const target = t01 * pathTotalLength;
  let acc = 0;
  for (let i=1; i<pathPoints.length; i++){
    const seg = pathPoints[i].distanceTo(pathPoints[i-1]);
    if (acc+seg >= target){
      const u = (target-acc)/seg;
      // Interpolation directe — Y déjà calé sur le terrain dans buildPath
      return new THREE.Vector3().lerpVectors(pathPoints[i-1], pathPoints[i], u);
    }
    acc += seg;
  }
  return pathPoints[pathPoints.length-1].clone();
}

function getDirOnPath(t01) {
  if (pathPoints.length < 2) return new THREE.Vector3(0,0,-1);
  const a = getPosOnPath(Math.max(0,   t01-0.004));
  const b = getPosOnPath(Math.min(1,   t01+0.004));
  return b.clone().sub(a).normalize();
}
