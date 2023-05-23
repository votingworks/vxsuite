import { assert } from '@votingworks/basics';
import React, { ReactChild, useContext, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import { Button, Prose, Table, TD, Text, LinkButton } from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { TallyCategory } from '@votingworks/types';
import { ResultsFileType } from '../config/types';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { ConfirmRemovingFileModal } from '../components/confirm_removing_file_modal';
import { deleteAllManualTallies } from '../api';

const SummaryInfo = styled.div`
  align-self: flex-start;
  position: sticky;
  top: 0;
`;

const PrecinctRowText = styled(Text)`
  &&& {
    margin: 0;
    padding: 0;
  }
`;

export function ManualDataImportIndexScreen(): JSX.Element {
  const {
    electionDefinition,
    fullElectionManualTally: existingManualData,
    auth,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for adding manual tally data
  const { election } = electionDefinition;
  const history = useHistory();

  const deleteAllManualTalliesMutation = deleteAllManualTallies.useMutation();

  const existingTalliesByPrecinct = existingManualData?.resultsByCategory.get(
    TallyCategory.Precinct
  );
  const [isClearing, setIsClearing] = useState(false);
  const hasManualData =
    !!existingManualData?.overallTally.numberOfBallotsCounted;

  function confirmClearManualData() {
    setIsClearing(false);
    deleteAllManualTalliesMutation.mutate();
  }

  let totalNumberBallotsEntered = 0;
  const enteredDataRows: ReactChild[] = [];
  for (const precinct of election.precincts) {
    /* istanbul ignore next */
    const numberOfBallotsCounted = existingTalliesByPrecinct
      ? existingTalliesByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0
      : 0;
    enteredDataRows.push(
      <tr key={precinct.id}>
        <TD>
          <PrecinctRowText noWrap>{precinct.name}</PrecinctRowText>
        </TD>
        <TD nowrap textAlign="center" data-testid="numBallots">
          <PrecinctRowText>{numberOfBallotsCounted}</PrecinctRowText>
        </TD>
        <TD nowrap>
          <LinkButton
            small
            to={routerPaths.manualDataImportForPrecinct({
              precinctId: precinct.id,
            })}
          >
            Edit Results for {precinct.name}
          </LinkButton>
        </TD>
      </tr>
    );
    totalNumberBallotsEntered += numberOfBallotsCounted;
  }

  return (
    <React.Fragment>
      <NavigationScreen title="Manually Entered Results">
        <SummaryInfo>
          <Prose maxWidth={false}>
            <p>
              <Button onPress={() => history.push(routerPaths.tally)}>
                Back to Tally
              </Button>
            </p>
            <Table condensed data-testid="summary-data">
              <thead>
                <tr>
                  <TD as="th" narrow>
                    Precinct
                  </TD>
                  <TD as="th" nowrap narrow textAlign="center">
                    Manual Ballot Count
                  </TD>
                  <TD as="th" />
                </tr>
              </thead>
              <tbody>
                {enteredDataRows}
                <tr>
                  <TD>
                    <strong>Total</strong>
                  </TD>
                  <TD textAlign="center" data-testid="total-ballots-entered">
                    <strong>{totalNumberBallotsEntered}</strong>
                  </TD>
                  <TD />
                </tr>
              </tbody>
            </Table>
            <p>
              <Button
                variant="danger"
                disabled={!hasManualData}
                onPress={() => setIsClearing(true)}
              >
                Clear Manual Data
              </Button>
            </p>
          </Prose>
        </SummaryInfo>
      </NavigationScreen>
      {isClearing && (
        <ConfirmRemovingFileModal
          fileType={ResultsFileType.Manual}
          onConfirm={confirmClearManualData}
          onCancel={() => setIsClearing(false)}
        />
      )}
    </React.Fragment>
  );
}
