import * as fs from 'fs';
import { sha256 } from 'js-sha256';
import yargs from 'yargs/yargs';
import {
  assert,
  extractErrorMessage,
  Optional,
  throwIllegalValue,
} from '@votingworks/basics';
import { safeParseElection } from '@votingworks/types';

import { DEV_JURISDICTION } from '../src/jurisdictions';
import { mockCard } from '../src/mock_file_card';

const CARD_TYPES = [
  'system-administrator',
  'election-manager',
  'poll-worker',
  'poll-worker-with-pin',
  'unprogrammed',
  'no-card',
] as const;
type CardType = (typeof CARD_TYPES)[number];

interface MockCardInput {
  cardType: CardType;
  electionHash?: string;
}

async function parseCommandLineArgs(): Promise<MockCardInput> {
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
      },
    })
    .hide('help')
    .version(false)
    .example('$ mock-card --help', '')
    .example('$ mock-card --card-type system-administrator', '')
    .example(
      '$ mock-card --card-type election-manager \\\n' +
        '--election-definition path/to/election.json',
      ''
    )
    .example(
      '$ mock-card --card-type poll-worker \\\n' +
        '--election-definition path/to/election.json',
      ''
    )
    .example(
      '$ mock-card --card-type poll-worker-with-pin \\\n' +
        '--election-definition path/to/election.json',
      ''
    )
    .example('$ mock-card --card-type unprogrammed', '')
    .example('$ mock-card --card-type no-card', '')
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
    process.exit(0);
  }

  if (!args.cardType) {
    throw new Error(`Must specify card type\n\n${helpMessage}`);
  }

  let electionHash: Optional<string>;
  if (['election-manager', 'poll-worker'].includes(args.cardType)) {
    if (!args.electionDefinition) {
      throw new Error(
        `Must specify election definition for election manager and poll worker cards\n\n${helpMessage}`
      );
    }
    const electionData = fs.readFileSync(args.electionDefinition, 'utf-8');
    if (!safeParseElection(electionData).isOk()) {
      throw new Error(
        `${args.electionDefinition} isn't a valid election definition`
      );
    }
    electionHash = sha256(electionData);
  }

  return {
    cardType: args.cardType,
    electionHash,
  };
}

function mockCardWrapper({ cardType, electionHash }: MockCardInput) {
  switch (cardType) {
    case 'system-administrator': {
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'system_administrator',
              jurisdiction: DEV_JURISDICTION,
            },
          },
        },
        pin: '000000',
      });
      break;
    }
    case 'election-manager': {
      assert(electionHash !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'election_manager',
              jurisdiction: DEV_JURISDICTION,
              electionHash,
            },
          },
        },
        pin: '000000',
      });
      break;
    }
    case 'poll-worker': {
      assert(electionHash !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'poll_worker',
              jurisdiction: DEV_JURISDICTION,
              electionHash,
            },
            hasPin: false,
          },
        },
      });
      break;
    }
    case 'poll-worker-with-pin': {
      assert(electionHash !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'poll_worker',
              jurisdiction: DEV_JURISDICTION,
              electionHash,
            },
            hasPin: true,
          },
        },
        pin: '000000',
      });
      break;
    }
    case 'unprogrammed': {
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: undefined,
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
      throwIllegalValue(cardType);
    }
  }
}

/**
 * A script for mocking cards during local development. Run with --help for further guidance.
 */
export async function main(): Promise<void> {
  try {
    const mockCardInput = await parseCommandLineArgs();
    mockCardWrapper(mockCardInput);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
  process.exit(0);
}
