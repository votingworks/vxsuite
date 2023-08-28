import { typedAs } from '@votingworks/basics';
import Select, {
  components,
  DropdownIndicatorProps,
  MultiValueRemoveProps,
  StylesConfig,
} from 'react-select';
import { useTheme } from 'styled-components';
import { Icons } from './icons';

function DropdownIndicator(
  props: DropdownIndicatorProps<unknown, true>
): JSX.Element {
  return (
    <components.DropdownIndicator {...props}>
      <Icons.CaretDown />
    </components.DropdownIndicator>
  );
}

function MultiValueRemove(
  props: MultiValueRemoveProps<unknown, true>
): JSX.Element {
  return (
    <components.MultiValueRemove {...props}>
      <Icons.X />
    </components.MultiValueRemove>
  );
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SearchSelectBaseProps<T extends string = string> {
  isMulti: boolean;
  isSearchable: boolean;
  options: Array<SelectOption<T>>;
  ariaLabel?: string;
}

export interface SearchSelectMultiProps<T extends string = string>
  extends SearchSelectBaseProps<T> {
  isMulti: true;
  value: T[];
  onChange: (values: T[]) => void;
}

export interface SearchSelectSingleProps<T extends string = string>
  extends SearchSelectBaseProps<T> {
  isMulti: false;
  value?: T;
  onChange: (value?: T) => void;
}

export type SearchSelectProps<T extends string = string> =
  | SearchSelectSingleProps<T>
  | SearchSelectMultiProps<T>;

export function SearchSelect<T extends string = string>({
  isMulti,
  isSearchable,
  options,
  value,
  onChange,
  ariaLabel,
}: SearchSelectSingleProps<T> | SearchSelectMultiProps<T>): JSX.Element {
  const theme = useTheme();

  return (
    <Select
      isMulti={isMulti}
      isSearchable={isSearchable}
      isClearable={false}
      options={options}
      defaultValue={value}
      onChange={onChange}
      placeholder={null}
      aria-label={ariaLabel}
      unstyled
      components={{ DropdownIndicator, MultiValueRemove }}
      styles={typedAs<StylesConfig>({
        container: (baseStyles) => ({
          ...baseStyles,
          lineHeight: theme.sizes.lineHeight,
        }),
        control: (baseStyles) => ({
          ...baseStyles,
          border: `solid ${theme.colors.foreground} ${theme.sizes.bordersRem.thin}rem`,
          borderRadius: '0.25rem',
          backgroundColor: theme.colors.background,
          minHeight: isMulti ? '2.2rem' : undefined,
        }),
        valueContainer: (baseStyles) => ({
          ...baseStyles,
          margin: `0.25rem`,
          gap: '0.2rem',
        }),
        singleValue: (baseStyles) => ({
          ...baseStyles,
          fontWeight: theme.sizes.fontWeight.semiBold,
        }),
        multiValue: (baseStyles) => ({
          ...baseStyles,
          backgroundColor: theme.colors.foreground,
          color: theme.colors.background,
          borderRadius: '0.25rem',
        }),
        multiValueLabel: (baseStyles) => ({
          ...baseStyles,
          padding: `0.1rem 0.15rem 0.1rem 0.3rem`,
          fontWeight: theme.sizes.fontWeight.semiBold,
        }),
        multiValueRemove: (baseStyles) => ({
          ...baseStyles,
          padding: `0 0.25rem`,
          border: `solid ${theme.colors.foreground} ${theme.sizes.bordersRem.hairline}rem`,
          borderRadius: '0 0.25rem 0.25rem 0',
          color: theme.colors.background,
          fontSize: '0.7em',
          ':hover': {
            backgroundColor: theme.colors.background,
            color: theme.colors.foreground,
          },
        }),
        dropdownIndicator: (baseStyles) => ({
          ...baseStyles,
          padding: `0 0.5rem`,
        }),
        menu: (baseStyles) => ({
          ...baseStyles,
          border: `solid ${theme.colors.foreground} ${theme.sizes.bordersRem.hairline}rem`,
          borderRadius: '0.25rem',
          backgroundColor: theme.colors.background,
          top: 'calc(100% + 0.5rem)',
        }),
        menuList: (baseStyles) => ({
          ...baseStyles,
          borderRadius: '0.25rem',
        }),
        option: (baseStyles, state) => ({
          ...baseStyles,
          padding: '0 0.25rem',
          backgroundColor: state.isSelected
            ? theme.colors.foreground
            : theme.colors.background,
          color: state.isSelected
            ? theme.colors.background
            : theme.colors.foreground,
          borderTop: state.isSelected
            ? `solid ${theme.sizes.bordersRem.hairline}rem ${theme.colors.foreground}`
            : state.isFocused
            ? `dashed ${theme.sizes.bordersRem.hairline}rem ${theme.colors.foreground}`
            : `solid ${theme.sizes.bordersRem.hairline}rem ${theme.colors.background}`,
          borderBottom: state.isSelected
            ? `solid ${theme.sizes.bordersRem.hairline}rem ${theme.colors.foreground}`
            : state.isFocused
            ? `dashed ${theme.sizes.bordersRem.hairline}rem ${theme.colors.foreground}`
            : `solid ${theme.sizes.bordersRem.hairline}rem ${theme.colors.background}`,
          ':first-of-type': {
            borderTop: 'none',
          },
          ':last-of-type': {
            borderBottom: 'none',
          },
        }),
      })}
    />
  );
}
