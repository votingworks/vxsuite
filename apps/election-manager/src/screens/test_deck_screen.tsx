import { strict as assert } from 'assert';
import React, { useContext, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getPrecinctById,
  VotesDict,
  Tally,
  VotingMethod,
  unsafeParse,
  PrecinctIdSchema,
  PrecinctId,
} from '@votingworks/types';
import {
  ContestTally,
  ReportSection,
  TallyReportColumns,
  TallyReportTitle,
  TallyReportMetadata,
  LogoMark,
} from '@votingworks/ui';
import { tallyVotesByContest, filterTalliesByParty } from '@votingworks/utils';
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

const allPrecinctsLabel = 'All Precincts';

export function TestDeckScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  const {
    precinctId: precinctIdFromParams,
  } = useParams<PrecinctReportScreenProps>();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const precinctId =
    precinctIdFromParams === 'all'
      ? unsafeParse(PrecinctIdSchema, precinctIdFromParams)
      : undefined;
  const precinctName =
    precinctIdFromParams === 'all'
      ? allPrecinctsLabel
      : getPrecinctById({ election, precinctId: precinctId as PrecinctId })
          ?.name;

  const ballots = generateTestDeckBallots({
    election,
    precinctId,
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
    precinctName
  );

  const pageTitle = 'Test Ballot Deck Tally';

  const generatedAtTime = new Date();

  if (precinctName) {
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
              <strong>{precinctName}</strong>
            </TallyReportTitle>
            <TallyReportMetadata
              generatedAtTime={generatedAtTime}
              election={election}
            />
            <p>
              <PrintButton primary sides="one-sided">
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
                    <strong>{precinctName}</strong>
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
