import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { discoverBallotStyleFiles, resolveLatestVersions } from './nh_delivery';
import { NhBallotStyleSchema } from './convert_nh_election';

// Report every contest in the delivery that has no named candidates -- only the
// write-in option. Helps NH spot-check for phantom contests. Some empty
// contests are expected (an office where no one filed), so this is a review
// aid, not an error list.

interface EmptyContest {
  code: string;
  town: string;
  ward: string | number;
  party: string;
  office: string;
  winnerNote: string;
}

function candidateName(info: { Name: string | string[] }): string {
  return Array.isArray(info.Name) ? info.Name.join('') : info.Name;
}

function findEmptyContests(path: string): EmptyContest[] {
  const ballotStyle = NhBallotStyleSchema.parse(
    JSON.parse(readFileSync(path, 'utf-8'))
  );
  const { HeaderInfo, Candidates } = ballotStyle.AVSInterface;
  const empty: EmptyContest[] = [];
  for (const contest of Candidates) {
    const candidateInfos = Array.isArray(contest.CandidateName)
      ? contest.CandidateName
      : contest.CandidateName
      ? [contest.CandidateName]
      : [];
    const namedCount = candidateInfos.filter(
      (info) => candidateName(info) !== ''
    ).length;
    if (namedCount === 0) {
      empty.push({
        code: basename(path).slice(0, 5),
        town: HeaderInfo.TownName,
        ward: HeaderInfo.WardName,
        party: HeaderInfo.PartyName,
        office: contest.OfficeName.Name.replace(/\s+/g, ' ').trim(),
        winnerNote: contest.OfficeName.WinnerNote,
      });
    }
  }
  return empty;
}

export function reportEmptyContests(root: string): void {
  const { resolved } = resolveLatestVersions(discoverBallotStyleFiles(root));
  const byBallotStyle = resolved
    .map((file) => ({ file, empties: findEmptyContests(file.path) }))
    .filter(({ empties }) => empties.length > 0)
    .sort((a, b) => a.file.code.localeCompare(b.file.code));

  const totalContests = byBallotStyle.reduce(
    (sum, { empties }) => sum + empties.length,
    0
  );

  // Human-readable grouped log.
  console.log(
    `Contests with no candidates (write-in only): ${totalContests} across ${byBallotStyle.length} ballot styles\n`
  );
  for (const { empties } of byBallotStyle) {
    const { code, town, ward, party } = empties[0];
    const wardLabel = ward ? ` Ward ${ward}` : '';
    console.log(`${code} ${party} ${town}${wardLabel}`);
    for (const empty of empties) {
      console.log(`  - ${empty.office} (${empty.winnerNote})`);
    }
  }

  // Machine-readable CSV to stderr for easy filtering/sharing.
  console.error('code,party,town,ward,office,winnerNote');
  for (const { empties } of byBallotStyle) {
    for (const e of empties) {
      const csv = [e.code, e.party, e.town, e.ward, e.office, e.winnerNote]
        .map((field) => `"${String(field).replace(/"/g, '""')}"`)
        .join(',');
      console.error(csv);
    }
  }
}

/* istanbul ignore next */
if (require.main === module) {
  const root = process.argv[2];
  if (!root) {
    console.error('Usage: nh_empty_contests <delivery-dir>');
    process.exit(1);
  }
  reportEmptyContests(root);
}
