import React from 'react';
import { Meta } from '@storybook/react';

import {
  ContestChoiceButton as Component,
  ContestChoiceButtonProps as Props,
} from './contest_choice_button';
import { Caption, P } from './typography';

const initialProps: Props = {
  onSelect: () => undefined,
  label: 'Thomas Edison',
  caption: 'Republican',
  value: 'thomas-edison',
};

const meta: Meta<typeof Component> = {
  title: 'Molecules/ContestChoiceButton',
  component: Component,
  args: initialProps,
  argTypes: {
    onChange: {},
  },
};

export default meta;

export function ContestChoiceButton(props: Props): JSX.Element {
  const [isSelected, setIsSelected] = React.useState<boolean>(false);

  return (
    <Component
      {...props}
      isSelected={isSelected}
      onSelect={() => setIsSelected(!isSelected)}
    />
  );
}

const candidates: Array<Partial<Props>> = [
  {
    value: 'scorsese',
    label: 'Martin Scorsese',
    caption: 'American',
  },
  {
    value: 'godard',
    label: 'Jean-Luc Godard',
    caption: 'French',
  },
  {
    value: 'kubrick',
    label: 'Stanley Kubrick',
    caption: 'American',
  },
  {
    value: 'kurosawa',
    label: 'Akira Kurosawa',
    caption: 'Japanese',
  },
];

export function MultipleChoices(props: Props): JSX.Element {
  const [selectedCandidateId, setSelectedCandidateId] =
    React.useState<string>('');

  const onSelect = (id: string) =>
    setSelectedCandidateId(selectedCandidateId === id ? '' : id);

  return (
    <>
      {candidates.map((c) => (
        <>
        <Component
          {...props}
          {...c}
          key={c.value}
          isSelected={c.value === selectedCandidateId}
          onSelect={onSelect}
        />
        <br />
        </>
      ))}
    </>
  );
}
