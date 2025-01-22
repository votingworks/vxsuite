import styled from 'styled-components';

/**
 * Overlay for ballots to make it clear they are not final.
 */
export const Watermark = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
  z-index: 999;
  white-space: nowrap;
  color: rgba(0, 0, 0, 0.1);

  /*
    NOTE: This size is based on the width of the ballot, the text styling, and
    the label actually being used. If you change any of those things, you may
    need to adjust this size.
  */
  font-size: 2.6in;

  font-weight: bold;
  user-select: none;
`;
