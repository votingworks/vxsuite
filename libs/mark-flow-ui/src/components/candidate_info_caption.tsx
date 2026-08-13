import { Candidate, Election } from '@votingworks/types';
import { appStrings, CandidatePartyList } from '@votingworks/ui';
import React from 'react';

interface CandidateInfoCaptionProps {
  candidate: Candidate;
  election: Election;
  matchesSelectedStraightParty: boolean;
  audioOnly?: JSX.Element;
}

/**
 * Renders non-name information about a candidate.
 */
export function CandidateInfoCaption({
  candidate,
  election,
  matchesSelectedStraightParty,
  audioOnly,
}: CandidateInfoCaptionProps): JSX.Element {
  return (
    <React.Fragment>
      <CandidatePartyList
        candidate={candidate}
        electionParties={election.parties}
      />
      {matchesSelectedStraightParty && (
        <span>
          {' - '}
          {appStrings.labelStraightPartyVote()}
        </span>
      )}
      {audioOnly && <React.Fragment>{audioOnly}</React.Fragment>}
    </React.Fragment>
  );
}
