import { AudioOnly, LanguageOverride } from '../../ui_strings';
import { useCurrentLanguage } from '../../hooks/use_current_language';
import { Key } from '../common';

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
