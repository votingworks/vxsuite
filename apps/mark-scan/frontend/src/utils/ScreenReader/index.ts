/* istanbul ignore file */
import { SpeechSynthesisTextToSpeech } from './speech_synthesis_text_to_speech';
import { KioskTextToSpeech } from './kiosk_text_to_speech';
import { AriaScreenReader } from './aria_screen_reader';
import type { ScreenReader } from '../../config/types';

export type { ScreenReader };
export { AriaScreenReader, SpeechSynthesisTextToSpeech, KioskTextToSpeech };
