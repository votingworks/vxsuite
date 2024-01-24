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

function ControlledSingleSelect({
  value: valueProp,
  ...rest
}: Partial<SearchSelectSingleProps>): JSX.Element {
  const [value, setValue] = React.useState<string | undefined>(valueProp);
  return (
    <SearchSelect
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
    <SearchSelect
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
      ariaLabel="Choose Fruit"
      placeholder="Pick a fruit"
    />,
    // Change theme in one test for coverage
    { vxTheme: makeTheme({ sizeMode: 'desktop', colorMode: 'desktop' }) }
  );

  // dropdown is closed
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }

  screen.getByText('Pick a fruit');

  // open dropdown
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  for (const option of options) {
    screen.getByText(option.label);
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
  userEvent.click(screen.getByText('Banana'));
  expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  screen.getByText('Banana');
});

test('single and searchable', async () => {
  render(
    <ControlledSingleSelect
      isSearchable
      options={options}
      ariaLabel="Choose Fruit"
    />
  );

  // dropdown is closed
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }

  // open dropdown
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  for (const option of options) {
    await screen.findByText(option.label);
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
      ariaLabel="Choose Fruit"
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
      ariaLabel="Choose Fruit"
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
    screen.getByText(option.label);
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
      ariaLabel="Choose Fruit"
    />
  );

  // dropdown is closed
  for (const option of options) {
    expect(screen.queryByText(option.label)).not.toBeInTheDocument();
  }

  // open dropdown
  userEvent.click(screen.getByLabelText('Choose Fruit'));
  for (const option of options) {
    await screen.findByText(option.label);
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
      ariaLabel="Choose Fruit"
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
      ariaLabel="Choose Fruit"
      value="apple"
    />
  );

  screen.getByText('Apple');
  userEvent.click(screen.getByText('Apple'));
  userEvent.click(screen.getByText('None'));
  expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  screen.getByText('None');
});
