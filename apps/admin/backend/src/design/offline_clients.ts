import type {
  MinimalGoogleCloudTextToSpeechClient,
  MinimalGoogleCloudTranslationClient,
} from '@votingworks/backend';

export const OFFLINE_TRANSLATION_CLIENT: MinimalGoogleCloudTranslationClient = {
  translateText(request) {
    return Promise.resolve([
      {
        translations: (request.contents ?? []).map((text) => ({
          translatedText: text,
        })),
      },
      undefined,
      undefined,
    ]);
  },
};

export const OFFLINE_TEXT_TO_SPEECH_CLIENT: MinimalGoogleCloudTextToSpeechClient =
  {
    synthesizeSpeech() {
      return Promise.resolve([
        { audioContent: new Uint8Array() },
        undefined,
        undefined,
      ]);
    },
  };
