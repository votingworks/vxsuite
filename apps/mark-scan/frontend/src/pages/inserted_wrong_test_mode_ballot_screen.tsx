import React from 'react';

import { Caption, Font, Icons, P } from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';

import * as api from '../api';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

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
          <P>
            The inserted sheet contains a <Font weight="bold">test</Font>{' '}
            ballot.
          </P>
          <P>
            Please remove the sheet and insert an{' '}
            <Font weight="bold">official</Font> ballot.
          </P>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <P>
            The inserted sheet contains an <Font weight="bold">official</Font>{' '}
            ballot.
          </P>
          <P>
            Please remove the sheet and insert a <Font weight="bold">test</Font>{' '}
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
