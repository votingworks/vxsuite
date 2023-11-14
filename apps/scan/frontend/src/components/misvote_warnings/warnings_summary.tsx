import {
  Caption,
  List,
  ListItem,
  NumberString,
  appStrings,
} from '@votingworks/ui';
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
              {appStrings.labelContestsWithNoVotes()}{' '}
              <NumberString weight="bold" value={blankContests.length} />
            </ListItem>
          </Caption>
        )}
        {partiallyVotedContests.length > 0 && (
          <Caption>
            <ListItem>
              {appStrings.labelContestsWithVotesRemaining()}{' '}
              <NumberString
                weight="bold"
                value={partiallyVotedContests.length}
              />
            </ListItem>
          </Caption>
        )}
        {overvoteContests.length > 0 && (
          <Caption>
            <ListItem>
              {appStrings.labelContestsWithTooManyVotes()}{' '}
              <NumberString weight="bold" value={overvoteContests.length} />
            </ListItem>
          </Caption>
        )}
      </List>
      <WarningDetailsModalButton {...props} />
    </React.Fragment>
  );
}
