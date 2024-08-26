import { resolvePath } from './resolve_path';

test('resolvePath', () => {
  expect(resolvePath('/a/b/c.ts', 'd.ts')).toEqual('/a/b/d.ts');
  expect(resolvePath('/a/b/c.ts', './d.ts')).toEqual('/a/b/d.ts');
  expect(resolvePath('/a/b/c.ts', '../d.ts')).toEqual('/a/d.ts');
  expect(resolvePath('/a/b/c.ts', '/d.ts')).toEqual('/d.ts');
});
