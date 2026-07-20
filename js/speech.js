// SPEECH
// ══════════════════════════════════════════════════════════
const synth=window.speechSynthesis; let voiceFR=null, muted=false;
let synthUnlocked=false;
let pendingSpeech=null; // texte en attente si synth pas encore débloqué

function unlockSynth() {
  if (synthUnlocked) return;
  synthUnlocked = true;
  // Utterance silencieuse pour débloquer le contexte (Chrome + Firefox)
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0.01; u.rate = 2;
  u.onend = () => {
    // Si un texte attendait, le jouer maintenant
    if (pendingSpeech) { const t=pendingSpeech; pendingSpeech=null; speak(t); }
  };
  try { synth.speak(u); } catch(e) {}
}

function loadVoices(){
  const v=synth.getVoices();
  voiceFR = v.find(x=>x.lang==='fr-FR'&&x.localService)
          || v.find(x=>x.lang.startsWith('fr')&&x.localService)
          || v.find(x=>x.lang==='fr-FR')
          || v.find(x=>x.lang.startsWith('fr'))
          || null;
  // Liste les voix françaises disponibles en console pour diagnostic
  const frVoices = v.filter(x=>x.lang.startsWith('fr'));
  if (frVoices.length) {
    console.log('Voix FR disponibles:', frVoices.map(x=>x.name+' ('+x.lang+(x.localService?', locale':', réseau')+')'));
  } else {
    console.warn('Aucune voix française détectée sur ce système — la lecture utilisera une voix par défaut potentiellement avec accent.');
  }
  populateVoiceSelect(frVoices);
}

function populateVoiceSelect(frVoices) {
  const sel = document.getElementById('voice-select');
  if (!sel || sel.dataset.populated === '1') return; // évite de repeupler à chaque appel de loadVoices
  frVoices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name.replace('Microsoft ', '').replace('Google ', '') + (v.localService ? '' : ' ☁');
    sel.appendChild(opt);
  });
  if (frVoices.length) sel.dataset.populated = '1';
}

function setVoiceFromSelect(name) {
  if (!name) { loadVoices(); return; } // "auto" → revient à la sélection automatique
  const v = synth.getVoices().find(x => x.name === name);
  if (v) voiceFR = v;
}
loadVoices();
if(synth.onvoiceschanged!==undefined) synth.onvoiceschanged=loadVoices;

function speak(t){
  speakWithCallback(t, null);
}

function speakWithCallback(t, onDone){
  if(muted||!synth||!t||!t.trim()){ if(onDone) onDone(); return; }
  if(!synthUnlocked){
    pendingSpeech = t; if(onDone) onDone(); return;
  }
  synth.cancel();
  const u=new SpeechSynthesisUtterance(t);
  u.lang='fr-FR'; u.rate=0.88; u.pitch=0.95;
  if(voiceFR) u.voice=voiceFR;
  if (onDone) {
    u.onend   = onDone;
    u.onerror = onDone;
  }
  try { synth.speak(u); } catch(e){ console.warn('speak error:',e); if(onDone) onDone(); }
}

function stopSpeaking(){
  synth.cancel();
  pendingSpeech = null;
}

function toggleMute(){
  muted=!muted;
  document.getElementById('mute-btn').textContent=muted?'🔇 Muet':'🔊 Son';
  if(muted) synth.cancel();
}

let narTimer=null;
// displayText = texte affiché à l'écran
// audioText   = texte lu à voix haute (si null = pas de lecture auto)
function showNarrative(displayText, audioText=undefined){
  const box=document.getElementById('narrative-box');
  document.getElementById('narrative-text').textContent=displayText;
  box.style.opacity='1';
  if(narTimer)clearTimeout(narTimer);
  // audioText === undefined → pas de lecture (triggerNarration gère l'audio)
  // audioText === null      → pas de lecture
  // audioText === string    → lecture directe (utilisé par les POI narratifs)
  if(audioText !== undefined && audioText !== null) speak(audioText);
  narTimer=setTimeout(()=>{box.style.opacity='0';},13000);
}

const narratives=[];  // rempli depuis les POI GeoJSON (audio_text)

// ══════════════════════════════════════════════════════════
// STATE & CONTRÔLES
// ══════════════════════════════════════════════════════════
let bobPhase=0, isWalking=false, totalDist=0, displayedDist=0, frameCount=0, ended=false;

// Variables 360° — déclarées ici pour être accessibles depuis animate()
let points360    = [];
let images360    = {};
let current360   = null;
let is360Full    = false;
let win360Closed = false;
let r360=null, scene360=null, cam360=null, sphere360=null, raf360=null;
let drag360 = {active:false, x:0, y:0, yaw:0, pitch:0, dYaw:0, dPitch:0};
pathT=0;

function startWalking(){
  if (ended || pathPoints.length<=1 || isWalking) return;
  unlockSynth(); // débloque speechSynthesis au premier geste

  // Bloqué uniquement si on est figé sur un point en attente d'une narration précédente.
  // currentNarr peut être non-null (audio qui joue en fond) sans empêcher la marche.
  if (blockedAtNarr) return;

  isWalking = true;
  document.getElementById('step-btn').style.background = 'rgba(255,210,140,.35)';
  document.getElementById('step-btn').innerHTML = (typeof isMobile==='function' && isMobile()) ? '▶ Manuel' : '▶ Marcher'; // toujours actif, même si currentNarr joue en fond
}
function stopWalking(){
  if (!isWalking) return; // déjà arrêté, ignore l'appel redondant
  isWalking=false;
  // Si on est bloqué à un point narratif, le bouton garde son style "bloqué"
  if (!blockedAtNarr) {
    document.getElementById('step-btn').style.background='rgba(255,210,140,.15)';
  }
  // La narration en cours n'est PAS coupée — elle continue jusqu'au bout
  // même si l'utilisateur relâche le bouton manuellement
}

function setView(v){
  currentView=v;
  ['fps','aerial','map'].forEach(n=>{
    const b=document.getElementById('btn-'+n);
    if(n===v){b.style.background='rgba(255,210,140,.2)';b.style.borderColor='rgba(255,210,140,.55)';b.style.color='rgba(255,210,140,1)';}
    else{b.style.background='rgba(255,255,255,.07)';b.style.borderColor='rgba(255,255,255,.2)';b.style.color='rgba(255,255,255,.8)';}
  });
  document.getElementById('view-label').textContent={fps:'Vue FPS',aerial:'Vue aérienne',map:'Carte'}[v];
  mapMesh.visible=(v==='map');
  document.getElementById('poi-panel') && (document.getElementById('poi-panel').style.display=(v==='map')?'block':'none');
  if(v==='map'){ activeCamera=mapCam; updatePOIPanel(); }
  else if(v==='aerial'){ activeCamera=aerialCam; }
  else{ activeCamera=fpsCam; }
}

function updatePOIPanel(){
  const panel=document.getElementById('poi-panel');
  if (!panel) return;
  panel.querySelectorAll('.poi-card').forEach(e=>e.remove());
  const camPos=getPosOnPath(pathT);
  poiData.forEach(p=>{
    const dist=Math.round(Math.sqrt(Math.pow((p.x||0)-camPos.x,2)+Math.pow(p.z-camPos.z,2)));
    const card=document.createElement('div'); card.className='poi-card';

    // Cherche un point 360° proche de ce POI
    const idx360 = points360.findIndex(pt => {
      const dx=pt.x-(p.x||0), dz=pt.z-p.z;
      return Math.sqrt(dx*dx+dz*dz) < 80;
    });

    card.innerHTML='<div class="poi-name">'+p.name+
      (idx360>=0 ? ' <button class="btn-poi-360" data-idx="'+idx360+'">📷</button>' : '')+
      '</div><div class="poi-dist">'+(dist<30?'✓ Atteint':dist+' m')+'</div>';
    card.onclick=()=>showNarrative(p.desc||p.name, p.audio_text||p.desc||p.name);
    panel.appendChild(card);
  });

  // Attache les listeners sur les boutons 📷
  panel.querySelectorAll('.btn-poi-360').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      if (points360[idx]) show360(points360[idx]);
    });
  });
}

function resetJourney(){
  pathT=0; bobPhase=0; totalDist=0; displayedDist=0; ended=false;
  narratives.forEach(n=>{n.done=false;});
  stopNarration();
  document.getElementById('end-screen').classList.remove('visible');
  document.getElementById('narrative-box').style.opacity='0';
  document.getElementById('progress-fill').style.width='0%';
  document.getElementById('km-badge').textContent='0.00 km parcouru';
  closeAttr();
  // Reset narrations par proximité
  narrPoints.forEach(n=>{ n.played=false; });
}
