import { Buffer } from 'node:buffer';
import { TextToSpeechClient as GoogleCloudTextToSpeechClient } from '@google-cloud/text-to-speech';
import { assertDefined } from '@votingworks/basics';
import { LanguageCode } from '@votingworks/types';
import { parse as parseHtml, Node, HTMLElement } from 'node-html-parser';

import { Store } from '../store';
import { rootDebug } from '../debug';

const debug = rootDebug.extend('speech');

export interface SpeechSynthesizer {
  synthesizeSpeech(text: string, languageCode: LanguageCode): Promise<string>;
}

/**
 * Available voices are listed at https://cloud.google.com/text-to-speech/docs/voices.
 *
 * TODO: Decide which voices we want to use.
 */
export const GoogleCloudVoices: Record<
  LanguageCode,
  { languageCode: string; name: string }
> = {
  [LanguageCode.CHINESE_SIMPLIFIED]: {
    languageCode: 'cmn-CN',
    name: 'cmn-CN-Wavenet-B',
  },
  [LanguageCode.CHINESE_TRADITIONAL]: {
    languageCode: 'cmn-CN',
    name: 'cmn-CN-Wavenet-B',
  },
  [LanguageCode.ENGLISH]: { languageCode: 'en-US', name: 'en-US-Neural2-J' },
  [LanguageCode.SPANISH]: { languageCode: 'es-US', name: 'es-US-Neural2-B' },
};

/**
 * The subset of {@link GoogleCloudTextToSpeechClient} that we actually use
 */
export type MinimalGoogleCloudTextToSpeechClient = Pick<
  GoogleCloudTextToSpeechClient,
  'synthesizeSpeech'
>;

type SimpleHtmlNode =
  | { tagName: string; childNodes: SimpleHtmlNode[] }
  | { textContent: string };

// Convert HTML nodes to a plain data structure since it's more difficult to to
// modify the Nodes returned by the parser.
function simplifyHtml(node: Node): SimpleHtmlNode {
  if (node instanceof HTMLElement) {
    return {
      tagName: node.tagName ?? 'ROOT',
      childNodes: node.childNodes.map(simplifyHtml),
    };
  }
  return { textContent: node.textContent };
}

function mapSimpleHtml(
  node: SimpleHtmlNode,
  fn: (node: SimpleHtmlNode) => SimpleHtmlNode
): SimpleHtmlNode {
  if ('childNodes' in node) {
    return fn({
      tagName: node.tagName,
      childNodes: node.childNodes.map((child) => mapSimpleHtml(child, fn)),
    });
  }
  return fn(node);
}

function simpleHtmlToText(node: SimpleHtmlNode): string {
  if ('childNodes' in node) {
    return node.childNodes.map(simpleHtmlToText).join('');
  }
  return node.textContent;
}

/**
 * Converts HTML tags to useful audio cues for the listener. Google Cloud
 * Text-to-Speech does not accept HTML tags, so we need to remove them. However,
 * removing them may change the meaning of the text, so we attempt to preserve
 * meaning by adding audio cues. Note that emphasis is not preserved, since it's
 * not crucial to understanding the meaning of the text.
 */
export function convertHtmlToAudioCues(text: string): string {
  const root = parseHtml(text);
  const simpleRoot = simplifyHtml(root);
  const convertedRoot = mapSimpleHtml(simpleRoot, (node) => {
    if ('tagName' in node) {
      switch (node.tagName) {
        case 'U':
          return {
            tagName: 'DIV',
            childNodes: [
              { textContent: '[begin underline] ' },
              { ...node },
              { textContent: ' [end underline]' },
            ],
          };
        case 'S':
          return {
            tagName: 'DIV',
            childNodes: [
              { textContent: '[begin strikethrough] ' },
              { ...node },
              { textContent: ' [end strikethrough]' },
            ],
          };
        case 'OL': {
          let itemIndex = 0;
          return {
            ...node,
            childNodes: node.childNodes.map((child) => {
              if ('tagName' in child && child.tagName === 'LI') {
                itemIndex += 1;
                return {
                  ...child,
                  childNodes: [
                    { textContent: `${itemIndex}. ` },
                    ...child.childNodes,
                    { textContent: '\n' },
                  ],
                };
              }
              return child;
            }),
          };
        }
        case 'IMG':
          return { textContent: '[image]' };
        default:
          break;
      }
    }
    return node;
  });
  return simpleHtmlToText(convertedRoot);
}

/**
 * An implementation of {@link SpeechSynthesizer} that uses the Google Cloud Text-to-Speech API
 */
export class GoogleCloudSpeechSynthesizer implements SpeechSynthesizer {
  private readonly store: Store;
  private readonly textToSpeechClient: MinimalGoogleCloudTextToSpeechClient;

  constructor(input: {
    store: Store;
    // Support providing a mock client for tests
    textToSpeechClient?: MinimalGoogleCloudTextToSpeechClient;
  }) {
    this.store = input.store;
    this.textToSpeechClient =
      input.textToSpeechClient ??
      /* istanbul ignore next */ new GoogleCloudTextToSpeechClient();
  }

  async synthesizeSpeech(
    text: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const audioClipBase64FromCache = this.store.getAudioClipBase64FromCache({
      languageCode,
      text,
    });
    if (audioClipBase64FromCache) {
      debug(`🔉 Using cached speech: ${text.slice(0, 20)}...`);
      return audioClipBase64FromCache;
    }

    debug(`🔉 Synthesizing speech: ${text.slice(0, 20)}...`);

    const audioClipBase64 = await this.synthesizeSpeechWithGoogleCloud(
      text,
      languageCode
    );
    this.store.addSpeechSynthesisCacheEntry({
      languageCode,
      text,
      audioClipBase64,
    });
    return audioClipBase64;
  }

  private async synthesizeSpeechWithGoogleCloud(
    text: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const [response] = await this.textToSpeechClient.synthesizeSpeech({
      audioConfig: { audioEncoding: 'MP3' },
      input: { text: convertHtmlToAudioCues(text) },
      voice: GoogleCloudVoices[languageCode],
    });
    const audioClipBase64 = Buffer.from(
      assertDefined(response.audioContent)
    ).toString('base64');
    return audioClipBase64;
  }
}
