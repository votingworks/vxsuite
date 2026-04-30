import React, { useState } from 'react';
import {
  Button,
  Callout,
  H6,
  Loading,
  P,
  QrCode,
  SearchSelect,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import styled from 'styled-components';
import { PollingPlace } from '@votingworks/types';
import { NavigationScreen } from '../../components/navigation_screen';
import {
  reportParentRoutes,
  ReportScreenContainer,
} from '../../components/reporting/shared';
import {
  getMatchingAbsenteePollingPlaces,
  getLiveResultsReportingUrl,
} from '../../api';

export const TITLE = 'Send Tally Reports';

const SelectPollingPlaceContainer = styled.div`
  padding: 1rem 1rem 0;
  display: flex;
  gap: 0.5rem;
  align-items: center;

  > span {
    white-space: nowrap;
  }
`;

const FullPageMessage = styled.div`
  padding: 1rem;
`;

const QrSection = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
`;

function ScreenWrapper({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <NavigationScreen title={TITLE} parentRoutes={reportParentRoutes} noPadding>
      <ReportScreenContainer>{children}</ReportScreenContainer>
    </NavigationScreen>
  );
}

function LiveResultsQrDisplay({
  pollingPlace,
}: {
  pollingPlace: PollingPlace;
}): JSX.Element {
  const urlsQuery = getLiveResultsReportingUrl.useQuery({
    pollingPlaceId: pollingPlace.id,
  });
  const [currentQrIndex, setCurrentQrIndex] = useState(0);

  if (urlsQuery.isLoading) {
    return <P>Generating QR code...</P>;
  }

  if (urlsQuery.isError || !urlsQuery.data || urlsQuery.data.length === 0) {
    return (
      <Callout icon="Danger" color="danger">
        Could not generate a QR code for {pollingPlace.name}. The tally results
        may be too large to encode.
      </Callout>
    );
  }

  const urls = urlsQuery.data;
  return (
    <div data-testid="live-results-code">
      <P>
        {urls.length === 1
          ? `Scan the QR code to send the tally report for ${pollingPlace.name}.`
          : `Scan all ${urls.length} QR codes to send the tally report for ${pollingPlace.name}.`}
      </P>
      <div data-value={urls[currentQrIndex]} style={{ width: '600px' }}>
        <QrCode value={urls[currentQrIndex]} size={600} />
      </div>
      {urls.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '1rem',
          }}
        >
          <Button
            onPress={() => setCurrentQrIndex((i) => Math.max(i - 1, 0))}
            disabled={currentQrIndex === 0}
          >
            Previous
          </Button>
          <H6 style={{ margin: 0 }}>
            {currentQrIndex + 1} / {urls.length}
          </H6>
          <Button
            variant="primary"
            onPress={() =>
              setCurrentQrIndex((i) => Math.min(i + 1, urls.length - 1))
            }
            disabled={currentQrIndex >= urls.length - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function PollingPlaceSelector({
  pollingPlaces,
}: {
  pollingPlaces: PollingPlace[];
}): JSX.Element {
  // Default to the only place when there's just one match.
  const [pollingPlaceId, setPollingPlaceId] = useState<string | undefined>(
    pollingPlaces.length === 1 ? pollingPlaces[0].id : undefined
  );

  const showPicker = pollingPlaces.length > 1;
  const selectedPollingPlace = pollingPlaces.find(
    (p) => p.id === pollingPlaceId
  );

  return (
    <React.Fragment>
      {showPicker && (
        <SelectPollingPlaceContainer>
          <SearchSelect
            isMulti={false}
            isSearchable
            disabled={!!pollingPlaceId}
            value={pollingPlaceId}
            options={pollingPlaces.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            onChange={(value) => setPollingPlaceId(value)}
            aria-label="Select absentee polling place"
            style={{ width: '30rem' }}
            placeholder="Select an absentee polling place."
          />
        </SelectPollingPlaceContainer>
      )}
      <QrSection>
        {selectedPollingPlace && (
          <LiveResultsQrDisplay
            key={selectedPollingPlace.id}
            pollingPlace={selectedPollingPlace}
          />
        )}
      </QrSection>
    </React.Fragment>
  );
}

export function SendTallyReportsScreen(): JSX.Element {
  const matchesQuery = getMatchingAbsenteePollingPlaces.useQuery();

  if (!matchesQuery.isSuccess) {
    return (
      <ScreenWrapper>
        <FullPageMessage>
          <Loading />
        </FullPageMessage>
      </ScreenWrapper>
    );
  }

  if (matchesQuery.data.isErr()) {
    assert(matchesQuery.data.err() === 'no-cvrs-loaded');
    return (
      <ScreenWrapper>
        <FullPageMessage>
          <Callout icon="Info" color="neutral">
            Load CVRs to send results.
          </Callout>
        </FullPageMessage>
      </ScreenWrapper>
    );
  }

  const pollingPlaces = matchesQuery.data.ok();

  if (pollingPlaces.length === 0) {
    return (
      <ScreenWrapper>
        <FullPageMessage>
          <Callout icon="Warning" color="warning">
            No absentee polling place covers the precincts in the loaded CVRs.
          </Callout>
        </FullPageMessage>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <PollingPlaceSelector pollingPlaces={pollingPlaces} />
    </ScreenWrapper>
  );
}
