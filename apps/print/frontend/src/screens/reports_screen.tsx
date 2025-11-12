import React from 'react';
import { TitleBar } from '../components/title_bar';

export function ReportsScreen(): JSX.Element {
  return (
    <React.Fragment>
      <TitleBar title="Reports" />
      <div
        style={{
          marginTop: '1rem',
          marginLeft: '1rem',
        }}
      >
        Super cool reports
      </div>
    </React.Fragment>
  );
}
