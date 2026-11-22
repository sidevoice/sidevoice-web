// The offline wanted poster: ported from the frozen design reference's creator (reference/2026-11-04/src/creator.js,
// SHA-256 ee99a60d…: posterScene, posterPaper, worn, scroll, drawPoster with its lay and tack, satellite; T12–T14), its
// code, constants, curves and timings unchanged, line for line, so it diffs against the reference. What the creator read
// from its own globals comes in as arguments, each marked "product:": the tile's size (its PXW and PX), the creature's
// portrait (posterPortrait: creature/host.ts), the seed its paper and bounty are rolled from (the creature's choices,
// joined as the creator joins them: posterSeed), the words (i18n, stage.poster.*), the backdrop and the creature's feet,
// and the clock. poster.d.ts declares what TypeScript reads of it; stage-paint.ts lays it on the stage.
import { BACKDROPS, frameOf } from './backdrops.js';

// ---------- wanted poster (offline): a closer nod to the One Piece bounty poster, in the toon style ----------
// Aged, stained paper; WANTED in a heavy display serif; the creature's photo framed against a sea scene; the status in
// the name line's place; the bounty with the token sign in the bounty's heavy number style; the fine print and the
// issuer in the footer, as the marine's posters set them. The words are the product's (i18n/locales/en.ts).
// product: the poster's words are translated and Canvas takes no CSS variable, so the faces the page names for scripts the
// Latin ones lack (theme.css --sv-font-cjk and --sv-font-indic: Han, Kana, Hangul, Devanagari) follow the Latin ones.
const SCRIPTS = '"PingFang SC", "Hiragino Sans", "Apple SD Gothic Neo", "Malgun Gothic", "Microsoft YaHei", "Yu Gothic", "Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans CJK KR", "Noto Sans KR", "Kohinoor Devanagari", "Devanagari Sangam MN", "Nirmala UI", "Noto Sans Devanagari", "Mangal"';
const SERIF = `"Times New Roman", "Bodoni 72", "DejaVu Serif", Georgia, ${SCRIPTS}, serif`, SERIF_C = `"Times New Roman", "DejaVu Serif Condensed", "DejaVu Serif", Georgia, ${SCRIPTS}, serif`;
export function seedNum(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function fitText(g, text, x, y, width, font, align = 'center', heavy = 0) {
  g.font = font; const w = g.measureText(text).width; g.save(); g.translate(x, y); g.scale(Math.min(1, width / w), 1); g.textAlign = align;
  if (heavy) { g.lineWidth = heavy; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle; g.strokeText(text, 0, 0); } // a heavier weight than the font has
  g.fillText(text, 0, 0); g.restore();
}
export const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// product: the seed a creature's paper and bounty are rolled from, as the creator joins its choices (drawPoster's seed)
export const posterSeed = (c) => [c.body, c.color, c.accent, c.iris, c.ears, c.head, c.face].join('|');
// product: the bounty as the creator rolls it (drawPoster), in the interface's language
export const posterBounty = (seed, language) => new Intl.NumberFormat(language).format((100 + (seedNum(seed) % 900)) * 1e6) + '-';
// the photo's backdrop: sky and sea, a far island, a sandy foreground for it to stand on (flat toon shapes)
function posterScene(g, w, h, r) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, '#8ccbef'); sky.addColorStop(1, '#dff2fb'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffffd0'; [[0.2, 0.2, 0.22], [0.78, 0.13, 0.18], [0.55, 0.32, 0.12]].forEach(([x, y, s]) => { const cx = x * w, cy = y * h, rr = s * w; g.beginPath(); [[-0.5, 0.1, 0.42], [-0.1, -0.12, 0.55], [0.35, 0, 0.42], [0.65, 0.12, 0.28]].forEach(([dx, dy, k]) => { g.moveTo(cx + dx * rr + k * rr, cy + dy * rr); g.arc(cx + dx * rr, cy + dy * rr, k * rr, 0, 7); }); g.rect(cx - 0.8 * rr, cy + 0.05 * rr, 1.6 * rr, 0.25 * rr); g.fill(); });
  g.fillStyle = '#7fb38c'; g.beginPath(); g.ellipse(w * 0.14, h * 0.62, w * 0.16, h * 0.07, 0, Math.PI, 0); g.fill(); // a far island
  const sea = g.createLinearGradient(0, h * 0.62, 0, h); sea.addColorStop(0, '#5aa8d6'); sea.addColorStop(1, '#3a86bb'); g.fillStyle = sea; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.strokeStyle = '#ffffffa0'; g.lineWidth = Math.max(2, w / 160); g.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const y = h * (0.66 + r() * 0.2), x = r() * w, l = w * (0.05 + r() * 0.07); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - h * 0.012, x + l, y); g.stroke(); }
  g.fillStyle = '#f2dcae'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.86); g.quadraticCurveTo(w * 0.5, h * 0.8, w, h * 0.87); g.lineTo(w, h); g.fill();
}
// paper: an uneven torn edge, gradient, fibres and speckles, stains with darker rims, two folds, burnt edges
function posterPaper(g, x0, y0, w, h, r) {
  const edge = [], step = 12;
  for (let x = 0; x <= w; x += step) edge.push([x0 + x, y0 + (r() - 0.5) * 5]);
  for (let y = step; y <= h; y += step) edge.push([x0 + w + (r() - 0.5) * 5, y0 + y]);
  for (let x = w - step; x >= 0; x -= step) edge.push([x0 + x, y0 + h + (r() - 0.5) * 5]);
  for (let y = h - step; y > 0; y -= step) edge.push([x0 + (r() - 0.5) * 5, y0 + y]);
  const path = () => { g.beginPath(); edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  g.save(); path(); g.fillStyle = 'rgba(40,25,10,.28)'; g.translate(12, 16); g.fill(); g.restore(); // drop shadow
  path(); const pg = g.createLinearGradient(x0, y0, x0 + w * 0.3, y0 + h); pg.addColorStop(0, '#efdcae'); pg.addColorStop(1, '#e3c995'); g.fillStyle = pg; g.fill();
  g.save(); path(); g.clip();
  for (let i = 0; i < 1100; i++) { g.strokeStyle = `rgba(110,75,35,${0.04 + r() * 0.08})`; g.lineWidth = 0.8 + r(); const x = x0 + r() * w, y = y0 + r() * h, a = (r() - 0.5) * 0.8, l = 3 + r() * 9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(95,60,25,${0.04 + r() * 0.16})`; g.beginPath(); g.arc(x0 + r() * w, y0 + r() * h, 0.4 + r() * 1.2, 0, 7); g.fill(); }
  for (let i = 0; i < 7; i++) { // stains: a soft blot with a darker rim, a couple of satellites
    const cx = x0 + r() * w, cy = y0 + r() * h, rr = 14 + r() * 48;
    for (let j = 0; j < 3; j++) { const sx = cx + (r() - 0.5) * rr, sy = cy + (r() - 0.5) * rr, s = rr * (j ? 0.25 + r() * 0.35 : 1); const sg = g.createRadialGradient(sx, sy, s * 0.2, sx, sy, s); sg.addColorStop(0, 'rgba(160,110,50,.05)'); sg.addColorStop(0.85, 'rgba(150,100,40,.13)'); sg.addColorStop(1, 'rgba(120,80,30,0)'); g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, s, 0, 7); g.fill(); }
  }
  for (const [ax, ay, bx, by] of [[x0, y0 + h * 0.46, x0 + w, y0 + h * 0.47], [x0 + w * 0.5, y0, x0 + w * 0.49, y0 + h]]) { // folds
    g.strokeStyle = 'rgba(255,248,230,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = 'rgba(120,80,40,.18)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ax + 1.5, ay + 1.5); g.lineTo(bx + 1.5, by + 1.5); g.stroke();
  }
  for (const [gx0, gy0, gx1, gy1, fx, fy, fw, fh] of [[x0, 0, x0 + 46, 0, x0, y0, 46, h], [x0 + w, 0, x0 + w - 46, 0, x0 + w - 46, y0, 46, h], [0, y0, 0, y0 + 46, x0, y0, w, 46], [0, y0 + h, 0, y0 + h - 46, x0, y0 + h - 46, w, 46]]) {
    const bg = g.createLinearGradient(gx0, gy0, gx1, gy1); bg.addColorStop(0, 'rgba(120,70,20,.38)'); bg.addColorStop(1, 'rgba(120,70,20,0)'); g.fillStyle = bg; g.fillRect(fx, fy, fw, fh);
  }
  g.restore();
  path(); g.strokeStyle = 'rgba(70,45,20,.55)'; g.lineWidth = 2; g.stroke();
}
// worn print: ink with flecks of paper showing through
function worn(g, draw, r, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const t = c.getContext('2d'); draw(t);
  t.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < (w * h) / 260; i++) { t.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.5})`; t.beginPath(); t.arc(r() * w, r() * h, 0.5 + r() * 1.6, 0, 7); t.fill(); }
  g.drawImage(c, 0, 0);
}
function scroll(g, x, y, s, flip) { // the product's side flourish
  g.save(); g.translate(x, y); g.scale(flip ? -s : s, s); g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath();
  g.moveTo(7, 1); g.quadraticCurveTo(1, 2, 2.5, 7); g.quadraticCurveTo(4, 11, 1, 13); g.quadraticCurveTo(5, 16, 2.5, 20); g.quadraticCurveTo(0.5, 25, 4, 27.5); g.quadraticCurveTo(7.5, 30, 5, 34); g.quadraticCurveTo(3.5, 36.5, 7, 37); g.stroke();
  g.beginPath(); g.arc(7, 1.3, 1.2, 0, 7); g.arc(7, 36.7, 1.2, 0, 7); g.fill(); g.restore();
}
// The poster is drawn once (the art, at the size it is shown) and then laid on the backdrop, so space can move it.
// Where it goes: centred on the tile, as large as fits (the default), or where a backdrop asks for it (its `poster`, in
// frame units: the room's wall between the window and the shelf, the bookshelf's floor between its two units).
// How it hangs (the product's rule, backdrop.ts data-hang, and the operator's review, T14): 'mount' (the scene draws
// what holds it: a post, a lamp post, balloons, an anchor's rope, a candy cane), 'pin' (a wall or a plain ground: one
// tack in its top-left corner, drooping to the right around it), 'nail' (the forest's trunk: one nail at its top
// centre), 'lean' (the bookshelf: standing on the floor against the wall, a shadow at its foot), 'float' (space: it
// tumbles slowly, tethered to a little satellite).
// product: drawPoster in three parts, so the stage keeps the art and lays it again on each tick: posterPlace (where it
// goes and how large), posterArt (the art) and layPoster (on the backdrop, at a moment).
export const INK = '#2b1f16', PW = 610, PH = 880, MARGIN = 40;
// product: where the poster goes on a W x PX tile (drawPoster's opening lines). id: the backdrop (null: none, pinned);
// feet: the creature's feet, px from the tile's top (the creator's feetY()).
export function posterPlace(W, PX, id, feet) {
  const pw = PW, ph = PH, y0 = -ph / 2;
  const spec = id && BACKDROPS[id] && BACKDROPS[id].poster;
  // a size smaller everywhere (operator, 2026-11-04: clear of the agent's name), about its centre
  const SMALL = 0.84;
  let pk = SMALL * Math.min(0.86, (W * 0.9) / 610, (PX * 0.9) / 880), cx = W / 2, cy = PX / 2 + 4; // fits the tile, desktop or phone
  if (spec) { const f = frameOf(W, PX, feet); pk = (SMALL * (spec.bottom - spec.top) * f.s) / ph; cx = f.tx + spec.cx * f.s; cy = f.ty + ((spec.top + spec.bottom) / 2) * f.s; }
  const box = { cx, top: cy + y0 * pk, bottom: cy - y0 * pk, half: (pw / 2) * pk };
  return { pk, cx, cy, box };
}
// product: the art, on its own canvas (drawPoster's middle). pic: the portrait ({ img, box }: posterPortrait), or null
// where no creature can be drawn (the photo keeps its sea scene); seed: posterSeed; words: { title, status, fine[3] };
// bounty: posterBounty.
export function posterArt(pic, pk, seed, words, bounty) {
  const r = rngOf(seedNum(seed));
  const ink = INK, pw = PW, ph = PH, x0 = -pw / 2, y0 = -ph / 2, M = MARGIN;
  const POSTER = words; // product: the words, from i18n
  // the art, on its own canvas (a margin for its drop shadow)
  const art = document.createElement('canvas'); art.width = Math.ceil((pw + 2 * M) * pk); art.height = Math.ceil((ph + 2 * M) * pk);
  const g = art.getContext('2d'); g.translate((M + pw / 2) * pk, (M + ph / 2) * pk); g.scale(pk, pk);
  posterPaper(g, x0, y0, pw, ph, r);
  // the photo: sea scene, the creature fitted inside with its hat (bottom on the sand), an aged tint, a thin frame
  const fx = x0 + 48, fy = y0 + 182, fw = pw - 96, fh = 388, s2 = 2;
  const ph2 = document.createElement('canvas'); ph2.width = fw * s2; ph2.height = fh * s2; const p = ph2.getContext('2d');
  posterScene(p, ph2.width, ph2.height, r);
  if (pic) { const [bx, by, bw, bh] = pic.box, k = Math.min((ph2.width * 0.8) / bw, (ph2.height * 0.86) / bh), dw = bw * k, dh = bh * k;
    p.drawImage(pic.img, bx, by, bw, bh, (ph2.width - dw) / 2, ph2.height * 0.95 - dh, dw, dh); }
  p.globalCompositeOperation = 'multiply'; p.fillStyle = 'rgba(240,215,160,.32)'; p.fillRect(0, 0, ph2.width, ph2.height); p.globalCompositeOperation = 'source-over';
  g.drawImage(ph2, fx, fy, fw, fh);
  g.lineWidth = 4; g.strokeStyle = ink; g.strokeRect(fx, fy, fw, fh);
  // the words, worn into the paper
  g.save(); g.translate(x0, y0);
  worn(g, (t) => {
    t.fillStyle = ink; t.strokeStyle = ink;
    t.letterSpacing = '5px'; fitText(t, POSTER.title, pw / 2, 158, pw - 64, `bold 172px ${SERIF}`, 'center', 7); t.letterSpacing = '0px';
    // name line, between the side flourishes and two rules
    const ny = fy - y0 + fh + 84;
    t.lineWidth = 2; t.beginPath(); t.moveTo(70, ny - 64); t.lineTo(pw - 70, ny - 64); t.stroke();
    scroll(t, 30, ny - 58, 2.1, false); scroll(t, pw - 30, ny - 58, 2.1, true);
    fitText(t, POSTER.status, pw / 2, ny, pw - 150, `bold 68px ${SERIF}`, 'center', 3);
    // bounty: the token sign (a T crossed twice), then whole millions with the trailing dash
    const byy = ny + 92; // product: the bounty comes in (posterBounty)
    t.save(); t.translate(86, byy - 62); t.scale(4.6, 4.6); t.lineWidth = 2.1; t.lineCap = 'butt'; t.beginPath(); t.moveTo(0.6, 2); t.lineTo(9.4, 2); t.moveTo(5, 2); t.lineTo(5, 12.6); t.quadraticCurveTo(5, 14, 3, 14); t.moveTo(0.8, 5.8); t.lineTo(9.2, 5.8); t.moveTo(1.4, 9.2); t.lineTo(8.6, 9.2); t.stroke(); t.restore();
    t.letterSpacing = '2px'; fitText(t, bounty, 146, byy, pw - 190, `bold 84px ${SERIF_C}`, 'left', 3); t.letterSpacing = '0px';
    t.lineWidth = 2; t.beginPath(); t.moveTo(70, byy + 22); t.lineTo(pw - 70, byy + 22); t.stroke();
    // footer: the fine print at the left, the issuer at the right
    POSTER.fine.forEach((line, i) => fitText(t, line, 40, ph - 76 + i * 17, 300, `bold 13px "DejaVu Sans", Arial, ${SCRIPTS}, sans-serif`, 'left'));
    // The issuer is the product's name, which is not translated.
    t.letterSpacing = '2px'; fitText(t, 'SIDEVOICE', pw - 40, ph - 42, 200, `bold 44px ${SERIF}`, 'right', 2); t.letterSpacing = '0px';
  }, r, pw, ph);
  g.restore();
  return art;
}
const tackAt = (G, x, y, pk) => { const ink = INK; G.save(); G.translate(x, y); G.scale(Math.max(pk, 0.5), Math.max(pk, 0.5)); /* a small poster keeps a tack that reads */ G.fillStyle = '#d8434e'; G.strokeStyle = ink; G.beginPath(); G.arc(0, 0, 17, 0, 7); G.fill(); G.lineWidth = 4; G.stroke(); G.fillStyle = '#ffffffaa'; G.beginPath(); G.arc(-6, -6, 5, 0, 7); G.fill(); G.restore(); };
// product: whether the poster moves on its own on this backdrop (the creator's timer): it floats in space, and on the
// clouds the balloons bob and the poster sways with them
export const posterMoves = (id, hang) => hang === 'float' || (id === 'clouds' && hang === 'mount');
// product: the poster laid on the backdrop at moment t, seconds (drawPoster's lay). bg: the tile's canvas; ground: the
// backdrop with its mount, as drawn for the poster at rest (a canvas the tile's size); drawBg(box, t): draws the backdrop
// and its mount for a box at t on bg (the clouds' balloons move with t). place: posterPlace; art: posterArt.
export function layPoster(bg, { W, PX, id, hang, place, art, ground, drawBg }, t) {
  const { pk, cx, cy, box } = place, pw = PW, ph = PH, x0 = -pw / 2, y0 = -ph / 2, M = MARGIN;
  const u = pk * 3.315; // u: the product's poster unit (its poster is 184 wide), in px
  // the clouds: the balloons bob and the poster under them sways a little with them (operator, 2026-11-04: as in space)
  const bob = id === 'clouds' && hang === 'mount';
  let rot = -0.022, piv = [0, 0], dx = 0, dy = 0;
  bg.setTransform(1, 0, 0, 1, 0, 0);
  if (bob && t > 0) { dy = Math.sin(t * 1.1) * 4 * pk; rot = -0.022 + 0.02 * Math.sin(t * 0.8); piv = [0, y0 * pk]; drawBg({ cx: box.cx, top: box.top + dy, bottom: box.bottom + dy, half: box.half }, t); }
  else { bg.clearRect(0, 0, W, PX); bg.drawImage(ground, 0, 0); }
  bg.save(); bg.translate(cx, cy);
  if (hang === 'pin') { rot = 0.03; piv = [(x0 + 40) * pk, (y0 + 26) * pk]; }
  if (hang === 'lean') { rot = -0.035; piv = [0, -y0 * pk]; bg.fillStyle = 'rgba(40,25,10,.28)'; bg.beginPath(); bg.ellipse(6 * pk, -y0 * pk + 4 * pk, pw * 0.56 * pk, 22 * pk, 0, 0, 7); bg.fill(); }
  if (hang === 'float') { rot = -0.1 + 0.07 * Math.sin(t * 0.5); dy = Math.sin(t * 0.37) * 14 * pk; dx = Math.sin(t * 0.23) * 8 * pk; }
  bg.translate(dx + piv[0], dy + piv[1]); bg.rotate(rot); bg.translate(-piv[0], -piv[1]);
  bg.drawImage(art, -(M + pw / 2) * pk, -(M + ph / 2) * pk);
  if (hang === 'pin') tackAt(bg, (x0 + 40) * pk, (y0 + 26) * pk, pk);
  if (hang === 'nail') tackAt(bg, 0, (y0 + 26) * pk, pk);
  const corner = new DOMPoint((-x0 - 30) * pk, (y0 + 30) * pk).matrixTransform(bg.getTransform()); // the tether's clip, top right
  bg.restore();
  if (hang === 'float') satellite(bg, t, corner, box, u, W);
}
// a little satellite (toon: flat fills, a lit band, a deep outline), holding the poster on a coiled tether: at the poster's
// right where the tile has room, else above it
function satellite(g, t, corner, box, u, W) { // product: W, the tile's width (the creator's PXW)
  const room = W - (box.cx + box.half), k = u * 0.8, line = '#2c2a4a';
  const sx = room > 150 * k ? box.cx + box.half + Math.min(room * 0.5, 110 * k) : box.cx + box.half * 0.55, sy = (room > 150 * k ? box.top + (box.bottom - box.top) * 0.42 : box.top - 62 * k) + Math.sin(t * 0.6) * 6 * k, rot = -0.25 + Math.sin(t * 0.4) * 0.12;
  // the tether: a sagging coil from the satellite's arm to the poster's corner
  const ax = sx - 24 * k * Math.cos(rot), ay = sy - 24 * k * Math.sin(rot) + 10 * k, mx = (ax + corner.x) / 2, my = (ay + corner.y) / 2 + 40 * k;
  g.save(); g.lineCap = 'round'; g.strokeStyle = '#e7e3f4'; g.lineWidth = 2.6 * k; g.beginPath();
  for (let i = 0; i <= 40; i += 1) { const q = i / 40, bx = (1 - q) * (1 - q) * ax + 2 * q * (1 - q) * mx + q * q * corner.x, by = (1 - q) * (1 - q) * ay + 2 * q * (1 - q) * my + q * q * corner.y, w = Math.sin(q * Math.PI * 14) * 3.2 * k; i ? g.lineTo(bx + w * 0.4, by + w) : g.moveTo(bx, by); }
  g.stroke(); g.fillStyle = '#9aa0c8'; g.beginPath(); g.arc(corner.x, corner.y, 5 * k, 0, 7); g.fill(); g.restore();
  g.save(); g.translate(sx, sy); g.rotate(rot); g.scale(k, k); g.lineJoin = 'round'; g.lineWidth = 3;
  // solar panels on their struts, a gold body, a dish, a blinking light
  g.strokeStyle = line; g.beginPath(); g.moveTo(-60, 0); g.lineTo(60, 0); g.stroke();
  for (const sgn of [-1, 1]) { const px = sgn > 0 ? 26 : -74; g.fillStyle = '#5b78d6'; g.fillRect(px, -15, 48, 30); g.fillStyle = '#7e98e6'; g.fillRect(px, -15, 48, 11); g.strokeStyle = line; g.strokeRect(px, -15, 48, 30); g.lineWidth = 1.5; g.beginPath(); for (const gx of [16, 32]) { g.moveTo(px + gx, -15); g.lineTo(px + gx, 15); } g.moveTo(px, 0); g.lineTo(px + 48, 0); g.stroke(); g.lineWidth = 3; }
  const body = new Path2D(); body.roundRect(-20, -18, 40, 36, 7); g.fillStyle = '#f0c25a'; g.fill(body); g.save(); g.clip(body); g.fillStyle = '#d99a32'; g.fillRect(4, -18, 20, 36); g.restore(); g.strokeStyle = line; g.stroke(body);
  g.beginPath(); g.moveTo(0, -18); g.lineTo(0, -28); g.stroke(); g.fillStyle = '#e9e4da'; g.beginPath(); g.ellipse(0, -32, 13, 6, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = Math.sin(t * 3) > 0 ? '#ff6b6b' : '#7a3a4a'; g.beginPath(); g.arc(-10, -8, 3.4, 0, 7); g.fill();
  g.strokeStyle = line; g.beginPath(); g.moveTo(-20, 6); g.lineTo(-30, 14); g.stroke(); // the arm the tether hangs from
  g.restore();
}
