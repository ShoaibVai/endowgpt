import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('CodeBlock HTML preview', () => {
  it('reads the highlighted DOM text rather than stringifying React children', () => {
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

  it('does not offer a preview for non-HTML code', () => {
    render(
      <CodeBlock lang="ts" blockIndex={0} allowExecution={false} codeChildren={'const x = 1;'} />,
    );

    expect(screen.queryByRole('button', { name: 'com_ui_preview' })).not.toBeInTheDocument();
  });
});
