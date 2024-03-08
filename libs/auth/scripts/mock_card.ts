import yargs from 'yargs/yargs';
import {
  assert,
  extractErrorMessage,
  Optional,
  throwIllegalValue,
} from '@votingworks/basics';
import { readElection } from '@votingworks/fs';

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

async function parseCommandLineArgs(
  args: readonly string[]
): Promise<MockCardInput> {
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

  const parsedArgs = argParser.parse(args) as {
    cardType?: CardType;
    electionDefinition?: string;
    help?: boolean;
  };

  if (parsedArgs.help || args.length === 0) {
    console.log(helpMessage);
    process.exit(0);
  }

  if (!parsedArgs.cardType) {
    throw new Error(`Must specify card-type\n\n${helpMessage}`);
  }

  let electionHash: Optional<string>;
  if (['election-manager', 'poll-worker'].includes(parsedArgs.cardType)) {
    if (!parsedArgs.electionDefinition) {
      throw new Error(
        `Must specify election-definition for election manager and poll worker cards\n\n${helpMessage}`
      );
    }
    const readElectionResult = await readElection(
      parsedArgs.electionDefinition
    );
    if (readElectionResult.isErr()) {
      throw new Error(
        `${parsedArgs.electionDefinition} isn't a valid election definition`
      );
    }
    electionHash = readElectionResult.ok().electionHash;
  }

  return {
    cardType: parsedArgs.cardType,
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
export async function main(args: readonly string[]): Promise<void> {
  try {
    mockCardWrapper(await parseCommandLineArgs(args));
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
