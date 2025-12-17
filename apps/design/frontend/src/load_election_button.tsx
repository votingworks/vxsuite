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
  find,
  throwIllegalValue,
} from '@votingworks/basics';
import type { ElectionUpload, Jurisdiction } from '@votingworks/design-backend';
import styled from 'styled-components';
import { listJurisdictions, loadElection } from './api';
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

type UploadFormState = (VxUploadFormState | MsSemsUploadFormState) & {
  jurisdictionId: string;
};

function isFormStateComplete(formState: UploadFormState): boolean {
  switch (formState.format) {
    case 'vxf':
      return Boolean(formState.electionFile);
    case 'ms-sems':
      return (
        Boolean(formState.electionFile) && Boolean(formState.candidateFile)
      );
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(formState);
    }
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

function defaultFormState(jurisdiction: Jurisdiction): UploadFormState {
  if (jurisdiction.stateCode === 'MS') {
    return {
      format: 'ms-sems',
      jurisdictionId: jurisdiction.id,
    };
  }
  return {
    format: 'vxf',
    jurisdictionId: jurisdiction.id,
  };
}

// Modal usually uses margin: auto to center itself vertically and horizontally,
// but for this use case we want it to be anchored at the top so it can grow
// downwards when the form content changes for different file formats.
const TopAnchoredModal = styled(Modal)`
  margin-top: 10%;
`;

function LoadElectionModalForm({
  jurisdictions,
  onClose,
}: {
  jurisdictions: Jurisdiction[];
  onClose: () => void;
}): JSX.Element {
  const history = useHistory();
  const loadElectionMutation = loadElection.useMutation();
  const [formState, setFormState] = useState<UploadFormState>(
    defaultFormState(jurisdictions[0])
  );

  const jurisdiction = find(
    jurisdictions,
    (j) => j.id === formState.jurisdictionId
  );

  async function submitUpload() {
    const upload = await loadFileContents(formState);
    loadElectionMutation.mutate(
      { upload, jurisdictionId: formState.jurisdictionId },
      {
        onSuccess: (result) => {
          if (result.isOk()) {
            onClose();
            const electionId = result.ok();
            history.push(`/elections/${electionId}`);
          }
        },
      }
    );
  }

  if (loadElectionMutation.isSuccess && loadElectionMutation.data.isErr()) {
    return (
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
        actions={<Button onPress={onClose}>Close</Button>}
        onOverlayClick={onClose}
      />
    );
  }

  return (
    <TopAnchoredModal
      title="Load Election"
      content={
        <Column style={{ gap: '1rem' }}>
          {jurisdictions.length > 1 && (
            <InputGroup label="Jurisdiction">
              <SearchSelect
                style={{ width: '100%' }}
                options={jurisdictions.map((j) => ({
                  label: j.name,
                  value: j.id,
                }))}
                value={formState.jurisdictionId}
                menuPortalTarget={document.body}
                onChange={(jurisdictionId) => {
                  setFormState(
                    defaultFormState(
                      find(jurisdictions, (j) => j.id === jurisdictionId)
                    )
                  );
                }}
              />
            </InputGroup>
          )}
          {jurisdiction.stateCode === 'MS' && (
            <InputGroup label="Format">
              <SearchSelect<ElectionUpload['format']>
                style={{ width: '100%' }}
                options={[
                  { label: 'Mississippi SEMS', value: 'ms-sems' },
                  { label: 'VotingWorks', value: 'vxf' },
                ]}
                value={formState.format}
                onChange={(value) =>
                  setFormState({
                    ...formState,
                    format: assertDefined(value),
                  })
                }
                menuPortalTarget={document.body}
              />
            </InputGroup>
          )}
          {formState.format === 'vxf' && (
            <FileField
              label="Election File"
              accept=".json"
              value={formState.electionFile}
              onChange={(file) =>
                setFormState({
                  ...formState,
                  format: 'vxf',
                  electionFile: file,
                })
              }
            />
          )}
          {formState.format === 'ms-sems' && (
            <React.Fragment>
              <FileField
                label="Election File"
                accept=".txt,.csv"
                value={formState.electionFile}
                onChange={(file) =>
                  setFormState({
                    ...formState,
                    electionFile: file,
                  })
                }
              />
              <FileField
                label="Candidate File"
                accept=".txt,.csv"
                value={formState.candidateFile}
                onChange={(file) =>
                  setFormState({
                    ...formState,
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
            <LoadingButton variant="primary">Loading Election…</LoadingButton>
          ) : (
            <Button
              variant="primary"
              disabled={!isFormStateComplete(formState)}
              onPress={submitUpload}
            >
              Load Election
            </Button>
          )}
          <Button disabled={loadElectionMutation.isLoading} onPress={onClose}>
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}

export function LoadElectionModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element | null {
  const listJurisdictionsQuery = listJurisdictions.useQuery();

  if (!listJurisdictionsQuery.isSuccess) {
    return null;
  }
  const jurisdictions = listJurisdictionsQuery.data;

  return (
    <LoadElectionModalForm jurisdictions={jurisdictions} onClose={onClose} />
  );
}

export function LoadElectionButton({
  disabled,
}: {
  disabled?: boolean;
}): JSX.Element | null {
  const [modalIsOpen, setModalIsOpen] = useState(false);

  return (
    <React.Fragment>
      <Button disabled={disabled} onPress={() => setModalIsOpen(true)}>
        Load Election
      </Button>
      {modalIsOpen && (
        <LoadElectionModal onClose={() => setModalIsOpen(false)} />
      )}
    </React.Fragment>
  );
}
