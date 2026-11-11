// usage: node make_jobs.mjs <election.parsed.json> <outdir> — all ballot configurations, no rendering
import fs from 'node:fs';
import { safeParseElection } from '../../types/build/index.js';
import { allBaseBallotProps, ballotTemplates } from '../../hmpb/build/index.js';
const [electionPath, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const election = safeParseElection(
  JSON.parse(fs.readFileSync(electionPath, 'utf8'))
).unsafeUnwrap();
const props = allBaseBallotProps(election).filter(
  (p) => (p.ballotStyle.languages ?? ['en'])[0] === 'en'
);
const jobs = props.map((p, i) => ({
  index: i,
  styleId: p.ballotStyle.id,
  precinctId: p.precinctId,
  ballotType: p.ballotType,
  ballotMode: p.ballotMode,
  contests: ballotTemplates.VxDefaultBallot.contestsForBallot(
    p.ballotStyle.orderedCandidatesByContest,
    p
  ),
}));
fs.writeFileSync(out + '/election.parsed.json', JSON.stringify(election));
fs.writeFileSync(out + '/jobs.json', JSON.stringify(jobs));
fs.writeFileSync(out + '/ballot_hash.txt', 'a'.repeat(64));
console.log(
  out.split('/').pop(),
  'styles',
  election.ballotStyles.length,
  'ballots',
  jobs.length
);
