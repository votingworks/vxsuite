import { Readable } from 'node:stream';
import {
  UiStringAudioClip,
  UiStringAudioIdsPackage,
  UiStringTtsInput,
  UiStringsPackage,
  TtsEditEntry,
  LanguageCode,
  ElectionStringKey,
} from '@votingworks/types';

import { SpeechSynthesizer } from './speech_synthesizer';
import {
  audioIdForText,
  cleanText,
  forEachUiString,
  prepareTextForSpeechSynthesis,
  setUiStringAudioIds,
} from './utils';
import { convertHtmlToAudioCues } from './rich_text';

/**
 * Generates audio IDs and clips for all app and election strings provided with
 * the given speech synthesizer
 */
export function generateAudioIdsAndClips(ctx: {
  appStrings: UiStringsPackage;
  electionStrings: UiStringsPackage;
  electionTtsEdits: TtsEditEntry[];
  speechSynthesizer: SpeechSynthesizer;
  emitProgress?: (progress: number, total: number) => void;
}): {
  uiStringAudioIds: UiStringAudioIdsPackage;
  uiStringAudioClips: NodeJS.ReadableStream;
} {
  const audioIds: UiStringAudioIdsPackage = {};
  /**
   * NOTE: It's possible for the same text (and the same audioId) to appear
   * multiple times in an election under different string keys (e.g. a candidate
   * name in multiple contests, contests with the same title, etc).
   * De-duping with a `Map` to avoid exporting the same clip multiple times.
   */
  const ttsStrings = new Map<string, UiStringTtsInput>();

  // Prepare app strings for synthesis:
  forEachUiString(ctx.appStrings, (str) => {
    const { audioId, text } = prepareTextForSpeechSynthesis(
      str.languageCode,
      str.stringInLanguage
    );

    setUiStringAudioIds(audioIds, str.languageCode, str.stringKey, [audioId]);

    ttsStrings.set(audioId, {
      exportSource: 'text',
      key: str.stringKey,
      languageCode: str.languageCode,
      phonetic: [],
      text,
    });
  });

  /** Constructs a map key for TTS edits. */
  function editKey(p: { lang: string; original: string }) {
    return [p.lang, p.original].join('.');
  }

  // Set up lookup table for election string TTS edits:
  const ttsEdits = new Map<string, TtsEditEntry>();
  for (const ttsString of ctx.electionTtsEdits) {
    ttsEdits.set(
      editKey({ lang: ttsString.languageCode, original: ttsString.original }),
      ttsString
    );
  }

  // Prepare election strings/edits for synthesis:
  forEachUiString(ctx.electionStrings, (str) => {
    const primaryStringKey =
      typeof str.stringKey === 'string' ? str.stringKey : str.stringKey[0];

    const text =
      primaryStringKey === ElectionStringKey.CONTEST_DESCRIPTION
        ? // TTS edits for ballot measure text are keyed on original strings
          // after stripping out HTML.
          convertHtmlToAudioCues(str.stringInLanguage)
        : cleanText(str.stringInLanguage);

    const audioId = audioIdForText(str.languageCode, text);
    setUiStringAudioIds(audioIds, str.languageCode, str.stringKey, [audioId]);

    const edit = ttsEdits.get(
      editKey({ lang: str.languageCode, original: text })
    );
    if (edit) {
      ttsStrings.set(audioId, { ...edit, key: str.stringKey });
      return;
    }

    ttsStrings.set(audioId, {
      exportSource: 'text',
      key: str.stringKey,
      languageCode: str.languageCode,
      phonetic: [],
      text,
    });
  });

  // Prepare UI string audio clips
  async function* uiStringAudioClipGenerator() {
    let i = 0;
    ctx.emitProgress?.(i, ttsStrings.size);

    for (const [audioId, str] of ttsStrings.entries()) {
      const clip: UiStringAudioClip = {
        dataBase64:
          str.exportSource === 'phonetic'
            ? await ctx.speechSynthesizer.fromSsml(
                str.phonetic,
                str.languageCode as LanguageCode
              )
            : await ctx.speechSynthesizer.fromText(
                str.text,
                str.languageCode as LanguageCode
              ),
        id: audioId,
        languageCode: str.languageCode,
      };

      yield `${JSON.stringify(clip)}\n`;

      i += 1;
      ctx.emitProgress?.(i, ttsStrings.size);
    }
  }
  const uiStringAudioClips = Readable.from(uiStringAudioClipGenerator());

  return { uiStringAudioIds: audioIds, uiStringAudioClips };
}
