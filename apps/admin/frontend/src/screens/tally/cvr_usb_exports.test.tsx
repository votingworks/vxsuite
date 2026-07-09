import { expect, test, vi } from 'vitest';

import type {
  CastVoteRecordFileRecord as CvrImport,
  CastVoteRecordFileMetadata as CvrExport,
} from '@votingworks/admin-backend';

import { assert } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { CvrImporter } from './cvr_importer';
import {
  electionDefinition,
  location1,
  location1Export,
  location2,
  location2Export,
} from '../../../test/helpers/cvrs';
import { CvrUsbExports } from './cvr_usb_exports';

test('shows "no CVRs" callout when no exports are found', () => {
  const importer: CvrImporter = {
    state: 'init',
    electionDefinition,
    existingImports: { imports: [], mode: 'unlocked' },
    import: vi.fn(),
    manualImportButton: null,
    usbExports: [],
  };

  render(<CvrUsbExports importer={importer} />);

  screen.getByRole('heading', { name: 'No New CVRs Found' });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('shows "no CVRs" callout when no exports for current mode are found', () => {
  const importer: CvrImporter = {
    state: 'init',
    electionDefinition,
    existingImports: { imports: [], mode: 'official' },
    import: vi.fn(),
    manualImportButton: null,
    usbExports: [{ ...location1Export, isTestModeResults: true }],
  };

  render(<CvrUsbExports importer={importer} />);

  screen.getByRole('heading', { name: 'No New CVRs Found' });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('shows "no CVRs" note when all exports have already been imported', () => {
  assert(!location1Export.isTestModeResults);
  assert(!location2Export.isTestModeResults);

  const importer: CvrImporter = {
    state: 'init',
    electionDefinition,
    existingImports: {
      imports: [
        mockImportFromExport(location1Export),
        mockImportFromExport(location2Export),
      ],
      mode: 'official',
    },
    import: vi.fn(),
    manualImportButton: null,
    usbExports: [location1Export, location2Export],
  };

  render(<CvrUsbExports importer={importer} />);

  screen.getByText(/No new official ballot CVR exports were found/);

  const label1 = new RegExp(`Loaded.+${location1.name}`);
  expect(screen.getButton(label1)).toBeDisabled();

  const label2 = new RegExp(`Loaded.+${location2.name}`);
  expect(screen.getButton(label2)).toBeDisabled();
});

test('can load exports with filenames matching previous imports with different timestamp', () => {
  const importer: CvrImporter = {
    state: 'init',
    electionDefinition,
    existingImports: {
      imports: [
        mockImportFromExport(location1Export),
        mockImportFromExport(location2Export, {
          exportTimestamp: new Date().toISOString(),
        }),
      ],
      mode: 'official',
    },
    import: vi.fn(),
    manualImportButton: null,
    usbExports: [location1Export, location2Export],
  };

  render(<CvrUsbExports importer={importer} />);

  expect(screen.queryByText(/No new.+exports/)).not.toBeInTheDocument();
  screen.getByText(/The following official ballot CVR exports were found/);

  const label1 = new RegExp(`Loaded.+${location1.name}`);
  expect(screen.getButton(label1)).toBeDisabled();

  const label2 = new RegExp(`Load .+${location2.name}`);
  expect(screen.getButton(label2)).toBeEnabled();
});

test('shows import cards for available exports', () => {
  const importer: CvrImporter = {
    state: 'init',
    electionDefinition,
    existingImports: { imports: [], mode: 'test' },
    import: vi.fn(),
    manualImportButton: null,
    usbExports: [
      location1Export,
      { ...location2Export, isTestModeResults: true },
    ],
  };

  render(<CvrUsbExports importer={importer} />);

  const label1 = new RegExp(location1.name);
  expect(screen.queryButton(label1)).not.toBeInTheDocument();

  const label2 = new RegExp(`Load .+${location2.name}`);
  expect(screen.getButton(label2)).toBeEnabled();
});

test('import card clicks trigger import request', () => {
  const importer: CvrImporter = {
    state: 'init',
    electionDefinition,
    existingImports: { imports: [], mode: 'unlocked' },
    import: vi.fn(),
    manualImportButton: null,
    usbExports: [location1Export, location2Export],
  };

  render(<CvrUsbExports importer={importer} />);
  expect(importer.import).not.toHaveBeenCalled();

  userEvent.click(screen.getButton(new RegExp(location2.name)));
  expect(importer.import).toHaveBeenCalledExactlyOnceWith({
    path: location2Export.path,
  });
});

test('import cards disabled while importing', () => {
  const importer: CvrImporter = {
    state: 'importing',
    electionDefinition,
    existingImports: { imports: [], mode: 'unlocked' },
    path: location2Export.path,
    usbExports: [location1Export, location2Export],
  };

  render(<CvrUsbExports importer={importer} />);

  const card1 = screen.getButton(new RegExp(`Load.+${location1.name}`));
  const card2 = screen.getButton(new RegExp(`Loading.+${location2.name}`));

  expect(card1).toBeDisabled();
  expect(card2).toBeDisabled();
});

function mockImportFromExport(e: CvrExport, override: Partial<CvrImport> = {}) {
  return mockImport({
    exportTimestamp: e.exportTimestamp.toISOString(),
    filename: e.name,
    ...override,
  });
}

function mockImport(partial: Partial<CvrImport>) {
  return partial as CvrImport;
}
