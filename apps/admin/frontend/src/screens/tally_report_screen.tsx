import React, { useContext, useState } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import {
  Button,
  H4,
  Icons,
  LinkButton,
  Modal,
  P,
  SearchSelect,
} from '@votingworks/ui';
import styled from 'styled-components';

import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';

import { routerPaths } from '../router_paths';

import { getCastVoteRecordFileMode, markResultsOfficial } from '../api';
import { Loading } from '../components/loading';
import { TallyReportViewer } from '../components/tally_report_preview';

const MarkOfficialButtonRow = styled.div`
  display: flex;
  justify-content: start;
  gap: 1rem;
`;

export function FullElectionTallyReportScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults, auth } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.

  const [isMarkOfficialModalOpen, setIsMarkOfficialModalOpen] = useState(false);

  const markResultsOfficialMutation = markResultsOfficial.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();

  function closeMarkOfficialModal() {
    setIsMarkOfficialModalOpen(false);
  }
  function openMarkOfficialModal() {
    setIsMarkOfficialModalOpen(true);
  }
  function markOfficial() {
    setIsMarkOfficialModalOpen(false);
    markResultsOfficialMutation.mutate();
  }

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';
  const title = `${statusPrefix} Full Election Tally Report`;

  if (!castVoteRecordFileModeQuery.isSuccess) {
    return (
      <NavigationScreen title={title}>
        <Loading />
      </NavigationScreen>
    );
  }

  const canMarkResultsOfficial =
    castVoteRecordFileModeQuery.data !== 'unlocked' && !isOfficialResults;

  return (
    <React.Fragment>
      <NavigationScreen title={title}>
        <MarkOfficialButtonRow>
          <LinkButton small to={routerPaths.reports}>
            <Icons.Previous /> Back
          </LinkButton>{' '}
          <Button
            disabled={!canMarkResultsOfficial}
            onPress={openMarkOfficialModal}
          >
            Mark Tally Results as Official
          </Button>
        </MarkOfficialButtonRow>

        <TallyReportViewer filter={{}} groupBy={{}} enabled autoPreview />
      </NavigationScreen>
      {isMarkOfficialModalOpen && (
        <Modal
          title="Mark Unofficial Tally Results as Official Tally Results?"
          content={
            <React.Fragment>
              <P>
                Have all CVR files been loaded? Once results are marked as
                official, no additional CVR files can be loaded.
              </P>
              <P>Have all unofficial tally reports been reviewed?</P>
            </React.Fragment>
          }
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={markOfficial}>
                Mark Tally Results as Official
              </Button>
              <Button onPress={closeMarkOfficialModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeMarkOfficialModal}
        />
      )}
    </React.Fragment>
  );
}

const SelectPrecinctContainer = styled.div`
  width: 20rem;
`;

export function PrecinctTallyReportScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const [precinctId, setPrecinctId] = useState<string>();
  const precinctOptions = election.precincts.map((precinct) => ({
    value: precinct.id,
    label: precinct.name,
  }));

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';
  const title = `${statusPrefix} Single Precinct Tally Report`;

  return (
    <NavigationScreen title={title}>
      <LinkButton small to={routerPaths.reports}>
        <Icons.Previous /> Back
      </LinkButton>
      <H4>Select Precinct</H4>
      <SelectPrecinctContainer>
        <SearchSelect
          isMulti={false}
          isSearchable
          options={precinctOptions}
          onChange={(option) => setPrecinctId(option?.value)}
        />
      </SelectPrecinctContainer>
      <TallyReportViewer
        filter={{ precinctIds: precinctId ? [precinctId] : undefined }}
        groupBy={{}}
        enabled={!!precinctId}
        autoPreview
      />
    </NavigationScreen>
  );
}

export function AllPrecinctsTallyReportScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  assert(electionDefinition);

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';
  const title = `${statusPrefix} All Precincts Tally Report`;

  return (
    <NavigationScreen title={title}>
      <LinkButton small to={routerPaths.reports}>
        <Icons.Previous /> Back
      </LinkButton>
      <TallyReportViewer
        filter={{}}
        groupBy={{ groupByPrecinct: true }}
        enabled
        autoPreview
      />
    </NavigationScreen>
  );
}
