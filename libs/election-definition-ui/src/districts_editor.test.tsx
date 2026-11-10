import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { assertDefined, DateWithoutTime, err, ok } from '@votingworks/basics';
import type {
  DistrictsUpdate,
  ElectionInfo,
} from '@votingworks/election-definition-backend';
import {
  type District,
  ElectionStringKey,
  LanguageCode,
} from '@votingworks/types';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import { render, screen, within } from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import {
  DistrictsEditor,
  type DistrictsEditorProps,
} from './districts_editor.js';

let nextId = 0;
vi.mock(
  import('@votingworks/election-definition-backend'),
  async (importActual) => ({
    ...(await importActual()),
    generateId: () => {
      nextId += 1;
      return `test-random-id-${nextId}`;
    },
  })
);

const electionId = 'election-1';
const viewPath = `/elections/${electionId}/districts`;
const editPath = `${viewPath}/edit`;

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

let apiMock: MockApiClient;

beforeEach(() => {
  nextId = 0;
  apiMock = createMockApiClient();
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfo);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderEditor(props: Partial<DistrictsEditorProps> = {}) {
  const history = createMemoryHistory({ initialEntries: [viewPath] });
  render(
    provideApi(
      apiMock,
      withRoute(<DistrictsEditor electionId={electionId} {...props} />, {
        paramPath: '/elections/:electionId/districts',
        history,
      })
    )
  );
  return history;
}

function nextDistrictId(): string {
  return `test-random-id-${nextId + 1}`;
}

test('adding districts to empty list', async () => {
  apiMock.listDistricts.expectCallWith({ electionId }).resolves([]);

  const history = renderEditor();

  await screen.findByText(
    "You haven't added any districts to this election yet."
  );
  expect(screen.getButton('Edit Districts')).toBeDisabled();

  const newDistrict1: District = { id: nextDistrictId(), name: 'District 1' };
  await userEvent.click(screen.getButton('Add District'));
  await screen.findButton('Save');
  expect(history.location.pathname).toEqual(editPath);
  await userEvent.type(screen.getByRole('textbox'), newDistrict1.name);

  const newDistrict2: District = { id: nextDistrictId(), name: 'District 2' };
  await userEvent.click(screen.getButton('Add District'));
  await userEvent.type(screen.getAllByRole('textbox')[1]!, newDistrict2.name);

  const updatedList = [newDistrict1, newDistrict2];
  expectDistrictInputs(updatedList);

  expectUpdate({ electionId, newDistricts: updatedList }).resolves(ok());
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(updatedList);

  await userEvent.click(screen.getButton('Save'));

  await screen.findButton('Edit Districts');
  expectDistrictInputs(updatedList);
  expect(history.location.pathname).toEqual(viewPath);
});

test('editing existing district list', async () => {
  const savedDistricts: District[] = [
    { id: 'saved-district-1', name: 'Saved District 1' },
    { id: 'saved-district-2', name: 'Saved District 2' },
    { id: 'saved-district-3', name: 'Saved District 3' },
  ];
  const [preservedDistrict, deletedDistrict, renamedDistrict] = savedDistricts;
  const updatedDistrict: District = {
    ...renamedDistrict!,
    name: 'Saved District 3 (Updated)',
  };

  apiMock.listDistricts.expectCallWith({ electionId }).resolves(savedDistricts);

  renderEditor();

  await userEvent.click(await screen.findButton('Edit Districts'));
  expect(screen.queryButton('Edit Districts')).not.toBeInTheDocument();

  await userEvent.click(
    screen.getButton(`Delete District ${deletedDistrict!.name}`)
  );
  expectDistrictInputs([preservedDistrict!, renamedDistrict!]);

  const input = screen.getByDisplayValue(renamedDistrict!.name);
  await userEvent.clear(input);
  await userEvent.type(input, updatedDistrict.name);

  const newDistrict: District = { id: nextDistrictId(), name: 'New District' };
  await userEvent.click(screen.getButton('Add District'));
  {
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(3);
    await userEvent.type(inputs[2]!, newDistrict.name);
  }

  const updatedList = [preservedDistrict!, updatedDistrict, newDistrict];
  expectDistrictInputs(updatedList);

  expectUpdate({
    electionId,
    deletedDistrictIds: [deletedDistrict!.id],
    newDistricts: [newDistrict],
    updatedDistricts: [preservedDistrict!, updatedDistrict],
  }).resolves(ok());
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(updatedList);

  await userEvent.click(screen.getButton('Save'));

  const modal = await screen.findByRole('alertdialog');
  await userEvent.click(
    within(modal).getByRole('button', { name: 'Delete District' })
  );

  await screen.findButton('Edit Districts');
  expectDistrictInputs(updatedList);
});

test('editing and adding are disabled when locked', async () => {
  const districts: District[] = [{ id: 'district-1', name: 'District 1' }];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);

  renderEditor({ isLocked: true });

  await screen.findByDisplayValue('District 1');
  expect(screen.getButton('Add District')).toBeDisabled();
  expect(screen.queryButton('Edit Districts')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
});

test('cancelling', async () => {
  const savedDistricts: District[] = [
    { id: 'saved-district-1', name: 'Saved District 1' },
    { id: 'saved-district-2', name: 'Saved District 2' },
    { id: 'saved-district-3', name: 'Saved District 3' },
  ];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(savedDistricts);

  const history = renderEditor();

  await userEvent.click(await screen.findButton('Edit Districts'));
  expectDistrictInputs(savedDistricts);

  const newDistrictId = nextDistrictId();
  await userEvent.click(screen.getButton('Delete District Saved District 2'));
  await userEvent.click(screen.getButton('Add District'));

  const inputs = screen.getAllByRole('textbox');
  await userEvent.type(inputs[1]!, ' (Updated)');
  await userEvent.type(inputs[2]!, 'New District');

  expectDistrictInputs([
    { id: 'saved-district-1', name: 'Saved District 1' },
    { id: 'saved-district-3', name: 'Saved District 3 (Updated)' },
    { id: newDistrictId, name: 'New District' },
  ]);

  await userEvent.click(screen.getButton('Cancel'));

  await screen.findButton('Edit Districts');
  expectDistrictInputs(savedDistricts);
  expect(history.location.pathname).toEqual(viewPath);
});

test('error message for duplicate district name', async () => {
  const savedDistrict: District = { id: 'd1', name: 'District 1' };
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves([savedDistrict]);

  renderEditor();

  await userEvent.click(await screen.findButton('Edit Districts'));
  const newDistrict: District = { id: nextDistrictId(), name: 'District 1' };
  await userEvent.click(screen.getButton('Add District'));
  await userEvent.type(screen.getAllByRole('textbox')[1]!, newDistrict.name);

  expectUpdate({
    electionId,
    newDistricts: [newDistrict],
    updatedDistricts: [savedDistrict],
  }).resolves(err({ code: 'duplicate-name', districtId: newDistrict.id }));

  await userEvent.click(screen.getButton('Save'));

  await screen.findByText('There is already a district with the same name.');

  await userEvent.type(screen.getAllByRole('textbox')[1]!, ' (edit)');
  expect(screen.queryByText(/with the same name/i)).not.toBeInTheDocument();
});

test('add/delete disabled for elections with external source', async () => {
  apiMock.getElectionInfo.reset();
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves({ ...electionInfo, externalSource: 'ms-sems' });
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves([{ id: 'district-1', name: 'District 1' }]);

  renderEditor();

  await screen.findByDisplayValue('District 1');
  expect(screen.queryButton('Add District')).not.toBeInTheDocument();

  await userEvent.click(screen.getButton('Edit Districts'));
  await screen.findButton('Save');
  expect(screen.queryButton(/Delete District/i)).not.toBeInTheDocument();
});

test('audio editing', async () => {
  const districts: District[] = [
    { id: 'district-1', name: 'District 1' },
    { id: 'district-2', name: 'District 2' },
  ];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  apiMock.getStateFeatures
    .expectRepeatedCallsWith({ electionId })
    .resolves({ AUDIO_ENABLED: true });

  const history = renderEditor({
    AudioPanel: () => <div data-testid="audio-panel" />,
  });
  const editButton = await screen.findButton('Edit Districts');

  for (const district of districts) {
    const input = await screen.findByDisplayValue(district.name);
    const container = assertDefined(input.parentElement);
    await userEvent.click(
      await within(container).findButton(/preview or edit audio/i)
    );

    await screen.findByTestId('audio-panel');
    expect(history.location.pathname).toEqual(
      `${viewPath}/audio/${ElectionStringKey.DISTRICT_NAME}/${district.id}`
    );
  }

  await userEvent.click(editButton);
  expect(screen.queryByTestId('audio-panel')).not.toBeInTheDocument();
  expect(screen.queryButton(/preview or edit audio/i)).not.toBeInTheDocument();
});

test('single district deletion', async () => {
  const districts: District[] = [
    { id: 'district-1', name: 'District 1' },
    { id: 'district-2', name: 'District 2' },
    { id: 'district-3', name: 'District 3' },
  ];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  const history = renderEditor();

  await userEvent.click(await screen.findButton('Edit Districts'));
  await screen.findButton('Save');

  await userEvent.click(screen.getButton('Delete District District 2'));
  const newDistrict: District = { id: nextDistrictId(), name: 'District 4' };
  await userEvent.click(screen.getButton('Add District'));
  const inputs = screen.getAllByRole('textbox');
  await userEvent.type(inputs[inputs.length - 1]!, newDistrict.name);
  const updatedDistrictList = [districts[0]!, districts[2]!, newDistrict];
  expectDistrictInputs(updatedDistrictList);

  await userEvent.click(screen.getButton('Save'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Delete District' });
  within(modal).getByText(
    'Are you sure you want to delete district District 2?'
  );
  within(modal).getByText(
    'This will delete all contests associated with the district.'
  );
  within(modal).getByRole('button', { name: 'Cancel' });

  expectUpdate({
    electionId,
    deletedDistrictIds: [districts[1]!.id],
    newDistricts: [newDistrict],
    updatedDistricts: [districts[0]!, districts[2]!],
  }).resolves(ok());
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(updatedDistrictList);
  await userEvent.click(
    within(modal).getByRole('button', { name: 'Delete District' })
  );

  await screen.findButton('Edit Districts');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(history.location.pathname).toEqual(viewPath);
  expectDistrictInputs(updatedDistrictList);
});

test('multiple district deletion', async () => {
  const districts: District[] = [
    { id: 'district-1', name: 'District 1' },
    { id: 'district-2', name: 'District 2' },
    { id: 'district-3', name: 'District 3' },
  ];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  const history = renderEditor();

  await userEvent.click(await screen.findButton('Edit Districts'));
  await screen.findButton('Save');

  await userEvent.click(screen.getButton('Delete District District 2'));
  await userEvent.click(screen.getButton('Delete District District 3'));
  const newDistrict: District = { id: nextDistrictId(), name: 'District 4' };
  await userEvent.click(screen.getButton('Add District'));
  const inputs = screen.getAllByRole('textbox');
  await userEvent.type(inputs[inputs.length - 1]!, newDistrict.name);
  const updatedDistrictList = [districts[0]!, newDistrict];
  expectDistrictInputs(updatedDistrictList);

  await userEvent.click(screen.getButton('Save'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Delete Districts' });
  within(modal).getByText(
    'Are you sure you want to delete the following districts?'
  );
  within(modal).getByText('District 2');
  within(modal).getByText('District 3');
  within(modal).getByText(
    'This will delete all contests associated with these districts.'
  );
  within(modal).getByRole('button', { name: 'Cancel' });

  expectUpdate({
    electionId,
    deletedDistrictIds: [districts[1]!.id, districts[2]!.id],
    newDistricts: [newDistrict],
    updatedDistricts: [districts[0]!],
  }).resolves(ok());
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(updatedDistrictList);
  await userEvent.click(
    within(modal).getByRole('button', { name: 'Delete Districts' })
  );

  await screen.findButton('Edit Districts');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(history.location.pathname).toEqual(viewPath);
  expectDistrictInputs(updatedDistrictList);
});

test('cancel district deletion', async () => {
  const districts: District[] = [
    { id: 'district-1', name: 'District 1' },
    { id: 'district-2', name: 'District 2' },
  ];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  const history = renderEditor();

  await userEvent.click(await screen.findButton('Edit Districts'));
  await screen.findButton('Save');

  await userEvent.click(screen.getButton('Delete District District 1'));
  expectDistrictInputs([districts[1]!]);

  await userEvent.click(screen.getButton('Save'));
  const modal = await screen.findByRole('alertdialog');

  await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));

  await screen.findButton('Edit Districts');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(history.location.pathname).toEqual(viewPath);
  expectDistrictInputs(districts);
});

function expectDistrictInputs(districts: District[]) {
  const inputValues = screen
    .getAllByRole('textbox')
    .map((input) => (input as HTMLInputElement).value);
  expect(inputValues).toEqual(districts.map((d) => d.name));
}

function expectUpdate(input: DistrictsUpdate) {
  return apiMock.updateDistricts.expectCallWith({
    newDistricts: [],
    deletedDistrictIds: [],
    updatedDistricts: [],
    ...input,
  });
}
