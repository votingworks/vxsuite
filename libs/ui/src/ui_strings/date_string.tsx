import { format } from '@votingworks/utils';
import { useLanguageContext } from './language_context';
import { Font, FontProps } from '../typography';

export interface DateStringProps extends FontProps {
  value: Date;
}
export function DateString(props: DateStringProps): JSX.Element {
  const { value, ...rest } = props;

  const languageContext = useLanguageContext();

  return (
    // TODO(kofi): fetch audio IDs for the given date.
    <Font data-audio-ids={undefined} {...rest}>
      {format.localeLongDate(value, languageContext?.currentLanguageCode)}
    </Font>
  );
}
