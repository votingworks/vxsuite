import { Buffer } from 'buffer';
import { mockOf } from '@votingworks/test-utils';
import { TEST_JURISDICTION } from '@votingworks/types';

import { CardDetails } from './card';
import {
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
  constructMachineCertSubject,
  CustomCertFields,
  MachineType,
  parseCardDetailsFromCert,
  parseCert,
} from './certs';
import { openssl } from './cryptography';

jest.mock('./cryptography');

const cert = Buffer.of();
const electionHash =
  '43939f8d6b94dd85827c1d151d0b75f4617e934979d53b6d5ce2abf4535a93d4';
const jurisdiction = TEST_JURISDICTION;

test.each<{ subject: string; expectedCustomCertFields: CustomCertFields }>([
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager, ' +
      `1.3.6.1.4.1.59817.4 = ${electionHash}`,
    expectedCustomCertFields: {
      component: 'card',
      jurisdiction,
      cardType: 'election-manager',
      electionHash,
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = system-administrator',
    expectedCustomCertFields: {
      component: 'card',
      jurisdiction,
      cardType: 'system-administrator',
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = admin, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}`,
    expectedCustomCertFields: {
      component: 'admin',
      jurisdiction,
    },
  },
])('parseCert', async ({ subject, expectedCustomCertFields }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  expect(await parseCert(cert)).toEqual(expectedCustomCertFields);
});

test.each<{ description: string; subject: string }>([
  {
    description: 'invalid component',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = invalid-component, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}`,
  },
  {
    description: 'invalid card type',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = invalid-card-type',
  },
  {
    description: 'missing component',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}`,
  },
  {
    description: 'missing jurisdiction on VxAdmin cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = admin',
  },
  {
    description: 'missing jurisdiction on card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card',
  },
  {
    description: 'missing card type on card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}`,
  },
  {
    description: 'missing election hash on election card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager',
  },
])('parseCert validation - $description', async ({ subject }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  await expect(parseCert(cert)).rejects.toThrow();
});

test.each<{
  subject: string;
  expectedCardDetails: CardDetails;
}>([
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = system-administrator',
    expectedCardDetails: {
      user: { role: 'system_administrator', jurisdiction },
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager, ' +
      `1.3.6.1.4.1.59817.4 = ${electionHash}`,
    expectedCardDetails: {
      user: { role: 'election_manager', jurisdiction, electionHash },
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = poll-worker, ' +
      `1.3.6.1.4.1.59817.4 = ${electionHash}`,
    expectedCardDetails: {
      user: { role: 'poll_worker', jurisdiction, electionHash },
      hasPin: false,
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = poll-worker-with-pin, ' +
      `1.3.6.1.4.1.59817.4 = ${electionHash}`,
    expectedCardDetails: {
      user: { role: 'poll_worker', jurisdiction, electionHash },
      hasPin: true,
    },
  },
])('parseUserDataFromCert', async ({ subject, expectedCardDetails }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  expect(await parseCardDetailsFromCert(cert)).toEqual(expectedCardDetails);
});

test.each<{ description: string; subject: string }>([
  {
    description: 'machine cert instead of card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = admin, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}`,
  },
  {
    description: 'missing card type',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}`,
  },
  {
    description: 'missing election hash for election card',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager',
  },
])('parseUserDataFromCert validation - $description', async ({ subject }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  await expect(parseCardDetailsFromCert(cert)).rejects.toThrow();
});

test.each<{
  cardDetails: CardDetails;
  expectedSubject: string;
}>([
  {
    cardDetails: {
      user: { role: 'system_administrator', jurisdiction },
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=system-administrator/',
  },
  {
    cardDetails: {
      user: { role: 'election_manager', jurisdiction, electionHash },
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=election-manager' +
      `/1.3.6.1.4.1.59817.4=${electionHash}/`,
  },
  {
    cardDetails: {
      user: { role: 'poll_worker', jurisdiction, electionHash },
      hasPin: false,
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=poll-worker' +
      `/1.3.6.1.4.1.59817.4=${electionHash}/`,
  },
  {
    cardDetails: {
      user: { role: 'poll_worker', jurisdiction, electionHash },
      hasPin: true,
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=poll-worker-with-pin' +
      `/1.3.6.1.4.1.59817.4=${electionHash}/`,
  },
])('constructCardCertSubject', ({ cardDetails, expectedSubject }) => {
  expect(constructCardCertSubject(cardDetails)).toEqual(expectedSubject);
});

test('constructCardCertSubjectWithoutJurisdictionAndCardType', () => {
  expect(constructCardCertSubjectWithoutJurisdictionAndCardType()).toEqual(
    '/C=US/ST=CA/O=VotingWorks/1.3.6.1.4.1.59817.1=card/'
  );
});

test.each<{
  machineType: MachineType;
  jurisdiction?: string;
  expectedSubject: string;
}>([
  {
    machineType: 'admin',
    jurisdiction,
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=admin' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}/`,
  },
  {
    machineType: 'central-scan',
    jurisdiction: undefined,
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks/1.3.6.1.4.1.59817.1=central-scan/',
  },
  {
    machineType: 'mark',
    jurisdiction: undefined,
    expectedSubject: '/C=US/ST=CA/O=VotingWorks/1.3.6.1.4.1.59817.1=mark/',
  },
  {
    machineType: 'mark-scan',
    jurisdiction: undefined,
    expectedSubject: '/C=US/ST=CA/O=VotingWorks/1.3.6.1.4.1.59817.1=mark-scan/',
  },
  {
    machineType: 'scan',
    jurisdiction: undefined,
    expectedSubject: '/C=US/ST=CA/O=VotingWorks/1.3.6.1.4.1.59817.1=scan/',
  },
])(
  'constructMachineCertSubject - $machineType',
  ({ machineType, jurisdiction: testCaseJurisdiction, expectedSubject }) => {
    expect(
      constructMachineCertSubject(machineType, testCaseJurisdiction)
    ).toEqual(expectedSubject);
  }
);

test.each<{
  description: string;
  machineType: MachineType;
  jurisdiction?: string;
}>([
  {
    description: 'missing jurisdiction for VxAdmin',
    machineType: 'admin',
    jurisdiction: undefined,
  },
  {
    description: 'provided unneeded jurisdiction for VxCentralScan',
    machineType: 'central-scan',
    jurisdiction,
  },
  {
    description: 'provided unneeded jurisdiction for VxMark',
    machineType: 'mark',
    jurisdiction,
  },
  {
    description: 'provided unneeded jurisdiction for VxMarkScan',
    machineType: 'mark-scan',
    jurisdiction,
  },
  {
    description: 'provided unneeded jurisdiction for VxScan',
    machineType: 'scan',
    jurisdiction,
  },
])(
  'constructMachineCertSubject validation - $description',
  ({ machineType, jurisdiction: testCaseJurisdiction }) => {
    expect(() =>
      constructMachineCertSubject(machineType, testCaseJurisdiction)
    ).toThrow();
  }
);
