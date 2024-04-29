import styled from 'styled-components';

// System admin-facing string
export enum DiagnosticSectionTitle {
  PaperHandler = 'Printer/Scanner',
  AccessibleController = 'Accessible Controller',
}

export const DiagnosticSection = styled.section`
  margin-top: 1.25em;
`;
