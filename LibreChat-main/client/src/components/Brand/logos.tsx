import { useMemo } from 'react';

/**
 * endowGPT brand assets and their CSS-crop constants — the single place
 * that knows how the supplied artwork maps to the UI.
 *
 * The three supplied SVGs share one canvas (viewBox 0 0 1500 1499.999933):
 *
 * | source file                    | wordmark | mark | belongs on |
 * |--------------------------------|----------|------|------------|
 * | `endowgpt-logo-onlight.svg`    | black    | red  | light backgrounds |
 * | `endowgpt-logo-ondark.svg`     | white    | red  | dark backgrounds  |
 * | `endowgpt-logo-mono.svg`       | gray     | gray | accents on dark   |
 *
 * The artwork occupies (measured in source user units):
 *   full lockup  x 50–1459, y 607–892   (center: x 50.3%, y 49.9%)
 *   mark only    x 50–335,  y 607–892
 *
 * The shipped SVGs keep the original square canvas: re-cropping this artwork
 * by viewBox edit triggers a Chromium viewport bug (the illustration renders as
 * a lossy top-left strip). Crops therefore happen in CSS with
 * `object-fit: cover`, which every rendering path follows faithfully.
 */

export const BRAND = {
  /** Placement of the artwork inside the square canvas. */
  lockup: {
    ratio: 1440 / 388,
    /** object-position percentages that center the artwork band. */
    position: '50.3% 49.9%',
  },
  mark: {
    ratio: 388 / 388,
    position: '33% 49.9%',
  },
  indigo: '#534cd6',
} as const;

export type LogoTheme = 'onlight' | 'ondark' | 'mono';

export const logoPaths = {
  lockup: (theme: LogoTheme) => `assets/endowgpt-logo-${theme}.svg`,
  mark: (theme: LogoTheme) => `assets/endowgpt-mark-${theme}.svg`,
  splashVideoMp4: () => 'assets/logo-reveal.mp4',
  splashVideoWebm: () => 'assets/logo-reveal.webm',
} as const;

/** CSS crop values for an <img> over a square SVG asset. */
export function logoCropStyle(kind: 'lockup' | 'mark'): React.CSSProperties {
  const spec = BRAND[kind];
  const { ratio, position } = spec;
  return {
    objectFit: 'cover',
    objectPosition: position,
    aspectRatio: `${Number(ratio.toFixed(4))}`,
  };
}

/**
 * Theme rules, mirroring Tailwind (`dark:` class strategy): files whose
 * artwork suits the opposite theme are cross-faded via paired <img> elements.
 */
export function useLogoPair(kind: 'lockup' | 'mark') {
  return useMemo(() => {
    const src = kind === 'lockup' ? logoPaths.lockup : logoPaths.mark;
    return {
      onlight: src('onlight'),
      ondark: src('ondark'),
    };
  }, [kind]);
}
