import { Election, HmpbBallotPaperSize } from '@votingworks/types';
import { createPlaywrightRendererPool, Renderer } from '@votingworks/hmpb';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { convertNhElection, NhBallotStyleSchema } from './convert_nh_election';
import {
  discoverBallotStyleFiles,
  groupByTown,
  resolveLatestVersions,
  TownGroup,
} from './nh_delivery';
import { autoFitPaperSize } from './render_nh_batch';

// Human-readable paper dimensions. The enum value already encodes the size
// ("letter" = 8.5x11, "legal" = 8.5x14, "custom-8.5x17" = 8.5x17, ...).
function paperSizeLabel(size: HmpbBallotPaperSize): string {
  switch (size) {
    case HmpbBallotPaperSize.Letter:
      return '8.5 x 11';
    case HmpbBallotPaperSize.Legal:
      return '8.5 x 14';
    default:
      return size.replace('custom-', '').replace('x', ' x ');
  }
}

interface TownSize {
  townName: string;
  variant: string;
  wardCount: number;
  paperSize: HmpbBallotPaperSize;
  overflowedAtMax: boolean;
}

async function sizeTown(
  renderer: Renderer,
  town: TownGroup
): Promise<TownSize> {
  const nhBallotStyles = town.files.map((file) =>
    NhBallotStyleSchema.parse(JSON.parse(readFileSync(file.path, 'utf-8')))
  );
  const election: Election = convertNhElection(nhBallotStyles);
  const { paperSize, overflowedAtMax } = await autoFitPaperSize(
    renderer,
    election,
    town.variant === 'HandCount'
  );
  return {
    townName: election.jurisdiction.name,
    variant: town.variant,
    // Each precinct is a ward (or the town itself when it has no wards).
    wardCount: election.precincts.length,
    paperSize,
    overflowedAtMax,
  };
}

const USAGE = `Usage: nh_paper_sizes <delivery-dir> [out-csv]`;

export async function main(args: readonly string[]): Promise<number> {
  if (args.length < 1) {
    console.error(USAGE);
    return 1;
  }
  const [deliveryDir, outCsv] = args;

  const { resolved } = resolveLatestVersions(
    discoverBallotStyleFiles(deliveryDir)
  );
  const towns = groupByTown(resolved);
  console.log(`Sizing ${towns.length} town(s)...\n`);

  const pool = await createPlaywrightRendererPool();
  let results: TownSize[];
  try {
    results = await pool.runTasks(
      towns.map((town) => (renderer: Renderer) => sizeTown(renderer, town)),
      (done, total) => {
        if (done === total || done % 20 === 0) {
          console.log(`  sized ${done}/${total} towns`);
        }
      }
    );
  } finally {
    await pool.close();
  }

  results = [...results].sort((a, b) => a.townName.localeCompare(b.townName));

  // Breakdown by paper size, counting both towns and wards.
  const bySize = new Map<
    HmpbBallotPaperSize,
    { towns: number; wards: number }
  >();
  for (const result of results) {
    const entry = bySize.get(result.paperSize) ?? { towns: 0, wards: 0 };
    entry.towns += 1;
    entry.wards += result.wardCount;
    bySize.set(result.paperSize, entry);
  }

  console.log('\n=== Ballot size breakdown ===');
  const sizesInOrder = [
    HmpbBallotPaperSize.Letter,
    HmpbBallotPaperSize.Legal,
    HmpbBallotPaperSize.Custom17,
    HmpbBallotPaperSize.Custom18,
    HmpbBallotPaperSize.Custom19,
    HmpbBallotPaperSize.Custom20,
    HmpbBallotPaperSize.Custom22,
  ];
  for (const size of sizesInOrder) {
    const entry = bySize.get(size);
    if (!entry) continue;
    console.log(
      `${paperSizeLabel(size).padEnd(10)} - ${String(entry.towns).padStart(
        3
      )} towns, ${String(entry.wards).padStart(3)} wards`
    );
  }
  const totalTowns = results.length;
  const totalWards = results.reduce((sum, r) => sum + r.wardCount, 0);
  console.log(
    `${'TOTAL'.padEnd(10)} - ${totalTowns} towns, ${totalWards} wards`
  );

  const overflowed = results.filter((r) => r.overflowedAtMax);
  if (overflowed.length > 0) {
    console.log(
      `\n⚠ ${overflowed.length} town(s) still overflow at the largest size:`
    );
    for (const r of overflowed) {
      console.log(`  ${r.townName} (${r.variant})`);
    }
  }

  if (outCsv) {
    await mkdir(join(outCsv, '..'), { recursive: true });
    const header = 'Town,Variant,Wards,PaperSize,OverflowedAtMax\n';
    const rows = results
      .map(
        (r) =>
          `${r.townName},${r.variant},${r.wardCount},${paperSizeLabel(
            r.paperSize
          )},${r.overflowedAtMax}`
      )
      .join('\n');
    await writeFile(outCsv, `${header}${rows}\n`);
    console.log(`\nWrote ${outCsv}`);
  }

  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
