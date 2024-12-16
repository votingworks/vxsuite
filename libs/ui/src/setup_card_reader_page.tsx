import { Main } from './main';
import { Screen } from './screen';
import { H1, P } from './typography';

interface Props {
  usePollWorkerLanguage?: boolean;
}

export function SetupCardReaderPage({
  usePollWorkerLanguage = true,
}: Props): JSX.Element {
  const connectMessage = usePollWorkerLanguage
    ? 'Please ask a poll worker to connect card reader.'
    : 'Please connect the card reader to continue.';

  return (
    <Screen>
      <Main centerChild>
        <H1>Card Reader Not Detected</H1>
        <P>{connectMessage}</P>
      </Main>
    </Screen>
  );
}
