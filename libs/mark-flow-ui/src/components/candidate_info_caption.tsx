import React from 'react';
import { Candidate, Election } from '@votingworks/types';
import {
  appStrings,
  CandidatePartyList,
  electionStrings,
} from '@votingworks/ui';

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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: '0.15rem',
      }}
    >
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
      {candidate.designation && (
        <span>{electionStrings.candidateDesignation(candidate)}</span>
      )}
      {audioOnly && <React.Fragment>{audioOnly}</React.Fragment>}
    </div>
  );
}
