import { Icons, P } from '@votingworks/ui';
import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function PaperReloadedPage(): JSX.Element {
  // Messy, but this flow eventually ends up in BallotContext. By setting path now
  // we ensure we render the correct page once poll worker auth is ended. If we don't
  // set the path now, we'll incorrectly render PrintPage (the last ballot screen rendered).
  const history = useHistory();
  useEffect(() => {
    history.push('/ready-to-review');
  });

  return (
    <CenteredCardPageLayout
      icon={<Icons.Done color="success" />}
      title="Remove Poll Worker Card"
      voterFacing={false}
    >
      <P>The ballot sheet has been loaded.</P>
      <P>Remove the poll worker card to continue.</P>
    </CenteredCardPageLayout>
  );
}
