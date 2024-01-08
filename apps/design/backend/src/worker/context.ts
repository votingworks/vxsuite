import { GoogleCloudSpeechSynthesizer } from '../language_and_audio/speech_synthesizer';
import { GoogleCloudTranslator } from '../language_and_audio/translator';
import { Workspace } from '../workspace';

export interface WorkerContext {
  speechSynthesizer: GoogleCloudSpeechSynthesizer;
  translator: GoogleCloudTranslator;
  workspace: Workspace;
}
