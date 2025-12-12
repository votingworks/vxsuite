import { expect, Mocked, test, vi } from 'vitest';
import { SpeechSynthesizer } from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import {
  Election,
  ElectionStringKey,
  LanguageCode,
  TtsEdit,
  TtsEditKey,
} from '@votingworks/types';
import * as ttsStrings from './tts_strings';
import { ElectionRecord, Store } from './store';

test('ttsSynthesizeFromText', async () => {
  const mockSynthesizer: Mocked<SpeechSynthesizer> = {
    synthesizeSpeech: vi.fn(),
  };

  mockSynthesizer.synthesizeSpeech.mockImplementationOnce(
    (text, languageCode) => {
      expect(text).toEqual('hola');
      expect(languageCode).toEqual('es-US');

      return Promise.resolve('audio_data');
    }
  );

  const api = newApi({ speechSynthesizer: mockSynthesizer });
  const result = await api.ttsSynthesizeFromText({
    text: 'hola',
    languageCode: 'es-US',
  });

  expect(result).toEqual('data:audio/mp3;base64,audio_data');
});

test('ttsEditsGet', async () => {
  const mockStore: Partial<Mocked<Store>> = {
    ttsEditsGet: vi.fn(),
  };

  const input: TtsEditKey = {
    jurisdictionId: 'vx',
    languageCode: 'en',
    original: 'ratatouille',
  };

  const output: TtsEdit = {
    exportSource: 'text',
    phonetic: [],
    text: 'ratatooie',
  };

  const api = newApi({ workspace: { store: mockStore } });

  assert(mockStore.ttsEditsGet);
  mockStore.ttsEditsGet.mockImplementationOnce((key) => {
    expect(key).toEqual<TtsEditKey>(input);

    return Promise.resolve(output);
  });

  expect(await api.ttsEditsGet(input)).toEqual(output);
});

test('ttsEditsSet', async () => {
  const mockStore: Partial<Mocked<Store>> = {
    ttsEditsSet: vi.fn(),
  };

  assert(mockStore.ttsEditsSet);
  mockStore.ttsEditsSet.mockResolvedValueOnce();

  const api = newApi({ workspace: { store: mockStore } });
  const input: Parameters<typeof api.ttsEditsSet>[0] = {
    jurisdictionId: 'nh',
    languageCode: 'en',
    original: 'ratatouille',
    data: {
      exportSource: 'text',
      phonetic: [],
      text: 'ratatooie',
    },
  };

  await api.ttsEditsSet(input);
  expect(mockStore.ttsEditsSet.mock.calls).toEqual([[input, input.data]]);
});

type PartialDeep<T> = {
  [P in keyof T]?: PartialDeep<T[P]>;
};

test('ttsStringDefaults - accounts for all relevant strings', async () => {
  const election: PartialDeep<Election> = {
    contests: [
      {
        candidates: [{ id: 'candidate1', name: 'Candidate 1' }],
        id: 'contest1',
        title: 'Candidate Contest 1',
        type: 'candidate',
      },
      {
        candidates: [{ id: 'candidate2', name: 'Candidate 2' }],
        id: 'contest2',
        termDescription: '10 Years',
        title: 'Candidate Contest 2',
        type: 'candidate',
      },
      {
        description: 'Ballot measure 1 description.',
        id: 'contest3',
        title: 'Ballot Measure 1',
        type: 'yesno',

        noOption: { id: 'option_no', label: 'NO' },
        yesOption: { id: 'option_yes', label: 'YES' },
      },
      {
        description: '<p>Ballot <b>measure</b> 2 description.</p>',
        id: 'contest4',
        title: 'Ballot Measure 2',
        type: 'yesno',

        noOption: { id: 'option_disagree', label: 'Agree to Disagree' },
        yesOption: { id: 'option_agree', label: 'Agree' },
      },
    ],
    county: { name: 'Test County' },
    districts: [
      { id: 'district1', name: 'District 1' },
      { id: 'district2', name: 'District 2' },
    ],
    parties: [
      { id: 'party1', fullName: 'Party One', name: 'One' },
      { id: 'party2', fullName: 'Party Two', name: 'Two' },
    ],
    precincts: [
      { id: 'precinct1', name: 'Precinct 1' },
      {
        id: 'precinct2',
        name: 'Precinct 2',
        splits: [
          { id: 'precinct2_split1', name: 'Precinct 2, Split 1' },
          { id: 'precinct2_split2', name: 'Precinct 2, Split 2' },
        ],
      },
    ],
    state: 'Test State',
    title: 'Test General Election',
  };

  const expectedStrings: Record<
    ElectionStringKey,
    Array<{ subkey?: string; text: string }>
  > = {
    candidateName: [
      { subkey: 'candidate1', text: 'Candidate 1' },
      { subkey: 'candidate2', text: 'Candidate 2' },
    ],
    contestDescription: [
      { subkey: 'contest3', text: 'Ballot measure 1 description.' },
      { subkey: 'contest4', text: 'Ballot measure 2 description.' },
    ],
    contestOptionLabel: [
      { subkey: 'option_agree', text: 'Agree' },
      { subkey: 'option_disagree', text: 'Agree to Disagree' },
      { subkey: 'option_no', text: 'NO' },
      { subkey: 'option_yes', text: 'YES' },
    ],
    contestTerm: [{ subkey: 'contest2', text: '10 Years' }],
    contestTitle: [
      { subkey: 'contest1', text: 'Candidate Contest 1' },
      { subkey: 'contest2', text: 'Candidate Contest 2' },
      { subkey: 'contest3', text: 'Ballot Measure 1' },
      { subkey: 'contest4', text: 'Ballot Measure 2' },
    ],
    countyName: [{ text: 'Test County' }],
    districtName: [
      { subkey: 'district1', text: 'District 1' },
      { subkey: 'district2', text: 'District 2' },
    ],
    electionTitle: [{ text: 'Test General Election' }],
    partyFullName: [
      { subkey: 'party1', text: 'Party One' },
      { subkey: 'party2', text: 'Party Two' },
    ],
    partyName: [
      { subkey: 'party1', text: 'One' },
      { subkey: 'party2', text: 'Two' },
    ],
    precinctName: [
      { subkey: 'precinct1', text: 'Precinct 1' },
      { subkey: 'precinct2', text: 'Precinct 2' },
    ],
    precinctSplitName: [
      { subkey: 'precinct2_split1', text: 'Precinct 2, Split 1' },
      { subkey: 'precinct2_split2', text: 'Precinct 2, Split 2' },
    ],
    stateName: [{ text: 'Test State' }],

    // Currently not exposed for TTS editing:
    ballotLanguage: [],
    ballotStyleId: [],
    electionDate: [],
  };

  const mockStore: Partial<Mocked<Store>> = { getElection: vi.fn() };
  const api = newApi({ workspace: { store: mockStore } });

  assert(mockStore.getElection);
  mockStore.getElection.mockImplementationOnce((electionId) => {
    expect(electionId).toEqual('abc123');

    const record: PartialDeep<ElectionRecord> = { election };

    return Promise.resolve(record as ElectionRecord);
  });

  const result = await api.ttsStringDefaults({ electionId: 'abc123' });
  expect(result).toEqual(
    Object.entries(expectedStrings)
      .flatMap(([key, values]) => values.map((rest) => ({ key, ...rest })))
      .sort((a, b) =>
        a.text.localeCompare(b.text, LanguageCode.ENGLISH, {
          ignorePunctuation: true,
          numeric: true,
        })
      )
  );
});

test('ttsStringDefaults - new/empty election', async () => {
  const election: PartialDeep<Election> = {
    contests: [],
    county: { name: '' },
    districts: [],
    parties: [],
    precincts: [],
    state: '',
    title: '',
  };

  const mockStore: Partial<Mocked<Store>> = { getElection: vi.fn() };
  const api = newApi({ workspace: { store: mockStore } });

  const electionRecord: PartialDeep<ElectionRecord> = { election };
  assert(mockStore.getElection);
  mockStore.getElection.mockResolvedValueOnce(electionRecord as ElectionRecord);

  const result = await api.ttsStringDefaults({ electionId: 'abc123' });
  expect(result).toEqual([]);
});

test('ttsStringDefaults - spot checks for sort order', async () => {
  const election: PartialDeep<Election> = {
    contests: [
      {
        candidates: [
          { id: 'candidate1', name: '"Nickname" Last-Name' },
          { id: 'candidate2', name: 'A. Person' },
        ],
        id: 'contest1',
        title: 'A Contest',
        type: 'candidate',
      },
    ],
    county: { name: '' },
    districts: [
      { id: 'district10', name: 'District 10' },
      { id: 'district2', name: 'District 2' },
    ],
    parties: [],
    precincts: [],
  };

  const mockStore: Partial<Mocked<Store>> = { getElection: vi.fn() };
  const api = newApi({ workspace: { store: mockStore } });

  const electionRecord: PartialDeep<ElectionRecord> = { election };
  assert(mockStore.getElection);
  mockStore.getElection.mockResolvedValueOnce(electionRecord as ElectionRecord);

  const result = await api.ttsStringDefaults({ electionId: 'abc123' });
  expect(result).toEqual<ttsStrings.TtsStringDefault[]>([
    {
      key: ElectionStringKey.CONTEST_TITLE,
      subkey: 'contest1',
      text: 'A Contest',
    },
    {
      key: ElectionStringKey.CANDIDATE_NAME,
      subkey: 'candidate2',
      text: 'A. Person',
    },
    {
      key: ElectionStringKey.DISTRICT_NAME,
      subkey: 'district2',
      text: 'District 2',
    },
    {
      key: ElectionStringKey.DISTRICT_NAME,
      subkey: 'district10',
      text: 'District 10',
    },
    {
      key: ElectionStringKey.CANDIDATE_NAME,
      subkey: 'candidate1',
      text: '"Nickname" Last-Name',
    },
  ]);
});

function newApi(ctx: PartialDeep<ttsStrings.TtsApiContext>) {
  return ttsStrings.apiMethods(ctx as ttsStrings.TtsApiContext);
}
