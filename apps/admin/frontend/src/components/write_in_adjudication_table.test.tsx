import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { assert } from '@votingworks/basics';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInAdjudicationTable } from './write_in_adjudication_table';

test('adjudicated groups and pending adjudications', async () => {
  const adjudicateTranscription = jest.fn();
  const updateAdjudication = jest.fn();

  renderInAppContext(
    <WriteInAdjudicationTable
      adjudicationTable={{
        contestId: 'contest-id',
        writeInCount: 3,
        adjudicated: [
          {
            adjudicatedValue: 'Yoda',
            writeInCount: 3,
            rows: [
              {
                transcribedValue: 'Baby Yoda',
                writeInCount: 1,
                writeInAdjudicationId: 'baby-yoda-adjudication-id',
                editable: true,
                adjudicationOptionGroups: [
                  {
                    title: 'Official Candidates',
                    options: [
                      {
                        adjudicatedValue: 'Leah Organa',
                        adjudicatedOptionId: 'leah-organa',
                        enabled: true,
                      },
                    ],
                  },
                ],
              },
              {
                transcribedValue: 'Yogurt',
                writeInCount: 2,
                writeInAdjudicationId: 'yogurt-adjudication-id',
                editable: true,
                adjudicationOptionGroups: [
                  {
                    title: 'Official Candidates',
                    options: [
                      {
                        adjudicatedValue: 'Leah Organa',
                        adjudicatedOptionId: 'leah-organa',
                        enabled: true,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        transcribed: {
          writeInCount: 4,
          rows: [
            {
              transcribedValue: 'Dark Helmet',
              writeInCount: 4,
              adjudicationOptionGroups: [
                {
                  title: 'Official Candidates',
                  options: [
                    {
                      adjudicatedValue: 'Leah Organa',
                      adjudicatedOptionId: 'leah-organa',
                      enabled: true,
                    },
                  ],
                },
                {
                  title: 'Write-In Candidates',
                  options: [{ adjudicatedValue: 'Yoda', enabled: true }],
                },
                {
                  title: 'Original Transcription',
                  options: [{ adjudicatedValue: 'Dark Helmet', enabled: true }],
                },
              ],
            },
          ],
        },
      }}
      adjudicationQueuePhrase="adjudication queue"
      adjudicateTranscription={adjudicateTranscription}
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
  expect(await screen.findAllByText('Yoda')).toHaveLength(2);
  expect(await screen.findByText('3')).toBeInTheDocument();

  // "Dark Helmet" adjudicated group
  expect(await screen.findAllByText('Dark Helmet')).toHaveLength(2);
  expect(await screen.findByText('4')).toBeInTheDocument();

  // begin changing "Baby Yoda" adjudication
  userEvent.click((await screen.findAllByText('Change'))[0]);

  const comboboxes = await screen.findAllByRole('combobox');
  const [babyYodaCombobox, darkHelmetCombobox] = comboboxes;
  assert(babyYodaCombobox);
  assert(darkHelmetCombobox);

  userEvent.selectOptions(babyYodaCombobox, 'Leah Organa');
  expect(updateAdjudication).toHaveBeenCalledWith(
    'baby-yoda-adjudication-id',
    'Leah Organa',
    'leah-organa'
  );

  userEvent.selectOptions(darkHelmetCombobox, 'Leah Organa');
  expect(adjudicateTranscription).toHaveBeenCalledWith(
    'Dark Helmet',
    'Leah Organa',
    'leah-organa'
  );
});
