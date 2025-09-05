/* eslint @typescript-eslint/no-use-before-define: ["error", { "functions": false }] */

import { convertHtmlToAudioCues } from '@votingworks/backend';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import { AppContext } from './context';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import {
  AudioOverride,
  AudioOverrideQuery,
  AudioQuery,
  AudioSource,
  AudioSourceEntry,
  SsmlChunk,
  TtsPhoneticEntry,
  TtsTextEntry,
} from './store_audio_demo';

export interface UiStringInfo {
  key: string;
  subkey?: string;
  str: string;
  ttsStr: string;
}

export type DataUrl = string;

export interface AudioUploadResult {
  candidateId?: string;
  contestId?: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function apiMethods(ctx: AppContext) {
  const tts = new GoogleCloudSpeechSynthesizerWithDbCache({
    store: ctx.workspace.store,
  });

  return {
    async appStrings(input: { electionId: string }): Promise<UiStringInfo[]> {
      const { election } = await ctx.workspace.store.getElection(
        input.electionId
      );

      const strings: UiStringInfo[] = [];
      for (const contest of election.contests) {
        strings.push({
          key: ElectionStringKey.CONTEST_TITLE,
          subkey: contest.id,
          str: contest.title,
          ttsStr: contest.title,
        });

        switch (contest.type) {
          case 'yesno':
            strings.push({
              key: ElectionStringKey.CONTEST_DESCRIPTION,
              subkey: contest.id,
              str: contest.description,
              ttsStr: convertHtmlToAudioCues(contest.description),
            });

            break;

          case 'candidate':
            for (const candidate of contest.candidates) {
              strings.push({
                key: ElectionStringKey.CANDIDATE_NAME,
                subkey: candidate.id,
                str: candidate.name,
                ttsStr: candidate.name.replaceAll('"', ''),
              });
            }

            break;

          default:
            throwIllegalValue(contest, 'type');
        }
      }

      for (const party of election.parties) {
        strings.push({
          key: ElectionStringKey.PARTY_FULL_NAME,
          subkey: party.id,
          str: party.name,
          ttsStr: party.name,
        });
      }

      // eslint-disable-next-line vx/no-array-sort-mutation
      return strings.sort((a, b) =>
        a.str.localeCompare(b.str, undefined, { numeric: true })
      );
    },

    audioOverride(input: AudioOverrideQuery): Promise<AudioOverride | null> {
      return ctx.workspace.store.audioOverrideGet(input);
    },

    audioOverrideExists(input: AudioOverrideQuery): Promise<boolean> {
      return ctx.workspace.store.audioOverrideExists(input);
    },

    audioSourceGet(input: AudioQuery): Promise<AudioSource> {
      return ctx.workspace.store.audioSourceGet(input);
    },

    audioSourceSet(input: AudioSourceEntry): Promise<void> {
      return ctx.workspace.store.audioSourceSet(input);
    },

    async synthesizeSsml(input: {
      ssml: string;
      languageCode: string;
    }): Promise<DataUrl> {
      const base64Data = await tts.synthesizeSsml(
        input.ssml,
        input.languageCode as LanguageCode
      );

      return `data:audio/mp3;base64,${base64Data}`;
    },

    async synthesizeText(input: {
      text: string;
      languageCode: string;
    }): Promise<DataUrl> {
      const base64Data = await tts.synthesizeSpeech(
        input.text,
        input.languageCode as LanguageCode
      );

      return `data:audio/mp3;base64,${base64Data}`;
    },

    ttsPhoneticOverrideGet(input: AudioQuery): Promise<SsmlChunk[] | null> {
      return ctx.workspace.store.ttsPhoneticOverrideGet(input);
    },

    ttsPhoneticOverrideSet(input: TtsPhoneticEntry): Promise<void> {
      return ctx.workspace.store.ttsPhoneticOverrideSet(input);
    },

    ttsTextOverrideGet(input: AudioQuery): Promise<string | null> {
      return ctx.workspace.store.ttsTextOverrideGet(input);
    },

    ttsTextOverrideSet(input: TtsTextEntry): Promise<void> {
      return ctx.workspace.store.ttsTextOverrideSet(input);
    },

    async uploadAudioFiles(input: {
      dataUrls: string[];
      electionId: string;
      names: string[];
    }): Promise<AudioUploadResult[]> {
      const { election } = await ctx.workspace.store.getElection(
        input.electionId
      );

      const idMapping = election.customBallotContent?.externalToVxIdMapping;
      if (!idMapping) return [];

      const tasks: Array<Promise<void>> = [];
      const results: AudioUploadResult[] = [];

      for (let i = 0; i < input.names.length; i += 1) {
        const dataUrl = input.dataUrls[i];
        const originalFilename = input.names[i];
        results[i] = {};

        const info = fileInfo(originalFilename);
        if (!info) continue;

        const contestId = idMapping.contests[info.contestId];

        // Contest title/description audio:
        if (!info.candidateId) {
          if (!contestId) continue;

          results[i].contestId = contestId;

          tasks.push(
            ctx.workspace.store.audioOverridesSetContest({
              contestId,
              electionId: input.electionId,
              dataUrl,
              originalFilename,
            })
          );

          continue;
        }

        // Candidate audio:
        const candidateIdLa = `${info.candidateId}.${info.contestId}`;
        const candidateId = idMapping.candidates[candidateIdLa];
        if (!candidateId) continue;

        results[i].contestId = contestId;
        results[i].candidateId = candidateId;

        tasks.push(
          ctx.workspace.store.audioOverridesSetCandidate({
            candidateId,
            electionId: input.electionId,
            dataUrl,
            originalFilename,
          })
        );
      }

      await Promise.all(tasks);

      return results;
    },
  } as const;
}

export type Api = ReturnType<typeof apiMethods>;

export const methodsThatHandleAuthThemselves = [
  'synthesizeSsml',
  'synthesizeText',
] as const;

interface FileInfo {
  candidateId?: string;
  contestId: string;
  parishId: string;
}

const REGEX_LA_AUDIO_FILENAME = /^(\d{2}) (?:(\d{3})\.)?(\d+?)\..+/;

function fileInfo(name: string): FileInfo | null {
  const matches = name.match(REGEX_LA_AUDIO_FILENAME);
  if (!matches) return null;

  assert(
    matches.length === 4,
    `Unexpected capture group count for audio filename regex - ` +
      `want 4, got ${matches.length}`
  );

  return {
    candidateId: matches[2],
    contestId: matches[3],
    parishId: matches[1],
  };
}
