import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CodeBlock from '../CodeBlock';

jest.mock('~/Providers', () => ({
  useToolCallsMapContext: () => ({}),
  useMessageContext: () => ({ messageId: 'message-1', partIndex: 0 }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Messages/Content/Parts', () => ({
  LogContent: () => null,
}));

jest.mock('../FloatingCodeBar', () => ({
  __esModule: true,
  default: () => null,
}));

beforeAll(() => {
  class MockIntersectionObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  }
  Object.defineProperty(global, 'IntersectionObserver', {
    configurable: true,
    value: MockIntersectionObserver,
  });
});

const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head><title>Game</title></head>
<body>
<h1>Hello</h1>
<script>var best = localStorage.getItem('best') || 0;</script>
</body>
</html>`;

describe('CodeBlock HTML preview', () => {
  it('concatenates highlighted React children back into source text', () => {
    render(
      <CodeBlock
        lang="html"
        blockIndex={0}
        allowExecution={false}
        codeChildren={
          <>
            <span className="hljs-tag">{'<h1>'}</span>
            {'Hello'}
            <span className="hljs-tag">{'</h1>'}</span>
          </>
        }
      />,
    );

    expect(screen.queryByTestId('html-code-preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_preview' }));

    const preview = screen.getByTestId('html-code-preview');
    expect(preview.tagName).toBe('IFRAME');
    expect(preview).toHaveAttribute('srcdoc', '<h1>Hello</h1>');
    expect(preview).toHaveAttribute('sandbox', 'allow-scripts');

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_code' }));
    expect(screen.queryByTestId('html-code-preview')).not.toBeInTheDocument();
  });

  it('opens a complete HTML document as a preview by default', () => {
    render(
      <CodeBlock lang="html" blockIndex={0} allowExecution={false} codeChildren={completeHtml} />,
    );

    const preview = screen.getByTestId('html-code-preview');
    const srcdoc = preview.getAttribute('srcdoc') ?? '';
    expect(srcdoc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(srcdoc).toContain("Object.defineProperty(window,'localStorage'");
    expect(srcdoc.indexOf('Object.defineProperty')).toBeLessThan(
      srcdoc.indexOf('var best = localStorage'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_code' }));
    expect(screen.queryByTestId('html-code-preview')).not.toBeInTheDocument();
  });

  it('refreshes the snapshot when the source changes', async () => {
    const { rerender } = render(
      <CodeBlock lang="html" blockIndex={0} allowExecution={false} codeChildren={completeHtml} />,
    );

    expect(screen.getByTestId('html-code-preview').getAttribute('srcdoc')).toContain('Hello');

    rerender(
      <CodeBlock
        lang="html"
        blockIndex={0}
        allowExecution={false}
        codeChildren={completeHtml.replace('Hello', 'Goodbye')}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('html-code-preview').getAttribute('srcdoc')).toContain('Goodbye'),
    );
  });

  it('accepts upper-case and alias HTML languages', () => {
    const { rerender } = render(
      <CodeBlock lang="HTML" blockIndex={0} allowExecution={false} codeChildren={'<h1>Hi</h1>'} />,
    );

    expect(screen.getByRole('button', { name: 'com_ui_preview' })).toBeInTheDocument();

    rerender(
      <CodeBlock lang="xhtml" blockIndex={0} allowExecution={false} codeChildren={'<h1>Hi</h1>'} />,
    );

    expect(screen.getByRole('button', { name: 'com_ui_preview' })).toBeInTheDocument();
  });

  it('does not offer a preview for non-HTML code', () => {
    render(
      <CodeBlock lang="ts" blockIndex={0} allowExecution={false} codeChildren={'const x = 1;'} />,
    );

    expect(screen.queryByRole('button', { name: 'com_ui_preview' })).not.toBeInTheDocument();
  });
});
