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
import { testCdfBallotDefinition, testVxfElection } from './fixtures';
import { ElectionStringKey, UiStringsPackage, mergeUiStrings } from '../..';
import * as Cdf from '.';
import { normalizeVxfAfterCdfConversion } from '../../../test/cdf_conversion_helpers';

function languageString(content: string, language: string): Cdf.LanguageString {
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
  expect(convertVxfElectionToCdfBallotDefinition(testVxfElection)).toEqual(
    testCdfBallotDefinition
  );
});

test('convertVxfElectionToCdfBallotDefinition with translated election strings', () => {
  const translatedElectionStrings: UiStringsPackage = {
    'es-US': {
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
    'zh-Hans': {
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
      languageString('Sherlock Holmes', 'en'),
      languageString('Sherlock Holmes', 'es-US'),
      languageString('Sherlock Holmes', 'zh-Hans'),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Candidate', 1, 'BallotName', 'Text'],
    [
      languageString('Thomas Edison', 'en'),
      languageString('Thomas Edison', 'es-US'),
      languageString('Thomas Edison', 'zh-Hans'),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Candidate', 2, 'BallotName', 'Text'],
    [
      languageString('Winston Churchill', 'en'),
      languageString('Winston Churchill', 'es-US'),
      languageString('Winston Churchill', 'zh-Hans'),
    ]
  );

  // Contest descriptions
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 1, 'FullText', 'Text'],
    [
      languageString('Should we do this thing?', 'en'),
      languageString('¿Deberíamos hacer esto?', 'es-US'),
    ]
  );

  // Contest option labels
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 1, 'ContestOption', 0, 'Selection', 'Text'],
    [languageString('Yes', 'en'), languageString('Sí', 'es-US')]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 1, 'ContestOption', 1, 'Selection', 'Text'],
    [languageString('No', 'en'), languageString('No', 'es-US')]
  );

  // Contest titles
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 0, 'BallotTitle', 'Text'],
    [languageString('Mayor', 'en'), languageString('Alcalde', 'es-US')]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 1, 'BallotTitle', 'Text'],
    [
      languageString('Proposition 1', 'en'),
      languageString('Proposición 1', 'es-US'),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Contest', 2, 'BallotTitle', 'Text'],
    [languageString('Controller', 'en'), languageString('Controlador', 'es-US')]
  );

  // County name
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 1, 'Name', 'Text'],
    [
      languageString('Franklin County', 'en'),
      languageString('Condado de Franklin', 'es-US'),
    ]
  );

  // District names
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 2, 'Name', 'Text'],
    [
      languageString('City of Lincoln', 'en'),
      languageString('Ciudad de Lincoln', 'es-US'),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 3, 'Name', 'Text'],
    [
      languageString('City of Washington', 'en'),
      languageString('Ciudad de Washington', 'es-US'),
    ]
  );

  // Election title
  set(
    expectedCdfBallotDefinition,
    ['Election', 0, 'Name', 'Text'],
    [
      languageString('Lincoln Municipal General Election', 'en'),
      languageString('Elección General Municipal de Lincoln', 'es-US'),
    ]
  );

  // Party full names
  set(
    expectedCdfBallotDefinition,
    ['Party', 0, 'Name', 'Text'],
    [
      languageString('Democratic Party', 'en'),
      languageString('Partido Democrático', 'es-US'),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['Party', 1, 'Name', 'Text'],
    [
      languageString('Republican Party', 'en'),
      languageString('Partido Republicano', 'es-US'),
    ]
  );

  // Precinct names
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 4, 'Name', 'Text'],
    [
      languageString('North Lincoln', 'en'),
      languageString('Norte de Lincoln', 'es-US'),
    ]
  );
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 5, 'Name', 'Text'],
    [
      languageString('South Lincoln', 'en'),
      languageString('Sur de Lincoln', 'es-US'),
    ]
  );

  // State name
  set(
    expectedCdfBallotDefinition,
    ['GpUnit', 0, 'Name', 'Text'],
    [
      languageString('State of Hamilton', 'en'),
      languageString('Estado de Hamilton', 'es-US'),
    ]
  );

  expect(
    convertVxfElectionToCdfBallotDefinition({
      ...testVxfElection,
      ballotStrings: mergeUiStrings(
        testVxfElection.ballotStrings,
        translatedElectionStrings
      ),
    })
  ).toEqual(expectedCdfBallotDefinition);
});

test('convertCdfBallotDefinitionToVxfElection', () => {
  expect(
    convertCdfBallotDefinitionToVxfElection(testCdfBallotDefinition)
  ).toEqual(normalizeVxfAfterCdfConversion(testVxfElection));
});

const elections = [election, primaryElection, electionTwoPartyPrimary];

for (const vxf of elections) {
  test(`round trip conversion for election fixture: ${vxf.title}`, () => {
    const cdf = convertVxfElectionToCdfBallotDefinition(vxf);
    expect(convertCdfBallotDefinitionToVxfElection(cdf)).toEqual(
      normalizeVxfAfterCdfConversion(vxf)
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
  ).toMatchSnapshot();

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
  ).toMatchSnapshot();

  expect(safeParseCdfBallotDefinition(testCdfBallotDefinition)).toEqual(
    ok({
      vxfElection: normalizeVxfAfterCdfConversion(testVxfElection),
      cdfElection: testCdfBallotDefinition,
    })
  );
});
