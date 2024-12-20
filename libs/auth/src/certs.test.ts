import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { DateWithoutTime } from '@votingworks/basics';
import { mockOf } from '@votingworks/test-utils';
import {
  DEV_MACHINE_ID,
  ElectionId,
  ElectionKey,
  TEST_JURISDICTION,
} from '@votingworks/types';

import { CardDetails, ProgrammedCardDetails } from './card';
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

vi.mock('./cryptography');

const cert = Buffer.of();
const electionId = 'rhr6fw5qb077';
const electionDate = '2024-07-10';
const electionKey: ElectionKey = {
  id: electionId as ElectionId,
  date: new DateWithoutTime(electionDate),
};
const jurisdiction = TEST_JURISDICTION;

test.each<{ subject: string; expectedCustomCertFields: CustomCertFields }>([
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = admin, ' +
      `1.3.6.1.4.1.59817.6 = ${DEV_MACHINE_ID}, ` +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}`,
    expectedCustomCertFields: {
      component: 'admin',
      machineId: DEV_MACHINE_ID,
      jurisdiction,
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
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager, ' +
      `1.3.6.1.4.1.59817.4 = ${electionId}, ` +
      `1.3.6.1.4.1.59817.5 = ${electionDate}`,
    expectedCustomCertFields: {
      component: 'card',
      jurisdiction,
      cardType: 'election-manager',
      electionId,
      electionDate,
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
      `1.3.6.1.4.1.59817.1 = admin, ` +
      `1.3.6.1.4.1.59817.6 = ${DEV_MACHINE_ID}`,
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
    description: 'missing election id and date on election card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager',
  },
  {
    description: 'missing election date on election card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager, ' +
      `1.3.6.1.4.1.59817.4 = ${electionId}`,
  },
  {
    description: 'missing election id on election card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager, ' +
      `1.3.6.1.4.1.59817.5 = ${electionDate}`,
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
      '1.3.6.1.4.1.59817.3 = vendor',
    expectedCardDetails: {
      user: { role: 'vendor', jurisdiction },
    },
  },
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
      `1.3.6.1.4.1.59817.4 = ${electionId}, ` +
      `1.3.6.1.4.1.59817.5 = ${electionDate}`,
    expectedCardDetails: {
      user: { role: 'election_manager', jurisdiction, electionKey },
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = poll-worker, ' +
      `1.3.6.1.4.1.59817.4 = ${electionId}, ` +
      `1.3.6.1.4.1.59817.5 = ${electionDate}`,
    expectedCardDetails: {
      user: { role: 'poll_worker', jurisdiction, electionKey },
      hasPin: false,
    },
  },
  {
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = poll-worker-with-pin, ' +
      `1.3.6.1.4.1.59817.4 = ${electionId}, ` +
      `1.3.6.1.4.1.59817.5 = ${electionDate}`,
    expectedCardDetails: {
      user: { role: 'poll_worker', jurisdiction, electionKey },
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
      `1.3.6.1.4.1.59817.6 = ${DEV_MACHINE_ID}, ` +
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
    description: 'missing election id and date for election card',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager',
  },
  {
    description: 'missing election date on election card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager, ' +
      `1.3.6.1.4.1.59817.4 = ${electionId}`,
  },
  {
    description: 'missing election id on election card cert',
    subject:
      'subject=C = US, ST = CA, O = VotingWorks, ' +
      '1.3.6.1.4.1.59817.1 = card, ' +
      `1.3.6.1.4.1.59817.2 = ${jurisdiction}, ` +
      '1.3.6.1.4.1.59817.3 = election-manager, ' +
      `1.3.6.1.4.1.59817.5 = ${electionDate}`,
  },
])('parseUserDataFromCert validation - $description', async ({ subject }) => {
  mockOf(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  await expect(parseCardDetailsFromCert(cert)).rejects.toThrow();
});

test.each<{
  cardDetails: ProgrammedCardDetails;
  expectedSubject: string;
}>([
  {
    cardDetails: {
      user: { role: 'vendor', jurisdiction },
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=vendor/',
  },
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
      user: { role: 'election_manager', jurisdiction, electionKey },
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=election-manager' +
      `/1.3.6.1.4.1.59817.4=${electionId}` +
      `/1.3.6.1.4.1.59817.5=${electionDate}/`,
  },
  {
    cardDetails: {
      user: { role: 'poll_worker', jurisdiction, electionKey },
      hasPin: false,
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=poll-worker' +
      `/1.3.6.1.4.1.59817.4=${electionId}` +
      `/1.3.6.1.4.1.59817.5=${electionDate}/`,
  },
  {
    cardDetails: {
      user: { role: 'poll_worker', jurisdiction, electionKey },
      hasPin: true,
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=poll-worker-with-pin' +
      `/1.3.6.1.4.1.59817.4=${electionId}` +
      `/1.3.6.1.4.1.59817.5=${electionDate}/`,
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
      `/1.3.6.1.4.1.59817.6=${DEV_MACHINE_ID}` +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}/`,
  },
  {
    machineType: 'central-scan',
    jurisdiction: undefined,
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=central-scan' +
      `/1.3.6.1.4.1.59817.6=${DEV_MACHINE_ID}/`,
  },
  {
    machineType: 'mark',
    jurisdiction: undefined,
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=mark' +
      `/1.3.6.1.4.1.59817.6=${DEV_MACHINE_ID}/`,
  },
  {
    machineType: 'mark-scan',
    jurisdiction: undefined,
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=mark-scan' +
      `/1.3.6.1.4.1.59817.6=${DEV_MACHINE_ID}/`,
  },
  {
    machineType: 'scan',
    jurisdiction: undefined,
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=scan' +
      `/1.3.6.1.4.1.59817.6=${DEV_MACHINE_ID}/`,
  },
])(
  'constructMachineCertSubject - $machineType',
  ({ machineType, jurisdiction: testCaseJurisdiction, expectedSubject }) => {
    expect(
      constructMachineCertSubject({
        machineType,
        machineId: DEV_MACHINE_ID,
        jurisdiction: testCaseJurisdiction,
      })
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
      constructMachineCertSubject({
        machineType,
        machineId: DEV_MACHINE_ID,
        jurisdiction: testCaseJurisdiction,
      })
    ).toThrow();
  }
);
