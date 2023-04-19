/** Option ID type for the RadioGroup component. */
export type RadioGroupOptionId = string | number;

/** Data schema for a single option in the RadioGroup component. */
export interface RadioGroupOption<T extends RadioGroupOptionId> {
  ariaLabel?: string;
  disabled?: boolean;
  id: T;
  label: React.ReactNode;
}

/** Common props for subcomponents of a single RadioGroup option. */
export type OptionProps<T extends RadioGroupOptionId> = RadioGroupOption<T> & {
  groupLabel: string;
  onSelect: (id: T) => void;
  selected: boolean;
};
