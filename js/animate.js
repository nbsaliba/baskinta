// BOUCLE PRINCIPALE
// ══════════════════════════════════════════════════════════
const WALK_SPEED_MS = 1.35; // vitesse de marche humaine réaliste, m/s (~4.85 km/h)
let lastFrameTime = performance.now();
const TARGET_FPS  = _mobile ? 30 : 60;
const FRAME_MIN   = 1000 / TARGET_FPS;

function animate(now = performance.now()){
  requestAnimationFrame(animate); frameCount++;

  // Limite le framerate sur mobile pour économiser la batterie
  if (_mobile && (now - lastFrameTime) < FRAME_MIN) return;

  const dt = Math.min(0.1, (now - lastFrameTime) / 1000); // delta en secondes, cap à 100ms
  lastFrameTime = now;

  if(isWalking&&!ended&&pathPoints.length>1){
    const distanceThisFrame = WALK_SPEED_MS * dt; // mètres parcourus cette frame
    const step = distanceThisFrame / pathTotalLength; // fraction du parcours total
    pathT=Math.min(1, pathT+step);
    totalDist += distanceThisFrame;
    bobPhase += dt * 7.5; // oscillation de marche cadencée au temps réel, pas au framerate
  }

  if(pathT>=1&&!ended&&pathPoints.length>1){
    ended=true; stopWalking(); synth.cancel();
    setTimeout(()=>document.getElementById('end-screen').classList.add('visible'),2000);
  }

  const camPos   = getPosOnPath(pathT);
  const groundY  = camPos.y - 0.08;
  const eyeHeight = 1.72; // 1.72m réels
  const bob       = Math.sin(bobPhase) * (isWalking ? 0.055 : 0);
  camPos.y = groundY + eyeHeight + bob;
  const camDir = getDirOnPath(pathT);

  // Collision simple avec les bâtiments — stoppe la marche si mur devant
  if (isWalking && buildingMeshes.length > 0) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(camPos.x, camPos.y, camPos.z),
      camDir.clone().normalize(),
      0, 6  // 6m devant la caméra
    );
    const hits = ray.intersectObjects(buildingMeshes);
    if (hits.length > 0) {
      pathT = Math.max(0, pathT - 0.00025);
    }
  }

  // Narrations par proximité
  checkNarrTriggers(camPos);

  // Bouton 📷 360° — apparaît si un point est proche
  if (points360.length) update360Button(camPos);


  // Narration linéaire (depuis POI audio_text)
  for(let i=0;i<narratives.length;i++){
    if(!narratives[i].done && camPos.z>=narratives[i].z){
      narratives[i].done=true; showNarrative(narratives[i].text, narratives[i].audio||narratives[i].text); break;
    }
  }

  // Debug
  const utmE = geoOrigin ? Math.round(geoOrigin.e + camPos.x) : 0;
  const utmN = geoOrigin ? Math.round(geoOrigin.n - camPos.z) : 0;
  const altM = Math.round(groundY + (altGrid ? altGrid.minAlt : 0));
  const terrExt = altGrid ? altGrid.ext : null;
  document.getElementById('debug').textContent=
    `t:${(pathT*100).toFixed(1)}% | alt:${altM}m\n`+
    `scène:(${camPos.x.toFixed(1)}, ${camPos.z.toFixed(1)})\n`+
    `UTM E:${utmE} N:${utmN}\n`+
    (terrExt?`terrain X[${terrExt.minX.toFixed(0)}..${terrExt.maxX.toFixed(0)}] Z[${terrExt.minZ.toFixed(0)}..${terrExt.maxZ.toFixed(0)}]`:
    'pas de MNT');

  // Caméra FPS — yeux à 1.72m, regard horizontal dans la direction du tracé
  // (+ rotation libre lookYaw quand on regarde autour à l'arrêt)
  if (isWalking) {
    // Retour en douceur vers l'avant/horizontale (~0.4s) dès que la marche reprend
    lookYaw   += (0 - lookYaw)   * Math.min(1, dt * 6);
    lookPitch += (0 - lookPitch) * Math.min(1, dt * 6);
  }
  const yawedDir = camDir.clone().applyAxisAngle(new THREE.Vector3(0,1,0), lookYaw);
  // yawedDir est unitaire dans le plan XZ (Y=0) ; on incline ensuite selon lookPitch
  const cosPitch = Math.cos(lookPitch), sinPitch = Math.sin(lookPitch);
  const viewDir = new THREE.Vector3(yawedDir.x * cosPitch, sinPitch, yawedDir.z * cosPitch);
  const sway  = Math.sin(bobPhase*.5) * (isWalking ? 0.015 : 0);
  const right  = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0,1,0)).normalize();
  fpsCam.position.copy(camPos).addScaledVector(right, sway);
  // Regard : direction 3D (yaw + pitch) projetée à 30m devant la caméra
  const lookTarget = new THREE.Vector3(
    camPos.x + viewDir.x * 30,
    camPos.y + viewDir.y * 30,
    camPos.z + viewDir.z * 30
  );
  fpsCam.lookAt(lookTarget);

  // Avatar — matérialise la position du marcheur (vue aérienne/carte)
  updateAvatar(camPos, camDir, currentView);

  // Caméra aérienne — hauteur proportionnelle au parcours, min 200m
  const diag = pathTotalLength || 1000;
  const aerialH = Math.max(Math.min(diag * 0.25, 2000), groundY + 200);
  aerialCam.position.set(camPos.x + diag*0.10, aerialH, camPos.z + diag*0.15);
  aerialCam.lookAt(camPos.x, groundY, camPos.z);

  // Carte orthographique — hauteur fixe 5000m au-dessus
  mapCam.position.set(camPos.x, groundY + 5000, camPos.z);
  mapCam.lookAt(camPos.x, groundY, camPos.z);

  // UI — le compteur affiché est lissé (pas la valeur brute) pour masquer les
  // micro-arrêts liés à la détection de pas (pas manqué, marche lente/irrégulière) :
  // sans ça, la distance se fige puis "rattrape" d'un coup, ce qui semble être un bug visuel.
  displayedDist += (totalDist - displayedDist) * Math.min(1, dt * 4);
  document.getElementById('progress-fill').style.width=(pathT*100).toFixed(1)+'%';
  document.getElementById('km-badge').textContent=(displayedDist/1000).toFixed(3)+' km parcouru';

  // POI markers
  poiObjects.forEach(o=>{
    const d=camPos.distanceTo(o.marker.position);
    o.mat.color.setHex(d<10?0xff3300:0xffaa00);
    o.marker.position.y=(o.data.y||0) + 3 + Math.sin(frameCount*.04+o.data.z)*0.5;
    o.rMat.opacity=d<25 ? 0.65 : 0.25;
  });

  if(currentView==='map'&&frameCount%2===0){
    drawMap(camPos, camDir); mapTex2.needsUpdate=true;
    if(frameCount%30===0) updatePOIPanel();
  }

  sun.position.set(camPos.x + 800, 1300, camPos.z + 400);
  renderer.render(scene, activeCamera);

  // Rendu 360° par-dessus dans la zone de la fenêtre flottante
}
animate();

let spaceHeld = false;
document.addEventListener('keydown',e=>{
  if(e.code==='Space'){
    e.preventDefault();
    if (!spaceHeld) { spaceHeld = true; startWalking(); } // ignore les répétitions auto du navigateur
  }
  if(e.code==='Digit1')setView('fps');
  if(e.code==='Digit2')setView('aerial');
  if(e.code==='Digit3')setView('map');
  if(e.code==='Escape'){ closeAttr(); }
});
document.addEventListener('keyup',e=>{
  if(e.code==='Space'){ spaceHeld = false; stopWalking(); }
});
window.addEventListener('resize',()=>{
  const w=window.innerWidth,h=window.innerHeight;
  renderer.setSize(w,h);
  [fpsCam,aerialCam].forEach(c=>{c.aspect=w/h;c.updateProjectionMatrix();});
  mapCam.updateProjectionMatrix();
});
