import { getMessageRowWidthClass } from '../width';

it('uses the standard reading column by default', () => {
  expect(getMessageRowWidthClass()).toBe(
    'w-full sm:px-2 md:max-w-[43.75rem] xl:max-w-[47.5rem]',
  );
});

it('widens parallel content', () => {
  expect(getMessageRowWidthClass({ hasParallelContent: true })).toBe(
    'w-full sm:px-2 md:max-w-[58rem] xl:max-w-[70rem]',
  );
});

it.each([false, true])('prioritizes full width over parallel content: %s', (hasParallelContent) => {
  expect(getMessageRowWidthClass({ fullWidth: true, hasParallelContent })).toBe(
    'w-full max-w-full sm:px-2',
  );
});
