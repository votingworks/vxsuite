import { Readable } from 'stream';
import {
  LanguageCode,
  UiStringAudioClip,
  UiStringAudioIdsPackage,
  UiStringsPackage,
} from '@votingworks/types';

import { GoogleCloudSpeechSynthesizer } from './speech_synthesizer';
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

export function generateAudioIdsAndClips({
  appStrings,
  electionStrings,
  speechSynthesizer,
}: {
  appStrings: UiStringsPackage;
  electionStrings: UiStringsPackage;
  speechSynthesizer: GoogleCloudSpeechSynthesizer;
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
