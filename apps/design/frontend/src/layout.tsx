import React from 'react';
import { Link } from 'react-router-dom';
import { Icons, Table as UiTable } from '@votingworks/ui';
import styled from 'styled-components';
import { Route } from './routes';

export const Row = styled.div`
  display: flex;
  flex-direction: row;
`;

export const Column = styled.div`
  display: flex;
  flex-direction: column;
`;

export const Form = styled.form`
  p {
    margin-bottom: 1.5rem;
  }
`;

export const Input = styled.input`
  border: 1px solid #ccc;
  background: #fff;
  padding: 0.35rem 0.5rem;
  line-height: 1.25rem;
  border-radius: 0.25rem;
  width: 100%;
  max-width: 18rem;

  &:disabled {
    background: transparent;
  }
`;

export function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block' }}>
        <div style={{ marginBottom: '0.4rem', fontWeight: 'bold' }}>
          {label}
        </div>
        {children}
      </label>
    </div>
  );
}

export const FormActionsRow = styled(Row)`
  gap: 0.5rem;

  button {
    min-width: 8rem;
  }
`;

export const Table = styled(UiTable)`
  td:last-child {
    text-align: right;
    padding-right: 0;
  }
`;

export const TableActionsRow = styled(Row)`
  margin-bottom: 1rem;
  gap: 0.5rem;
`;

export const NestedTr = styled.tr`
  td:first-child {
    padding-left: 3rem;
  }
`;

export function Breadcrumbs({ routes }: { routes: Route[] }): JSX.Element {
  return (
    <Row style={{ gap: '0.5rem' }}>
      {routes.map((route, index) => {
        if (index === routes.length - 1) {
          return route.label;
        }
        return (
          <React.Fragment key={route.path}>
            <Link to={route.path}>{route.label}</Link>
            {index < routes.length - 1 && <Icons.RightChevron />}
          </React.Fragment>
        );
      })}
    </Row>
  );
}

export const Card = styled.div`
  padding: 1rem;
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foregroundDisabled};
  border-radius: 0.2rem;
`;
