DÉPLOIEMENT — Walking Story
========================================

Déposez ces fichiers dans le MÊME dossier sur votre serveur :

  ✓ Walking_Story_parcours.html   ← fichier HTML exporté
  ✓ mnt.tif                ← MNT GeoTIFF
  ✓ satellite.tif          ← image satellite GeoTIFF RGB (optionnel)
  ✓ parcours.geojson       ← tracé du parcours
  ✓ pois.geojson           ← points d'intérêt
  ✓ narrations.geojson     ← déclencheurs audio/texte
  ✓ bati.geojson           ← bâtiments extrudés
  ✓ os.geojson             ← occupation du sol
  ✓ audio/                 ← dossier contenant les fichiers MP3 référencés
                              dans narrations.geojson (audio_file)

Aucune configuration serveur requise (pas de CORS).
Fonctionne sur : GitHub Pages, Netlify, OVH, Apache, Nginx...

Pour tester en local :
  → Ne pas ouvrir directement le HTML (file://)
  → Utiliser un serveur local :
     python3 -m http.server 8080
     puis ouvrir http://localhost:8080
