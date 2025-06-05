import { deepEqual, typedAs } from '@votingworks/basics';
import Select, {
  components,
  DropdownIndicatorProps,
  MultiValueRemoveProps,
  StylesConfig,
} from 'react-select';
import { useTheme } from 'styled-components';
import React from 'react';
import { Button } from './button';

function DropdownIndicator(
  props: DropdownIndicatorProps<unknown, true>
): JSX.Element {
  return (
    <components.DropdownIndicator {...props}>
      <Button
        fill="transparent"
        icon="CaretDown"
        // The react-select DropdownIndicator component has its own click
        // handler. It seems to work fine with the button inside it, so we just
        // put a dummy handler on the button itself.
        onPress={() => {}}
        style={{
          padding: '0.25rem',
          // Turn off inset shadow on press (:active) for touchscreen themes
          boxShadow: 'none',
        }}
        tabIndex={-1}
      />
    </components.DropdownIndicator>
  );
}

function MultiValueRemove(
  props: MultiValueRemoveProps<unknown, true>
): JSX.Element {
  const { selectProps } = props;
  return (
    <components.MultiValueRemove {...props}>
      <Button
        fill={selectProps.isDisabled ? 'transparent' : 'tinted'}
        color={selectProps.isDisabled ? 'neutral' : 'primary'}
        icon="X"
        // The react-select MultiValueRemove component has its own click
        // handler. It seems to work fine with the button inside it, so we just
        // put a dummy handler on the button itself.
        onPress={() => {}}
        style={{
          padding: '0 0.5rem',
          height: '100%',
          fontSize: '0.75rem',
          // Turn off inset shadow on press (:active) for touchscreen themes
          boxShadow: 'none',
        }}
      />
    </components.MultiValueRemove>
  );
}

export interface SelectOption<T = string> {
  value: T;
  label: React.ReactNode;
}

interface SearchSelectBaseProps<T = string> {
  id?: string;
  isMulti?: boolean;
  isSearchable?: boolean;
  options: Array<SelectOption<T>>;
  'aria-label'?: string;
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  onInputChange?: (value?: T) => void;
  menuPortalTarget?: HTMLElement;
  minMenuHeight?: number;
  maxMenuHeight?: number;
  noOptionsMessage?: () => React.ReactNode;
}

export interface SearchSelectMultiProps<T = string>
  extends SearchSelectBaseProps<T> {
  isMulti: true;
  value: T[];
  onChange: (values: T[]) => void;
}

export interface SearchSelectSingleProps<T = string>
  extends SearchSelectBaseProps<T> {
  isMulti?: false;
  value?: T;
  onChange: (value?: T) => void;
}

export type SearchSelectProps<T = string> =
  | SearchSelectSingleProps<T>
  | SearchSelectMultiProps<T>;

function findOption<T = string>(
  options: Array<SelectOption<T>>,
  value: T
): SelectOption<T> | undefined {
  return options.find((option) => deepEqual(option.value, value));
}

export function SearchSelect<T = string>({
  id,
  isMulti,
  isSearchable,
  options,
  value,
  onBlur,
  onChange,
  onFocus,
  onInputChange,
  'aria-label': ariaLabel,
  disabled,
  placeholder,
  required,
  menuPortalTarget,
  minMenuHeight,
  noOptionsMessage,
  maxMenuHeight = 600, // in px, 1/2 admin's vh
  style = {},
}: SearchSelectSingleProps<T> | SearchSelectMultiProps<T>): JSX.Element {
  const theme = useTheme();
  const borderRadius = `${theme.sizes.borderRadiusRem}rem`;

  return (
    <Select
      id={id}
      isMulti={isMulti}
      isSearchable={isSearchable}
      isClearable={false}
      isDisabled={disabled}
      options={options}
      value={
        Array.isArray(value)
          ? value.map((v) => findOption(options, v))
          : value !== undefined
          ? findOption(options, value)
          : null
      }
      onBlur={onBlur}
      onChange={
        isMulti
          ? (selectedOptions: Array<SelectOption<T>>) =>
              onChange(selectedOptions.map((o) => o.value))
          : (selectedOption: SelectOption<T>) => onChange(selectedOption.value)
      }
      onFocus={onFocus}
      onInputChange={onInputChange}
      placeholder={placeholder ?? null}
      required={required}
      aria-label={ariaLabel}
      unstyled
      components={{ DropdownIndicator, MultiValueRemove }}
      className="search-select"
      menuPlacement="auto"
      menuPortalTarget={menuPortalTarget}
      minMenuHeight={minMenuHeight}
      maxMenuHeight={maxMenuHeight}
      noOptionsMessage={noOptionsMessage}
      styles={typedAs<StylesConfig>({
        container: (baseStyles) => ({
          ...baseStyles,
          display: 'inline-block',
          lineHeight: theme.sizes.lineHeight,
          fontWeight: theme.sizes.fontWeight.semiBold,
          ...style,
        }),
        control: (baseStyles, state) => ({
          ...baseStyles,
          border: `${theme.colors.outline} solid ${theme.sizes.bordersRem.thin}rem`,
          borderStyle: state.isDisabled ? 'dashed' : 'solid',
          borderRadius: style?.borderRadius ?? borderRadius,
          backgroundColor: style?.backgroundColor
            ? style.backgroundColor
            : state.isDisabled
            ? theme.colors.container
            : state.isFocused
            ? theme.colors.background
            : theme.colors.containerLow,
          padding: '0.25rem',
          outline: state.isFocused ? `var(--focus-outline)` : undefined,
        }),
        valueContainer: (baseStyles, state) => ({
          ...baseStyles,
          gap: '0.25rem',
          cursor: isSearchable ? 'text' : 'pointer',
          padding: isMulti && state.hasValue ? 0 : '0.25rem',
        }),
        multiValue: (baseStyles, state) => ({
          ...baseStyles,
          alignItems: 'center',
          backgroundColor: state.isDisabled
            ? theme.colors.containerHigh
            : theme.colors.primaryContainer,
          color: theme.colors.onBackground,
          borderRadius,
          border:
            theme.colorMode === 'desktop'
              ? undefined
              : `${theme.sizes.bordersRem.hairline}rem solid ${theme.colors.outline}`,
          cursor: 'default',
          // Match the Button transition in the MultiValueRemove button
          transition: '100ms ease-in',
        }),
        dropdownIndicator: (baseStyles) => ({
          ...baseStyles,
          height: '100%',
        }),
        multiValueLabel: (baseStyles) => ({
          ...baseStyles,
          padding: `0.25rem 0.25rem 0.25rem 0.5rem`,
        }),
        menuPortal: (baseStyles) => ({
          ...baseStyles,
          zIndex: 10,
        }),
        menu: (baseStyles) => ({
          ...baseStyles,
          border: `${theme.sizes.bordersRem.thin}rem solid ${theme.colors.outline}`,
          borderRadius,
          backgroundColor: theme.colors.background,
          margin:
            theme.sizeMode === 'desktop'
              ? '0.5rem 0'
              : `${theme.sizes.minTouchAreaSeparationPx}px 0`,
          width: '100%',
          zIndex: 10,
        }),
        menuList: (baseStyles) => ({
          ...baseStyles,
          borderRadius,
          '::-webkit-scrollbar': { display: 'none' },
        }),
        option: (baseStyles, state) => ({
          ...baseStyles,
          padding: '0.5rem',
          backgroundColor: state.isSelected
            ? theme.colors.primaryContainer
            : state.isFocused
            ? theme.colors.container
            : theme.colors.background,
          color: theme.colors.onBackground,
          cursor: 'pointer',
          borderBottom:
            theme.colorMode === 'desktop'
              ? undefined
              : `${theme.sizes.bordersRem.hairline}rem solid ${theme.colors.outline}`,
          ':last-of-type': { borderBottom: 'none' },
          // Ensure empty option still has height
          minHeight: '2.5rem',
          // Fix slight vertical shift when menu is rendered in a portal (missing inherited line-height)
          lineHeight: menuPortalTarget ? theme.sizes.lineHeight : undefined,
        }),
        noOptionsMessage: (baseStyles) => ({
          ...baseStyles,
          textAlign: 'left',
          padding: '0.5rem',
        }),
        // If the select wraps to multiple rows, keep the dropdown indicator
        // aligned to the first row
        indicatorsContainer: (baseStyles) => ({
          ...baseStyles,
          alignItems: 'start',
        }),
        placeholder: (baseStyles) => ({
          ...baseStyles,
          color: theme.colors.onBackgroundMuted,
        }),
      })}
    />
  );
}
