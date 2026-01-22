import React from 'react';

import { BackgroundTask } from '@votingworks/design-backend';
import { Card, H4, P, ProgressBar } from '@votingworks/ui';

export interface TaskProgressProps {
  style?: React.CSSProperties;
  task?: BackgroundTask;
  title: string;
}

export function TaskProgress(props: TaskProgressProps): React.ReactNode {
  const { title, task, style } = props;

  if (!task) return null;

  return (
    <Card color="primary" style={style}>
      <H4>{title}</H4>
      <P>{task.progress?.label ?? 'Starting'}</P>
      <ProgressBar
        // Recreate progress bar for each phase so that it doesn't animate backwards
        key={task.progress?.label}
        progress={
          task.progress ? task.progress.progress / task.progress.total : 0
        }
      />
    </Card>
  );
}
