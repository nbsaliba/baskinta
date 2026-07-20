// TEXTURES PROCÉDURALES
// ══════════════════════════════════════════════════════════
function makeTerrainTex() {
  const sz=512, c=document.createElement('canvas'); c.width=c.height=sz;
  const ctx=c.getContext('2d');
  const bg=ctx.createLinearGradient(0,0,sz,sz);
  bg.addColorStop(0,'#c8a560'); bg.addColorStop(.5,'#d4b470'); bg.addColorStop(1,'#bfa055');
  ctx.fillStyle=bg; ctx.fillRect(0,0,sz,sz);
  for(let i=0;i<14000;i++){
    const x=Math.random()*sz, y=Math.random()*sz, r=Math.random()*1.5+.3;
    const v=120+Math.floor(Math.random()*55);
    ctx.fillStyle=`rgba(${v+30},${v},${Math.floor(v*.6)},${Math.random()*.4+.1})`;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<22;i++){
    const x=Math.random()*sz, y=Math.random()*sz;
    const g=ctx.createRadialGradient(x,y,0,x,y,30+Math.random()*55);
    g.addColorStop(0,'rgba(80,60,35,.4)'); g.addColorStop(1,'rgba(80,60,35,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,sz,sz);
  }
  for(let i=0;i<35;i++){
    const x=Math.random()*sz, y=Math.random()*sz;
    ctx.strokeStyle=`rgba(75,55,25,${Math.random()*.2+.05})`;
    ctx.lineWidth=Math.random()*1.5+.3;
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x+(-25+Math.random()*50), y+(-25+Math.random()*50)); ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(8,8); return setAnisotropy(t);
}

function makeWallTex() {
  const sz=256, c=document.createElement('canvas'); c.width=c.height=sz;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#c9ad7e'; ctx.fillRect(0,0,sz,sz);
  const bw=32, bh=18;
  for(let row=0; row*bh<sz+bh; row++){
    const ox=(row%2)*bw/2;
    for(let col=-1; col*bw<sz+bw; col++){
      const x=col*bw+ox, y=row*bh;
      const v=-15+Math.floor(Math.random()*30);
      ctx.fillStyle=`rgba(${v>0?255:0},${v>0?255:0},${v>0?255:0},${Math.abs(v)/255*.35})`;
      ctx.fillRect(x+1,y+1,bw-2,bh-2);
      ctx.strokeStyle='rgba(60,45,25,.55)'; ctx.lineWidth=1.5;
      ctx.strokeRect(x+.75,y+.75,bw-1.5,bh-1.5);
    }
  }
  for(let i=0;i<2500;i++){
    const x=Math.random()*sz, y=Math.random()*sz;
    ctx.fillStyle=`rgba(80,60,30,${Math.random()*.12})`;
    ctx.beginPath();ctx.arc(x,y,Math.random()*1.2+.2,0,Math.PI*2);ctx.fill();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(3,1.5); return setAnisotropy(t);
}

function makeRoofTex() {
  const sz=128, c=document.createElement('canvas'); c.width=c.height=sz;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#b8985c'; ctx.fillRect(0,0,sz,sz);
  for(let i=0;i<1800;i++){
    const x=Math.random()*sz, y=Math.random()*sz;
    ctx.fillStyle=`rgba(80,55,20,${Math.random()*.18})`;
    ctx.beginPath();ctx.arc(x,y,Math.random()*2+.4,0,Math.PI*2);ctx.fill();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(4,4); return setAnisotropy(t);
}

const terrainTex = makeTerrainTex();

// ── Gestionnaire unique de texture terrain ──────────────
// Priorité : satellite > OS > procédural
// Appelé après chaque chargement de texture
function applyTerrainTexture() {
  if (!terrainMesh) return;
  if (satTexture) {
    terrainMesh.material.map = satTexture;
    terrainMesh.material.color.set(0xffffff);
  } else if (osTexture) {
    terrainMesh.material.map = osTexture;
    terrainMesh.material.color.set(0xffffff);
  } else {
    terrainMesh.material.map = terrainTex;
    terrainMesh.material.color.set(0xffffff);
  }
  terrainMesh.material.needsUpdate = true;
}
const wallTex    = makeWallTex();
const roofTex    = makeRoofTex();

// ══════════════════════════════════════════════════════════
// TERRAIN — construit depuis GeoTIFF uniquement
// ══════════════════════════════════════════════════════════
let terrainMesh = null;

// Grille altitude en mémoire pour getAltAt(x,z)
let altGrid = null; // { data, imgW, imgH, minAlt, ext }

function getAltAt(x, z) {
  if (!altGrid) return 0;
  const { data, imgW, imgH, minAlt, ext } = altGrid;
  const u  = Math.max(0, Math.min(1, (x - ext.minX) / (ext.maxX - ext.minX)));
  const v  = Math.max(0, Math.min(1, (z - ext.minZ) / (ext.maxZ - ext.minZ)));
  const fx = u * (imgW - 1);
  const fy = v * (imgH - 1);
  const x0 = Math.floor(fx), x1 = Math.min(imgW-1, x0+1);
  const y0 = Math.floor(fy), y1 = Math.min(imgH-1, y0+1);
  const tx = fx - x0, ty = fy - y0;
  const rd = (px,py) => { const a=data[py*imgW+px]; return (isFinite(a)&&a>-9000)?a:null; };
  const a00=rd(x0,y0), a10=rd(x1,y0), a01=rd(x0,y1), a11=rd(x1,y1);
  const vals=[a00,a10,a01,a11].filter(vv=>vv!==null);
  if(!vals.length) return 0;
  const fb=vals.reduce((s,vv)=>s+vv,0)/vals.length;
  const v00=a00!=null?a00:fb, v10=a10!=null?a10:fb, v01=a01!=null?a01:fb, v11=a11!=null?a11:fb;
  const alt = v00*(1-tx)*(1-ty) + v10*tx*(1-ty) + v01*(1-tx)*ty + v11*tx*ty;
  return (alt - minAlt) * SCENE_SCALE;
}

function buildTerrainFromRaster(imgW, imgH, data, minAlt, maxAlt, extScene) {
  if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); }

  altGrid = { data, imgW, imgH, minAlt, ext: extScene };

  const sx = extScene.maxX - extScene.minX;
  const sz = extScene.maxZ - extScene.minZ;
  const cx = (extScene.minX + extScene.maxX) / 2;
  const cz = (extScene.minZ + extScene.maxZ) / 2;
  const maxSegs = _mobile ? 150 : 300; // moins de géométrie sur mobile
  const segsX = Math.min(maxSegs, (imgW - 1) * 4);
  const segsZ = Math.min(maxSegs, (imgH - 1) * 4);

  // PlaneGeometry centré sur (0,0) puis positionné via mesh.position
  const geo = new THREE.PlaneGeometry(sx, sz, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);
  // NE PAS utiliser geo.translate — on positionne via mesh.position

  const pos = geo.attributes.position;
  for (let i = 0; i <= segsZ; i++) {
    for (let j = 0; j <= segsX; j++) {
      const vidx = i * (segsX+1) + j;
      const px = Math.min(imgW-1, Math.floor((j/segsX) * (imgW-1)));
      const py = Math.min(imgH-1, Math.floor((i/segsZ) * (imgH-1)));
      const alt = data[py * imgW + px];
      pos.setY(vidx, isFinite(alt) && alt > -9000 ? (alt - minAlt) * SCENE_SCALE : 0);
    }
  }
  geo.computeVertexNormals();

  terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: terrainTex }));
  terrainMesh.position.set(cx, 0, cz); // positionnement via mesh, pas geo
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);
  applyTerrainTexture();
}
