import { useSyncExternalStore } from 'react';
import {
  type Contest,
  type District,
  type ElectionId,
  hasSplits,
  LanguageCode,
  type Party,
  type Precinct,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import { electionDefinitionApi } from '../api.js';

/**
 * MOCKUP ONLY: in-memory translation and audio state for the Translations and
 * Audio screens, so they can be designed and documented before the real
 * features exist. Nothing is persisted, imported or exported.
 */

export interface ElectionString {
  readonly id: string;
  readonly context: string;
  readonly english: string;
  readonly isRichText?: boolean;
}

export interface ElectionStringGroup {
  readonly title: string;
  readonly strings: readonly ElectionString[];
}

interface LoadedState {
  readonly updatedAt: Date;
}

interface MockupState {
  readonly enabledLanguages: readonly LanguageCode[];
  readonly translations: Readonly<Partial<Record<LanguageCode, LoadedState>>>;
  readonly audio: Readonly<Partial<Record<LanguageCode, LoadedState>>>;
}

export const ALL_LANGUAGES: readonly LanguageCode[] = [
  LanguageCode.ENGLISH,
  LanguageCode.ARABIC,
  LanguageCode.BENGALI,
  LanguageCode.CHINESE_SIMPLIFIED,
  LanguageCode.SPANISH,
  LanguageCode.CHINESE_TRADITIONAL,
];

let state: MockupState = {
  enabledLanguages: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  translations: {},
  audio: {},
};
const listeners = new Set<() => void>();

function setState(update: (current: MockupState) => MockupState): void {
  state = update(state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLanguageMockupState(): MockupState {
  return useSyncExternalStore(subscribe, () => state);
}

export function setEnabledLanguages(languages: readonly LanguageCode[]): void {
  setState((current) => ({
    ...current,
    enabledLanguages: ALL_LANGUAGES.filter(
      (code) => code === LanguageCode.ENGLISH || languages.includes(code)
    ),
  }));
}

export function markTranslationsLoaded(languageCode: LanguageCode): void {
  setState((current) => ({
    ...current,
    translations: {
      ...current.translations,
      [languageCode]: { updatedAt: new Date() },
    },
  }));
}

export function markAudioLoaded(languageCode: LanguageCode): void {
  setState((current) => ({
    ...current,
    audio: { ...current.audio, [languageCode]: { updatedAt: new Date() } },
  }));
}

export function languageName(languageCode: LanguageCode): string {
  return format.languageDisplayName({
    languageCode,
    displayLanguageCode: 'en',
    style: 'short',
  });
}

const SPANISH: Readonly<Record<string, string>> = {
  'General Election': 'Elección General',
  'Lincoln County': 'Condado de Lincoln',
  Demo: 'Demo',
  DEMO: 'DEMO',
  'North Ward': 'Distrito Norte',
  'South Ward': 'Distrito Sur',
  'Precinct 1': 'Precinto 1',
  'Precinct 2': 'Precinto 2',
  'Precinct 3': 'Precinto 3',
  'Precinct 3 - North': 'Precinto 3 - Norte',
  'Precinct 3 - South': 'Precinto 3 - Sur',
  'Democratic Party': 'Partido Demócrata',
  'Republican Party': 'Partido Republicano',
  Mayor: 'Alcalde',
  '4 years': '4 años',
  '2 years': '2 años',
  'City Council, North Ward': 'Concejo Municipal, Distrito Norte',
  'City Council, South Ward': 'Concejo Municipal, Distrito Sur',
  'County Treasurer': 'Tesorero del Condado',
  'Library Levy': 'Impuesto para la Biblioteca',
  '<p>Shall the county levy a property tax to fund the public library?</p>':
    '<p>¿Debe el condado imponer un impuesto sobre la propiedad para financiar la biblioteca pública?</p>',
  Yes: 'Sí',
  No: 'No',
};

export function getTranslation(
  languageCode: LanguageCode,
  english: string
): string | undefined {
  if (languageCode === LanguageCode.ENGLISH) return english;
  if (!state.translations[languageCode]) return undefined;
  return languageCode === LanguageCode.SPANISH ? SPANISH[english] : undefined;
}

export function hasAudio(
  languageCode: LanguageCode,
  string: ElectionString
): boolean {
  return (
    Boolean(state.audio[languageCode]) &&
    getTranslation(languageCode, string.english) !== undefined
  );
}

export function audioFileName(string: ElectionString): string {
  return `${string.id.replace(/:/g, '.')}.mp3`;
}

function buildGroups(
  electionInfo: {
    title: string;
    jurisdictionName: string;
    state: string;
  },
  districts: readonly District[],
  precincts: readonly Precinct[],
  parties: readonly Party[],
  contests: readonly Contest[]
): ElectionStringGroup[] {
  const groups: ElectionStringGroup[] = [
    {
      title: 'Election',
      strings: [
        {
          id: 'electionTitle',
          context: 'Election Title',
          english: electionInfo.title,
        },
        {
          id: 'jurisdictionName',
          context: 'Jurisdiction Name',
          english: electionInfo.jurisdictionName,
        },
        { id: 'stateName', context: 'State Name', english: electionInfo.state },
      ],
    },
    {
      title: 'Districts',
      strings: districts.map((district) => ({
        id: `districtName:${district.id}`,
        context: 'District Name',
        english: district.name,
      })),
    },
    {
      title: 'Precincts',
      strings: precincts.flatMap((precinct) => [
        {
          id: `precinctName:${precinct.id}`,
          context: 'Precinct Name',
          english: precinct.name,
        },
        ...(hasSplits(precinct)
          ? precinct.splits.map((split) => ({
              id: `precinctSplitName:${split.id}`,
              context: `Precinct Split Name · ${precinct.name}`,
              english: split.name,
            }))
          : []),
      ]),
    },
    {
      title: 'Parties',
      strings: parties.map((party) => ({
        id: `partyFullName:${party.id}`,
        context: 'Party Name',
        english: party.fullName,
      })),
    },
    {
      title: 'Contests',
      strings: contests.flatMap((contest): ElectionString[] => {
        const title: ElectionString = {
          id: `contestTitle:${contest.id}`,
          context: 'Contest Title',
          english: contest.title,
        };
        if (contest.type === 'candidate') {
          return contest.termDescription
            ? [
                title,
                {
                  id: `contestTerm:${contest.id}`,
                  context: `Contest Term · ${contest.title}`,
                  english: contest.termDescription,
                },
              ]
            : [title];
        }
        if (contest.type === 'yesno') {
          return [
            title,
            {
              id: `contestDescription:${contest.id}`,
              context: `Contest Description · ${contest.title}`,
              english: contest.description,
              isRichText: true,
            },
            ...contest.options.map((option) => ({
              id: `contestOptionLabel:${option.id}`,
              context: `Option · ${contest.title}`,
              english: option.label,
            })),
          ];
        }
        return [title];
      }),
    },
  ];
  return groups.filter((group) => group.strings.length > 0);
}

export function useElectionStrings(
  electionId: ElectionId
): ElectionStringGroup[] | undefined {
  const electionInfoQuery =
    electionDefinitionApi.getElectionInfo.useQuery(electionId);
  const districtsQuery =
    electionDefinitionApi.listDistricts.useQuery(electionId);
  const precinctsQuery =
    electionDefinitionApi.listPrecincts.useQuery(electionId);
  const partiesQuery = electionDefinitionApi.listParties.useQuery(electionId);
  const contestsQuery = electionDefinitionApi.listContests.useQuery(electionId);
  if (
    !electionInfoQuery.isSuccess ||
    !districtsQuery.isSuccess ||
    !precinctsQuery.isSuccess ||
    !partiesQuery.isSuccess ||
    !contestsQuery.isSuccess
  ) {
    return undefined;
  }
  return buildGroups(
    electionInfoQuery.data,
    districtsQuery.data,
    precinctsQuery.data,
    partiesQuery.data,
    contestsQuery.data
  );
}

export function countMissingTranslations(
  groups: readonly ElectionStringGroup[],
  languageCode: LanguageCode
): number {
  return groups
    .flatMap((group) => group.strings)
    .filter((s) => getTranslation(languageCode, s.english) === undefined)
    .length;
}

export function countMissingAudio(
  groups: readonly ElectionStringGroup[],
  languageCode: LanguageCode
): number {
  return groups
    .flatMap((group) => group.strings)
    .filter((s) => !hasAudio(languageCode, s)).length;
}
