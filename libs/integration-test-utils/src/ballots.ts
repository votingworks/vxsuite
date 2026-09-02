import * as tmp from 'tmp';

import {
  ballotTemplates,
  createPlaywrightRendererPool,
  layOutBallotsAndCreateElectionDefinition,
  markBallotDocument,
  type MarginalMark,
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
  LATEST_SOFTWARE_VERSION,
  straightPartyNotYetImplemented,
} from '@votingworks/types';
import {
  ImageData,
  createImageData,
  pdfToImages,
  writeImageData,
} from '@votingworks/image-utils';
import { assertDefined } from '@votingworks/basics';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

tmp.setGracefulCleanup();

/** Specifies how to render a single marked ballot. */
export interface MarkedBallotSpec {
  electionDefinition: ElectionDefinition;
  ballotStyleId: string;
  precinctId: string;
  votes: VotesDict;
  ballotMode?: BallotMode;
  /** Precinct (default) or absentee — determines the CVR's voting method. */
  ballotType?: BallotType;
  /** Partial marks on unvoted options, to simulate marginal marks. */
  marginalMarks?: MarginalMark[];
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
  if (!ballotStyle) throw new Error(`Ballot style ${ballotStyleId} not found`);
  const contests = getContests({ election, ballotStyle });

  return Object.fromEntries(
    contests.map((contest) => {
      if (contest.type === 'straight-party') {
        straightPartyNotYetImplemented();
      }
      if (contest.type === 'candidate') {
        return [contest.id, contest.candidates.slice(0, contest.seats)];
      }
      return [contest.id, [contest.options[0].id]];
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
  if (!extra) throw new Error(`No extra candidate to overvote in ${contest.id}`);
  return { ...votes, [contest.id]: [...current, extra] };
}

/**
 * Returns a copy of `votes` with the given candidate contest's trailing pick(s)
 * replaced by write-in candidate(s) — one per name, at successive
 * `writeInIndex`es starting from 0. The contest must `allowWriteIns` and have at
 * least `names.length` seats.
 */
export function withWriteIns(
  votes: VotesDict,
  contest: CandidateContest,
  names: string[]
): VotesDict {
  const current = (votes[contest.id] ?? []) as CandidateContest['candidates'];
  // Keep enough existing picks that the total stays within `seats`.
  const kept = current.slice(0, contest.seats - names.length);
  return {
    ...votes,
    [contest.id]: [
      ...kept,
      ...names.map((name, writeInIndex) => ({
        id: `write-in-${writeInIndex}`,
        name,
        isWriteIn: true,
        writeInIndex,
      })),
    ],
  };
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
      ballotType: first.ballotType ?? BallotType.Precinct,
      ballotMode: first.ballotMode ?? 'official',
    };

    const { layoutPaths } = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      [sharedBallotProps],
      { format: 'vxf', version: LATEST_SOFTWARE_VERSION },
      { path: tmp.dirSync({ unsafeCleanup: true }).name }
    );
    const layoutPath = assertDefined(layoutPaths[0]);
    const sharedBallotContent = readFileSync(layoutPath, 'utf8');

    // Mark and render each ballot variant in a single runTasks batch.
    const pdfBytesList = await rendererPool.runTasks(
      specs.map((spec) => async (renderer) => {
        const doc = await renderer.documentFromContent(sharedBallotContent);
        await markBallotDocument(
          doc,
          spec.votes,
          undefined,
          spec.marginalMarks
        );
        return renderBallotPdfWithMetadataQrCode(
          sharedBallotProps,
          doc,
          spec.electionDefinition,
          LATEST_SOFTWARE_VERSION
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

/** Paints a small black isosceles triangle into a top corner of `image`, like
 * a folded-over ("dog-eared") corner that obscures the timing marks there.
 * Equal-length legs give a natural 45° fold line. */
function drawFoldedCorner(
  image: ImageData,
  corner: 'top-left' | 'top-right'
): void {
  const { width, data } = image;
  const leg = Math.round(width * 0.1);
  for (let y = 0; y < leg; y += 1) {
    // `fromCorner` is the horizontal distance from the corner's vertical edge.
    for (let fromCorner = 0; fromCorner + y < leg; fromCorner += 1) {
      const x = corner === 'top-left' ? fromCorner : width - 1 - fromCorner;
      const i = (y * width + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
}

/**
 * Rasterizes a ballot PDF into a sheet whose front has a folded ("dog-eared")
 * corner — obscuring the corner timing marks so the sheet can't be interpreted
 * and ejects as `unreadable` ("Unreadable") — while the back is the ballot's
 * real back page (so it isn't a blank/black image). Returns both image paths.
 */
export async function renderFoldedCornerSheet(
  ballotPdfPath: string
): Promise<{ frontPath: string; backPath: string }> {
  const pdfBytes = new Uint8Array(readFileSync(ballotPdfPath));
  // Rasterize at roughly the scanner's 200 DPI. Only the front and back are
  // needed, so stop after two pages.
  const pageImages: ImageData[] = [];
  for await (const { page } of pdfToImages(pdfBytes, { scale: 200 / 72 })) {
    pageImages.push(page);
    if (pageImages.length === 2) break;
  }

  const front = assertDefined(pageImages[0]);
  const back = pageImages[1] ?? createImageData(front.width, front.height);
  // A real folded corner shows on both sides: top-right on the front mirrors to
  // top-left on the back.
  drawFoldedCorner(front, 'top-right');
  drawFoldedCorner(back, 'top-left');

  const tempDir = mkdtempSync(join(tmpdir(), 'folded-corner-'));
  const frontPath = join(tempDir, 'front.png');
  const backPath = join(tempDir, 'back.png');
  await writeImageData(frontPath, front);
  await writeImageData(backPath, back);
  return { frontPath, backPath };
}
