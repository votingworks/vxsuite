import { Meta } from '@storybook/react';

import { useState } from 'react';
import {
  FileInputButton as Component,
  FileInputButtonProps,
} from './file_input_button';

const meta: Meta<typeof Component> = {
  title: 'libs-ui/FileInputButton',
  component: Component,
  args: {
    children: 'Select a file',
  },
};

export default meta;

export function FileInputButton(props: FileInputButtonProps): JSX.Element {
  const [files, setFiles] = useState<File[]>([]);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    setFiles(Array.from(input.files || []));
  }

  return (
    <div>
      <Component {...props} onChange={onChange} />
      <p>
        Selected files: {files.map((file) => file.name).join(', ') || 'None'}
      </p>
    </div>
  );
}
