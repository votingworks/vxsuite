import {
  TemplateGridAndBubbles,
  findTemplateGridAndBubbles,
} from '@votingworks/ballot-interpreter';
import {
  Result,
  assert,
  assertDefined,
  asyncResultBlock,
  deepEqual,
  err,
  find,
  iter,
  ok,
  resultBlock,
  throwIllegalValue,
  typedAs,
  uniqueDeep,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotMetadata,
  BallotStyle,
  BallotStyleId,
  BallotType,
  ContestId,
  District,
  DistrictId,
  Election,
  ElectionDefinition,
  GridPosition,
  PrecinctId,
  SheetOf,
  asSheet,
  getPartyForBallotStyle,
  mapSheet,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { Buffer } from 'buffer';
import { ImageData } from 'canvas';
import { PDFDocument } from 'pdf-lib';
import { inspect } from 'util';
import { addQrCodeMetadataToBallotPdf } from '../encode_metadata';
import {
  addBallotProofingAnnotationsToPdf,
  addMatchResultAnnotations,
} from '../proofing';
import * as accuvote from './accuvote';
import {
  AccuVoteDataToIdMap,
  AccuVoteDataToIdMapImpl,
} from './accuvote_data_to_id_map';
import { matchBubblesAndContestOptionsUsingContestColumns } from './bubble-layouts/contest-columns';
import { matchBubblesAndContestOptionsUsingPartyColumns } from './bubble-layouts/party-columns';
import { matchBubblesAndContestOptionsUsingSpacialMapping } from './bubble-layouts/relative-spacial';
import { byColumnThenSideThenRow } from './bubble-layouts/relative-spacial/ordering';
import { convertElectionDefinitionHeader } from './convert_election_definition_header';
import {
  CorrectedDefinitionAndMetadata,
  correctAccuVoteDefinition,
} from './correct_definition';
import {
  AnyMatched,
  BubbleLayout,
  ConvertIssue,
  ConvertIssueKind,
  MatchBubblesResult,
  MatchedHackyParsedConstitutionalQuestion,
  RawCardDefinition,
  ResultWithIssues,
} from './types';

/**
 * A successfully converted card definition along with some additional data.
 */
export interface ConvertedCard {
  correctedDefinitionAndMetadata: CorrectedDefinitionAndMetadata;
  election: Election;
  issues: ConvertIssue[];
  matchBubblesResult: MatchBubblesResult;
}

/**
 * A loaded card definition along with the parsed bubbles and timing marks.
 */
export interface ParsedCardDefinition {
  definition: accuvote.AvsInterface;
  gridsAndBubbles: TemplateGridAndBubbles;
}

/**
 * Parses a card definition from a New Hampshire XML file and a ballot PDF,
 * reading the bubbles and timing marks from the PDF.
 */
export async function parseCardDefinition(
  rawCard: RawCardDefinition
): Promise<Result<ParsedCardDefinition, ConvertIssue[]>> {
  const parseResult = accuvote.parseXml(rawCard.definition);

  if (parseResult.isErr()) {
    return err(parseResult.err());
  }

  const definition = parseResult.ok();
  let pageImages: ImageData[];

  if (!rawCard.pages) {
    const pageCount = await rawCard.ballotPdf.getPageCount();

    if (pageCount !== 2) {
      return err([
        typedAs<ConvertIssue>({
          kind: ConvertIssueKind.InvalidBallotTemplateNumPages,
          message: `Expected exactly two pages in the ballot PDF, but found ${pageCount}`,
        }),
      ]);
    }
    pageImages = await iter(rawCard.ballotPdf.pages())
      .map(({ page }) => page)
      .toArray();
  } else {
    pageImages = [
      assertDefined(await rawCard.ballotPdf.getPage(rawCard.pages[0])).page,
      assertDefined(await rawCard.ballotPdf.getPage(rawCard.pages[1])).page,
    ];
  }

  const findTemplateGridAndBubblesResult = findTemplateGridAndBubbles(
    asSheet(pageImages)
  );
  if (findTemplateGridAndBubblesResult.isErr()) {
    return err([
      typedAs<ConvertIssue>({
        kind: ConvertIssueKind.TimingMarkDetectionFailed,
        message: `failed to detect timing marks: ${inspect(
          findTemplateGridAndBubblesResult.err()
        )}`,
        side: 'front',
      }),
    ]);
  }
  const gridsAndBubbles = findTemplateGridAndBubblesResult.ok();

  return ok({
    definition,
    gridsAndBubbles,
  });
}

interface ConvertCardDefinitionOptions {
  definition: accuvote.AvsInterface;
  gridsAndBubbles: TemplateGridAndBubbles;
  matched: SheetOf<
    Array<Exclude<AnyMatched, MatchedHackyParsedConstitutionalQuestion>>
  >;
}

function convertCardDefinition({
  definition,
  gridsAndBubbles,
  matched,
}: ConvertCardDefinitionOptions): ResultWithIssues<Election> {
  return resultBlock((bail) => {
    const issues: ConvertIssue[] = [];
    const [frontGridAndBubbles, backGridAndBubbles] = gridsAndBubbles;

    const convertHeader =
      convertElectionDefinitionHeader(definition).okOrElse(bail);
    const {
      result: { election, accuVoteToIdMap },
      issues: headerIssues,
    } = convertHeader;
    issues.push(...headerIssues);

    if (
      frontGridAndBubbles.grid.geometry.ballotPaperSize !==
        backGridAndBubbles.grid.geometry.ballotPaperSize ||
      frontGridAndBubbles.grid.geometry.ballotPaperSize !==
        convertHeader.result.election.ballotLayout.paperSize
    ) {
      issues.push({
        kind: ConvertIssueKind.InvalidTemplateSize,
        message: 'Template images do not match expected sizes.',
        paperSize: convertHeader.result.election.ballotLayout.paperSize,
        frontTemplateSize: frontGridAndBubbles.grid.geometry.canvasSize,
        backTemplateSize: backGridAndBubbles.grid.geometry.canvasSize,
      });
    }

    const ballotStyle = election.ballotStyles[0];
    assert(ballotStyle, 'ballot style missing');

    const ballotStyleParty = getPartyForBallotStyle({
      ballotStyleId: ballotStyle.id,
      election,
    });
    const ballotStyleId = accuVoteToIdMap.ballotStyleId(
      election.precincts.map(({ id }) => id),
      election.districts.map(({ id }) => id),
      ballotStyleParty?.id
    );
    const electionPartyName = definition.accuvoteHeaderInfo.partyName;

    return ok({
      issues,
      result: typedAs<Election>({
        ...election,
        ballotLayout: {
          ...election.ballotLayout,
          paperSize: frontGridAndBubbles.grid.geometry.ballotPaperSize,
        },
        ballotStyles: [
          {
            ...ballotStyle,
            id: ballotStyleId,
          },
        ],
        gridLayouts: [
          {
            ballotStyleId,
            // hardcoded for NH state elections
            optionBoundsFromTargetMark: {
              left: 5,
              top: 1,
              right: 1,
              bottom: 1,
            },
            accuvoteMetadata:
              gridsAndBubbles[0].metadata?.side === 'front' &&
              gridsAndBubbles[1].metadata?.side === 'back'
                ? {
                    front: gridsAndBubbles[0].metadata,
                    back: gridsAndBubbles[1].metadata,
                  }
                : undefined,
            gridPositions: mapSheet(matched, (matchesForSide, side) =>
              // eslint-disable-next-line array-callback-return
              matchesForSide.map((entry): GridPosition => {
                switch (entry.type) {
                  case 'candidate': {
                    const contest = find(
                      definition.candidates,
                      ({ officeName }) => officeName === entry.office
                    );

                    if (entry.candidate.writeIn) {
                      const writeInIndex = contest.candidateNames
                        .filter(({ writeIn }) => writeIn)
                        .findIndex(
                          (candidate) => candidate === entry.candidate
                        );
                      assert(
                        writeInIndex >= 0,
                        `write-in index not found for candidate: ${inspect(
                          entry.candidate
                        )}`
                      );

                      return {
                        type: 'write-in',
                        sheetNumber: 1,
                        side,
                        column: entry.bubble.x,
                        row: entry.bubble.y,
                        contestId: accuVoteToIdMap.candidateContestId(
                          contest,
                          electionPartyName
                        ),
                        writeInIndex,
                        // This area is based on the largest rectangle that fits in
                        // the write-in box without intersecting with any of the contest
                        // labels (there may be more than one in a multi-seat
                        // contest). Some examples of the ballots this was based on
                        // can be found in the NH elections in libs/fixtures.
                        writeInArea: {
                          x: entry.bubble.x - 5,
                          y: entry.bubble.y - 0.65,
                          width: 4.5,
                          height: 0.85,
                        },
                      };
                    }

                    return {
                      type: 'option',
                      sheetNumber: 1,
                      side,
                      column: entry.bubble.x,
                      row: entry.bubble.y,
                      contestId: accuVoteToIdMap.candidateContestId(
                        contest,
                        electionPartyName
                      ),
                      optionId: accuVoteToIdMap.candidateId(entry.candidate),
                    };
                  }

                  case 'yesno':
                    return {
                      type: 'option',
                      sheetNumber: 1,
                      side,
                      column: entry.bubble.x,
                      row: entry.bubble.y,
                      contestId: accuVoteToIdMap.yesNoContestId(entry.question),
                      optionId:
                        entry.option === 'yes'
                          ? accuVoteToIdMap.yesOptionId(entry.question)
                          : accuVoteToIdMap.noOptionId(entry.question),
                    };

                  default:
                    throwIllegalValue(entry, 'type');
                }
              })
            )
              .flat()
              .sort(byColumnThenSideThenRow),
          },
        ],
      }),
    });
  });
}

/**
 * Given a list of single-ballot style elections for different parties (from
 * converted NH election definitions), combine them into a single primary
 * election with a ballot style for each party.
 */
function combineConvertedElectionsIntoPrimaryElection(
  elections: readonly Election[],
  accuvoteToIdMap: AccuVoteDataToIdMap
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

  const precinctIdsByContestId = new Map<ContestId, Set<PrecinctId>>();

  for (const election of elections) {
    for (const precinct of election.precincts) {
      for (const contest of election.contests) {
        let precinctIds = precinctIdsByContestId.get(contest.id);
        if (!precinctIds) {
          precinctIds = new Set();
          precinctIdsByContestId.set(contest.id, precinctIds);
        }
        precinctIds.add(precinct.id);
      }
    }
  }

  const districtIdsByPrecinctId = new Map<PrecinctId, Set<DistrictId>>();
  const precinctIdsByDistrictId = new Map<DistrictId, Set<PrecinctId>>();
  const districtIdByContestId = new Map<ContestId, DistrictId>();

  for (const [contestId, precinctIds] of precinctIdsByContestId) {
    const districtId = accuvoteToIdMap.districtId(precinctIds);
    districtIdByContestId.set(contestId, districtId);
    precinctIdsByDistrictId.set(districtId, precinctIds);
    for (const precinctId of precinctIds) {
      let districtIds = districtIdsByPrecinctId.get(precinctId);
      if (!districtIds) {
        districtIds = new Set();
        districtIdsByPrecinctId.set(precinctId, districtIds);
      }
      districtIds.add(districtId);
    }
  }

  function combineContests(): AnyContest[] {
    const contests: AnyContest[] = [];
    const originalContestById = new Map<ContestId, AnyContest>();
    const uniqueContests = uniqueDeep(
      elections.flatMap((election) =>
        election.contests.map((contest) => {
          if (!originalContestById.has(contest.id)) {
            originalContestById.set(contest.id, contest);
          }

          return {
            ...contest,
            // districtId is not used in the comparison since we're going to
            // reassign it based on precincts
            districtId: undefined,
            // likewise candidates are not used in the comparison since the
            // order of candidates is not guaranteed to be the same across
            // different ballot styles
            candidates: [],
            yesOption: undefined,
            noOption: undefined,
          };
        })
      )
    );

    for (const contest of uniqueContests) {
      // don't bother filtering out duplicate contests since they'll be caught
      // later when we try to parse the election definition
      const districtId = assertDefined(districtIdByContestId.get(contest.id));
      const originalContest = assertDefined(
        originalContestById.get(contest.id)
      );

      switch (contest.type) {
        case 'candidate':
          assert(originalContest.type === 'candidate');
          contests.push({
            ...contest,
            districtId,
            candidates: originalContest.candidates,
          });
          break;

        case 'yesno':
          assert(originalContest.type === 'yesno');
          contests.push({
            ...contest,
            districtId,
            yesOption: originalContest.yesOption,
            noOption: originalContest.noOption,
          });
          break;

        default:
          throwIllegalValue(contest, 'type');
      }
    }

    return contests;
  }

  const ballotStyles: BallotStyle[] = [];
  const updatedBallotStyleIdMap = new Map<BallotStyleId, BallotStyleId>();

  for (const election of elections) {
    for (const ballotStyle of election.ballotStyles) {
      const precinctIds = ballotStyle.precincts;
      const districtIds = iter(precinctIds)
        .flatMap((precinctId) =>
          assertDefined(districtIdsByPrecinctId.get(precinctId))
        )
        .toSet();
      const newBallotStyleId = accuvoteToIdMap.ballotStyleId(
        precinctIds,
        districtIds,
        ballotStyle.partyId
      );
      ballotStyles.push({
        id: newBallotStyleId,
        precincts: precinctIds,
        districts: Array.from(districtIds),
        partyId: ballotStyle.partyId,
      });
      updatedBallotStyleIdMap.set(ballotStyle.id, newBallotStyleId);
    }
  }

  const districts = iter(precinctIdsByDistrictId.keys())
    .map(
      (districtId): District => ({
        id: districtId,
        name: districtId,
      })
    )
    .toArray();

  const combinedElection: Election = {
    title,
    type,
    date,
    state,
    county,
    seal,
    ballotLayout,
    districts,
    precincts: uniqueDeep(elections.flatMap((election) => election.precincts)),
    contests: combineContests(),
    parties: uniqueDeep(elections.flatMap((election) => election.parties)),
    ballotStyles,
    gridLayouts: elections.flatMap((election) =>
      assertDefined(election.gridLayouts).map((layout) => ({
        ...layout,
        ballotStyleId: assertDefined(
          updatedBallotStyleIdMap.get(layout.ballotStyleId)
        ),
      }))
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

async function loadCardFromPdfPages(
  pdf: Buffer,
  pages: SheetOf<number>
): Promise<PDFDocument> {
  const originalDocument = await PDFDocument.load(pdf);
  const copiedDocument = await PDFDocument.create();
  const copiedPages = await copiedDocument.copyPages(
    originalDocument,
    pages.map((pageNumber) => pageNumber - 1)
  );
  copiedDocument.addPage(copiedPages[0]);
  copiedDocument.addPage(copiedPages[1]);
  return copiedDocument;
}

async function addQrCodeMetadataToBallots(
  electionDefinition: ElectionDefinition,
  ballotPdfsByBallotStyle: Map<
    BallotStyle,
    { data: Buffer; pages: SheetOf<number> }
  >
): Promise<Map<BallotMetadata, Uint8Array>> {
  const ballotPdfsWithMetadata = new Map<BallotMetadata, Uint8Array>();
  for (const [
    ballotStyle,
    { data: ballotPdf, pages },
  ] of ballotPdfsByBallotStyle.entries()) {
    for (const precinctId of ballotStyle.precincts) {
      const metadata: BallotMetadata = {
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType: BallotType.Precinct,
        isTestMode: false,
        electionHash: electionDefinition.electionHash,
      };
      const document = await loadCardFromPdfPages(ballotPdf, pages);
      await addQrCodeMetadataToBallotPdf(
        document,
        electionDefinition.election,
        metadata
      );
      ballotPdfsWithMetadata.set(metadata, await document.save());
    }
  }
  return ballotPdfsWithMetadata;
}

async function addBallotProofingAnnotationsToBallots(
  electionDefinition: ElectionDefinition,
  ballotPdfsByBallotStyle: Map<
    BallotStyle,
    { data: Buffer; pages: SheetOf<number> }
  >,
  templateGridsByBallotStyle: Map<BallotStyle, TemplateGridAndBubbles>,
  matchBubblesResultByBallotStyle: Map<BallotStyle, MatchBubblesResult>
): Promise<Map<BallotMetadata, Uint8Array>> {
  const ballotPdfsForProofing = new Map<BallotMetadata, Uint8Array>();
  for (const [
    ballotStyle,
    { data: ballotPdf, pages },
  ] of ballotPdfsByBallotStyle.entries()) {
    const originalDocument = await loadCardFromPdfPages(ballotPdf, pages);
    const templateGrid = assertDefined(
      templateGridsByBallotStyle.get(ballotStyle)
    );
    const matchBubblesResult = assertDefined(
      matchBubblesResultByBallotStyle.get(ballotStyle)
    );

    for (const precinctId of ballotStyle.precincts) {
      const metadata: BallotMetadata = {
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType: BallotType.Precinct,
        isTestMode: false,
        electionHash: electionDefinition.electionHash,
      };
      const document = await originalDocument.copy();
      if (matchBubblesResult.unmatched.length) {
        await addMatchResultAnnotations({
          document,
          grids: mapSheet(templateGrid, ({ grid }) => grid),
          matchResult: matchBubblesResult,
        });
      } else {
        await addBallotProofingAnnotationsToPdf(
          document,
          assertDefined(
            electionDefinition.election.gridLayouts?.find(
              (layout) => layout.ballotStyleId === ballotStyle.id
            )
          ),
          templateGrid
        );
      }
      ballotPdfsForProofing.set(metadata, await document.save());
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
  correctedDefinitions: Map<BallotStyleId, accuvote.AvsInterface>;
}>;

/**
 * Convert New Hampshire XML files to a single {@link Election} object. If given
 * multiple XML files (e.g. for a primary election), treats each one as a
 * separate ballot style.
 */
export function convertElectionDefinition(
  cardDefinitions: RawCardDefinition[],
  {
    jurisdictionOverride,
    bubbleLayout,
  }: { jurisdictionOverride?: string; bubbleLayout: BubbleLayout }
): Promise<ConvertResult> {
  return asyncResultBlock(async (bail) => {
    const convertedCards: ConvertedCard[] = [];

    for (const cardDefinition of cardDefinitions) {
      const parsed = (await parseCardDefinition(cardDefinition)).okOrElse(
        (issues: ConvertIssue[]) => bail({ issues })
      );

      const matchResult =
        bubbleLayout === BubbleLayout.RelativeSpacial
          ? matchBubblesAndContestOptionsUsingSpacialMapping(parsed)
          : bubbleLayout === BubbleLayout.PartyColumns
          ? matchBubblesAndContestOptionsUsingPartyColumns(parsed)
          : bubbleLayout === BubbleLayout.ContestColumns
          ? matchBubblesAndContestOptionsUsingContestColumns(parsed)
          : bail({
              issues: [
                {
                  kind: ConvertIssueKind.BubbleMatchingFailed,
                  message: `Unsupported bubble layout: ${bubbleLayout}`,
                },
              ],
            });

      if (matchResult.isErr()) {
        const error = matchResult.err();
        return bail({
          issues: [
            {
              kind: ConvertIssueKind.BubbleMatchingFailed,
              message: error.message,
              error,
            },
          ],
        });
      }

      const matchBubblesResult = matchResult.ok();
      const issues: ConvertIssue[] = [];

      if (matchBubblesResult.unmatched.length) {
        issues.push({
          kind: ConvertIssueKind.BubbleMatchingFailed,
          message: `Some bubbles could not be matched to contest options: ${inspect(
            matchBubblesResult.unmatched,
            { depth: 5 }
          )}`,
        });
      }

      const correctedDefinitionAndMetadata = correctAccuVoteDefinition({
        definition: parsed.definition,
        gridsAndBubbles: parsed.gridsAndBubbles,
        matched: matchBubblesResult.matched,
      });

      const convertResult = convertCardDefinition({
        definition: correctedDefinitionAndMetadata.definition,
        gridsAndBubbles: correctedDefinitionAndMetadata.gridsAndBubbles,
        matched: correctedDefinitionAndMetadata.matched,
      });
      if (convertResult.isErr()) {
        return bail(convertResult.err());
      }

      const { result: election, issues: convertIssues } = convertResult.ok();
      issues.push(...convertIssues);

      convertedCards.push({
        correctedDefinitionAndMetadata,
        election: jurisdictionOverride
          ? {
              ...election,
              county: { ...election.county, name: jurisdictionOverride },
              districts: election.districts.map((district) => ({
                ...district,
                name: jurisdictionOverride,
              })),
            }
          : election,
        issues,
        matchBubblesResult,
      });
    }

    const cardElections = convertedCards.map((card) => card.election);
    const issues = convertedCards.flatMap((card) => card.issues);
    const { result: electionDefinition, issues: combineIssues } =
      combineConvertedElectionsIntoPrimaryElection(
        cardElections,
        new AccuVoteDataToIdMapImpl()
      ).okOrElse(bail);
    issues.push(...combineIssues);
    assert(
      cardElections.length === electionDefinition.election.ballotStyles.length
    );
    const ballotPdfsByBallotStyle = new Map(
      iter(electionDefinition.election.ballotStyles).zip(
        cardDefinitions.map((definition) => ({
          data: definition.ballotPdf.getOriginalData(),
          pages: definition.pages ?? [1, 2],
        }))
      )
    );
    const templateGridsByBallotStyle = new Map(
      iter(convertedCards)
        .zip(electionDefinition.election.ballotStyles)
        .map(([card, ballotStyle]) => [
          ballotStyle,
          card.correctedDefinitionAndMetadata.gridsAndBubbles,
        ])
    );
    const matchBubblesResultByBallotStyle = new Map(
      iter(convertedCards)
        .zip(electionDefinition.election.ballotStyles)
        .map(([card, ballotStyle]) => [ballotStyle, card.matchBubblesResult])
    );
    const ballotPdfsWithMetadata = await addQrCodeMetadataToBallots(
      electionDefinition,
      ballotPdfsByBallotStyle
    );
    const ballotProofingPdfs = await addBallotProofingAnnotationsToBallots(
      electionDefinition,
      ballotPdfsByBallotStyle,
      templateGridsByBallotStyle,
      matchBubblesResultByBallotStyle
    );
    return ok({
      result: {
        electionDefinition,
        ballotPdfs: new Map(
          electionDefinition.election.ballotStyles.flatMap((ballotStyle) => {
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
        correctedDefinitions: new Map(
          electionDefinition.election.ballotStyles.map((ballotStyle, i) => [
            ballotStyle.id,
            assertDefined(convertedCards[i]).correctedDefinitionAndMetadata
              .definition,
          ])
        ),
      },
      issues,
    });
  });
}
