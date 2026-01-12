import { Button } from '@votingworks/ui';
import React from 'react';

export interface FilterInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange: (value: string) => void;
}

export function FilterInput({
  onChange,
  ...props
}: FilterInputProps): JSX.Element {
  const filterRef = React.useRef<HTMLInputElement>(null);
  return (
    <div style={{ ...(props.style ?? {}), position: 'relative' }}>
      <input
        {...props}
        ref={filterRef}
        type="text"
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%' }}
      />
      <Button
        style={{
          position: 'absolute',
          right: '0.125rem',
          top: '0.125rem',
          padding: '0.5rem',
        }}
        fill="transparent"
        icon="X"
        aria-label="Clear"
        onPress={() => {
          onChange('');
          filterRef.current?.focus();
        }}
      />
    </div>
  );
}
