import React, { useContext, useState } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { Button, Icons, LinkButton, Modal, P } from '@votingworks/ui';

import styled from 'styled-components';
import { AppContext } from '../../contexts/app_context';

import { NavigationScreen } from '../../components/navigation_screen';

import { routerPaths } from '../../router_paths';

import { getCastVoteRecordFileMode, markResultsOfficial } from '../../api';
import { Loading } from '../../components/loading';
import { TallyReportViewer } from '../../components/reporting/tally_report_viewer';

const SCREEN_TITLE = 'Full Election Tally Report';

const TopButtonBar = styled.div`
  display: flex;
  gap: 1rem;
`;

export function FullElectionTallyReportScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults, auth } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

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

  if (!castVoteRecordFileModeQuery.isSuccess) {
    return (
      <NavigationScreen title={SCREEN_TITLE}>
        <Loading />
      </NavigationScreen>
    );
  }

  const canMarkResultsOfficial =
    castVoteRecordFileModeQuery.data !== 'unlocked' && !isOfficialResults;

  return (
    <React.Fragment>
      <NavigationScreen title={SCREEN_TITLE}>
        <TopButtonBar>
          <LinkButton small to={routerPaths.reports}>
            <Icons.Previous /> Back
          </LinkButton>{' '}
          <Button
            disabled={!canMarkResultsOfficial}
            onPress={openMarkOfficialModal}
          >
            Mark Tally Results as Official
          </Button>
        </TopButtonBar>
        <TallyReportViewer
          filter={{}}
          groupBy={{}}
          disabled={false}
          autoPreview
        />
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
