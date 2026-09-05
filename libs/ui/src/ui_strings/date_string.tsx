import { format } from '@votingworks/utils';
import { useLanguageContext } from './language_context.js';
import { FontProps } from '../typography.js';

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
