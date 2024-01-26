import { Buffer } from 'buffer';
import {
  PdfOptions,
  PixelDimensions,
  createRenderer,
  RenderDocument,
} from './renderer';

export const contentSlot = <div id="content-slot" style={{ height: '100%' }} />;

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
    const [contentSlotDimensions] = await document.measureElements(
      `#${contentSlot.props.id}`
    );
    const currentPageProps: P =
      pagedContentResults[pagedContentResults.length - 1]?.nextPageProps ??
      props;
    const pagedContentResult = await contentComponent(
      {
        // eslint-disable-next-line vx/gts-spread-like-types
        ...currentPageProps,
        dimensions: contentSlotDimensions,
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

async function extractLayoutInfo(document: RenderDocument) {
  // We need to get the contest bubble positions by page and then convert those
  // into grid positions by figuring out where the timing marks are
  const positions = await document.measureElements('.contest');
  const titles = await document.getAttributeFromElements(
    '.contest',
    'data-title'
  );
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
  // const electionHash = await electionHashFromLayoutInfo(layoutInfo);
  // const pagesWithQrCodes = await addQrCodes(pages, electionHash);
  const pdf = await document.renderToPdf(options);
  const t2 = Date.now();
  console.log(`Rendered document in ${t2 - t1}ms`);
  await document.dispose();
  await renderer.cleanup();
  return pdf;
}
