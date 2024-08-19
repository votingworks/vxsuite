import { findTemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import {
  Result,
  assert,
  assertDefined,
  asyncResultBlock,
  err,
  iter,
  ok,
  resultBlock,
  typedAs,
} from '@votingworks/basics';
import { PdfPage } from '@votingworks/image-utils';
import { SheetOf, asSheet, safeParseJson } from '@votingworks/types';
import { DOMParser } from '@xmldom/xmldom';
import { readFile } from 'fs/promises';
import { dirname, isAbsolute, join } from 'path';
import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import { inspect } from 'util';
import { z } from 'zod';
import { fitTextWithinSize } from '../drawing';
import { PdfReader } from '../pdf_reader';
import {
  PDF_PPI,
  addBubbleAnnotationsToPdfPage,
  addBubbleLabelAnnotation,
  addTimingMarkAnnotationsToPdfPage,
  registerFonts,
} from '../proofing';
import * as accuvote from './accuvote';
import {
  ballotGridPointToPdfPoint,
  imageSizeToPdfSize,
  newBallotGridPoint,
  newImageSize,
  newPdfSize,
} from './coordinates';
import { pairColumnEntries } from './pair_column_entries';
import { parseConstitutionalQuestions } from './parse_constitutional_questions';
import {
  CandidateGridEntry,
  readGridFromElectionDefinition,
} from './read_grid_from_election_definition';
import {
  ConvertIssue,
  PairColumnEntriesResult,
  TemplateBubbleGridEntry,
} from './types';

/**
 * Configuration object for the `correct-definition` command as stored on disk.
 */
export interface Config {
  /**
   * List of ballot cards to correct.
   */
  cards: CardConfig[];
}

/**
 * Configuration object for a single ballot card as stored on disk.
 */
export interface CardConfig {
  /**
   * Path to the definition file for the ballot card.
   */
  definitionPath: string;

  /**
   * Path to the PDF file containing the ballot card.
   */
  pdfPath: string;

  /**
   * Path to write the output files.
   */
  outputDir: string;

  /**
   * Page number for the front side of the ballot card. Uses 1-based indexing.
   * Must be an integer and less than or equal to the total number of pages in
   * the PDF. Defaults to 1.
   */
  frontPage?: number;

  /**
   * Page number for the back side of the ballot card. Uses 1-based indexing.
   * Must be an integer and less than or equal to the total number of pages in
   * the PDF. Defaults to 2.
   */
  backPage?: number;
}

/**
 * Configuration object loaded from {@link Config} with resolved values.
 */
export interface ResolvedConfig {
  /**
   * Original configuration object.
   */
  input: Config;

  /**
   * List of resolved ballot card configurations.
   */
  cards: ResolvedCardConfig[];
}

/**
 * Configuration object loaded from {@link CardConfig} object with resolved
 * values.
 */
export interface ResolvedCardConfig {
  /**
   * Original configuration object.
   */
  input: CardConfig;

  /**
   * Definition object for the ballot card containing contest and candidate
   * information.
   */
  definition: accuvote.AvsInterface;

  /**
   * Front and back images of the ballot card.
   */
  pages: SheetOf<PdfPage>;

  /**
   * Editable PDF pages to write annotations to for proofing.
   */
  proofPages?: SheetOf<PDFPage>;
}

/**
 * Schema for {@link CardConfig}.
 */
export const CardConfigSchema: z.ZodSchema<CardConfig> = z.object({
  definitionPath: z.string().nonempty(),
  pdfPath: z.string().nonempty(),
  outputDir: z.string().nonempty(),
  frontPage: z.number().optional(),
  backPage: z.number().optional(),
});

/**
 * Schema for {@link Config}.
 */
export const ConfigSchema: z.ZodSchema<Config> = z.object({
  cards: z.array(CardConfigSchema),
});

function resolvePath(configFilePath: string, relativePath: string): string {
  return isAbsolute(relativePath)
    ? relativePath
    : join(dirname(configFilePath), relativePath);
}

/**
 * Resolves a configuration object by reading the definition and PDF files and
 * creating a {@link ResolvedConfig} object.
 */
export async function resolveConfig(
  configPath: string,
  config: Config
): Promise<Result<ResolvedConfig, Error>> {
  const pdfReadersByPath = new Map<string, PdfReader>();

  for (const card of config.cards) {
    const pdfPath = resolvePath(configPath, card.pdfPath);
    if (pdfReadersByPath.has(pdfPath)) {
      continue;
    }

    pdfReadersByPath.set(
      pdfPath,
      new PdfReader(await readFile(pdfPath), { scale: 200 / PDF_PPI })
    );
  }

  const results = await Promise.all(
    config.cards.map(
      async (card): Promise<Result<ResolvedCardConfig, Error>> => {
        return asyncResultBlock(async (bail) => {
          const xmlDocument = new DOMParser().parseFromString(
            await readFile(
              resolvePath(configPath, card.definitionPath),
              'utf8'
            ),
            'text/xml'
          );

          if (!xmlDocument.documentElement) {
            return err(
              new Error('Failed to parse definition file: Invalid XML')
            );
          }

          const definition = accuvote
            .parseXml(xmlDocument.documentElement)
            .okOrElse((issues: ConvertIssue[]) =>
              bail(
                new Error(
                  `Failed to parse definition file: ${issues
                    .map((e) => e.message)
                    .join(', ')}`
                )
              )
            );

          const frontPageNumber = card.frontPage ?? 1;
          const backPageNumber = card.backPage ?? 2;
          const pdfReader = assertDefined(
            pdfReadersByPath.get(resolvePath(configPath, card.pdfPath))
          );
          const pages: SheetOf<PdfPage> = [
            assertDefined(await pdfReader.getPage(frontPageNumber)),
            assertDefined(await pdfReader.getPage(backPageNumber)),
          ];
          const originalDocument = await PDFDocument.load(
            pdfReader.getOriginalData()
          );
          const proofDocument = await PDFDocument.create();
          const proofPages = asSheet(
            await proofDocument.copyPages(originalDocument, [
              frontPageNumber - 1,
              backPageNumber - 1,
            ])
          );
          proofDocument.addPage(proofPages[0]);
          proofDocument.addPage(proofPages[1]);

          return ok({
            input: card,
            definition,
            pages,
            proofPages,
          });
        });
      }
    )
  );

  return resultBlock((bail) => ({
    input: config,
    cards: results.map((result) => result.okOrElse(bail)),
  }));
}

/**
 * Reads a configuration file and returns a {@link Config} object.
 */
export async function readConfigFile(
  path: string
): Promise<Result<{ input: Config; resolved: ResolvedConfig }, Error>> {
  return asyncResultBlock(async (bail) => {
    const input = safeParseJson(
      await readFile(path, 'utf8'),
      ConfigSchema
    ).okOrElse(bail);
    const resolved = (await resolveConfig(path, input)).okOrElse(bail);

    return { input, resolved };
  });
}

type CandidateGridEntryWithFalseSide = CandidateGridEntry & {
  side: 'front';
};

/**
 * Matches grid positions from the election definition to bubbles found in the
 * template, assuming all YES/NO entries have already been matched.
 */
function matchContestOptionsOnGrid(
  definitionGridEntries: readonly CandidateGridEntry[],
  bubbles: readonly TemplateBubbleGridEntry[]
): PairColumnEntriesResult<
  CandidateGridEntryWithFalseSide,
  TemplateBubbleGridEntry
> {
  return pairColumnEntries(
    definitionGridEntries.map(
      (entry): CandidateGridEntryWithFalseSide => ({
        ...entry,
        side: 'front',
      })
    ),
    bubbles
  );
}

/**
 * Corrects the coordinates of the candidates in the AvsInterface object based on
 * the PDF file contents.
 */
export async function correctCandidateCoordinates({
  definition,
  pages: [frontPage, backPage],
  proofPages,
}: ResolvedCardConfig): Promise<Result<accuvote.AvsInterface, Error>> {
  const frontProofPage = proofPages?.[0];
  const backProofPage = proofPages?.[1];
  const findTemplateGridAndBubblesResult = findTemplateGridAndBubbles([
    frontPage.page,
    backPage.page,
  ]);

  if (findTemplateGridAndBubblesResult.isErr()) {
    return err(
      new Error(
        `Unable to find template grid and bubbles: ${inspect(
          findTemplateGridAndBubblesResult.err()
        )}`
      )
    );
  }

  const [frontGridAndBubbles, backGridAndBubbles] =
    findTemplateGridAndBubblesResult.ok();

  const bubbleGrid = [
    ...frontGridAndBubbles.bubbles.map<TemplateBubbleGridEntry>((bubble) => ({
      side: 'front',
      column: bubble.x,
      row: bubble.y,
    })),
    ...backGridAndBubbles.bubbles.map<TemplateBubbleGridEntry>((bubble) => ({
      side: 'back',
      column: bubble.x,
      row: bubble.y,
    })),
  ];

  const constitutionalQuestionRows: Array<TemplateBubbleGridEntry[]> = [];

  const parseQuestionsResult = definition.ballotPaperInfo
    ? parseConstitutionalQuestions(definition.ballotPaperInfo.questions)
    : undefined;

  if (parseQuestionsResult?.isErr()) {
    return err(
      new Error(
        `Failed to parse constitutional questions: ${inspect(
          parseQuestionsResult.err()
        )}`
      )
    );
  }

  const questions = parseQuestionsResult?.ok();
  if (questions?.questions.length) {
    const bubblesByRowTopToBottom = iter(
      bubbleGrid.slice().sort((a, b) => {
        if (a.side === b.side) {
          return a.row - b.row;
        }

        return a.side === 'front' ? -1 : 1;
      })
    )
      .groupBy((a, b) => a.side === b.side && a.row === b.row)
      .toArray();

    for (let i = 0; i < questions.questions.length; i += 1) {
      const row = bubblesByRowTopToBottom.pop();
      if (row?.length !== 2) {
        return err(
          new Error(
            `Expected two bubbles per row for each constitutional question, got ${row?.length}: ${inspect(
              row
            )}`
          )
        );
      }
      constitutionalQuestionRows.push(row);
    }
  }

  const bubbleGridWithoutConstitutionalQuestions = bubbleGrid.filter(
    (bubble) =>
      !constitutionalQuestionRows.some((row) =>
        row.some(
          (b) =>
            b.side === bubble.side &&
            b.row === bubble.row &&
            b.column === bubble.column
        )
      )
  );

  const definitionGrid = readGridFromElectionDefinition(definition);
  const pairColumnEntriesResult = matchContestOptionsOnGrid(
    definitionGrid,
    bubbleGridWithoutConstitutionalQuestions
  );

  /* istanbul ignore if - piping an error through */
  if (pairColumnEntriesResult.isErr()) {
    return err(
      new Error(
        `Failed to match grid entries: ${inspect(
          pairColumnEntriesResult.err()
        )}`
      )
    );
  }

  const mergedGrids = pairColumnEntriesResult.ok().pairs;
  const frontImageSize = newImageSize(
    frontPage.page.width,
    frontPage.page.height
  );
  const backImageSize = newImageSize(backPage.page.width, backPage.page.height);
  const frontPdfSize = imageSizeToPdfSize(
    frontGridAndBubbles.grid.geometry.pixelsPerInch,
    PDF_PPI,
    frontImageSize
  );
  const backPdfSize = imageSizeToPdfSize(
    backGridAndBubbles.grid.geometry.pixelsPerInch,
    PDF_PPI,
    backImageSize
  );

  if (frontProofPage && backProofPage) {
    const { bold } = await registerFonts(frontProofPage.doc);
    addTimingMarkAnnotationsToPdfPage(frontProofPage, frontGridAndBubbles.grid);
    addTimingMarkAnnotationsToPdfPage(backProofPage, backGridAndBubbles.grid);
    addBubbleAnnotationsToPdfPage(
      frontProofPage,
      frontGridAndBubbles.grid,
      frontGridAndBubbles.bubbles.map((bubble) =>
        newBallotGridPoint(bubble.x, bubble.y)
      )
    );
    addBubbleAnnotationsToPdfPage(
      backProofPage,
      backGridAndBubbles.grid,
      backGridAndBubbles.bubbles.map((bubble) =>
        newBallotGridPoint(bubble.x, bubble.y)
      )
    );

    for (const [{ candidate, office }, bubble] of mergedGrids) {
      const label = candidate.writeIn
        ? `write-in (${office.name})`
        : candidate.name;
      const textSize = fitTextWithinSize({
        text: label,
        size: newPdfSize(80, Number.POSITIVE_INFINITY),
        config: {
          font: bold,
          minFontSize: 5,
          maxFontSize: 10,
        },
      });
      if (textSize) {
        addBubbleLabelAnnotation({
          page: bubble.side === 'front' ? frontProofPage : backProofPage,
          label: textSize.text,
          bubble: newBallotGridPoint(bubble.column, bubble.row),
          grid:
            bubble.side === 'front'
              ? frontGridAndBubbles.grid
              : backGridAndBubbles.grid,
          color: rgb(1, 1, 1),
          backgroundColor: rgb(0, 0, 0),
          backgroundOpacity: 0.5,
          font: bold,
          fontSize: textSize.fontSize,
        });
      }
    }

    if (questions) {
      for (const [constitutionalQuestionRow, question] of iter(
        constitutionalQuestionRows
      ).zip(questions.questions)) {
        const [yesBubble, noBubble] = constitutionalQuestionRow
          .slice()
          .sort((a, b) => a.column - b.column);
        assert(yesBubble && noBubble, 'Expected two bubbles per row');

        const suffix = `${question.number ? `#${question.number}: ` : ''}${
          question.title
        }`;
        const yesLabel = `Yes (${suffix})`;
        const yesTextSize = fitTextWithinSize({
          text: yesLabel,
          size: newPdfSize(80, Number.POSITIVE_INFINITY),
          config: {
            font: bold,
            minFontSize: 5,
            maxFontSize: 10,
          },
        });
        const noLabel = `No (${suffix})`;
        const noTextSize = fitTextWithinSize({
          text: noLabel,
          size: newPdfSize(80, Number.POSITIVE_INFINITY),
          config: {
            font: bold,
            minFontSize: 5,
            maxFontSize: 10,
          },
        });

        if (yesTextSize) {
          addBubbleLabelAnnotation({
            page: yesBubble.side === 'front' ? frontProofPage : backProofPage,
            label: yesTextSize.text,
            bubble: newBallotGridPoint(yesBubble.column, yesBubble.row),
            grid:
              yesBubble.side === 'front'
                ? frontGridAndBubbles.grid
                : backGridAndBubbles.grid,
            color: rgb(1, 1, 1),
            backgroundColor: rgb(0, 0, 0),
            backgroundOpacity: 0.5,
            font: bold,
            fontSize: yesTextSize.fontSize,
          });
        }

        if (noTextSize) {
          addBubbleLabelAnnotation({
            page: noBubble.side === 'front' ? frontProofPage : backProofPage,
            label: noTextSize.text,
            bubble: newBallotGridPoint(noBubble.column, noBubble.row),
            grid:
              noBubble.side === 'front'
                ? frontGridAndBubbles.grid
                : backGridAndBubbles.grid,
            color: rgb(1, 1, 1),
            backgroundColor: rgb(0, 0, 0),
            backgroundOpacity: 0.5,
            font: bold,
            fontSize: noTextSize.fontSize,
          });
        }
      }
    }
  }

  return ok(
    typedAs<accuvote.AvsInterface>({
      accuvoteHeaderInfo: definition.accuvoteHeaderInfo,
      ballotPaperInfo: definition.ballotPaperInfo,
      candidates: definition.candidates.map((candidate) => ({
        officeName: candidate.officeName,
        candidateNames: candidate.candidateNames.map((candidateName) => {
          const [, bubble] = assertDefined(
            mergedGrids.find(
              // relies on object identity being preserved by the above operations
              // on `definition`
              ([gridEntry]) => gridEntry.candidate === candidateName
            )
          );

          const grid =
            bubble.side === 'front'
              ? frontGridAndBubbles.grid
              : backGridAndBubbles.grid;
          const pdfSize = bubble.side === 'front' ? frontPdfSize : backPdfSize;
          const bubbleCenter = ballotGridPointToPdfPoint(
            pdfSize,
            grid.geometry.pixelsPerInch,
            PDF_PPI,
            grid.completeTimingMarks,
            newBallotGridPoint(bubble.column, bubble.row)
          );

          const ox = bubbleCenter.x;
          const oy =
            // The bottom of a PDF is y=0, but AccuVote treats y=0 as the top,
            // so we need to flip the y-coordinate.
            pdfSize.height -
            bubbleCenter.y +
            // AccuVote doesn't encode which side of the ballot the candidate is
            // on. Instead, it treats the front and back as a continuous grid.
            // So we need to adjust the y-coordinate based on the side of the
            // ballot the bubble is on.
            (bubble.side === 'front' ? 0 : frontPdfSize.height);

          return { ...candidateName, ox, oy };
        }),
      })),
    })
  );
}
