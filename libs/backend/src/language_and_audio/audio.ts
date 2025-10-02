import { Readable } from 'node:stream';
import {
  UiStringAudioClip,
  UiStringAudioIdsPackage,
  UiStringsPackage,
  LanguageCode,
} from '@votingworks/types';

import { SpeechSynthesizer } from './speech_synthesizer';
import {
  forEachUiString,
  prepareTextForSpeechSynthesis,
  setUiStringAudioIds,
} from './utils';

interface TextToSynthesizeSpeechFor {
  audioId: string;
  languageCode: LanguageCode;
  text: string;
}
/**
 * Generates audio IDs and clips for all app and election strings provided with the given speech synthesizer
 */
export function generateAudioIdsAndClips({
  appStrings,
  electionStrings,
  speechSynthesizer,
  emitProgress,
}: {
  appStrings: UiStringsPackage;
  electionStrings: UiStringsPackage;
  speechSynthesizer: SpeechSynthesizer;
  emitProgress?: (progress: number, total: number) => void;
}): {
  uiStringAudioIds: UiStringAudioIdsPackage;
  uiStringAudioClips: NodeJS.ReadableStream;
} {
  const uiStringAudioIds: UiStringAudioIdsPackage = {};
  const textToSynthesizeSpeechFor: TextToSynthesizeSpeechFor[] = [];

  function populateUiStringAudioIds({
    languageCode,
    stringKey,
    stringInLanguage,
  }: {
    languageCode: LanguageCode;
    stringKey: string | [string, string];
    stringInLanguage: string;
  }): void {
    const segmentsWithAudioIds = prepareTextForSpeechSynthesis(
      languageCode,
      stringInLanguage
    );
    setUiStringAudioIds(
      uiStringAudioIds,
      languageCode,
      stringKey,
      segmentsWithAudioIds.map(({ audioId }) => audioId)
    );

    textToSynthesizeSpeechFor.push(
      ...segmentsWithAudioIds
        .filter(({ segment }) => !segment.isInterpolated)
        .map(({ audioId, segment }) => ({
          audioId,
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
    emitProgress?.(0, textToSynthesizeSpeechFor.length);
    for (const [
      i,
      { audioId, languageCode, text },
    ] of textToSynthesizeSpeechFor.entries()) {
      const uiStringAudioClip: UiStringAudioClip = {
        dataBase64: await speechSynthesizer.synthesizeSpeech(
          text,
          languageCode
        ),
        id: audioId,
        languageCode,
      };
      emitProgress?.(i + 1, textToSynthesizeSpeechFor.length);
      yield `${JSON.stringify(uiStringAudioClip)}\n`;
    }
  }
  const uiStringAudioClips = Readable.from(uiStringAudioClipGenerator());

  return { uiStringAudioIds, uiStringAudioClips };
}
