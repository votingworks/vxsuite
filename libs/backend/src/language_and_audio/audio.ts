import { Readable } from 'node:stream';
import {
  UiStringAudioClip,
  UiStringAudioIdsPackage,
  UiStringTtsInput,
  UiStringsPackage,
  TtsEditEntry,
  LanguageCode,
  ElectionStringKey,
  phonemes,
  PhoneticSyllable,
} from '@votingworks/types';

import { assert } from '@votingworks/basics';
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
      recordingDataUrl: '',
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
      recordingDataUrl: '',
      text,
    });
  });

  // Prepare UI string audio clips
  async function* uiStringAudioClipGenerator() {
    let i = 0;
    ctx.emitProgress?.(i, ttsStrings.size);

    for (const [audioId, str] of ttsStrings.entries()) {
      if (str.exportSource === 'recorded') {
        const clip: UiStringAudioClip = {
          dataBase64: str.recordingDataUrl,
          id: audioId,
          languageCode: str.languageCode,
        };

        yield `${JSON.stringify(clip)}\n`;

        continue;
      }

      if (str.exportSource === 'phonetic' && str.phonetic.length) {
        const chunks: string[] = ['<speak>'];
        for (const { syllables, text } of str.phonetic) {
          chunks.push(
            syllables
              ? ssmlWord(syllables, str.languageCode as LanguageCode)
              : text
          );
        }
        chunks.push('</speak>');

        const clip: UiStringAudioClip = {
          dataBase64: await ctx.speechSynthesizer.fromSsml(
            chunks.join(' '),
            str.languageCode as LanguageCode
          ),
          id: audioId,
          languageCode: str.languageCode,
        };

        yield `${JSON.stringify(clip)}\n`;

        continue;
      }

      assert(str.exportSource === 'text');

      const clip: UiStringAudioClip = {
        dataBase64: await ctx.speechSynthesizer.synthesizeSpeech(
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

function ssmlWord(syllables: PhoneticSyllable[], lang: LanguageCode) {
  let combinedPhonemes = '';
  for (const [i, syllable] of syllables.entries()) {
    if (syllable.ipaPhonemes.length === 0) continue;

    if (syllable.stress === 'primary') {
      combinedPhonemes += phonemes[lang].stresses.primary.ipa;
    } else if (syllable.stress === 'secondary') {
      combinedPhonemes += phonemes[lang].stresses.secondary.ipa;
    } else if (i > 0) {
      combinedPhonemes += '.';
    }

    for (const phoneme of syllable.ipaPhonemes) combinedPhonemes += phoneme;
  }

  return `<phoneme alphabet="ipa" ph="${combinedPhonemes}" />`;
}
