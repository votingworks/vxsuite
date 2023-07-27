import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import styled from 'styled-components';
import { Color } from '@votingworks/types';

interface RichTextAreaProps {
  htmlValue: string;
  onChange: (htmlValue: string) => void;
}

// @ts-expect-error React type version issue
// https://github.com/zenoamaro/react-quill/issues/792
const StyledReactQuill = styled(ReactQuill)`
  .ql-container {
    border-radius: 0 0 0.25rem 0.25rem;
  }
  .ql-toolbar {
    background: ${Color.LEGACY_BUTTON_BACKGROUND};
    border-radius: 0.25rem 0.25rem 0 0;
  }
  .ql-editor {
    background: #ffffff;
    font-size: 1rem;
    min-height: 10rem;
    p {
      margin-bottom: 0;
    }
  }
`;

export function RichTextArea({
  htmlValue,
  onChange,
}: RichTextAreaProps): JSX.Element {
  console.log('RichTextArea', htmlValue);
  return (
    <StyledReactQuill
      modules={{
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          [
            { list: 'ordered' },
            { list: 'bullet' },
            { indent: '-1' },
            { indent: '+1' },
          ],
          ['clean'],
        ],
      }}
      formats={[
        'bold',
        'italic',
        'underline',
        'strike',
        'list',
        'bullet',
        'indent',
      ]}
      value={htmlValue}
      onChange={onChange}
    />
  );
}
