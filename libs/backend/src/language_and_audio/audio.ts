import { Readable } from 'node:stream';
import {
  UiStringAudioClip,
  UiStringAudioIdsPackage,
  UiStringsPackage,
  LanguageCode,
} from '@votingworks/types';

import { SpeechSynthesizer } from './speech_synthesizer';
import {
  audioIdForText,
  forEachUiString,
  prepareTextForSpeechSynthesis,
  setUiStringAudioIds,
} from './utils';

interface TextToSynthesizeSpeechFor {
  audioId: string;
  languageCode: LanguageCode;
  text: string;
}

interface AudioIdOverride {
  audioId: string;
  languageCode: LanguageCode;
  getDataUrl: () => Promise<string>;
}

export type UiStringAudioOverride =
  | { getDataUrl: () => Promise<string> }
  | 'drop'
  | 'useTts';

/**
 * Generates audio IDs and clips for all app and election strings provided with the given speech synthesizer
 */
export function generateAudioIdsAndClips({
  appStrings,
  electionStrings,
  speechSynthesizer,
  getOverride = () => 'useTts',
}: {
  appStrings: UiStringsPackage;
  electionStrings: UiStringsPackage;
  speechSynthesizer: SpeechSynthesizer;
  getOverride?: (key: string, substring?: string) => UiStringAudioOverride;
}): {
  uiStringAudioIds: UiStringAudioIdsPackage;
  uiStringAudioClips: NodeJS.ReadableStream;
} {
  const uiStringAudioIds: UiStringAudioIdsPackage = {};
  const textToSynthesizeSpeechFor: TextToSynthesizeSpeechFor[] = [];
  const audioIdOverrides: AudioIdOverride[] = [];

  function populateUiStringAudioIds({
    languageCode,
    stringKey,
    stringInLanguage,
  }: {
    languageCode: LanguageCode;
    stringKey: string | [string, string];
    stringInLanguage: string;
  }): void {
    let key: string;
    let subkey: string | undefined;

    if (typeof stringKey === 'string') {
      key = stringKey;
    } else {
      [key, subkey] = stringKey;
    }

    const override = getOverride(key, subkey);

    /* istanbul ignore next - @preserve */
    switch (override) {
      case 'drop':
        return;

      case 'useTts':
        break;

      default: {
        let audioId = audioIdForText(languageCode, stringInLanguage);
        audioId = `${key}-${audioId}`;
        setUiStringAudioIds(uiStringAudioIds, languageCode, stringKey, [
          audioId,
        ]);

        audioIdOverrides.push({
          audioId,
          getDataUrl: override.getDataUrl,
          languageCode,
        });

        return;
      }
    }

    const segmentsWithAudioIds = prepareTextForSpeechSynthesis(
      languageCode,
      stringInLanguage
    );
    setUiStringAudioIds(
      uiStringAudioIds,
      languageCode,
      stringKey,
      // We re-purpose contest names as district IDs for LA state, which
      // means that they end up with the same audio IDs, which clash with
      // contest audio overrides. Need to distinguish between those two:
      segmentsWithAudioIds.map(({ audioId }) => `${key}-${audioId}`)
    );

    textToSynthesizeSpeechFor.push(
      ...segmentsWithAudioIds
        .filter(({ segment }) => !segment.isInterpolated)
        .map(({ audioId, segment }) => ({
          // We re-purpose contest names as district IDs for LA state, which
          // means that they end up with the same audio IDs, which clash with
          // contest audio overrides. Need to distinguish between those two:
          audioId: `${key}-${audioId}`,
          languageCode,
          text: segment.content,
        }))
    );
  }

  // Prepare UI string audio IDs
  forEachUiString(appStrings, populateUiStringAudioIds);
  forEachUiString(electionStrings, populateUiStringAudioIds);

  // Prepare UI string audio clips
  async function* uiStringAudioClipGenerator() {
    /* istanbul ignore next - @preserve */
    for (const o of audioIdOverrides) {
      const uiStringAudioClip: UiStringAudioClip = {
        dataBase64: await o.getDataUrl(),
        id: o.audioId,
        languageCode: o.languageCode,
      };
      yield `${JSON.stringify(uiStringAudioClip)}\n`;
    }

    for (const { audioId, languageCode, text } of textToSynthesizeSpeechFor) {
      const uiStringAudioClip: UiStringAudioClip = {
        dataBase64: await speechSynthesizer.synthesizeSpeech(
          text,
          languageCode
        ),
        id: audioId,
        languageCode,
      };
      yield `${JSON.stringify(uiStringAudioClip)}\n`;
    }
  }
  const uiStringAudioClips = Readable.from(uiStringAudioClipGenerator());

  return { uiStringAudioIds, uiStringAudioClips };
}
