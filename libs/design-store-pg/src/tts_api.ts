import type { LanguageCode, TtsEdit, TtsEditKey } from '@votingworks/types';
import type { SpeechSynthesizer } from '@votingworks/backend';
import {
  type DataUrl,
  type TtsEditsStore,
  type TtsStringDefault,
  ttsStringDefaultsForElection,
} from '@votingworks/design-backend';
import type { ElectionStore } from './election_store.js';

export interface TtsApiContext {
  speechSynthesizer: SpeechSynthesizer;
  elections: ElectionStore;
  ttsEdits: TtsEditsStore;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildTtsMethods(ctx: TtsApiContext) {
  return {
    ttsEditsGet(key: TtsEditKey): Promise<TtsEdit | null> {
      return ctx.ttsEdits.ttsEditsGet(key);
    },

    ttsEditsSet(input: TtsEditKey & { data: TtsEdit }): Promise<void> {
      return ctx.ttsEdits.ttsEditsSet(input, input.data);
    },

    async ttsStringDefaults(input: {
      electionId: string;
    }): Promise<TtsStringDefault[]> {
      const { election } = await ctx.elections.getElection(input.electionId);
      return ttsStringDefaultsForElection(election);
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

export const ttsMethodsThatHandleAuthThemselves = [
  'ttsSynthesizeFromText',
] as const satisfies Array<keyof ReturnType<typeof buildTtsMethods>>;
