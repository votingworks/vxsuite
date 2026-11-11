// usage: node compare_real.mjs <dir>  — compares chrome-<i>.pdf/positions.json with rust-<i>.pdf/rust-positions.json
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = process.argv[2];
const chrome = JSON.parse(fs.readFileSync(dir + '/positions.json', 'utf8'));
const rust = JSON.parse(fs.readFileSync(dir + '/rust-positions.json', 'utf8'));
const jobs = JSON.parse(fs.readFileSync(dir + '/jobs.json', 'utf8'));
const pages = (pdf) =>
  +/Pages:\s+(\d+)/.exec(
    execFileSync('pdfinfo', [pdf], { encoding: 'utf8' })
  )[1];
const out = [];
for (const job of jobs) {
  const r = rust[job.index];
  if (!r) {
    out.push({ ballot: job.index, result: 'rust failed' });
    continue;
  }
  const ref = new Map();
  chrome[job.styleId].forEach((sheet, si) =>
    sheet.forEach((side, sd) =>
      side.forEach((c) =>
        c.options.forEach((o) => {
          ref.set(
            c.contestId +
              '/' +
              (o.type === 'write-in'
                ? 'write-in-' + o.writeInIndex
                : o.optionId +
                  (job.contests.find((x) => x.id === c.contestId)?.type ===
                  'candidate'
                    ? '#' + (o.partyIds ?? []).join(',')
                    : '')),
            { page: si * 2 + sd + 1, ...o.bubbleCenter }
          );
        })
      )
    )
  );
  let maxD = 0,
    pageMismatch = 0,
    missing = 0;
  for (const [page, id, column, row] of r.bubbles) {
    const c = ref.get(id);
    if (!c) {
      missing++;
      continue;
    }
    if (c.page !== page) {
      pageMismatch++;
      continue;
    }
    maxD = Math.max(maxD, Math.hypot(c.column - column, c.row - row));
  }
  const words = execFileSync(
    'node',
    [
      new URL('./compare_words.mjs', import.meta.url).pathname,
      dir + '/chrome-' + job.index + '.pdf',
      dir + '/rust-' + job.index + '.pdf',
    ],
    { encoding: 'utf8' }
  ).split('\n')[0];
  const m = /(\d+) words matched.*unmatched: (\d+)/.exec(words);
  out.push({
    ballot: job.index,
    pages:
      pages(dir + '/chrome-' + job.index + '.pdf') +
      '/' +
      pages(dir + '/rust-' + job.index + '.pdf'),
    bubbles: r.bubbles.length + '/' + ref.size,
    pageMismatch,
    missing,
    maxBubbleΔgrid: +maxD.toFixed(4),
    words: m[1],
    unmatchedWords: m[2],
  });
}
console.log(JSON.stringify(out));
