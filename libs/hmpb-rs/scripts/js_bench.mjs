// usage: node js_bench.mjs <election.parsed.json> [poolSize]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SYSTEM_SETTINGS,
  LATEST_SOFTWARE_VERSION,
  safeParseElection,
} from '../../types/build/index.js';
import {
  allBaseBallotProps,
  createPlaywrightRendererPool,
  renderAllBallotPdfsAndCreateElectionDefinition,
  ballotTemplates,
} from '../../hmpb/build/index.js';
const [electionPath, pool = '16'] = process.argv.slice(2);
const election = safeParseElection(
  JSON.parse(fs.readFileSync(electionPath, 'utf8'))
).unsafeUnwrap();
const props = allBaseBallotProps(election).filter(
  (p) => (p.ballotStyle.languages ?? ['en'])[0] === 'en'
);
const rendererPool = await createPlaywrightRendererPool(Number(pool));
const scratch = { path: fs.mkdtempSync(path.join(os.tmpdir(), 'hmpb-js-')) };
const t0 = performance.now();
let tLayout;
const res = await renderAllBallotPdfsAndCreateElectionDefinition(
  rendererPool,
  ballotTemplates.VxDefaultBallot,
  props,
  (bs) => bs.orderedCandidatesByContest,
  { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
  DEFAULT_SYSTEM_SETTINGS,
  scratch,
  (label, p, t) => {
    if (label.startsWith('Laying') && p === t) tLayout ??= performance.now();
  }
);
const ms = performance.now() - t0;
await rendererPool.close();
const bytes = res.ballotPaths.reduce((s, p) => s + fs.statSync(p).size, 0);
console.log(
  JSON.stringify({
    ballots: props.length,
    totalS: +(ms / 1000).toFixed(1),
    layoutS: +((tLayout - t0) / 1000).toFixed(1),
    msPerBallot: +(ms / props.length).toFixed(1),
    totalMB: +(bytes / 1048576).toFixed(1),
    avgKB: +(bytes / props.length / 1024).toFixed(1),
  })
);
fs.rmSync(scratch.path, { recursive: true, force: true });
