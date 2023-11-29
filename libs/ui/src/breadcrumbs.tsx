import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

const Container = styled.div`
  margin-bottom: 0.5rem;
`;

export interface Route {
  title: string;
  path: string;
}

export interface BreadcrumbsProps {
  currentTitle: string;
  parentRoutes: Route[];
  className?: string;
}

function joinElements(elements: JSX.Element[], separator: React.ReactNode) {
  return elements.reduce((acc, element, index) => {
    if (index === 0) {
      return [element];
    }

    return [...acc, separator, element];
  }, [] as React.ReactNode[]);
}

export function Breadcrumbs({
  currentTitle,
  parentRoutes,
  className,
}: BreadcrumbsProps): JSX.Element {
  const parentLinks = parentRoutes.map((route) => (
    <Link key={route.path} to={route.path}>
      {route.title}
    </Link>
  ));
  return (
    <Container className={className}>
      {joinElements(
        [...parentLinks, <span key={currentTitle}>{currentTitle}</span>],
        ' / '
      )}
    </Container>
  );
}
