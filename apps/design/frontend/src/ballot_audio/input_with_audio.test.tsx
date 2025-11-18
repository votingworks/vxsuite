import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { assert } from '@votingworks/basics';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { render, screen } from '../../test/react_testing_library';
import { InputWithAudio } from './input_with_audio';

test('passes through input props', () => {
  const onChange = vi.fn((event: React.ChangeEvent<HTMLInputElement>) => {
    assert(event.target instanceof HTMLInputElement);
    expect(event.target.value).toEqual('hello!');
  });

  render(
    <InputWithAudio
      audioScreenUrl="/audio/edit"
      editing={false}
      name="test_input"
      onChange={onChange}
      title="test_input"
      value="hello"
    />
  );

  const input = screen.getByRole('textbox', { name: 'test_input' });
  expect(input).toHaveValue('hello');
  userEvent.type(input, '!');
  expect(onChange).toHaveBeenCalled();
});

test('omits button when editing', () => {
  render(
    <InputWithAudio
      audioScreenUrl="/audio/edit"
      editing
      defaultValue="General Election"
    />
  );

  const input = screen.getByRole('textbox');
  expect(input).toHaveValue('General Election');
  expect(screen.queryButton('Preview or Edit Audio')).not.toBeInTheDocument();
});

test('omits button when empty', () => {
  render(
    <InputWithAudio
      audioScreenUrl="/audio/edit"
      defaultValue=""
      editing={false}
    />
  );

  screen.getByRole('textbox');
  expect(screen.queryButton('Preview or Edit Audio')).not.toBeInTheDocument();
});

test('audio button navigates to given href', () => {
  const history = createMemoryHistory({ initialEntries: ['/'] });

  render(
    <Router history={history}>
      <InputWithAudio
        audioScreenUrl="/audio/edit"
        defaultValue="General Election"
        editing={false}
      />
    </Router>
  );

  userEvent.click(screen.getButton('Preview or Edit Audio'));
  expect(history.location.pathname).toEqual('/audio/edit');
});

test('shows button tooltip on hover', () => {
  render(
    <InputWithAudio
      audioScreenUrl="/audio/edit"
      defaultValue="General Election"
      editing={false}
    />
  );

  userEvent.hover(screen.getButton('Preview or Edit Audio'));
  screen.getByText('Preview/Edit Audio');
});
