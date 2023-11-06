import { format } from '@votingworks/utils';
import { useLanguageContext } from './language_context';
import { Font, FontProps } from '../typography';

export interface NumberStringProps extends FontProps {
  value: number;
}
export function NumberString(props: NumberStringProps): JSX.Element {
  const { value, ...rest } = props;

  const languageContext = useLanguageContext();

  return (
    // TODO(kofi): fetch audio ID(s) for the given value.
    <Font data-audio-ids={undefined} {...rest}>
      {format.count(value, languageContext?.currentLanguageCode)}
    </Font>
  );
}
