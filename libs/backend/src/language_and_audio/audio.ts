import { Readable } from 'node:stream';
import {
  UiStringAudioClip,
  UiStringAudioIdsPackage,
  UiStringTtsInput,
  UiStringsPackage,
  TtsEditEntry,
  LanguageCode,
} from '@votingworks/types';

import { assert } from '@votingworks/basics';
import { SpeechSynthesizer } from './speech_synthesizer';
import {
  audioIdForText,
  forEachUiString,
  prepareTextForSpeechSynthesis,
  setUiStringAudioIds,
} from './utils';

interface TextToSynthesizeSpeechFor {
  audioId: string;
  input: UiStringTtsInput;
}

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
  const ttsStrings: TextToSynthesizeSpeechFor[] = [];

  // Prepare app strings for synthesis:
  forEachUiString(ctx.appStrings, (str) => {
    const { audioId, text } = prepareTextForSpeechSynthesis(
      str.languageCode,
      str.stringInLanguage
    );

    setUiStringAudioIds(audioIds, str.languageCode, str.stringKey, [audioId]);

    ttsStrings.push({
      audioId,
      input: {
        exportSource: 'text',
        key: str.stringKey,
        languageCode: str.languageCode,
        phonetic: [],
        text,
      },
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
    const edit = ttsEdits.get(
      editKey({ lang: str.languageCode, original: str.stringInLanguage })
    );

    if (edit) {
      const audioId = audioIdForText(str.languageCode, edit.original);
      setUiStringAudioIds(audioIds, str.languageCode, str.stringKey, [audioId]);

      ttsStrings.push({
        audioId,
        input: { ...edit, key: str.stringKey },
      });

      return;
    }

    const { audioId, text } = prepareTextForSpeechSynthesis(
      str.languageCode,
      str.stringInLanguage
    );

    setUiStringAudioIds(audioIds, str.languageCode, str.stringKey, [audioId]);

    ttsStrings.push({
      audioId,
      input: {
        exportSource: 'text',
        key: str.stringKey,
        languageCode: str.languageCode,
        phonetic: [],
        text,
      },
    });
  });

  // Prepare UI string audio clips
  async function* uiStringAudioClipGenerator() {
    /**
     * It's possible for the same text (and the same audioId) to appear multiple
     * times in an election under different string keys (e.g. a candidate name
     * in multiple contests, contests with the same title, etc).
     * Tracking seen IDs to avoid exporting the same clip multiple times.
     */
    const seenAudioIds = new Set<string>();

    let i = 0;
    ctx.emitProgress?.(i, ttsStrings.length);

    for (const str of ttsStrings) {
      if (seenAudioIds.has(str.audioId)) continue;
      seenAudioIds.add(str.audioId);

      // [TODO](https://github.com/votingworks/vxsuite/issues/7264): Support
      // synthesis from phonetic edits.
      assert(
        str.input.exportSource === 'text',
        'phonetic-based TTS not yet implemented'
      );

      const clip: UiStringAudioClip = {
        dataBase64: await ctx.speechSynthesizer.synthesizeSpeech(
          str.input.text,
          str.input.languageCode as LanguageCode
        ),
        id: str.audioId,
        languageCode: str.input.languageCode,
      };

      yield `${JSON.stringify(clip)}\n`;

      i += 1;
      ctx.emitProgress?.(i, ttsStrings.length);
    }
  }
  const uiStringAudioClips = Readable.from(uiStringAudioClipGenerator());

  return { uiStringAudioIds: audioIds, uiStringAudioClips };
}
