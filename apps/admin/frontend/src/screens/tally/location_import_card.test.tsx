/* eslint-disable prefer-regex-literals */
import { expect, test, vi } from 'vitest';

import { pollingPlaceTypeName } from '@votingworks/types/src';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../../test/react_testing_library';
import { LocationImportCard } from './location_import_card';

test('official import with single-scanner batches', () => {
  render(
    <LocationImportCard
      disabled={false}
      exportTimestamp={new Date('2020-11-07T18:00:00Z')}
      name="Vx West"
      nCvrs={432}
      onPress={vi.fn()}
      path="/dev/sdb/west/metadata.json"
      scannerIds={['SCN-001']}
      status="ready"
      testExport={false}
      type="absentee"
    />
  );

  screen.getByText('Load');
  screen.getByText(/OFFICIAL/);
  screen.getByText(new RegExp('11/07/2020'));
  screen.getByText('Vx West');
  screen.getByText(new RegExp(pollingPlaceTypeName('absentee')));
  screen.getByText(/Scanner SCN-001/);
  screen.getByText('432');
});

test('test-mode import with multi-scanner batches', () => {
  render(
    <LocationImportCard
      disabled={false}
      exportTimestamp={new Date('2021-11-08T18:00:00Z')}
      name="Vx North"
      nCvrs={2048}
      onPress={vi.fn()}
      path="/dev/sdb/west/metadata.json"
      scannerIds={['SCN-001', 'SCN-002']}
      status="ready"
      testExport
      type="early_voting"
    />
  );

  screen.getByText('Load');
  screen.getByText(/TEST/);
  screen.getByText(new RegExp('11/08/2021'));
  screen.getByText('Vx North');
  screen.getByText(new RegExp(pollingPlaceTypeName('early_voting')));
  screen.getByText(/Scanners: SCN-001, SCN-002/);
  screen.getByText('2,048');
});

test('emits onPress event on click', () => {
  const onPress = vi.fn();
  const path = '/dev/sdb/south/metadata.json';

  render(
    <LocationImportCard
      disabled={false}
      exportTimestamp={new Date('2020-11-07T18:00:00Z')}
      name="Vx South"
      nCvrs={432}
      onPress={onPress}
      path={path}
      scannerIds={['SCN-001']}
      status="ready"
      testExport={false}
      type="election_day"
    />
  );

  expect(onPress).not.toHaveBeenCalled();
  userEvent.click(screen.getButton(/Vx South/));
  expect(onPress).toHaveBeenCalledExactlyOnceWith(path);
});

test('status = "importing"', () => {
  render(
    <LocationImportCard
      disabled={false}
      exportTimestamp={new Date('2021-11-08T18:00:00Z')}
      name="Vx North"
      nCvrs={2048}
      onPress={vi.fn()}
      path="/dev/sdb/west/metadata.json"
      scannerIds={['SCN-001', 'SCN-002']}
      status="importing"
      testExport
      type="early_voting"
    />
  );

  screen.getByText('Loading');
  expect(screen.getButton(/Vx North/)).toBeDisabled();
});

test('status = "imported"', () => {
  render(
    <LocationImportCard
      disabled={false}
      exportTimestamp={new Date('2021-11-08T18:00:00Z')}
      name="Vx North"
      nCvrs={2048}
      onPress={vi.fn()}
      path="/dev/sdb/west/metadata.json"
      scannerIds={['SCN-001', 'SCN-002']}
      status="imported"
      testExport
      type="early_voting"
    />
  );

  screen.getByText('Loaded');
  expect(screen.getButton(/Vx North/)).toBeDisabled();
});

test('disabled by `disabled` prop', () => {
  render(
    <LocationImportCard
      disabled
      exportTimestamp={new Date()}
      name="Vx Central"
      nCvrs={0}
      onPress={vi.fn()}
      path="/dev/sdb/foo"
      scannerIds={['SCN-001']}
      status="ready"
      testExport={false}
      type="election_day"
    />
  );

  expect(screen.getButton(/Vx Central/)).toBeDisabled();
});
