import { Buffer } from 'buffer';
import { assertDefined } from '@votingworks/basics';
import {
  PdfOptions,
  PixelDimensions,
  createRenderer,
  RenderDocument,
} from './renderer';

export const contentSlot = (
  <div id="content-slot" style={{ height: '100%', width: '100%' }} />
);

export type FrameComponent<P> = (
  props: P & { children: JSX.Element; pageNumber: number; totalPages: number }
) => JSX.Element;

export interface PagedElementResult<P> {
  currentPageElement: JSX.Element;
  nextPageProps?: P;
}

export type ContentComponent<P> = (
  props: P & { dimensions: PixelDimensions },
  document: RenderDocument
) => Promise<PagedElementResult<P>>;

export interface BallotPageTemplate<P> {
  frameComponent: FrameComponent<P>;
  contentComponent: ContentComponent<P>;
}

async function paginateBallotContent<P extends Record<string, unknown>>(
  pageTemplate: BallotPageTemplate<P>,
  props: P,
  document: RenderDocument
): Promise<JSX.Element[]> {
  const pagedContentResults: Array<PagedElementResult<P>> = [];

  const { frameComponent, contentComponent } = pageTemplate;
  do {
    const pageFrame = frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: pagedContentResults.length + 1,
      totalPages: 0,
      children: contentSlot,
    });
    await document.setBodyContent(pageFrame);
    const [contentSlotElement] = await document.inspectElements(
      `#${contentSlot.props.id}`
    );
    const currentPageProps: P =
      pagedContentResults[pagedContentResults.length - 1]?.nextPageProps ??
      props;
    const pagedContentResult = await contentComponent(
      {
        // eslint-disable-next-line vx/gts-spread-like-types
        ...currentPageProps,
        dimensions: {
          width: contentSlotElement.width,
          height: contentSlotElement.height,
        },
      },
      document
    );
    pagedContentResults.push(pagedContentResult);
  } while (pagedContentResults[pagedContentResults.length - 1].nextPageProps);

  return pagedContentResults.map((pagedContentResult, i) =>
    frameComponent({
      // eslint-disable-next-line vx/gts-spread-like-types
      ...props,
      pageNumber: i + 1,
      totalPages: pagedContentResults.length,
      children: pagedContentResult.currentPageElement,
    })
  );
}

interface ContestOptionLayout {
  contest: string;
  candidate: string;
  column: number;
  row: number;
}

async function extractLayoutInfo(
  document: RenderDocument
): Promise<ContestOptionLayout[]> {
  const pages = await document.inspectElements('[data-page]');
  const optionLayoutsPerPage = await Promise.all(
    pages.map(async (_, i) => {
      const pageNumber = i + 1;
      const timingMarkElements = await document.inspectElements(
        `[data-page="${pageNumber}"] [data-type="TimingMark"]`
      );

      const minX = Math.min(...timingMarkElements.map((mark) => mark.x));
      const minY = Math.min(...timingMarkElements.map((mark) => mark.y));
      const maxX = Math.max(...timingMarkElements.map((mark) => mark.x));
      const maxY = Math.max(...timingMarkElements.map((mark) => mark.y));
      const gridWidth = maxX - minX;
      const gridHeight = maxY - minY;
      const originX = minX + timingMarkElements[0].width / 2;
      const originY = minY + timingMarkElements[0].height / 2;
      // There are two overlayed timing marks in each corner, don't double count them
      const numRows =
        timingMarkElements.filter((mark) => mark.x === minX).length - 2;
      const numColumns =
        timingMarkElements.filter((mark) => mark.y === minY).length - 2;
      const columnWidth = gridWidth / numColumns;
      const rowHeight = gridHeight / numRows;

      function pixelPointToGridPoint(
        x: number,
        y: number
      ): { column: number; row: number } {
        return {
          column: (x - originX) / columnWidth,
          row: (y - originY) / rowHeight,
        };
      }

      const bubbles = await document.inspectElements(
        `[data-page="${pageNumber}"] [data-type="Bubble"]`
      );
      const optionLayouts = bubbles.map((bubble) => ({
        contest: assertDefined(bubble.data.contest),
        candidate: assertDefined(bubble.data.candidate),
        ...pixelPointToGridPoint(bubble.x, bubble.y),
      }));
      return optionLayouts;
    })
  );

  return optionLayoutsPerPage.flat();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function electionHashFromLayoutInfo(layoutInfo: ContestOptionLayout[]): string {
  return 'fake-election-hash'; // Not important for this proof of concept
}

export async function renderBallotToPdf<P extends Record<string, unknown>>(
  template: BallotPageTemplate<P>,
  props: P,
  options: PdfOptions
): Promise<Buffer> {
  const renderer = await createRenderer();
  const document = await renderer.createDocument();
  const t1 = Date.now();
  const pages = await paginateBallotContent(template, props, document);
  await document.setBodyContent(<>{pages}</>);
  const layoutInfo = await extractLayoutInfo(document);
  console.log(layoutInfo);
  const electionHash = await electionHashFromLayoutInfo(layoutInfo);
  // const pagesWithQrCodes = await addQrCodes(pages, electionHash);
  const pdf = await document.renderToPdf(options);
  const t2 = Date.now();
  // eslint-disable-next-line no-console
  console.log(`Rendered document in ${t2 - t1}ms`);
  await document.dispose();
  await renderer.cleanup();
  return pdf;
}
