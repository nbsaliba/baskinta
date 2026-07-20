// CARTE 2D
// ══════════════════════════════════════════════════════════
const mapC=document.createElement('canvas'); mapC.width=mapC.height=512;
const mCtx=mapC.getContext('2d');
const mapTex2=new THREE.CanvasTexture(mapC);
const mapMesh=new THREE.Mesh(
  new THREE.PlaneGeometry(150,150),
  new THREE.MeshBasicMaterial({map:mapTex2,transparent:true})
);
mapMesh.rotateX(-Math.PI/2); mapMesh.position.set(0,1,0); mapMesh.visible=false; scene.add(mapMesh);

function drawMap(camPos, camDir){
  mCtx.clearRect(0,0,512,512);
  const bg=mCtx.createRadialGradient(256,256,0,256,256,280);
  bg.addColorStop(0,'#f2e0b4'); bg.addColorStop(1,'#d8c08a');
  mCtx.fillStyle=bg; mCtx.fillRect(0,0,512,512);

  // Parcours
  if(pathPoints.length>1){
    const scl=1.2;
    mCtx.strokeStyle='#c8a255'; mCtx.lineWidth=7;
    mCtx.beginPath();
    pathPoints.forEach((p,i)=>{
      const px=256+p.x*scl, py=256+p.z*scl;
      i===0?mCtx.moveTo(px,py):mCtx.lineTo(px,py);
    });
    mCtx.stroke();
    mCtx.strokeStyle='#e4c878'; mCtx.lineWidth=3;
    mCtx.beginPath();
    pathPoints.forEach((p,i)=>{
      const px=256+p.x*scl, py=256+p.z*scl;
      i===0?mCtx.moveTo(px,py):mCtx.lineTo(px,py);
    });
    mCtx.stroke();
  }

  // POIs
  const scl=1.2;
  poiData.forEach(p=>{
    const px=256+(p.x||0)*scl, py=256+p.z*scl;
    mCtx.beginPath(); mCtx.arc(px,py,9,0,Math.PI*2);
    mCtx.fillStyle='#e07020'; mCtx.fill();
    mCtx.strokeStyle='#804010'; mCtx.lineWidth=2; mCtx.stroke();
    mCtx.fillStyle='#1a0800'; mCtx.font='bold 11px sans-serif';
    mCtx.fillText(p.name, px+12, py+4);
  });

  // Avatar — position + flèche de direction
  const cx=256+camPos.x*scl, cy=256+camPos.z*scl;
  if (camDir) {
    const ang = Math.atan2(camDir.x, camDir.z);
    const fx = cx + Math.sin(ang)*16, fy = cy + Math.cos(ang)*16;
    mCtx.strokeStyle='#2288ff'; mCtx.lineWidth=3; mCtx.lineCap='round';
    mCtx.beginPath(); mCtx.moveTo(cx,cy); mCtx.lineTo(fx,fy); mCtx.stroke();
    // Pointe de flèche
    const a1=ang+2.5, a2=ang-2.5;
    mCtx.beginPath();
    mCtx.moveTo(fx,fy);
    mCtx.lineTo(fx+Math.sin(a1)*6, fy+Math.cos(a1)*6);
    mCtx.lineTo(fx+Math.sin(a2)*6, fy+Math.cos(a2)*6);
    mCtx.closePath(); mCtx.fillStyle='#2288ff'; mCtx.fill();
  }
  mCtx.beginPath(); mCtx.arc(cx,cy,8,0,Math.PI*2);
  mCtx.fillStyle='#2288ff'; mCtx.fill();
  mCtx.strokeStyle='#fff'; mCtx.lineWidth=2.5; mCtx.stroke();
}
