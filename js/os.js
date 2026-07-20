// OCCUPATION DU SOL
// ══════════════════════════════════════════════════════════

// Table de correspondance codes → type normalisé
// Compatible CLC (Corine Land Cover), OSM, IGN, ou codes libres
const OS_TYPE_MAP = {
  // Codes libres (ton GeoJSON)
  'foret':         'foret',
  'forêt':         'foret',
  'forest':        'foret',
  'bois':          'foret',
  'foret_claire':  'foret_claire',
  'prairie':       'prairie',
  'herbe':         'prairie',
  'grass':         'prairie',
  'culture':       'culture',
  'agricole':      'culture',
  'agricultural':  'culture',
  'urbain':        'urbain',
  'urban':         'urbain',
  'residential':   'urbain',
  'industriel':    'urbain',
  'eau':           'eau',
  'water':         'eau',
  'lac':           'eau',
  'riviere':       'eau',
  'river':         'eau',
  'sable':         'sable',
  'desert':        'sable',
  'roche':         'roche',
  'rock':          'roche',
  'bare':          'roche',

  // OSM landuse
  'farmland':      'culture',
  'farmyard':      'culture',
  'orchard':       'culture',
  'vineyard':      'culture',
  'allotments':    'culture',
  'meadow':        'prairie',
  'greenfield':    'prairie',
  'grass':         'prairie',
  'park':          'prairie',
  'garden':        'prairie',
  'recreation_ground': 'prairie',
  'cemetery':      'roche',
  'quarry':        'roche',
  'brownfield':    'roche',
  'industrial':    'urbain',
  'commercial':    'urbain',
  'retail':        'urbain',
  'construction':  'urbain',
  'military':      'urbain',
  'railway':       'urbain',
  'forest':        'foret',
  'wood':          'foret',

  // OSM natural
  'wood':          'foret',
  'scrub':         'foret_claire',
  'heath':         'foret_claire',
  'grassland':     'prairie',
  'wetland':       'eau',
  'water':         'eau',
  'reservoir':     'eau',
  'bay':           'eau',
  'beach':         'sable',
  'sand':          'sable',
  'dune':          'sable',
  'bare_rock':     'roche',
  'scree':         'roche',
  'cliff':         'roche',
  'glacier':       'roche',

  // OSM leisure
  'nature_reserve':'foret_claire',
  'golf_course':   'prairie',
  'pitch':         'prairie',

  // ESA WorldCover (codes numériques)
  '10':  'foret',        // Tree cover
  '20':  'foret_claire', // Shrubland
  '30':  'prairie',      // Grassland
  '40':  'culture',      // Cropland
  '50':  'urbain',       // Built-up
  '60':  'roche',        // Bare/sparse vegetation
  '70':  'roche',        // Snow/ice
  '80':  'eau',          // Permanent water bodies
  '90':  'prairie',      // Herbaceous wetland
  '95':  'foret',        // Mangrove
  '100': 'sable',        // Moss/lichen

  // Codes CLC (Corine Land Cover) numériques
  '111':'urbain','112':'urbain','121':'urbain','122':'urbain',
  '123':'urbain','124':'urbain','131':'roche','132':'roche',
  '141':'prairie','142':'prairie',
  '211':'culture','212':'culture','213':'culture',
  '221':'culture','222':'culture','223':'culture',
  '231':'prairie','241':'culture','242':'culture','243':'culture',
  '311':'foret','312':'foret','313':'foret',
  '321':'prairie','322':'roche','323':'prairie','324':'foret_claire',
  '331':'sable','332':'roche','333':'roche','334':'roche','335':'roche',
  '411':'eau','412':'eau','421':'eau','422':'eau','423':'eau',
  '511':'eau','512':'eau','521':'eau','522':'eau','523':'eau',
};

// Paramètres visuels par type
const OS_STYLE = {
  foret:       { groundColor:'#3d6b35', treeColor:0x2d5a27, treeDensity:0.008, treeH:[4,10],  treeR:[1.2,2.5] },
  foret_claire:{ groundColor:'#5a8c4a', treeColor:0x4a7a3a, treeDensity:0.003, treeH:[3,8],   treeR:[0.8,2.0] },
  prairie:     { groundColor:'#7ab552', treeColor:null,      treeDensity:0 },
  culture:     { groundColor:'#c4a35a', treeColor:null,      treeDensity:0 },
  urbain:      { groundColor:'#8a8a8a', treeColor:null,      treeDensity:0 },
  eau:         { groundColor:'#3a7abf', treeColor:null,      treeDensity:0 },
  sable:       { groundColor:'#d4b87a', treeColor:null,      treeDensity:0 },
  roche:       { groundColor:'#8a7a6a', treeColor:null,      treeDensity:0 },
};

// Géométries partagées pour les arbres (InstancedMesh)
const TRUNK_GEO = new THREE.CylinderGeometry(0.15, 0.22, 1, 5);
const CONE_GEO  = new THREE.ConeGeometry(1, 1, 6);
const BALL_GEO  = new THREE.SphereGeometry(1, 5, 4);
const TRUNK_MAT = new THREE.MeshLambertMaterial({color:0x5a3a1a});

function plantTrees(ring, style) {
  if (!style.treeColor || !style.treeDensity) return;

  const xs=ring.map(p=>p[0]), zs=ring.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minZ=Math.min(...zs), maxZ=Math.max(...zs);
  const area = (maxX-minX) * (maxZ-minZ);

  // Cap absolu : max 300 arbres par zone quelle que soit la surface
  const maxTrees = _mobile ? 100 : 300; // moins d'arbres sur mobile
  const count = Math.min(maxTrees, Math.max(5, Math.floor(area * style.treeDensity)));

  // InstancedMesh : 1 draw call pour tous les troncs, 1 pour toutes les feuilles
  const trunkInst = new THREE.InstancedMesh(TRUNK_GEO, TRUNK_MAT, count);
  const leafMat   = new THREE.MeshLambertMaterial({color:style.treeColor});
  const leafInst  = new THREE.InstancedMesh(Math.random()>0.5?CONE_GEO:BALL_GEO, leafMat, count);
  trunkInst.castShadow = leafInst.castShadow = true;

  const dummy = new THREE.Object3D();
  let placed = 0;

  for (let attempts=0; attempts<count*5 && placed<count; attempts++) {
    const tx = minX + Math.random()*(maxX-minX);
    const tz = minZ + Math.random()*(maxZ-minZ);
    if (!pointInPolygon(tx, tz, ring)) continue;

    const ty = getAltAt(tx, tz);
    const h  = style.treeH[0] + Math.random()*(style.treeH[1]-style.treeH[0]);
    const r  = style.treeR[0] + Math.random()*(style.treeR[1]-style.treeR[0]);
    const trunkH = h * 0.35;

    // Tronc
    dummy.position.set(tx, ty + trunkH/2, tz);
    dummy.scale.set(1, trunkH, 1);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(placed, dummy.matrix);

    // Feuillage
    dummy.position.set(tx, ty + trunkH + h*0.35, tz);
    dummy.scale.set(r, h*0.65, r);
    dummy.rotation.y = Math.random()*Math.PI*2;
    dummy.updateMatrix();
    leafInst.setMatrixAt(placed, dummy.matrix);

    placed++;
  }

  // Ajuste le count réel
  trunkInst.count = leafInst.count = placed;
  if (placed > 0) {
    osGroup.add(trunkInst);
    osGroup.add(leafInst);
  }
}

// Groupe Three.js pour tous les objets OS
let osGroup = new THREE.Group();
scene.add(osGroup);

// Canvas de texture terrain OS (peint par zone)
let osTexCanvas = null;
let osTexture   = null;

function normalizeOSType(props) {
  // Cherche dans tous les champs possibles, dans l'ordre de priorité
  const candidates = [
    props.type, props.code, props.classe,
    props.CLC_CODE, props.CODE_18, props.CODE_12,
    props.landuse, props.natural, props.leisure,
    props.fclass, props.CLASSE, props.NATURE,
    // ESA WorldCover
    props.Map_code, props.map_code,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const k = String(raw).toLowerCase().trim();
    if (OS_TYPE_MAP[k]) return OS_TYPE_MAP[k];
  }
  return null;
}

// Teste si un point (px,pz) est dans un polygone scène [[x,z],...]
function pointInPolygon(px, pz, ring) {
  let inside = false;
  for (let i=0, j=ring.length-1; i<ring.length; j=i++) {
    const xi=ring[i][0], zi=ring[i][1], xj=ring[j][0], zj=ring[j][1];
    if (((zi>pz)!==(zj>pz)) && (px < (xj-xi)*(pz-zi)/(zj-zi)+xi)) inside=!inside;
  }
  return inside;
}

// Plan d'eau animé
function makeWaterPlane(ring) {
  const xs=ring.map(p=>p[0]), zs=ring.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minZ=Math.min(...zs), maxZ=Math.max(...zs);
  const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
  const avgAlt = getAltAt(cx,cz)+0.02;

  const geo = new THREE.PlaneGeometry(maxX-minX, maxZ-minZ, 4, 4);
  geo.rotateX(-Math.PI/2);
  const mat = new THREE.MeshLambertMaterial({
    color:0x3a7abf, transparent:true, opacity:0.75
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, avgAlt, cz);
  mesh.userData.isWater = true;
  osGroup.add(mesh);
}

// Texture terrain OS — rasterise les polygones sur un canvas
function buildOSTexture(features, extScene) {
  const sz = 512;
  if (!osTexCanvas) { osTexCanvas=document.createElement('canvas'); osTexCanvas.width=osTexCanvas.height=sz; }
  const ctx = osTexCanvas.getContext('2d');
  // Fond sable par défaut
  ctx.fillStyle='#d4b87a'; ctx.fillRect(0,0,sz,sz);

  const sx = extScene.maxX - extScene.minX || 1;
  const sz2= extScene.maxZ - extScene.minZ || 1;

  function sceneToCanvas(x,z) {
    return [
      ((x-extScene.minX)/sx)*sz,
      ((z-extScene.minZ)/sz2)*sz
    ];
  }

  features.forEach(f=>{
    const type = normalizeOSType(f.properties);
    const style = type ? OS_STYLE[type] : null;
    if (!style) return;

    const rings = f.geometry.type==='Polygon'
      ? [f.geometry.coordinates[0]]
      : f.geometry.type==='MultiPolygon'
        ? f.geometry.coordinates.map(p=>p[0])
        : [];

    rings.forEach(ring=>{
      ctx.beginPath();
      ring.forEach((c,i)=>{
        const sc = anyToScene(c[0],c[1]);
        const [cx2,cz2] = sceneToCanvas(sc.x,sc.z);
        i===0?ctx.moveTo(cx2,cz2):ctx.lineTo(cx2,cz2);
      });
      ctx.closePath();
      ctx.fillStyle = style.groundColor;
      ctx.fill();
    });
  });

  if (osTexture) osTexture.dispose();
  osTexture = new THREE.CanvasTexture(osTexCanvas);
  osTexture.wrapS = osTexture.wrapT = THREE.ClampToEdgeWrapping;
  setAnisotropy(osTexture);

  // Applique uniquement si pas de satellite chargé
  applyTerrainTexture();
}

function loadOS(input) {
  const file=input.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const g=JSON.parse(e.target.result);
      if(g.type!=='FeatureCollection') throw new Error('Pas une FeatureCollection');

      // Vider les anciens objets OS
      while(osGroup.children.length) osGroup.remove(osGroup.children[0]);

      // Fixe l'origine si besoin
      if(!geoOrigin && g.features.length){
        const c=g.features[0].geometry.coordinates[0][0];
        if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]); else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}
      }

      // Calcule l'emprise scène des features OS
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      const converted = g.features.map(f=>{
        if(!f.geometry) return null;
        const rings = f.geometry.type==='Polygon'
          ? [f.geometry.coordinates[0]]
          : f.geometry.type==='MultiPolygon'
            ? f.geometry.coordinates.map(p=>p[0])
            : [];
        const scRings = rings.map(ring=>ring.map(c=>{
          const s=anyToScene(c[0],c[1]);
          if(s.x<minX)minX=s.x; if(s.x>maxX)maxX=s.x;
          if(s.z<minZ)minZ=s.z; if(s.z>maxZ)maxZ=s.z;
          return [s.x,s.z];
        }));
        return { properties:f.properties, geometry:{ type:f.geometry.type, coordinates:scRings } };
      }).filter(Boolean);

      const extScene = { minX, maxX, minZ, maxZ };

      // 1. Texture terrain
      buildOSTexture(converted, extScene);

      // 2. Objets 3D par zone
      let treesCount=0, waterCount=0;
      converted.forEach(f=>{
        const raw = f.properties.type||f.properties.code||f.properties.classe||f.properties.CLC_CODE||f.properties.CODE_18;
        const type = normalizeOSType(f.properties);
        const style = type ? OS_STYLE[type] : null;
        if (!style) return;

        f.geometry.coordinates.forEach(ring=>{
          if (type==='eau'){ makeWaterPlane(ring); waterCount++; }
          else if (style.treeColor){ plantTrees(ring, style); treesCount++; }
        });
      });

      sigStatus(`✓ OS chargée\n${converted.length} zones\n${treesCount} zones arborées\n${waterCount} plans d'eau`);
      markLoaded('btn-os');
    }catch(err){sigStatus('✗ OS: '+err.message,false); console.error(err);}
  };
  r.readAsText(file);
}
