import { throwIllegalValue } from '@votingworks/basics';
import {
  ElectionStringKey,
  hasSplits,
  LanguageCode,
  TtsEdit,
  TtsEditKey,
} from '@votingworks/types';
import {
  SpeechSynthesizer,
  convertHtmlToAudioCues,
} from '@votingworks/backend';
import { Workspace } from './workspace';

export type DataUrl = string;

export interface TtsApiContext {
  speechSynthesizer: SpeechSynthesizer;
  workspace: Workspace;
}

export interface TtsStringDefault {
  key: ElectionStringKey;
  subkey?: string;
  text: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function apiMethods(ctx: TtsApiContext) {
  return {
    ttsEditsGet(key: TtsEditKey): Promise<TtsEdit | null> {
      return ctx.workspace.store.ttsEditsGet(key);
    },

    ttsEditsSet(input: TtsEditKey & { data: TtsEdit }): Promise<void> {
      return ctx.workspace.store.ttsEditsSet(input, input.data);
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

      if (election.county.name) {
        strings.push({
          key: ElectionStringKey.COUNTY_NAME,
          text: election.county.name,
        });
      }

      for (const district of election.districts) {
        strings.push({
          key: ElectionStringKey.DISTRICT_NAME,
          subkey: district.id,
          text: district.name,
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
            }

            break;

          case 'yesno':
            strings.push({
              key: ElectionStringKey.CONTEST_DESCRIPTION,
              subkey: contest.id,
              text: convertHtmlToAudioCues(contest.description),
            });

            // NOTE: Default yes/no option labels are excluded below, since the
            // current focus for TTS editing is on user-provided strings:

            if (contest.yesOption.label.toLowerCase() !== 'yes') {
              strings.push({
                key: ElectionStringKey.CONTEST_OPTION_LABEL,
                subkey: contest.yesOption.id,
                text: contest.yesOption.label,
              });
            }

            if (contest.noOption.label.toLowerCase() !== 'no') {
              strings.push({
                key: ElectionStringKey.CONTEST_OPTION_LABEL,
                subkey: contest.noOption.id,
                text: contest.noOption.label,
              });
            }

            break;

          /* istanbul ignore next - @preserve */
          default:
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
  } as const;
}

export const methodsThatHandleAuthThemselves = [
  'ttsSynthesizeFromText',
] as const satisfies Array<keyof ReturnType<typeof apiMethods>>;
