import { typedAs } from '@votingworks/basics';
import Select, {
  components,
  DropdownIndicatorProps,
  MultiValueRemoveProps,
  StylesConfig,
} from 'react-select';
import { useTheme } from 'styled-components';
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

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SearchSelectBaseProps<T extends string = string> {
  id?: string;
  isMulti?: boolean;
  isSearchable?: boolean;
  options: Array<SelectOption<T>>;
  ariaLabel?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}

export interface SearchSelectMultiProps<T extends string = string>
  extends SearchSelectBaseProps<T> {
  isMulti: true;
  value: T[];
  onChange: (values: T[]) => void;
  disabled?: boolean;
}

export interface SearchSelectSingleProps<T extends string = string>
  extends SearchSelectBaseProps<T> {
  isMulti?: false;
  value?: T;
  onChange: (value?: T) => void;
  disabled?: boolean;
}

export type SearchSelectProps<T extends string = string> =
  | SearchSelectSingleProps<T>
  | SearchSelectMultiProps<T>;

function findOption<T extends string = string>(
  options: Array<SelectOption<T>>,
  value: T
): SelectOption<T> | undefined {
  return options.find((option) => option.value === value);
}

export function SearchSelect<T extends string = string>({
  id,
  isMulti,
  isSearchable,
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
  placeholder,
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
      onChange={
        isMulti
          ? (selectedOptions: Array<SelectOption<T>>) =>
              onChange(selectedOptions.map((o) => o.value))
          : (selectedOption: SelectOption<T>) => onChange(selectedOption.value)
      }
      placeholder={placeholder ?? null}
      aria-label={ariaLabel}
      unstyled
      components={{ DropdownIndicator, MultiValueRemove }}
      className="search-select"
      maxMenuHeight="50vh"
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
          borderRadius,
          backgroundColor: state.isDisabled
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
