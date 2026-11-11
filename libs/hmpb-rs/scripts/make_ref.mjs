// usage: node make_ref.mjs <election.json> <outdir> [maxBallots]
import fs from 'node:fs';
import {
  DEFAULT_SYSTEM_SETTINGS,
  LATEST_SOFTWARE_VERSION,
  safeParseElectionAnyVersion,
} from '../../types/build/index.js';
import {
  allBaseBallotProps,
  createPlaywrightRendererPool,
  renderAllBallotPdfsAndCreateElectionDefinition,
  ballotTemplates,
} from '../../hmpb/build/index.js';
const [electionPath, out, max = '4'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
/** Best-effort upgrade of older (v4.0.x) election JSON to the current schema. */
function upgrade(e) {
  const { gridLayouts, county, ...rest } = e;
  const precincts = e.precincts.map((p) => {
    if (p.districtIds || p.splits) return p;
    const districtSets = [
      ...new Map(
        e.ballotStyles
          .filter((bs) => bs.precincts.includes(p.id))
          .map((bs) => [bs.districts.join(), bs.districts])
      ).values(),
    ];
    if (districtSets.length <= 1)
      return { ...p, districtIds: districtSets[0] ?? [] };
    return {
      id: p.id,
      name: p.name,
      splits: districtSets.map((districtIds, i) => ({
        id: `${p.id}-split-${i}`,
        name: p.name,
        districtIds,
      })),
    };
  });
  return {
    ...rest,
    jurisdiction: e.jurisdiction ?? county,
    precincts,
    pollingPlaces: e.pollingPlaces?.length
      ? e.pollingPlaces
      : precincts.map((p) => ({
          id: `pp-${p.id}`,
          name: p.name,
          type: 'election_day',
          precincts: { [p.id]: { type: 'whole' } },
        })),
    contests: e.contests.map(({ yesOption, noOption, ...c }) =>
      yesOption ? { ...c, options: [yesOption, noOption] } : c
    ),
  };
}
const raw = JSON.parse(fs.readFileSync(electionPath, 'utf8'));
let parsed = safeParseElectionAnyVersion(JSON.stringify(raw));
if (parsed.isErr())
  parsed = safeParseElectionAnyVersion(JSON.stringify(upgrade(raw)));
if (parsed.isErr()) {
  console.log('PARSE_ERROR', String(parsed.err()).slice(0, 200));
  process.exit(0);
}
const election = parsed.ok();
const template = ballotTemplates.VxDefaultBallot;
const props = allBaseBallotProps(election)
  .filter(
    (p) =>
      p.ballotType === 'precinct' &&
      p.ballotMode === 'official' &&
      (p.ballotStyle.languages ?? ['en'])[0] === 'en'
  )
  .slice(0, Number(max));
if (props.length === 0) {
  console.log('NO_BALLOTS');
  process.exit(0);
}
const pool = await createPlaywrightRendererPool(4);
const scratch = { path: fs.mkdtempSync(out + '/scratch-') };
try {
  const t0 = performance.now();
  const res = await renderAllBallotPdfsAndCreateElectionDefinition(
    pool,
    template,
    props,
    (bs) => bs.orderedCandidatesByContest,
    { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
    DEFAULT_SYSTEM_SETTINGS,
    scratch
  );
  const ms = performance.now() - t0;
  const jobs = props.map((p, i) => {
    const file = 'chrome-' + i + '.pdf';
    fs.copyFileSync(res.ballotPaths[i], out + '/' + file);
    return {
      index: i,
      styleId: p.ballotStyle.id,
      precinctId: p.precinctId,
      contests: template.contestsForBallot(
        p.ballotStyle.orderedCandidatesByContest,
        p
      ),
    };
  });
  fs.writeFileSync(out + '/election.parsed.json', JSON.stringify(election));
  fs.writeFileSync(out + '/jobs.json', JSON.stringify(jobs));
  fs.writeFileSync(
    out + '/positions.json',
    JSON.stringify(
      Object.fromEntries(
        res.electionDefinition.election.ballotStyles.map((bs) => [
          bs.id,
          bs.ballotPositions,
        ])
      )
    )
  );
  fs.writeFileSync(out + '/ballot_hash.txt', res.electionDefinition.ballotHash);
  console.log(
    'OK',
    props.length,
    'ballots',
    (ms / props.length).toFixed(0),
    'ms/ballot'
  );
} catch (e) {
  console.log('RENDER_ERROR', JSON.stringify(e?.message ?? e).slice(0, 300));
} finally {
  await pool.close();
  fs.rmSync(scratch.path, { recursive: true, force: true });
}
