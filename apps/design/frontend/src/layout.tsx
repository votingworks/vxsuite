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

export const ScreenHeader = styled.div`
  padding: 1rem 1.5rem;
  background: ${(p) => p.theme.colors.container};
  position: sticky;
  top: 0;
  width: 100%;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  z-index: 1;

  h1 {
    margin: 0 !important;
  }
`;

export const ScreenContent = styled.div`
  overflow: auto;
  padding: 1rem 1.5rem;
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  input[type='text'] {
    min-width: 18rem;
  }

  .search-select {
    min-width: 18rem;
  }
`;

export const Input = styled.input``;

export function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
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
    <Row style={{ gap: '0.5rem', marginBottom: '0.75rem' }}>
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
