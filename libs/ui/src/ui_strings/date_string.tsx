import { format } from '@votingworks/utils';
import { useLanguageContext } from './language_context';

export interface DateStringProps {
  value: Date;
}
export function DateString(props: DateStringProps): JSX.Element {
  const { value } = props;

  const languageContext = useLanguageContext();

  return (
    // TODO(kofi): fetch audio IDs for the given date.
    <span data-audio-ids={undefined}>
      {format.localeLongDate(value, languageContext?.currentLanguageCode)}
    </span>
  );
}
