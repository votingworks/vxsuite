import React from 'react';

import { appStrings, Caption, Icons, P } from '@votingworks/ui';

import { assert, assertDefined } from '@votingworks/basics';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';
import * as api from '../api';

export function ReinsertedWrongTestModeBallotScreen(): React.ReactNode {
  const interpretationQuery = api.getInterpretation.useQuery();

  if (!interpretationQuery.isSuccess) {
    return null;
  }

  const interpretation = assertDefined(interpretationQuery.data);
  assert(interpretation.type === 'InvalidTestModePage');

  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.titleBmdInvalidBallotWrongTestMode()}
      voterFacing
    >
      <P>
        {interpretation.metadata.isTestMode
          ? appStrings.warningBmdInvalidBallotTestBallotInLiveMode()
          : appStrings.warningBmdInvalidBallotLiveBallotInTestMode()}
      </P>
      <P>{appStrings.instructionsBmdInsertPreviouslyPrintedBallot()}</P>
      <Caption>
        <Icons.Question /> {appStrings.noteAskPollWorkerForHelp()}
      </Caption>
    </CenteredCardPageLayout>
  );
}
