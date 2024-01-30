import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { useLanguageContext } from './language_context';
import { Font, FontProps } from '../typography';
import { WithAudio } from './with_audio';
import {
  MAXIMUM_SUPPORTED_NUMBER_FOR_TTS,
  getI18nKeyForNumber,
} from './number_strings';
import { useAudioContext } from './audio_context';

export interface NumberStringProps extends FontProps {
  value: number;
}

/**
 * Renders a screen-reader-compatible number, formatted in the current user
 * language.
 *
 * Only supports numbers up to {@link MAXIMUM_SUPPORTED_NUMBER_FOR_TTS}. If
 * audio is needed for a larger number, update the constant value and run
 * `pnpm build:app-strings-catalog` to export the new numbers for audio
 * generation.
 *
 * Use {@link format.count} directly
 */
export function NumberString(props: NumberStringProps): JSX.Element {
  const { value, ...rest } = props;

  const languageContext = useLanguageContext();
  const isInAudioContext = Boolean(useAudioContext());

  if (isInAudioContext) {
    assert(
      value >= 0 && value <= MAXIMUM_SUPPORTED_NUMBER_FOR_TTS,
      [
        `No audio available for number ${value}.`,
        `<NumberString> only supports audio for numbers 0 through ${MAXIMUM_SUPPORTED_NUMBER_FOR_TTS}.`,
        'Update the value of MAXIMUM_SUPPORTED_NUMBER_FOR_TTS if audio is needed for larger numbers.',
      ].join(' ')
    );
  }

  return (
    <Font {...rest}>
      <WithAudio i18nKey={getI18nKeyForNumber(value)}>
        {format.count(value, languageContext?.currentLanguageCode)}
      </WithAudio>
    </Font>
  );
}
