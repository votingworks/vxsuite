import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseCardDetailsFromCert,
  parseCert,
  parseCommonAccessCardFields,
} from './common_access_card_certs';

test('parseCommonAccessCardFields', () => {
  expect(
    parseCommonAccessCardFields({
      C: 'US',
      O: 'U.S. Government',
      OU: 'USA',
      CN: 'AIKINS.ROBERT.EDDIE.1404922102',
    })
  ).toEqual({
    id: '1404922102',
    givenName: 'ROBERT',
    familyName: 'AIKINS',
    middleName: 'EDDIE',
    jurisdiction: 'USA',
  });
});

test('parseCert', async () => {
  expect(
    await parseCert(await readFile(join(__dirname, './cac-dev-cert.pem')))
  ).toEqual({
    commonAccessCardId: '1404921289',
    givenName: 'MICHAEL',
    middleName: 'ANDREW',
    familyName: 'AIELLO',
  });
});

test('parseCardDetailsFromCert', async () => {
  expect(
    await parseCardDetailsFromCert(
      await readFile(join(__dirname, './cac-dev-cert.pem'))
    )
  ).toEqual({
    commonAccessCardId: '1404921289',
    givenName: 'MICHAEL',
    middleName: 'ANDREW',
    familyName: 'AIELLO',
  });
});
