import * as fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { assert, assertDefined, range } from '@votingworks/basics';
import {
  BallotType,
  type BaseBallotProps,
  type ElectionDefinitionWithData,
  formatBallotHash,
  type HmpbBallotPaperSize,
  LATEST_SOFTWARE_VERSION,
  DEFAULT_SYSTEM_SETTINGS,
  NO_CANDIDATE_ORDERINGS,
  type SheetPositions,
  type ContestPosition,
  type ContestOptionPosition,
} from '@votingworks/types';
import makeDebug from 'debug';

import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { normalizePdf } from '@votingworks/image-utils/pdf';
import fontKit from '@pdf-lib/fontkit';
import { createElection } from './all_bubble_ballot/election.js';
import { allBubbleBallotTemplate } from './all_bubble_ballot/template.js';
import { stampBubbles, stampBubblesInDoc } from './marking.js';
import {
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
  type ScratchDir,
} from './render_ballot.js';
import type { RendererPool } from './renderer.js';
import {
  drawFooterMeta,
  getMetaCenter,
  type PositionPts,
} from './all_bubble_ballot/footer.js';
import { allBubbleBallotConfig } from './all_bubble_ballot/config.js';
import { getRobotoBoldData } from './fonts.js';

const debug = makeDebug('hmpb:ballot_fixtures');

const fixturesDir = join(import.meta.dirname, '../fixtures');

export interface AllBubbleBallotFixtures {
  paperSize: HmpbBallotPaperSize;
  dir: string;
  electionPath: string;
  blankBallotPath: string;
  filledBallotPath: string;
  cyclingTestDeckPath: string;
  generate(
    rendererPool: RendererPool,
    scratchDir?: ScratchDir
  ): Promise<{
    electionDefinition: ElectionDefinitionWithData;
    blankBallotPdf: Uint8Array;
    filledBallotPdf: Uint8Array;
    cyclingTestDeckPdf: Uint8Array;
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ballotStyle: election.ballotStyles[0]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    precinctId: election.precincts[0]!.id,
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

    async generate(rendererPool: RendererPool, scratchDir?: ScratchDir) {
      debug(`Generating: ${blankBallotPath}`);

      const { electionDefinition, layoutPaths } =
        await layOutBallotsAndCreateElectionDefinition(
          rendererPool,
          allBubbleBallotTemplate(paperSize),
          [ballotProps],
          () => NO_CANDIDATE_ORDERINGS,
          { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
          DEFAULT_SYSTEM_SETTINGS,
          scratchDir ?? { path: makeTemporaryDirectory() }
        );

      const base = await rendererPool.runTask(async (renderer) => {
        const sheetDocument = await renderer.documentFromContent(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          fs.readFileSync(layoutPaths[0]!, 'utf8')
        );

        return {
          metadataCenter: await getMetaCenter(sheetDocument),
          emptyGridBallotPdf: await renderBallotPdfWithMetadataQrCode(
            ballotProps,
            sheetDocument,
            electionDefinition,
            LATEST_SOFTWARE_VERSION
          ),
        };
      });

      const [ballotStyle] = electionDefinition.election.ballotStyles;
      const ballotPositions = assertDefined(ballotStyle?.ballotPositions);

      const blankBallotPdf = await stampBubbles(base.emptyGridBallotPdf, {
        positions: ballotPositions,
        paperSize,
        style: 'outline',
      });

      debug(`Generating: ${filledBallotPath}`);
      const filledBallotPdf = await stampBubbles(base.emptyGridBallotPdf, {
        positions: ballotPositions,
        paperSize,
        style: 'filled',
      });

      debug(`Generating: ${cyclingTestDeckPath}`);
      const cyclingTestDeckPdf = await newCyclingTestDeck({
        ballotHash: electionDefinition.ballotHash,
        ballotPositions,
        metadataCenter: base.metadataCenter,
        paperSize,
        unmarkedBallotPdf: blankBallotPdf,
      });

      return {
        electionDefinition,
        blankBallotPdf,
        filledBallotPdf,
        cyclingTestDeckPdf,
      };
    },
  };
}

async function newCyclingTestDeck(spec: {
  ballotHash: string;
  ballotPositions: readonly SheetPositions[];
  metadataCenter: PositionPts;
  paperSize: HmpbBallotPaperSize;
  unmarkedBallotPdf: Readonly<Uint8Array>;
}): Promise<Uint8Array> {
  assert(
    spec.ballotPositions.length === 1,
    'all-bubble ballot fixtures assume 1 sheet per ballot'
  );

  const sheet = assertDefined(spec.ballotPositions[0]);
  assert(sheet.every((c) => c.length === 1, 'expected one contest per page'));

  const nSheets = 6;

  function positions(p: { sheetIndex: number; side: 0 | 1 }): ContestPosition {
    const unmarkedContest = assertDefined(sheet[p.side][0]);
    const markedOptions: ContestOptionPosition[] = [];

    for (const o of unmarkedContest.options) {
      const { column, row } = o.bubbleCenter;
      if ((row - column - p.sheetIndex) % nSheets === 0) markedOptions.push(o);
    }

    return { ...unmarkedContest, options: markedOptions };
  }

  const deck = await PDFDocument.create();
  const unmarkedBallot = await PDFDocument.load(spec.unmarkedBallotPdf);
  const unmarkedPages = await deck.embedPages(unmarkedBallot.getPages());

  deck.registerFontkit(fontKit);
  const font = await deck.embedFont(await getRobotoBoldData(), {
    subset: true,
  });

  const ballotHash = formatBallotHash(spec.ballotHash);
  const markedPositions: SheetPositions[] = [];

  for (const sheetIndex of range(0, nSheets)) {
    for (const [pageIndex, unmarkedPage] of unmarkedPages.entries()) {
      const page = deck.addPage([unmarkedPage.width, unmarkedPage.height]);
      page.drawPage(unmarkedPage);

      if (pageIndex === 0) {
        const center = spec.metadataCenter;
        drawFooterMeta({ ballotHash, center, font, page, sheetIndex });
      }
    }

    markedPositions.push([
      [positions({ sheetIndex, side: 0 })],
      [positions({ sheetIndex, side: 1 })],
    ]);
  }

  stampBubblesInDoc(deck, {
    positions: markedPositions,
    paperSize: spec.paperSize,
    style: 'filled',
  });

  return normalizePdf(await deck.save({ useObjectStreams: false }));
}
