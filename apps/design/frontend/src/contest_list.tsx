import React from 'react';
import styled from 'styled-components';
import { Flipped, Flipper } from 'react-flip-toolkit';
import { Button, Modal } from '@votingworks/ui';
import {
  AnyContest,
  ContestTypes,
  Party,
  ElectionId,
  ContestSectionHeader,
} from '@votingworks/types';
import { useHistory, useParams } from 'react-router-dom';
import { Column, FieldName, InputGroup, Row } from './layout';
import * as api from './api';
import { ElectionIdParams, routes } from './routes';
import { EntityList } from './entity_list';
import { RichTextEditor } from './rich_text_editor';

const CLASS_REORDER_BUTTON = 'contestReorderButton';

const Item = styled(EntityList.Item)`
  .${CLASS_REORDER_BUTTON} {
    padding: 0.55rem;
  }
`;

const Items = styled(EntityList.Items)`
  :not(:last-child) {
    ${Item}:last-child {
      border-bottom: none;
    }
  }
`;

export interface ReorderParams {
  id: string;
  direction: -1 | 1;
}

export interface ContestListProps {
  candidateContests: AnyContest[];
  yesNoContests: AnyContest[];
  reordering: boolean;
  reorder: (params: ReorderParams) => void;
}

// [TODO] Might make sense, visually and functionally, to move the controls for
// enabling/saving contest reordering into this component, maybe as a persistent
// footer. With recent changes the "reorder" button is a bit too far off now and
// there may be plans to add support for custom contest grouping down the line.
export function ContestList(props: ContestListProps): React.ReactNode {
  const { candidateContests, yesNoContests, reorder, reordering } = props;
  const { contestId = null, electionId } = useParams<
    ElectionIdParams & { contestId?: string }
  >();

  const history = useHistory();
  const contestRoutes = routes.election(electionId).contests;

  const parties = api.listParties.useQuery(electionId);
  const districts = api.listDistricts.useQuery(electionId);
  const getContestSectionHeadersQuery =
    api.getContestSectionHeaders.useQuery(electionId);

  const districtIdToName = React.useMemo(
    () => new Map((districts.data || []).map((d) => [d.id, d.name])),
    [districts.data]
  );

  function onSelect(id: string) {
    history.push(contestRoutes.view(id).path);
  }

  if (
    !parties.isSuccess ||
    !districts.isSuccess ||
    !getContestSectionHeadersQuery.isSuccess
  ) {
    return null;
  }

  const contestSectionHeaders = getContestSectionHeadersQuery.data;

  return (
    <EntityList.Box>
      {candidateContests.length > 0 && (
        <Sublist
          electionId={electionId}
          contests={candidateContests}
          districtIdToName={districtIdToName}
          onSelect={onSelect}
          parties={parties.data}
          reordering={reordering}
          reorder={reorder}
          selectedId={contestId}
          title="Candidate Contests"
          contestType="candidate"
          sectionHeader={contestSectionHeaders.candidate}
        />
      )}
      {yesNoContests.length > 0 && (
        <Sublist
          electionId={electionId}
          contests={yesNoContests}
          districtIdToName={districtIdToName}
          onSelect={onSelect}
          parties={parties.data}
          reordering={reordering}
          reorder={reorder}
          selectedId={contestId}
          title="Ballot Measures"
          contestType="yesno"
          sectionHeader={contestSectionHeaders.yesno}
        />
      )}
    </EntityList.Box>
  );
}

const OpenSectionHeaderFormButton = styled(Button).attrs({
  fill: 'transparent',
})`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 0.9rem;
  gap: 0.25rem;
  padding: 0.25rem;
  margin-left: -0.25rem; /* Align with header text */
`;

export function Sublist(props: {
  electionId: ElectionId;
  contests: AnyContest[];
  districtIdToName: Map<string, string>;
  onSelect: (contestId: string) => void;
  parties: readonly Party[];
  reorder: (params: ReorderParams) => void;
  reordering: boolean;
  selectedId: string | null;
  title: string;
  contestType: ContestTypes;
  sectionHeader?: ContestSectionHeader;
}): React.ReactNode {
  const {
    electionId,
    contests,
    districtIdToName,
    onSelect,
    parties,
    reorder,
    reordering,
    selectedId,
    title,
    contestType,
    sectionHeader,
  } = props;
  const [isEditingSectionHeader, setIsEditingSectionHeader] =
    React.useState(false);
  const getStateFeaturesQuery = api.getStateFeatures.useQuery(electionId);

  if (!getStateFeaturesQuery.isSuccess) {
    return null;
  }
  const features = getStateFeaturesQuery.data;

  return (
    <React.Fragment>
      <EntityList.Header>
        {title}
        {features.CONTEST_SECTION_HEADERS && (
          <Row>
            {sectionHeader ? (
              <OpenSectionHeaderFormButton
                rightIcon="Edit"
                onPress={() => setIsEditingSectionHeader(true)}
              >
                {sectionHeader.title}
              </OpenSectionHeaderFormButton>
            ) : (
              <OpenSectionHeaderFormButton
                icon="Add"
                onPress={() => setIsEditingSectionHeader(true)}
              >
                Add Ballot Header
              </OpenSectionHeaderFormButton>
            )}
          </Row>
        )}
      </EntityList.Header>

      {/* Flipper/Flip are used to animate the reordering of contest rows */}
      <Items
        // @ts-expect-error: TS doesn't think Flipper is a valid component
        as={Flipper}
        flipKey={contests.map((c) => c.id).join(',')}
        // Custom spring parameters to speed up the duration of the animation
        // See https://github.com/aholachek/react-flip-toolkit/issues/100#issuecomment-551056183
        spring={{ stiffness: 439, damping: 42 }}
      >
        {contests.map((c, index) => (
          <Flipped key={c.id} flipId={c.id} shouldFlip={() => reordering}>
            <Item
              id={c.id}
              key={c.id}
              selected={selectedId === c.id}
              onSelect={onSelect}
            >
              <Column style={{ flexGrow: 1 }}>
                <EntityList.Caption weight="semiBold">
                  {partyName(c, parties)}
                </EntityList.Caption>

                <EntityList.Caption>
                  {districtIdToName.get(c.districtId)}
                </EntityList.Caption>

                <EntityList.Label>{c.title}</EntityList.Label>
              </Column>

              {reordering && (
                <Row style={{ gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button
                    aria-label={`Move Up: ${c.title}`}
                    icon="ChevronUp"
                    className={CLASS_REORDER_BUTTON}
                    disabled={index === 0}
                    disableEventPropagation
                    onPress={reorder}
                    value={{ id: c.id, direction: -1 }}
                  />
                  <Button
                    aria-label={`Move Down: ${c.title}`}
                    icon="ChevronDown"
                    className={CLASS_REORDER_BUTTON}
                    disabled={index === contests.length - 1}
                    disableEventPropagation
                    onPress={reorder}
                    value={{ id: c.id, direction: 1 }}
                  />
                </Row>
              )}
            </Item>
          </Flipped>
        ))}
      </Items>

      {isEditingSectionHeader && (
        <EditSectionHeaderModalForm
          electionId={electionId}
          contestType={contestType}
          sectionTitle={title}
          savedSectionHeader={sectionHeader}
          onClose={() => setIsEditingSectionHeader(false)}
        />
      )}
    </React.Fragment>
  );
}

function partyName(contest: AnyContest, parties: readonly Party[]) {
  if (contest.type !== 'candidate' || !contest.partyId) return undefined;

  return parties.find((p) => p.id === contest.partyId)?.fullName;
}

function EditSectionHeaderModalForm({
  electionId,
  contestType,
  sectionTitle,
  savedSectionHeader,
  onClose,
}: {
  electionId: ElectionId;
  contestType: ContestTypes;
  sectionTitle: string;
  savedSectionHeader?: ContestSectionHeader;
  onClose: () => void;
}): React.ReactNode {
  const getBallotsFinalizedAtQuery =
    api.getBallotsFinalizedAt.useQuery(electionId);
  const updateContestSectionHeaderMutation =
    api.updateContestSectionHeader.useMutation();
  const [sectionHeader, setSectionHeader] =
    React.useState<ContestSectionHeader>(savedSectionHeader ?? { title: '' });

  function saveSectionHeader() {
    updateContestSectionHeaderMutation.mutate(
      {
        electionId,
        contestType,
        updatedHeader: {
          title: sectionHeader.title.trim(),
          description: sectionHeader.description || undefined,
        },
      },
      { onSuccess: onClose }
    );
  }

  function deleteSectionHeader() {
    updateContestSectionHeaderMutation.mutate(
      {
        electionId,
        contestType,
        updatedHeader: undefined,
      },
      { onSuccess: onClose }
    );
  }

  if (!getBallotsFinalizedAtQuery.isSuccess) {
    return null;
  }
  const isFinalized = Boolean(getBallotsFinalizedAtQuery.data);

  return (
    <Modal
      title={`Edit Ballot Header - ${sectionTitle}`}
      onOverlayClick={onClose}
      content={
        <Column style={{ gap: '1rem' }}>
          <InputGroup label="Title">
            <input
              type="text"
              value={sectionHeader.title}
              onChange={(e) =>
                setSectionHeader({
                  ...sectionHeader,
                  title: e.target.value,
                })
              }
              style={{ width: '100%' }}
              disabled={isFinalized}
            />
          </InputGroup>

          <div>
            <FieldName>Description</FieldName>
            <RichTextEditor
              initialHtmlContent={sectionHeader.description || ''}
              onChange={(value) =>
                setSectionHeader({
                  ...sectionHeader,
                  description: value === '' ? undefined : value,
                })
              }
              disabled={isFinalized}
            />
          </div>
        </Column>
      }
      actions={
        <React.Fragment>
          <Button
            icon="Done"
            onPress={saveSectionHeader}
            variant="primary"
            disabled={
              updateContestSectionHeaderMutation.isLoading ||
              sectionHeader.title.trim() === '' ||
              isFinalized
            }
          >
            Save
          </Button>
          <Button onPress={onClose}>Cancel</Button>
          <Button
            icon="Delete"
            onPress={deleteSectionHeader}
            variant="danger"
            fill="outlined"
            disabled={
              !savedSectionHeader ||
              updateContestSectionHeaderMutation.isLoading ||
              isFinalized
            }
          >
            Delete
          </Button>
        </React.Fragment>
      }
    />
  );
}
