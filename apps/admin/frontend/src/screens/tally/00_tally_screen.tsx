/* istanbul ignore file */

import { useContext, useState } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { isOpenPrimary } from '@votingworks/types';
import {
  Button,
  Icons,
  RouterTabBar,
  MainContent,
  Card,
  H5,
} from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import styled from 'styled-components';
import { AppContext } from '../../contexts/app_context';
import { NavScreenLite } from '../../components/navigation_screen';
import { ManualTalliesTab } from './manual_tallies_tab';
import { routerPaths } from '../../router_paths';
import { ConfirmRemoveAllResultsModal } from './confirm_remove_all_results_modal';
import { CvrsScreen } from './00_cvrs_screen';

const Container = styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  overflow-x: visible;
  overflow-y: hidden;
  height: 100%;
`;

const Header = styled.div`
  position: relative;
  padding: var(--grid-gap) 0 0;
`;

const OfficialResultsCard = styled(Card)`
  margin: var(--grid-gap);
  margin-bottom: 0;

  h5 {
    font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
    margin: 0;

    svg {
      margin-right: 0.25rem;
    }
  }

  > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
  }
`;

const Body = styled.div<{ shadedBg?: boolean; withOfficialBanner?: boolean }>`
  background-color: ${(p) => (p.shadedBg ? '#f9f9f9' : 'none')};
  display: grid;
  grid-template-rows: ${(p) => p.withOfficialBanner && 'min-content 1fr'};
  overflow-x: visible;
  overflow-y: hidden;
  position: relative;
  height: 100%;
  transition: all 200ms ease-in;

  ${OfficialResultsCard} {
    display: ${(p) => (p.withOfficialBanner ? undefined : 'none')};
  }
`;

const Content = styled.div`
  overflow-x: visible;
  overflow-y: hidden;
  position: relative;
  height: 100%;
`;

const TabBar = styled(RouterTabBar)`
  border-color: #cecece;
  gap: var(--grid-gap);
  padding: 0 var(--grid-gap);
`;

export function TallyScreen(): JSX.Element | null {
  const {
    electionDefinition,
    isOfficialResults: official,
    auth,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));
  const isOfficialResults = official;

  const [
    isConfirmRemoveAllResultsModalOpen,
    setIsConfirmRemoveAllResultsModalOpen,
  ] = useState(false);

  const manualTalliesEnabled = !isOpenPrimary(electionDefinition.election);

  return (
    <NavScreenLite>
      <Container>
        <Header>
          <TabBar
            tabs={[
              {
                title: 'Cast Vote Records',
                path: routerPaths.tallyCvrs,
              },
              {
                title: 'Manual Tallies',
                path: routerPaths.tallyManual,
              },
            ]}
          />
        </Header>

        <Body shadedBg={false} withOfficialBanner={isOfficialResults}>
          <OfficialResultsCard shaded>
            <H5>
              <Icons.Done color="primary" /> Election Results are Official
            </H5>
            <Button
              onPress={() => setIsConfirmRemoveAllResultsModalOpen(true)}
              icon="Delete"
              color="danger"
            >
              Remove All Tallies
            </Button>
          </OfficialResultsCard>

          <Content>
            <Switch>
              <Route
                exact
                path={routerPaths.tallyCvrs}
                component={CvrsScreen}
              />

              {manualTalliesEnabled && (
                <Route exact path={routerPaths.tallyManual}>
                  <MainContent
                    style={{ height: '100%', padding: '0 var(--grid-gap)' }}
                  >
                    <ManualTalliesTab />
                  </MainContent>
                </Route>
              )}
              <Redirect from={routerPaths.tally} to={routerPaths.tallyCvrs} />
            </Switch>
          </Content>
        </Body>

        {isConfirmRemoveAllResultsModalOpen && (
          <ConfirmRemoveAllResultsModal
            onClose={() => setIsConfirmRemoveAllResultsModalOpen(false)}
          />
        )}
      </Container>
    </NavScreenLite>
  );
}
