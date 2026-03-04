import { describe, it, expect } from 'vitest';
import { intermediateScript } from './intermediate_scripts';

describe('intermediateScript', () => {
  it('returns path for avahi-publish-service', () => {
    expect(intermediateScript('avahi-publish-service')).toContain(
      'intermediate-scripts/avahi-publish-service'
    );
  });

  it('returns path for avahi-browse', () => {
    expect(intermediateScript('avahi-browse')).toContain(
      'intermediate-scripts/avahi-browse'
    );
  });

  it('returns path for is-online', () => {
    expect(intermediateScript('is-online')).toContain(
      'intermediate-scripts/is-online'
    );
  });
});
