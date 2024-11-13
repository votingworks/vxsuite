import { Caption, Icons, LoadPaperAnimation, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';

export function LoadPaperPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Info />}
      title="Load Ballot Sheet"
      titleCentered
      voterFacing={false}
      buttons={
        <ResetVoterSessionButton icon="Previous" variant="neutral">
          Start a New Voting Session
        </ResetVoterSessionButton>
      }
    >
      <LoadPaperAnimation />
      <P>
        Feed one sheet of paper into the front input tray with the notched
        corner on the right side.
      </P>
      <Caption>
        <Icons.Info /> If you would like to return to the previous screen and
        start a new session, press the button below.
      </Caption>
    </CenteredCardPageLayout>
  );
}
