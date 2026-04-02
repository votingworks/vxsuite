import React, { useState } from 'react';
import {
  PollingPlace,
  pollingPlaceGroups,
  PollingPlaceType,
  pollingPlaceTypeName,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import styled from 'styled-components';
import { Button } from './button';
import { Modal } from './modal';
import { Caption, H1, P } from './typography';
import { Icons } from './icons';
import { SearchSelect } from './search_select';

export const POLLING_PLACE_PICKER_LABEL = 'Select a polling place…';

const ConfirmModal = styled(Modal)`
  overflow: visible;

  > div:first-child {
    position: relative;
    overflow: visible;
  }
`;

const Option = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

export type PollingPlacePickerMode =
  | 'default'
  | 'confirmation_required'
  | 'disabled';

export interface PollingPlacePickerProps {
  includedTypes?: PollingPlaceType[];
  mode: PollingPlacePickerMode;
  places: readonly PollingPlace[];
  selectedId?: string;
  selectPlace: (id: string) => Promise<void>;
}

export function PollingPlacePicker({
  includedTypes = ['absentee', 'early_voting', 'election_day'],
  mode,
  places,
  selectedId,
  selectPlace,
}: PollingPlacePickerProps): JSX.Element {
  const [showingModal, setShowingModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unconfirmedSelection, setUnconfirmedSelection] = useState<string>();

  const dropdownCurrentValue = unconfirmedSelection || selectedId;

  function closeModal() {
    setShowingModal(false);
    setUnconfirmedSelection(undefined);
  }

  async function onChange(newId?: string) {
    assert(newId !== undefined);

    if (mode === 'confirmation_required') {
      setUnconfirmedSelection(newId);
    } else {
      setSaving(true);
      await selectPlace(newId);
      setSaving(false);
    }
  }

  async function confirmChange() {
    setSaving(true);
    await selectPlace(assertDefined(unconfirmedSelection));
    setSaving(false);

    closeModal();
  }

  const { groupedList, omitTypeLabels } = React.useMemo(() => {
    const allGroups = pollingPlaceGroups(places);
    const grouped: PollingPlace[] = [];

    const orderedTypes: PollingPlaceType[] = [
      'early_voting',
      'election_day',
      'absentee',
    ];

    let nVisibleGroups = 0;
    for (const type of orderedTypes) {
      if (!includedTypes.includes(type)) continue;

      const group = allGroups[type];
      grouped.push(...group);
      if (group.length > 0) nVisibleGroups += 1;
    }

    return {
      groupedList: grouped,
      omitTypeLabels: nVisibleGroups <= 1,
    };
  }, [includedTypes, places]);

  const dropdown = (
    <SearchSelect
      aria-label={POLLING_PLACE_PICKER_LABEL}
      menuShadow
      disabled={saving || mode === 'disabled'}
      isMulti={false}
      isSearchable={false}
      onChange={onChange}
      options={groupedList.map((place) => ({
        value: place.id,
        label: (
          <Option>
            {omitTypeLabels ? null : (
              <Caption weight="regular">
                {pollingPlaceTypeName(place.type)}
              </Caption>
            )}
            <span>{place.name}</span>
          </Option>
        ),
      }))}
      placeholder={POLLING_PLACE_PICKER_LABEL}
      style={{ width: '100%' }}
      value={dropdownCurrentValue}
    />
  );

  if (mode === 'default' || mode === 'disabled') {
    return dropdown;
  }

  return (
    <React.Fragment>
      <Button disabled={saving} onPress={setShowingModal} value>
        Change Polling Place
      </Button>
      {showingModal && (
        <ConfirmModal
          content={
            <div>
              <H1>Change Polling Place</H1>
              <P>
                <Icons.Warning color="warning" /> Changing the polling place
                will reset the polls to closed.
              </P>
              {dropdown}
            </div>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                onPress={confirmChange}
                disabled={
                  saving ||
                  !unconfirmedSelection ||
                  unconfirmedSelection === selectedId
                }
              >
                Confirm
              </Button>
              <Button disabled={saving} onPress={closeModal}>
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={closeModal}
        />
      )}
    </React.Fragment>
  );
}
