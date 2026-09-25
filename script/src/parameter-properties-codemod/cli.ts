import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import MagicString from 'magic-string';
import {
  parseSync,
  Visitor,
  type Class,
  type Comment,
  type Expression,
  type MethodDefinition,
  type Span,
} from 'oxc-parser';
import type { IO } from '../types.ts';

/** oxc's published types omit the TS-only fields present on TS bindings. */
interface TsBindingIdentifier extends Span {
  readonly type: 'Identifier';
  readonly name: string;
  readonly optional?: boolean;
  readonly typeAnnotation?: Span | null;
}

interface Edit {
  readonly converted: number;
  readonly problems: string[];
  readonly output?: string;
}

const FUNCTION_TYPES = new Set([
  'FunctionExpression',
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'ClassExpression',
]);

function isNode(value: unknown): value is { type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/** Whether evaluating `node` reads `this` outside of any nested function. */
function usesThisEagerly(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(usesThisEagerly);
  if (typeof node !== 'object' || node === null) return false;
  if (isNode(node)) {
    if (FUNCTION_TYPES.has(node.type)) return false;
    if (node.type === 'ThisExpression' || node.type === 'Super') return true;
  }
  return Object.entries(node).some(
    ([key, value]) => key !== 'parent' && usesThisEagerly(value)
  );
}

function lineIndent(src: string, pos: number): string {
  const lineStart = src.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(src.slice(lineStart))?.[0] ?? '';
}

function inferType(expr: Expression): string | undefined {
  switch (expr.type) {
    case 'Literal':
      switch (typeof expr.value) {
        case 'string':
          return 'string';
        case 'number':
          return 'number';
        case 'boolean':
          return 'boolean';
        default:
          return undefined;
      }
    case 'TemplateLiteral':
      return 'string';
    case 'UnaryExpression':
      return expr.operator === '-' &&
        expr.argument.type === 'Literal' &&
        typeof expr.argument.value === 'number'
        ? 'number'
        : undefined;
    default:
      return undefined;
  }
}

/** Start of the comments immediately preceding `pos`, or `pos` if none. */
function leadingCommentsStart(
  src: string,
  comments: readonly Comment[],
  pos: number,
  floor: number
): number {
  let start = pos;
  for (const comment of [...comments].reverse()) {
    if (comment.end > start) continue;
    if (comment.start < floor) break;
    if (!/^\s*$/.test(src.slice(comment.end, start))) break;
    start = comment.start;
  }
  return start;
}

function isConstructor(
  member: Class['body']['body'][number]
): member is MethodDefinition {
  return member.type === 'MethodDefinition' && member.kind === 'constructor';
}

function rewriteFile(file: string, src: string): Edit {
  const problems: string[] = [];
  const result = parseSync(file, src, {
    lang: file.endsWith('x') ? 'tsx' : 'ts',
    preserveParens: true,
  });
  if (result.errors.length > 0) {
    return {
      converted: 0,
      problems: [
        `${file}: parse errors: ${result.errors.map((e) => e.message).join('; ')}`,
      ],
    };
  }

  const { comments } = result;
  const ms = new MagicString(src);
  let converted = 0;

  function report(node: Span, message: string): void {
    const line = src.slice(0, node.start).split('\n').length;
    problems.push(`${file}:${line}: ${message}`);
  }

  function rewriteClass(classNode: Class): void {
    const classBody = classNode.body;
    const ctor = classBody.body.find(
      (member): member is MethodDefinition =>
        isConstructor(member) && member.value.body !== null
    );
    const ctorBody = ctor?.value.body;
    if (!ctor || !ctorBody) return;
    const { params } = ctor.value;
    if (!params.some((p) => p.type === 'TSParameterProperty')) return;

    const hazard = classBody.body.find(
      (member) =>
        member.type === 'PropertyDefinition' &&
        !member.static &&
        member.value &&
        usesThisEagerly(member.value)
    );
    if (hazard) {
      report(
        hazard,
        'field initializer uses `this`; parameter property assignment order would change'
      );
      return;
    }

    const superCall = ctorBody.body.find(
      (s) =>
        s.type === 'ExpressionStatement' &&
        s.expression.type === 'CallExpression' &&
        s.expression.callee.type === 'Super'
    );
    let assignPos: number;
    let assignIndent: string;
    if (superCall) {
      assignPos = superCall.end;
      assignIndent = lineIndent(src, superCall.start);
    } else if (classNode.superClass) {
      report(ctor, 'derived class without top-level super() call');
      return;
    } else {
      const [firstStatement] = ctorBody.body;
      assignPos = ctorBody.start + 1;
      assignIndent = firstStatement
        ? lineIndent(src, firstStatement.start)
        : `${lineIndent(src, ctor.start)}  `;
    }

    const fields: Array<{ leading: string; field: string }> = [];
    const assigns: string[] = [];
    let prevEnd = src.indexOf('(', ctor.value.start) + 1;
    for (const p of params) {
      const paramStart = prevEnd;
      prevEnd = p.end;
      if (p.type !== 'TSParameterProperty') continue;

      if (p.decorators.length > 0) {
        report(p, 'decorated parameter property');
        return;
      }
      const param = p.parameter;
      const binding = param.type === 'AssignmentPattern' ? param.left : param;
      if (binding.type !== 'Identifier') {
        report(p, `unsupported parameter ${binding.type}`);
        return;
      }
      const id = binding as TsBindingIdentifier;

      let typeText: string;
      const inferred =
        param.type === 'AssignmentPattern' ? inferType(param.right) : undefined;
      if (id.typeAnnotation) {
        typeText = src.slice(id.typeAnnotation.start, id.typeAnnotation.end);
      } else if (inferred) {
        typeText = `: ${inferred}`;
      } else {
        report(p, `cannot determine type of \`${id.name}\``);
        return;
      }

      const commentStart = leadingCommentsStart(
        src,
        comments,
        p.start,
        paramStart
      );
      const leading =
        commentStart < p.start ? src.slice(commentStart, p.start).trim() : '';

      const modifiers = [
        p.accessibility && p.accessibility !== 'public' ? p.accessibility : '',
        p.override ? 'override' : '',
        p.readonly ? 'readonly' : '',
      ].filter(Boolean);
      fields.push({
        leading,
        field: `${modifiers.map((m) => `${m} `).join('')}${id.name}${
          id.optional ? '?' : ''
        }${typeText};`,
      });
      assigns.push(`this.${id.name} = ${id.name};`);

      if (leading) ms.remove(commentStart, p.start);
      ms.overwrite(p.start, p.end, src.slice(param.start, param.end));
    }

    const firstCtor = classBody.body.find(isConstructor) ?? ctor;
    const ctorStart = leadingCommentsStart(
      src,
      comments,
      firstCtor.start,
      classBody.start + 1
    );
    const ctorIndent = lineIndent(src, ctorStart);
    const fieldText = fields
      .map(({ leading, field }) =>
        leading ? `${leading}\n${ctorIndent}${field}` : field
      )
      .join(`\n${ctorIndent}`);
    ms.appendLeft(ctorStart, `${fieldText}\n\n${ctorIndent}`);
    ms.appendLeft(
      assignPos,
      `\n${assigns.map((a) => `${assignIndent}${a}`).join('\n')}${
        superCall ? '' : '\n'
      }`
    );
    converted += fields.length;
  }

  new Visitor({
    ClassDeclaration: rewriteClass,
    ClassExpression: rewriteClass,
  }).visit(result.program);

  return {
    converted,
    problems,
    output: converted > 0 ? ms.toString() : undefined,
  };
}

/**
 * Rewrites TS parameter properties into field declarations assigned in the
 * constructor. Rewrites all tracked TS files if none are given.
 */
export function main(argv: readonly string[], { stdout, stderr }: IO): number {
  const dryRun = argv.includes('--dry-run');
  const fileArgs = argv.filter((arg) => arg !== '--dry-run');
  const files =
    fileArgs.length > 0
      ? fileArgs
      : execFileSync(
          'git',
          ['ls-files', '*.ts', '*.tsx', '*.mts', '*.cts', ':!*.d.ts'],
          { encoding: 'utf8' }
        )
          .split('\n')
          .filter(Boolean);

  const changed: string[] = [];
  let converted = 0;
  let hasProblems = false;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('constructor')) continue;
    const edit = rewriteFile(file, src);
    for (const problem of edit.problems) {
      stderr.write(`skipped ${problem}\n`);
      hasProblems = true;
    }
    if (edit.output !== undefined) {
      converted += edit.converted;
      changed.push(file);
      if (!dryRun) writeFileSync(file, edit.output);
    }
  }

  if (!dryRun && changed.length > 0) {
    execFileSync('pnpm', ['exec', 'prettier', '--write', ...changed], {
      stdio: 'ignore',
    });
  }

  stdout.write(
    `${dryRun ? 'Would convert' : 'Converted'} ${converted} parameter properties in ${changed.length} files\n`
  );
  return hasProblems ? 1 : 0;
}
