import { Icons, P } from '@votingworks/ui';
import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export interface PaperReloadedPageProps {
  votesSelected: boolean;
}

export function PaperReloadedPage(props: PaperReloadedPageProps): JSX.Element {
  const { votesSelected } = props;

  // Messy, but this flow eventually ends up in BallotContext. By setting path now
  // we ensure we render the correct page once poll worker auth is ended. If we don't
  // set the path now, we'll incorrectly render PrintPage (the last ballot screen rendered).
  const goToUrl = useHistory().push;
  useEffect(() => {
    goToUrl(votesSelected ? '/ready-to-review' : '/');
  }, [goToUrl, votesSelected]);

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
