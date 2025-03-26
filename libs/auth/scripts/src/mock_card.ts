import yargs from 'yargs/yargs';
import {
  assert,
  DateWithoutTime,
  extractErrorMessage,
  Optional,
  throwIllegalValue,
} from '@votingworks/basics';
import { readFile } from '@votingworks/fs';

import { ElectionId, ElectionKey, safeParseJson } from '@votingworks/types';
import { DEV_JURISDICTION } from '../../src/jurisdictions';
import { mockCard } from '../../src/mock_file_card';

const CARD_TYPES = [
  'vendor',
  'system-administrator',
  'election-manager',
  'poll-worker',
  'poll-worker-with-pin',
  'unprogrammed',
  'no-card',
] as const;
type CardType = (typeof CARD_TYPES)[number];

interface CommandLineArgs {
  cardType: CardType;
  electionKey?: ElectionKey;
}

async function parseCommandLineArgs(
  args: readonly string[]
): Promise<CommandLineArgs> {
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
    .example('$ mock-card --card-type vendor', '')
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

  if (parsedArgs.help) {
    console.log(helpMessage);
    process.exit(0);
  }

  if (args.length === 0) {
    throw new Error(helpMessage);
  }

  if (!parsedArgs.cardType) {
    throw new Error(`Must specify card-type\n\n${helpMessage}`);
  }

  let electionKey: Optional<ElectionKey>;
  if (['election-manager', 'poll-worker'].includes(parsedArgs.cardType)) {
    if (!parsedArgs.electionDefinition) {
      throw new Error(
        `Must specify election-definition for election manager and poll worker cards\n\n${helpMessage}`
      );
    }
    // TODO-POLLBOOK-MERGE: Should this go back to the previous implementation?
    const readElectionResult = safeParseJson(
      (await readFile(parsedArgs.electionDefinition, { maxSize: 1024 * 1024 }))
        .unsafeUnwrap()
        .toString('utf-8')
    );
    if (readElectionResult.isErr()) {
      throw new Error(
        `${parsedArgs.electionDefinition} isn't a valid election definition`
      );
    }
    // TODO-POLLBOOK-MERGE: We should probably parse the election here and fallback to this? Do we need this?
    const election = readElectionResult.ok() as { id: string; date: string };
    electionKey = {
      id: election.id as ElectionId,
      date: new DateWithoutTime(election.date),
    };
  }

  return {
    cardType: parsedArgs.cardType,
    electionKey,
  };
}

function mockCardWrapper({ cardType, electionKey }: CommandLineArgs) {
  switch (cardType) {
    case 'vendor': {
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'vendor',
              jurisdiction: DEV_JURISDICTION,
            },
          },
        },
        pin: '000000',
      });
      break;
    }
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
      assert(electionKey !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'election_manager',
              jurisdiction: DEV_JURISDICTION,
              electionKey,
            },
          },
        },
        pin: '000000',
      });
      break;
    }
    case 'poll-worker': {
      assert(electionKey !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'poll_worker',
              jurisdiction: DEV_JURISDICTION,
              electionKey,
            },
            hasPin: false,
          },
        },
      });
      break;
    }
    case 'poll-worker-with-pin': {
      assert(electionKey !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            user: {
              role: 'poll_worker',
              jurisdiction: DEV_JURISDICTION,
              electionKey,
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
          cardDetails: {
            user: undefined,
            reason: 'unprogrammed_or_invalid_card',
          },
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
    const commandLineArgs = await parseCommandLineArgs(args);
    mockCardWrapper(commandLineArgs);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
