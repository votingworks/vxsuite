import { TemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import {
  IteratorPlus,
  Optional,
  assert,
  assertDefined,
  iter,
} from '@votingworks/basics';
import { SheetOf, Side, mapSheet } from '@votingworks/types';
import { PDF_PPI } from '../proofing';
import * as accuvote from './accuvote';
import {
  BallotGridPoint,
  ballotGridPointToPdfPoint,
  imageSizeToPdfSize,
  newImageSize,
} from './coordinates';
import {
  AnyMatched,
  MatchedCandidate,
  MatchedHackyParsedConstitutionalQuestion,
  MatchedYesNoQuestionOption,
} from './types';

/**
 * Options for correcting the definition.
 */
export interface CorrectDefinitionOptions {
  definition: accuvote.AvsInterface;
  gridsAndBubbles: TemplateGridAndBubbles;
  matched: SheetOf<AnyMatched[]>;
}

/**
 * Corrected definition and metadata for a ballot card.
 */
export interface CorrectedDefinitionAndMetadata {
  definition: accuvote.AvsInterface;
  gridsAndBubbles: TemplateGridAndBubbles;
  matched: SheetOf<
    Array<Exclude<AnyMatched, MatchedHackyParsedConstitutionalQuestion>>
  >;
}

/**
 * Corrects issues the AccuVote definition:
 * - updates coordinates of the contest options based on matched bubbles
 * - converts hacky HTML constitutional questions to yes/no contests
 *
 * @param definition - AccuVote definition to correct.
 * @param gridsAndBubbles - Detected grids and bubbles from the ballot card.
 * @param matched - Matched bubbles to contest options, regardless of what
 * heuristic was used to match them. There must be a 1:1 correspondence between
 * the bubbles and the contest options.
 */
export function correctAccuVoteDefinition({
  definition,
  gridsAndBubbles,
  matched,
}: CorrectDefinitionOptions): CorrectedDefinitionAndMetadata {
  const [frontGridAndBubbles, backGridAndBubbles] = gridsAndBubbles;
  const frontImageSize = newImageSize(
    frontGridAndBubbles.grid.geometry.canvasSize.width,
    frontGridAndBubbles.grid.geometry.canvasSize.height
  );
  const backImageSize = newImageSize(
    backGridAndBubbles.grid.geometry.canvasSize.width,
    backGridAndBubbles.grid.geometry.canvasSize.height
  );
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

  function determineBubbleCoordinates(side: Side, bubble: BallotGridPoint) {
    const grid =
      side === 'front' ? frontGridAndBubbles.grid : backGridAndBubbles.grid;
    const pdfSize = side === 'front' ? frontPdfSize : backPdfSize;
    const pdfPoint = ballotGridPointToPdfPoint(
      pdfSize,
      grid.geometry.pixelsPerInch,
      PDF_PPI,
      grid.completeTimingMarks,
      bubble
    );

    return {
      ox: pdfPoint.x,
      oy:
        // The bottom of a PDF is y=0, but AccuVote treats y=0 as the top,
        // so we need to flip the y-coordinate.
        pdfSize.height -
        pdfPoint.y +
        // AccuVote doesn't encode which side of the ballot the candidate is
        // on. Instead, it treats the front and back as a continuous grid.
        // So we need to adjust the y-coordinate based on the side of the
        // ballot the bubble is on.
        (side === 'front' ? 0 : frontPdfSize.height),
    };
  }

  function forEachMatchedEntryOfType(
    type: MatchedCandidate['type']
  ): IteratorPlus<readonly [MatchedCandidate, Side]>;
  function forEachMatchedEntryOfType(
    type: MatchedYesNoQuestionOption['type']
  ): IteratorPlus<readonly [MatchedYesNoQuestionOption, Side]>;
  function forEachMatchedEntryOfType(
    type: MatchedHackyParsedConstitutionalQuestion['type']
  ): IteratorPlus<readonly [MatchedHackyParsedConstitutionalQuestion, Side]>;
  function forEachMatchedEntryOfType(
    type: AnyMatched['type']
  ): IteratorPlus<readonly [AnyMatched, Side]> {
    return iter(matched)
      .zip(['front', 'back'] as const)
      .flatMap(([entry, side]) => entry.map((e) => [e, side] as const))
      .filter(([entry]) => entry.type === type);
  }

  function correctCandidateNameEntry(
    candidateName: accuvote.CandidateName
  ): Optional<{
    side: Side;
    correctedCandidateName: accuvote.CandidateName;
    correctedMatch: MatchedCandidate;
  }> {
    const matchAndSide = forEachMatchedEntryOfType('candidate').find(
      ([entry]) => entry.candidate === candidateName
    ) as Optional<[MatchedCandidate, Side]>;

    if (!matchAndSide) {
      return;
    }

    const [match, side] = matchAndSide;
    const correctedCandidateName: accuvote.CandidateName = {
      ...candidateName,
      ...determineBubbleCoordinates(side, match.bubble),
    };

    return {
      side,
      correctedCandidateName,
      correctedMatch: {
        type: 'candidate',
        office: match.office,
        candidate: correctedCandidateName,
        bubble: match.bubble,
      },
    };
  }

  function correctAccuvoteCandidates() {
    const correctedCandidates: accuvote.Candidates[] = [];
    const correctedCandidateMatches: SheetOf<MatchedCandidate[]> = [[], []];

    for (const candidates of definition.candidates) {
      const correctedCandidateNames: accuvote.CandidateName[] = [];

      for (const candidateName of candidates.candidateNames) {
        const correction = correctCandidateNameEntry(candidateName);
        if (!correction) {
          correctedCandidateNames.push(candidateName);
          continue;
        }

        const { side, correctedCandidateName, correctedMatch } = correction;
        correctedCandidateNames.push(correctedCandidateName);
        correctedCandidateMatches[side === 'front' ? 0 : 1].push(
          correctedMatch
        );
      }

      correctedCandidates.push({
        officeName: candidates.officeName,
        // From the XML we've seen, write-ins are sometimes listed in reverse of the
        // order they appear on the ballot. In order to make sure the write-in
        // options we create have grid layout coordinates in ballot order, we sort
        // the write-ins here.
        candidateNames: [...correctedCandidateNames].sort((a, b) =>
          a.writeIn && b.writeIn ? a.oy - b.oy : 0
        ),
      });
    }

    return { correctedCandidates, correctedCandidateMatches };
  }

  function correctYesNoQuestionEntry(question: accuvote.YesNoQuestion): {
    side: Side;
    correctedYesNoQuestion: accuvote.YesNoQuestion;
    correctedMatches: [
      yes: MatchedYesNoQuestionOption,
      no: MatchedYesNoQuestionOption,
    ];
  } {
    const matchesAndSides = forEachMatchedEntryOfType('yesno')
      .filter(([entry]) => entry.question === question)
      .toArray();
    assert(
      matchesAndSides.length === 2,
      'Expected two matches for each yes/no question'
    );
    const [yesMatch, yesSide] = assertDefined(matchesAndSides[0]);
    const [noMatch, noSide] = assertDefined(matchesAndSides[1]);
    assert(
      yesSide === noSide,
      'Expected yes and no matches to be on the same side'
    );

    const yesCoordinates = determineBubbleCoordinates(yesSide, yesMatch.bubble);
    const noCoordinates = determineBubbleCoordinates(noSide, noMatch.bubble);

    const correctedYesNoQuestion: accuvote.YesNoQuestion = {
      title: question.title,
      header: question.header,
      number: question.number,
      yesOx: yesCoordinates.ox,
      yesOy: yesCoordinates.oy,
      noOx: noCoordinates.ox,
      noOy: noCoordinates.oy,
    };

    return {
      side: yesSide,
      correctedYesNoQuestion,
      correctedMatches: [
        {
          type: 'yesno',
          question: correctedYesNoQuestion,
          option: 'yes',
          bubble: yesMatch.bubble,
        },
        {
          type: 'yesno',
          question: correctedYesNoQuestion,
          option: 'no',
          bubble: noMatch.bubble,
        },
      ],
    };
  }

  function correctAccuvoteYesNoQuestions() {
    const correctedYesNoQuestions: accuvote.YesNoQuestion[] = [];
    const correctedYesNoMatches: SheetOf<MatchedYesNoQuestionOption[]> = [
      [],
      [],
    ];

    for (const yesNoQuestion of definition.yesNoQuestions) {
      const { side, correctedYesNoQuestion, correctedMatches } =
        correctYesNoQuestionEntry(yesNoQuestion);
      correctedYesNoQuestions.push(correctedYesNoQuestion);
      correctedYesNoMatches[side === 'front' ? 0 : 1].push(...correctedMatches);
    }

    return { correctedYesNoQuestions, correctedYesNoMatches };
  }

  function convertHackyQuestionsToYesNoQuestions() {
    const yesNoQuestions: accuvote.YesNoQuestion[] = [];
    const yesNoMatches: SheetOf<MatchedYesNoQuestionOption[]> = [[], []];

    for (const [entry, side] of forEachMatchedEntryOfType('hacky-question')) {
      const matches = yesNoMatches[side === 'front' ? 0 : 1];
      const yesCoordinates = determineBubbleCoordinates(side, entry.yesBubble);
      const noCoordinates = determineBubbleCoordinates(side, entry.noBubble);

      const { question } = entry;
      const newYesNoQuestion: accuvote.YesNoQuestion = {
        title: question.title,
        header: question.header,
        number: question.number,
        yesOx: yesCoordinates.ox,
        yesOy: yesCoordinates.oy,
        noOx: noCoordinates.ox,
        noOy: noCoordinates.oy,
      };

      yesNoQuestions.push(newYesNoQuestion);
      matches.push({
        type: 'yesno',
        question: newYesNoQuestion,
        option: 'yes',
        bubble: entry.yesBubble,
      });
      matches.push({
        type: 'yesno',
        question: newYesNoQuestion,
        option: 'no',
        bubble: entry.noBubble,
      });
    }

    return { yesNoQuestions, yesNoMatches };
  }

  const { correctedCandidates, correctedCandidateMatches } =
    correctAccuvoteCandidates();
  const { correctedYesNoQuestions, correctedYesNoMatches } =
    correctAccuvoteYesNoQuestions();
  const convertedHackyQuestions = convertHackyQuestionsToYesNoQuestions();

  return {
    // update the definition with corrected coordinates and replace hacky
    // questions with new yes/no questions
    definition: {
      accuvoteHeaderInfo: definition.accuvoteHeaderInfo,
      candidates: correctedCandidates,
      yesNoQuestions: [
        // corrected existing yes/no questions
        ...correctedYesNoQuestions,

        // add new yes/no questions for hacky questions from the
        // `BallotPaperInfo` → `Questions` element
        ...convertedHackyQuestions.yesNoQuestions,
      ],
    },

    // pass through the grids and bubbles as they are
    gridsAndBubbles,

    // replace matches for the hacky HTML questions with the new yes/no questions
    matched: mapSheet([0, 1] as const, (sideIndex) => [
      ...correctedCandidateMatches[sideIndex],
      ...correctedYesNoMatches[sideIndex],
      ...convertedHackyQuestions.yesNoMatches[sideIndex],
    ]),
  };
}
