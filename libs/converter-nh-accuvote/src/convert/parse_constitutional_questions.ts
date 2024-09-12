import { err, ok, Result } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import makeDebug from 'debug';
import { parseHtml } from './dom_parser';

const debug = makeDebug(
  'converter-nh-accuvote:convert:parseConstitutionalQuestions'
);

/**
 * Lists the types of errors for {@link parseConstitutionalQuestions}.
 */
export enum ParseConstitutionalQuestionErrorKind {
  MissingQuestionText = 'MissingQuestionText',
  MissingYesNo = 'MissingYesNo',
}

/**
 * Error information for {@link parseConstitutionalQuestions}.
 */
export type ParseConstitutionalQuestionError =
  | {
      readonly kind: ParseConstitutionalQuestionErrorKind.MissingQuestionText;
      readonly questions: readonly ConstitutionalQuestion[];
      readonly message: string;
    }
  | {
      readonly kind: ParseConstitutionalQuestionErrorKind.MissingYesNo;
      readonly questions: readonly ConstitutionalQuestion[];
      readonly partialQuestion: string;
      readonly message: string;
    };

function* enumerateTextNodes(node: Node): Generator<Node> {
  if (node.nodeType === 3 /* Node.TEXT_NODE */) {
    yield node;
  }
  for (const child of Array.from(node.childNodes)) {
    yield* enumerateTextNodes(child);
  }
}

interface ParseState {
  readonly title?: string;
  readonly questions: readonly ConstitutionalQuestion[];
  readonly nextQuestionNumber?: number;
  readonly nextQuestionHeader?: string;
  readonly nextQuestionText?: string;
  readonly nextQuestionHasYes?: boolean;
  readonly nextQuestionHasNo?: boolean;
}

/**
 * Information about a constitutional question.
 */
export interface ConstitutionalQuestion {
  readonly number?: number;
  readonly header?: string;
  readonly title: string;
}

/**
 * Successful result of {@link parseConstitutionalQuestions}.
 */
export interface ParsedConstitutionalQuestions {
  title?: string;
  questions: ConstitutionalQuestion[];
}

/**
 * Results of parsing the constitutional questions.
 */
export type ParseConstitutionalQuestionsResult = Result<
  ParsedConstitutionalQuestions,
  ParseConstitutionalQuestionError
>;

function joinParagraphs(...paragraphs: Array<undefined | string>): string {
  return paragraphs.filter((p) => p?.trim()).join('\n\n');
}

/**
 * Parse constitutional question gibberish. Here's an example:
 *
 * ```html
 * <![CDATA[<div>CONSTITUTIONAL AMENDMENT QUESTION </div><div>Constitutional Amendment Proposed by the General Court</div><div>Question Proposed pursuant to Part II, Article 100 of the New Hampshire Constitution.</div><div> </div><div>"Shall there be a convention to amend or revise the constitution?     YES  <FONT face=Arial> <IMG src="http://ertuat.sos.nh.gov/ballotpaper/assets/images/oval.png""></FONT>                                  NO  <FONT face=Arial> <IMG src="http://ertuat.sos.nh.gov/ballotpaper/assets/images/oval.png""></FONT></div>
 * ```
 *
 * This is not structured data, and isn't even valid HTML. We assume that each
 * question will be followed by "YES" and "NO".
 */
export function parseConstitutionalQuestions(
  html: string
): ParseConstitutionalQuestionsResult {
  const htmlWithoutCdata = html
    // remove any CDATA structures
    .replace(/^\s*<!\[CDATA\[/i, '')
    .replace(/\]\]>\s*$/i, '');
  debug('htmlWithoutCdata=%s', htmlWithoutCdata);

  let parseState: ParseState = {
    questions: [],
  };

  for (const element of enumerateTextNodes(parseHtml(htmlWithoutCdata))) {
    const text = element.textContent?.trim();

    const noMatch = text?.match(/\bNO\s*$/i);
    const textAfterNoMatch = text?.slice(0, noMatch?.index).trim();
    const hasNo = noMatch && noMatch.length > 0;

    const yesMatch = textAfterNoMatch?.match(/\bYES\s*$/i);
    const textAfterYesMatch = textAfterNoMatch
      ?.slice(0, yesMatch?.index)
      .trim();
    const hasYes = yesMatch && yesMatch.length > 0;

    const questionMatch = textAfterYesMatch?.match(/^(\d+\.\s+)?"?(.+?)"?$/);
    const number = questionMatch?.[1];
    let question = questionMatch?.[2];

    debug('element parse result=%O', {
      text,
      yesMatch,
      textAfterYesMatch,
      hasYes,
      noMatch,
      textAfterNoMatch,
      hasNo,
      question,
      number,
    });

    if (
      !number &&
      question &&
      question.length > 0 &&
      question.toUpperCase() === question
    ) {
      debug('found all-caps title text: %s', question);
      parseState = {
        ...parseState,
        title: joinParagraphs(parseState.title, question),
      };
      question = undefined;
    }

    if (
      question?.match(
        /^Constitutional Amendment Proposed by|^Question Proposed/
      )
    ) {
      debug('found automatic header text: %s', question);
      parseState = {
        ...parseState,
        nextQuestionHeader: joinParagraphs(
          parseState.nextQuestionHeader,
          question
        ),
      };
      question = undefined;
    }

    if (question) {
      if (parseState.nextQuestionHasYes || parseState.nextQuestionHasNo) {
        debug(
          'invalid state, missing "YES" or "NO" after question: %s',
          question
        );
        return err({
          kind: ParseConstitutionalQuestionErrorKind.MissingYesNo,
          questions: parseState.questions,
          partialQuestion: question,
          message: `Missing "YES" or "NO" after question: ${question}`,
        });
      }

      if (parseState.nextQuestionNumber) {
        const additionalQuestionText = number
          ? `${number}. ${question}`
          : question;
        parseState = {
          ...parseState,
          nextQuestionText: joinParagraphs(
            parseState.nextQuestionText,
            additionalQuestionText
          ),
        };
      } else if (number) {
        const questionNumber = safeParseInt(number, { min: 1 }).ok();
        parseState = {
          ...parseState,
          nextQuestionNumber: questionNumber,
          nextQuestionHeader: joinParagraphs(
            parseState.nextQuestionHeader,
            parseState.nextQuestionText
          ),
          nextQuestionText: question,
        };
      } else {
        parseState = {
          ...parseState,
          nextQuestionText: joinParagraphs(
            parseState.nextQuestionText,
            question
          ),
        };
      }
    }

    if (hasYes) {
      parseState = {
        ...parseState,
        nextQuestionHasYes: true,
      };
    }

    if (hasNo) {
      parseState = {
        ...parseState,
        nextQuestionHasNo: true,
      };
    }

    if (parseState.nextQuestionHasYes && parseState.nextQuestionHasNo) {
      if (parseState.nextQuestionText) {
        debug('found complete question: %s', parseState.nextQuestionText);
        parseState = {
          title: parseState.title,
          questions: [
            ...parseState.questions,
            {
              number: parseState.nextQuestionNumber,
              header: parseState.nextQuestionHeader,
              title: parseState.nextQuestionText,
            },
          ],
        };
      } else {
        break;
      }
    }

    debug('parseState=%O', parseState);
  }

  if (parseState.nextQuestionText) {
    return err({
      kind: ParseConstitutionalQuestionErrorKind.MissingYesNo,
      questions: parseState.questions,
      partialQuestion: parseState.nextQuestionText,
      message: `Missing "YES" or "NO" after question: ${parseState.nextQuestionText}`,
    });
  }

  if (parseState.nextQuestionHasYes || parseState.nextQuestionHasNo) {
    return err({
      kind: ParseConstitutionalQuestionErrorKind.MissingQuestionText,
      questions: parseState.questions,
      message: `Found "YES" or "NO" but no question text`,
    });
  }

  return ok({
    title: parseState.title,
    questions: parseState.questions.slice(),
  });
}
