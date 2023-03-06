import { Buffer } from 'buffer';
import { mockOf } from '@votingworks/test-utils';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  User,
} from '@votingworks/types';

import {
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
  CustomCertFields,
  parseCert,
  parseUserDataFromCert,
} from './certs';
import { openssl } from './openssl';

jest.mock('./openssl');

const mockCert = Buffer.from([]);
const mockElectionHash =
  '43939f8d6b94dd85827c1d151d0b75f4617e934979d53b6d5ce2abf4535a93d4';
const mockJurisdiction = 'ST.Jurisdiction';

test.each<{ subject: string; expectedCustomCertFields: CustomCertFields }>([
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = em, ' +
      `1.3.6.1.4.1.59817.4 = ${mockElectionHash}`,
    expectedCustomCertFields: {
      component: 'card',
      jurisdiction: mockJurisdiction,
      cardType: 'em',
      electionHash: mockElectionHash,
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = sa',
    expectedCustomCertFields: {
      component: 'card',
      jurisdiction: mockJurisdiction,
      cardType: 'sa',
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = admin, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}`,
    expectedCustomCertFields: {
      component: 'admin',
      jurisdiction: mockJurisdiction,
    },
  },
])('parseCert', async ({ subject, expectedCustomCertFields }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  expect(await parseCert(mockCert)).toEqual(expectedCustomCertFields);
});

test.each<{ description: string; subject: string }>([
  {
    description: 'invalid component',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = invalid-component, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}`,
  },
  {
    description: 'invalid card type',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = invalid-card-type',
  },
  {
    description: 'missing component',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}`,
  },
  {
    description: 'missing jurisdiction',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = admin',
  },
])('parseCert validation, $description', async ({ subject }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  await expect(parseCert(mockCert)).rejects.toThrow();
});

test.each<{ subject: string; expectedUserData: User }>([
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = sa',
    expectedUserData: {
      role: 'system_administrator',
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = em, ' +
      `1.3.6.1.4.1.59817.4 = ${mockElectionHash}`,
    expectedUserData: {
      role: 'election_manager',
      electionHash: mockElectionHash,
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = pw, ' +
      `1.3.6.1.4.1.59817.4 = ${mockElectionHash}`,
    expectedUserData: {
      role: 'poll_worker',
      electionHash: mockElectionHash,
    },
  },
])('parseUserDataFromCert', async ({ subject, expectedUserData }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  expect(await parseUserDataFromCert(mockCert, mockJurisdiction)).toEqual(
    expectedUserData
  );
});

test.each<{ description: string; subject: string }>([
  {
    description: 'machine cert instead of card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = admin, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}`,
  },
  {
    description: 'wrong jurisdiction',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ST.WrongJurisdiction, ` +
      '1.3.6.1.4.1.59817.3 = sa',
  },
  {
    description: 'missing card type',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}`,
  },
  {
    description: 'missing election hash for election card',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${mockJurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = em',
  },
])('parseUserDataFromCert validation, $description', async ({ subject }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  await expect(
    parseUserDataFromCert(mockCert, mockJurisdiction)
  ).rejects.toThrow();
});

test.each<{
  user: SystemAdministratorUser | ElectionManagerUser | PollWorkerUser;
  expectedSubject: string;
}>([
  {
    user: {
      role: 'system_administrator',
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${mockJurisdiction}` +
      '/1.3.6.1.4.1.59817.3=sa/',
  },
  {
    user: {
      role: 'election_manager',
      electionHash: mockElectionHash,
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${mockJurisdiction}` +
      '/1.3.6.1.4.1.59817.3=em' +
      `/1.3.6.1.4.1.59817.4=${mockElectionHash}/`,
  },
  {
    user: {
      role: 'poll_worker',
      electionHash: mockElectionHash,
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${mockJurisdiction}` +
      '/1.3.6.1.4.1.59817.3=pw' +
      `/1.3.6.1.4.1.59817.4=${mockElectionHash}/`,
  },
])('constructCardCertSubject', ({ user, expectedSubject }) => {
  expect(constructCardCertSubject(user, mockJurisdiction)).toEqual(
    expectedSubject
  );
});

test('constructCardCertSubjectWithoutJurisdictionAndCardType', () => {
  expect(constructCardCertSubjectWithoutJurisdictionAndCardType()).toEqual(
    '/C=US/ST=CA/O=VotingWorks/1.3.6.1.4.1.59817.1=card/'
  );
});
