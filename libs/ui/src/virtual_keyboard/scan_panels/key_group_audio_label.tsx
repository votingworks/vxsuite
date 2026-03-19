import { AudioOnly, LanguageOverride } from '../../ui_strings/index.js';
import { useCurrentLanguage } from '../../hooks/use_current_language.js';
import { Key } from '../common.js';

export interface KeyGroupAudioLabelProps {
  keys: Key[];
}

/**
 * Renders an AudioOnly element containing the audio strings for a group of
 * keyboard keys. Each key's audio string is wrapped in its own
 * LanguageOverride to handle mixed-language groups (e.g., English letters
 * alongside user-language punctuation names).
 */
export function KeyGroupAudioLabel({
  keys,
}: KeyGroupAudioLabelProps): JSX.Element {
  const userLanguageCode = useCurrentLanguage();

  return (
    <AudioOnly>
      {keys.map((key) => (
        <LanguageOverride
          key={key.value}
          languageCode={key.audioLanguageOverride || userLanguageCode}
        >
          {key.renderAudioString()}
        </LanguageOverride>
      ))}
    </AudioOnly>
  );
}
