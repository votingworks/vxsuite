// usage: node js_shard.mjs <election.parsed.json> <shard> <shards> <poolSize> — renders every <shards>th ballot
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
const [electionPath, shard, shards, pool] = process.argv
  .slice(2)
  .map((a, i) => (i ? Number(a) : a));
const election = safeParseElection(
  JSON.parse(fs.readFileSync(electionPath, 'utf8'))
).unsafeUnwrap();
const all = allBaseBallotProps(election).filter(
  (p) => (p.ballotStyle.languages ?? ['en'])[0] === 'en'
);
// Shard by ballot style so each shard's election definition covers whole styles.
const styleIds = [...new Set(all.map((p) => p.ballotStyle.id))];
const mine = new Set(styleIds.filter((_, i) => i % shards === shard));
const props = all.filter((p) => mine.has(p.ballotStyle.id));
const rendererPool = await createPlaywrightRendererPool(pool);
const scratch = { path: fs.mkdtempSync(path.join(os.tmpdir(), 'hmpb-js-')) };
await renderAllBallotPdfsAndCreateElectionDefinition(
  rendererPool,
  ballotTemplates.VxDefaultBallot,
  props,
  (bs) => bs.orderedCandidatesByContest,
  { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
  DEFAULT_SYSTEM_SETTINGS,
  scratch
);
await rendererPool.close();
fs.rmSync(scratch.path, { recursive: true, force: true });
console.log(
  'shard',
  shard,
  'ballots',
  props.length,
  'seconds',
  (performance.now() / 1000).toFixed(1)
);
