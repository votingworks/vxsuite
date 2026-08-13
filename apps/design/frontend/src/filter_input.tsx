import { Button, Icons } from '@votingworks/ui';
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
      <span
        style={{
          position: 'absolute',
          left: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      >
        <Icons.Search color="neutralMuted" />
      </span>
      <input
        {...props}
        ref={filterRef}
        type="text"
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', paddingLeft: '2.25rem' }}
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
