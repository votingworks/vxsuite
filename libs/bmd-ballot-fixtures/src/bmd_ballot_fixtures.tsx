import React from 'react';
import { renderToPdf } from '@votingworks/printing';
import { ElectionDefinition, VotesDict } from '@votingworks/types';
import { BmdPaperBallot, BmdPaperBallotProps } from '@votingworks/ui';
import { Buffer } from 'buffer';

export async function renderBmdBallotFixture(
  props: Partial<BmdPaperBallotProps> & {
    electionDefinition: ElectionDefinition;
  }
): Promise<Buffer> {
  // Set some default props that can be overriden by the caller
  const {
    electionDefinition: { election },
  } = props;
  const ballotStyle = election.ballotStyles[0];
  const precinctId = ballotStyle.precincts[0];
  const votes: VotesDict = {};
  const ballot = (
    <React.Fragment>
      <BmdPaperBallot
        isLiveMode={false}
        generateBallotId={() => '1'}
        machineType="mark"
        ballotStyleId={ballotStyle.id}
        precinctId={precinctId}
        votes={votes}
        {...props}
      />
      <div style={{ pageBreakAfter: 'always' }} />
    </React.Fragment>
  );

  return renderToPdf({ document: ballot });
}
