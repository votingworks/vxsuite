import {
  TemplateGridAndBubbles,
  findTemplateGridAndBubbles,
} from '@votingworks/ballot-interpreter';
import {
  assert,
  assertDefined,
  asyncResultBlock,
  deepEqual,
  err,
  iter,
  ok,
  throwIllegalValue,
  typedAs,
  uniqueDeep,
} from '@votingworks/basics';
import { pdfToImages, pdfToText } from '@votingworks/image-utils';
import {
  BallotMetadata,
  BallotStyle,
  BallotType,
  Election,
  ElectionDefinition,
  GridPosition,
  asSheet,
  getContests,
  getPartyForBallotStyle,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { Buffer } from 'buffer';
import { addQrCodeMetadataToBallotPdf } from '../encode_metadata';
import { addBallotProofingAnnotationsToPdf } from '../proofing';
import * as accuvote from './accuvote';
import { convertElectionDefinitionHeader } from './convert_election_definition_header';
import { matchContestOptionsOnGrid } from './match_contest_options_on_grid';
import {
  ConvertIssue,
  ConvertIssueKind,
  NewHampshireBallotCardDefinition,
  PairColumnEntriesIssueKind,
  ResultWithIssues,
  TemplateBubbleGridEntry,
} from './types';

/**
 * A successfully converted card definition along with some additional data.
 */
export interface ConvertedCard {
  election: Election;
  templateGrid: TemplateGridAndBubbles;
}

async function convertCardDefinition(
  cardDefinition: NewHampshireBallotCardDefinition
): Promise<ResultWithIssues<ConvertedCard>> {
  return asyncResultBlock(async (fail) => {
    const accuvoteParseResult = accuvote.parseXml(cardDefinition.definition);

    if (accuvoteParseResult.isErr()) {
      return err({ issues: accuvoteParseResult.err() });
    }

    const avsInterface = accuvoteParseResult.ok();
    const convertHeader =
      convertElectionDefinitionHeader(avsInterface).okOrElse(fail);

    const { result: election, issues: headerIssues } = convertHeader;
    let success = true;
    const issues = [...headerIssues];

    const pageImages = await iter(
      pdfToImages(cardDefinition.ballotPdf, { scale: 200 / 72 })
    )
      .map(({ page }) => page)
      .toArray();
    if (pageImages.length !== 2) {
      return err({
        issues: [
          ...issues,
          typedAs<ConvertIssue>({
            kind: ConvertIssueKind.InvalidBallotTemplateNumPages,
            message: `Expected exactly two pages in the ballot PDF, but found ${pageImages.length}`,
          }),
        ],
      });
    }
    let [frontPage, backPage] = asSheet(pageImages);

    const findTemplateGridAndBubblesResult = findTemplateGridAndBubbles(
      asSheet(pageImages)
    );
    if (findTemplateGridAndBubblesResult.isErr()) {
      return err({
        issues: [
          ...issues,
          typedAs<ConvertIssue>({
            kind: ConvertIssueKind.TimingMarkDetectionFailed,
            message: 'failed to detect timing marks',
            side: 'front',
          }),
        ],
      });
    }

    let [frontGridAndBubbles, backGridAndBubbles] =
      findTemplateGridAndBubblesResult.ok();

    const pageTexts = await iter(pdfToText(cardDefinition.ballotPdf)).toArray();
    if (pageTexts.length !== 2) {
      return err({
        issues: [
          ...issues,
          typedAs<ConvertIssue>({
            kind: ConvertIssueKind.InvalidBallotTemplateNumPages,
            message: `Expected exactly two pages in the ballot PDF, but found ${pageTexts.length}`,
          }),
        ],
      });
    }
    let [frontPageText, backPageText] = asSheet(pageTexts);

    if (
      frontGridAndBubbles.metadata?.side === 'back' &&
      backGridAndBubbles.metadata?.side === 'front'
    ) {
      [frontGridAndBubbles, backGridAndBubbles] = [
        backGridAndBubbles,
        frontGridAndBubbles,
      ];
      [frontPage, backPage] = [backPage, frontPage];
      [frontPageText, backPageText] = [backPageText, frontPageText];
    }

    let { paperSize } = election.ballotLayout;

    const frontExpectedPaperSize =
      frontGridAndBubbles.grid.geometry.ballotPaperSize;
    const backExpectedPaperSize =
      backGridAndBubbles.grid.geometry.ballotPaperSize;

    assert(
      frontExpectedPaperSize === backExpectedPaperSize,
      'the paper size should be the same for both sides'
    );

    if (frontExpectedPaperSize !== paperSize) {
      success = frontExpectedPaperSize === backExpectedPaperSize;
      issues.push({
        kind: ConvertIssueKind.InvalidTemplateSize,
        message: `Template images do not match expected sizes. The XML definition says the template images should be "${paperSize}", but the template images are front="${frontExpectedPaperSize}" and back="${backExpectedPaperSize}".`,
        paperSize,
        frontTemplateSize: {
          width: frontPage.width,
          height: frontPage.height,
        },
        backTemplateSize: {
          width: backPage.width,
          height: backPage.height,
        },
      });
      paperSize = frontExpectedPaperSize;
    }

    if (frontGridAndBubbles.metadata && backGridAndBubbles.metadata) {
      if (frontGridAndBubbles.metadata.side !== 'front') {
        success = false;
        issues.push({
          kind: ConvertIssueKind.InvalidTimingMarkMetadata,
          message: `front page timing mark metadata is invalid: side=${frontGridAndBubbles.metadata.side}`,
          side: 'front',
          timingMarkBits: frontGridAndBubbles.metadata.bits,
          timingMarks: frontGridAndBubbles.grid.partialTimingMarks,
        });
      }

      if (backGridAndBubbles.metadata.side !== 'back') {
        success = false;
        issues.push({
          kind: ConvertIssueKind.InvalidTimingMarkMetadata,
          message: `back page timing mark metadata is invalid: side=${backGridAndBubbles.metadata.side}`,
          side: 'back',
          timingMarkBits: backGridAndBubbles.metadata.bits,
          timingMarks: backGridAndBubbles.grid.partialTimingMarks,
        });
      }
    }

    if (!success) {
      return err({
        issues,
        election,
      });
    }

    const ballotStyle = election.ballotStyles[0];
    assert(ballotStyle, 'ballot style missing');

    const gridLayout = election.gridLayouts?.[0];
    assert(gridLayout, 'grid layout missing');

    const frontMetadata = frontGridAndBubbles.metadata;
    const ballotStyleParty = getPartyForBallotStyle({
      ballotStyleId: ballotStyle.id,
      election,
    });
    const partyPrefix = ballotStyleParty ? `${ballotStyleParty.abbrev}-` : '';
    const cardNumber =
      frontMetadata?.side === 'front' ? frontMetadata.cardNumber : 1;
    const ballotStyleId = `${partyPrefix}card-number-${cardNumber}`;

    const frontTemplateBubbles = frontGridAndBubbles.bubbles;
    const backTemplateBubbles = backGridAndBubbles.bubbles;

    const bubbleGrid = [
      ...frontTemplateBubbles.map<TemplateBubbleGridEntry>((bubble) => ({
        side: 'front',
        column: bubble.x,
        row: bubble.y,
      })),
      ...backTemplateBubbles.map<TemplateBubbleGridEntry>((bubble) => ({
        side: 'back',
        column: bubble.x,
        row: bubble.y,
      })),
    ];

    const pairColumnEntriesResult = matchContestOptionsOnGrid(
      getContests({ ballotStyle, election }),
      gridLayout.gridPositions.map<GridPosition>((gridPosition) => ({
        ...gridPosition,
      })),
      bubbleGrid
    );

    if (pairColumnEntriesResult.isErr()) {
      success = false;

      for (const issue of pairColumnEntriesResult.err().issues) {
        switch (issue.kind) {
          case PairColumnEntriesIssueKind.ColumnCountMismatch:
            issues.push({
              kind: ConvertIssueKind.MismatchedOvalGrids,
              message: `XML definition and ballot images have different number of columns containing ovals: ${issue.columnCounts[0]} vs ${issue.columnCounts[1]}`,
              pairColumnEntriesIssue: issue,
            });
            break;

          case PairColumnEntriesIssueKind.ColumnEntryCountMismatch:
            issues.push({
              kind: ConvertIssueKind.MismatchedOvalGrids,
              message: `XML definition and ballot images have different number of entries in column ${issue.columnIndex}: ${issue.columnEntryCounts[0]} vs ${issue.columnEntryCounts[1]}`,
              pairColumnEntriesIssue: issue,
            });
            break;

          default:
            throwIllegalValue(issue, 'kind');
        }
      }
    }

    const mergedGrids = pairColumnEntriesResult.isOk()
      ? pairColumnEntriesResult.ok().pairs
      : pairColumnEntriesResult.err().pairs;
    const result: ConvertedCard = {
      election: {
        ...election,
        ballotLayout: {
          ...election.ballotLayout,
          paperSize,
        },
        ballotStyles: [
          {
            ...ballotStyle,
            id: ballotStyleId,
          },
        ],
        gridLayouts: [
          {
            ...gridLayout,
            ballotStyleId,
            gridPositions: mergedGrids.map(([definition, bubble]) =>
              definition.type === 'option'
                ? {
                    ...definition,
                    side: bubble.side,
                    column: bubble.column,
                    row: bubble.row,
                  }
                : {
                    ...definition,
                    side: bubble.side,
                    column: bubble.column,
                    row: bubble.row,
                    // This area is based on the largest rectangle that fits in
                    // the write-in box without intersecting with any of the contest
                    // labels (there may be more than one in a multi-seat
                    // contest). Some examples of the ballots this was based on
                    // can be found in the NH elections in libs/fixtures.
                    writeInArea: {
                      x: bubble.column - 5,
                      y: bubble.row - 0.65,
                      width: 4.5,
                      height: 0.85,
                    },
                  }
            ),
          },
        ],
      },
      templateGrid: findTemplateGridAndBubblesResult.ok(),
    };

    return ok({ issues, result });
  });
}

/**
 * Given a list of single-ballot style elections for different parties (from
 * converted NH election definitions), combine them into a single primary
 * election with a ballot style for each party.
 */
function combineConvertedElectionsIntoPrimaryElection(
  elections: readonly Election[]
): ResultWithIssues<ElectionDefinition> {
  assert(elections.length > 0);
  const [firstElection, ...restElections] = elections;
  assert(firstElection !== undefined);
  if (restElections.length === 0) {
    return ok({
      result: safeParseElectionDefinition(
        JSON.stringify(firstElection, null, 2)
      ).unsafeUnwrap(),
      issues: [],
    });
  }

  const { title, type, date, state, county, seal, ballotLayout } =
    firstElection;
  for (const [key, value] of Object.entries({
    title,
    type,
    date,
    state,
    county,
    seal,
    ballotLayout,
  })) {
    const differingElection = restElections.find(
      (election) => !deepEqual(election[key as keyof Election], value)
    );
    if (differingElection) {
      return err({
        issues: [
          {
            kind: ConvertIssueKind.MismatchedPrimaryPartyElections,
            message: `All elections must have the same ${key}, found:
${JSON.stringify(value, null, 2)}
${JSON.stringify(differingElection?.[key as keyof Election], null, 2)}`,
          },
        ],
      });
    }
  }

  const combinedElection: Election = {
    title,
    type,
    date,
    state,
    county,
    seal,
    ballotLayout,
    districts: uniqueDeep(elections.flatMap((election) => election.districts)),
    precincts: uniqueDeep(elections.flatMap((election) => election.precincts)),
    contests: elections.flatMap((election) => election.contests),
    parties: elections.flatMap((election) => election.parties),
    ballotStyles: elections.flatMap((election) => election.ballotStyles),
    gridLayouts: elections.flatMap((election) =>
      assertDefined(election.gridLayouts)
    ),
  };

  const parseElectionResult = safeParseElectionDefinition(
    JSON.stringify(combinedElection, null, 2)
  );

  if (parseElectionResult.isErr()) {
    return err({
      issues: [
        {
          kind: ConvertIssueKind.ElectionValidationFailed,
          message: parseElectionResult.err().message,
          validationError: parseElectionResult.err(),
        },
      ],
    });
  }

  return ok({ result: parseElectionResult.ok(), issues: [] });
}

async function addQrCodeMetadataToBallots(
  electionDefinition: ElectionDefinition,
  ballotPdfsByBallotStyle: Map<BallotStyle, Buffer>
): Promise<Map<BallotMetadata, Uint8Array>> {
  const ballotPdfsWithMetadata = new Map<BallotMetadata, Uint8Array>();
  for (const [ballotStyle, ballotPdf] of ballotPdfsByBallotStyle.entries()) {
    for (const precinctId of ballotStyle.precincts) {
      const metadata: BallotMetadata = {
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType: BallotType.Precinct,
        isTestMode: false,
        electionHash: electionDefinition.electionHash,
      };
      const ballotPdfWithMetadata = await addQrCodeMetadataToBallotPdf(
        electionDefinition.election,
        metadata,
        ballotPdf
      );
      ballotPdfsWithMetadata.set(metadata, ballotPdfWithMetadata);
    }
  }
  return ballotPdfsWithMetadata;
}

async function addBallotProofingAnnotationsToBallots(
  electionDefinition: ElectionDefinition,
  ballotPdfsByBallotStyle: Map<BallotStyle, Buffer>,
  templateGridsByBallotStyle: Map<BallotStyle, TemplateGridAndBubbles>
): Promise<Map<BallotMetadata, Uint8Array>> {
  const ballotPdfsForProofing = new Map<BallotMetadata, Uint8Array>();
  for (const [ballotStyle, ballotPdf] of ballotPdfsByBallotStyle.entries()) {
    const templateGrid = assertDefined(
      templateGridsByBallotStyle.get(ballotStyle)
    );
    for (const precinctId of ballotStyle.precincts) {
      const metadata: BallotMetadata = {
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType: BallotType.Precinct,
        isTestMode: false,
        electionHash: electionDefinition.electionHash,
      };
      const ballotPdfWithMetadata = await addBallotProofingAnnotationsToPdf(
        assertDefined(
          electionDefinition.election.gridLayouts?.find(
            (layout) => layout.ballotStyleId === ballotStyle.id
          )
        ),
        ballotPdf,
        templateGrid
      );
      ballotPdfsForProofing.set(metadata, ballotPdfWithMetadata);
    }
  }
  return ballotPdfsForProofing;
}

/**
 * A converted election definition and the resulting ballot PDFs with metadata.
 */
export type ConvertResult = ResultWithIssues<{
  electionDefinition: ElectionDefinition;
  ballotPdfs: Map<
    BallotMetadata,
    {
      printing: Uint8Array;
      proofing: Uint8Array;
    }
  >;
}>;

/**
 * Convert New Hampshire XML files to a single {@link Election} object. If given
 * multiple XML files (e.g. for a primary election), treats each one as a
 * separate ballot style.
 */
export function convertElectionDefinition(
  cardDefinitions: NewHampshireBallotCardDefinition[]
): Promise<ConvertResult> {
  return asyncResultBlock(async (fail) => {
    const cardResults = await Promise.all(
      cardDefinitions.map(convertCardDefinition)
    );
    cardResults.find((result) => result.isErr())?.okOrElse(fail);
    const convertedCards = cardResults.map(
      (result) => assertDefined(result.ok()).result
    );
    const cardElections = convertedCards.map((card) => card.election);
    const { result: electionDefinition, issues } =
      combineConvertedElectionsIntoPrimaryElection(cardElections).okOrElse(
        fail
      );
    const cardBallotStyles = cardElections.map((election) => {
      assert(election.ballotStyles.length === 1);
      return assertDefined(election.ballotStyles[0]);
    });
    assert(
      deepEqual(
        cardBallotStyles.map((style) => style.id),
        electionDefinition.election.ballotStyles.map((style) => style.id)
      )
    );
    const ballotPdfsByBallotStyle = new Map(
      iter(cardBallotStyles).zip(
        cardDefinitions.map((definition) => definition.ballotPdf)
      )
    );
    const templateGridsByBallotStyle = new Map(
      iter(convertedCards)
        .zip(cardBallotStyles)
        .map(([card, ballotStyle]) => [ballotStyle, card.templateGrid])
    );
    const ballotPdfsWithMetadata = await addQrCodeMetadataToBallots(
      electionDefinition,
      ballotPdfsByBallotStyle
    );
    const ballotProofingPdfs = await addBallotProofingAnnotationsToBallots(
      electionDefinition,
      ballotPdfsByBallotStyle,
      templateGridsByBallotStyle
    );
    return ok({
      result: {
        electionDefinition,
        ballotPdfs: new Map(
          cardBallotStyles.flatMap((ballotStyle) => {
            const printing = assertDefined(
              iter(ballotPdfsWithMetadata)
                .filter(
                  ([metadata]) => metadata.ballotStyleId === ballotStyle.id
                )
                .first()
            );
            const proofing = assertDefined(
              iter(ballotProofingPdfs)
                .filter(
                  ([metadata]) => metadata.ballotStyleId === ballotStyle.id
                )
                .first()
            );
            return [
              [printing[0], { printing: printing[1], proofing: proofing[1] }],
            ];
          })
        ),
      },
      issues: cardResults
        .flatMap((result) => assertDefined(result.ok()).issues)
        .concat(issues),
    });
  });
}
