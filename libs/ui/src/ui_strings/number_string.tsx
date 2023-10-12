import { format } from '@votingworks/utils';
import { useLanguageContext } from './language_context';

export interface NumberStringProps {
  value: number;
}
export function NumberString(props: NumberStringProps): JSX.Element {
  const { value } = props;

  const languageContext = useLanguageContext();

  return (
    // TODO(kofi): fetch audio ID(s) for the given value.
    <span data-audio-ids={undefined}>
      {format.count(value, languageContext?.currentLanguageCode)}
    </span>
  );
}
