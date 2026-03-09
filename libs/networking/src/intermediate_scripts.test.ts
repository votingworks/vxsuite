import { describe, it, expect } from 'vitest';
import { intermediateScript } from './intermediate_scripts';

describe('intermediateScript', () => {
  it('returns a path ending in the script name', () => {
    expect(intermediateScript('avahi-browse')).toContain('avahi-browse');
    expect(intermediateScript('avahi-publish-service')).toContain(
      'avahi-publish-service'
    );
    expect(intermediateScript('is-online')).toContain('is-online');
  });

  it('returns a path containing intermediate-scripts directory', () => {
    expect(intermediateScript('is-online')).toContain('intermediate-scripts');
  });
});
