import { format } from '@votingworks/utils';
import { useLanguageContext } from './language_context';
import { FontProps } from '../typography';

export interface DateStringProps extends FontProps {
  value: Date;
}
export function DateString({ value }: DateStringProps): JSX.Element {
  const languageContext = useLanguageContext();
  return (
    <span>
      {format.localeLongDate(value, languageContext?.currentLanguageCode)}
    </span>
  );
}
