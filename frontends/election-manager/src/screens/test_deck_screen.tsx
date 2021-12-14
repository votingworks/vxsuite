import React, { useContext, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getPrecinctById,
  Precinct,
  VotesDict,
  Tally,
  VotingMethod,
} from '@votingworks/types';
import {
  ContestTally,
  ReportSection,
  TallyReportColumns,
  TallyReportTitle,
  TallyReportMetadata,
  LogoMark,
} from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import {
  assert,
  tallyVotesByContest,
  filterTalliesByParty,
} from '@votingworks/utils';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';

import { PrintButton } from '../components/print_button';
import { ButtonList } from '../components/button_list';
import { Prose } from '../components/prose';
import { Button } from '../components/button';

import { NavigationScreen } from '../components/navigation_screen';
import { LinkButton } from '../components/link_button';
import { PrecinctReportScreenProps } from '../config/types';

import { generateTestDeckBallots } from '../utils/election';

import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';
import {
  generateDefaultReportFilename,
  generateFileContentToSaveAsPdf,
} from '../utils/save_as_pdf';

const allPrecincts: Precinct = {
  id: '',
  name: 'All Precincts',
};

export function TestDeckScreen(): JSX.Element {
  const { electionDefinition, logger, currentUserSession } = useContext(
    AppContext
  );
  assert(electionDefinition);
  assert(currentUserSession); // TODO(auth)
  const currentUserType = currentUserSession.type;
  const { election } = electionDefinition;
  const {
    precinctId: precinctIdFromParams = '',
  } = useParams<PrecinctReportScreenProps>();
  const precinctId = precinctIdFromParams.trim();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const precinct =
    precinctId === 'all'
      ? allPrecincts
      : getPrecinctById({ election, precinctId });

  const ballots = generateTestDeckBallots({
    election,
    precinctId: precinct?.id,
  });

  const votes: VotesDict[] = ballots.map((b) => b.votes as VotesDict);

  const electionTally: Tally = {
    numberOfBallotsCounted: ballots.length,
    castVoteRecords: new Set(),
    contestTallies: tallyVotesByContest({
      election,
      votes,
    }),
    ballotCountsByVotingMethod: { [VotingMethod.Unknown]: ballots.length },
  };

  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map((bs) => bs.partyId))
  );

  const defaultReportFilename = generateDefaultReportFilename(
    'test-desk-tally-report',
    election,
    precinct?.name
  );

  const pageTitle = 'Test Ballot Deck Tally';

  const generatedAtTime = new Date();

  async function afterPrint() {
    await logger.log(LogEventId.TestDeckTallyReportPrinted, currentUserType, {
      disposition: 'success',
      message: 'Test deck tally report printed.',
    });
  }

  async function afterPrintError(errorMessage: string) {
    await logger.log(LogEventId.TestDeckTallyReportPrinted, currentUserType, {
      disposition: 'failure',
      message: `Failed to print test deck tally report: ${errorMessage}.`,
      error: errorMessage,
      result: 'User shown error, asked to try again.',
    });
  }

  if (precinct?.name) {
    return (
      <React.Fragment>
        <NavigationScreen>
          <div>
            <strong>{pageTitle}</strong> for {election.title}
          </div>
          <Prose>
            <TallyReportTitle
              style={{ marginBottom: '0.75em', marginTop: '0.25em' }}
            >
              {precinctId === 'all' ? '' : 'Precinct'} Tally Report for{' '}
              <strong>{precinct.name}</strong>
            </TallyReportTitle>
            <TallyReportMetadata
              generatedAtTime={generatedAtTime}
              election={election}
            />
            <p>
              <PrintButton
                afterPrint={afterPrint}
                afterPrintError={afterPrintError}
                primary
                sides="one-sided"
              >
                Print Results Report
              </PrintButton>
            </p>
            {window.kiosk && (
              <p>
                <Button onPress={() => setIsSaveModalOpen(true)}>
                  Save Results Report as PDF
                </Button>
              </p>
            )}
            <p>
              <LinkButton small to={routerPaths.testDecksTally}>
                Back to Test Deck list
              </LinkButton>
            </p>
          </Prose>
        </NavigationScreen>
        {isSaveModalOpen && (
          <SaveFileToUsb
            onClose={() => setIsSaveModalOpen(false)}
            generateFileContent={generateFileContentToSaveAsPdf}
            defaultFilename={defaultReportFilename}
            fileType={FileType.TestDeckTallyReport}
          />
        )}
        <div className="print-only">
          {ballotStylePartyIds.map((partyId) => {
            const party = election.parties.find((p) => p.id === partyId);
            const electionTallyForParty = filterTalliesByParty({
              election,
              electionTally,
              party,
            });
            const electionTitle = `${party ? party.fullName : ''} ${
              election.title
            }`;
            return (
              <ReportSection key={partyId || 'no-party'}>
                <LogoMark />
                <div>
                  <strong>{pageTitle}</strong> for {electionTitle}
                </div>
                <Prose maxWidth={false}>
                  <TallyReportTitle
                    style={{ marginBottom: '0.75em', marginTop: '0.25em' }}
                  >
                    {precinctId === 'all' ? '' : 'Precinct'} Tally Report for{' '}
                    <strong>{precinct.name}</strong>
                  </TallyReportTitle>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                  />
                </Prose>
                <TallyReportColumns>
                  <ContestTally
                    election={election}
                    electionTally={electionTallyForParty}
                    externalTallies={[]}
                  />
                </TallyReportColumns>
              </ReportSection>
            );
          })}
        </div>
      </React.Fragment>
    );
  }

  return (
    <NavigationScreen>
      <Prose>
        <h1>{pageTitle}</h1>
        <p>
          Select desired precinct for <strong>{election.title}</strong>.
        </p>
      </Prose>
      <p>
        <LinkButton
          to={routerPaths.testDeckResultsReport({ precinctId: 'all' })}
          fullWidth
        >
          <strong>All Precincts</strong>
        </LinkButton>
      </p>
      <ButtonList>
        {[...election.precincts]
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
              ignorePunctuation: true,
            })
          )
          .map((p) => (
            <LinkButton
              key={p.id}
              to={routerPaths.testDeckResultsReport({ precinctId: p.id })}
              fullWidth
            >
              {p.name}
            </LinkButton>
          ))}
      </ButtonList>
    </NavigationScreen>
  );
}
