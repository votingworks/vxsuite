import { Main, Screen, Text, H1 } from '@votingworks/ui';
import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';

export function PaperReloadedPage(): JSX.Element {
  // Messy, but this flow eventually ends up in BallotContext. By setting path now
  // we ensure we render the correct page once poll worker auth is ended. If we don't
  // set the path now, we'll incorrectly render PrintPage (the last ballot screen rendered).
  const history = useHistory();
  useEffect(() => {
    history.push('/ready-to-review');
  });

  return (
    <Screen>
      <Main padded centerChild>
        <Text center>
          <H1>Remove Poll Worker Card</H1>
          <p>
            The ballot sheet has been loaded. Remove the poll worker card to
            continue.
          </p>
        </Text>
      </Main>
    </Screen>
  );
}
