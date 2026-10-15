import { useLayoutConfig } from './use_layout_config_hook.js';
import { WarningsSummary } from './warnings_summary.js';
import { WarningDetails } from './warning_details.js';
import type { MisvoteWarningsProps } from './types.js';

export function MisvoteWarnings(props: MisvoteWarningsProps): JSX.Element {
  const {
    blankContests,
    marginalMarkContests,
    overvoteContests,
    partiallyVotedContests,
  } = props;
  const layout = useLayoutConfig(props);

  // Show a summary of warnings with button to view details if we can't fit all
  // the details on the main ScanWarningScreen without needing to scroll.
  if (layout.showSummaryInPreview) {
    return (
      <WarningsSummary
        blankContests={blankContests}
        marginalMarkContests={marginalMarkContests}
        overvoteContests={overvoteContests}
        partiallyVotedContests={partiallyVotedContests}
      />
    );
  }

  return (
    <WarningDetails
      blankContests={blankContests}
      marginalMarkContests={marginalMarkContests}
      overvoteContests={overvoteContests}
      partiallyVotedContests={partiallyVotedContests}
    />
  );
}
