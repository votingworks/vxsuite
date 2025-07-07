import { Icons, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function ReplaceBlankSheetPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning />}
      title="Load New Ballot Sheet"
      voterFacing={false}
    >
      <P>
        The ballot page is blank after printing. It may have been loaded with
        the print side facing down. Please remove the ballot sheet and load a
        new sheet.
      </P>
    </CenteredCardPageLayout>
  );
}
