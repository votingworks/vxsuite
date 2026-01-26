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

const sectionNames: Record<ContestTypes, string> = {
  candidate: 'Candidate Contests',
  yesno: 'Ballot Measures',
};

export interface ReorderParams {
  id: string;
  direction: -1 | 1;
}

export interface ContestListProps {
  contests: readonly AnyContest[];
  reordering: boolean;
  reorder: (params: ReorderParams) => void;
}

// [TODO] Might make sense, visually and functionally, to move the controls for
// enabling/saving contest reordering into this component, maybe as a persistent
// footer. With recent changes the "reorder" button is a bit too far off now and
// there may be plans to add support for custom contest grouping down the line.
export function ContestList(props: ContestListProps): React.ReactNode {
  const { contests, reorder, reordering } = props;
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
      {Object.keys(sectionNames).map((contestType) => {
        const contestsOfType = contests.filter((c) => c.type === contestType);
        if (contestsOfType.length === 0) {
          return null;
        }
        return (
          <Sublist
            key={contestType}
            electionId={electionId}
            contests={contestsOfType}
            districtIdToName={districtIdToName}
            onSelect={onSelect}
            parties={parties.data}
            reordering={reordering}
            reorder={reorder}
            selectedId={contestId}
            contestType={contestType as ContestTypes}
            sectionHeader={contestSectionHeaders[contestType as ContestTypes]}
          />
        );
      })}
    </EntityList.Box>
  );
}

const OpenSectionHeaderFormButton = styled(Button).attrs({
  fill: 'transparent',
})`
  font-size: 0.8rem;
  gap: 0.25rem;
  padding: 0;

  &:active,
  &:hover {
    background: none !important;
    text-decoration: underline;
    text-decoration-thickness: ${(p) => p.theme.sizes.bordersRem.thin}rem;
    text-underline-offset: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  }

  color: ${(p) => p.theme.colors.onBackgroundMuted};
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
        <Row
          style={{
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {sectionNames[contestType]}
        </Row>
        {features.CONTEST_SECTION_HEADERS && (
          <Row>
            <OpenSectionHeaderFormButton
              icon={sectionHeader ? 'Edit' : 'Add'}
              onPress={() => setIsEditingSectionHeader(true)}
            >
              {sectionHeader ? 'Edit' : 'Add'} ballot header
            </OpenSectionHeaderFormButton>
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
  savedSectionHeader,
  onClose,
}: {
  electionId: ElectionId;
  contestType: ContestTypes;
  savedSectionHeader?: ContestSectionHeader;
  onClose: () => void;
}): React.ReactNode {
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

  return (
    <Modal
      title={`Edit Ballot Header - ${sectionNames[contestType]}`}
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
            />
          </div>
        </Column>
      }
      actions={
        <React.Fragment>
          <Button icon="Done" onPress={saveSectionHeader} variant="primary">
            Save
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
