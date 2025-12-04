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
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import type { ElectionUpload } from '@votingworks/design-backend';
import { getUser, getUserFeatures, loadElection } from './api';
import { Column, InputGroup, Row } from './layout';
import { OrgSelect } from './org_select';

interface VxUploadFormState {
  format: 'vxf';
  electionFile?: File;
}

interface MsSemsUploadFormState {
  format: 'ms-sems';
  electionFile?: File;
  candidateFile?: File;
}

type UploadFormState = (VxUploadFormState | MsSemsUploadFormState) & {
  orgId: string;
};

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
  disabled?: boolean;
}): JSX.Element | null {
  const history = useHistory();
  const loadElectionMutation = loadElection.useMutation();
  const getUserFeaturesQuery = getUserFeatures.useQuery();
  const getUserQuery = getUser.useQuery();
  const [modalFormState, setModalFormState] = useState<UploadFormState>();

  /* istanbul ignore next - @preserve */
  if (!(getUserQuery.isSuccess && getUserFeaturesQuery.isSuccess)) {
    return null;
  }
  const user = getUserQuery.data;
  const features = getUserFeaturesQuery.data;

  async function submitUpload(formState: UploadFormState) {
    const upload = await loadFileContents(formState);
    loadElectionMutation.mutate(
      { upload, orgId: formState.orgId },
      {
        onSuccess: (result) => {
          setModalFormState(undefined);
          if (result.isOk()) {
            const electionId = result.ok();
            history.push(`/elections/${electionId}`);
          }
        },
      }
    );
  }

  return (
    <React.Fragment>
      {features.MS_SEMS_CONVERSION || user.organizations.length > 1 ? (
        <Button
          disabled={disabled}
          onPress={() =>
            setModalFormState({
              format: 'vxf',
              orgId: user.organizations[0].id,
            })
          }
        >
          Load Election
        </Button>
      ) : (
        <FileInputButton
          accept=".json"
          onChange={async (event) => {
            const file = getFile(event);
            await submitUpload({
              format: 'vxf',
              electionFile: file,
              orgId: user.organizations[0].id,
            });
          }}
          disabled={loadElectionMutation.isLoading}
        >
          Load Election
        </FileInputButton>
      )}
      {modalFormState && (
        <Modal
          title="Load Election"
          content={
            <Column style={{ gap: '1rem' }}>
              {(user.organizations.length > 1 || features.ACCESS_ALL_ORGS) && (
                <InputGroup label="Organization">
                  <OrgSelect
                    style={{ width: '100%' }}
                    selectedOrgId={modalFormState.orgId}
                    onChange={(orgId) =>
                      setModalFormState({
                        ...modalFormState,
                        orgId: assertDefined(orgId),
                      })
                    }
                  />
                </InputGroup>
              )}
              <InputGroup label="Format">
                <SearchSelect<ElectionUpload['format']>
                  style={{ width: '100%' }}
                  options={[
                    { label: 'VotingWorks', value: 'vxf' },
                    { label: 'Mississippi SEMS', value: 'ms-sems' },
                  ]}
                  value={modalFormState.format}
                  onChange={(value) =>
                    setModalFormState({
                      ...modalFormState,
                      format: assertDefined(value),
                    })
                  }
                  menuPortalTarget={document.body}
                />
              </InputGroup>
              {modalFormState.format === 'vxf' && (
                <FileField
                  label="Election File"
                  accept=".json"
                  value={modalFormState.electionFile}
                  onChange={(file) =>
                    setModalFormState({
                      ...modalFormState,
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
      {loadElectionMutation.isSuccess && loadElectionMutation.data.isErr() && (
        <Modal
          title="Error Loading Election"
          content={
            <Callout color="danger" icon="Danger">
              <Column style={{ gap: '0.5rem' }}>
                <strong>Invalid election file</strong>
                <div>
                  {loadElectionMutation.data
                    .err()
                    .message.split('\n')
                    .map((line, index) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div key={index}>
                        <Caption>{line}</Caption>
                      </div>
                    ))}
                </div>
              </Column>
            </Callout>
          }
          actions={
            <Button onPress={() => loadElectionMutation.reset()}>Close</Button>
          }
          onOverlayClick={() => loadElectionMutation.reset()}
        />
      )}
    </React.Fragment>
  );
}
