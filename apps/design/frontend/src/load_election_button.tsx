import { Buffer } from 'node:buffer';
import { ElectionId, ElectionType } from '@votingworks/types';
import {
  Button,
  FileInputButton,
  Modal,
  SearchSelect,
  SegmentedButton,
} from '@votingworks/ui';
import React, { FormEvent } from 'react';
import { useHistory } from 'react-router-dom';
import {
  assert,
  assertDefined,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { getUser, loadElection, loadLaElection } from './api';
import { InputGroup } from './layout';

type ElectionOptions = { format: 'vxf' } | { format: 'la'; type: ElectionType };

export function LoadElectionButton(): JSX.Element {
  const user = getUser.useQuery().data;
  const loadElectionMutation = loadElection.useMutation();
  const loadLaElectionMutation = loadLaElection.useMutation();
  const history = useHistory();
  const [electionOptions, setElectionOptions] =
    React.useState<ElectionOptions | null>(null);

  function onLoadElectionSuccess(result: Result<ElectionId, Error>) {
    if (result.isOk()) {
      const electionId = result.ok();
      history.push(`/elections/${electionId}`);
      return;
    }
    // TODO handle error case
    /* istanbul ignore next - @preserve */
    throw result.err();
  }

  async function onSelectElectionFile(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    const file = files[0];
    const { orgId } = assertDefined(user);
    assert(electionOptions);
    switch (electionOptions.format) {
      case 'vxf':
        loadElectionMutation.mutate(
          { electionData: await file.text(), orgId },
          { onSuccess: onLoadElectionSuccess }
        );
        break;
      case 'la':
        loadLaElectionMutation.mutate(
          {
            electionZipFileContents: Buffer.from(await file.arrayBuffer()),
            electionType: electionOptions.type,
            orgId,
          },
          { onSuccess: onLoadElectionSuccess }
        );
        break;
      default: {
        throwIllegalValue(electionOptions);
      }
    }
  }

  if (electionOptions) {
    return (
      <Modal
        title="Load Election"
        content={
          <div
            style={{
              minHeight: '9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <InputGroup label="Format">
              <SearchSelect<ElectionOptions['format']>
                style={{ width: '100%' }}
                options={[
                  { label: 'VotingWorks', value: 'vxf' },
                  { label: 'Louisiana', value: 'la' },
                ]}
                required
                value={electionOptions.format}
                onChange={(value) => {
                  assert(value !== undefined);
                  switch (value) {
                    case 'vxf':
                      setElectionOptions({ format: 'vxf' });
                      break;
                    case 'la':
                      setElectionOptions({ format: 'la', type: 'general' });
                      break;
                    default:
                      throwIllegalValue(value);
                  }
                }}
              />
            </InputGroup>
            {electionOptions.format === 'la' && (
              <SegmentedButton
                label="Election Type"
                options={[
                  { label: 'General', id: 'general' },
                  { label: 'Primary', id: 'primary' },
                ]}
                selectedOptionId={electionOptions.type}
                onChange={(type) => {
                  setElectionOptions({ format: 'la', type });
                }}
              />
            )}
          </div>
        }
        actions={
          <React.Fragment>
            <FileInputButton
              accept={electionOptions.format === 'vxf' ? '.json' : '.zip'}
              onChange={onSelectElectionFile}
              disabled={
                loadElectionMutation.isLoading ||
                loadLaElectionMutation.isLoading
              }
              buttonProps={{ variant: 'primary' }}
            >
              Select File…
            </FileInputButton>
            <Button
              onPress={() => {
                setElectionOptions(null);
              }}
            >
              Cancel
            </Button>
          </React.Fragment>
        }
        onOverlayClick={() => setElectionOptions(null)}
      />
    );
  }

  return (
    <Button onPress={() => setElectionOptions({ format: 'vxf' })}>
      Load Election
    </Button>
  );
}
