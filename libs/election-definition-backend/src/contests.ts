import type { YesNoContest } from '@votingworks/types';

export function hasDuplicateOptionLabels(contest: YesNoContest): boolean {
  const labels = contest.options.map((option) => option.label);
  return new Set(labels).size !== labels.length;
}
