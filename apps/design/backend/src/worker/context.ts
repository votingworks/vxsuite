import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '../language_and_audio';
import { Workspace } from '../workspace';

export interface WorkerContext {
  speechSynthesizer: GoogleCloudSpeechSynthesizer;
  translator: GoogleCloudTranslator;
  workspace: Workspace;
}
