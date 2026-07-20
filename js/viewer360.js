// FENÊTRE IMAGE 360°
// ══════════════════════════════════════════════════════════

// (variables déclarées avant animate — voir déclarations globales)

function startDrag360(x, y) {
  drag360.active = true; drag360.x = x; drag360.y = y;
}

function moveDrag360(x, y) {
  const dx = x - drag360.x, dy = y - drag360.y;
  drag360.x = x; drag360.y = y;
  drag360.dYaw   -= dx * 0.3;
  drag360.dPitch -= dy * 0.2;
  drag360.dPitch  = Math.max(-85, Math.min(85, drag360.dPitch));
}

function init360Renderer() {
  if (drag360._init) return;
  drag360._init = true;

  const el = document.getElementById('win360');
  el.addEventListener('mousedown',  e=>{e.stopPropagation(); startDrag360(e.clientX, e.clientY);});
  el.addEventListener('touchstart', e=>{e.preventDefault(); e.stopPropagation(); startDrag360(e.touches[0].clientX, e.touches[0].clientY);}, {passive:false});
  window.addEventListener('mousemove',  e=>{ if(drag360.active){ moveDrag360(e.clientX, e.clientY); update360CSS(); }});
  window.addEventListener('touchmove',  e=>{ if(drag360.active){ moveDrag360(e.touches[0].clientX, e.touches[0].clientY); update360CSS(); }}, {passive:false});
  window.addEventListener('mouseup',  ()=>drag360.active=false);
  window.addEventListener('touchend', ()=>drag360.active=false);
}

function update360CSS() {
  // Simule une rotation panoramique via background-position
  // L'image equirectangulaire défile horizontalement selon le yaw
  const img = document.getElementById('img360');
  if (!img) return;
  // yaw 0-360 → bgX 0-100%
  const bgX = (((drag360.dYaw % 360) + 360) % 360) / 360 * 100;
  // pitch -85/+85 → bgY 15-85%
  const bgY = 50 + drag360.dPitch * 0.35;
  img.style.backgroundPosition = bgX + '% ' + bgY + '%';
}

function render360InMainRenderer() { /* géré par CSS */ }


function show360(point) {
  if (!point) return;

  current360 = point;
  win360Closed = false;
  init360Renderer();

  // Affiche la fenêtre
  const win = document.getElementById('win360');
  win.classList.add('visible');
  document.getElementById('win360-label').textContent = point.name || '';
  const hint = document.getElementById('win360-hint');
  const img  = document.getElementById('img360');

  // Reset orientation
  drag360.dYaw = 0; drag360.dPitch = 0;

  if (!point.imgURL) {
    hint.textContent = '📷 Aucune image associée';
    hint.style.display = 'block';
    img.style.backgroundImage = 'none';
    return;
  }

  // Affiche l'image equirectangulaire via CSS background
  // Le drag déplace background-position pour simuler la rotation panoramique
  const ext = (point.imgExt || 'jpg').toLowerCase();

  if (ext === 'exr' || ext === 'hdr') {
    // EXR/HDR non affichable directement — message explicite
    hint.textContent = '⚠️ Format ' + ext.toUpperCase() + ' non supporté en aperçu.\nConvertissez en JPG sur polyhaven.com';
    hint.style.display = 'block';
    img.style.backgroundImage = 'none';
  } else {
    img.style.backgroundImage = 'url(' + point.imgURL + ')';
    img.style.backgroundSize  = '200% auto';
    img.style.backgroundPosition = '50% 50%';
    hint.textContent = 'Glisser pour regarder autour';
    hint.style.display = 'block';
    setTimeout(() => hint.style.display = 'none', 3000);
  }
}

function hide360(force=false) {
  if (!force && is360Full) return;
  current360 = null;
  document.getElementById('win360').classList.remove('visible');
}

function close360() {
  win360Closed = true;
  is360Full = false;
  document.getElementById('win360').classList.remove('fullscreen', 'visible');
  document.getElementById('btn360-fs').textContent = '⛶';
}


function toggle360Fullscreen() {
  is360Full = !is360Full;
  const win = document.getElementById('win360');
  win.classList.toggle('fullscreen', is360Full);
  document.getElementById('btn360-fs').textContent = is360Full ? '⊡' : '⛶';
}

// Vérifie la proximité des points 360° dans animate()
function check360Triggers(camPos) {
  if (!points360.length) return; // aucun point chargé — court-circuit immédiat
  let nearest = null, nearestDist = Infinity;
  for (const p of points360) {
    const dx = camPos.x - p.x, dz = camPos.z - p.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist <= p.radius && dist < nearestDist) {
      nearestDist = dist; nearest = p;
    }
  }
  if (nearest) {
    if (!win360Closed || current360 !== nearest) show360(nearest);
    // Pulse le bouton pour signaler la photo disponible
    const b = document.getElementById('btn-360img');
    if (b) b.style.animation = 'pulse-blocked 1.2s ease-in-out infinite';
  } else {
    if (current360 && !is360Full) hide360();
    const b = document.getElementById('btn-360img');
    if (b) b.style.animation = '';
  }
}

// Chargement GeoJSON points 360°
function load360Points(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const g = JSON.parse(e.target.result);
      points360 = g.features
        .filter(f => f.geometry && f.geometry.type === 'Point')
        .map(f => {
          const c  = f.geometry.coordinates;
          const sc = anyToScene(c[0], c[1]);
          const p  = f.properties || {};
          return {
            x: sc.x, z: sc.z,
            radius: parseFloat(p.photo_radius || 50),
            name:   p.name || '',
            photo:  p.photo_360 || null,
            imgURL: null // rempli quand l'image est chargée
          };
        });
      // Associe les images déjà chargées
      reassociate360Images();
      sigStatus(`✓ ${points360.length} points 360° chargés`);
      markLoaded('btn-360');
    } catch(e) { sigStatus('✗ Points 360°: ' + e.message, false); }
  };
  r.readAsText(file);
}

// Chargement images 360° (JPG/PNG/HDR/EXR multiples)
function load360Images(input) {
  const files = Array.from(input.files);
  files.forEach(file => {
    const url = URL.createObjectURL(file);
    images360[file.name] = { url, ext: file.name.split('.').pop().toLowerCase() };
  });
  reassociate360Images();
  sigStatus(`✓ ${files.length} image(s) 360° chargée(s)\n${points360.filter(p=>p.imgURL).length}/${points360.length} points associés`);
  markLoaded('btn-360img');
}

// Association images ↔ points par nom de fichier
function reassociate360Images() {
  points360.forEach(p => {
    if (!p.photo) return;
    const name = p.photo.split('/').pop();
    const key  = Object.keys(images360).find(k => k.toLowerCase() === name.toLowerCase());
    if (key) {
      p.imgURL = images360[key].url;
      p.imgExt = images360[key].ext;
    }
  });
}

// Affiche le point 360° le plus proche de la position actuelle
function showNearest360() {
  const camPos = getPosOnPath(pathT);
  let nearest = null, nearestDist = Infinity;
  for (const p of points360) {
    const dx = camPos.x - p.x, dz = camPos.z - p.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < nearestDist) { nearestDist = dist; nearest = p; }
  }
  if (nearest) show360(nearest);
}

// Met à jour la visibilité du bouton 📷 selon la proximité
function update360Button(camPos) {
  const btn = document.getElementById('btn-show360');
  if (!btn || !points360.length) { if(btn) btn.style.display='none'; return; }
  let nearestDist = Infinity, nearest = null;
  for (const p of points360) {
    const dx = camPos.x - p.x, dz = camPos.z - p.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < nearestDist) { nearestDist = dist; nearest = p; }
  }
  if (nearestDist < 100) {
    btn.style.display = 'block';
    btn.style.animation = nearestDist < 50 ? 'pulse-blocked 1.2s ease-in-out infinite' : '';
    btn.title = nearest ? '📷 ' + nearest.name : '📷 360°';
  } else {
    btn.style.display = 'none';
    btn.style.animation = '';
  }
}