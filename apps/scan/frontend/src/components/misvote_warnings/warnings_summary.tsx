import { Caption, Font, List, ListItem } from '@votingworks/ui';
import pluralize from 'pluralize';
import React from 'react';
import { WarningDetailsModalButton } from './warning_details_modal_button';
import { MisvoteWarningsProps } from './types';

export function WarningsSummary(props: MisvoteWarningsProps): JSX.Element {
  const { blankContests, overvoteContests, partiallyVotedContests } = props;

  return (
    <React.Fragment>
      <List>
        {blankContests.length > 0 && (
          <Caption>
            <ListItem>
              No votes marked in{' '}
              <Font weight="bold">{blankContests.length}</Font>{' '}
              {pluralize('contest', blankContests.length)}.
            </ListItem>
          </Caption>
        )}
        {partiallyVotedContests.length > 0 && (
          <Caption>
            <ListItem>
              You may add one or more votes in{' '}
              <Font weight="bold">{partiallyVotedContests.length}</Font>{' '}
              {pluralize('contest', partiallyVotedContests.length)}.
            </ListItem>
          </Caption>
        )}
        {overvoteContests.length > 0 && (
          <Caption>
            <ListItem>
              Too many votes marked in{' '}
              <Font weight="bold">{overvoteContests.length}</Font>{' '}
              {pluralize('contest', overvoteContests.length)}.
            </ListItem>
          </Caption>
        )}
      </List>
      <WarningDetailsModalButton {...props} />
    </React.Fragment>
  );
}
