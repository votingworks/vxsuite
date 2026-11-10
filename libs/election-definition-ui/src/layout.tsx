import type React from 'react';
import styled from 'styled-components';

export const Row = styled.div`
  display: flex;
  flex-direction: row;
`;

export const FieldName = styled.div`
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  margin-bottom: 0.5rem;
`;

export function InputGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label>
      <FieldName>{label}</FieldName>
      {children}
    </label>
  );
}

export const FixedViewport = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 100%;
  overflow: hidden;
`;

export const ListActionsRow = styled.div`
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
`;
