import { Caption, H6, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function ScannerOpenAlarmScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Danger color="danger" />}
      title="Printer Cover Open"
      voterFacing
    >
      <P>The printer cover is open and must be closed to continue voting.</P>
      <P>Please ask a poll worker for help.</P>

      {/* Poll Worker strings - not translated: */}
      <H6 as="h2">
        <Icons.Info /> Poll Workers:
      </H6>
      <P>
        <Caption>
          Insert a poll worker card to silence the alert. Close and seal the
          cover to resume voting.
        </Caption>
      </P>
    </CenteredCardPageLayout>
  );
}
