import { useLayoutConfig } from './use_layout_config_hook';
import { WarningsSummary } from './warnings_summary';
import { WarningDetails } from './warning_details';
import { MisvoteWarningsProps } from './types';

export function MisvoteWarnings(props: MisvoteWarningsProps): JSX.Element {
  const { blankContests, overvoteContests, partiallyVotedContests } = props;
  const layout = useLayoutConfig(props);

  // Show a summary of warnings with button to view details if we can't fit all
  // the details on the main ScanWarningScreen without needing to scroll.
  if (layout.showSummaryInPreview) {
    return (
      <WarningsSummary
        blankContests={blankContests}
        overvoteContests={overvoteContests}
        partiallyVotedContests={partiallyVotedContests}
      />
    );
  }

  return (
    <WarningDetails
      blankContests={blankContests}
      overvoteContests={overvoteContests}
      partiallyVotedContests={partiallyVotedContests}
    />
  );
}
