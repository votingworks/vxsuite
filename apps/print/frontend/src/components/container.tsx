import styled from 'styled-components';

export const Container = styled.div`
  /* Adjusted for Toolbar height */
  height: calc(100vh - 2.2rem);
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  padding-bottom: 0;
`;
