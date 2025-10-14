import React, { FormEvent, useState } from 'react';
import {
  Button,
  FileInputButton,
  LoadingButton,
  Modal,
  SearchSelect,
} from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import type { ElectionUpload } from '@votingworks/design-backend';
import { getUser, getUserFeatures, loadElection } from './api';
import { Column, InputGroup, Row } from './layout';

interface VxUploadFormState {
  format: 'vxf';
  electionFile?: File;
}

interface MsSemsUploadFormState {
  format: 'ms-sems';
  electionFile?: File;
  candidateFile?: File;
}

type UploadFormState = VxUploadFormState | MsSemsUploadFormState;

function isFormStateComplete(formState: UploadFormState): boolean {
  switch (formState.format) {
    case 'vxf':
      return Boolean(formState.electionFile);
    case 'ms-sems':
      return (
        Boolean(formState.electionFile) && Boolean(formState.candidateFile)
      );
    default:
      /* istanbul ignore next - @preserve */
      throwIllegalValue(formState);
  }
}

function getFile(event: FormEvent<HTMLInputElement>): File {
  const input = event.currentTarget;
  const files = Array.from(input.files || []);
  assert(files.length === 1);
  return files[0];
}

async function loadFileContents(
  formState: UploadFormState
): Promise<ElectionUpload> {
  switch (formState.format) {
    case 'vxf': {
      assert(formState.electionFile);
      return {
        format: 'vxf',
        electionFileContents: await formState.electionFile.text(),
      };
    }
    case 'ms-sems': {
      assert(formState.electionFile);
      assert(formState.candidateFile);
      return {
        format: 'ms-sems',
        electionFileContents: await formState.electionFile.text(),
        candidateFileContents: await formState.candidateFile.text(),
      };
    }
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(formState);
    }
  }
}

function FileField({
  value,
  label,
  accept,
  onChange,
}: {
  value?: File;
  label: string;
  accept: string;
  onChange: (file: File) => void;
}): JSX.Element {
  return (
    <InputGroup label={label}>
      <Row style={{ gap: '1rem', alignItems: 'center' }}>
        <FileInputButton
          accept={accept}
          onChange={(event) => onChange(getFile(event))}
          buttonProps={{
            variant: value ? 'neutral' : 'secondary',
          }}
        >
          Select {label}…
        </FileInputButton>
        {value && <div>{value.name}</div>}
      </Row>
    </InputGroup>
  );
}

export function LoadElectionButton({
  disabled,
}: {
  disabled: boolean;
}): JSX.Element | null {
  const history = useHistory();
  const loadElectionMutation = loadElection.useMutation();
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const getUserQuery = getUser.useQuery();
  const [modalFormState, setModalFormState] = useState<UploadFormState>();

  /* istanbul ignore next - @preserve */
  if (!getUserFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getUserFeaturesQuery.data;
  assert(getUserQuery.isSuccess);
  const user = getUserQuery.data;

  async function submitUpload(formState: UploadFormState) {
    const upload = await loadFileContents(formState);
    loadElectionMutation.mutate(
      { upload, orgId: user.orgId },
      {
        onSuccess: (result) => {
          if (result.isOk()) {
            const electionId = result.ok();
            history.push(`/elections/${electionId}`);
            return;
          }
          // TODO handle error case
          /* istanbul ignore next - @preserve */
          throw result.err();
        },
      }
    );
  }

  if (features.MS_SEMS_CONVERSION) {
    return (
      <React.Fragment>
        <Button
          disabled={disabled}
          onPress={() => setModalFormState({ format: 'vxf' })}
        >
          Load Election
        </Button>
        {modalFormState && (
          <Modal
            title="Load Election"
            content={
              <Column style={{ gap: '1rem', overflow: 'visible' }}>
                <InputGroup label="Format">
                  <SearchSelect<ElectionUpload['format']>
                    style={{ width: '100%' }}
                    options={[
                      { label: 'VotingWorks', value: 'vxf' },
                      { label: 'Mississippi SEMS', value: 'ms-sems' },
                    ]}
                    value={modalFormState.format}
                    onChange={(value) =>
                      setModalFormState({ format: assertDefined(value) })
                    }
                  />
                </InputGroup>
                {modalFormState.format === 'vxf' && (
                  <FileField
                    label="Election File"
                    accept=".json"
                    value={modalFormState.electionFile}
                    onChange={(file) =>
                      setModalFormState({
                        format: 'vxf',
                        electionFile: file,
                      })
                    }
                  />
                )}
                {modalFormState.format === 'ms-sems' && (
                  <React.Fragment>
                    <FileField
                      label="Election File"
                      accept=".txt,.csv"
                      value={modalFormState.electionFile}
                      onChange={(file) =>
                        setModalFormState({
                          ...modalFormState,
                          electionFile: file,
                        })
                      }
                    />
                    <FileField
                      label="Candidate File"
                      accept=".txt,.csv"
                      value={modalFormState.candidateFile}
                      onChange={(file) =>
                        setModalFormState({
                          ...modalFormState,
                          candidateFile: file,
                        })
                      }
                    />
                  </React.Fragment>
                )}
              </Column>
            }
            actions={
              <React.Fragment>
                {loadElectionMutation.isLoading ? (
                  <LoadingButton variant="primary">
                    Loading Election…
                  </LoadingButton>
                ) : (
                  <Button
                    variant="primary"
                    disabled={!isFormStateComplete(modalFormState)}
                    onPress={() => submitUpload(modalFormState)}
                  >
                    Load Election
                  </Button>
                )}
                <Button
                  disabled={loadElectionMutation.isLoading}
                  onPress={() => setModalFormState(undefined)}
                >
                  Cancel
                </Button>
              </React.Fragment>
            }
            onOverlayClick={() => setModalFormState(undefined)}
          />
        )}
      </React.Fragment>
    );
  }

  async function onSelectElectionFile(event: FormEvent<HTMLInputElement>) {
    const file = getFile(event);
    await submitUpload({ format: 'vxf', electionFile: file });
  }

  return (
    <FileInputButton
      accept=".json"
      onChange={onSelectElectionFile}
      disabled={loadElectionMutation.isLoading}
    >
      Load Election
    </FileInputButton>
  );
}
