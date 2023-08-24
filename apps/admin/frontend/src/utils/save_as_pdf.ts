import { Election } from '@votingworks/types';

export function generateDefaultReportFilename(
  fileNamePrefix: string,
  election: Election,
  fileSuffix = 'all-precincts'
): string {
  return `${`${fileNamePrefix}-${election.county.name}-${election.title}-${fileSuffix}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/(^-|-$)+/g, '')
    .toLocaleLowerCase()}.pdf`;
}
