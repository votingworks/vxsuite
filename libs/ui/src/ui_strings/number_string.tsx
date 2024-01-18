import { format } from '@votingworks/utils';
import { useLanguageContext } from './language_context';
import { Font, FontProps } from '../typography';
import { WithAudio } from './with_audio';

export interface NumberStringProps extends FontProps {
  value: number;
}
export function NumberString(props: NumberStringProps): JSX.Element {
  const { value, ...rest } = props;

  const languageContext = useLanguageContext();

  return (
    <Font {...rest}>
      <WithAudio i18nKey={`number.${value}`}>
        {format.count(value, languageContext?.currentLanguageCode)}
      </WithAudio>
    </Font>
  );
}
