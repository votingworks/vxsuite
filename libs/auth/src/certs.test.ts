import { Buffer } from 'node:buffer';
import { expect, test, vi } from 'vitest';
import { DateWithoutTime } from '@votingworks/basics';
import {
  DEV_MACHINE_ID,
  ElectionId,
  ElectionKey,
  TEST_JURISDICTION,
} from '@votingworks/types';

import { ProgrammedCardDetails } from './card';
import {
  CardCustomCertFields,
  certDetailsToCardDetails,
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
  constructMachineCertSubject,
  CustomCertFields,
  MachineCustomCertFields,
  MachineType,
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
  vi.mocked(openssl).mockImplementationOnce(() =>
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
  vi.mocked(openssl).mockImplementationOnce(() =>
    Promise.resolve(Buffer.from(subject, 'utf-8'))
  );
  await expect(parseCert(cert)).rejects.toThrow();
});

test.each<{
  description: string;
  cardIdentityCertDetails: CardCustomCertFields;
  programmingMachineCertAuthorityCertDetails?: MachineCustomCertFields;
  expectedProgrammedCardDetails: ProgrammedCardDetails;
}>([
  {
    description: 'vendor user',
    cardIdentityCertDetails: {
      component: 'card',
      jurisdiction,
      cardType: 'vendor',
    },
    expectedProgrammedCardDetails: {
      user: {
        role: 'vendor',
        jurisdiction,
      },
    },
  },
  {
    description: 'system administrator',
    cardIdentityCertDetails: {
      component: 'card',
      jurisdiction,
      cardType: 'system-administrator',
    },
    programmingMachineCertAuthorityCertDetails: {
      component: 'admin',
      jurisdiction,
      machineId: DEV_MACHINE_ID,
    },
    expectedProgrammedCardDetails: {
      user: {
        role: 'system_administrator',
        jurisdiction,
        programmingMachineType: 'admin',
      },
    },
  },
  {
    description: 'election manager',
    cardIdentityCertDetails: {
      component: 'card',
      jurisdiction,
      cardType: 'election-manager',
      electionId,
      electionDate,
    },
    programmingMachineCertAuthorityCertDetails: {
      component: 'admin',
      jurisdiction,
      machineId: DEV_MACHINE_ID,
    },
    expectedProgrammedCardDetails: {
      user: {
        role: 'election_manager',
        jurisdiction,
        programmingMachineType: 'admin',
        electionKey: {
          id: electionId as ElectionId,
          date: new DateWithoutTime(electionDate),
        },
      },
    },
  },
  {
    description: 'poll worker',
    cardIdentityCertDetails: {
      component: 'card',
      jurisdiction,
      cardType: 'poll-worker',
      electionId,
      electionDate,
    },
    programmingMachineCertAuthorityCertDetails: {
      component: 'admin',
      jurisdiction,
      machineId: DEV_MACHINE_ID,
    },
    expectedProgrammedCardDetails: {
      user: {
        role: 'poll_worker',
        jurisdiction,
        programmingMachineType: 'admin',
        electionKey: {
          id: electionId as ElectionId,
          date: new DateWithoutTime(electionDate),
        },
      },
      hasPin: false,
    },
  },
  {
    description: 'poll worker with PIN',
    cardIdentityCertDetails: {
      component: 'card',
      jurisdiction,
      cardType: 'poll-worker-with-pin',
      electionId,
      electionDate,
    },
    programmingMachineCertAuthorityCertDetails: {
      component: 'admin',
      jurisdiction,
      machineId: DEV_MACHINE_ID,
    },
    expectedProgrammedCardDetails: {
      user: {
        role: 'poll_worker',
        jurisdiction,
        programmingMachineType: 'admin',
        electionKey: {
          id: electionId as ElectionId,
          date: new DateWithoutTime(electionDate),
        },
      },
      hasPin: true,
    },
  },
  {
    description: 'VxPollBook user',
    cardIdentityCertDetails: {
      component: 'card',
      jurisdiction,
      cardType: 'system-administrator',
    },
    programmingMachineCertAuthorityCertDetails: {
      component: 'poll-book',
      jurisdiction,
      machineId: DEV_MACHINE_ID,
    },
    expectedProgrammedCardDetails: {
      user: {
        role: 'system_administrator',
        jurisdiction,
        programmingMachineType: 'poll-book',
      },
    },
  },
])(
  'certDetailsToCardDetails - $description',
  ({
    cardIdentityCertDetails,
    programmingMachineCertAuthorityCertDetails,
    expectedProgrammedCardDetails,
  }) => {
    expect(
      certDetailsToCardDetails(
        cardIdentityCertDetails,
        programmingMachineCertAuthorityCertDetails
      )
    ).toEqual(expectedProgrammedCardDetails);
  }
);

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
      user: {
        role: 'system_administrator',
        jurisdiction,
        programmingMachineType: 'admin',
      },
    },
    expectedSubject:
      '/C=US/ST=CA/O=VotingWorks' +
      '/1.3.6.1.4.1.59817.1=card' +
      `/1.3.6.1.4.1.59817.2=${jurisdiction}` +
      '/1.3.6.1.4.1.59817.3=system-administrator/',
  },
  {
    cardDetails: {
      user: {
        role: 'election_manager',
        jurisdiction,
        programmingMachineType: 'admin',
        electionKey,
      },
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
      user: {
        role: 'poll_worker',
        jurisdiction,
        programmingMachineType: 'admin',
        electionKey,
      },
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
      user: {
        role: 'poll_worker',
        jurisdiction,
        programmingMachineType: 'admin',
        electionKey,
      },
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
    description: 'missing jurisdiction for VxPollBook',
    machineType: 'poll-book',
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
