import cloneDeep from 'lodash.clonedeep';
import set from 'lodash.set';
import { ok } from '@votingworks/basics';
import {
  election,
  electionTwoPartyPrimary,
  primaryElection,
} from '../../../test/election';
import { safeParseElection } from '../../election_parsing';
import {
  convertCdfBallotDefinitionToVxfElection,
  convertVxfElectionToCdfBallotDefinition,
  safeParseCdfBallotDefinition,
} from './convert';
import {
  normalizeVxf,
  testCdfBallotDefinition,
  testVxfElection,
} from './fixtures';
import { ElectionStringKey, LanguageCode, UiStringsPackage } from '../..';
import * as Cdf from '.';

function languageString(
  content: string,
  language: LanguageCode
): Cdf.LanguageString {
  return {
    '@type': 'BallotDefinition.LanguageString',
    Content: content,
    Language: language,
  };
}

test('VXF fixture is valid', () => {
  expect(safeParseElection(election)).toEqual(ok(election));
});

test('convertVxfElectionToCdfBallotDefinition', () => {
  expect(convertVxfElectionToCdfBallotDefinition(testVxfElection, {})).toEqual(
    testCdfBallotDefinition
  );
});

test('convertVxfElectionToCdfBallotDefinition with translated election strings', () => {
  const translatedElectionStrings: UiStringsPackage = {
    [LanguageCode.SPANISH]: {
      [ElectionStringKey.CANDIDATE_NAME]: {
        'candidate-1': 'Sherlock Holmes',
        'candidate-2': 'Thomas Edison',
        'candidate-3': 'Winston Churchill',
      },
      [ElectionStringKey.CONTEST_DESCRIPTION]: {
        'contest-2': '¿Deberíamos hacer esto?',
      },
      [ElectionStringKey.CONTEST_OPTION_LABEL]: {
        'contest-2-option-yes': 'Sí',
        'contest-2-option-no': 'No',
      },
      [ElectionStringKey.CONTEST_TITLE]: {
        'contest-1': 'Alcalde',
        'contest-2': 'Proposición 1',
        'contest-3': 'Controlador',
      },
      [ElectionStringKey.COUNTY_NAME]: 'Condado de Franklin',
      [ElectionStringKey.DISTRICT_NAME]: {
        'district-1': 'Ciudad de Lincoln',
        'district-2': 'Ciudad de Washington',
      },
      [ElectionStringKey.ELECTION_TITLE]:
        'Elección General Municipal de Lincoln',
      [ElectionStringKey.PARTY_FULL_NAME]: {
        'party-1': 'Partido Democrático',
        'party-2': 'Partido Republicano',
      },
      [ElectionStringKey.PARTY_NAME]: {
        'party-1': 'Demócrata',
        'party-2': 'Republicano',
      },
      [ElectionStringKey.PRECINCT_NAME]: {
        'precinct-1': 'Norte de Lincoln',
        'precinct-2': 'Sur de Lincoln',
      },
      [ElectionStringKey.STATE_NAME]: 'Estado de Hamilton',
    },
    [LanguageCode.CHINESE_SIMPLIFIED]: {
      [ElectionStringKey.CANDIDATE_NAME]: {
        'candidate-1': 'Sherlock Holmes',
        'candidate-2': 'Thomas Edison',
        'candidate-3': 'Winston Churchill',
      },
    },
  };

  const expectedCdfBallotDefinition = cloneDeep(testCdfBallotDefinition);

  // Candidate names
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Candidate', 0, 'BallotName', 'Text'],
    [
      languageString('Sherlock Holmes', LanguageCode.CHINESE_SIMPLIFIED),
      languageString('Sherlock Holmes', LanguageCode.ENGLISH),
      languageString('Sherlock Holmes', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Candidate', 1, 'BallotName', 'Text'],
    [
      languageString('Thomas Edison', LanguageCode.CHINESE_SIMPLIFIED),
      languageString('Thomas Edison', LanguageCode.ENGLISH),
      languageString('Thomas Edison', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Candidate', 2, 'BallotName', 'Text'],
    [
      languageString('Winston Churchill', LanguageCode.CHINESE_SIMPLIFIED),
      languageString('Winston Churchill', LanguageCode.ENGLISH),
      languageString('Winston Churchill', LanguageCode.SPANISH),
    ]
  );

  // Contest descriptions
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 1, 'FullText', 'Text'],
    [
      languageString('Should we do this thing?', LanguageCode.ENGLISH),
      languageString('¿Deberíamos hacer esto?', LanguageCode.SPANISH),
    ]
  );

  // Contest option labels
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 1, 'ContestOption', 0, 'Selection', 'Text'],
    [
      languageString('Yes', LanguageCode.ENGLISH),
      languageString('Sí', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 1, 'ContestOption', 1, 'Selection', 'Text'],
    [
      languageString('No', LanguageCode.ENGLISH),
      languageString('No', LanguageCode.SPANISH),
    ]
  );

  // Contest titles
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 0, 'BallotTitle', 'Text'],
    [
      languageString('Mayor', LanguageCode.ENGLISH),
      languageString('Alcalde', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 1, 'BallotTitle', 'Text'],
    [
      languageString('Proposition 1', LanguageCode.ENGLISH),
      languageString('Proposición 1', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 2, 'BallotTitle', 'Text'],
    [
      languageString('Controller', LanguageCode.ENGLISH),
      languageString('Controlador', LanguageCode.SPANISH),
    ]
  );

  // County name
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 1, 'Name', 'Text'],
    [
      languageString('Franklin County', LanguageCode.ENGLISH),
      languageString('Condado de Franklin', LanguageCode.SPANISH),
    ]
  );

  // District names
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 2, 'Name', 'Text'],
    [
      languageString('City of Lincoln', LanguageCode.ENGLISH),
      languageString('Ciudad de Lincoln', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 3, 'Name', 'Text'],
    [
      languageString('City of Washington', LanguageCode.ENGLISH),
      languageString('Ciudad de Washington', LanguageCode.SPANISH),
    ]
  );

  // Election title
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Name', 'Text'],
    [
      languageString(
        'Lincoln Municipal General Election',
        LanguageCode.ENGLISH
      ),
      languageString(
        'Elección General Municipal de Lincoln',
        LanguageCode.SPANISH
      ),
    ]
  );

  // Party full names
  set(
    expectedCdfBallotDefinition,
    ['Party', 0, 'Name', 'Text'],
    [
      languageString('Democratic Party', LanguageCode.ENGLISH),
      languageString('Partido Democrático', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Party', 1, 'Name', 'Text'],
    [
      languageString('Republican Party', LanguageCode.ENGLISH),
      languageString('Partido Republicano', LanguageCode.SPANISH),
    ]
  );

  // Party names
  set(
    expectedCdfBallotDefinition,
    ['Party', 0, 'vxBallotLabel', 'Text'],
    [
      languageString('Democrat', LanguageCode.ENGLISH),
      languageString('Demócrata', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Party', 1, 'vxBallotLabel', 'Text'],
    [
      languageString('Republican', LanguageCode.ENGLISH),
      languageString('Republicano', LanguageCode.SPANISH),
    ]
  );

  // Precinct names
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 4, 'Name', 'Text'],
    [
      languageString('North Lincoln', LanguageCode.ENGLISH),
      languageString('Norte de Lincoln', LanguageCode.SPANISH),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 5, 'Name', 'Text'],
    [
      languageString('South Lincoln', LanguageCode.ENGLISH),
      languageString('Sur de Lincoln', LanguageCode.SPANISH),
    ]
  );

  // State name
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 0, 'Name', 'Text'],
    [
      languageString('State of Hamilton', LanguageCode.ENGLISH),
      languageString('Estado de Hamilton', LanguageCode.SPANISH),
    ]
  );

  expect(
    convertVxfElectionToCdfBallotDefinition(
      testVxfElection,
      translatedElectionStrings
    )
  ).toEqual(expectedCdfBallotDefinition);
});

test('convertCdfBallotDefinitionToVxfElection', () => {
  expect(
    convertCdfBallotDefinitionToVxfElection(testCdfBallotDefinition)
  ).toEqual(normalizeVxf(testVxfElection));
});

const elections = [election, primaryElection, electionTwoPartyPrimary];

for (const vxf of elections) {
  test(`round trip conversion for election fixture: ${vxf.title}`, () => {
    const cdf = convertVxfElectionToCdfBallotDefinition(vxf, {});
    expect(convertCdfBallotDefinitionToVxfElection(cdf)).toEqual(
      normalizeVxf(vxf)
    );
  });
}

test('safeParseCdfBallotDefinition', () => {
  // Try a malformed CDF ballot definition that will cause the convert function
  // to throw an error (needed to cover the case that catches these errors)
  expect(
    safeParseCdfBallotDefinition({
      ...testCdfBallotDefinition,
      GpUnit: testCdfBallotDefinition.GpUnit.filter(
        (unit) => unit.Type === 'state'
      ),
    })
  ).toMatchInlineSnapshot(`
    Err {
      "error": [Error: unable to find an element matching a predicate],
    }
  `);

  // Duplicate ids should be rejected
  expect(
    safeParseCdfBallotDefinition({
      ...testCdfBallotDefinition,
      GpUnit: testCdfBallotDefinition.GpUnit.map((unit, i) => ({
        ...unit,
        '@id': `same-id-${i}`,
      })),
      Party: testCdfBallotDefinition.Party.map((party, i) => ({
        ...party,
        '@id': `same-id-${i}`,
      })),
    })
  ).toMatchInlineSnapshot(`
    Err {
      "error": [Error: Ballot definition contains duplicate @ids: same-id-0, same-id-1],
    }
  `);

  expect(safeParseCdfBallotDefinition(testCdfBallotDefinition)).toEqual(
    ok({
      vxfElection: normalizeVxf(testVxfElection),
      cdfElection: testCdfBallotDefinition,
    })
  );
});
