import { iter } from '@votingworks/basics';
import { writeImageData } from '@votingworks/image-utils';
import { HmpbBallotPaperSize } from '@votingworks/types';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  AllBubbleBallotFixtures,
  allBubbleBallotFixtures,
} from './all_bubble_ballot_fixtures';
import {
  nhGeneralElectionFixtures,
  timingMarkPaperFixtures,
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
  vxPrimaryElectionFixtures,
} from './ballot_fixtures';
import { convertPdfToCmyk } from './pdf_conversion';
import { createPlaywrightRenderer } from './playwright_renderer';
import { Renderer } from './renderer';
import { TimingMarkPaperType } from './timing_mark_paper/template';

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
  paperType: TimingMarkPaperType
) {
  const specPaths = timingMarkPaperFixtures.specPaths({ paperSize, paperType });
  await rm(specPaths.pdf, { force: true });
  const generated = await timingMarkPaperFixtures.generate(renderer, {
    paperSize,
    paperType,
  });
  const pdfPath = specPaths.pdf;
  await mkdir(dirname(pdfPath), { recursive: true });
  await writeFile(pdfPath, generated.pdf);
}

const ALL_PAPER_SIZES: readonly HmpbBallotPaperSize[] = [
  HmpbBallotPaperSize.Letter,
  HmpbBallotPaperSize.Legal,
  HmpbBallotPaperSize.Custom17,
  HmpbBallotPaperSize.Custom19,
  HmpbBallotPaperSize.Custom22,
];

function usage(out: NodeJS.WriteStream) {
  out.write(`Usage: generate_fixtures.ts\n`);
}

type Fixture =
  | 'all-bubble-ballot'
  | 'timing-mark-paper'
  | 'vx-famous-names'
  | 'vx-general-election'
  | 'vx-primary-election'
  | 'nh-general-election';

export async function main(): Promise<number> {
  const renderer = await createPlaywrightRenderer();

  const fixtures = new Set<Fixture>();

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i] as string;
    switch (arg) {
      case '-h':
      case '--help': {
        usage(process.stdout);
        return 0;
      }

      case '--all-bubble-ballot': {
        fixtures.add('all-bubble-ballot');
        break;
      }

      case '--timing-mark-paper': {
        fixtures.add('timing-mark-paper');
        break;
      }

      case '--vx-famous-names': {
        fixtures.add('vx-famous-names');
        break;
      }

      case '--vx-general-election': {
        fixtures.add('vx-general-election');
        break;
      }

      case '--vx-primary-election': {
        fixtures.add('vx-primary-election');
        break;
      }

      case '--nh-general-election': {
        fixtures.add('nh-general-election');
        break;
      }

      default: {
        usage(process.stderr);
        return -1;
      }
    }
  }

  if (fixtures.size === 0 || fixtures.has('all-bubble-ballot')) {
    for (const paperSize of ALL_PAPER_SIZES) {
      const fixtures = allBubbleBallotFixtures(paperSize);
      await rm(fixtures.dir, { recursive: true, force: true });
      await generateAllBubbleBallotFixtures(fixtures, renderer);
    }
  }

  if (fixtures.size === 0 || fixtures.has('vx-famous-names')) {
    await rm(vxFamousNamesFixtures.dir, { recursive: true, force: true });
    await generateVxFamousNamesFixtures(renderer);
  }

  if (fixtures.size === 0 || fixtures.has('vx-general-election')) {
    await rm(vxGeneralElectionFixtures.dir, {
      recursive: true,
      force: true,
    });
    await generateVxGeneralElectionFixtures(renderer);
  }

  if (fixtures.size === 0 || fixtures.has('vx-primary-election')) {
    await rm(vxPrimaryElectionFixtures.dir, {
      recursive: true,
      force: true,
    });
    await generateVxPrimaryElectionFixtures(renderer);
  }

  if (fixtures.size === 0 || fixtures.has('nh-general-election')) {
    await rm(nhGeneralElectionFixtures.dir, {
      recursive: true,
      force: true,
    });
    await generateNhGeneralElectionFixtures(renderer);
  }

  if (fixtures.size === 0 || fixtures.has('timing-mark-paper')) {
    for (const paperSize of ALL_PAPER_SIZES) {
      await generateTimingMarkPaperFixtures(renderer, paperSize, 'standard');
      await generateTimingMarkPaperFixtures(renderer, paperSize, 'qa-overlay');
    }
  }

  await renderer.cleanup();

  return 0;
}
