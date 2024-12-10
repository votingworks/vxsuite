import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from './translator';
import { Workspace } from './workspace';

export interface AppContext {
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
}
