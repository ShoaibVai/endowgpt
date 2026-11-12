/** The reading column: 700px on a laptop, 760px once there is room. */
export const READING_COLUMN_CLASS = 'md:max-w-[43.75rem] xl:max-w-[47.5rem]';

export function getMessageRowWidthClass({
  fullWidth = false,
  hasParallelContent = false,
}: {
  fullWidth?: boolean;
  hasParallelContent?: boolean;
} = {}): string {
  if (fullWidth) return 'w-full max-w-full sm:px-2';
  if (hasParallelContent) return 'w-full sm:px-2 md:max-w-[58rem] xl:max-w-[70rem]';
  return `w-full sm:px-2 ${READING_COLUMN_CLASS}`;
}
