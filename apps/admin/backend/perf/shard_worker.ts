import { parseArgs } from 'node:util';
import { assertDefined } from '@votingworks/basics';
import { getAllStringsForElectionPackage } from '@votingworks/backend';
import { stateDefaultSystemSettings } from '@votingworks/election-definition-backend';
import {
  addPollingPlacesForExport,
  formatElectionForExport,
} from '@votingworks/election-definition-backend/election-package';
import {
  ballotTemplates,
  createBallotPropsForTemplate,
  createPlaywrightRendererPool,
  hmpbStringsCatalog,
  renderAllBallotPdfsAndCreateElectionDefinition,
} from '@votingworks/hmpb';
import { LATEST_SOFTWARE_VERSION, mergeUiStrings } from '@votingworks/types';
import { generateElection, withSeal } from './generate_election.ts';
import {
  ELECTION_PRESETS,
  isElectionPresetName,
  scaleSpec,
} from './presets.ts';
import { createPseudoTranslator } from './pseudo_translator.ts';

export interface ShardMessage {
  readonly shard: number;
  readonly phase: string;
  readonly progress: number;
  readonly total: number;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      election: { type: 'string' },
      precincts: { type: 'string' },
      seal: { type: 'string', default: 'fixture' },
      modes: { type: 'string', default: 'official,test' },
      pool: { type: 'string', default: '2' },
      shard: { type: 'string', default: '0' },
      shards: { type: 'string', default: '1' },
      scratch: { type: 'string' },
    },
  });
  const presetName = assertDefined(values.election);
  if (!isElectionPresetName(presetName)) {
    throw new Error(`Unknown election preset: ${presetName}`);
  }
  const shard = Number(values.shard);
  const shards = Number(values.shards);
  const modes = values.modes.split(',');
  const generated = generateElection(
    scaleSpec(
      ELECTION_PRESETS[presetName],
      values.precincts ? Number(values.precincts) : undefined
    )
  );
  const systemSettings = stateDefaultSystemSettings('DEMO');
  const shardBallotStyles = generated.election.ballotStyles.filter(
    (_, index) => index % shards === shard
  );
  const election = addPollingPlacesForExport(
    {
      ...withSeal(generated.election, values.seal),
      ballotStyles: shardBallotStyles,
    },
    { stateCode: 'DEMO' },
    systemSettings
  );
  const [, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      createPseudoTranslator(),
      hmpbStringsCatalog,
      generated.ballotLanguageConfigs,
      {
        shouldTransliterateCandidateNames:
          systemSettings.shouldTransliterateCandidateNames,
      }
    );
  const formattedElection = formatElectionForExport(
    election,
    mergeUiStrings(electionStrings, hmpbStrings)
  );
  const props = createBallotPropsForTemplate(
    'VxDefaultBallot',
    formattedElection,
    false
  ).filter(({ ballotMode }) => modes.includes(ballotMode));

  const rendererPool = await createPlaywrightRendererPool(Number(values.pool));
  const { ballotPaths } = await renderAllBallotPdfsAndCreateElectionDefinition(
    rendererPool,
    ballotTemplates.VxDefaultBallot,
    props,
    (ballotStyle) =>
      assertDefined(generated.candidateOrderings.get(ballotStyle.groupId)),
    {
      compact: systemSettings.splitElectionDefinition,
      format: 'vxf',
      version: LATEST_SOFTWARE_VERSION,
    },
    systemSettings,
    { path: assertDefined(values.scratch) },
    (phase, progress, total) => {
      process.send?.({ shard, phase, progress, total } satisfies ShardMessage);
    }
  );
  await rendererPool.close();
  process.send?.({
    shard,
    phase: 'done',
    progress: ballotPaths.length,
    total: ballotPaths.length,
  } satisfies ShardMessage);
  process.disconnect?.();
}

await main();
