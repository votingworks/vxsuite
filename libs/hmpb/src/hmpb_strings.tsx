import React from 'react';
import { mapObject } from '@votingworks/basics';
import { UiString } from '@votingworks/ui';

/**
 * Catalog of strings used in the standard VxSuite hmpb ballot design.
 */
export const hmpbStringsCatalog = {
  hmpbOfficialBallot: 'Official Ballot',
  hmpbSampleBallot: 'Sample Ballot',
  hmpbTestBallot: 'Test Ballot',
  hmpbOfficialAbsenteeBallot: 'Official Absentee Ballot',
  hmpbSampleAbsenteeBallot: 'Sample Absentee Ballot',
  hmpbTestAbsenteeBallot: 'Test Absentee Ballot',
  hmpbOfficialProvisionalBallot: 'Official Provisional Ballot',
  hmpbSampleProvisionalBallot: 'Sample Provisional Ballot',
  hmpbTestProvisionalBallot: 'Test Provisional Ballot',
  hmpbInstructions: 'Instructions',
  hmpbInstructionsToVoteTitle: 'To Vote:',
  hmpbInstructionsToVoteText:
    'To vote, completely fill in the oval next to your choice.',
  hmpbInstructionsWriteInTitle: 'To Vote for a Write-in:',
  hmpbInstructionsWriteInText:
    'To vote for a person whose name is not on the ballot, write the person’s name on the "Write-in" line and completely fill in the oval next to the line.',
  hmpbVoteFor1: 'Vote for 1',
  hmpbVoteFor2: 'Vote for up to 2',
  hmpbVoteFor3: 'Vote for up to 3',
  hmpbVoteFor4: 'Vote for up to 4',
  hmpbVoteFor5: 'Vote for up to 5',
  hmpbVoteFor6: 'Vote for up to 6',
  hmpbVoteFor7: 'Vote for up to 7',
  hmpbVoteFor8: 'Vote for up to 8',
  hmpbVoteFor9: 'Vote for up to 9',
  hmpbVoteFor10: 'Vote for up to 10',
  hmpbVoteForNotMoreThan1: 'Vote for not more than 1',
  hmpb2WillBeElected: '2 will be elected',
  hmpb3WillBeElected: '3 will be elected',
  hmpb4WillBeElected: '4 will be elected',
  hmpb5WillBeElected: '5 will be elected',
  hmpb6WillBeElected: '6 will be elected',
  hmpb7WillBeElected: '7 will be elected',
  hmpb8WillBeElected: '8 will be elected',
  hmpb9WillBeElected: '9 will be elected',
  hmpb10WillBeElected: '10 will be elected',
  hmpbWriteIn: 'Write-in',
  hmpbPageIntentionallyBlank: 'This page intentionally left blank',
  hmpbContinueVotingOnBack: 'Turn ballot over and continue voting',
  hmpbContinueVotingOnNextSheet: 'Continue voting on next ballot sheet',
  hmpbVotingComplete: 'You have completed voting.',
  hmpbPage: 'Page',
} satisfies Record<string, string>;

export const hmpbStrings = mapObject(hmpbStringsCatalog, (string, key) => (
  <UiString uiStringKey={key}>{string}</UiString>
)) as Record<keyof typeof hmpbStringsCatalog, JSX.Element>;
