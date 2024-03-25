import { useMemo, useRef } from 'react';

export interface Lock {
  lock: () => boolean;
  unlock: () => void;
}

/**
 * useLock returns a simple lock that can be used to prevent concurrent access
 * to a shared resource. The lock state is stored in a ref, so it doesn't
 * trigger re-renders when locked/unlocked.
 */
export function useLock(): Lock {
  const locked = useRef(false);

  const lock = useMemo(() => {
    return {
      lock: () => {
        if (locked.current) return false;
        locked.current = true;
        return true;
      },
      unlock: () => {
        locked.current = false;
      },
    };
  }, []);
  return lock;
}
