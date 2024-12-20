import { Meta } from '@storybook/react';
import { ColorPalette } from '@votingworks/types';
import { groupBy } from '@votingworks/basics';
import { DesktopPalette, TouchscreenPalette } from './make_theme';

const palettes = {
  desktop: DesktopPalette,
  touchscreen: TouchscreenPalette,
} satisfies Record<string, ColorPalette>;

type PaletteLabel = keyof typeof palettes;

interface Props {
  palette: PaletteLabel;
}

export function ColorPalettes({ palette: paletteLabel }: Props): JSX.Element {
  const palette: ColorPalette = palettes[paletteLabel];

  const parsedColors = Object.entries(palette).map(([name, color]) => {
    const [, hue, value] = name.match(/([a-zA-Z]+)(\d+)/) ?? [];
    return { name, color, hue, value };
  });
  const colorsByHue = groupBy(parsedColors, (c) => c.hue);

  return (
    <div
      style={{
        background: '#ffffff',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        minHeight: '100vh',
        fontSize: '16px',
      }}
    >
      {colorsByHue.map(([hue, variants]) => (
        <div key={hue}>
          <h3 style={{ marginTop: 0, marginBottom: '10px' }}>{hue}</h3>
          <div style={{ display: 'flex', gap: '5px' }}>
            {variants.map(({ value, color }) => (
              <div
                key={value}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  width: 'min-content',
                }}
              >
                <div
                  style={{
                    height: '60px',
                    width: '60px',
                    borderRadius: '10%',
                    backgroundColor: color,
                  }}
                />
                <h4 style={{ margin: 0 }}>{value}</h4>
                <div style={{ fontSize: '0.7em', userSelect: 'text' }}>
                  {color}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const meta: Meta<typeof ColorPalettes> = {
  title: 'Color Palettes',
  args: { palette: 'desktop' },
  argTypes: {
    palette: {
      options: Object.keys(palettes),
      control: { type: 'radio' },
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
