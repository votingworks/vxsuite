import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { makeIdFactory } from '@votingworks/test-utils';
import { Buffer } from 'node:buffer';
import { createMemoryHistory, type MemoryHistory } from 'history';
import { userEvent } from '@testing-library/user-event';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  err,
  ok,
} from '@votingworks/basics';
import type {
  ElectionInfo,
  StateFeaturesConfig,
} from '@votingworks/election-definition-backend';
import {
  type District,
  ElectionStringKey,
  hasSplits,
  LanguageCode,
  type Precinct,
  type PrecinctWithoutSplits,
  type PrecinctWithSplits,
} from '@votingworks/types';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import {
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import {
  PrecinctsEditor,
  type PrecinctsEditorProps,
} from './precincts_editor.js';

const idFactory = makeIdFactory();

const electionId = 'election-1';
const rootPath = `/elections/${electionId}/precincts`;
const MOCK_AUDIO_PANEL_ID = 'MockAudioPanel';

function viewPath(precinctId: string): string {
  return `${rootPath}/${precinctId}`;
}

function editPath(precinctId: string): string {
  return `${rootPath}/${precinctId}/edit`;
}

const electionInfo: ElectionInfo = {
  electionId,
  type: 'general',
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'Demo State',
  jurisdictionName: 'Demo County',
  seal: '',
  languageCodes: [LanguageCode.ENGLISH],
};

const districts: District[] = [
  { id: 'district-1', name: 'District 1' },
  { id: 'district-2', name: 'District 2' },
  { id: 'district-3', name: 'District 3' },
];

const precincts: Precinct[] = [
  {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: ['district-1', 'district-2'],
  },
  {
    id: 'precinct-2',
    name: 'Precinct 2',
    splits: [
      { id: 'split-1', name: 'Split 1', districtIds: ['district-1'] },
      {
        id: 'split-2',
        name: 'Split 2',
        districtIds: ['district-1', 'district-2'],
      },
    ],
  },
  { id: 'precinct-3', name: 'Precinct 3', districtIds: ['district-3'] },
];

let apiMock: MockApiClient;

beforeEach(() => {
  idFactory.reset();
  apiMock = createMockApiClient();
  mockStateFeatures({});
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfo);
  apiMock.getRegisteredVoterCounts
    .expectRepeatedCallsWith({ electionId })
    .resolves({});
});

afterEach(() => {
  apiMock.assertComplete();
});

function mockStateFeatures(features: StateFeaturesConfig) {
  apiMock.getStateFeatures.reset();
  apiMock.getStateFeatures
    .expectRepeatedCallsWith({ electionId })
    .resolves(features);
}

function renderEditor(props: Partial<PrecinctsEditorProps> = {}) {
  const history = createMemoryHistory({ initialEntries: [rootPath] });
  render(
    provideApi(
      apiMock,
      withRoute(<PrecinctsEditor electionId={electionId} {...props} />, {
        paramPath: '/elections/:electionId/precincts',
        history,
      })
    )
  );
  return history;
}

function getSplitCards(): HTMLElement[] {
  return screen
    .getAllByRole('button', { name: 'Remove Split' })
    .map((button) => assertDefined(button.closest('div')));
}

async function expectViewModePrecinct(
  history: MemoryHistory,
  precinct: Precinct
) {
  await screen.findByRole('heading', { name: 'Precinct Info' });
  screen.getByRole('listbox');
  expect(history.location.pathname).toEqual(viewPath(precinct.id));
}

async function navigateToPrecinctEdit(
  history: MemoryHistory,
  precinctId: string
) {
  history.replace(editPath(precinctId));
  await screen.findByRole('heading', { name: 'Edit Precinct' });
  screen.getByRole('listbox');
}

async function navigateToPrecinctView(
  history: MemoryHistory,
  precinctId: string
) {
  history.replace(viewPath(precinctId));
  await screen.findByRole('heading', { name: 'Precinct Info' });
  screen.getByRole('listbox');
}

test('adding a precinct', async () => {
  idFactory.next(); // Discarded by StrictMode's double render of the blank form
  const newPrecinct: Precinct = {
    id: idFactory.next(),
    name: 'New Precinct',
    districtIds: [districts[0]!.id, districts[1]!.id],
  };

  apiMock.listPrecincts.expectCallWith({ electionId }).resolves([]);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();

  await screen.findByText(
    "You haven't added any precincts to this election yet."
  );
  expect(history.location.pathname).toEqual(rootPath);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add Precinct' }));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  expect(history.location.pathname).toEqual(`${rootPath}/add`);

  await userEvent.type(screen.getByLabelText('Name'), newPrecinct.name);
  for (const district of districts.slice(0, 2)) {
    await userEvent.click(
      screen.getByRole('checkbox', { name: district.name })
    );
  }

  apiMock.createPrecinct
    .expectCallWith({ electionId, newPrecinct })
    .resolves(ok());
  apiMock.listPrecincts
    .expectRepeatedCallsWith({ electionId })
    .resolves([newPrecinct]);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await expectViewModePrecinct(history, newPrecinct);
});

test('selects the first precinct by default', async () => {
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();

  await expectViewModePrecinct(history, precincts[0]!);
  screen.getByRole('option', { name: /Precinct 1/, selected: true });

  history.replace(viewPath(precincts[2]!.id));
  await screen.findByDisplayValue(precincts[2]!.name);

  history.replace(viewPath('unknown'));
  await screen.findByDisplayValue(precincts[0]!.name);
  expect(history.location.pathname).toEqual(viewPath(precincts[0]!.id));
});

test('editing a precinct - adding splits with NH overrides', async () => {
  const savedPrecinct = precincts[0]!;
  assert(!hasSplits(savedPrecinct));

  const sealImage =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" id="seal"></svg>';
  const signatureImage =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" id="signature"></svg>';
  const changedPrecinct: PrecinctWithSplits = {
    id: savedPrecinct.id,
    name: 'Changed Precinct',
    splits: [
      {
        id: idFactory.next(),
        name: 'Split 1',
        districtIds: [districts[0]!.id],
      },
      {
        id: (() => {
          // Burn one ID since we're gonna delete a split
          idFactory.next();
          return idFactory.next();
        })(),
        name: 'Split 2',
        districtIds: [districts[1]!.id],
        electionTitleOverride: 'Mock Election Override Name',
        electionSealOverride: sealImage,
        clerkSignatureImage: signatureImage,
        clerkSignatureCaption: 'Town Clerk',
      },
    ],
  };

  mockStateFeatures({
    PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: true,
  });
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctView(history, savedPrecinct.id);

  await userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Precinct' });
  expect(history.location.pathname).toEqual(editPath(savedPrecinct.id));

  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toHaveValue(savedPrecinct.name);
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, changedPrecinct.name);

  await userEvent.click(screen.getByRole('button', { name: 'Add Split' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add Split' }));

  const splitCards = getSplitCards();
  expect(splitCards).toHaveLength(3);
  const [split1Card, split2Card, split3Card] = splitCards;

  const split1NameInput = within(split1Card!).getByLabelText('Name');
  expect(split1NameInput).toHaveValue('');
  await userEvent.type(split1NameInput, changedPrecinct.splits[0]!.name);

  // Selected districts carry over to first precinct split
  within(split1Card!).getByRole('checkbox', {
    name: districts[0]!.name,
    checked: true,
  });
  await userEvent.click(
    within(split1Card!).getByRole('checkbox', {
      name: districts[1]!.name,
      checked: true,
    })
  );
  within(split1Card!).getByRole('checkbox', {
    name: districts[2]!.name,
    checked: false,
  });

  for (const district of districts) {
    within(split2Card!).getByRole('checkbox', {
      name: district.name,
      checked: false,
    });
  }
  await userEvent.click(
    within(split2Card!).getByRole('button', { name: 'Remove Split' })
  );

  const split3NameInput = within(split3Card!).getByLabelText('Name');
  expect(split3NameInput).toHaveValue('');
  await userEvent.type(split3NameInput, changedPrecinct.splits[1]!.name);
  await userEvent.click(
    within(split3Card!).getByRole('checkbox', { name: districts[1]!.name })
  );

  const split3ElectionTitleOverrideInput = within(split3Card!).getByLabelText(
    'Election Title Override'
  );
  expect(split3ElectionTitleOverrideInput).toHaveValue('');
  await userEvent.type(
    split3ElectionTitleOverrideInput,
    assertDefined(changedPrecinct.splits[1]!.electionTitleOverride)
  );
  await userEvent.upload(
    within(split3Card!).getByLabelText('Upload Seal Image').parentElement!,
    new File([sealImage], 'seal.svg', { type: 'image/svg+xml' })
  );
  await waitFor(() =>
    expect(within(split3Card!).getByRole('img')).toHaveAttribute(
      'src',
      `data:image/svg+xml;base64,${Buffer.from(sealImage).toString('base64')}`
    )
  );

  const split3ClerkSignatureCaption = within(split3Card!).getByLabelText(
    'Signature Caption Override'
  );
  expect(split3ClerkSignatureCaption).toHaveValue('');
  await userEvent.type(
    split3ClerkSignatureCaption,
    assertDefined(changedPrecinct.splits[1]!.clerkSignatureCaption)
  );
  await userEvent.upload(
    within(split3Card!).getByLabelText('Upload Signature Image').parentElement!,
    new File([signatureImage], 'signature.svg', { type: 'image/svg+xml' })
  );
  await waitFor(() => {
    const srcs = within(split3Card!)
      .getAllByRole('img')
      .map((img) => img.getAttribute('src'));
    expect(srcs).toContain(
      `data:image/svg+xml;base64,${Buffer.from(signatureImage).toString(
        'base64'
      )}`
    );
  });

  apiMock.updatePrecinct
    .expectCallWith({ electionId, updatedPrecinct: changedPrecinct })
    .resolves(ok());
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves([changedPrecinct, ...precincts.slice(1)]);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await expectViewModePrecinct(history, changedPrecinct);
});

test('split overrides are hidden without the NH state features', async () => {
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctEdit(history, precincts[1]!.id);

  expect(getSplitCards()).toHaveLength(2);
  expect(
    screen.queryByLabelText('Election Title Override')
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Upload Seal Image')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Upload Signature Image')
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Signature Caption Override')
  ).not.toBeInTheDocument();
});

test('editing a precinct - removing splits', async () => {
  const savedPrecinct = precincts.find(hasSplits)!;
  assert(savedPrecinct.splits.length === 2);

  const changedPrecinct: PrecinctWithoutSplits = {
    id: savedPrecinct.id,
    name: savedPrecinct.name,
    districtIds: savedPrecinct.splits[1]!.districtIds,
  };

  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctEdit(history, savedPrecinct.id);

  const [split1Card] = getSplitCards();
  await userEvent.click(
    within(split1Card!).getByRole('button', { name: 'Remove Split' })
  );
  expect(
    screen.queryByRole('button', { name: 'Remove Split' })
  ).not.toBeInTheDocument();

  // Districts from last remaining split should be selected for the whole precinct
  screen.getByRole('checkbox', { name: districts[0]!.name, checked: true });
  screen.getByRole('checkbox', { name: districts[1]!.name, checked: true });
  screen.getByRole('checkbox', { name: districts[2]!.name, checked: false });

  apiMock.updatePrecinct
    .expectCallWith({ electionId, updatedPrecinct: changedPrecinct })
    .resolves(ok());
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(
      precincts.map((p) => (p.id === changedPrecinct.id ? changedPrecinct : p))
    );
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  await userEvent.type(screen.getByLabelText('Name'), '{Enter}');

  await expectViewModePrecinct(history, changedPrecinct);
});

test('editing a precinct - removing splits preserves last split voter count', async () => {
  const initialPrecinct: PrecinctWithSplits = {
    id: 'two-split-precinct',
    name: 'Two-Split Precinct',
    splits: [
      { id: 'split-1', name: 'Split 1', districtIds: [districts[0]!.id] },
      { id: 'split-2', name: 'Split 2', districtIds: [districts[1]!.id] },
    ],
  };
  const precinctWithoutSplits: PrecinctWithoutSplits = {
    id: initialPrecinct.id,
    name: initialPrecinct.name,
    districtIds: initialPrecinct.splits[1]!.districtIds,
  };

  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves([initialPrecinct]);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctEdit(history, initialPrecinct.id);

  const [split1Card, split2Card] = getSplitCards();
  await userEvent.type(
    within(split1Card!).getByLabelText('Registered Voters'),
    '200'
  );
  await userEvent.type(
    within(split2Card!).getByLabelText('Registered Voters'),
    '400'
  );

  await userEvent.click(
    within(split1Card!).getByRole('button', { name: 'Remove Split' })
  );
  expect(screen.getByLabelText('Registered Voters')).toHaveValue(400);

  apiMock.updatePrecinct
    .expectCallWith({
      electionId,
      updatedPrecinct: precinctWithoutSplits,
      registeredVoterCounts: 400,
    })
    .resolves(ok());
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves([precinctWithoutSplits]);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await expectViewModePrecinct(history, precinctWithoutSplits);
});

test('deleting a precinct', async () => {
  const [savedPrecinct, ...remainingPrecincts] = precincts;

  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctEdit(history, savedPrecinct!.id);

  apiMock.deletePrecinct
    .expectCallWith({ electionId, precinctId: savedPrecinct!.id })
    .resolves();
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(remainingPrecincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  await userEvent.click(
    screen.getByRole('button', { name: 'Delete Precinct' })
  );
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete Precinct',
    })
  );

  await expectViewModePrecinct(history, remainingPrecincts[0]!);
});

test('editing or adding a precinct is disabled when locked', async () => {
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor({ isLocked: true });

  await expectViewModePrecinct(history, precincts[0]!);
  expect(screen.getButton('Add Precinct')).toBeDisabled();
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete Precinct')).not.toBeInTheDocument();
  expect(screen.queryButton('Add Split')).not.toBeInTheDocument();

  // Accessing `/edit` route when locked should redirect to "view" route:
  history.replace(editPath(precincts[1]!.id));
  await waitFor(() =>
    expect(history.location.pathname).toEqual(viewPath(precincts[1]!.id))
  );
  await screen.findByRole('heading', { name: 'Precinct Info' });
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
  expect(screen.queryButton('Add Split')).not.toBeInTheDocument();
});

test('add/delete/editing associated districts of precincts/splits is disabled for elections with external source', async () => {
  const precinctWithoutSplits = precincts.find((p) => !hasSplits(p))!;
  const precinctWithSplits = precincts.find(hasSplits)!;

  apiMock.getElectionInfo.reset();
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves({ ...electionInfo, externalSource: 'ms-sems' });
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();

  await navigateToPrecinctView(history, precinctWithoutSplits.id);
  expect(screen.queryButton('Add Precinct')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete Precinct')).not.toBeInTheDocument();

  await userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Precinct' });
  expect(screen.queryButton('Add Split')).not.toBeInTheDocument();
  for (const checkbox of screen.getAllByRole('checkbox')) {
    expect(checkbox).toBeDisabled();
  }

  await navigateToPrecinctView(history, precinctWithSplits.id);
  await userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Precinct' });
  expect(screen.queryButton('Add Split')).not.toBeInTheDocument();
  expect(screen.queryButton('Remove Split')).not.toBeInTheDocument();
  for (const checkbox of screen.getAllByRole('checkbox')) {
    expect(checkbox).toBeDisabled();
  }
});

test('cancelling', async () => {
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();

  const precinct1 = precincts[0]!;
  await navigateToPrecinctEdit(history, precinct1.id);

  await userEvent.click(
    screen.getByRole('button', { name: 'Delete Precinct' })
  );
  await screen.findByRole('heading', { name: 'Delete Precinct' });
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Cancel',
    })
  );
  await screen.findByRole('heading', { name: 'Edit Precinct' });
  expect(
    screen.queryByRole('heading', { name: 'Delete Precinct' })
  ).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expectViewModePrecinct(history, precinct1);
});

test('cancelling adding a precinct', async () => {
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await expectViewModePrecinct(history, precincts[0]!);

  await userEvent.click(screen.getButton('Add Precinct'));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  await userEvent.click(screen.getButton('Cancel'));

  await expectViewModePrecinct(history, precincts[0]!);
});

test('error message for duplicate precinct name', async () => {
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await expectViewModePrecinct(history, precincts[0]!);

  await userEvent.click(screen.getButton('Add Precinct'));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  await userEvent.type(screen.getByLabelText('Name'), precincts[0]!.name);

  idFactory.next(); // Discarded by StrictMode's double render of the blank form
  apiMock.createPrecinct
    .expectCallWith({
      electionId,
      newPrecinct: {
        id: idFactory.next(),
        name: precincts[0]!.name,
        districtIds: [],
      },
    })
    .resolves(err('duplicate-precinct-name'));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a precinct with the same name.');

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  await navigateToPrecinctEdit(history, precincts[0]!.id);
  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toHaveValue(precincts[0]!.name);
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, precincts[1]!.name);

  apiMock.updatePrecinct
    .expectCallWith({
      electionId,
      updatedPrecinct: { ...precincts[0]!, name: precincts[1]!.name },
    })
    .resolves(err('duplicate-precinct-name'));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a precinct with the same name.');
});

test('error message for duplicate precinct split name', async () => {
  const savedPrecinct = precincts.find(hasSplits)!;
  assert(savedPrecinct.splits.length === 2);

  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await expectViewModePrecinct(history, precincts[0]!);

  await userEvent.click(screen.getButton('Add Precinct'));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  await userEvent.type(screen.getByLabelText('Name'), 'New Precinct');
  await userEvent.click(screen.getByRole('button', { name: 'Add Split' }));
  const splitCards = getSplitCards();
  expect(splitCards).toHaveLength(2);
  const [split1Card, split2Card] = splitCards;
  await userEvent.type(within(split1Card!).getByLabelText('Name'), 'Split 1');
  await userEvent.type(within(split2Card!).getByLabelText('Name'), 'Split 1');

  idFactory.next(); // Discarded by StrictMode's double render of the blank form
  apiMock.createPrecinct
    .expectCallWith({
      electionId,
      newPrecinct: {
        id: idFactory.next(),
        name: 'New Precinct',
        splits: [
          { id: idFactory.next(), name: 'Split 1', districtIds: [] },
          { id: idFactory.next(), name: 'Split 1', districtIds: [] },
        ],
      },
    })
    .resolves(err('duplicate-split-name'));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Precinct splits must have different names.');

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  await navigateToPrecinctEdit(history, savedPrecinct.id);
  const savedSplitCards = getSplitCards();
  expect(savedSplitCards).toHaveLength(2);
  const savedSplit1NameInput = within(savedSplitCards[0]!).getByLabelText(
    'Name'
  );
  await userEvent.clear(savedSplit1NameInput);
  await userEvent.type(savedSplit1NameInput, savedPrecinct.splits[1]!.name);

  apiMock.updatePrecinct
    .expectCallWith({
      electionId,
      updatedPrecinct: {
        ...savedPrecinct,
        splits: [
          { ...savedPrecinct.splits[0]!, name: savedPrecinct.splits[1]!.name },
          savedPrecinct.splits[1]!,
        ],
      },
    })
    .resolves(err('duplicate-split-name'));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Precinct splits must have different names.');
});

test('error message for splits with the same districts', async () => {
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await expectViewModePrecinct(history, precincts[0]!);

  await userEvent.click(screen.getButton('Add Precinct'));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  await userEvent.type(screen.getByLabelText('Name'), 'New Precinct');
  await userEvent.click(screen.getByRole('button', { name: 'Add Split' }));
  const [split1Card, split2Card] = getSplitCards();
  await userEvent.type(within(split1Card!).getByLabelText('Name'), 'Split 1');
  await userEvent.type(within(split2Card!).getByLabelText('Name'), 'Split 2');

  idFactory.next(); // Discarded by StrictMode's double render of the blank form
  apiMock.createPrecinct
    .expectCallWith({
      electionId,
      newPrecinct: {
        id: idFactory.next(),
        name: 'New Precinct',
        splits: [
          { id: idFactory.next(), name: 'Split 1', districtIds: [] },
          { id: idFactory.next(), name: 'Split 2', districtIds: [] },
        ],
      },
    })
    .resolves(err('duplicate-split-districts'));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(
    'Each precinct split must have a different set of districts.'
  );
});

describe('audio editing', () => {
  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct With Splits',
    splits: [
      { id: 'split-1', name: 'Split 1', districtIds: [] },
      { id: 'split-2', name: 'Split 2', districtIds: [] },
    ],
  };

  for (const spec of [
    {
      testLabel: 'precinct name',
      inputValue: precinct.name,
      stringKey: ElectionStringKey.PRECINCT_NAME,
      subkey: precinct.id,
    },
    {
      testLabel: 'first precinct split',
      inputValue: precinct.splits[0]!.name,
      stringKey: ElectionStringKey.PRECINCT_SPLIT_NAME,
      subkey: precinct.splits[0]!.id,
    },
    {
      testLabel: 'second precinct split',
      inputValue: precinct.splits[1]!.name,
      stringKey: ElectionStringKey.PRECINCT_SPLIT_NAME,
      subkey: precinct.splits[1]!.id,
    },
  ]) {
    test(`configures audio edit button for ${spec.testLabel}`, async () => {
      apiMock.listPrecincts.expectCallWith({ electionId }).resolves([precinct]);
      apiMock.listDistricts.expectCallWith({ electionId }).resolves([]);
      mockStateFeatures({ AUDIO_ENABLED: true });

      const history = renderEditor({
        AudioPanel: () => <div data-testid={MOCK_AUDIO_PANEL_ID} />,
      });

      const input = await screen.findByDisplayValue(spec.inputValue);
      const inputGroup = assertDefined(input.closest('label'));
      await userEvent.click(
        within(inputGroup).getButton(/preview or edit audio/i)
      );

      await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
      expect(history.location.pathname).toEqual(
        `${viewPath(precinct.id)}/audio/${spec.stringKey}/${spec.subkey}`
      );
    });
  }

  test('has no audio buttons without an audio panel', async () => {
    apiMock.listPrecincts.expectCallWith({ electionId }).resolves([precinct]);
    apiMock.listDistricts.expectCallWith({ electionId }).resolves([]);
    mockStateFeatures({ AUDIO_ENABLED: true });

    renderEditor();

    await screen.findByDisplayValue(precinct.name);
    expect(
      screen.queryButton(/preview or edit audio/i)
    ).not.toBeInTheDocument();
  });
});

test('form controls are disabled in "view" mode', async () => {
  const srcPrecinct = precincts.find(hasSplits)!;
  const savedPrecinct: Precinct = {
    ...srcPrecinct,
    splits: [
      srcPrecinct.splits[0]!,
      {
        ...srcPrecinct.splits[1]!,
        clerkSignatureImage: 'abc123',
        electionSealOverride: 'def456',
      },
    ],
  };

  mockStateFeatures({
    PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: true,
  });
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves([savedPrecinct]);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctView(history, savedPrecinct.id);

  expect(screen.getButton('Edit')).not.toBeDisabled();
  expect(screen.getButton('Delete Precinct')).not.toBeDisabled();

  const inputs = screen.getAllByRole('textbox');
  expect(inputs).toHaveLength(
    // Precinct name, then split name + election title override + signature
    // caption for each split:
    1 + savedPrecinct.splits.length * 3
  );
  for (const input of inputs) expect(input).toBeDisabled();

  for (const upload of screen.getAllByLabelText('Upload Seal Image')) {
    expect(upload).toBeDisabled();
  }
  for (const upload of screen.getAllButtons('Remove Seal Image')) {
    expect(upload).toBeDisabled();
  }
  for (const upload of screen.getAllByLabelText('Upload Signature Image')) {
    expect(upload).toBeDisabled();
  }
  for (const upload of screen.getAllButtons('Remove Signature Image')) {
    expect(upload).toBeDisabled();
  }
});

test('shows saved registered voter counts', async () => {
  apiMock.getRegisteredVoterCounts.reset();
  apiMock.getRegisteredVoterCounts
    .expectRepeatedCallsWith({ electionId })
    .resolves({
      'precinct-1': 100,
      'precinct-2': { splits: { 'split-2': 20 } },
    });
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctView(history, precincts[0]!.id);
  expect(screen.getByLabelText('Registered Voters')).toHaveValue(100);

  await navigateToPrecinctView(history, precincts[1]!.id);
  const voterCountInputs = screen.getAllByLabelText('Registered Voters');
  expect(
    voterCountInputs.map((input) => (input as HTMLInputElement).value)
  ).toEqual(['', '20']);
});

test('DISABLE_REGISTERED_VOTER_COUNTS hides voter count fields', async () => {
  mockStateFeatures({ DISABLE_REGISTERED_VOTER_COUNTS: true });
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctEdit(history, precincts[0]!.id);
  expect(screen.queryByLabelText('Registered Voters')).not.toBeInTheDocument();

  await navigateToPrecinctEdit(history, precincts[1]!.id);
  expect(getSplitCards()).toHaveLength(2);
  expect(screen.queryByLabelText('Registered Voters')).not.toBeInTheDocument();
});

test('saves registered voter counts for a precinct with splits', async () => {
  const savedPrecinct = precincts.find(hasSplits)!;
  const [, split2] = savedPrecinct.splits;

  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctEdit(history, savedPrecinct.id);

  const [split1Card, split2Card] = getSplitCards();
  await userEvent.type(
    within(split1Card!).getByLabelText('Registered Voters'),
    '500'
  );
  await userEvent.type(
    within(split2Card!).getByLabelText('Registered Voters'),
    '300'
  );
  await userEvent.clear(
    within(split1Card!).getByLabelText('Registered Voters')
  );

  apiMock.updatePrecinct
    .expectCallWith({
      electionId,
      updatedPrecinct: savedPrecinct,
      registeredVoterCounts: { splits: { [split2!.id]: 300 } },
    })
    .resolves(ok());
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await expectViewModePrecinct(history, savedPrecinct);
});

test('clears registered voter count for a precinct without splits', async () => {
  const savedPrecinct = precincts[0]!;
  assert(!hasSplits(savedPrecinct));

  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves([savedPrecinct]);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  const history = renderEditor();
  await navigateToPrecinctEdit(history, savedPrecinct.id);

  const voterCountInput = screen.getByLabelText('Registered Voters');
  await userEvent.type(voterCountInput, '100');
  await userEvent.clear(voterCountInput);

  apiMock.updatePrecinct
    .expectCallWith({ electionId, updatedPrecinct: savedPrecinct })
    .resolves(ok());
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves([savedPrecinct]);
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await expectViewModePrecinct(history, savedPrecinct);
});
