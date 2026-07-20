// BÂTI EXTRUDÉ
// ══════════════════════════════════════════════════════════
// Hauteur par défaut en mètres réels — convertie en unités scène dans le code
const DEFAULT_HEIGHT_M = 4.5; // mètres réels
const batiGroup = new THREE.Group();
scene.add(batiGroup);

function buildingWallMat(type) {
  // Murs : couleur distincte par type, texture pierre en overlay léger
  // On utilise deux passes : fond couleur + texture en multiply
  const colors = {
    'Religieux':   0xe8d090,  // or clair
    'Monument':    0xddc878,  // or foncé
    'Résidentiel': 0xc8a870,  // sable chaud
    'Commercial':  0xb09050,  // brun
    'Thermal':     0xa0b8c0,  // gris bleuté
    'Funéraire':   0x808888,  // gris froid
    'Artisanal':   0xb08840,  // ocre
    'Spectacle':   0xd0b060,  // ambre
  };
  const c = colors[type] || 0xc8a868;
  // Matériau sans map — couleur pure bien distincte
  return new THREE.MeshLambertMaterial({ color: c });
}

function buildingRoofMat(type) {
  // Toit : couleur selon type, texture légère
  const roofColors = {
    'Religieux':   0xc0a060,
    'Funéraire':   0x908070,
    'Thermal':     0xb0a878,
  };
  return new THREE.MeshLambertMaterial({
    map: roofTex,
    color: roofColors[type] || 0xb8985c,
  });
}

function extrudePolygon(ring, height, props) {
  const n = ring.length;
  const cx = ring.reduce((s,p)=>s+p[0],0)/n;
  const cz = ring.reduce((s,p)=>s+p[1],0)/n;
  const groundY = getAltAt(cx, cz);
  const floorY  = groundY;

  const wallMat = buildingWallMat(props.type||'');
  const rfMat   = buildingRoofMat(props.type||'');
  const grp = new THREE.Group();

  // ── Murs : BoxGeometry mince par arête ─────────────────
  const WALL_THICK = 0.3; // 30cm d'épaisseur
  for (let i=0; i<n; i++) {
    const j = (i+1)%n;
    const x0=ring[i][0], z0=ring[i][1];
    const x1=ring[j][0], z1=ring[j][1];
    const segLen = Math.sqrt(Math.pow((x1-x0),2)+Math.pow((z1-z0),2));
    if (segLen < 0.01) continue;

    const geo = new THREE.BoxGeometry(segLen, height, WALL_THICK);
    const mx  = (x0+x1)/2;
    const mz  = (z0+z1)/2;
    // Box a sa longueur sur X par défaut. On veut aligner cet axe X
    // sur la direction du segment (x1-x0, z1-z0) dans le plan XZ.
    // L'angle entre l'axe X du monde et la direction du segment :
    const angle = -Math.atan2(z1-z0, x1-x0);

    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(mx, floorY + height/2, mz);
    mesh.rotation.y = angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {isBuilding:true, props};
    grp.add(mesh);
    buildingMeshes.push(mesh);
  }

  // ── Toit ───────────────────────────────────────────────
  const roofVerts=[], roofIdx=[], roofUVs=[];
  roofVerts.push(cx, floorY+height+0.05, cz); roofUVs.push(0.5,0.5);
  for(let i=0;i<n;i++){
    roofVerts.push(ring[i][0], floorY+height+0.05, ring[i][1]);
    roofUVs.push((ring[i][0]-cx)/20+0.5, (ring[i][1]-cz)/20+0.5);
  }
  for(let i=0;i<n;i++) roofIdx.push(0, 1+i, 1+(i+1)%n);
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofVerts,3));
  roofGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(roofUVs,2));
  roofGeo.setIndex(roofIdx);
  roofGeo.computeVertexNormals();
  const roofMesh = new THREE.Mesh(roofGeo, rfMat);
  roofMesh.castShadow = true;
  roofMesh.userData = {isBuilding:true, props};
  grp.add(roofMesh);
  buildingMeshes.push(roofMesh);

  // ── Sol ────────────────────────────────────────────────
  const floorVerts=[], floorIdx=[], floorUVs=[];
  floorVerts.push(cx, floorY+0.02, cz); floorUVs.push(0.5,0.5);
  for(let i=0;i<n;i++){
    floorVerts.push(ring[i][0], floorY+0.02, ring[i][1]);
    floorUVs.push((ring[i][0]-cx)/20+0.5, (ring[i][1]-cz)/20+0.5);
  }
  for(let i=0;i<n;i++) floorIdx.push(0, 1+(i+1)%n, 1+i);
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorVerts,3));
  floorGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(floorUVs,2));
  floorGeo.setIndex(floorIdx);
  floorGeo.computeVertexNormals();
  grp.add(new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({color:0x8a8060})));

  batiGroup.add(grp);
}
