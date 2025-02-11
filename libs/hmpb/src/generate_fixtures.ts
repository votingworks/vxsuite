import { mkdir, rm, writeFile } from 'node:fs/promises';
import { iter, throwIllegalValue } from '@votingworks/basics';
import { writeImageData } from '@votingworks/image-utils';
import { allBubbleBallotFixtures } from './all_bubble_ballot_fixtures';
import {
  famousNamesFixtures,
  generalElectionFixtures,
  primaryElectionFixtures,
} from './ballot_fixtures';
import { Renderer } from './renderer';
import { createPlaywrightRenderer } from './playwright_renderer';

async function generateAllBubbleBallotFixtures(renderer: Renderer) {
  const fixtures = allBubbleBallotFixtures;
  const generated = await allBubbleBallotFixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(
    fixtures.electionPath,
    generated.electionDefinition.electionData
  );
  await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
  await writeFile(fixtures.filledBallotPath, generated.filledBallotPdf);
  await writeFile(fixtures.cyclingTestDeckPath, generated.cyclingTestDeckPdf);
}

async function generateFamousNamesFixtures(renderer: Renderer) {
  const fixtures = famousNamesFixtures;
  const generated = await fixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
  await writeFile(fixtures.markedBallotPath, generated.markedBallotPdf);
}

async function generateGeneralElectionFixtures(renderer: Renderer) {
  const fixtures = generalElectionFixtures;
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

async function generatePrimaryElectionFixtures(renderer: Renderer) {
  const fixtures = primaryElectionFixtures;
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

const ALL_FIXTURES = [
  'all-bubble-ballot',
  'famous-names',
  'general-election',
  'primary-election',
] as const;

function usage(out: NodeJS.WriteStream) {
  out.write(`Usage: generate_fixtures.ts [--all`);
  for (const fixture of ALL_FIXTURES) {
    out.write(` | --${fixture}`);
  }
  out.write(`]\n`);
}

export async function main(): Promise<void> {
  const fixtures: Set<(typeof ALL_FIXTURES)[number]> = new Set();

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    switch (arg) {
      case '--all':
        for (const fixture of ALL_FIXTURES) {
          fixtures.add(fixture);
        }
        break;

      case '--all-bubble-ballot':
        fixtures.add('all-bubble-ballot');
        break;

      case '--famous-names':
        fixtures.add('famous-names');
        break;

      case '--general-election':
        fixtures.add('general-election');
        break;

      case '--primary-election':
        fixtures.add('primary-election');
        break;

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

  if (fixtures.size === 0) {
    for (const fixture of ALL_FIXTURES) {
      fixtures.add(fixture);
    }
  }

  const renderer = await createPlaywrightRenderer();
  for (const fixture of fixtures) {
    switch (fixture) {
      case 'all-bubble-ballot':
        await rm(allBubbleBallotFixtures.dir, { recursive: true, force: true });
        await generateAllBubbleBallotFixtures(renderer);
        break;

      case 'famous-names':
        await rm(famousNamesFixtures.dir, { recursive: true, force: true });
        await generateFamousNamesFixtures(renderer);
        break;

      case 'general-election':
        await rm(generalElectionFixtures.dir, {
          recursive: true,
          force: true,
        });
        await generateGeneralElectionFixtures(renderer);
        break;

      case 'primary-election':
        await rm(primaryElectionFixtures.dir, {
          recursive: true,
          force: true,
        });
        await generatePrimaryElectionFixtures(renderer);
        break;

      default:
        throwIllegalValue(fixture);
        break;
    }
  }

  await renderer.cleanup();
}
