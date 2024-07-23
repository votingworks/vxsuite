import { findTemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
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
import {
  BallotMetadata,
  BallotStyle,
  BallotType,
  Contest,
  Contests,
  District,
  Election,
  ElectionDefinition,
  GridLayout,
  GridPosition,
  asSheet,
  getContests,
  getPartyForBallotStyle,
  safeParseElectionDefinition,
  safeParseNumber,
} from '@votingworks/types';
import fs from 'node:fs';
import { rgb } from 'pdf-lib';
import { addQrCodeMetadataToBallotPdf } from '../encode_metadata';
import { PdfReader } from '../pdf_reader';
import { convertElectionDefinitionHeader } from './convert_election_definition_header';
import { getPdfPagePointForGridPoint } from './debug';
import { makeId } from './make_id';
import { matchContestOptionsOnGrid } from './match_contest_options_on_grid';
import { oxOyFromTimingMarkCoordinates } from './read_grid_from_election_definition';
import {
  ConvertIssue,
  ConvertIssueKind,
  NewHampshireBallotCardDefinition,
  PairColumnEntriesIssueKind,
  ResultWithIssues,
  TemplateBubbleGridEntry,
} from './types';

async function convertCardDefinition(
  cardDefinition: NewHampshireBallotCardDefinition
): Promise<ResultWithIssues<Election>> {
  return asyncResultBlock(async (fail) => {
    const convertHeader = convertElectionDefinitionHeader(
      cardDefinition.definition
    ).okOrElse(fail);

    const { result: election, issues: headerIssues } = convertHeader;
    let success = true;
    const issues = [...headerIssues];

    if (!cardDefinition.pages) {
      const pageCount = await cardDefinition.ballotPdf.getPageCount();
      if (pageCount !== 2) {
        return err({
          issues: [
            ...issues,
            typedAs<ConvertIssue>({
              kind: ConvertIssueKind.InvalidBallotTemplateNumPages,
              message: `Expected exactly two pages in the ballot PDF, but found ${pageCount}`,
            }),
          ],
        });
      }
    }

    const pageImages = await iter(cardDefinition.pages ?? [1, 2])
      .async()
      .map(
        async (pageNumber) =>
          (await cardDefinition.ballotPdf.getPage(pageNumber))?.page
      )
      .toArray();

    const pages = asSheet(pageImages);
    const [frontPage, backPage] = pages;
    assert(frontPage);
    assert(backPage);

    const findTemplateGridAndBubblesResult = findTemplateGridAndBubbles([
      frontPage,
      backPage,
    ]);
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

    if (
      frontGridAndBubbles.metadata?.side === 'back' &&
      backGridAndBubbles.metadata?.side === 'front'
    ) {
      [frontGridAndBubbles, backGridAndBubbles] = [
        backGridAndBubbles,
        frontGridAndBubbles,
      ];
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
    const contests = getContests({ ballotStyle, election });
    const ballotStyleId = makeId(
      `${partyPrefix}card-number-${cardNumber}`,
      contests.map((contest) => contest.id).join(',')
    );

    const frontTemplateBubbles = frontGridAndBubbles.bubbles;
    const backTemplateBubbles = backGridAndBubbles.bubbles;

    const xmlBubbleCoordinates = Array.from(
      cardDefinition.definition.getElementsByTagName('CandidateName')
    ).map((candidateElement) => {
      const ox = safeParseNumber(
        candidateElement.getElementsByTagName('OX')[0]?.textContent
      ).unsafeUnwrap();
      const oy = safeParseNumber(
        candidateElement.getElementsByTagName('OY')[0]?.textContent
      ).unsafeUnwrap();
      return `      <OX>${ox}</OX>\r\n      <OY>${oy}</OY>`;
    });

    const pdfBubbleCoordinates = frontTemplateBubbles
      .map((value) =>
        oxOyFromTimingMarkCoordinates({ column: value.x, row: value.y })
      )
      .map(
        ({ ox, oy }) =>
          `      <OX>${Math.round(ox)}</OX>\r\n      <OY>${Math.round(oy)}</OY>`
      );

    if (xmlBubbleCoordinates.length !== pdfBubbleCoordinates.length) {
      throw new Error(
        `XML and PDF have different numbers of bubbles: ` +
          `${xmlBubbleCoordinates.length} != ${pdfBubbleCoordinates.length}`
      );
    }

    let editedFile = fs.readFileSync(cardDefinition.definitionPath, 'utf-8');
    for (const [i, find] of xmlBubbleCoordinates.entries()) {
      const replace = assertDefined(pdfBubbleCoordinates[i]);
      editedFile = editedFile.replace(find, replace);
    }
    // fs.writeFileSync(
    //   cardDefinition.definitionPath.replace('.xml', '-edited.xml'),
    //   editedFile
    // );

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
    const populatedGridLayout: GridLayout = {
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
                x: bubble.column - (bubble.column === 20 ? 8.1 : 8.9),
                y: bubble.row - 0.25,
                width: bubble.column === 20 ? 6 : 6.8,
                height: 0.55,
              },
            }
      ),
    };
    const result: Election = {
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
      gridLayouts: [populatedGridLayout],
    };

    if (cardDefinition.debugPdf) {
      const { geometry } = frontGridAndBubbles.grid;
      const frontDebugPdf = cardDefinition.debugPdf.getPage(0);
      const backDebugPdf = cardDefinition.debugPdf.getPage(1);
      const circleRadius =
        ((geometry.timingMarkSize.height / 2) * 72) / geometry.pixelsPerInch;

      for (const [bubbles, debugPage] of [
        [frontGridAndBubbles.bubbles, frontDebugPdf],
        [backGridAndBubbles.bubbles, backDebugPdf],
      ] as const) {
        for (const bubble of bubbles) {
          const bubbleCenterInPdfPage = getPdfPagePointForGridPoint(
            debugPage,
            frontGridAndBubbles.grid,
            bubble
          );

          debugPage.drawCircle({
            x: bubbleCenterInPdfPage.x,
            y: bubbleCenterInPdfPage.y,
            size: circleRadius,
            color: rgb(1, 0, 0),
          });
        }
      }

      for (const position of populatedGridLayout.gridPositions) {
        const debugPage =
          position.side === 'front' ? frontDebugPdf : backDebugPdf;
        const { column, row } = position;

        const bubbleCenterInPdfPage = getPdfPagePointForGridPoint(
          debugPage,
          frontGridAndBubbles.grid,
          { x: column, y: row }
        );

        const textSize = 6;
        debugPage.drawText(
          position.type === 'option'
            ? position.optionId
            : `Write-In #${position.writeInIndex + 1}`,
          {
            x: bubbleCenterInPdfPage.x - 80,
            y: bubbleCenterInPdfPage.y - textSize / 2,
            size: textSize,
            color: rgb(0, 0.4, 0),
          }
        );

        debugPage.drawCircle({
          x: bubbleCenterInPdfPage.x,
          y: bubbleCenterInPdfPage.y,
          size: circleRadius,
          color: rgb(0, 1, 0),
        });
      }
    }

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

  const allContests = elections.flatMap((election) => election.contests);
  const allContestIds = new Set(allContests.flatMap((contest) => contest.id));

  let combinedDistricts: District[];
  let combinedContests: Contests;
  let combinedBallotStyles: BallotStyle[];

  if (county.name === 'Rochester') {
    const contestIdToPrecinctIds: { [contestId: string]: Set<string> } = {};
    for (const { precincts, contests } of elections) {
      assert(precincts[0] !== undefined);
      assert(precincts.length === 1);
      const [precinct] = precincts;
      for (const contest of contests) {
        if (!contestIdToPrecinctIds[contest.id]) {
          contestIdToPrecinctIds[contest.id] = new Set();
        }
        assertDefined(contestIdToPrecinctIds[contest.id]).add(precinct.id);
      }
    }

    const precinctIdSetsToContestIds: { [precinctIdSetStr: string]: string[] } =
      {};
    for (const [contestId, precinctIds] of Object.entries(
      contestIdToPrecinctIds
    )) {
      const precinctIdSetStr = Array.from(precinctIds).sort().join('+');
      if (!precinctIdSetsToContestIds[precinctIdSetStr]) {
        precinctIdSetsToContestIds[precinctIdSetStr] = [];
      }
      assertDefined(precinctIdSetsToContestIds[precinctIdSetStr]).push(
        contestId
      );
    }

    const districts: Array<{
      id: string;
      name: string;
      precinctIds: string[];
      contestIds: string[];
    }> = [];
    for (const [precinctIdSetStr, contestIds] of Object.entries(
      precinctIdSetsToContestIds
    )) {
      const precinctIds = precinctIdSetStr.split('+');
      // All Rochester Wards
      if (precinctIds.length === 6) {
        districts.push({
          id: 'all-wards',
          name: 'All Wards',
          precinctIds,
          contestIds,
        });
      } else if (
        contestIds.every((contestId) => contestId.includes('District-5'))
      ) {
        districts.push({
          id: 'district-5',
          name: 'District 5',
          precinctIds,
          contestIds,
        });
      } else if (
        contestIds.every((contestId) => contestId.includes('District-19'))
      ) {
        districts.push({
          id: 'district-19',
          name: 'District 19',
          precinctIds,
          contestIds,
        });
      } else if (
        contestIds.every((contestId) => contestId.includes('District-6'))
      ) {
        districts.push({
          id: 'district-6',
          name: 'District 6',
          precinctIds,
          contestIds,
        });
      } else if (
        contestIds.every((contestId) => contestId.includes('District-7'))
      ) {
        districts.push({
          id: 'district-7',
          name: 'District 7',
          precinctIds,
          contestIds,
        });
      } else if (
        contestIds.every((contestId) => contestId.includes('District-8'))
      ) {
        districts.push({
          id: 'district-8',
          name: 'District 8',
          precinctIds,
          contestIds,
        });
      } else if (
        contestIds.every((contestId) => contestId.includes('District-9'))
      ) {
        districts.push({
          id: 'district-9',
          name: 'District 9',
          precinctIds,
          contestIds,
        });
      } else if (
        precinctIds.length === 1 &&
        precinctIds[0]?.includes('20205')
      ) {
        districts.push({
          id: 'ward-5',
          name: 'Ward 5',
          precinctIds,
          contestIds,
        });
      } else {
        throw new Error('Unaccounted for district');
      }
    }

    const contestIdToDistrictId: { [contestId: string]: string } = {};
    for (const district of districts) {
      for (const contestId of district.contestIds) {
        assert(contestIdToDistrictId[contestId] === undefined);
        contestIdToDistrictId[contestId] = district.id;
      }
    }

    const precinctIdToDistrictIds: { [precinctId: string]: string[] } = {};
    for (const district of districts) {
      for (const precinctId of district.precinctIds) {
        if (!precinctIdToDistrictIds[precinctId]) {
          precinctIdToDistrictIds[precinctId] = [];
        }
        assertDefined(precinctIdToDistrictIds[precinctId]).push(district.id);
      }
    }

    combinedDistricts = districts.map(
      (d) => ({ id: d.id, name: d.name }) as unknown as District
    );
    combinedContests = iter(allContestIds)
      .map((id) =>
        assertDefined(allContests.find((contest) => contest.id === id))
      )
      .map((contest) => {
        const contestWithCorrectedDistrict = {
          ...contest,
          districtId: assertDefined(contestIdToDistrictId[contest.id]),
        } as unknown as Contest;
        return contestWithCorrectedDistrict;
      })
      .toArray() as unknown as Contests;
    combinedBallotStyles = elections
      .flatMap((election) => election.ballotStyles)
      .map((ballotStyle) => {
        assert(ballotStyle.precincts[0] !== undefined);
        assert(ballotStyle.precincts.length === 1);
        return {
          ...ballotStyle,
          districts: assertDefined(
            precinctIdToDistrictIds[ballotStyle.precincts[0]]
          ),
        };
      }) as unknown as BallotStyle[];
  } else {
    combinedDistricts = uniqueDeep(
      elections.flatMap((election) => election.districts)
    );
    combinedContests = iter(allContestIds)
      .map((id) =>
        assertDefined(allContests.find((contest) => contest.id === id))
      )
      .toArray();
    combinedBallotStyles = elections.flatMap(
      (election) => election.ballotStyles
    );
  }

  const combinedElection: Election = {
    title,
    type,
    date,
    state,
    county,
    seal,
    ballotLayout,
    districts: combinedDistricts,
    precincts: uniqueDeep(elections.flatMap((election) => election.precincts)),
    contests: combinedContests,
    parties: uniqueDeep(elections.flatMap((election) => election.parties)),
    ballotStyles: combinedBallotStyles,
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
  ballotPdfInfoByBallotStyle: Map<
    BallotStyle,
    { ballotPdf: PdfReader; pages?: [number, number] }
  >
): Promise<Map<BallotMetadata, Uint8Array>> {
  const ballotPdfsWithMetadata = new Map<BallotMetadata, Uint8Array>();
  for (const [
    ballotStyle,
    { ballotPdf, pages },
  ] of ballotPdfInfoByBallotStyle.entries()) {
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
        ballotPdf,
        pages ?? [1, 2]
      );
      ballotPdfsWithMetadata.set(metadata, ballotPdfWithMetadata);
    }
  }
  return ballotPdfsWithMetadata;
}

/**
 * A converted election definition and the resulting ballot PDFs with metadata.
 */
export type ConvertResult = ResultWithIssues<{
  electionDefinition: ElectionDefinition;
  ballotPdfsWithMetadata: Map<BallotMetadata, Uint8Array>;
}>;

/**
 * Convert New Hampshire XML files to a single {@link Election} object. If given
 * multiple XML files (e.g. for a primary election), treats each one as a
 * separate ballot style or precinct.
 */
export function convertElectionDefinition(
  cardDefinitions: NewHampshireBallotCardDefinition[],
  { jurisdictionOverride }: { jurisdictionOverride?: string } = {}
): Promise<ConvertResult> {
  return asyncResultBlock(async (fail) => {
    const cardResults = await Promise.all(
      cardDefinitions.map(convertCardDefinition)
    );
    cardResults.find((result) => result.isErr())?.okOrElse(fail);
    const cardElections = cardResults
      .map((result) => result.unsafeUnwrap().result)
      .map(
        (election): Election =>
          !jurisdictionOverride
            ? election
            : {
                ...election,
                county: {
                  id: election.county.id,
                  name: jurisdictionOverride,
                },
                districts: election.districts.map((district) => ({
                  ...district,
                  name: jurisdictionOverride,
                })),
              }
      );
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
    const ballotPdfInfoByBallotStyle = new Map(
      iter(cardBallotStyles)
        .zip(
          cardDefinitions.map((definition) => ({
            ballotPdf: definition.ballotPdf,
            pages: definition.pages,
          }))
        )
        .toArray()
    );
    const ballotPdfsWithMetadata = await addQrCodeMetadataToBallots(
      electionDefinition,
      ballotPdfInfoByBallotStyle
    );

    return ok({
      result: {
        electionDefinition,
        ballotPdfsWithMetadata,
      },
      issues: cardResults
        .flatMap((result) => assertDefined(result.ok()).issues)
        .concat(issues),
    });
  });
}
