import React from 'react';

import { appStrings, Caption, Font, Icons, P } from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';

import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';
import * as api from '../api';

export function InsertedWrongTestModeBallotScreen(): React.ReactNode {
  const interpretationQuery = api.getInterpretation.useQuery();

  if (!interpretationQuery.isSuccess) {
    return null;
  }

  const interpretation = assertDefined(interpretationQuery.data);
  assert(interpretation.type === 'InvalidTestModePage');

  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title="Wrong Ballot Mode"
      voterFacing={false}
    >
      {interpretation.metadata.isTestMode ? (
        <React.Fragment>
          <P>{appStrings.warningBmdInvalidBallotTestBallotInLiveMode()}</P>
          <P>
            Remove the sheet and insert an <Font weight="bold">official</Font>{' '}
            ballot.
          </P>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <P>{appStrings.warningBmdInvalidBallotLiveBallotInTestMode()}</P>
          <P>
            Remove the sheet and insert a <Font weight="bold">test</Font>{' '}
            ballot.
          </P>
        </React.Fragment>
      )}
      <Caption>
        <Icons.Info /> Insert a blank sheet to start a new voting session.
      </Caption>
    </CenteredCardPageLayout>
  );
}
