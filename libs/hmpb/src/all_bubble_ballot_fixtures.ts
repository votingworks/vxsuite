import { assertDefined, range } from '@votingworks/basics';
import {
  BallotType,
  CandidateContest,
  ElectionDefinition,
  formatBallotHash,
  GridPositionOption,
  HmpbBallotPaperSize,
  VotesDict,
} from '@votingworks/types';
import makeDebug from 'debug';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { createElection } from './all_bubble_ballot/election';
import { allBubbleBallotTemplate } from './all_bubble_ballot/template';
import { concatenatePdfs } from './concatenate_pdfs';
import { markBallotDocument } from './mark_ballot';
import {
  BaseBallotProps,
  renderAllBallotsAndCreateElectionDefinition,
} from './render_ballot';
import { Renderer } from './renderer';
import { injectFooterMetadata } from './all_bubble_ballot/footer';
import { allBubbleBallotConfig } from './all_bubble_ballot/config';

const debug = makeDebug('hmpb:ballot_fixtures');

const fixturesDir = join(__dirname, '../fixtures');

export interface AllBubbleBallotFixtures {
  paperSize: HmpbBallotPaperSize;
  dir: string;
  electionPath: string;
  blankBallotPath: string;
  filledBallotPath: string;
  cyclingTestDeckPath: string;
  generate(
    renderer: Renderer,
    options?: { blankOnly?: boolean }
  ): Promise<{
    electionDefinition: ElectionDefinition;
    blankBallotPdf: Buffer;
    filledBallotPdf: Buffer;
    cyclingTestDeckPdf: Buffer;
  }>;
}

export function allBubbleBallotFixtures(
  paperSize: HmpbBallotPaperSize
): AllBubbleBallotFixtures {
  const config = allBubbleBallotConfig(paperSize);
  const dir = join(
    fixturesDir,
    'all-bubble-ballot',
    paperSize.replaceAll(/[^-.a-zA-Z0-9]+/g, '-')
  );
  const electionPath = join(dir, 'election.json');
  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const filledBallotPath = join(dir, 'filled-ballot.pdf');
  const cyclingTestDeckPath = join(dir, 'cycling-test-deck.pdf');
  const election = createElection(config);
  const ballotProps: BaseBallotProps = {
    election,
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotMode: 'test',
    ballotType: BallotType.Precinct,
  };

  return {
    paperSize,
    dir,
    electionPath,
    blankBallotPath,
    filledBallotPath,
    cyclingTestDeckPath,

    async generate(renderer: Renderer, { blankOnly = false } = {}) {
      debug(`Generating: ${blankBallotPath}`);
      const { electionDefinition, ballotDocuments } =
        await renderAllBallotsAndCreateElectionDefinition(
          renderer,
          allBubbleBallotTemplate(paperSize),
          [ballotProps],
          'vxf'
        );

      const [blankBallot] = ballotDocuments;
      const blankBallotPdf = await blankBallot.renderToPdf();

      let filledBallotPdf = Buffer.from('');
      let cyclingTestDeckPdf = Buffer.from('');
      if (!blankOnly) {
        debug(`Generating: ${filledBallotPath}`);
        const filledVotes: VotesDict = Object.fromEntries(
          election.contests.map((contest) => [
            contest.id,
            (contest as CandidateContest).candidates,
          ])
        );
        const filledBallot = await markBallotDocument(
          renderer,
          blankBallot,
          filledVotes
        );
        filledBallotPdf = await filledBallot.renderToPdf();

        debug(`Generating: ${cyclingTestDeckPath}`);
        const [gridLayout] = assertDefined(
          electionDefinition.election.gridLayouts
        );
        const gridPositionByCandidateId = Object.fromEntries(
          gridLayout.gridPositions.map((position) => [
            (position as GridPositionOption).optionId,
            position,
          ])
        );
        const cyclingTestDeckSheetPdfs = await Promise.all(
          range(0, 6).map(async (sheetNumber) => {
            const votesForSheet: VotesDict = Object.fromEntries(
              election.contests.map((contest) => [
                contest.id,
                (contest as CandidateContest).candidates.flatMap(
                  (candidate) => {
                    const { row, column } =
                      gridPositionByCandidateId[candidate.id];
                    // Bubbles aren't perfectly aligned with the grid, but they are
                    // extremely close, so rounding is fine
                    if (
                      (Math.round(row) - Math.round(column) - sheetNumber) %
                        6 ===
                      0
                    ) {
                      return [candidate];
                    }
                    return [];
                  }
                ),
              ])
            );
            const sheetDocument = await markBallotDocument(
              renderer,
              blankBallot,
              votesForSheet
            );
            await injectFooterMetadata(sheetDocument, {
              Election: formatBallotHash(electionDefinition.ballotHash),
              'Cycle Index': sheetNumber + 1,
            });
            return await sheetDocument.renderToPdf();
          })
        );
        cyclingTestDeckPdf = await concatenatePdfs(cyclingTestDeckSheetPdfs);
      }

      return {
        electionDefinition,
        blankBallotPdf,
        filledBallotPdf,
        cyclingTestDeckPdf,
      };
    },
  };
}
