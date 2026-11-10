import type { CSSProperties } from 'react';

/** Typography-free brand constants — the single place that knows how the
 * supplied artwork maps to the UI.
 *
 * The three supplied SVGs share one square canvas (viewBox `0 0 1500 1500`):
 *
 * | served file                  | wordmark | mark | belongs on         |
 * |------------------------------|----------|------|--------------------|
 * | `endowgpt-logo-onlight.svg`  | black    | red  | light backgrounds  |
 * | `endowgpt-logo-ondark.svg`   | white    | red  | dark backgrounds   |
 * | `endowgpt-logo-mono.svg`     | gray     | gray | accents on dark    |
 *
 * The artwork occupies (in source user units, measured from a full raster):
 *   lockup  x 50–1459, y 607–892  → band height 286/1500 = 19.1%, center (50.3%, 49.97%)
 *   mark    x 50–335,  y 607–892  → shipped pre-cropped as `endowgpt-mark.png`
 *
 * Served SVGs keep the original square canvas: viewBox-cropped variants of this
 * artwork hit a Chromium viewport bug (lossy top-left strip), so lockup crops
 * happen in CSS via `object-fit: cover` on an aspect-ratio'd frame, which every
 * rendering path follows faithfully. Marks are PNGs and need no cropping.
 */

export type LogoTheme = 'onlight' | 'ondark' | 'mono';

export const logoPaths = {
  lockup: (theme: LogoTheme) => `assets/endowgpt-logo-${theme}.svg`,
  mark: 'assets/endowgpt-mark.png',
  mark2x: 'assets/endowgpt-mark@2x.png',
  markMono: 'assets/endowgpt-mark-mono.png',
  splashVideoMp4: 'assets/logo-reveal.mp4',
  splashVideoWebm: 'assets/logo-reveal.webm',
} as const;

/** CSS crop values for an <img> of the square SVG asset. */
export const logoCropStyle: CSSProperties = {
  objectFit: 'cover',
  objectPosition: '50.3% 49.97%',
  aspectRatio: (1410 / 286).toFixed(4).replace(/0+$/, ''),
};

/** CSS crop helper for the square canvas where safe (marks, covers). */
export const logoCropClasses = 'object-cover';
