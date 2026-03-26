import { describe, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeParseInt } from '@votingworks/types';
import { normalizePdf } from './normalize_pdf';

function toBytes(str: string): Uint8Array {
  return Uint8Array.from(Buffer.from(str, 'latin1'));
}

function fromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

// Minimal valid PDF structure for testing
function makePdf({
  objects,
  names,
}: {
  objects: Array<{ num: number; content: string }>;
  names?: string;
}): string {
  const lines: string[] = ['%PDF-1.4'];
  const offsets = new Map<number, number>();

  for (const { num, content } of objects) {
    offsets.set(num, lines.join('\n').length + 1); // +1 for the newline
    lines.push(`${num} 0 obj`);
    lines.push(content);
    lines.push('endobj');
  }

  const xrefStart = lines.join('\n').length + 1;
  lines.push('xref');
  lines.push(`0 ${objects.length + 1}`);
  lines.push('0000000000 65535 f ');
  for (const { num } of objects) {
    const offset = offsets.get(num) ?? 0;
    lines.push(`${String(offset).padStart(10, '0')} 00000 n `);
  }

  const namesEntry = names ? `\n/Names [${names}]` : '';
  lines.push('trailer');
  lines.push(`<< /Size ${objects.length + 1} /Root 1 0 R${namesEntry} >>`);
  lines.push('startxref');
  lines.push(String(xrefStart));
  lines.push('%%EOF');

  return lines.join('\n');
}

function extractContentStreams(data: Uint8Array): string[] {
  const str = Buffer.from(data).toString('latin1');
  const streams: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match = streamRegex.exec(str);
  while (match) {
    streams.push(match[1]);
    match = streamRegex.exec(str);
  }
  return streams;
}

describe('normalizePdf', () => {
  test('zeroes Chromium timestamps', () => {
    const pdf = makePdf({
      objects: [
        {
          num: 1,
          content:
            "<< /CreationDate (D:20260325120000-07'00') /ModDate (D:20260325130000+00'00') >>",
        },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain("/CreationDate (D:00000000000000+00'00')");
    expect(result).toContain("/ModDate (D:00000000000000+00'00')");
    expect(result).not.toMatch(/20260325/);
  });

  test('zeroes ghostscript timestamps (no space before paren)', () => {
    const pdf = makePdf({
      objects: [
        {
          num: 1,
          content:
            "<< /CreationDate(D:20260325120000-07'00') /ModDate(D:20260325130000Z) >>",
        },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain("/CreationDate(D:00000000000000+00'00')");
    expect(result).toContain("/ModDate(D:00000000000000+00'00')");
  });

  test('re-sequences Chromium node IDs by occurrence', () => {
    const pdf = makePdf({
      objects: [
        {
          num: 1,
          content: 'node00000042 ref node00000099 ref node00000042 again',
        },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain(
      'node00000001 ref node00000002 ref node00000003 again'
    );
  });

  test('strips /Names arrays', () => {
    const pdf = makePdf({
      objects: [{ num: 1, content: '<< /Type /Catalog >>' }],
      names: '(node00000001) 28 0 R (node00000002) 172 0 R',
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain('/Names []');
    expect(result).not.toMatch(/node00000/);
  });

  test('zeroes ghostscript XMP timestamps', () => {
    const pdf = makePdf({
      objects: [
        {
          num: 1,
          content:
            '<xmp:ModifyDate>2026-03-25T13:53:32-07:00</xmp:ModifyDate>' +
            '<xmp:CreateDate>2026-03-25T13:53:32-07:00</xmp:CreateDate>',
        },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain(
      '<xmp:ModifyDate>0000-00-00T00:00:00+00:00</xmp:ModifyDate>'
    );
    expect(result).toContain(
      '<xmp:CreateDate>0000-00-00T00:00:00+00:00</xmp:CreateDate>'
    );
  });

  test('zeroes ghostscript DocumentID UUID', () => {
    const pdf = makePdf({
      objects: [
        {
          num: 1,
          content:
            "xapMM:DocumentID='uuid:3bc87150-60a9-11fc-0000-d3af8b37c9d0'",
        },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain(
      "xapMM:DocumentID='uuid:00000000-0000-0000-0000-000000000000'"
    );
  });

  test('zeroes ghostscript /ID arrays (uppercase hex)', () => {
    const pdf = makePdf({
      objects: [
        {
          num: 1,
          content:
            '/ID [<AE62F4165DB0622FD2E57DED09838D47><AE62F4165DB0622FD2E57DED09838D47>]',
        },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain(
      '/ID [<00000000000000000000000000000000><00000000000000000000000000000000>]'
    );
  });

  test('zeroes ghostscript /ID arrays (lowercase hex)', () => {
    const pdf = makePdf({
      objects: [
        {
          num: 1,
          content:
            '/ID [<ae62f4165db0622fd2e57ded09838d47><ae62f4165db0622fd2e57ded09838d47>]',
        },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain(
      '/ID [<00000000000000000000000000000000><00000000000000000000000000000000>]'
    );
  });

  test('renumbers objects sequentially', () => {
    const pdf = makePdf({
      objects: [
        { num: 42, content: '<< /Type /Catalog /Pages 99 0 R >>' },
        { num: 99, content: '<< /Type /Pages >>' },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain('1 0 obj');
    expect(result).toContain('/Pages 2 0 R');
    expect(result).toContain('2 0 obj');
    expect(result).not.toMatch(/42 0 obj/);
    expect(result).not.toMatch(/99 0 obj/);
  });

  test('rebuilds xref table with correct offsets', () => {
    const pdf = makePdf({
      objects: [
        { num: 10, content: '<< /Type /Catalog >>' },
        { num: 20, content: '<< /Type /Pages >>' },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));

    const xrefMatch = result.match(/xref\n0 (\d+)\n([\s\S]*?)trailer/);
    expect(xrefMatch).toBeTruthy();

    const entries = xrefMatch![2].trim().split('\n');
    expect(entries[0]).toMatch(/^0000000000 65535 f/);

    for (let i = 1; i < entries.length; i += 1) {
      const offset = safeParseInt(entries[i].slice(0, 10)).unsafeUnwrap();
      expect(result.slice(offset)).toMatch(new RegExp(`^${i} 0 obj`));
    }
  });

  test('updates /Size in trailer', () => {
    const pdf = makePdf({
      objects: [
        { num: 5, content: '<< /Type /Catalog >>' },
        { num: 10, content: '<< /Type /Pages >>' },
        { num: 15, content: '<< /Length 0 >>' },
      ],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));
    expect(result).toContain('/Size 4'); // 3 objects + 1 free entry
  });

  test('updates startxref pointer', () => {
    const pdf = makePdf({
      objects: [{ num: 1, content: '<< /Type /Catalog >>' }],
    });
    const result = fromBytes(normalizePdf(toBytes(pdf)));

    const startxrefMatch = result.match(/startxref\n(\d+)/);
    expect(startxrefMatch).toBeTruthy();
    const xrefOffset = safeParseInt(startxrefMatch![1]).unsafeUnwrap();
    expect(result.slice(xrefOffset)).toMatch(/^xref\n/);
  });

  test('produces identical output from differently-numbered inputs', () => {
    const pdf1 = makePdf({
      objects: [
        { num: 1, content: '<< /Type /Catalog /Pages 2 0 R >>' },
        { num: 2, content: '<< /Type /Pages >>' },
      ],
    });
    const pdf2 = makePdf({
      objects: [
        { num: 172, content: '<< /Type /Catalog /Pages 28 0 R >>' },
        { num: 28, content: '<< /Type /Pages >>' },
      ],
    });
    const result1 = fromBytes(normalizePdf(toBytes(pdf1)));
    const result2 = fromBytes(normalizePdf(toBytes(pdf2)));
    expect(result1).toEqual(result2);
  });

  test('does not modify PDF content streams', () => {
    const fixturePath = path.join(
      __dirname,
      '../fixtures/calibration-sheet/calibration-sheet-letter.pdf'
    );
    const pdf = Uint8Array.from(fs.readFileSync(fixturePath));
    const normalized = normalizePdf(pdf);

    const originalStreams = extractContentStreams(pdf);
    const normalizedStreams = extractContentStreams(normalized);
    expect(originalStreams.length).toBeGreaterThan(0);
    expect(normalizedStreams).toEqual(originalStreams);
  });

  test('is idempotent', () => {
    const pdf = makePdf({
      objects: [
        {
          num: 42,
          content:
            "<< /CreationDate (D:20260325120000-07'00') >> node00000042 " +
            '/ID [<AE62F4165DB0622FD2E57DED09838D47><AE62F4165DB0622FD2E57DED09838D47>]',
        },
      ],
      names: '(node00000042) 28 0 R',
    });
    const once = normalizePdf(toBytes(pdf));
    const twice = normalizePdf(once);
    expect(fromBytes(once)).toEqual(fromBytes(twice));
  });
});
