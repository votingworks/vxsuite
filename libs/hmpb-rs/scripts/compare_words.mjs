// Compares word positions from `pdftotext -bbox` output of two PDFs (baselines derived from each embedder's font bbox convention).
import { execFileSync } from 'node:child_process';
const [a, b] = process.argv.slice(2);
function words(pdf) {
  const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  const pages = xml.split('<page ').slice(1);
  return pages.map((p) =>
    [
      ...p.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g
      ),
    ].map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], w: m[5] }))
  );
}
const A = words(a),
  B = words(b);
// Chromium's embedded fonts report hhea-height bboxes (1.347em, ascent 1.056em); krilla's report 1em (ascent 0.75em).
const base = (w, ascFrac, hFrac) => {
  const size = (w.y1 - w.y0) / hFrac;
  return { size, baseline: w.y0 + ascFrac * size };
};
let n = 0,
  maxDx = 0,
  maxDb = 0,
  maxDw = 0,
  unmatched = [],
  worst = '';
for (let p = 0; p < Math.max(A.length, B.length); p++) {
  const wa = (A[p] ?? []).filter((w) => !/^[0-9a-f]{7}$/.test(w.w));
  const wb = (B[p] ?? [])
    .filter((w) => !/^[0-9a-f]{7}$/.test(w.w))
    .map((w) => ({ ...w, ...base(w, 0.75, 1.0) }));
  const used = new Set();
  for (const x of wa) {
    const bx = base(x, 2163 / 2048, (2163 + 595) / 2048);
    let best = -1,
      bestD = Infinity;
    wb.forEach((y, j) => {
      if (used.has(j) || y.w !== x.w) return;
      const d = Math.hypot(y.x0 - x.x0, y.baseline - bx.baseline);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    if (best < 0 || bestD > 6) {
      unmatched.push(
        `page ${p + 1}: "${x.w}" at (${px(x.x0)},${px(bx.baseline)})px`
      );
      continue;
    }
    used.add(best);
    const y = wb[best];
    n++;
    const dx = Math.abs(x.x0 - y.x0),
      db = Math.abs(bx.baseline - y.baseline);
    (globalThis.hist ??= {})[((db * 4) / 3).toFixed(2)] =
      ((globalThis.hist ?? {})[((db * 4) / 3).toFixed(2)] ?? 0) + 1;
    (globalThis.cb ??= []).push([(bx.baseline * 4) / 3, (db * 4) / 3, x.w]);
    if (db > maxDb) worst = `"${x.w}" p${p + 1}`;
    maxDx = Math.max(maxDx, dx);
    maxDb = Math.max(maxDb, db);
    maxDw = Math.max(maxDw, Math.abs(x.x1 - x.x0 - (y.x1 - y.x0)));
  }
  wb.forEach((y, j) => {
    if (!used.has(j)) unmatched.push(`page ${p + 1}: rust-only "${y.w}"`);
  });
}
function px(pt) {
  return ((pt * 4) / 3).toFixed(3);
}
console.log(
  `${n} words matched; max |Δx| ${px(maxDx)}px, max |Δwidth| ${px(maxDw)}px, max |Δbaseline| ${px(maxDb)}px (${worst}); unmatched: ${unmatched.length}`
);
for (const m of unmatched.slice(0, +(process.env.SHOW ?? 12)))
  console.log('  ' + m);

if (process.env.HIST) {
  console.log(
    Object.entries(hist)
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => k + ':' + v)
      .join(' ')
  );
  console.log(
    'fractional part of chrome baselines (px):',
    [...new Set(cb.map(([b]) => (b % 1).toFixed(2)))].slice(0, 12).join(' ')
  );
}
