import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSystemAdministratorUser,
  mockVendorUser,
} from '@votingworks/test-utils';

import { constructElectionKey } from '@votingworks/types';
import {
  deserializeMockFileContents,
  MOCK_FILE_PATH,
  mockCard,
  MockFileCard,
  MockFileContents,
  serializeMockFileContents,
} from './mock_file_card';

const electionKey = constructElectionKey(readElectionGeneral());
const pin = '123456';
const wrongPin = '234567';

const vendorUser = mockVendorUser();
const systemAdministratorUser = mockSystemAdministratorUser();
const electionManagerUser = mockElectionManagerUser({ electionKey });
const pollWorkerUser = mockPollWorkerUser({ electionKey });

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
        user: vendorUser,
      },
    },
    data: undefined,
    pin,
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
    data: undefined,
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
        user: vendorUser,
      },
    },
    pin,
  });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: vendorUser,
    },
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
      cardDetails: {
        user: undefined,
        reason: 'unprogrammed_or_invalid_card',
      },
    },
  });

  await card.program({ user: vendorUser, pin });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: vendorUser,
    },
  });
  expect(await card.checkPin(pin)).toEqual({ response: 'correct' });

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
    cardDetails: {
      user: undefined,
      reason: 'unprogrammed_or_invalid_card',
    },
  });

  await card.program({ user: electionManagerUser, pin });
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: electionManagerUser,
    },
  });
  expect(await card.checkPin(pin)).toEqual({ response: 'correct' });

  await card.unprogram();
  expect(await card.getCardStatus()).toEqual({
    status: 'ready',
    cardDetails: {
      user: undefined,
      reason: 'unprogrammed_or_invalid_card',
    },
  });

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

  expect(await card.readData()).toEqual(Buffer.of());
  await card.writeData(Buffer.from('Hey! How is it going?', 'utf-8'));
  expect((await card.readData()).toString('utf-8')).toEqual(
    'Hey! How is it going?'
  );
  await card.clearData();
  expect(await card.readData()).toEqual(Buffer.of());
});

test('MockFileCard resiliency to deletion of underlying file', async () => {
  const card = new MockFileCard();
  fs.rmSync(MOCK_FILE_PATH);
  expect(await card.getCardStatus()).toEqual({
    status: 'no_card',
  });
});

test('MockFileCard resiliency to underlying file that cannot be parsed', async () => {
  const card = new MockFileCard();
  fs.writeFileSync(MOCK_FILE_PATH, 'Not valid JSON');
  expect(await card.getCardStatus()).toEqual({
    status: 'no_card',
  });
});

test('MockFileCard disconnect does nothing', async () => {
  const card = new MockFileCard();
  await card.disconnect();
});
