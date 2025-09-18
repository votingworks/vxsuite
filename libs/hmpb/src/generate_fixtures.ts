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
  calibrationSheetFixtures,
  nhGeneralElectionFixtures,
  timingMarkPaperFixtures,
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
  vxPrimaryElectionFixtures,
} from './ballot_fixtures';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { Renderer, RendererPool } from './renderer';
import { TimingMarkPaperType } from './timing_mark_paper/template';

async function generateAllBubbleBallotFixtures(
  fixtures: AllBubbleBallotFixtures,
  rendererPool: RendererPool
) {
  const generated = await fixtures.generate(rendererPool);
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(
    fixtures.electionPath,
    generated.electionDefinition.electionData
  );
  await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
  await writeFile(fixtures.filledBallotPath, generated.filledBallotPdf);
  await writeFile(fixtures.cyclingTestDeckPath, generated.cyclingTestDeckPdf);
}

async function generateVxFamousNamesFixtures(rendererPool: RendererPool) {
  const fixtures = vxFamousNamesFixtures;
  const generated = await fixtures.generate(rendererPool, {
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

async function generateVxGeneralElectionFixtures(rendererPool: RendererPool) {
  const fixtures = vxGeneralElectionFixtures;
  const allGenerated = await fixtures.generate(
    rendererPool,
    fixtures.fixtureSpecs
  );
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

async function generateVxPrimaryElectionFixtures(rendererPool: RendererPool) {
  const fixtures = vxPrimaryElectionFixtures;
  const generated = await fixtures.generate(rendererPool);
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

async function generateNhGeneralElectionFixtures(rendererPool: RendererPool) {
  const fixtures = nhGeneralElectionFixtures;
  const allGenerated = await fixtures.generate(
    rendererPool,
    fixtures.fixtureSpecs
  );
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

async function generateCalibrationSheetFixtures(
  renderer: Renderer,
  paperSize: HmpbBallotPaperSize
) {
  const specPaths = calibrationSheetFixtures.specPaths(paperSize);
  await rm(specPaths.pdf, { force: true });
  const generated = await calibrationSheetFixtures.generate(
    renderer,
    paperSize
  );
  await mkdir(specPaths.dir, { recursive: true });
  await writeFile(specPaths.pdf, generated.pdf);
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
  | 'nh-general-election'
  | 'calibration-sheet';

export async function main(): Promise<number> {
  const rendererPool = await createPlaywrightRendererPool();

  const fixtures = new Set<Fixture>();

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
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

      case '--calibration-sheet': {
        fixtures.add('calibration-sheet');
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
      const abbFixtures = allBubbleBallotFixtures(paperSize);
      await rm(abbFixtures.dir, { recursive: true, force: true });
      await generateAllBubbleBallotFixtures(abbFixtures, rendererPool);
    }
  }

  if (fixtures.size === 0 || fixtures.has('vx-famous-names')) {
    await rm(vxFamousNamesFixtures.dir, { recursive: true, force: true });
    await generateVxFamousNamesFixtures(rendererPool);
  }

  if (fixtures.size === 0 || fixtures.has('vx-general-election')) {
    await rm(vxGeneralElectionFixtures.dir, {
      recursive: true,
      force: true,
    });
    await generateVxGeneralElectionFixtures(rendererPool);
  }

  if (fixtures.size === 0 || fixtures.has('vx-primary-election')) {
    await rm(vxPrimaryElectionFixtures.dir, {
      recursive: true,
      force: true,
    });
    await generateVxPrimaryElectionFixtures(rendererPool);
  }

  if (fixtures.size === 0 || fixtures.has('nh-general-election')) {
    await rm(nhGeneralElectionFixtures.dir, {
      recursive: true,
      force: true,
    });
    await generateNhGeneralElectionFixtures(rendererPool);
  }

  if (fixtures.size === 0 || fixtures.has('timing-mark-paper')) {
    await iter(
      rendererPool.runTasks(
        ALL_PAPER_SIZES.map((paperSize) => async (renderer) => {
          await generateTimingMarkPaperFixtures(
            renderer,
            paperSize,
            'standard'
          );
          await generateTimingMarkPaperFixtures(
            renderer,
            paperSize,
            'qa-overlay'
          );
        })
      )
    )
      .async()
      .count(); // Drain iterator
  }

  if (fixtures.size === 0 || fixtures.has('calibration-sheet')) {
    await iter(
      rendererPool.runTasks(
        ALL_PAPER_SIZES.map((paperSize) => async (renderer) => {
          await generateCalibrationSheetFixtures(renderer, paperSize);
        })
      )
    )
      .async()
      .count(); // Drain iterator
  }

  await rendererPool.close();

  return 0;
}
