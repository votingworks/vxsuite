import React, { useState } from 'react';
import styled from 'styled-components';
import { assert, assertDefined } from '@votingworks/basics';
import { Contests, District } from '@votingworks/types';
import { Button, Modal } from '@votingworks/ui';

import {
  getBallotsFinalizedAt,
  getElectionInfo,
  listContests,
  listDistricts,
  reorderContests,
} from './api';
import { Column, Row } from './layout';
import { reorderElement } from './utils';

export function reorderContestsByDistrict(
  contests: Contests,
  districtOrder: District[]
): Contests {
  const candidateContests = contests.filter((c) => c.type === 'candidate');
  const yesNoContests = contests.filter((c) => c.type === 'yesno');
  assert(candidateContests.length + yesNoContests.length === contests.length);

  const districtIds = districtOrder.map((d) => d.id);
  const orderedCandidateContests = districtIds.flatMap((districtId) =>
    candidateContests.filter((c) => c.districtId === districtId)
  );
  const orderedYesNoContests = districtIds.flatMap((districtId) =>
    yesNoContests.filter((c) => c.districtId === districtId)
  );

  return [...orderedCandidateContests, ...orderedYesNoContests];
}

const DistrictRow = styled(Row)`
  align-items: center;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  gap: 0.5rem;
  padding: 0.5rem 0;
`;

function ReorderContestsByDistrictModal({
  contests,
  districts,
  isSaving,
  onClose,
  onSave,
}: {
  contests: Contests;
  districts: readonly District[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (reordered: Contests) => void;
}): React.ReactNode {
  const [orderedDistricts, setOrderedDistricts] = useState<District[]>(() => {
    // Initialize district order based on the order of appearance in contests
    const seenDistrictIds = new Set<string>();
    const districtsOrderedByAppearanceInContests: District[] = [];
    for (const contest of contests) {
      if (!seenDistrictIds.has(contest.districtId)) {
        seenDistrictIds.add(contest.districtId);
        const district = assertDefined(
          districts.find((d) => d.id === contest.districtId)
        );
        districtsOrderedByAppearanceInContests.push(district);
      }
    }
    return districtsOrderedByAppearanceInContests;
  });

  return (
    <Modal
      title="Reorder Contests by District"
      content={
        <Column>
          {orderedDistricts.map((district, index) => (
            <DistrictRow key={district.id}>
              <span style={{ flexGrow: 1 }}>{district.name}</span>
              <Button
                aria-label={`Move Up: ${district.name}`}
                disabled={index === 0}
                icon="ChevronUp"
                onPress={() =>
                  setOrderedDistricts(
                    reorderElement(orderedDistricts, index, index - 1)
                  )
                }
              />
              <Button
                aria-label={`Move Down: ${district.name}`}
                disabled={index === orderedDistricts.length - 1}
                icon="ChevronDown"
                onPress={() =>
                  setOrderedDistricts(
                    reorderElement(orderedDistricts, index, index + 1)
                  )
                }
              />
            </DistrictRow>
          ))}
        </Column>
      }
      actions={
        <React.Fragment>
          <Button
            disabled={isSaving}
            icon="Done"
            onPress={() =>
              onSave(reorderContestsByDistrict(contests, orderedDistricts))
            }
            variant="primary"
          >
            Save
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}

export function ReorderContestsByDistrictButton({
  electionId,
}: {
  electionId: string;
}): JSX.Element | null {
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listContestsQuery = listContests.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const reorderContestsMutation = reorderContests.useMutation();

  const [showDistrictReorderModal, setShowDistrictReorderModal] =
    useState(false);

  if (
    !getBallotsFinalizedAtQuery.isSuccess ||
    !getElectionInfoQuery.isSuccess ||
    !listContestsQuery.isSuccess ||
    !listDistrictsQuery.isSuccess
  ) {
    return null;
  }

  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const electionInfo = getElectionInfoQuery.data;
  const contests = listContestsQuery.data;
  const districts = listDistrictsQuery.data;

  return (
    <React.Fragment>
      <Button
        disabled={
          ballotsFinalizedAt !== null ||
          Boolean(electionInfo.externalSource) ||
          contests.length === 0
        }
        icon="Sort"
        onPress={() => setShowDistrictReorderModal(true)}
      >
        Reorder Contests by District
      </Button>
      {showDistrictReorderModal && (
        <ReorderContestsByDistrictModal
          contests={contests}
          districts={districts}
          isSaving={reorderContestsMutation.isLoading}
          onClose={() => setShowDistrictReorderModal(false)}
          onSave={(reorderedContests) => {
            reorderContestsMutation.mutate(
              {
                electionId,
                contestIds: reorderedContests.map((c) => c.id),
              },
              {
                onSuccess: () => setShowDistrictReorderModal(false),
              }
            );
          }}
        />
      )}
    </React.Fragment>
  );
}
