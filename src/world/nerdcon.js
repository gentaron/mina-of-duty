import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { newTrs, clothGeometry, chamferBox } from './util.js';
import { BOX, BOX_FINE, BOX_THIN, IDENT, LL } from './kit.js';
import { STREET, SET_PIECES } from './layout.js';
import { groundY } from './dressing.js';

/**
 * WORLD — NERD OF DUTY re-dressing pass.
 *
 * This street is a dense Middle-East market re-cast as "the old financial
 * quarter" of fintech satire. It is a SET-DRESSING pass on top of the existing
 * world — it adds signage, NerdCon banners, THE LEDGER set piece and a few
 * flavour props, and it MOVES NOTHING. Everything here is additive:
 *
 *   - Blade signs / banners / the ATM screen are standalone meshes with unique
 *     canvas-text materials, added straight to the world root. They carry no
 *     collision (every one sits above head height on a bracket, or hugs a wall).
 *   - Brackets, the Ledger monolith + plinth and the ATM body are merged into
 *     the Assembler's static batches so they cost near-nothing and weather with
 *     the street. Only the Ledger and the ATM add a collision proxy, and both
 *     are hand-placed clear of every lane, doorway and alley — the Ledger like
 *     a plaza monument, the ATM flat against a facade.
 *
 * The joke lives in the TEXT. The signs are sized, weathered and mounted like
 * real shopfront signage; the material logic of the world is untouched.
 */

// ---- brand palette (canvas text only — the world keeps its real materials) --
const C = {
  blue: '#3568FF',
  cyan: '#00E5FF',
  magenta: '#FF2D78',
  gold: '#FFD700',
  white: '#F0F0F0',
  cream: '#e7d9b6',
  ink: '#20242b',
};

// Muted, hand-mixed sign-board colours for the legacy trades.
const LEGACY_BOARDS = [
  { board: '#5a2a24', ink: C.cream }, // oxblood
  { board: '#20423a', ink: '#e8dcbf' }, // deep forest
  { board: '#20484d', ink: '#ecdfbe' }, // teal
  { board: '#3a3f5c', ink: '#e4d7b4' }, // indigo
  { board: '#5f4a1c', ink: '#f0e4c0' }, // ochre
  { board: '#402a2a', ink: '#d9c79a' }, // dark brick
];

// ============================================================ canvas signs ==

/** A CanvasTexture from a painted canvas, colour-managed and mip-mapped. */
function texFrom(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function newCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/**
 * Lay one or more centred lines of caps into the panel, auto-shrinking the
 * font until the widest line fits. `condense` squeezes glyphs horizontally so a
 * long legacy trade name still reads big — the hand-painted trade-sign move.
 */
function drawLines(g, W, H, lines, o) {
  const pad = W * (o.pad ?? 0.09);
  const maxW = W - pad * 2;
  const n = lines.length;
  const lineH = (H * (o.fill ?? 0.82)) / n;
  const condense = o.condense ?? 1;
  const measure = (p) => {
    g.font = `${o.weight} ${p}px ${o.family}`;
    g.letterSpacing = `${Math.max(0, p * (o.track ?? 0.02))}px`;
    let m = 0;
    for (const L of lines) m = Math.max(m, g.measureText(L).width * condense);
    return m;
  };
  let px = Math.floor(lineH * 0.86);
  while (px > 9 && measure(px) > maxW) px -= 1;
  g.font = `${o.weight} ${px}px ${o.family}`;
  g.letterSpacing = `${Math.max(0, px * (o.track ?? 0.02))}px`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(W / 2, H / 2);
  if (condense !== 1) g.scale(condense, 1);
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * lineH;
    if (o.shadow) {
      g.fillStyle = o.shadow;
      g.fillText(lines[i], (o.shadowDx ?? 2) / condense, y + (o.shadowDy ?? 2));
    }
    if (o.glow) {
      g.shadowColor = o.glow;
      g.shadowBlur = o.glowBlur ?? 0;
    }
    g.fillStyle = o.ink;
    g.fillText(lines[i], 0, y);
  }
  g.restore();
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
}

/** Scratches, flaked paint, grime gradient and a soft vignette. */
function weather(g, W, H, boardColor, rng, opts = {}) {
  const light = opts.light === true;
  // flecks of dust/paint
  const flecks = light ? 90 : 220;
  for (let i = 0; i < flecks; i++) {
    g.globalAlpha = 0.03 + rng.float() * (light ? 0.05 : 0.1);
    g.fillStyle = rng.float() < 0.5 ? '#000' : '#fff';
    const r = rng.float() * 2 + 0.4;
    g.fillRect(rng.float() * W, rng.float() * H, r, r);
  }
  if (!light) {
    // flaked paint: bits of the board showing back through the lettering
    g.fillStyle = boardColor;
    for (let i = 0; i < 46; i++) {
      g.globalAlpha = 0.35 + rng.float() * 0.4;
      const s = 1 + rng.float() * 4;
      g.fillRect(rng.float() * W, rng.float() * H, s, s);
    }
    // long weather scratches
    for (let i = 0; i < 9; i++) {
      g.globalAlpha = 0.05 + rng.float() * 0.1;
      g.strokeStyle = rng.float() < 0.5 ? '#000' : '#e9e2cf';
      g.lineWidth = 0.6 + rng.float();
      g.beginPath();
      const x0 = rng.float() * W;
      const y0 = rng.float() * H;
      g.moveTo(x0, y0);
      g.lineTo(x0 + (rng.float() - 0.5) * W * 0.6, y0 + (rng.float() - 0.5) * H * 0.4);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  // grime settling from the top and pooling at the bottom
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0.22)');
  grd.addColorStop(0.35, 'rgba(0,0,0,0.0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.24)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // corner vignette
  const rad = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
  rad.addColorStop(0, 'rgba(0,0,0,0)');
  rad.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = rad;
  g.fillRect(0, 0, W, H);
}

const CONDENSED = '"Arial Narrow", "Helvetica Neue", "Roboto Condensed", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
const PX_PER_M = 300;

/** Build the CanvasTexture for one sign face. Returns { texture, canvas }. */
function makeSignTexture(sign, rng) {
  const W = Math.min(1024, Math.round(sign.w * PX_PER_M));
  const H = Math.min(768, Math.round(sign.h * PX_PER_M));
  const cv = newCanvas(W, H);
  const g = cv.getContext('2d');
  const lines = sign.lines;

  if (sign.style === 'glow') {
    // A garish modern intruder: neon on a black panel. STABLECOIN LIQUORS.
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#161018');
    grd.addColorStop(1, '#060406');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const neon = sign.neon ?? C.magenta;
    g.strokeStyle = neon;
    g.lineWidth = Math.max(2.5, H * 0.03);
    g.shadowColor = neon;
    g.shadowBlur = H * 0.12;
    const m = H * 0.09;
    g.strokeRect(m, m, W - m * 2, H - m * 2);
    g.shadowBlur = 0;
    drawLines(g, W, H, lines, {
      family: MONO,
      weight: '700',
      condense: sign.condense ?? 0.98,
      track: 0.06,
      ink: neon,
      glow: neon,
      glowBlur: H * 0.14,
    });
    weather(g, W, H, '#0b0b0d', rng, { light: true });
    return { texture: texFrom(cv), canvas: cv };
  }

  if (sign.style === 'wayfind') {
    // NerdCon-blue wayfinding: white mono on brand blue. NERDCON EXPO HALL →.
    g.fillStyle = C.blue;
    g.fillRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(255,255,255,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(240,240,240,0.85)';
    g.lineWidth = Math.max(3, H * 0.05);
    const m = H * 0.1;
    g.strokeRect(m, m, W - m * 2, H - m * 2);
    drawLines(g, W, H, lines, {
      family: MONO,
      weight: '800',
      condense: sign.condense ?? 0.94,
      track: 0.04,
      ink: C.white,
    });
    weather(g, W, H, C.blue, rng, { light: true });
    return { texture: texFrom(cv), canvas: cv };
  }

  // legacy hand-painted trade sign (the default — most of the quarter is old).
  const skin = sign.skin ?? LEGACY_BOARDS[0];
  g.fillStyle = skin.board;
  g.fillRect(0, 0, W, H);
  // faint painted planks / brush drag
  for (let i = 0; i < 46; i++) {
    g.globalAlpha = 0.04 + rng.float() * 0.06;
    g.fillStyle = rng.float() < 0.5 ? '#000' : '#fff';
    g.fillRect(rng.float() * W, 0, 1 + rng.float() * 2, H);
  }
  g.globalAlpha = 1;
  // painted keyline frame, inset
  g.strokeStyle = skin.ink;
  g.globalAlpha = 0.8;
  const fl = Math.max(3, H * 0.035);
  g.lineWidth = fl;
  g.strokeRect(fl * 1.6, fl * 1.6, W - fl * 3.2, H - fl * 3.2);
  g.globalAlpha = 1;
  drawLines(g, W, H, lines, {
    family: CONDENSED,
    weight: '800',
    condense: sign.condense ?? 0.8,
    track: 0.015,
    ink: skin.ink,
    shadow: 'rgba(0,0,0,0.5)',
    shadowDx: 2.5,
    shadowDy: 3,
  });
  weather(g, W, H, skin.board, rng);
  return { texture: texFrom(cv), canvas: cv };
}

/** MeshStandardMaterial for a sign face, with restrained emissive where lit. */
function makeSignMaterial(sign, texture) {
  if (sign.style === 'glow') {
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      // Garish is the joke (STABLECOIN LIQUORS), but held back from the bloom
      // threshold so the neon stays hue-saturated magenta instead of a white core.
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
  if (sign.style === 'wayfind') {
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.2,
      roughness: 0.62,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.76,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

// ============================================================== placement ==

/** LEVEL -> WORLD matrix for a standalone mesh (mirrors the Assembler bake). */
function worldMatrix(A, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  const m = newTrs(x, y, z, ry, sx, sy, sz, rx, rz);
  m.premultiply(A.xform);
  return m;
}

function addStandalone(root, disp, mesh) {
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  disp.meshes.push(mesh);
}

/**
 * A projecting blade sign, mounted on a bracket off a street facade and facing
 * up-street toward the hero camera. The board is a thin double-sided textured
 * plane; the bracket arm + diagonal stay are merged into the metal batch. No
 * collision — the whole thing lives above the doorway.
 */
function bladeSign(A, root, disp, rng, sign) {
  const wallX = sign.side === 'W' ? -STREET.kerb : STREET.kerb; // -6.5 / +6.5
  const dir = sign.side === 'W' ? 1 : -1; // into the street
  const w = sign.w;
  const h = sign.h;
  const gap = 0.14; // clear of the wall face
  const cx = wallX + dir * (gap + w / 2);
  const cy = sign.y; // board centre height
  const z = sign.z;
  const topY = cy + h / 2;

  // face
  const { texture } = makeSignTexture(sign, rng);
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = makeSignMaterial(sign, texture);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `nerdcon_sign_${sign.id}`;
  mesh.matrix.copy(worldMatrix(A, cx, cy, z, 0));
  addStandalone(root, disp, mesh);
  disp.geometries.push(geo);
  disp.materials.push(mat);
  disp.textures.push(texture);

  // bracket: a wall plate, a top arm out to the board, and a diagonal stay.
  const armLen = gap + w + 0.06;
  const armY = topY + 0.05;
  A.addBox('metal_dark', BOX_FINE(A), wallX + dir * 0.06, armY, z, 0, 0.1, 0.16, 0.16, {
    masks: [0.9, 0.5, 0.1],
  });
  A.addBox('nerdcon_board', BOX_FINE(A), wallX + dir * (armLen / 2), armY, z, 0, armLen, 0.05, 0.05, {
    masks: [0.9, 0.5, 0.1],
  });
  // diagonal stay from low on the wall up to the outer end of the arm (rz tilt)
  const stayDx = armLen;
  const stayDy = 0.5;
  const stayLen = Math.hypot(stayDx, stayDy);
  const stayRz = dir * Math.atan2(stayDy, stayDx);
  A.add(
    'metal_rust',
    BOX_THIN(A),
    LL(IDENT, wallX + dir * (armLen / 2), armY - stayDy / 2, z, 0, stayLen, 0.035, 0.035, 0, stayRz),
    { masks: [0.95, 0.55, 0.1] }
  );
}

// ================================================================ banners ==

/** Cable y at world-x, following the same catenary the tube uses. */
function cableYAt(cable, x) {
  const [x0, y0, z0, x1, y1, z1, sag] = cable;
  const t = Math.abs(x1 - x0) < 1e-4 ? 0.5 : (x - x0) / (x1 - x0);
  const K = Math.cosh(1.5) - 1;
  const droop = (Math.cosh(1.5) - Math.cosh((t - 0.5) * 3)) / K;
  return { y: y0 + (y1 - y0) * t - sag * droop, z: z0 + (z1 - z0) * t };
}

/**
 * A NerdCon fabric banner slung under an existing overhead cable, spanning the
 * street and facing up-street. Built from the world's own cloth generator so it
 * bellies and creases like the laundry two spans over; canvas-text material,
 * hung with a few tie strings up to the wire.
 */
function banner(A, root, disp, rng, cable, spec) {
  const [x0, , z0, x1, , z1] = cable;
  const w = spec.w;
  const h = spec.h;
  const midX = (x0 + x1) / 2;
  const top = cableYAt(cable, midX);
  // Hang a clear span below the wire so the tie strings actually read as the
  // thing holding it up, instead of the banner appearing welded to the cable.
  const cy = top.y - 0.2 - h / 2;
  const cz = top.z;

  // canvas
  const W = Math.min(1400, Math.round(w * 200));
  const H = Math.min(420, Math.round(h * 220));
  const cv = newCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = spec.bg;
  g.fillRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0.14)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  grd.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // A faint printed trim, not a bright keyline: a low-contrast dark inset a few
  // percent in from the hem, so the banner reads as printed vinyl rather than a
  // composited UI panel with a white border.
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = Math.max(2, H * 0.02);
  const m = H * 0.16;
  g.strokeRect(m, m, W - m * 2, H - m * 2);
  drawLines(g, W, H, spec.lines, {
    family: MONO,
    weight: '800',
    condense: spec.condense ?? 1,
    track: spec.track ?? 0.05,
    ink: spec.ink ?? C.white,
    fill: 0.7,
  });
  weather(g, W, H, spec.bg, rng, { light: true });
  const texture = texFrom(cv);

  const geo = clothGeometry(w, h, {
    segX: 16,
    segY: 8,
    // A deeper catenary + belly so the banner visibly hangs and creases like the
    // laundry two spans over, instead of hovering flat like a panel.
    sag: 0.28,
    wrinkle: 0.045,
    bulge: 0.09,
    twist: 0.04,
    thickness: 0.004,
    rng,
    hem: 1,
  });
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    // Scene light carries the vinyl by day; only a whisper of self-glow, so it
    // stays legible at the dusk default without reading as a lit UI panel.
    emissiveIntensity: 0.09,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `nerdcon_banner_${spec.id}`;
  mesh.matrix.copy(worldMatrix(A, midX, cy, cz, 0));
  addStandalone(root, disp, mesh);
  disp.geometries.push(geo);
  disp.materials.push(mat);
  disp.textures.push(texture);

  // Grommets laced to the wire with tie cords. Five evenly spaced ties across the
  // span, each a dark cord from a brass hem eyelet up to the cable — the visible
  // connection that seats the banner on the span instead of floating it.
  const topEdge = cy + h / 2;
  for (const f of [-0.44, -0.22, 0, 0.22, 0.44]) {
    const tx = midX + f * w;
    const cAt = cableYAt(cable, tx);
    const len = Math.max(0.05, cAt.y - topEdge + 0.02);
    // the cord
    A.addBox('metal_dark', BOX_THIN(A), tx, topEdge + len / 2, cAt.z, 0, 0.014, len, 0.014, {
      masks: [0.4, 0.6, 0.2],
    });
    // the eyelet / grommet punched through the banner hem
    A.addBox('metal_rust', BOX_FINE(A), tx, topEdge - 0.015, cz + 0.006, 0, 0.055, 0.055, 0.02, {
      masks: [0.9, 0.5, 0.2],
    });
  }
}

// ============================================================== the ledger ==

/**
 * THE LEDGER — the plaza centrepiece, "the thing we're defending". A waist-high
 * gold monolith of stacked ledger-book forms on a low stone plinth, self-lit
 * with a subtle emissive the world pulses. Scenery only (no gameplay logic),
 * placed just west of the street centreline so it reads as a monument without
 * blocking the main sightline/lane through the plaza. One collision proxy, like
 * a wreck — the AI flows around it.
 */
function buildLedger(A, rng, x, z) {
  const gY = groundY(x, z);
  // two-tier stone plinth
  A.addBox('nerdcon_plinth', BOX(A), x, gY + 0.11, z, 0, 1.7, 0.22, 1.7, { masks: [0.35, 0.5, 0.6] });
  A.addBox('nerdcon_plinth', BOX(A), x, gY + 0.29, z, 0, 1.42, 0.16, 1.42, { masks: [0.3, 0.45, 0.5] });
  // a thin inlaid gold band around the plinth top — a bloom-friendly glow line
  A.addBox('nerdcon_gold', BOX_FINE(A), x, gY + 0.375, z, 0, 1.46, 0.03, 1.46, { masks: [0.2, 0.2, 0] });

  // stacked ledgers: flat gold "books", each smaller and slightly turned, so
  // the silhouette reads as a stack of ledgers rather than one gold brick.
  let y = gY + 0.4;
  const books = 6;
  for (let i = 0; i < books; i++) {
    const t = i / (books - 1);
    const bw = 1.16 - t * 0.24;
    const bd = 0.84 - t * 0.16;
    const bh = 0.115 - t * 0.012;
    const ry = (rng.float() - 0.5) * 0.16 + (i % 2 ? 0.05 : -0.05);
    const ox = (rng.float() - 0.5) * 0.05;
    const oz = (rng.float() - 0.5) * 0.05;
    const g = chamferBox(bw, bh, bd, 0.02);
    A.addBox('nerdcon_gold', g, x + ox, y + bh / 2, z + oz, ry, 1, 1, 1, {
      masks: [0.18 + rng.float() * 0.1, 0.15, 0.05],
    });
    g.dispose();
    // a slim darker "pages" fillet just under each cover reads as leaves
    A.addBox('nerdcon_plinth', BOX_FINE(A), x + ox, y + bh * 0.5, z + oz, ry, bw * 0.9, bh * 0.42, bd * 0.9, {
      masks: [0.3, 0.6, 0.4],
    });
    y += bh + 0.006;
  }
  // a small gold cap / seal on top
  A.addBox('nerdcon_gold', BOX(A), x, y + 0.06, z, 0.4, 0.34, 0.12, 0.34, { masks: [0.15, 0.15, 0] });

  // ONE collision proxy for the whole monument (waist-high, hugs its footprint)
  A.box('concrete', x, gY + 0.55, z, 1.5, 1.1, 1.5);
}

// ============================================================== flavour ==

/** A cash machine flat against the FEDWIRE & SONS facade — screen faces street. */
function buildATM(A, z, side) {
  const wallX = side === 'W' ? -STREET.kerb : STREET.kerb;
  const dir = side === 'W' ? 1 : -1;
  const depth = 0.42;
  const width = 0.66;
  const height = 1.52;
  const cx = wallX + dir * (0.03 + depth / 2);
  const gY = groundY(cx, z);
  const cyBody = gY + height / 2;
  // body
  A.addBox('nerdcon_kiosk', BOX(A), cx, cyBody, z, 0, depth, height, width, { masks: [0.5, 0.4, 0.3] });
  // dark head + shoulders
  A.addBox('metal_dark', BOX_FINE(A), cx + dir * 0.02, gY + height + 0.06, z, 0, depth + 0.05, 0.12, width + 0.05, {
    masks: [0.8, 0.5, 0.2],
  });
  // screen (emissive) recessed into the street-facing head — thin in X
  const faceX = cx + dir * (depth / 2 + 0.01);
  A.addBox('nerdcon_screen', BOX_THIN(A), faceX, gY + 1.14, z, 0, 0.03, 0.24, 0.34, { masks: [0, 0, 0] });
  // dark screen bezel, keypad shelf, cash slot
  A.addBox('metal_dark', BOX_FINE(A), faceX - dir * 0.01, gY + 1.14, z, 0, 0.03, 0.3, 0.4, { masks: [0.8, 0.55, 0.2] });
  A.addBox('metal_dark', BOX_FINE(A), faceX, gY + 0.9, z, 0, 0.06, 0.06, 0.3, { masks: [0.7, 0.6, 0.3] });
  A.addBox('metal_dark', BOX_FINE(A), faceX, gY + 1.0, z, 0, 0.05, 0.03, 0.34, { masks: [0.7, 0.6, 0.3] });
  // collision hugging the wall
  A.box('metal', cx, cyBody, z, depth, height, width);
}

/** A stack of PDF-statement boxes dumped outside a paper-heavy shop. */
function paperStack(A, rng, x, z, ry) {
  const boxes = ['box_card_a', 'box_card_b'];
  const gY = groundY(x, z);
  const n = rng.int(2, 3);
  let y = gY;
  for (let i = 0; i < n; i++) {
    const id = rng.pick(boxes);
    A.put(id, x + (rng.float() - 0.5) * 0.08, y + 0.02, z + (rng.float() - 0.5) * 0.08, ry + (rng.float() - 0.5) * 0.4, 1, [
      1,
      1.2,
      1,
    ]);
    y += 0.34;
  }
  // a loose flat one leaning at the base
  if (A.has('crate_flat')) {
    A.put('crate_flat', x + (rng.float() - 0.5) * 0.9, gY + 0.03, z + (rng.float() - 0.5) * 0.9, rng.float() * 6.28, 1, [1, 1.3, 1]);
  }
}

// ================================================================ registry ==

/**
 * The whole re-dress. Called last in the world build (after every existing
 * dressing pass) so nothing it does perturbs the placement RNG stream of the
 * street it sits on. Its own randomness comes from a dedicated seed.
 */
export function dressNerdcon(A, root, disp) {
  const rng = new Rng(0x4e4f44_01); // "NOD"
  const cables = SET_PIECES.cables;

  // ---- shop / wall signage ------------------------------------------------
  // Legacy trades read as weathered condensed caps; two modern intruders get
  // mono glow. Placed on both facades, facing up-street toward the hero camera.
  const Y = 2.4; // board centre — above the shopfront doors, below the setback
  const SIGNS = [
    // west row (x = -6.5, facing into the street)
    { id: 'cobol', side: 'W', z: 26.5, y: Y, w: 1.35, h: 0.78, lines: ['COBOL BROS', 'SINCE 1959'], skin: LEGACY_BOARDS[4] },
    { id: 'mt103', side: 'W', z: 15.0, y: Y, w: 1.25, h: 0.62, lines: ['MT-103 CAFÉ'], skin: LEGACY_BOARDS[2] },
    { id: 'fedwire', side: 'W', z: -1.5, y: Y + 0.05, w: 1.5, h: 0.72, lines: ['FEDWIRE', '& SONS'], skin: LEGACY_BOARDS[3] },
    { id: 'chargeback', side: 'W', z: -18.5, y: Y, w: 1.4, h: 0.74, lines: ['CHARGEBACK', 'BAIL BONDS'], skin: LEGACY_BOARDS[0] },
    { id: 'tplus2', side: 'W', z: -33.5, y: Y, w: 1.35, h: 0.66, lines: ['T+2 FREIGHT CO'], skin: LEGACY_BOARDS[5] },
    // east row (x = +6.5)
    { id: 'wireroom', side: 'E', z: 27.0, y: Y, w: 1.2, h: 0.6, lines: ['WIRE ROOM'], skin: LEGACY_BOARDS[1] },
    { id: 'kyc', side: 'E', z: 15.0, y: Y, w: 1.3, h: 0.66, lines: ['KYC BODEGA'], skin: LEGACY_BOARDS[4] },
    { id: 'stablecoin', side: 'E', z: -4.0, y: Y + 0.08, w: 1.45, h: 0.72, style: 'glow', neon: C.magenta, lines: ['STABLECOIN', 'LIQUORS'] },
    { id: 'interchange', side: 'E', z: -21.0, y: Y, w: 1.45, h: 0.74, lines: ['INTERCHANGE MKT', '2.9% + 30¢'], skin: LEGACY_BOARDS[3] },
    { id: 'expo', side: 'E', z: -37.0, y: Y + 0.1, w: 1.5, h: 0.6, style: 'wayfind', lines: ['NERDCON', 'EXPO HALL →'] },
  ];
  for (const s of SIGNS) bladeSign(A, root, disp, rng, s);

  // ---- NerdCon banners across the overhead cables -------------------------
  // cables (level z): #0 ~z11 (plaza), #1 ~z-1, #2 ~z-15, #3 ~z-29
  banner(A, root, disp, rng, cables[0], {
    id: 'hold', w: 5.0, h: 1.35, bg: C.magenta, lines: ['HOLD THE LEDGER'], track: 0.08,
  });
  banner(A, root, disp, rng, cables[1], {
    id: 'nerdcon', w: 5.4, h: 1.4, bg: C.blue, lines: ['FINTECH NERDCON'], track: 0.06,
  });
  banner(A, root, disp, rng, cables[2], {
    id: 'date', w: 5.2, h: 1.3, bg: C.blue, lines: ['NOV 19–20 · SAN DIEGO'], track: 0.03, condense: 0.96,
  });
  banner(A, root, disp, rng, cables[3], {
    id: 'nerdcon2', w: 5.0, h: 1.3, bg: C.blue, lines: ['FINTECH NERDCON'], track: 0.06,
  });

  // ---- THE LEDGER ---------------------------------------------------------
  buildLedger(A, rng, -1.7, 8.6);

  // ---- flavour props ------------------------------------------------------
  // ATM at FEDWIRE's north corner pier — clear of the shop's mid-facade doorway
  // (W2 is the enterable shop; its opening is mid-span at ~z-1.5).
  buildATM(A, 3.8, 'W');
  paperStack(A, rng, -5.85, 1.2, -0.5); // PDF statements dumped outside FEDWIRE
  paperStack(A, rng, 5.9, 13.6, 0.4); // outside KYC BODEGA
  paperStack(A, rng, 5.85, 18.6, -0.3);
}
