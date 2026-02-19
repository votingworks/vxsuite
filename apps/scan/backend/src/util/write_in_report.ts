import { assertDefined } from '@votingworks/basics';
import { loadImageData, crop, toDataUrl } from '@votingworks/image-utils';
import { AnyContest, InterpretedHmpbPage, VotesDict } from '@votingworks/types';
import { WriteInEntry } from '@votingworks/ui';
import { rootDebug } from './debug';

const debug = rootDebug.extend('write-in-report');

function isContestOvervoted(contest: AnyContest, votes: VotesDict): boolean {
  if (contest.type !== 'candidate') return false;
  const vote = votes[contest.id];
  if (!vote || !Array.isArray(vote)) return false;
  return vote.length > contest.seats;
}

export function getOvervotedContestIds(
  votes: VotesDict,
  contests: readonly AnyContest[]
): Set<string> {
  const overvoted = new Set<string>();
  for (const contest of contests) {
    if (isContestOvervoted(contest, votes)) {
      overvoted.add(contest.id);
    }
  }
  return overvoted;
}

export interface WriteInCandidate {
  contestId: string;
  candidateId: string;
  name: string;
}

export function extractWriteInCandidates(
  votes: VotesDict,
  overvotedContestIds: Set<string>
): WriteInCandidate[] {
  const results: WriteInCandidate[] = [];
  for (const [contestId, vote] of Object.entries(votes)) {
    if (!vote || !Array.isArray(vote)) continue;
    if (overvotedContestIds.has(contestId)) continue;
    for (const option of vote) {
      if (
        typeof option === 'object' &&
        'isWriteIn' in option &&
        option.isWriteIn
      ) {
        results.push({ contestId, candidateId: option.id, name: option.name });
      }
    }
  }
  return results;
}

export function extractSummaryWriteIns(
  writeInCandidates: WriteInCandidate[]
): Map<string, WriteInEntry[]> {
  const writeInsByContest = new Map<string, WriteInEntry[]>();
  for (const { contestId, name } of writeInCandidates) {
    const existing = writeInsByContest.get(contestId) ?? [];
    existing.push({ type: 'text', text: name });
    writeInsByContest.set(contestId, existing);
  }
  return writeInsByContest;
}

export async function extractHmpbWriteIns(
  interpretation: InterpretedHmpbPage,
  imagePath: string,
  writeInCandidates: WriteInCandidate[]
): Promise<Map<string, WriteInEntry[]>> {
  const writeInsByContest = new Map<string, WriteInEntry[]>();
  if (writeInCandidates.length === 0) {
    return writeInsByContest;
  }

  const { layout } = interpretation;

  const imageResult = await loadImageData(imagePath);
  if (imageResult.isErr()) {
    debug('failed to load image %s: %O', imagePath, imageResult.err());
    return writeInsByContest;
  }
  const imageData = imageResult.ok();

  for (const { contestId, candidateId } of writeInCandidates) {
    const contestLayoutEntry = assertDefined(
      layout.contests.find((c) => c.contestId === contestId)
    );
    const optionLayoutEntry = assertDefined(
      contestLayoutEntry.options.find((o) => o.definition?.id === candidateId)
    );

    const cropped = crop(imageData, optionLayoutEntry.bounds);
    const dataUrl = toDataUrl(cropped, 'image/png');

    const existing = writeInsByContest.get(contestId) ?? [];
    existing.push({ type: 'image', dataUrl });
    writeInsByContest.set(contestId, existing);
  }

  return writeInsByContest;
}
