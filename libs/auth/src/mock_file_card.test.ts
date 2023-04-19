import { Buffer } from 'buffer';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
} from '@votingworks/types';

import { DEV_JURISDICTION } from './constants';
import {
  deserializeMockFileContents,
  mockCard,
  MockFileCard,
  MockFileContents,
  serializeMockFileContents,
} from './mock_file_card';

const { electionData, electionHash } = electionSampleDefinition;
const pin = '123456';
const wrongPin = '234567';

const systemAdministratorUser: SystemAdministratorUser = {
  role: 'system_administrator',
  jurisdiction: DEV_JURISDICTION,
};
const electionManagerUser: ElectionManagerUser = {
  role: 'election_manager',
  jurisdiction: DEV_JURISDICTION,
  electionHash,
};
const pollWorkerUser: PollWorkerUser = {
  role: 'poll_worker',
  jurisdiction: DEV_JURISDICTION,
  electionHash,
};

test.each<MockFileContents>([
  {
    cardStatus: { status: 'no_card' },
    data: undefined,
    pin: undefined,
  },
  {
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: systemAdministratorUser,
      },
    },
    data: undefined,
    pin,
  },
  {
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: electionManagerUser,
      },
    },
    data: Buffer.from(electionData, 'utf-8'),
    pin,
  },
  {
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: pollWorkerUser,
        hasPin: false,
      },
    },
    data: undefined,
    pin: undefined,
  },
  {
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: pollWorkerUser,
        hasPin: true,
      },
    },
    data: undefined,
    pin,
  },
])('MockFileCard serialization and deserialization', (input) => {
  expect(deserializeMockFileContents(serializeMockFileContents(input))).toEqual(
    input
  );
});

test('MockFileCard basic mocking', async () => {
  const card = new MockFileCard();

  expect(await card.getCardStatus()).toEqual({
    status: 'no_card',
  });

  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: systemAdministratorUser,
      },
    },
    pin,
  });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: systemAdministratorUser,
    },
  });

  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: electionManagerUser,
      },
    },
    data: Buffer.from(electionData, 'utf-8'),
    pin,
  });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: electionManagerUser,
    },
  });

  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: pollWorkerUser,
        hasPin: false,
      },
    },
  });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: pollWorkerUser,
      hasPin: false,
    },
  });

  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: pollWorkerUser,
        hasPin: true,
      },
    },
    pin,
  });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: pollWorkerUser,
      hasPin: true,
    },
  });

  mockCard({
    cardStatus: {
      status: 'no_card',
    },
  });
  expect(await card.getCardStatus()).toEqual({
    status: 'no_card',
  });
});

test('MockFileCard PIN checking', async () => {
  const card = new MockFileCard();
  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: systemAdministratorUser,
      },
    },
    pin,
  });

  expect(await card.checkPin(pin)).toEqual({
    response: 'correct',
  });
  expect(await card.checkPin(wrongPin)).toEqual({
    response: 'incorrect',
    numIncorrectPinAttempts: 1,
  });
  expect(await card.checkPin(wrongPin)).toEqual({
    response: 'incorrect',
    numIncorrectPinAttempts: 2,
  });
});

test('MockFileCard programming', async () => {
  const card = new MockFileCard();
  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: undefined,
    },
  });

  await card.program({ user: systemAdministratorUser, pin });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: systemAdministratorUser,
    },
  });
  expect(await card.checkPin(pin)).toEqual({ response: 'correct' });

  await card.unprogram();
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: undefined,
  });

  await card.program({ user: electionManagerUser, pin, electionData });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: electionManagerUser,
    },
  });
  expect(await card.checkPin(pin)).toEqual({ response: 'correct' });
  expect((await card.readData()).toString('utf-8')).toEqual(electionData);

  await card.unprogram();
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: undefined,
  });
  expect(await card.readData()).toEqual(Buffer.from([]));

  await card.program({ user: pollWorkerUser });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: pollWorkerUser,
      hasPin: false,
    },
  });

  await card.program({ user: pollWorkerUser, pin });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: pollWorkerUser,
      hasPin: true,
    },
  });
});

test('MockFileCard data reading and writing', async () => {
  const card = new MockFileCard();
  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: pollWorkerUser,
        hasPin: false,
      },
    },
  });

  expect(await card.readData()).toEqual(Buffer.from([]));
  await card.writeData(Buffer.from('Hey! How is it going?', 'utf-8'));
  expect((await card.readData()).toString('utf-8')).toEqual(
    'Hey! How is it going?'
  );
  await card.clearData();
  expect(await card.readData()).toEqual(Buffer.from([]));
});
