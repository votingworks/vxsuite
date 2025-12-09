import React from 'react';
import styled from 'styled-components';
import { Flipped, Flipper } from 'react-flip-toolkit';

import {
  Button,
  H2,
  Caption,
  Font,
  DesktopPalette,
  useCurrentTheme,
} from '@votingworks/ui';
import { AnyContest, Party } from '@votingworks/types';

import { useHistory, useParams } from 'react-router-dom';
import { Column, Row } from './layout';
import * as api from './api';
import { cssThemedScrollbars } from './scrollbars';
import { ElectionIdParams, routes } from './routes';

const CLASS_REORDER_BUTTON = 'contestReorderButton';
const CLASS_SUBLIST_ITEMS = 'contestSublistItems';

const Item = styled.li`
  align-items: center;
  border-bottom: var(--contest-list-border);
  border-color: ${DesktopPalette.Gray10};
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem 1.25rem;
  text-decoration: none;
  transition-duration: 100ms;
  transition-property: background, border, box-shadow, color;
  transition-timing-function: ease-out;

  :focus,
  :hover {
    background: ${(p) => p.theme.colors.containerLow};
    box-shadow: inset 0.25rem 0 0 ${DesktopPalette.Purple50};
    color: inherit;
    outline: none;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple10};
    box-shadow: inset 0.35rem 0 0 ${DesktopPalette.Purple60};
  }

  .${CLASS_REORDER_BUTTON} {
    padding: 0.55rem;
  }
`;

const Container = styled.ul`
  --contest-list-border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
  --contest-list-title-size: 1.25rem;
  --contest-list-title-padding-y: 0.75rem;
  --contest-list-scroll-padding: calc(
    var(--contest-list-title-size) + (2 * var(--contest-list-title-padding-y))
  );

  display: flex;
  flex-direction: column;
  grid-area: contests;
  height: 100%;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 0 0.125rem 0 0;
  position: relative;
  scroll-padding: var(--contest-list-scroll-padding);

  h2 {
    background-color: ${(p) => p.theme.colors.containerLow};
    border-bottom: var(--contest-list-border);
    border-right: var(--contest-list-border);
    border-bottom-width: ${(p) => p.theme.sizes.bordersRem.medium}rem;
    font-size: var(--contest-list-title-size);
    line-height: 1;
    margin: 0;
    padding: var(--contest-list-title-padding-y) 1rem;
    position: sticky;
    top: 0;
    white-space: nowrap;

    :not(:first-child) {
      border-top: var(--contest-list-border);
      margin: 0;

      /*
       * The top border is only applied to the second sublist header for visual
       * separation from the first sublist.
       * Nudge it up to tuck its border under the list actions row border when
       * it sticks at the top:
       */
      top: -${(p) => p.theme.sizes.bordersRem.hairline}rem;
    }
  }

  > :last-child {
    flex-grow: 1;
  }

  ${cssThemedScrollbars}

  .${CLASS_SUBLIST_ITEMS} {
    border-right: var(--contest-list-border);
    min-height: max-content;

    :not(:last-child) {
      ${Item}:last-child {
        border-bottom: none;
      }
    }

    :last-child {
      padding-bottom: 1rem;
    }
  }
`;

export interface ReorderParams {
  id: string;
  direction: -1 | 1;
}

export interface ContestListProps {
  candidateContests: AnyContest[];
  reordering: boolean;
  reorder: (params: ReorderParams) => void;
  yesNoContests: AnyContest[];
}

// [TODO] Might make sense, visually and functionally, to move the controls for
// enabling/saving contest reordering into this component, maybe as a persistent
// footer. With recent changes the "reorder" button is a bit too far off now and
// there may be plans to add support for custom contest grouping down the line.
export function ContestList(props: ContestListProps): React.ReactNode {
  const { candidateContests, reorder, reordering, yesNoContests } = props;

  const { contestId = null, electionId } = useParams<
    ElectionIdParams & { contestId?: string }
  >();

  const history = useHistory();
  const contestRoutes = routes.election(electionId).contests;

  const parties = api.listParties.useQuery(electionId);
  const districts = api.listDistricts.useQuery(electionId);

  const districtIdToName = React.useMemo(
    () => new Map((districts.data || []).map((d) => [d.id, d.name])),
    [districts.data]
  );

  function onSelect(id: string) {
    history.push(contestRoutes.view(id).path);
  }

  if (!parties.isSuccess || !districts.isSuccess) return null;

  return (
    <Container role="listbox">
      {candidateContests.length > 0 && (
        <Sublist
          contests={candidateContests}
          districtIdToName={districtIdToName}
          onSelect={onSelect}
          parties={parties.data}
          reordering={reordering}
          reorder={reorder}
          selectedId={contestId}
          title="Candidate Contests"
        />
      )}

      {yesNoContests.length > 0 && (
        <Sublist
          contests={yesNoContests}
          districtIdToName={districtIdToName}
          onSelect={onSelect}
          parties={parties.data}
          reordering={reordering}
          reorder={reorder}
          selectedId={contestId}
          title="Ballot Measures"
        />
      )}
    </Container>
  );
}

export function Sublist(props: {
  contests: AnyContest[];
  districtIdToName: Map<string, string>;
  onSelect: (contestId: string) => void;
  parties: readonly Party[];
  reorder: (params: ReorderParams) => void;
  reordering: boolean;
  selectedId: string | null;
  title: string;
}): React.ReactNode {
  const {
    contests,
    districtIdToName,
    onSelect,
    parties,
    reorder,
    reordering,
    selectedId,
    title,
  } = props;
  const selectedContestRef = React.useRef<HTMLLIElement>(null);

  React.useLayoutEffect(() => {
    if (!selectedContestRef.current) return;
    selectedContestRef.current.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  function onKeyDownContest(e: React.KeyboardEvent, id: string) {
    if (e.repeat) return;

    // [TODO] Handle arrow key interaction a la W3C listbox pattern.
    switch (e.key) {
      case 'Enter':
      case ' ':
        break;

      default:
        return;
    }

    e.preventDefault();
    onSelect(id);
  }

  return (
    <React.Fragment>
      <H2>{title}</H2>

      {/* Flipper/Flip are used to animate the reordering of contest rows */}
      {/* @ts-expect-error: TS doesn't think Flipper is a valid component */}
      <Flipper
        className={CLASS_SUBLIST_ITEMS}
        flipKey={contests.map((c) => c.id).join(',')}
        // Custom spring parameters to speed up the duration of the animation
        // See https://github.com/aholachek/react-flip-toolkit/issues/100#issuecomment-551056183
        spring={{ stiffness: 439, damping: 42 }}
      >
        {contests.map((c, index) => (
          <Flipped key={c.id} flipId={c.id} shouldFlip={() => reordering}>
            <Item
              key={c.id}
              aria-selected={selectedId === c.id}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => onKeyDownContest(e, c.id)}
              ref={selectedId === c.id ? selectedContestRef : undefined}
              role="option"
              tabIndex={0}
            >
              <Column style={{ flexGrow: 1 }}>
                <ContestCaption bold selected={selectedId === c.id}>
                  {partyName(c, parties)}
                </ContestCaption>
                <ContestCaption selected={selectedId === c.id}>
                  {districtIdToName.get(c.districtId)}
                </ContestCaption>
                <Font weight={selectedId === c.id ? 'bold' : 'regular'}>
                  {c.title}
                </Font>
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
      </Flipper>
    </React.Fragment>
  );
}

function partyName(contest: AnyContest, parties: readonly Party[]) {
  if (contest.type !== 'candidate' || !contest.partyId) return undefined;

  return parties.find((p) => p.id === contest.partyId)?.fullName;
}

function ContestCaption(props: {
  children: React.ReactNode;
  bold?: boolean;
  selected: boolean;
}) {
  const { bold, children, selected } = props;

  const { colors } = useCurrentTheme();
  const color = selected ? colors.onBackground : colors.onBackgroundMuted;

  if (React.Children.count(children) === 0) return null;

  return (
    <Caption style={{ color }} weight={bold ? 'semiBold' : 'regular'}>
      {children}
    </Caption>
  );
}
