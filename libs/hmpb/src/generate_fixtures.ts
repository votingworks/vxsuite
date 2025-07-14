import { mkdir, rm, writeFile } from 'node:fs/promises';
import { iter } from '@votingworks/basics';
import { writeImageData } from '@votingworks/image-utils';
import {
  HmpbBallotPaperSize,
  HmpbBallotPaperSizeSchema,
  unsafeParse,
} from '@votingworks/types';
import assert from 'node:assert';
import { dirname, join, normalize, relative } from 'node:path';
import {
  AllBubbleBallotFixtures,
  allBubbleBallotFixtures,
} from './all_bubble_ballot_fixtures';
import {
  fixturesDir,
  timingMarkPaperFixtures,
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
  nhGeneralElectionFixtures,
  vxPrimaryElectionFixtures,
} from './ballot_fixtures';
import { Renderer } from './renderer';
import { createPlaywrightRenderer } from './playwright_renderer';

async function generateAllBubbleBallotFixtures(
  fixtures: AllBubbleBallotFixtures,
  renderer: Renderer
) {
  const generated = await fixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(
    fixtures.electionPath,
    generated.electionDefinition.electionData
  );
  await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
  await writeFile(fixtures.filledBallotPath, generated.filledBallotPdf);
  await writeFile(fixtures.cyclingTestDeckPath, generated.cyclingTestDeckPdf);
}

async function generateVxFamousNamesFixtures(renderer: Renderer) {
  const fixtures = vxFamousNamesFixtures;
  const generated = await fixtures.generate(renderer, {
    generatePageImages: true,
  });
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
  await writeFile(fixtures.markedBallotPath, generated.markedBallotPdf);
  for (const { pdfPath, images } of [
    {
      pdfPath: generated.blankBallotPath,
      images: generated.blankBallotPageImages,
    },
    {
      pdfPath: generated.markedBallotPath,
      images: generated.markedBallotPageImages,
    },
  ]) {
    if (images) {
      for (const [i, image] of images.entries()) {
        await writeImageData(pdfPath.replace('.pdf', `-p${i + 1}.jpg`), image);
      }
    }
  }
}

async function generateVxGeneralElectionFixtures(renderer: Renderer) {
  const fixtures = vxGeneralElectionFixtures;
  const allGenerated = await fixtures.generate(renderer, fixtures.fixtureSpecs);
  for (const [spec, generated] of iter(fixtures.fixtureSpecs).zip(
    allGenerated
  )) {
    await mkdir(spec.electionDir, { recursive: true });
    await writeFile(
      spec.electionPath,
      generated.electionDefinition.electionData
    );
    await writeFile(spec.blankBallotPath, generated.blankBallotPdf);
    await writeFile(spec.markedBallotPath, generated.markedBallotPdf);
    if (generated.blankBallotPageImages) {
      for (const [i, image] of generated.blankBallotPageImages.entries()) {
        await writeImageData(
          spec.blankBallotPath.replace('.pdf', `-p${i + 1}.jpg`),
          image
        );
      }
    }
  }
}

async function generateVxPrimaryElectionFixtures(renderer: Renderer) {
  const fixtures = vxPrimaryElectionFixtures;
  const generated = await fixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });

  for (const party of ['mammalParty', 'fishParty'] as const) {
    const partyFixtures = fixtures[party];
    const partyGenerated = generated[party];
    await writeFile(
      partyFixtures.blankBallotPath,
      partyGenerated.blankBallotPdf
    );
    await writeFile(
      partyFixtures.otherPrecinctBlankBallotPath,
      partyGenerated.otherPrecinctBlankBallotPdf
    );
    await writeFile(
      partyFixtures.markedBallotPath,
      partyGenerated.markedBallotPdf
    );
  }
}

async function generateNhGeneralElectionFixtures(renderer: Renderer) {
  const fixtures = nhGeneralElectionFixtures;
  const allGenerated = await fixtures.generate(renderer, fixtures.fixtureSpecs);
  for (const [spec, generated] of iter(fixtures.fixtureSpecs).zip(
    allGenerated
  )) {
    await mkdir(spec.electionDir, { recursive: true });
    await writeFile(
      spec.electionPath,
      generated.electionDefinition.electionData
    );
    await writeFile(spec.blankBallotPath, generated.blankBallotPdf);
    await writeFile(spec.markedBallotPath, generated.markedBallotPdf);
  }
}

async function generateTimingMarkPaperFixtures(
  renderer: Renderer,
  paperSize: HmpbBallotPaperSize,
  fixtureDir: string
) {
  const outputDir = normalize(fixtureDir);
  const specPaths = timingMarkPaperFixtures.specPaths({ paperSize });
  const specDir = join(outputDir, specPaths.dir);
  assert(relative(outputDir, specDir).startsWith(specPaths.dir));
  await rm(specDir, {
    recursive: true,
    force: true,
  });
  const generated = await timingMarkPaperFixtures.generate(renderer, {
    paperSize,
  });
  const pdfPath = join(outputDir, specPaths.pdf);
  assert(pdfPath.startsWith(`${outputDir}/`));
  await mkdir(dirname(pdfPath), { recursive: true });
  await writeFile(pdfPath, generated.pdf);
}

interface FixtureSpec {
  fixtureName: string;
  paperSize: HmpbBallotPaperSize;
}

const ALL_FIXTURE_SPECS: readonly FixtureSpec[] = [
  { fixtureName: 'all-bubble-ballot', paperSize: HmpbBallotPaperSize.Letter },
  { fixtureName: 'all-bubble-ballot', paperSize: HmpbBallotPaperSize.Legal },
  { fixtureName: 'all-bubble-ballot', paperSize: HmpbBallotPaperSize.Custom17 },
  { fixtureName: 'all-bubble-ballot', paperSize: HmpbBallotPaperSize.Custom19 },
  { fixtureName: 'all-bubble-ballot', paperSize: HmpbBallotPaperSize.Custom22 },
  { fixtureName: 'vx-famous-names', paperSize: HmpbBallotPaperSize.Letter },
  { fixtureName: 'vx-general-election', paperSize: HmpbBallotPaperSize.Letter },
  { fixtureName: 'vx-primary-election', paperSize: HmpbBallotPaperSize.Letter },
  { fixtureName: 'nh-general-election', paperSize: HmpbBallotPaperSize.Letter },
  {
    fixtureName: 'timing-mark-paper',
    paperSize: HmpbBallotPaperSize.Letter,
  },
  {
    fixtureName: 'timing-mark-paper',
    paperSize: HmpbBallotPaperSize.Legal,
  },
  {
    fixtureName: 'timing-mark-paper',
    paperSize: HmpbBallotPaperSize.Custom17,
  },
  {
    fixtureName: 'timing-mark-paper',
    paperSize: HmpbBallotPaperSize.Custom19,
  },
  {
    fixtureName: 'timing-mark-paper',
    paperSize: HmpbBallotPaperSize.Custom22,
  },
];

function usage(out: NodeJS.WriteStream) {
  out.write(
    `Usage: generate_fixtures.ts [--all | --spec <fixture> <paper-size> …]\n`
  );
  out.write(`\n`);
  out.write(`Available specs:\n`);
  out.write(`  --all\n`);
  for (const { fixtureName, paperSize } of ALL_FIXTURE_SPECS) {
    out.write(`  --spec ${fixtureName} ${paperSize}\n`);
  }
}

export async function main(): Promise<void> {
  const fixtureSpecs: FixtureSpec[] = [];

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    switch (arg) {
      case '--all':
        fixtureSpecs.push(...ALL_FIXTURE_SPECS);
        break;

      case '-s':
      case '--spec': {
        i += 1;
        const fixtureName = process.argv[i];
        i += 1;
        const paperSize = unsafeParse(
          HmpbBallotPaperSizeSchema,
          process.argv[i]
        );

        fixtureSpecs.push({ fixtureName, paperSize });
        break;
      }

      case '-h':
      case '--help':
        usage(process.stdout);
        process.exit(0);
        break;

      default:
        process.stderr.write(`Unknown argument: ${arg}\n`);
        usage(process.stderr);
        process.exit(1);
        break;
    }
  }

  if (fixtureSpecs.length === 0) {
    fixtureSpecs.push(...ALL_FIXTURE_SPECS);
  }

  const renderer = await createPlaywrightRenderer();
  for (const { fixtureName, paperSize } of fixtureSpecs) {
    switch (fixtureName) {
      case 'all-bubble-ballot': {
        const fixtures = allBubbleBallotFixtures(paperSize);
        await rm(fixtures.dir, { recursive: true, force: true });
        await generateAllBubbleBallotFixtures(fixtures, renderer);
        break;
      }

      case 'vx-famous-names':
        await rm(vxFamousNamesFixtures.dir, { recursive: true, force: true });
        await generateVxFamousNamesFixtures(renderer);
        break;

      case 'vx-general-election':
        await rm(vxGeneralElectionFixtures.dir, {
          recursive: true,
          force: true,
        });
        await generateVxGeneralElectionFixtures(renderer);
        break;

      case 'vx-primary-election':
        await rm(vxPrimaryElectionFixtures.dir, {
          recursive: true,
          force: true,
        });
        await generateVxPrimaryElectionFixtures(renderer);
        break;

      case 'nh-general-election':
        await rm(nhGeneralElectionFixtures.dir, {
          recursive: true,
          force: true,
        });
        await generateNhGeneralElectionFixtures(renderer);
        break;

      case 'timing-mark-paper': {
        await generateTimingMarkPaperFixtures(
          renderer,
          paperSize,
          join(fixturesDir, fixtureName)
        );
        break;
      }

      default:
        process.stderr.write(`Unknown fixture: ${fixtureName}\n`);
        usage(process.stderr);
        process.exit(1);
        break;
    }
  }

  await renderer.cleanup();
}
