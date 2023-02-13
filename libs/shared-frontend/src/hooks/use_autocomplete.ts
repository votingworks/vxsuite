import React, { useCallback, useRef } from 'react';

export interface AutocompleteProps<Option> {
  /**
   * Values that can be autocompleted. These need not be strings, but it should
   * be easy to get a string label from an `Option`.
   */
  options: readonly Option[];

  /**
   * Gets the string label that will complete `option`.
   */
  getOptionLabel(option: Option): string;

  /**
   * Callback for when an autocomplete is suggested, i.e. the user's typed text
   * is extended with the label for an `option`.
   */
  onSuggest?(
    typedText: string,
    autocompleteLabel: string,
    option: Option
  ): void;

  /**
   * Callback for when the user confirms the autocomplete suggestion.
   */
  onConfirm?(option: Option): void;
}

type InputProps = React.DetailedHTMLProps<
  React.InputHTMLAttributes<HTMLInputElement>,
  HTMLInputElement
>;

export interface Autocomplete {
  /**
   * Gets props to pass to an `<input>` to facilitate the autocomplete.
   */
  getInputProps(props?: InputProps): InputProps;
}

/**
 * Provides support for building a custom autocomplete component around an
 * `<input>`. Takes configuration and returns an object to configure the
 * `<input>` element.
 */
export function useAutocomplete<Option>({
  options,
  getOptionLabel,
  onConfirm,
  onSuggest: onAutocomplete,
}: AutocompleteProps<Option>): Autocomplete {
  const pendingOptionRef = useRef<Option>();

  const getAutocompleteLabel = useCallback(
    (option: Option, inputText: string): string | undefined => {
      const label = getOptionLabel(option);
      if (label.toLocaleLowerCase().startsWith(inputText.toLocaleLowerCase())) {
        return label;
      }
    },
    [getOptionLabel]
  );

  const getInputProps: Autocomplete['getInputProps'] = useCallback(
    (inputProps) => ({
      ...(inputProps ?? {}),

      autoComplete: 'off',

      onInput: (event) => {
        const nativeEvent = event.nativeEvent as InputEvent;

        if (nativeEvent.inputType === 'insertText') {
          const input = event.currentTarget;
          const { selectionStart, selectionEnd, value: typedText } = input;
          const isAtEnd =
            selectionStart === selectionEnd &&
            selectionStart === typedText.length;

          if (isAtEnd) {
            for (const option of options) {
              const autocompleteLabel = getAutocompleteLabel(option, typedText);
              if (autocompleteLabel) {
                pendingOptionRef.current = option;
                input.value =
                  typedText + autocompleteLabel.slice(typedText.length);
                input.setSelectionRange(
                  typedText.length,
                  autocompleteLabel.length,
                  'backward'
                );
                onAutocomplete?.(typedText, autocompleteLabel, option);
                break;
              }
            }
          }
        } else {
          // user did something that wasn't normal typing
          pendingOptionRef.current = undefined;
        }

        inputProps?.onInput?.(event);
      },

      onKeyDown: (event) => {
        const input = event.currentTarget;

        if (pendingOptionRef.current) {
          const option = pendingOptionRef.current;
          const label = getOptionLabel(option);
          if (
            input.selectionStart !== input.selectionEnd &&
            (event.key === 'Enter' || event.key === 'Tab')
          ) {
            input.value = label;
            pendingOptionRef.current = undefined;

            if (event.key === 'Enter') {
              event.preventDefault();
            }

            onConfirm?.(option);
          }
        }

        inputProps?.onKeyDown?.(event);
      },
    }),
    [getAutocompleteLabel, getOptionLabel, onAutocomplete, onConfirm, options]
  );

  return { getInputProps };
}
