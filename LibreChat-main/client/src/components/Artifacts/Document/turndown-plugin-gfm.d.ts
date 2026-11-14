declare module 'turndown-plugin-gfm' {
  /** GFM plugin for turndown: tables and task list items. */
  export function gfm(
    this: import('turndown').default,
    ...args: unknown[]
  ): void;
}
