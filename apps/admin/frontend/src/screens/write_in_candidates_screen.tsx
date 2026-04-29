import React, { useContext, useState } from 'react';
import styled, { css } from 'styled-components';
import {
  CandidateContest,
  ContestId,
  getContestDistrictName,
  Id,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { Button, Callout, Modal, P, useCurrentTheme } from '@votingworks/ui';
import type { QualifiedWriteInCandidateRecord } from '@votingworks/admin-backend';
import { AppContext } from '../contexts/app_context';
import { EntityList } from '../components/entity_list';
import {
  getQualifiedWriteInCandidates,
  updateQualifiedWriteInCandidates,
} from '../api';
import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';

const Container = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
`;

const ContestListContainer = styled.div`
  width: 20rem;
  flex-shrink: 0;
  border-right: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};

  li:last-child {
    border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
      ${(p) => p.theme.colors.outline};
  }
`;

const CandidatesContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ActionsRow = styled.div`
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
`;

const cssViewMode = css`
  input:disabled {
    background-color: ${(p) => p.theme.colors.background};
    color: ${(p) => p.theme.colors.onBackground};
  }
`;

const Form = styled.form<{ editing: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;

  input:disabled {
    cursor: default;
  }

  ${(p) => !p.editing && cssViewMode}
`;

const FormBody = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 1rem;
  overflow: auto;
  padding: 1rem;
`;

const FormFooter = styled.div`
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 1rem;
`;

const CandidateList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const CandidateRowContainer = styled.div`
  display: flex;
  gap: 0.5rem;

  > input {
    width: 25rem;
  }

  .icon-button {
    background: ${(p) => p.theme.colors.background};
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    padding: 0.6rem 0.75rem;
  }
`;

function getWriteInContests(
  contests: readonly CandidateContest[]
): CandidateContest[] {
  return contests.filter((c) => c.allowWriteIns);
}

interface Candidate {
  id: Id;
  name: string;
}

function CandidatesForm({ contestId }: { contestId: ContestId }): JSX.Element {
  const theme = useCurrentTheme();
  const qualifiedCandidatesQuery = getQualifiedWriteInCandidates.useQuery();
  const updateCandidatesMutation =
    updateQualifiedWriteInCandidates.useMutation();

  const [editing, setEditing] = useState(false);
  const [editedCandidates, setEditedCandidates] = useState<Candidate[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<Id>>(new Set());
  const [errors, setErrors] = useState<Map<Id, string>>(new Map());
  const [candidateToDelete, setCandidateToDelete] =
    useState<QualifiedWriteInCandidateRecord | null>(null);

  const savedCandidates = (qualifiedCandidatesQuery.data ?? [])
    .filter((c) => c.contestId === contestId)
    .sort((a, b) => a.name.localeCompare(b.name));

  function startEditing() {
    setEditedCandidates(
      savedCandidates.map((c) => ({
        id: c.id,
        name: c.name,
      }))
    );
    setDeletedIds(new Set());
    setErrors(new Map());
    setEditing(true);
  }

  function cancelEditing() {
    setEditedCandidates([]);
    setDeletedIds(new Set());
    setErrors(new Map());
    setEditing(false);
  }

  function addEmptyCandidate() {
    setEditedCandidates((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '' },
    ]);
  }

  function updateCandidateName(index: number, name: string) {
    const copy = [...editedCandidates];
    const candidate = copy[index];
    copy[index] = { ...candidate, name };
    setEditedCandidates(copy);
    if (errors.has(candidate.id)) {
      const newErrors = new Map(errors);
      newErrors.delete(candidate.id);
      setErrors(newErrors);
    }
  }

  function deleteCandidate(index: number) {
    const edited = editedCandidates[index];
    const saved = savedCandidates.find((c) => c.id === edited.id);
    if (saved) {
      if (saved.hasAdjudicatedVotes) {
        setCandidateToDelete(saved);
        return;
      }
      setDeletedIds(new Set([...deletedIds, edited.id]));
    }
    setEditedCandidates(editedCandidates.filter((_, i) => i !== index));
  }

  function confirmDeleteWithAdjudications() {
    const candidate = assertDefined(candidateToDelete);
    setDeletedIds(new Set([...deletedIds, candidate.id]));
    setEditedCandidates(editedCandidates.filter((d) => d.id !== candidate.id));
    setCandidateToDelete(null);
  }

  function validate(): Map<Id, string> {
    const validationErrors = new Map<Id, string>();

    // Check for duplicate names
    const namesSeen = new Map<string, Id>();
    for (const candidate of editedCandidates) {
      const trimmed = candidate.name.trim().toLowerCase();
      if (!trimmed) continue;
      const existingId = namesSeen.get(trimmed);
      if (existingId) {
        validationErrors.set(
          candidate.id,
          'There is already a candidate with the same name.'
        );
      } else {
        namesSeen.set(trimmed, candidate.id);
      }
    }

    // Check for renamed candidates with adjudicated votes
    for (const candidate of editedCandidates) {
      const saved = savedCandidates.find((c) => c.id === candidate.id);
      if (
        saved &&
        saved.hasAdjudicatedVotes &&
        candidate.name.trim() !== saved.name
      ) {
        validationErrors.set(
          candidate.id,
          'This candidate has adjudicated votes, so its name cannot be changed. Instead, delete this candidate and add a new one with the updated name.'
        );
      }
    }

    return validationErrors;
  }

  function handleSave() {
    const validationErrors = validate();
    if (validationErrors.size > 0) {
      setErrors(validationErrors);
      return;
    }

    const renamedCandidates = editedCandidates.filter((d) => {
      const saved = savedCandidates.find((c) => c.id === d.id);
      return saved && d.name.trim() !== saved.name;
    });

    const newCandidates = [
      ...editedCandidates
        .filter(
          (d) =>
            !savedCandidates.some((c) => c.id === d.id) &&
            d.name.trim().length > 0
        )
        .map((d) => ({ contestId, name: d.name.trim() })),
      ...renamedCandidates.map((d) => ({ contestId, name: d.name.trim() })),
    ];

    const allDeletedIds = [
      ...deletedIds,
      ...renamedCandidates.map((d) => d.id),
    ];

    updateCandidatesMutation.mutate(
      {
        newCandidates,
        deletedCandidateIds: allDeletedIds,
      },
      {
        onSuccess() {
          setEditing(false);
          setEditedCandidates([]);
          setDeletedIds(new Set());
          setErrors(new Map());
        },
      }
    );
  }

  function handleAddCandidate() {
    if (!editing) {
      startEditing();
    }
    addEmptyCandidate();
  }

  return (
    <React.Fragment>
      <ActionsRow>
        <Button
          icon="Add"
          variant="primary"
          onPress={handleAddCandidate}
          disabled={editedCandidates.some((c) => c.name.trim() === '')}
        >
          Add Candidate
        </Button>
      </ActionsRow>
      <Form
        editing={editing}
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        onReset={(e) => {
          e.preventDefault();
          if (editing) {
            cancelEditing();
          } else {
            startEditing();
          }
        }}
      >
        <FormBody>
          {(editedCandidates.length > 0 || savedCandidates.length > 0) && (
            <CandidateList>
              {editing
                ? editedCandidates.map((candidate, i) => {
                    const error = errors.get(candidate.id);
                    return (
                      <React.Fragment key={candidate.id}>
                        <CandidateRowContainer>
                          <input
                            aria-label={`Candidate name: ${
                              candidate.name || 'New'
                            }`}
                            value={candidate.name}
                            onChange={(e) =>
                              updateCandidateName(i, e.target.value)
                            }
                            onBlur={(e) =>
                              updateCandidateName(i, e.target.value.trim())
                            }
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus={candidate.name === ''}
                            autoComplete="off"
                            style={{
                              borderColor: error
                                ? theme.colors.dangerAccent
                                : undefined,
                            }}
                          />
                          <Button
                            aria-label={`Delete ${
                              candidate.name || 'candidate'
                            }`}
                            className="icon-button"
                            icon="Trash"
                            variant="danger"
                            fill="transparent"
                            onPress={() => deleteCandidate(i)}
                          />
                        </CandidateRowContainer>
                        {error && (
                          <Callout icon="Danger" color="danger">
                            {error}
                          </Callout>
                        )}
                      </React.Fragment>
                    );
                  })
                : savedCandidates.map((candidate) => (
                    <CandidateRowContainer key={candidate.id}>
                      <input
                        aria-label={`Candidate name: ${candidate.name}`}
                        value={candidate.name}
                        disabled
                      />
                    </CandidateRowContainer>
                  ))}
            </CandidateList>
          )}
          {qualifiedCandidatesQuery.isSuccess &&
            !editing &&
            savedCandidates.length === 0 && (
              <Callout icon="Info" color="neutral">
                You have not added any write-in candidates for this contest.
                Write-ins for this contest will be counted as undervotes.
              </Callout>
            )}
        </FormBody>
        <FormFooter>
          {editing ? (
            <React.Fragment>
              <Button type="reset">Cancel</Button>
              <Button type="submit" variant="primary" icon="Done">
                Save
              </Button>
            </React.Fragment>
          ) : (
            <Button
              icon="Edit"
              type="reset"
              variant="primary"
              disabled={savedCandidates.length === 0}
            >
              Edit Candidates
            </Button>
          )}
        </FormFooter>
      </Form>
      {candidateToDelete && (
        <Modal
          title="Delete Write-In Candidate"
          content={
            <P>
              Votes have already been adjudicated for this write-in. If you
              delete this candidate, those votes will be deleted and you will
              have to adjudicate those ballots again.
            </P>
          }
          actions={
            <React.Fragment>
              <Button variant="danger" onPress={confirmDeleteWithAdjudications}>
                Delete Candidate
              </Button>
              <Button onPress={() => setCandidateToDelete(null)}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}

export function WriteInCandidatesScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const { election } = assertDefined(electionDefinition);

  const candidateContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  const writeInContests = getWriteInContests(candidateContests);

  const [selectedContestId, setSelectedContestId] = useState<
    ContestId | undefined
  >(writeInContests[0]?.id);

  const parentRoutes = [
    { title: 'Adjudication', path: routerPaths.adjudication },
  ];

  if (writeInContests.length === 0) {
    return (
      <NavigationScreen
        title="Qualified Write-In Candidates"
        parentRoutes={parentRoutes}
      >
        <Callout icon="Info" color="neutral">
          No contests in this election allow write-in candidates.
        </Callout>
      </NavigationScreen>
    );
  }

  const selectedContest = assertDefined(
    writeInContests.find((c) => c.id === selectedContestId)
  );

  return (
    <NavigationScreen
      title="Qualified Write-In Candidates"
      parentRoutes={parentRoutes}
      noPadding
      style={{ overflow: 'hidden' }}
    >
      <Container>
        <ContestListContainer>
          <EntityList.Box>
            <EntityList.Items>
              {writeInContests.map((contest) => {
                const party = contest.partyId
                  ? election.parties.find((p) => p.id === contest.partyId)
                  : undefined;
                return (
                  <EntityList.Item
                    key={contest.id}
                    id={contest.id}
                    selected={contest.id === selectedContestId}
                    onSelect={setSelectedContestId}
                    autoScrollIntoView={contest.id === selectedContestId}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {party && (
                        <EntityList.Caption weight="semiBold">
                          {party.fullName}
                        </EntityList.Caption>
                      )}
                      <EntityList.Caption>
                        {getContestDistrictName(election, contest)}
                      </EntityList.Caption>
                      <EntityList.Label>{contest.title}</EntityList.Label>
                    </div>
                  </EntityList.Item>
                );
              })}
            </EntityList.Items>
          </EntityList.Box>
        </ContestListContainer>
        <CandidatesContainer>
          <CandidatesForm contestId={selectedContest.id} />
        </CandidatesContainer>
      </Container>
    </NavigationScreen>
  );
}
