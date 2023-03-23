/* eslint-disable no-console */
import { Buffer } from 'buffer';
import * as fs from 'fs';
import { sha256 } from 'js-sha256';
import yargs from 'yargs/yargs';
import { assert, Optional, throwIllegalValue } from '@votingworks/basics';
import { safeParseElection } from '@votingworks/types';

import { DEV_JURISDICTION } from '../src/certs';
import { mockCard } from '../src/mock_file_card';

const CARD_TYPES = [
  'system-administrator',
  'election-manager',
  'poll-worker',
  'poll-worker-with-pin',
  'unprogrammed',
  'no-card',
] as const;
type CardType = typeof CARD_TYPES[number];

interface MockCardInput {
  cardType: CardType;
  electionData?: string;
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
    .example('$ ./scripts/mock-card --help', '')
    .example('$ ./scripts/mock-card --card-type system-administrator', '')
    .example(
      '$ ./scripts/mock-card --card-type election-manager \\\n' +
        '--election-definition ../fixtures/data/electionFamousNames2021/election.json',
      ''
    )
    .example(
      '$ ./scripts/mock-card --card-type poll-worker \\\n' +
        '--election-definition ../fixtures/data/electionSample.json',
      ''
    )
    .example(
      '$ ./scripts/mock-card --card-type poll-worker-with-pin \\\n' +
        '--election-definition ../fixtures/data/electionSample.json',
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
    process.exit(0);
  }

  if (!args.cardType) {
    throw new Error(`Must specify card type\n\n${helpMessage}`);
  }

  let electionData: Optional<string>;
  let electionHash: Optional<string>;
  if (['election-manager', 'poll-worker'].includes(args.cardType)) {
    if (!args.electionDefinition) {
      throw new Error(
        `Must specify election definition for election manager and poll worker cards\n\n${helpMessage}`
      );
    }
    electionData = fs.readFileSync(args.electionDefinition).toString('utf-8');
    if (!safeParseElection(electionData).isOk()) {
      throw new Error(
        `${args.electionDefinition} isn't a valid election definition`
      );
    }
    electionHash = sha256(electionData);
  }

  return {
    cardType: args.cardType,
    electionData,
    electionHash,
  };
}

function mockCardWrapper({
  cardType,
  electionData,
  electionHash,
}: MockCardInput) {
  switch (cardType) {
    case 'system-administrator': {
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            jurisdiction: DEV_JURISDICTION,
            user: { role: 'system_administrator' },
          },
        },
        pin: '000000',
      });
      break;
    }
    case 'election-manager': {
      assert(electionHash !== undefined);
      assert(electionData !== undefined);
      mockCard({
        cardStatus: {
          status: 'ready',
          cardDetails: {
            jurisdiction: DEV_JURISDICTION,
            user: { role: 'election_manager', electionHash },
          },
        },
        data: Buffer.from(electionData, 'utf-8'),
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
            jurisdiction: DEV_JURISDICTION,
            user: { role: 'poll_worker', electionHash },
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
            jurisdiction: DEV_JURISDICTION,
            user: { role: 'poll_worker', electionHash },
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
    console.error(error instanceof Error ? `❌ ${error.message}` : error);
    process.exit(1);
  }
  process.exit(0);
}
