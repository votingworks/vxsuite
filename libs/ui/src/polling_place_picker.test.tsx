import { PollingPlace, PollingPlaceType } from '@votingworks/types';
import { describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { deferred } from '@votingworks/basics';
import { render, screen, waitFor } from '../test/react_testing_library';
import {
  POLLING_PLACE_PICKER_LABEL,
  PollingPlacePicker,
  PollingPlacePickerMode,
} from './polling_place_picker';

let lastId = 0;
function nextId() {
  lastId += 1;
  return `place${lastId}`;
}

const absentee1 = mockPlace('Absentee Place 1', 'absentee');
const absentee2 = mockPlace('Absentee Place 2', 'absentee');

const earlyVoting1 = mockPlace('Early Voting Place 1', 'early_voting');
const earlyVoting2 = mockPlace('Early Voting Place 2', 'early_voting');

const electionDay1 = mockPlace('Election Day Place 1', 'election_day');
const electionDay2 = mockPlace('Election Day Place 2', 'election_day');

const ALL_PLACES = [
  absentee1,
  absentee2,
  electionDay1,
  electionDay2,
  earlyVoting1,
  earlyVoting2,
] as const;

describe('dropdown contents', () => {
  interface Spec {
    mode: PollingPlacePickerMode;
    prep?: () => void;
  }

  const specs: Spec[] = [
    { mode: 'default' },
    {
      mode: 'confirmation_required',
      prep() {
        userEvent.click(screen.getButton('Change Polling Place'));
      },
    },
  ];

  for (const spec of specs) {
    test(`[${spec.mode} mode] renders all types by default`, () => {
      render(
        <PollingPlacePicker
          mode={spec.mode}
          places={ALL_PLACES}
          selectPlace={vi.fn(() => Promise.resolve())}
        />
      );

      spec.prep?.();

      const dropdown = getDropdown();
      const selectEl = dropdown.closest('.search-select');
      expect(selectEl).toHaveTextContent(POLLING_PLACE_PICKER_LABEL);

      userEvent.click(dropdown);
      expect(getAllOptions().map((opt) => opt.textContent)).toEqual([
        `Early Voting${earlyVoting1.name}`,
        `Early Voting${earlyVoting2.name}`,
        `Election Day${electionDay1.name}`,
        `Election Day${electionDay2.name}`,
        `Absentee Voting${absentee1.name}`,
        `Absentee Voting${absentee2.name}`,
      ]);
    });

    test(`[${spec.mode} mode] displays selected place name and type`, () => {
      render(
        <PollingPlacePicker
          mode={spec.mode}
          places={[earlyVoting1, electionDay1]}
          selectedId={electionDay1.id}
          selectPlace={vi.fn(() => Promise.resolve())}
        />
      );

      spec.prep?.();

      const dropdown = getDropdown();
      const selectEl = dropdown.closest('.search-select');
      expect(selectEl).toHaveTextContent(`Election Day${electionDay1.name}`);

      userEvent.click(dropdown);
      expect(getAllOptions().map((opt) => opt.textContent)).toEqual([
        `Early Voting${earlyVoting1.name}`,
        `Election Day${electionDay1.name}`,
      ]);
    });

    test(`[${spec.mode} mode] omits type labels if 'noTypeLabels' is specified`, () => {
      render(
        <PollingPlacePicker
          mode={spec.mode}
          noTypeLabels
          places={[earlyVoting1, electionDay1]}
          selectedId={electionDay1.id}
          selectPlace={vi.fn(() => Promise.resolve())}
        />
      );

      spec.prep?.();

      const dropdown = getDropdown();
      const selectEl = dropdown.closest('.search-select');
      expect(selectEl).toHaveTextContent(electionDay1.name);

      userEvent.click(getDropdown());
      expect(getAllOptions().map((opt) => opt.textContent)).toEqual([
        earlyVoting1.name,
        electionDay1.name,
      ]);
    });

    test(`[${spec.mode} mode] omits type labels if only one is available`, () => {
      render(
        <PollingPlacePicker
          mode={spec.mode}
          places={[electionDay1, electionDay2]}
          selectedId={electionDay2.id}
          selectPlace={vi.fn(() => Promise.resolve())}
        />
      );

      spec.prep?.();

      const dropdown = getDropdown();
      const selectEl = dropdown.closest('.search-select');
      expect(selectEl).toHaveTextContent(electionDay2.name);

      userEvent.click(getDropdown());
      expect(getAllOptions().map((o) => o.textContent)).toEqual([
        electionDay1.name,
        electionDay2.name,
      ]);
    });

    test(`[${spec.mode} mode] renders only the 'includedTypes', if specified`, () => {
      render(
        <PollingPlacePicker
          includedTypes={['early_voting']}
          mode={spec.mode}
          places={ALL_PLACES}
          selectedId={earlyVoting2.id}
          selectPlace={vi.fn(() => Promise.resolve())}
        />
      );

      spec.prep?.();

      userEvent.click(getDropdown());
      expect(getAllOptions().map((opt) => opt.textContent)).toEqual([
        earlyVoting1.name,
        earlyVoting2.name,
      ]);
    });
  }
});

test('default mode - changing selection triggers callback', () => {
  const mockSelectPlace = vi.fn().mockResolvedValueOnce(undefined);
  render(
    <PollingPlacePicker
      mode="default"
      places={[absentee1, electionDay1, earlyVoting1]}
      selectPlace={mockSelectPlace}
    />
  );

  expect(mockSelectPlace).not.toHaveBeenCalled();

  userEvent.click(getDropdown());
  userEvent.click(screen.getByText(electionDay1.name));
  expect(mockSelectPlace).toHaveBeenCalledExactlyOnceWith(electionDay1.id);
});

test('confirmation_required mode e2e', async () => {
  const deferredSave = deferred<void>();
  const mockSelectPlace = vi.fn().mockReturnValueOnce(deferredSave);

  render(
    <PollingPlacePicker
      mode="confirmation_required"
      places={[absentee1, electionDay1, earlyVoting1]}
      selectedId={absentee1.id}
      selectPlace={mockSelectPlace}
    />
  );

  expect(queryDropdown()).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Change Polling Place'));
  screen.getByRole('alertdialog');

  const selectElFirstOpen = getDropdown().closest('.search-select');
  expect(selectElFirstOpen).toHaveTextContent(absentee1.name);
  expect(screen.getButton('Confirm')).toBeDisabled();

  // Change selection:
  userEvent.click(getDropdown());
  userEvent.click(screen.getByText(electionDay1.name));
  expect(screen.getButton('Confirm')).toBeEnabled();

  // Cancel - should not call callback:
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(mockSelectPlace).not.toHaveBeenCalled();

  // Open modal again - selection should be reset:
  userEvent.click(screen.getButton('Change Polling Place'));
  screen.getByRole('alertdialog');

  const selectElSecondOpen = getDropdown().closest('.search-select');
  expect(selectElSecondOpen).toHaveTextContent(absentee1.name);
  expect(screen.getButton('Confirm')).toBeDisabled();

  // Change selection and confirm:
  userEvent.click(getDropdown());
  userEvent.click(screen.getByText(earlyVoting1.name));
  userEvent.click(screen.getButton('Confirm'));

  expect(mockSelectPlace).toHaveBeenCalledExactlyOnceWith(earlyVoting1.id);
  expect(screen.getButton('Confirm')).toBeDisabled();
  expect(screen.getButton('Cancel')).toBeDisabled();

  deferredSave.resolve();
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  expect(screen.getButton('Change Polling Place')).toBeEnabled();
});

test('disabled mode', () => {
  render(
    <PollingPlacePicker
      mode="disabled"
      places={[absentee1, electionDay1, earlyVoting1]}
      selectPlace={vi.fn()}
    />
  );

  expect(getDropdown()).toBeDisabled();
});

function mockPlace(name: string, type: PollingPlaceType): PollingPlace {
  return { id: nextId(), name, precincts: {}, type };
}

function getDropdown() {
  return screen.getByLabelText(POLLING_PLACE_PICKER_LABEL);
}

function queryDropdown() {
  return screen.queryByLabelText(POLLING_PLACE_PICKER_LABEL);
}

function getAllOptions() {
  return screen.getAllByRole('option');
}
