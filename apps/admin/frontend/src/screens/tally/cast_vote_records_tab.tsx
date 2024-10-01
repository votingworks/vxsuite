import { assertDefined, find, iter } from '@votingworks/basics';
import {
  H3,
  Icons,
  P,
  Button,
  Table,
  TD,
  Loading,
  Card,
  TabPanel,
  Font,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import { TIME_FORMAT } from '../../config/globals';
import { AppContext } from '../../contexts/app_context';
import { getCastVoteRecordFileMode, getCastVoteRecordFiles } from '../../api';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { ConfirmRemoveCvrsModal } from './confirm_remove_cvrs_modal';

const TestModeCard = styled(Card).attrs({ color: 'warning' })`
  margin-bottom: 1rem;
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
`;

export function CastVoteRecordsTab(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  const { election } = assertDefined(electionDefinition);

  function getPrecinctNames(precinctIds: readonly string[]) {
    return precinctIds
      .map((id) => find(election.precincts, (p) => p.id === id).name)
      .join(', ');
  }

  const [isImportCvrModalOpen, setIsImportCvrModalOpen] = useState(false);
  const [isConfirmRemoveCvrsModalOpen, setIsConfirmRemoveCvrsModalOpen] =
    useState(false);

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();

  if (
    !castVoteRecordFilesQuery.isSuccess ||
    !castVoteRecordFileModeQuery.isSuccess
  ) {
    return <Loading />;
  }

  const fileMode = castVoteRecordFileModeQuery.data;
  const castVoteRecordFileList = castVoteRecordFilesQuery.data;
  const hasAnyFiles = castVoteRecordFileList.length > 0;

  const totalCvrCount = iter(castVoteRecordFileList).sum(
    (file) => file.numCvrsImported
  );

  return (
    <TabPanel>
      {fileMode === 'test' && (
        <TestModeCard>
          <H3>
            <Icons.Warning color="warning" /> Test Ballot Mode
          </H3>
          Once you have completed L&A testing and are ready to tally official
          ballots, remove the test ballot CVRs.
        </TestModeCard>
      )}
      {!hasAnyFiles && <P>No CVRs loaded.</P>}
      <Actions>
        <Button
          icon="Import"
          variant="primary"
          disabled={isOfficialResults}
          onPress={() => setIsImportCvrModalOpen(true)}
        >
          Load CVRs
        </Button>
        {hasAnyFiles && (
          <Button
            icon="Delete"
            color="danger"
            disabled={isOfficialResults}
            onPress={() => setIsConfirmRemoveCvrsModalOpen(true)}
          >
            Remove CVRs
          </Button>
        )}
      </Actions>
      {hasAnyFiles && (
        <React.Fragment>
          <Table data-testid="loaded-file-table">
            <tbody>
              <tr>
                <TD as="th" narrow nowrap textAlign="right">
                  #
                </TD>
                <TD as="th" narrow nowrap>
                  Created At
                </TD>
                <TD as="th" nowrap>
                  CVR Count
                </TD>
                <TD as="th" narrow nowrap>
                  Source
                </TD>
                <TD as="th" nowrap>
                  Precinct
                </TD>
              </tr>
              {castVoteRecordFileList.map(
                (
                  {
                    filename,
                    exportTimestamp,
                    numCvrsImported,
                    scannerIds,
                    precinctIds,
                  },
                  cvrFileIndex
                ) => (
                  <tr key={filename}>
                    <TD narrow nowrap textAlign="right">
                      {cvrFileIndex + 1}.
                    </TD>
                    <TD narrow nowrap>
                      {DateTime.fromJSDate(new Date(exportTimestamp)).toFormat(
                        TIME_FORMAT
                      )}
                    </TD>
                    <TD nowrap>{format.count(numCvrsImported)} </TD>
                    <TD narrow nowrap>
                      {scannerIds.join(', ')}
                    </TD>
                    <TD>{getPrecinctNames(precinctIds)}</TD>
                  </tr>
                )
              )}
            </tbody>
          </Table>
          <P style={{ marginTop: '1rem' }}>
            <Font weight="semiBold">
              Total CVR Count: {format.count(totalCvrCount)}
            </Font>
          </P>
        </React.Fragment>
      )}
      {isImportCvrModalOpen && (
        <ImportCvrFilesModal onClose={() => setIsImportCvrModalOpen(false)} />
      )}
      {isConfirmRemoveCvrsModalOpen && (
        <ConfirmRemoveCvrsModal
          onClose={() => setIsConfirmRemoveCvrsModalOpen(false)}
        />
      )}
    </TabPanel>
  );
}
