import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInAdjudicationTable } from './write_in_adjudication_table';

test('render', () => {
  renderInAppContext(
    <WriteInAdjudicationTable
      adjudicatedGroups={[]}
      pendingAdjudications={[]}
      adjudicationValues={[]}
      adjudicationQueuePhrase="adjudication queue"
      adjudicateTranscription={jest.fn()}
      updateAdjudication={jest.fn()}
    />
  );
});

test('adjudicated groups', async () => {
  const updateAdjudication = jest.fn();

  renderInAppContext(
    <WriteInAdjudicationTable
      adjudicatedGroups={[
        {
          adjudicatedValue: 'Yoda',
          writeInAdjudications: [
            {
              id: '1',
              adjudicatedValue: 'Yoda',
              transcribedValue: 'Baby Yoda',
              writeInCount: 1,
            },
            {
              id: '2',
              adjudicatedValue: 'Yoda',
              transcribedValue: 'Yogurt',
              writeInCount: 2,
            },
          ],
          writeInCount: 3,
        },
      ]}
      pendingAdjudications={[]}
      adjudicationValues={[
        {
          adjudicatedValue: 'Yoda',
          hasAdjudication: false,
          adjudicatedOptionId: 'yoda',
        },
        {
          adjudicatedValue: 'Baby Yoda',
          hasAdjudication: false,
        },
      ]}
      adjudicationQueuePhrase="adjudication queue"
      adjudicateTranscription={jest.fn()}
      updateAdjudication={updateAdjudication}
    />
  );

  // "Baby Yoda" transcription
  expect(await screen.findByText('Baby Yoda')).toBeInTheDocument();
  expect(await screen.findByText('1')).toBeInTheDocument();

  // "Yogurt" transcription
  expect(await screen.findByText('Yogurt')).toBeInTheDocument();
  expect(await screen.findByText('2')).toBeInTheDocument();

  // "Yoda" adjudicated group
  expect(await screen.findByText('Yoda')).toBeInTheDocument();
  expect(await screen.findByText('3')).toBeInTheDocument();

  const changeButtons = await screen.findAllByText('Change');
  const babyYodaChangeButton = changeButtons[0];

  userEvent.click(babyYodaChangeButton);
  userEvent.selectOptions(screen.getByRole('combobox'), 'Yoda');

  expect(updateAdjudication).toHaveBeenNthCalledWith(1, '1', 'Yoda', 'yoda');
});

test('pending adjudications', async () => {
  const adjudicateTranscription = jest.fn();

  renderInAppContext(
    <WriteInAdjudicationTable
      adjudicatedGroups={[]}
      pendingAdjudications={[
        {
          transcribedValue: 'Baby Yoda',
          writeInCount: 1,
        },
        {
          transcribedValue: 'Yogurt',
          writeInCount: 2,
        },
      ]}
      adjudicationValues={[
        {
          adjudicatedValue: 'Yoda',
          hasAdjudication: false,
          adjudicatedOptionId: 'yoda',
        },
      ]}
      adjudicationQueuePhrase="adjudication queue"
      adjudicateTranscription={adjudicateTranscription}
      updateAdjudication={jest.fn()}
    />
  );

  // "Baby Yoda" transcription
  expect(await screen.findByText('Baby Yoda')).toBeInTheDocument();
  expect(await screen.findByText('1')).toBeInTheDocument();

  // "Yogurt" transcription
  expect(await screen.findByText('Yogurt')).toBeInTheDocument();
  expect(await screen.findByText('2')).toBeInTheDocument();

  const adjudicationSelects = await screen.findAllByRole('combobox');
  const babyYodaAdjudicationSelect = adjudicationSelects[0];

  userEvent.selectOptions(babyYodaAdjudicationSelect, 'Yoda');

  expect(adjudicateTranscription).toHaveBeenNthCalledWith(
    1,
    'Baby Yoda',
    'Yoda',
    'yoda'
  );
});

test('adjudicated groups and pending adjudications', async () => {
  renderInAppContext(
    <WriteInAdjudicationTable
      adjudicatedGroups={[
        {
          adjudicatedValue: 'Yoda',
          writeInAdjudications: [
            {
              id: '1',
              adjudicatedValue: 'Yoda',
              transcribedValue: 'Baby Yoda',
              writeInCount: 1,
            },
            {
              id: '2',
              adjudicatedValue: 'Yoda',
              transcribedValue: 'Yogurt',
              writeInCount: 2,
            },
          ],
          writeInCount: 3,
        },
      ]}
      pendingAdjudications={[
        {
          transcribedValue: 'Darth Vader',
          writeInCount: 4,
        },
        {
          transcribedValue: 'Dark Helmet',
          writeInCount: 5,
        },
      ]}
      adjudicationValues={[]}
      adjudicationQueuePhrase="adjudication queue"
      adjudicateTranscription={jest.fn()}
      updateAdjudication={jest.fn()}
    />
  );

  // "Baby Yoda" transcription
  expect(await screen.findByText('Baby Yoda')).toBeInTheDocument();
  expect(await screen.findByText('1')).toBeInTheDocument();

  // "Yogurt" transcription
  expect(await screen.findByText('Yogurt')).toBeInTheDocument();
  expect(await screen.findByText('2')).toBeInTheDocument();

  // "Yoda" adjudicated group
  expect(await screen.findByText('Yoda')).toBeInTheDocument();
  expect(await screen.findByText('3')).toBeInTheDocument();

  // "Darth Vader" adjudicated group
  expect(await screen.findByText('Darth Vader')).toBeInTheDocument();
  expect(await screen.findByText('4')).toBeInTheDocument();

  // "Dark Helmet" adjudicated group
  expect(await screen.findByText('Dark Helmet')).toBeInTheDocument();
  expect(await screen.findByText('5')).toBeInTheDocument();
});
