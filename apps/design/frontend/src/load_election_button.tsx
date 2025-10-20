import React, { FormEvent, useState } from 'react';
import {
  Button,
  Callout,
  Caption,
  FileInputButton,
  LoadingButton,
  Modal,
  SearchSelect,
} from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import {
  assert,
  assertDefined,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import type { ElectionUpload } from '@votingworks/design-backend';
import {
  getUser,
  getUserFeatures,
  loadElectionMsSems,
  loadElectionVxf,
} from './api';
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
  const loadElectionVxfMutation = loadElectionVxf.useMutation();
  const loadElectionMsSemsMutation = loadElectionMsSems.useMutation();
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const getUserQuery = getUser.useQuery();
  const [modalFormState, setModalFormState] = useState<UploadFormState>();

  /* istanbul ignore next - @preserve */
  if (!(getUserQuery.isSuccess && getUserFeaturesQuery.isSuccess)) {
    return null;
  }
  const user = getUserQuery.data;
  const features = getUserFeaturesQuery.data;

  function onSuccess(result: Result<string, Error>) {
    setModalFormState(undefined);
    if (result.isOk()) {
      const electionId = result.ok();
      history.push(`/elections/${electionId}`);
    }
  }

  async function submitVxfUpload(formState: VxUploadFormState) {
    const electionFileContents = await assertDefined(
      formState.electionFile
    ).text();
    loadElectionVxfMutation.mutate(
      { electionFileContents, orgId: user.orgId },
      { onSuccess }
    );
  }

  async function submitMsSemsUpload(formState: MsSemsUploadFormState) {
    const electionFileContents = await assertDefined(
      formState.electionFile
    ).text();
    const candidateFileContents = await assertDefined(
      formState.candidateFile
    ).text();
    loadElectionMsSemsMutation.mutate(
      { electionFileContents, candidateFileContents, orgId: user.orgId },
      { onSuccess }
    );
  }

  async function submitUpload(formState: UploadFormState) {
    switch (formState.format) {
      case 'vxf':
        await submitVxfUpload(formState);
        break;
      case 'ms-sems':
        await submitMsSemsUpload(formState);
        break;
      default:
        /* istanbul ignore next - @preserve */
        throwIllegalValue(formState);
    }
  }

  const mutationIsLoading =
    loadElectionVxfMutation.isLoading || loadElectionMsSemsMutation.isLoading;

  const mutationError = loadElectionVxfMutation.data?.isErr()
    ? loadElectionVxfMutation.data.err()
    : loadElectionMsSemsMutation.data?.isErr()
    ? loadElectionMsSemsMutation.data.err()
    : undefined;

  function resetMutations() {
    loadElectionVxfMutation.reset();
    loadElectionMsSemsMutation.reset();
  }

  return (
    <React.Fragment>
      {features.MS_SEMS_CONVERSION ? (
        <Button
          disabled={disabled}
          onPress={() => setModalFormState({ format: 'vxf' })}
        >
          Load Election
        </Button>
      ) : (
        <FileInputButton
          accept=".json"
          onChange={async (event) => {
            const file = getFile(event);
            await submitVxfUpload({ format: 'vxf', electionFile: file });
          }}
          disabled={loadElectionVxfMutation.isLoading}
        >
          Load Election
        </FileInputButton>
      )}
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
              {mutationIsLoading ? (
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
                disabled={mutationIsLoading}
                onPress={() => setModalFormState(undefined)}
              >
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={() => setModalFormState(undefined)}
        />
      )}
      {mutationError && (
        <Modal
          title="Error Loading Election"
          content={
            <Callout color="danger" icon="Danger">
              <Column style={{ gap: '0.5rem' }}>
                <strong>Invalid election file</strong>
                <div>
                  {mutationError.message.split('\n').map((line, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={index}>
                      <Caption>{line}</Caption>
                    </div>
                  ))}
                </div>
              </Column>
            </Callout>
          }
          actions={<Button onPress={resetMutations}>Close</Button>}
          onOverlayClick={resetMutations}
        />
      )}
    </React.Fragment>
  );
}
