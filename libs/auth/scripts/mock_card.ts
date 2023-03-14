/* eslint-disable no-console */
import { Buffer } from 'buffer';
import yargs from 'yargs/yargs';
import { assert, throwIllegalValue } from '@votingworks/basics';
import * as fixtures from '@votingworks/fixtures';
import { ElectionDefinition, Optional } from '@votingworks/types';

import { mockCard } from '../src/mock_file_card';

const CARD_TYPES = [
  'system-administrator',
  'election-manager',
  'poll-worker',
  'unprogrammed',
  'no-card',
] as const;
type CardType = typeof CARD_TYPES[number];

const ELECTION_DEFINITIONS: { [electionName: string]: ElectionDefinition } = {
  electionFamousNames2021:
    fixtures.electionFamousNames2021Fixtures.electionDefinition,
  electionGridLayoutNewHampshireAmherst:
    fixtures.electionGridLayoutNewHampshireAmherstFixtures.electionDefinition,
  electionGridLayoutNewHampshireHudson:
    fixtures.electionGridLayoutNewHampshireHudsonFixtures.electionDefinition,
  electionMinimalExhaustiveSample:
    fixtures.electionMinimalExhaustiveSampleFixtures.electionDefinition,
  electionMinimalExhaustiveSampleRightSideTargets:
    fixtures.electionMinimalExhaustiveSampleRightSideTargetsDefinition,
  electionMinimalExhaustiveSampleSinglePrecinct:
    fixtures.electionMinimalExhaustiveSampleSinglePrecinctDefinition,
  electionMinimalExhaustiveSampleWithReportingUrl:
    fixtures.electionMinimalExhaustiveSampleWithReportingUrlFixtures
      .electionDefinition,
  electionMultiPartyPrimary:
    fixtures.electionMultiPartyPrimaryFixtures.electionDefinition,
  electionPrimary: fixtures.primaryElectionSampleFixtures.electionDefinition,
  electionPrimaryNonpartisanContests:
    fixtures.electionPrimaryNonpartisanContestsFixtures.electionDefinition,
  electionSample: fixtures.electionSampleDefinition,
  electionSample2: fixtures.electionSample2Fixtures.electionDefinition,
  electionSampleCdf: fixtures.electionSampleCdfDefinition,
  electionSampleLongContent: fixtures.electionSampleLongContentDefinition,
  electionSampleNoSeal: fixtures.electionSampleNoSealDefinition,
  electionWithMsEitherNeither:
    fixtures.electionWithMsEitherNeitherFixtures.electionDefinition,
};

async function mockCardGivenEnvVars() {
  const argParser = yargs()
    .options({
      'card-type': {
        description: 'The type of card to mock',
        type: 'string',
        choices: CARD_TYPES,
      },
      'election-definition': {
        description:
          'The election definition to use for an election manager or poll worker card',
        type: 'string',
        choices: Object.keys(ELECTION_DEFINITIONS).sort(),
      },
    })
    .hide('help')
    .version(false)
    .example('$ ./scripts/mock-card --help', '')
    .example('$ ./scripts/mock-card --card-type system-administrator', '')
    .example(
      '$ ./scripts/mock-card --card-type election-manager --election-definition electionFamousNames2021',
      ''
    )
    .example(
      '$ ./scripts/mock-card --card-type poll-worker --election-definition electionSample',
      ''
    )
    .example('$ ./scripts/mock-card --card-type unprogrammed', '')
    .example('$ ./scripts/mock-card --card-type no-card', '')
    .strict();

  const helpMessage = await argParser.getHelp();
  argParser.fail((errorMessage: string) => {
    throw new Error(`${errorMessage}\n\n${helpMessage}`);
  });

  const args = argParser.parse(process.argv.slice(2)) as {
    cardType?: CardType;
    electionDefinition?: string;
    help?: boolean;
  };

  if (args.help || process.argv.length === 2) {
    console.log(helpMessage);
    return;
  }

  if (!args.cardType) {
    throw new Error(`Must specify card type\n\n${helpMessage}`);
  }

  let electionDefinition: Optional<ElectionDefinition>;
  if (['election-manager', 'poll-worker'].includes(args.cardType)) {
    if (!args.electionDefinition) {
      throw new Error(
        `Must specify election definition for election manager and poll worker cards\n\n${helpMessage}`
      );
    }
    electionDefinition = ELECTION_DEFINITIONS[args.electionDefinition];
  }

  switch (args.cardType) {
    case 'system-administrator': {
      mockCard({
        cardStatus: {
          status: 'ready',
          user: {
            role: 'system_administrator',
          },
        },
        pin: '000000',
      });
      break;
    }
    case 'election-manager': {
      assert(electionDefinition !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          user: {
            role: 'election_manager',
            electionHash: electionDefinition.electionHash,
          },
        },
        data: Buffer.from(electionDefinition.electionData, 'utf-8'),
        pin: '000000',
      });
      break;
    }
    case 'poll-worker': {
      assert(electionDefinition !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          user: {
            role: 'poll_worker',
            electionHash: electionDefinition.electionHash,
          },
        },
      });
      break;
    }
    case 'unprogrammed': {
      mockCard({
        cardStatus: {
          status: 'ready',
          user: undefined,
        },
      });
      break;
    }
    case 'no-card': {
      mockCard({
        cardStatus: {
          status: 'no_card',
        },
      });
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(args.cardType);
    }
  }
}

/**
 * A script for mocking cards during local development
 */
export async function main(): Promise<void> {
  try {
    await mockCardGivenEnvVars();
  } catch (error) {
    console.error(error instanceof Error ? `❌ ${error.message}` : error);
    process.exit(1);
  }
  process.exit(0);
}
