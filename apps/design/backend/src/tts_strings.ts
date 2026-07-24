import { find, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionStringKey,
  hasSplits,
  LanguageCode,
  TranslationEditKey,
  TtsEdit,
  TtsEditKey,
} from '@votingworks/types';
import {
  SpeechSynthesizer,
  Translator,
  convertHtmlToAudioCues,
  electionStringExtractorFns,
  stripImagesFromRichText,
} from '@votingworks/backend';
import { Workspace } from './workspace';

export type DataUrl = string;

export interface TtsApiContext {
  speechSynthesizer: SpeechSynthesizer;
  translator: Translator;
  workspace: Workspace;
}

export interface TtsStringDefault {
  key: ElectionStringKey;
  subkey?: string;
  text: string;
}

export interface TranslationKey {
  electionId: string;
  language: LanguageCode;
  stringKey: ElectionStringKey;
  subKey?: string;
}

export interface Translation {
  forDisplay: string;
  forAudio: string;
}

// Identifies a single finalized string, keyed to match the sidebar/panel
// identity in the proofing screen. `languageCode` is the selected language,
// which may differ from a string's audio synthesis language (e.g. candidate
// names are voiced in English for languages that don't transliterate names).
export interface FinalizedStringKey {
  electionId: string;
  languageCode: LanguageCode;
  stringKey: string;
  subkey?: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function apiMethods(ctx: TtsApiContext) {
  return {
    /* istanbul ignore next - DEMO */
    async translationGet(input: TranslationKey): Promise<Translation> {
      const { election } = await ctx.workspace.store.getElection(
        input.electionId
      );
      const jurisdiction = await ctx.workspace.store.getElectionJurisdiction(
        input.electionId
      );

      const strings = electionStringExtractorFns[input.stringKey](election);
      let match = strings[0];
      if (input.subKey) {
        match = find(strings, (s) => s.stringKey[1] === input.subKey);
      }

      let forDisplay = match.stringInEnglish;
      if (input.language !== LanguageCode.ENGLISH) {
        [forDisplay] = await ctx.translator.translateText(
          [match.stringInEnglish],
          input.language,
          jurisdiction.id
        );
      }

      let forAudio = forDisplay;
      if (input.stringKey === ElectionStringKey.CONTEST_DESCRIPTION) {
        try {
          forAudio = convertHtmlToAudioCues(forDisplay);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('translation sanitization failed:', error);
        }
      }

      return { forDisplay, forAudio };
    },

    /* istanbul ignore next - DEMO */
    async translationSet(
      input: TranslationKey & {
        text: string;
      }
    ): Promise<void> {
      const { election } = await ctx.workspace.store.getElection(
        input.electionId
      );
      const jurisdiction = await ctx.workspace.store.getElectionJurisdiction(
        input.electionId
      );

      const strings = electionStringExtractorFns[input.stringKey](election);
      const match = find(strings, (s) => s.stringKey[1] === input.subKey);
      const englishText = stripImagesFromRichText(match.stringInEnglish);

      const editKey: TranslationEditKey = {
        englishText,
        jurisdictionId: jurisdiction.id,
        languageCode: input.language,
      };

      return ctx.workspace.store.translationEditsSet(editKey, input.text);
    },

    ttsEditsGet(key: TtsEditKey): Promise<TtsEdit | null> {
      return ctx.workspace.store.ttsEditsGet(key);
    },

    ttsEditsSet(input: TtsEditKey & { data: TtsEdit }): Promise<void> {
      return ctx.workspace.store.ttsEditsSet(input, input.data);
    },

    /* istanbul ignore next - DEMO */
    async getFinalizedStrings(input: {
      electionId: string;
      language: LanguageCode;
    }): Promise<Array<{ stringKey: string; subkey: string }>> {
      return ctx.workspace.store.finalizedStringsGet({
        electionId: input.electionId,
        languageCode: input.language,
      });
    },

    /* istanbul ignore next - DEMO */
    async setStringFinalized(
      input: FinalizedStringKey & { finalized: boolean }
    ): Promise<void> {
      const { finalized, ...key } = input;
      return finalized
        ? ctx.workspace.store.stringFinalizedSet(key)
        : ctx.workspace.store.stringFinalizedDelete(key);
    },

    async ttsStringDefaults(input: {
      electionId: string;
    }): Promise<TtsStringDefault[]> {
      const { election } = await ctx.workspace.store.getElection(
        input.electionId
      );

      const strings: TtsStringDefault[] = [];

      if (election.title) {
        strings.push({
          key: ElectionStringKey.ELECTION_TITLE,
          text: election.title,
        });
      }

      if (election.state) {
        strings.push({
          key: ElectionStringKey.STATE_NAME,
          text: election.state,
        });
      }

      if (election.jurisdiction.name) {
        strings.push({
          key: ElectionStringKey.JURISDICTION_NAME,
          text: election.jurisdiction.name,
        });
      }

      for (const district of election.districts) {
        strings.push({
          key: ElectionStringKey.DISTRICT_NAME,
          subkey: district.id,
          text: district.name,
        });
      }

      for (const place of election.pollingPlaces || []) {
        strings.push({
          key: ElectionStringKey.POLLING_PLACE_NAME,
          subkey: place.id,
          text: place.name,
        });
      }

      for (const precinct of election.precincts) {
        strings.push({
          key: ElectionStringKey.PRECINCT_NAME,
          subkey: precinct.id,
          text: precinct.name,
        });

        if (!hasSplits(precinct)) continue;

        for (const split of precinct.splits) {
          strings.push({
            key: ElectionStringKey.PRECINCT_SPLIT_NAME,
            subkey: split.id,
            text: split.name,
          });
        }
      }

      for (const party of election.parties) {
        strings.push(
          {
            key: ElectionStringKey.PARTY_NAME,
            subkey: party.id,
            text: party.name,
          },
          {
            key: ElectionStringKey.PARTY_FULL_NAME,
            subkey: party.id,
            text: party.fullName,
          }
        );
      }

      for (const contest of election.contests) {
        strings.push({
          key: ElectionStringKey.CONTEST_TITLE,
          subkey: contest.id,
          text: contest.title,
        });

        switch (contest.type) {
          case 'candidate':
            if (contest.termDescription) {
              strings.push({
                key: ElectionStringKey.CONTEST_TERM,
                subkey: contest.id,
                text: contest.termDescription,
              });
            }

            for (const candidate of contest.candidates) {
              strings.push({
                key: ElectionStringKey.CANDIDATE_NAME,
                subkey: candidate.id,
                text: candidate.name,
              });

              if (candidate.designation) {
                strings.push({
                  key: ElectionStringKey.CANDIDATE_DESIGNATION,
                  subkey: candidate.id,
                  text: candidate.designation,
                });
              }
            }

            break;

          case 'yesno':
            strings.push({
              key: ElectionStringKey.CONTEST_DESCRIPTION,
              subkey: contest.id,
              text: convertHtmlToAudioCues(contest.description),
            });

            for (const option of contest.options) {
              strings.push({
                key: ElectionStringKey.CONTEST_OPTION_LABEL,
                subkey: option.id,
                text: option.label,
              });
            }

            break;

          case 'straight-party':
            break;

          default:
            /* istanbul ignore next */
            throwIllegalValue(contest, 'type');
        }
      }

      // eslint-disable-next-line vx/no-array-sort-mutation
      return strings.sort((a, b) =>
        a.text.localeCompare(b.text, LanguageCode.ENGLISH, {
          ignorePunctuation: true,
          numeric: true,
        })
      );
    },

    async ttsSynthesizeFromText(input: {
      text: string;
      languageCode: string;
    }): Promise<DataUrl> {
      const base64Data = await ctx.speechSynthesizer.synthesizeSpeech(
        input.text,
        input.languageCode as LanguageCode
      );

      return `data:audio/mp3;base64,${base64Data}`;
    },

    /* istanbul ignore next */
    async ttsSynthesizeFromSsml(input: {
      ssml: string;
      languageCode: string;
    }): Promise<DataUrl> {
      const base64Data = await ctx.speechSynthesizer.fromSsml(
        input.ssml,
        input.languageCode as LanguageCode
      );

      return `data:audio/mp3;base64,${base64Data}`;
    },
  } as const;
}

export const methodsThatHandleAuthThemselves = [
  'ttsSynthesizeFromSsml',
  'ttsSynthesizeFromText',
] as const satisfies Array<keyof ReturnType<typeof apiMethods>>;
