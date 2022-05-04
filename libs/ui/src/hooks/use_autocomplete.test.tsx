import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useCallback, useMemo } from 'react';
import { AutocompleteProps, useAutocomplete } from './use_autocomplete';

type onSuggestType<Option> = Exclude<
  AutocompleteProps<Option>['onSuggest'],
  undefined
>;
type onConfirmType<Option> = Exclude<
  AutocompleteProps<Option>['onConfirm'],
  undefined
>;

test('basic autocomplete', async () => {
  const onSuggest = jest.fn<
    ReturnType<onSuggestType<string>>,
    Parameters<onSuggestType<string>>
  >();
  const onConfirm = jest.fn<
    ReturnType<onConfirmType<string>>,
    Parameters<onConfirmType<string>>
  >();

  function TestComponent(): JSX.Element {
    const options = useMemo(() => ['one', 'two', 'three'], []);
    const getOptionLabel = useCallback((option: string): string => option, []);

    const autocomplete = useAutocomplete({
      options,
      getOptionLabel,
      onSuggest,
      onConfirm,
    });

    return (
      <input
        type="text"
        data-testid="autocomplete"
        {...autocomplete.getInputProps()}
      />
    );
  }

  render(<TestComponent />);

  const input = screen.getByTestId('autocomplete') as HTMLInputElement;

  // start typing something that will match
  userEvent.type(input, 'o');

  // "one" is suggested, with "ne" selected
  await waitFor(() => expect(input.value).toEqual('one'));
  expect(onSuggest).toHaveBeenNthCalledWith(1, 'o', 'one', 'one');
  expect(input.selectionStart).toEqual(1);
  expect(input.selectionEnd).toEqual(3);
  expect(input.selectionDirection).toEqual('backward');

  // keep typing something that matches, overwrites "ne" with "N"
  userEvent.type(input, 'N');

  // "oNe" is suggested, with "e" selected
  await waitFor(() => expect(input.value).toEqual('oNe'));
  expect(onSuggest).toHaveBeenNthCalledWith(2, 'oN', 'one', 'one');
  expect(input.selectionStart).toEqual(2);
  expect(input.selectionEnd).toEqual(3);
  expect(input.selectionDirection).toEqual('backward');

  // delete selection and one more
  userEvent.type(input, '{backspace}{backspace}');

  await waitFor(() => expect(input.value).toEqual('o'));
  expect(onSuggest).toHaveBeenCalledTimes(2);
  expect(input.selectionStart).toEqual(1);
  expect(input.selectionEnd).toEqual(1);

  // enter doesn't accept the suggestion because we backspaced
  userEvent.type(input, '{enter}');
  await waitFor(() => expect(input.value).toEqual('o'));
  expect(onSuggest).toHaveBeenCalledTimes(2);
  expect(onConfirm).not.toHaveBeenCalled();

  // type to bring back suggestion
  userEvent.type(input, 'ne');
  await waitFor(() => expect(input.value).toEqual('one'));
  expect(onSuggest).toHaveBeenNthCalledWith(3, 'on', 'one', 'one');
  expect(onSuggest).toHaveBeenNthCalledWith(4, 'one', 'one', 'one');
  expect(input.selectionStart).toEqual(3);
  expect(input.selectionEnd).toEqual(3);

  // since the user has typed the whole thing, enter does not confirm
  userEvent.type(input, '{enter}');

  await waitFor(() => expect(input.value).toEqual('one'));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(input.selectionStart).toEqual(3);
  expect(input.selectionEnd).toEqual(3);

  // bring the suggestion back and accept it
  userEvent.type(input, '{backspace}{backspace}n{enter}');
  await waitFor(() => expect(onConfirm).toHaveBeenNthCalledWith(1, 'one'));
  expect(onSuggest).toHaveBeenNthCalledWith(5, 'on', 'one', 'one');

  // make sure no pending suggestion will complete here either
  userEvent.clear(input);
  userEvent.type(input, '{enter}');
  await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

  // try something with multiple matches
  userEvent.type(input, 't');

  // selects the first match in the list
  await waitFor(() => expect(input.value).toEqual('two'));
  expect(onSuggest).toHaveBeenNthCalledWith(6, 't', 'two', 'two');
  expect(input.selectionStart).toEqual(1);
  expect(input.selectionEnd).toEqual(3);
  expect(input.selectionDirection).toEqual('backward');

  // unambiguously match a different option
  userEvent.type(input, 'h');
  await waitFor(() => expect(input.value).toEqual('three'));
  expect(onSuggest).toHaveBeenNthCalledWith(7, 'th', 'three', 'three');
  expect(input.selectionStart).toEqual(2);
  expect(input.selectionEnd).toEqual(5);
  expect(input.selectionDirection).toEqual('backward');

  // user confirms on tab, too
  userEvent.tab();
  await waitFor(() => expect(onConfirm).toHaveBeenNthCalledWith(2, 'three'));
  expect(onSuggest).toHaveBeenCalledTimes(7);
});

test('can pass a wrapped onInput through', () => {
  const onInput = jest.fn();

  function TestComponent(): JSX.Element {
    const options = useMemo(() => ['one', 'two', 'three'], []);
    const getOptionLabel = useCallback((option: string): string => option, []);

    const autocomplete = useAutocomplete({
      options,
      getOptionLabel,
    });

    return (
      <input
        type="text"
        data-testid="autocomplete"
        {...autocomplete.getInputProps({ onInput })}
      />
    );
  }

  render(<TestComponent />);
  const input = screen.getByTestId('autocomplete');
  userEvent.type(input, 'tw{enter}itter');
  expect(onInput).toHaveBeenCalledTimes(7);
});

test('can pass a wrapped onKeyDown through', () => {
  const onKeyDown = jest.fn();

  function TestComponent(): JSX.Element {
    const options = useMemo(() => ['one', 'two', 'three'], []);
    const getOptionLabel = useCallback((option: string): string => option, []);

    const autocomplete = useAutocomplete({
      options,
      getOptionLabel,
    });

    return (
      <input
        type="text"
        data-testid="autocomplete"
        {...autocomplete.getInputProps({ onKeyDown })}
      />
    );
  }

  render(<TestComponent />);
  const input = screen.getByTestId('autocomplete');
  userEvent.type(input, 'tw{enter}itter');
  expect(onKeyDown).toHaveBeenCalledTimes(8);
});

test('does not autocomplete unless typing at the end', () => {
  const onSuggest = jest.fn<
    ReturnType<onSuggestType<string>>,
    Parameters<onSuggestType<string>>
  >();

  function TestComponent(): JSX.Element {
    const options = useMemo(() => ['one', 'two', 'three'], []);
    const getOptionLabel = useCallback((option: string): string => option, []);

    const autocomplete = useAutocomplete({
      options,
      getOptionLabel,
      onSuggest,
    });

    return (
      <input
        type="text"
        data-testid="autocomplete"
        {...autocomplete.getInputProps()}
      />
    );
  }

  render(<TestComponent />);
  const input = screen.getByTestId('autocomplete');
  userEvent.type(input, 'n{arrowLeft}o');
  expect(onSuggest).not.toHaveBeenCalled();
});
