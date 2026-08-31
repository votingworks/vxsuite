import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Any kind of validation issue with links in markdown files.
 */
export type ValidationIssue = BrokenLink;

/**
 * All the kinds of validation issues for links in markdown files.
 */
export enum ValidationIssueKind {
  BrokenLink = 'BrokenLink',
}

/**
 * A relative link in a markdown file points at a path that does not exist.
 */
export interface BrokenLink {
  kind: ValidationIssueKind.BrokenLink;
  markdownPath: string;
  line: number;
  link: string;
}

/**
 * Directories that never hold checked-in markdown: dependencies, build output,
 * and git internals.
 */
const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
]);

/**
 * Inline links, i.e. `](target)` or `](target "title")`. Matching only the
 * destination means image links (`![alt](target)`) are covered too.
 */
const INLINE_LINK_PATTERN = /\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

/**
 * Reference-style link definitions, i.e. a line of the form `[id]: target`.
 */
const REFERENCE_DEFINITION_PATTERN = /^\[[^\]]+\]:\s*(\S+)/;

/**
 * A fenced code block delimiter, i.e. ``` or ~~~ with optional indentation and
 * an info string.
 */
const CODE_FENCE_PATTERN = /^\s{0,3}(```|~~~)/;

/**
 * Finds markdown files, skipping dependency and build directories.
 *
 * Symlinks are skipped: a symlinked markdown file's relative links resolve
 * against the real file's directory rather than the link's, so checking it
 * where the symlink sits reports breakage that does not exist.
 * `.github/copilot-instructions.md` -> `../CLAUDE.md` is the case in point. The
 * real file is checked at its own path anyway.
 */
function* findMarkdownFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        yield* findMarkdownFiles(entryPath);
      }
    } else if (entry.name.endsWith('.md')) {
      yield entryPath;
    }
  }
}

/**
 * Extracts every link destination on a single line of markdown.
 */
function* findLinkTargets(line: string): Generator<string> {
  const definition = REFERENCE_DEFINITION_PATTERN.exec(line);
  if (definition) {
    yield definition[1] as string;
    return;
  }

  for (const match of line.matchAll(INLINE_LINK_PATTERN)) {
    yield match[1] as string;
  }
}

/**
 * Resolves a link destination to a path on disk, or `undefined` if the
 * destination is not a path this check can verify: a URL (`https:`, `mailto:`,
 * …) or a fragment pointing within the same document.
 */
function resolveLinkTarget(
  root: string,
  markdownPath: string,
  target: string
): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) {
    return undefined;
  }

  const path = target.replace(/#.*$/, '');
  if (!path) {
    return undefined;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Not valid percent-encoding, so take the destination literally.
    decoded = path;
  }

  // A leading slash is repo-root-relative, the way GitHub renders it.
  return decoded.startsWith('/')
    ? join(root, decoded)
    : resolve(dirname(markdownPath), decoded);
}

/**
 * Validates that relative links in markdown files point at paths that exist.
 */
export function* checkLinks(root: string): Generator<ValidationIssue> {
  for (const markdownPath of findMarkdownFiles(root)) {
    const lines = readFileSync(markdownPath, 'utf-8').split('\n');
    let inCodeFence = false;

    for (const [index, line] of lines.entries()) {
      if (CODE_FENCE_PATTERN.test(line)) {
        inCodeFence = !inCodeFence;
        continue;
      }

      // Link-shaped text in an example is not a link.
      if (inCodeFence) {
        continue;
      }

      for (const target of findLinkTargets(line)) {
        const resolved = resolveLinkTarget(root, markdownPath, target);

        if (resolved && !existsSync(resolved)) {
          yield {
            kind: ValidationIssueKind.BrokenLink,
            markdownPath,
            line: index + 1,
            link: target,
          };
        }
      }
    }
  }
}
