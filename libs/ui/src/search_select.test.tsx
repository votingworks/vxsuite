import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { render, screen } from '../test/react_testing_library';
import {
  SearchSelect,
  SearchSelectProps,
  SearchSelectSingleProps,
} from './search_select';
import { makeTheme } from './themes/make_theme';

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'grape', label: 'Grape' },
  { value: 'orange', label: 'Orange' },
  { value: 'pear', label: 'Pear' },
];

function ControlledSingleSelect<T>({
  value: valueProp,
  ...rest
}: Partial<SearchSelectSingleProps<T>>): JSX.Element {
  const [value, setValue] = React.useState<T | undefined>(valueProp);
  return (
    <SearchSelect<T>
      isSearchable={false}
      options={[]}
      {...rest}
      isMulti={false}
      value={value}
      onChange={setValue}
    />
  );
}

function ControlledMultiSelect({
  value: valueProp = [],
  ...rest
}: Partial<SearchSelectProps>): JSX.Element {
  const [value, setValue] = React.useState<string[]>(valueProp as string[]);
  return (
    <SearchSelect<string>
      isSearchable={false}
      options={[]}
      {...rest}
      isMulti
      value={value}
      onChange={setValue}
    />
  );
}

test('single and not searchable', () => {
  render(
    <ControlledSingleSelect
      isSearchable={false}
      options={options}
      aria-label="Choose Fruit"
      placeholder="Pick a fruit"
      // Set menuPortalTarget and style overrides in one test for coverage
      menuPortalTarget={document.body}
      style={{ borderRadius: '0.5rem', backgroundColor: 'black' }}
    />,
    // Change theme in one test for coverage
    { vxTheme: makeTheme({ sizeMode: 'desktop', colorMode: 'desktop' }) }
  );

  // dropdown is closed
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }

  // open dropdown using arrow
  userEvent.click(
    screen.getByRole('button', {
      hidden: true,
    })
  );
  for (const option of options) {
    screen.getByRole('option', { name: option.label });
  }

  // close dropdown using arrow
  userEvent.click(
    screen.getByRole('button', {
      hidden: true,
    })
  );
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }

  screen.getByText('Pick a fruit');

  // open dropdown by clicking input
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  for (const option of options) {
    screen.getByRole('option', { name: option.label });
  }

  // make selection, which should close dropdown and hide other options
  userEvent.click(screen.getByText('Apple'));
  expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  screen.getByText('Apple');

  // typing should do nothing
  userEvent.click(screen.getByText('Apple'));
  userEvent.keyboard('Papaya');
  expect(screen.queryByText('Papaya')).not.toBeInTheDocument();

  // make another selection
  userEvent.click(screen.getByRole('option', { name: 'Banana' }));
  expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  screen.getByText('Banana');
});

test('single and searchable', async () => {
  render(
    <ControlledSingleSelect
      isSearchable
      options={options}
      aria-label="Choose Fruit"
    />
  );

  // dropdown is closed
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }

  // open dropdown
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  for (const option of options) {
    await screen.findByRole('option', { name: option.label });
  }

  // narrow search
  userEvent.keyboard('ap');
  await screen.findByText('Apple');
  await screen.findByText('Grape');
  expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  expect(screen.queryByText('Orange')).not.toBeInTheDocument();
  expect(screen.queryByText('Pear')).not.toBeInTheDocument();

  // narrow search too far
  userEvent.keyboard('w');
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }
  screen.getByText('No options');

  // fix search
  userEvent.keyboard('{Backspace}');
  userEvent.click(screen.getByText('Apple'));
  screen.getByText('Apple');

  // we can search after the selection, and re-select
  userEvent.click(screen.getByText('Apple'));
  userEvent.keyboard('pea');
  screen.getByText('Pear');
  expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  userEvent.click(screen.getByText('Pear'));
  screen.getByText('Pear');
});

test('single disabled', () => {
  render(
    <ControlledSingleSelect
      options={options}
      aria-label="Choose Fruit"
      value="apple"
      disabled
    />
  );
  const select = screen.getByLabelText('Choose Fruit');
  expect(select).toBeDisabled();
  screen.getByText('Apple');
});

test('multi and not searchable', () => {
  render(
    <ControlledMultiSelect
      isSearchable={false}
      options={options}
      aria-label="Choose Fruit"
    />,
    // Change theme in one test for coverage
    { vxTheme: makeTheme({ sizeMode: 'desktop', colorMode: 'desktop' }) }
  );

  // dropdown is closed
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }

  // open dropdown
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  for (const option of options) {
    screen.getByRole('option', { name: option.label });
  }

  // make selection, which should close dropdown and show selection
  userEvent.click(screen.getByText('Apple'));
  expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  screen.getByText('Apple');

  // re-open dropdown and make additional selection, so two values are selected
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  userEvent.click(screen.getByText('Banana'));
  screen.getByText('Apple');
  screen.getByText('Banana');
  expect(screen.queryByText('Grape')).not.toBeInTheDocument();

  // remove a selection
  userEvent.click(screen.getByLabelText('Remove Apple'));
  screen.getByText('Banana');
  expect(screen.queryByText('Apple')).not.toBeInTheDocument();
});

test('multi and searchable', async () => {
  render(
    <ControlledMultiSelect
      isSearchable
      options={options}
      aria-label="Choose Fruit"
    />
  );

  // dropdown is closed
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }

  // open dropdown
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  for (const option of options) {
    await screen.findByRole('option', { name: option.label });
  }

  // narrow search
  userEvent.keyboard('ap');
  await screen.findByText('Apple');
  await screen.findByText('Grape');
  expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  expect(screen.queryByText('Orange')).not.toBeInTheDocument();
  expect(screen.queryByText('Pear')).not.toBeInTheDocument();

  // narrow search too far
  userEvent.keyboard('w');
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }
  screen.getByText('No options');

  // fix search
  userEvent.keyboard('{Backspace}');
  userEvent.click(screen.getByText('Apple'));
  screen.getByText('Apple');

  // search for second selection
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  userEvent.keyboard('bana');
  screen.getByText('Banana');
  userEvent.click(screen.getByText('Banana'));
});

test('multi disabled', () => {
  render(
    <ControlledMultiSelect
      options={options}
      aria-label="Choose Fruit"
      value={['apple', 'pear']}
      disabled
    />
  );
  const select = screen.getByLabelText('Choose Fruit');
  expect(select).toBeDisabled();
  screen.getByText('Apple');
  screen.getByText('Pear');
});

test('empty option', () => {
  render(
    <ControlledSingleSelect
      options={[{ value: '', label: 'None' }, ...options]}
      aria-label="Choose Fruit"
      value="apple"
    />
  );

  screen.getByText('Apple');
  userEvent.click(screen.getByText('Apple'));
  userEvent.click(screen.getByText('None'));
  expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  screen.getByText('None');
});

test('complex value type uses deep equality', () => {
  render(
    <ControlledSingleSelect
      options={[
        { value: { fruit: 'apple', color: 'red' }, label: 'Red Apple' },
        { value: { fruit: 'apple', color: 'green' }, label: 'Green Apple' },
      ]}
      aria-label="Choose Fruit"
      value={{ fruit: 'apple', color: 'red' }}
    />
  );

  screen.getByText('Red Apple');
  userEvent.click(screen.getByText('Red Apple'));
  userEvent.click(screen.getByText('Green Apple'));
  screen.getByText('Green Apple');
  expect(screen.queryByText('Red Apple')).not.toBeInTheDocument();
});
