import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import type {
  CandidateContest,
  Party,
  PollingPlace,
  Precinct,
  YesNoContest,
} from '@votingworks/types';
import {
  validateContest,
  validateDistrictChanges,
  validatePartyChanges,
  validatePollingPlace,
  validatePrecinct,
} from './validation.js';

const d1 = { id: 'd1', name: 'District 1' };
const d2 = { id: 'd2', name: 'District 2' };

test('validateDistrictChanges checks the final state of the batch', () => {
  expect(
    validateDistrictChanges([d1], { added: [{ id: 'd3', name: 'District 1' }] })
  ).toEqual(err({ code: 'duplicate-name', districtId: 'd3' }));
  expect(
    validateDistrictChanges([d1, d2], {
      updated: [{ ...d2, name: 'District 1' }],
    })
  ).toEqual(err({ code: 'duplicate-name', districtId: 'd2' }));
  expect(
    validateDistrictChanges([d1], {
      deletedIds: ['d1'],
      added: [{ id: 'd3', name: 'District 1' }],
    })
  ).toEqual(ok());
  expect(
    validateDistrictChanges([d1, d2], {
      updated: [
        { ...d1, name: 'District 2' },
        { ...d2, name: 'District 1' },
      ],
    })
  ).toEqual(ok());
  expect(
    validateDistrictChanges([d1], {
      added: [
        { id: 'd3', name: 'New' },
        { id: 'd4', name: 'New' },
      ],
    })
  ).toEqual(err({ code: 'duplicate-name', districtId: 'd4' }));
  expect(
    validateDistrictChanges([d1, d2], {
      updated: [{ id: 'missing', name: 'District 2' }],
    })
  ).toEqual(ok());
  expect(
    validateDistrictChanges([d1, d2], {
      updated: [
        { ...d1, name: 'Same' },
        { ...d2, name: 'Same' },
      ],
    })
  ).toEqual(err({ code: 'duplicate-name', districtId: 'd2' }));
});

test('validatePartyChanges checks name, then full name, then abbreviation', () => {
  const dem: Party = {
    id: 'p1',
    name: 'Democrat',
    fullName: 'Democratic Party',
    abbrev: 'D',
  };
  expect(
    validatePartyChanges([dem], { added: [{ ...dem, id: 'p2' }] })
  ).toEqual(err({ code: 'duplicate-name', partyId: 'p2' }));
  expect(
    validatePartyChanges([dem], {
      added: [{ ...dem, id: 'p2', name: 'Other' }],
    })
  ).toEqual(err({ code: 'duplicate-full-name', partyId: 'p2' }));
  expect(
    validatePartyChanges([dem], {
      added: [
        { id: 'p2', name: 'Other', fullName: 'Other Party', abbrev: 'D' },
      ],
    })
  ).toEqual(err({ code: 'duplicate-abbrev', partyId: 'p2' }));
  expect(validatePartyChanges([dem], { updated: [dem] })).toEqual(ok());
});

test('validatePrecinct checks name, then split districts, then split names', () => {
  const p1: Precinct = { id: 'p1', name: 'Precinct 1', districtIds: [] };
  expect(
    validatePrecinct([p1], { id: 'p2', name: 'Precinct 1', districtIds: [] })
  ).toEqual(err('duplicate-precinct-name'));
  expect(validatePrecinct([p1], p1)).toEqual(ok());
  expect(
    validatePrecinct([], {
      id: 'p2',
      name: 'Precinct 2',
      splits: [
        { id: 's1', name: 'A', districtIds: ['d1', 'd2'] },
        { id: 's2', name: 'A', districtIds: ['d2', 'd1'] },
      ],
    })
  ).toEqual(err('duplicate-split-districts'));
  expect(
    validatePrecinct([], {
      id: 'p2',
      name: 'Precinct 2',
      splits: [
        { id: 's1', name: 'A', districtIds: ['d1'] },
        { id: 's2', name: 'A', districtIds: ['d2'] },
      ],
    })
  ).toEqual(err('duplicate-split-name'));
});

const mayor: CandidateContest = {
  id: 'c1',
  type: 'candidate',
  districtId: 'd1',
  title: 'Mayor',
  seats: 1,
  allowWriteIns: true,
  candidates: [],
};

const measure: YesNoContest = {
  id: 'c2',
  type: 'yesno',
  districtId: 'd1',
  title: 'Question',
  description: 'Question?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
};

test('validateContest treats missing fields as equal', () => {
  expect(validateContest([mayor], { ...mayor, id: 'c3' })).toEqual(
    err('duplicate-contest')
  );
  expect(
    validateContest([mayor], { ...mayor, id: 'c3', termDescription: '2 years' })
  ).toEqual(ok());
  expect(validateContest([mayor], { ...mayor, id: 'c3', seats: 2 })).toEqual(
    ok()
  );
  expect(validateContest([mayor], mayor)).toEqual(ok());
  expect(validateContest([measure], { ...measure, id: 'c3' })).toEqual(
    err('duplicate-contest')
  );
  expect(
    validateContest(
      [
        {
          id: 'sp',
          type: 'straight-party',
          title: 'Mayor',
          districtId: 'd1',
          optionIds: [],
        },
      ],
      mayor
    )
  ).toEqual(ok());
});

test('validateContest checks options and candidates', () => {
  expect(
    validateContest([], {
      ...measure,
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'Yes' },
      ],
    })
  ).toEqual(err('duplicate-option'));
  const candidate = {
    id: 'a',
    name: 'Ann Alpha',
    firstName: 'Ann',
    lastName: 'Alpha',
  };
  expect(
    validateContest([], {
      ...mayor,
      candidates: [candidate, { ...candidate, id: 'b' }],
    })
  ).toEqual(err('duplicate-candidate'));
  expect(
    validateContest([], {
      ...mayor,
      candidates: [candidate, { ...candidate, id: 'b', middleName: 'B' }],
    })
  ).toEqual(ok());
});

test('validatePollingPlace checks name per type and precincts', () => {
  const hall: PollingPlace = {
    id: 'pp1',
    name: 'Hall',
    type: 'election_day',
    precincts: { p1: { type: 'whole' } },
  };
  const precincts: Precinct[] = [{ id: 'p1', name: 'P1', districtIds: [] }];
  expect(validatePollingPlace([], precincts, hall)).toEqual(ok());
  expect(validatePollingPlace([hall], precincts, hall)).toEqual(ok());
  expect(
    validatePollingPlace([hall], precincts, { ...hall, id: 'pp2' })
  ).toEqual(err('duplicate-name'));
  expect(
    validatePollingPlace([hall], precincts, {
      ...hall,
      id: 'pp2',
      type: 'absentee',
    })
  ).toEqual(ok());
  expect(
    validatePollingPlace([], precincts, {
      ...hall,
      precincts: { missing: { type: 'whole' } },
    })
  ).toEqual(err('invalid-precinct'));
});
