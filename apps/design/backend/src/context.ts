import { AuthClient } from './auth/client';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import { GoogleCloudTranslatorWithDbCache } from './translator';
import { Workspace } from './workspace';

export interface AppContext {
  auth: AuthClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizerWithDbCache;
  translator: GoogleCloudTranslatorWithDbCache;
  workspace: Workspace;
}
