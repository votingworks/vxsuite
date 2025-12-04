import React from 'react';
import styled from 'styled-components';
import { Flipped, Flipper } from 'react-flip-toolkit';

import { Button, H2, Caption, Font, DesktopPalette } from '@votingworks/ui';
import { Contest } from '@votingworks/types';

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
  border-bottom-style: dashed;
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

  display: flex;
  flex-direction: column;
  grid-area: contests;
  height: 100%;
  list-style: none;
  margin: 0;
  overflow-y: auto;
  position: relative;
  padding: 0 0.125rem 0 0;
  scroll-padding: 5rem;

  h2 {
    background-color: ${(p) => p.theme.colors.containerLow};
    border-bottom: var(--contest-list-border);
    border-right: var(--contest-list-border);
    margin: 0;
    padding: 1rem;
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
  candidateContests: Contest[];
  reordering: boolean;
  reorder: (params: ReorderParams) => void;
  yesNoContests: Contest[];
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

  const districts = api.listDistricts.useQuery(electionId);
  const districtIdToName = React.useMemo(
    () => new Map((districts.data || []).map((d) => [d.id, d.name])),
    [districts.data]
  );

  function onSelect(id: string) {
    history.push(contestRoutes.view(id).path);
  }

  return (
    <Container role="listbox">
      {candidateContests.length > 0 && (
        <Sublist
          contests={candidateContests}
          districtIdToName={districtIdToName}
          onSelect={onSelect}
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
  contests: Contest[];
  districtIdToName: Map<string, string>;
  onSelect: (contestId: string) => void;
  reorder: (params: ReorderParams) => void;
  reordering: boolean;
  selectedId: string | null;
  title: string;
}): React.ReactNode {
  const {
    contests,
    districtIdToName,
    onSelect,
    selectedId,
    reorder,
    reordering,
    title,
  } = props;
  const selectedContestRef = React.useRef<HTMLLIElement>(null);

  React.useLayoutEffect(() => {
    if (!selectedContestRef.current) return;
    selectedContestRef.current.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  function onClickContest(e: React.MouseEvent) {
    onActivateContest(e.currentTarget);
  }

  function onKeyDownContest(e: React.KeyboardEvent) {
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
    onActivateContest(e.currentTarget);
  }

  function onActivateContest(containerTarget: unknown) {
    if (!(containerTarget instanceof HTMLElement)) return;

    const id = containerTarget.getAttribute('data-contestId');
    if (id) onSelect(id);
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
              data-contestId={c.id}
              onClick={onClickContest}
              onKeyDown={onKeyDownContest}
              ref={selectedId === c.id ? selectedContestRef : undefined}
              role="option"
              tabIndex={0}
            >
              <Column style={{ flexGrow: 1 }}>
                <Caption
                  style={{
                    color:
                      selectedId === c.id
                        ? DesktopPalette.Gray90
                        : DesktopPalette.Gray70,
                  }}
                  weight="regular"
                >
                  {districtIdToName.get(c.districtId)}
                </Caption>
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
