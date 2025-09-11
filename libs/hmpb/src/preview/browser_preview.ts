import './polyfills';
import {
  HmpbBallotPaperSize,
  BallotStyle,
  BallotType,
  getContests,
  safeParseElection,
  Election,
  unsafeParse,
  HmpbBallotPaperSizeSchema,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  throwIllegalValue,
  typedAs,
} from '@votingworks/basics';
import {
  BallotPageTemplate,
  BaseBallotProps,
  gridWidthToPixels,
  measureTimingMarkGrid,
  renderBallotTemplate,
} from '../render_ballot';
import { createBrowserPreviewRenderer } from './browser_preview_renderer';
import { createTestVotes, markBallotDocument } from '../mark_ballot';
import { BUBBLE_CLASS, OptionInfo, PAGE_CLASS } from '../ballot_components';
import {
  BallotTemplateId,
  ballotTemplates,
  NhBallotProps,
} from '../ballot_templates';

/**
 * The ID of the element that marks the document as done for the test.
 */
export const DONE_MARKER_ID = 'done-marker';

function getTemplateAndProps(
  templateParam: string | null,
  baseBallotProps: BaseBallotProps
) {
  if (!templateParam) {
    return {
      template: ballotTemplates.VxDefaultBallot,
      ballotProps: baseBallotProps,
    };
  }

  assert(
    templateParam in ballotTemplates,
    `Unrecognized template ID: ${templateParam}`
  );
  const templateId = templateParam as BallotTemplateId;
  const template = ballotTemplates[templateId];

  switch (templateId) {
    case 'VxDefaultBallot':
      return { template, ballotProps: baseBallotProps };
    case 'NhBallot':
      return {
        template,
        ballotProps: typedAs<NhBallotProps>({
          ...baseBallotProps,
          candidateRotationMethod: 'precinct',
        }),
      };
    default:
      throwIllegalValue(templateId);
  }
}

interface Config {
  election: Election;
  ballotStyle: BallotStyle;
  ballotProps: BaseBallotProps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: BallotPageTemplate<any>;
}

async function loadConfigFromSearchParams(url: URL): Promise<Config> {
  const searchParams = [
    'election-url',
    'paper-size',
    'watermark',
    'lang',
    'template',
  ];
  const unknownParams = Array.from(url.searchParams.keys()).filter(
    (key) => !searchParams.includes(key)
  );
  assert(
    unknownParams.length === 0,
    `Unknown params: ${unknownParams.join(', ')}`
  );
  const electionUrl =
    url.searchParams.get('election-url') ??
    '/hmpb-fixtures/vx-general-election/legal/election.json';
  const paperSize = unsafeParse(
    HmpbBallotPaperSizeSchema,
    url.searchParams.get('paper-size') ?? HmpbBallotPaperSize.Legal
  );
  const watermark = url.searchParams.get('watermark') ?? undefined;
  const languages = url.searchParams.getAll('lang');
  const template = url.searchParams.get('template');
  const response = await fetch(electionUrl);
  const election = safeParseElection(await response.json()).unsafeUnwrap();
  const ballotStyle: BallotStyle = {
    ...election.ballotStyles[0],
    languages: languages.length
      ? languages
      : ['es-US', 'en'].filter((lang) => lang in election.ballotStrings),
  };
  const exampleBaseBallotProps: BaseBallotProps = {
    election: {
      ...election,
      ballotLayout: {
        ...election.ballotLayout,
        paperSize,
      },
      ballotStyles: [ballotStyle],
    },
    ballotStyleId: ballotStyle.id,
    precinctId: ballotStyle.precincts[0],
    ballotType: BallotType.Absentee,
    ballotMode: 'sample',
    watermark,
  };

  return {
    election,
    ballotStyle,
    ...getTemplateAndProps(template, exampleBaseBallotProps),
  };
}

/**
 * This preview script can be edited to preview ballot templates in a browser
 * while they are being developed. It allows you to use the browser's developer
 * tools to inspect the DOM and debug any rendering/layout issues.
 */
export async function main(): Promise<void> {
  const { election, ballotStyle, ballotProps, template } =
    await loadConfigFromSearchParams(new URL(location.href));

  const renderer = createBrowserPreviewRenderer();
  const document = (
    await renderBallotTemplate(renderer, template, ballotProps)
  ).unsafeUnwrap();

  // Mark some votes
  const contests = getContests({ election, ballotStyle });
  const { votes, unmarkedWriteIns } = createTestVotes(contests);
  await markBallotDocument(document, votes, unmarkedWriteIns);

  // Outline write-in areas
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  for (const [i, page] of pages.entries()) {
    const pageNumber = i + 1;
    const grid = await measureTimingMarkGrid(document, pageNumber);
    const bubbles = await document.inspectElements(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BUBBLE_CLASS}`
    );
    const pageElement = assertDefined(
      window.document.querySelector(
        `.${PAGE_CLASS}[data-page-number="${pageNumber}"]`
      )
    );
    const writeInAreaOverlay = window.document.createElement('div');
    writeInAreaOverlay.style.position = 'absolute';
    writeInAreaOverlay.style.left = '0';
    writeInAreaOverlay.style.top = '0';
    writeInAreaOverlay.style.width = '100%';
    writeInAreaOverlay.style.height = '100%';
    pageElement.appendChild(writeInAreaOverlay);
    for (const bubble of bubbles) {
      const optionInfo = JSON.parse(bubble.data.optionInfo) as OptionInfo;
      if (optionInfo.type === 'write-in') {
        const { writeInArea } = optionInfo;
        const writeInAreaElement = window.document.createElement('div');
        writeInAreaElement.style.position = 'absolute';
        writeInAreaElement.style.left = `${
          bubble.x +
          bubble.width / 2 -
          page.x -
          gridWidthToPixels(grid, writeInArea.left)
        }px`;
        writeInAreaElement.style.top = `${
          bubble.y +
          bubble.height / 2 -
          page.y -
          gridWidthToPixels(grid, writeInArea.top)
        }px`;
        writeInAreaElement.style.width = `${gridWidthToPixels(
          grid,
          Math.abs(writeInArea.left + writeInArea.right)
        )}px`;
        writeInAreaElement.style.height = `${gridWidthToPixels(
          grid,
          writeInArea.top + writeInArea.bottom
        )}px`;
        writeInAreaElement.style.border = '1px solid red';
        writeInAreaOverlay.appendChild(writeInAreaElement);
      }
    }
  }

  const doneMarkerElement = window.document.createElement('div');
  doneMarkerElement.style.display = 'none';
  doneMarkerElement.id = DONE_MARKER_ID;
  window.document.body.appendChild(doneMarkerElement);
}
