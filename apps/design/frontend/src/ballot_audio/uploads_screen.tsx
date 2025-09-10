/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react';
import { useParams } from 'react-router-dom';

import { Button, Font, Icons, Table } from '@votingworks/ui';

import { AudioUploadResult } from '@votingworks/design-backend';
import { ElectionStringKey } from '@votingworks/types';
import * as api from '../api';
import { ElectionIdParams } from '../routes';
import { UploadButton } from './upload_button';
import { Body, ButtonBar, Container, Td, Th } from './upload_screen';
import { BallotAudioPathParams } from './routes';

export interface UploadsScreenProps {
  onDone: () => void;
  onUploadMore: (files: File[]) => void;
}

// [TODO] Consolidate with UploadScreen
export function UploadsScreen(props: UploadsScreenProps): React.ReactNode {
  const { onDone, onUploadMore } = props;

  const { electionId } = useParams<BallotAudioPathParams>();
  const files = api.audioOverrideKeys.useQuery(electionId).data;
  const contestsLoading = api.listContests.useQuery(electionId).isLoading;

  if (!files) return null;

  return (
    <Container>
      <Body>
        <Table>
          <thead>
            <tr>
              <Th />
              <Th>File</Th>
              <Th>Matched Contest</Th>
              <Th>Matched Candidate</Th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, ixFile) => {
              let contestId = '';
              let candidateId = '';

              switch (file.key) {
                case ElectionStringKey.LA_CANDIDATE_AUDIO:
                  candidateId = file.subkey;
                  break;

                case ElectionStringKey.LA_CONTEST_AUDIO:
                  contestId = file.subkey;
                  break;

                default:
                  break;
              }

              return (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={`${ixFile}-${name}`}>
                  <Td textAlign="center">
                    {contestsLoading ? (
                      <Icons.Loading />
                    ) : contestId || candidateId ? (
                      <Icons.Done color="success" />
                    ) : (
                      <Icons.Warning />
                    )}
                  </Td>
                  <Td>
                    <Font weight="semiBold">{file.originalFilename}</Font>
                  </Td>
                  {candidateId || contestId ? (
                    <AudioMatchCells
                      candidateId={candidateId}
                      contestId={contestId}
                    />
                  ) : (
                    <React.Fragment>
                      <Td />
                      <Td />
                    </React.Fragment>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Body>
      <ButtonBar>
        <UploadButton neutral onSelect={onUploadMore} />
        <Button icon="Done" onPress={onDone} variant="primary">
          Done
        </Button>
      </ButtonBar>
    </Container>
  );
}

function AudioMatchCells(props: AudioUploadResult) {
  const { candidateId, contestId } = props;
  const { electionId } = useParams<ElectionIdParams>();

  const contests = api.listContests.useQuery(electionId).data;
  if (!contests) {
    return (
      <React.Fragment>
        <Td />
        <Td />
      </React.Fragment>
    );
  }

  let candidateName: string = '';
  let contestTitle: string = '';

  for (const contest of contests) {
    if (contestId && contest.id !== contestId) continue;

    if (!candidateId) {
      contestTitle = contest.title;
      continue;
    }

    if (contest.type !== 'candidate') continue;

    for (const candidate of contest.candidates) {
      if (candidate.id !== candidateId) continue;
      contestTitle = contest.title;
      candidateName = candidate.name;
    }
  }

  return (
    <React.Fragment>
      <Td>{contestTitle}</Td>
      <Td>{candidateName}</Td>
    </React.Fragment>
  );
}
