import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import {
  MARK_RESULTS_OFFICIAL_BUTTON_TEXT,
  MarkResultsOfficialButton,
} from './mark_official_button';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen, within } from '../../test/react_testing_library';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('mark results as official', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  apiMock.expectGetCastVoteRecordFileMode('official');

  renderInAppContext(<MarkResultsOfficialButton />, {
    electionDefinition,
    apiMock,
    isOfficialResults: false,
  });

  await vi.waitFor(() => {
    expect(screen.getButton(MARK_RESULTS_OFFICIAL_BUTTON_TEXT)).toBeEnabled();
  });

  // open and close modal
  userEvent.click(screen.getButton(MARK_RESULTS_OFFICIAL_BUTTON_TEXT));
  let modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getButton('Cancel'));
  await vi.waitFor(() => expect(modal).not.toBeInTheDocument());

  // open and mark official
  userEvent.click(screen.getButton(MARK_RESULTS_OFFICIAL_BUTTON_TEXT));
  modal = await screen.findByRole('alertdialog');
  apiMock.expectMarkResultsOfficial();
  userEvent.click(within(modal).getButton(MARK_RESULTS_OFFICIAL_BUTTON_TEXT));
  await vi.waitFor(() => expect(modal).not.toBeInTheDocument());
});

test('mark official results button disabled when no cvr files', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  apiMock.expectGetCastVoteRecordFileMode('unlocked'); // no CVR files
  renderInAppContext(<MarkResultsOfficialButton />, {
    electionDefinition,
    apiMock,
  });

  // button only can be enabled after CVR file mode query completes
  await vi.waitFor(() => {
    apiMock.assertComplete();
  });

  expect(screen.getButton(MARK_RESULTS_OFFICIAL_BUTTON_TEXT)).toBeDisabled();
});

test('mark official results button disabled when already official', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  apiMock.expectGetCastVoteRecordFileMode('official');
  renderInAppContext(<MarkResultsOfficialButton />, {
    electionDefinition,
    apiMock,
    isOfficialResults: true,
  });

  // button only can be enabled after CVR file mode query completes
  await vi.waitFor(() => {
    apiMock.assertComplete();
  });

  expect(screen.getButton(MARK_RESULTS_OFFICIAL_BUTTON_TEXT)).toBeDisabled();
});
