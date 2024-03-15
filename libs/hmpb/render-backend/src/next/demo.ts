import { mkdir, rm, writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { BallotType, safeParseElection } from '@votingworks/types';
import { iter } from '@votingworks/basics';
import {
  BaseBallotProps,
  renderAllBallotsAndCreateElectionDefinition,
} from './render_ballot';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template';
import { createPlaywrightRenderer } from './playwright_renderer';

const electionJson = readFileSync(
  '../../fixtures/data/electionGeneral/election.json'
).toString('utf-8');
const election = safeParseElection(electionJson).unsafeUnwrap();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const exampleBallotProps: BaseBallotProps = {
  election,
  ballotStyleId: election.ballotStyles[0].id,
  precinctId: election.ballotStyles[0].precincts[0],
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
};

const allBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
  ballotStyle.precincts.map(
    (precinctId): BaseBallotProps => ({
      election,
      ballotStyleId: ballotStyle.id,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
    })
  )
);

async function main() {
  const renderer = await createPlaywrightRenderer();
  const { ballotDocuments, electionDefinition } =
    await renderAllBallotsAndCreateElectionDefinition(
      renderer,
      vxDefaultBallotTemplate,
      allBallotProps
    );
  const outputDir = process.argv[2];
  if (!outputDir) {
    throw new Error('Usage: demo output-directory');
  }
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  for (const [props, ballotDocument] of iter(allBallotProps).zip(
    ballotDocuments
  )) {
    const outputPath = `${outputDir}/ballot-${
      props.ballotStyleId
    }-${props.precinctId.replace(/\s/, '-')}.pdf`;
    const ballotPdf = await ballotDocument.renderToPdf();
    await writeFile(outputPath, ballotPdf);
    // eslint-disable-next-line no-console
    console.log(`Rendered and saved ballot to ${outputPath}`);
  }
  await writeFile(
    `${outputDir}/election.json`,
    JSON.stringify(electionDefinition.election, null, 2)
  );
  await renderer.cleanup();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
