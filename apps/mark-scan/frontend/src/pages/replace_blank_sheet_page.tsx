import { P } from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function ReplaceBlankSheetPage(): JSX.Element {
  return (
    <CenteredPageLayout
      title="Load New Ballot Sheet"
      voterFacing={false}
      textAlign="left"
    >
      <P>
        The ballot page is blank after printing. It may have been loaded with
        the print side facing down. Please remove the ballot sheet and load a
        new sheet.
      </P>
    </CenteredPageLayout>
  );
}
