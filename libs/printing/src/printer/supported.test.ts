import { readFile } from 'node:fs/promises';
import { SUPPORTED_PRINTER_CONFIGS, getPpdPath } from './supported';

// test also confirms that the configs.json file is valid
test('referenced PPD files exist and are valid', async () => {
  for (const config of SUPPORTED_PRINTER_CONFIGS) {
    const ppdContent = await readFile(getPpdPath(config), 'utf8');
    expect(ppdContent).toContain('PPD-Adobe: "4.3"');
  }
});
