// Social share card: a real frame of the simulation at 1200×630, with the
// title set over a scrim, saved to og/cover.png by the dev server.
//
//   python tools/serve.py   then open   http://localhost:8124/?cover
//
// Only tools/serve.py accepts the upload, only for that one path, and only
// from localhost; on any other host this module is never loaded.

import * as THREE from 'three';

const W = 1200, H = 630;

export async function makeCover({ renderer, composer, camera, world, settings, ui }) {
  // A still frame: no labels or orbit overlays, e in its ocean scenario.
  settings.paused = true;
  settings.showLabels = false;
  settings.showOrbits = false;
  settings.showHabitableZone = false;
  settings.showLineOfSight = false;
  document.body.classList.add('ui-hidden');
  ui.setScale(9, 1);
  world.setScenario('e', 'eyeball');

  // Camera behind and above e's day side, looking back past it at the star,
  // so the planet fills the lower right and the star burns upper left.
  world.syncPositions();
  const e = world.viewOf('e');
  const toStar = world.starWorld.clone().sub(e.renderPos).normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(toStar).normalize();
  const r = e.drawRadius;
  camera.position.copy(e.renderPos)
    .addScaledVector(toStar, -1.6 * r)
    .addScaledVector(side, 3.4 * r)
    .add(new THREE.Vector3(0, 0.9 * r, 0));
  const look = e.renderPos.clone().lerp(world.starWorld, 0.035).addScaledVector(side, 0.9 * r);
  camera.up.set(0, 1, 0);
  camera.lookAt(look);
  camera.fov = 38;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  world.update(0, camera, 0);
  composer.render(0);
  const frame = renderer.domElement.toDataURL('image/png');

  // Compose the title block in 2D.
  const img = new Image();
  img.src = frame;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H);

  const scrim = g.createLinearGradient(0, H * 0.45, 0, H);
  scrim.addColorStop(0, 'rgba(7, 4, 10, 0)');
  scrim.addColorStop(1, 'rgba(7, 4, 10, 0.88)');
  g.fillStyle = scrim;
  g.fillRect(0, 0, W, H);

  const font = '"Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif';
  g.fillStyle = '#ffffff';
  g.font = `600 64px ${font}`;
  g.letterSpacing = '10px';
  g.fillText('TRAPPIST-1', 64, H - 132);
  g.letterSpacing = '0px';
  g.fillStyle = '#ffc29a';
  g.font = `400 26px ${font}`;
  g.fillText('Seven Earth-sized worlds, real N-body gravity, and what JWST has found', 66, H - 84);
  g.fillStyle = 'rgba(232, 238, 247, 0.6)';
  g.font = `400 19px ${font}`;
  g.fillText('40.7 light-years · Agol et al. 2021 dynamics · JWST results 2023–2026 · in your browser', 66, H - 50);

  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const resp = await fetch('/og/cover.png', { method: 'PUT', body: blob });

  // Show the result in place of the app.
  document.body.innerHTML = `<p style="font:13px system-ui;color:#ccc;margin:12px">${resp.ok ? 'Saved og/cover.png' : `Upload failed: ${resp.status}`} (${(blob.size / 1024).toFixed(0)} kB)</p>`
    + `<img src="${c.toDataURL('image/png')}" style="width:100%;max-width:1200px;display:block">`;
  return resp.ok;
}
