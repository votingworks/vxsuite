import {
  ballotTemplates,
  createPlaywrightRendererPool,
  layOutBallotsAndCreateElectionDefinition,
  markBallotDocument,
  renderBallotPdfWithMetadataQrCode,
} from '@votingworks/hmpb';
import {
  BaseBallotProps,
  BallotMode,
  BallotType,
  CandidateContest,
  ElectionDefinition,
  VotesDict,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import {
  ImageData,
  pdfToImages,
  writeImageData,
} from '@votingworks/image-utils';
import { assertDefined } from '@votingworks/basics';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Specifies how to render a single marked ballot. */
export interface MarkedBallotSpec {
  electionDefinition: ElectionDefinition;
  ballotStyleId: string;
  precinctId: string;
  votes: VotesDict;
  ballotMode?: BallotMode;
}

/**
 * Returns a {@link VotesDict} with every contest on the ballot fully voted:
 * the first `seats` candidates for candidate contests, and `yes` for yes/no
 * contests. Use this as a base to derive other vote sets (undervote, overvote)
 * by spreading and overriding individual contest entries.
 */
export function createFullyVotedBallot(
  electionDefinition: ElectionDefinition,
  ballotStyleId: string
): VotesDict {
  const { election } = electionDefinition;
  const ballotStyle = getBallotStyle({ election, ballotStyleId });
  /* istanbul ignore next */
  if (!ballotStyle) throw new Error(`Ballot style ${ballotStyleId} not found`);
  const contests = getContests({ election, ballotStyle });

  return Object.fromEntries(
    contests.map((contest) => {
      if (contest.type === 'candidate') {
        return [contest.id, contest.candidates.slice(0, contest.seats)];
      }
      return [contest.id, [contest.yesOption.id]];
    })
  );
}

/**
 * Returns a copy of `votes` with the given candidate contest undervoted:
 * a single-seat contest is blanked; a multi-seat contest keeps only half its
 * picks (rounded down).
 */
export function withUndervote(
  votes: VotesDict,
  contest: CandidateContest
): VotesDict {
  const newCount = contest.seats === 1 ? 0 : Math.floor(contest.seats / 2);
  return {
    ...votes,
    [contest.id]: (votes[contest.id] as CandidateContest['candidates']).slice(
      0,
      newCount
    ),
  };
}

/**
 * Returns a copy of `votes` with the given single-seat candidate contest
 * overvoted by adding the next available candidate.
 */
export function withOvervote(
  votes: VotesDict,
  contest: CandidateContest
): VotesDict {
  const current = votes[contest.id] as CandidateContest['candidates'];
  const currentIds = new Set(current.map((c) => c.id));
  const extra = contest.candidates.find((c) => !currentIds.has(c.id));
  /* istanbul ignore next */
  if (!extra) throw new Error(`No extra candidate to overvote in ${contest.id}`);
  return { ...votes, [contest.id]: [...current, extra] };
}

/**
 * Renders one or more marked HMPB ballot PDFs to temp files and returns their
 * paths. Reuses a single Chromium instance across all renders so the startup
 * cost is paid once regardless of how many ballots are requested.
 *
 * All specs must share the same electionDefinition, ballotStyleId, and
 * ballotMode since the layout pass is shared.
 */
export async function renderMarkedBallots(
  specs: MarkedBallotSpec[]
): Promise<string[]> {
  const rendererPool = await createPlaywrightRendererPool(1);
  try {
    // All specs must share the same election/style/precinct/mode for layout.
    const [first] = specs;
    if (!first) return [];

    // All specs share the same election/style/precinct/mode so we only need
    // one layout pass regardless of how many vote variants are requested.
    const sharedBallotProps: BaseBallotProps = {
      election: first.electionDefinition.election,
      ballotStyleId: first.ballotStyleId,
      precinctId: first.precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: first.ballotMode ?? 'official',
    };

    const { ballotContents } = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      [sharedBallotProps],
      'vxf'
    );
    const sharedBallotContent = assertDefined(ballotContents[0]);

    // Mark and render each ballot variant in a single runTasks batch.
    const pdfBytesList = await rendererPool.runTasks(
      specs.map((spec) => async (renderer) => {
        const doc = await renderer.loadDocumentFromContent(sharedBallotContent);
        await markBallotDocument(doc, spec.votes);
        return renderBallotPdfWithMetadataQrCode(
          sharedBallotProps,
          doc,
          spec.electionDefinition
        );
      })
    );

    const tempDir = mkdtempSync(join(tmpdir(), 'marked-ballots-'));
    return pdfBytesList.map((pdfBytes, i) => {
      const outPath = join(tempDir, `${i}.pdf`);
      writeFileSync(outPath, pdfBytes);
      return outPath;
    });
  } finally {
    await rendererPool.close();
  }
}

/**
 * Renders a single marked HMPB ballot PDF to a temp file and returns the path.
 * For multiple ballots in the same test, prefer {@link renderMarkedBallots} to
 * share the Chromium renderer and pay startup cost only once.
 */
export async function renderMarkedBallot(
  spec: MarkedBallotSpec
): Promise<string> {
  const [path] = await renderMarkedBallots([spec]);
  return assertDefined(path);
}

/**
 * Rasterizes the first page of a ballot PDF and whites out the timing-mark
 * border so the sheet still looks like a ballot but can't be interpreted,
 * producing an `InvalidSheet` with reason `unreadable` — the "Unreadable" eject
 * state. Returns the path to the corrupted PNG.
 */
export async function renderUnreadableBallotSheet(
  ballotPdfPath: string
): Promise<string> {
  const pdfBytes = new Uint8Array(readFileSync(ballotPdfPath));
  // Rasterize at roughly the scanner's 200 DPI; only the first page is needed.
  const pages = pdfToImages(pdfBytes, { scale: 200 / 72 })[
    Symbol.asyncIterator
  ]();
  const firstPage = await pages.next();
  await pages.return?.(undefined);
  const image: ImageData = assertDefined(firstPage.value).page;
  const { width, height, data } = image;

  // The timing marks run along all four edges; painting the outer border white
  // removes them (so interpretation fails) while leaving the ballot content.
  const marginX = Math.round(width * 0.06);
  const marginY = Math.round(height * 0.06);
  for (let y = 0; y < height; y += 1) {
    const inVerticalBorder = y < marginY || y >= height - marginY;
    for (let x = 0; x < width; x += 1) {
      if (inVerticalBorder || x < marginX || x >= width - marginX) {
        const i = (y * width + x) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'unreadable-ballot-'));
  const outPath = join(tempDir, 'unreadable.png');
  await writeImageData(outPath, image);
  return outPath;
}
