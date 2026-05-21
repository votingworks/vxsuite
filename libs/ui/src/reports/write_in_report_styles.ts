import styled from 'styled-components';

export const ContestSection = styled.div`
  margin-top: 1.5em;
  page-break-inside: avoid;
`;

export const ContestHeading = styled.h2`
  margin-top: 0;
  margin-bottom: 0.5em;
  font-size: 1.1em;
`;

export const WriteInGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 0.3em;
`;

export const WriteInImage = styled.img`
  max-width: 100%;
  border: 1px solid #ccc;
  display: block;
`;

export const WriteInTextBox = styled.div`
  border: 1px solid #ccc;
  padding: 0.4em 0.6em;
  background-color: #f5f5f5;
`;
