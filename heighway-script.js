/* ═══════════════════════════════════════════════════════════
   Heighway Dragon — heighway-script.js
   Modes: Tiling (4 rotated copies), Boundary (4-component IFS),
          Paper Fold (turn sequence), L-System (FX grammar)
   ═══════════════════════════════════════════════════════════ */

const PAL = {
  violet: '#a78bfa', teal: '#2dd4bf', coral: '#fb7185',
  blue: '#60a5fa',   amber: '#fbbf24',
};
const TILE_COLORS = ['#a78bfa','#2dd4bf','#fb7185','#fbbf24'];
const BOUND_COLORS = { red:'#ef4444', blue:'#3b82f6', orange:'#f97316', green:'#22c55e' };

const VW = 700, VH = 520, PAD = 36;
let currentMode = 'tiling';
let currentSVG  = '';

/* ══════════════════════════════════════════════════════════
   DRAGON CURVE — paper fold turn sequence (integer grid)
   DX/DY for 4 cardinal directions (y-down)
   ══════════════════════════════════════════════════════════ */
function paperFoldTurns(n) {
  let t = [1];
  for (let i = 1; i < n; i++) {
    const c = [...t]; t.push(1);
    for (let j = c.length - 1; j >= 0; j--) t.push(c[j] === 1 ? 0 : 1);
  }
  return t;
}

function buildDragon(turns) {
  const DX = [1, 0, -1, 0], DY = [0, -1, 0, 1];
  let dir = 0, x = 0, y = 0;
  const pts = [{ x, y }];
  for (const t of turns) {
    dir = (dir + (t === 1 ? 3 : 1) + 4) % 4;
    x += DX[dir]; y += DY[dir];
    pts.push({ x, y });
  }
  return pts;
}

/* ── Rotate a set of points by k*90° around origin ── */
function rotate90(pts, k) {
  const r = ((k % 4) + 4) % 4;
  return pts.map(p => {
    let x = p.x, y = p.y;
    for (let i = 0; i < r; i++) { const t = x; x = -y; y = t; }
    return { x, y };
  });
}

/* ── Fit an array of point-sets to the viewport ── */
function makeFitMulti(allPts) {
  const flat = allPts.flat();
  const xs = flat.map(p => p.x), ys = flat.map(p => p.y);
  const mnX = Math.min(...xs), mxX = Math.max(...xs);
  const mnY = Math.min(...ys), mxY = Math.max(...ys);
  const sc  = Math.min((VW - PAD*2)/(mxX - mnX || 1), (VH - PAD*2)/(mxY - mnY || 1));
  const ox  = (VW - (mxX - mnX)*sc)/2 - mnX*sc;
  const oy  = (VH - (mxY - mnY)*sc)/2 - mnY*sc;
  return p => ({ x: +(p.x*sc + ox).toFixed(2), y: +(p.y*sc + oy).toFixed(2) });
}

function hslC(i, t) { return `hsl(${Math.round(i/t*360)},72%,58%)`; }

function polyPath(pts, close = false) {
  if (!pts || pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`;
  return close ? d + ' Z' : d;
}

/* ══════════════════════════════════════════════════════════
   BOUNDARY — IFS chaos game for each of 4 sub-boundaries
   Each has 3 affine maps; run chaos game per component.
   ══════════════════════════════════════════════════════════ */
function applyAffine(a, b, c, d, tx, ty, x, y) {
  return { x: a*x + b*y + tx, y: c*x + d*y + ty };
}

const BOUNDARY_IFS = {
  red: [
    (x,y) => applyAffine( 0.5,-0.5, 0.5, 0.5,   0,   0,  x,y),
    (x,y) => applyAffine(-0.25,-0.25, 0.25,-0.25, 0.5, 0.5, x,y),
    (x,y) => applyAffine( 0.25, 0.25,-0.25, 0.25, 0.5, 0.5, x,y),
  ],
  blue: [
    (x,y) => applyAffine( 0.5,-0.5, 0.5, 0.5,   0,   0,  x,y),
    (x,y) => applyAffine(-0.25,-0.25, 0.25,-0.25, 0.5, 0,  x,y),
    (x,y) => applyAffine( 0.25, 0.25,-0.25, 0.25, 0.5, 0,  x,y),
  ],
  orange: [
    (x,y) => applyAffine( 0.5,-0.5, 0.5, 0.5,  0.5,-0.5, x,y),
    (x,y) => applyAffine(-0.25,-0.25, 0.25,-0.25, 1,  -0.5, x,y),
    (x,y) => applyAffine( 0.25, 0.25,-0.25, 0.25, 0.5,  0,  x,y),
  ],
  green: [
    (x,y) => applyAffine( 0.5,-0.5, 0.5, 0.5,  0.5,-0.5, x,y),
    (x,y) => applyAffine(-0.25,-0.25, 0.25,-0.25, 1,   0,  x,y),
    (x,y) => applyAffine( 0.25, 0.25,-0.25, 0.25, 0.5, 0.5, x,y),
  ],
};

function chaosGame(maps, dots, warmup = 50) {
  let x = 0.5, y = 0.25;
  const pts = [];
  const n = maps.length;
  for (let i = 0; i < dots + warmup; i++) {
    const f = maps[Math.floor(Math.random() * n)];
    const r = f(x, y); x = r.x; y = r.y;
    if (i >= warmup) pts.push({ x, y });
  }
  return pts;
}

/* ══════════════════════════════════════════════════════════
   L-SYSTEM
   ══════════════════════════════════════════════════════════ */
function lsystemDragon(n) {
  const rules = { F:'Z', X:'+FX--FY+', Y:'-FX++FY-' };
  let s = 'FX';
  for (let i = 0; i < n; i++) {
    let ns = '';
    for (const ch of s) ns += rules[ch] !== undefined ? rules[ch] : ch;
    s = ns;
  }
  const D = Math.PI / 4;
  let x = 0, y = 0, a = 0;
  const pts = [{ x, y }];
  for (const ch of s) {
    if (ch === 'F') { x += Math.cos(a); y += Math.sin(a); pts.push({ x, y }); }
    else if (ch === '+') a += D;
    else if (ch === '-') a -= D;
  }
  return pts;
}

/* ══════════════════════════════════════════════════════════
   BOUNDARY EDGE detection (integer grid)
   ══════════════════════════════════════════════════════════ */
function segKey(p1, p2) {
  const a = `${p1.x},${p1.y}`, b = `${p2.x},${p2.y}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function findBoundaryEdges(pts) {
  const count = {}, edgeMap = {};
  for (let i = 0; i < pts.length - 1; i++) {
    const key = segKey(pts[i], pts[i+1]);
    count[key] = (count[key] || 0) + 1;
    edgeMap[key] = { p1: pts[i], p2: pts[i+1] };
  }
  return Object.keys(count).filter(k => count[k] === 1).map(k => edgeMap[k]);
}
function chainEdges(edges) {
  if (!edges.length) return [];
  const pk = p => `${p.x},${p.y}`, adj = {};
  for (const e of edges) {
    const ka = pk(e.p1), kb = pk(e.p2);
    if (!adj[ka]) adj[ka] = [];
    if (!adj[kb]) adj[kb] = [];
    adj[ka].push({ key: kb, pt: e.p2 });
    adj[kb].push({ key: ka, pt: e.p1 });
  }
  const startKey = Object.keys(adj)[0];
  const ring = []; let cur = startKey, prev = null;
  while (true) {
    const nbs = adj[cur] || []; let next = null;
    for (const nb of nbs) { if (nb.key !== prev) { next = nb; break; } }
    if (!next || next.key === startKey) break;
    ring.push(next.pt); prev = cur; cur = next.key;
  }
  return ring;
}

/* ══════════════════════════════════════════════════════════
   LATTICE GRID SVG (for tiling mode)
   ══════════════════════════════════════════════════════════ */
function latticeGridSVG(fit, turns) {
  // Grid step in integer-grid units = 1 (each dragon step)
  // We just draw grid lines at every integer lattice point in view
  const step = 1;
  const xs = [-20,-19,-18,-17,-16,-15,-14,-13,-12,-11,-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,
               0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
  let svg = '<g opacity="0.12">';
  for (const v of xs) {
    const a = fit({ x: v, y: -20 }), b = fit({ x: v, y: 20 });
    const c = fit({ x: -20, y: v }), d = fit({ x: 20, y: v });
    svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fff" stroke-width="0.5"/>`;
    svg += `<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" stroke="#fff" stroke-width="0.5"/>`;
  }
  svg += '</g>';
  return svg;
}

/* ══════════════════════════════════════════════════════════
   DRAW
   ══════════════════════════════════════════════════════════ */
function draw() {
  const depth    = +document.getElementById('depth').value;
  const copies   = +document.getElementById('copies').value;
  const bcomp    = document.getElementById('bcomp').value;
  const scheme   = document.getElementById('scheme').value;
  const sw       = +document.getElementById('sw').value;
  const rain     = document.getElementById('rainbow').value === 'on';
  const showGrid = document.getElementById('showgrid').value === 'on';

  document.getElementById('dv').textContent  = depth;
  document.getElementById('swv').textContent = sw;

  const color = PAL[scheme];
  let svgContent = '';

  /* ─── TILING ─────────────────────────────────────── */
  if (currentMode === 'tiling') {
    const clamp = Math.min(depth, 16);
    const turns = paperFoldTurns(clamp);
    const base  = buildDragon(turns);

    // Build 1, 2, or 4 rotated copies
    const numCopies = copies;
    const allSets = [];
    for (let k = 0; k < numCopies; k++) allSets.push(rotate90(base, k));

    const fit = makeFitMulti(allSets);

    let gridSVG = showGrid ? latticeGridSVG(fit, turns) : '';

    let dragonsSVG = '';
    for (let k = 0; k < numCopies; k++) {
      const mapped = allSets[k].map(fit);
      const seg    = mapped.length - 1;
      const col    = rain ? null : (numCopies === 1 ? color : TILE_COLORS[k]);
      if (rain) {
        for (let i = 0; i < seg; i++)
          dragonsSVG += `<line x1="${mapped[i].x}" y1="${mapped[i].y}" x2="${mapped[i+1].x}" y2="${mapped[i+1].y}" stroke="${hslC(i + k*seg, numCopies*seg)}" stroke-width="${sw}" stroke-linecap="round"/>`;
      } else {
        dragonsSVG += `<path d="${polyPath(mapped)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${numCopies > 1 ? 0.9 : 1}"/>`;
      }
      // Mark tail dot
      const tail = fit({ x: 0, y: 0 });
      dragonsSVG += `<circle cx="${tail.x}" cy="${tail.y}" r="3" fill="${rain ? '#fff' : (numCopies===1?color:TILE_COLORS[k])}" opacity="0.8"/>`;
    }

    // Perimeter of combined shape (only for paperfold integer grid)
    let perimSVG = '';
    if (numCopies === 4) {
      const allPts = allSets.flat();
      const bEdges = findBoundaryEdges(allPts);
      const ring   = chainEdges(bEdges).map(fit);
      const d      = ring.length > 1 ? ring.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ') + ' Z' : '';
      if (d) perimSVG = `<path d="${d}" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="6 4" stroke-linejoin="round" opacity="0.7"/>`;
    }

    document.getElementById('sc').textContent =
      `${(base.length - 1).toLocaleString()} segments × ${numCopies} copies · iteration ${clamp}`;

    svgContent = gridSVG + dragonsSVG + perimSVG;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><rect width="${VW}" height="${VH}" fill="#0d0f14"/>${svgContent}</svg>`;
    currentSVG = svg;
    document.getElementById('wrap').innerHTML = svg;
    return;
  }

  /* ─── BOUNDARY ───────────────────────────────────── */
  if (currentMode === 'boundary') {
    const DOTS  = Math.min(8000 * depth, 120000);
    const comps = bcomp === 'all'
      ? ['red','blue','orange','green']
      : [bcomp];

    let allDots = [];
    const compDots = {};
    for (const name of comps) {
      const maps = BOUNDARY_IFS[name];
      const dots = chaosGame(maps, DOTS);
      compDots[name] = dots;
      allDots = allDots.concat(dots);
    }

    const fit = makeFitMulti([allDots]);
    let dotsSVG = '';

    for (const name of comps) {
      const mapped = compDots[name].map(fit);
      const col    = rain ? null : BOUND_COLORS[name];
      const total  = mapped.length;
      const r      = Math.max(0.4, sw * 0.4);
      if (rain) {
        dotsSVG += mapped.map((p, i) =>
          `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${hslC(i, total)}" opacity="0.8"/>`
        ).join('');
      } else {
        dotsSVG += mapped.map(p =>
          `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${col}" opacity="0.75"/>`
        ).join('');
      }
    }

    document.getElementById('sc').textContent =
      `${allDots.length.toLocaleString()} boundary points · dim ≈ 1.523627`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><rect width="${VW}" height="${VH}" fill="#0d0f14"/>${dotsSVG}</svg>`;
    currentSVG = svg;
    document.getElementById('wrap').innerHTML = svg;
    return;
  }

  /* ─── PAPER FOLD ─────────────────────────────────── */
  if (currentMode === 'paperfold') {
    const clamp  = Math.min(depth, 16);
    const turns  = paperFoldTurns(clamp);
    const rawPts = buildDragon(turns);
    const fit    = makeFitMulti([rawPts]);
    const mapped = rawPts.map(fit);
    const seg    = mapped.length - 1;

    // Boundary perimeter overlay
    const bEdges = findBoundaryEdges(rawPts);
    const ring   = chainEdges(bEdges).map(fit);
    const perimD = ring.length > 1
      ? ring.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ') + ' Z'
      : '';

    let curveSVG = '';
    if (rain) {
      for (let i = 0; i < seg; i++)
        curveSVG += `<line x1="${mapped[i].x}" y1="${mapped[i].y}" x2="${mapped[i+1].x}" y2="${mapped[i+1].y}" stroke="${hslC(i,seg)}" stroke-width="${sw}" stroke-linecap="round"/>`;
    } else {
      curveSVG = `<path d="${polyPath(mapped)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    const perimSVG = perimD
      ? `<path d="${perimD}" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-dasharray="8 5" stroke-linejoin="round"/>`
      : '';
    const label = clamp <= 8
      ? `Fold seq: ${turns.map(t=>t===1?'L':'R').join('')}`
      : `${(seg).toLocaleString()} segments`;
    document.getElementById('sc').textContent = label + ` · iteration ${clamp}`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><rect width="${VW}" height="${VH}" fill="#0d0f14"/>${curveSVG}${perimSVG}</svg>`;
    currentSVG = svg;
    document.getElementById('wrap').innerHTML = svg;
    return;
  }

  /* ─── L-SYSTEM ───────────────────────────────────── */
  if (currentMode === 'lsystem') {
    const clamp  = Math.min(depth, 14);
    const rawPts = lsystemDragon(clamp);
    const fit    = makeFitMulti([rawPts]);
    const mapped = rawPts.map(fit);
    const seg    = mapped.length - 1;

    let curveSVG = '';
    if (rain) {
      for (let i = 0; i < seg; i++)
        curveSVG += `<line x1="${mapped[i].x}" y1="${mapped[i].y}" x2="${mapped[i+1].x}" y2="${mapped[i+1].y}" stroke="${hslC(i,seg)}" stroke-width="${sw}" stroke-linecap="round"/>`;
    } else {
      curveSVG = `<path d="${polyPath(mapped)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    document.getElementById('sc').textContent = `${seg.toLocaleString()} segments · L-system iteration ${clamp}`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><rect width="${VW}" height="${VH}" fill="#0d0f14"/>${curveSVG}</svg>`;
    currentSVG = svg;
    document.getElementById('wrap').innerHTML = svg;
    return;
  }
}

/* ── Control visibility by mode ── */
function updateControls() {
  const m = currentMode;
  // show/hide specific controls
  document.getElementById('ctrl-copies').style.display   = m === 'tiling'   ? '' : 'none';
  document.getElementById('ctrl-bcomp').style.display    = m === 'boundary'  ? '' : 'none';
  document.getElementById('ctrl-scheme').style.display   = m === 'boundary'  ? 'none' : '';
  document.getElementById('ctrl-rainbow').style.display  = '';
  document.getElementById('ctrl-grid').style.display     = m === 'tiling'    ? '' : 'none';

  // depth max
  const maxMap = { tiling:16, boundary:16, paperfold:16, lsystem:14 };
  document.getElementById('depth').max = maxMap[m];

  // info cards
  ['tiling','boundary','paperfold','lsystem'].forEach(id => {
    document.getElementById(`info-${id}`).classList.toggle('hidden', id !== m);
  });
}

/* ── Tabs ── */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    updateControls();
    draw();
  });
});

/* ── Controls ── */
['depth','copies','bcomp','scheme','sw','rainbow','showgrid'].forEach(id => {
  document.getElementById(id).addEventListener('input',  draw);
  document.getElementById(id).addEventListener('change', draw);
});

function downloadSVG() {
  const blob = new Blob([currentSVG], { type: 'image/svg+xml' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `heighway-${currentMode}.svg`;
  a.click();
}

updateControls();
draw();
