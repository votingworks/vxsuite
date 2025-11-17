import { DesktopPalette } from '@votingworks/ui';
import styled from 'styled-components';

// const TextArea = styled.textarea`
//   border-color: #eee;
//   border-width: 2px;
//   height: max-content + 0.5rem;
//   margin: 0 0 0.25rem;
//   resize: vertical;
//   :focus {
//     border-color: ${DesktopPalette.Purple60};
//     outline: none;
//   }
// `;

export const TtsTextEditor = styled.textarea`
  display: block;
  border-color: #eee;
  border-width: 2px;
  height: max-content + 0.5rem;
  line-height: 1.4;
  margin: 0 0 0.25rem;
  resize: vertical;
  width: 100%;

  :focus {
    border-color: ${DesktopPalette.Purple60};
    outline: none;
  }
`;

// export function TtsTextEditor() JSX.Element {
//   return <TextArea></TextArea>
// }
