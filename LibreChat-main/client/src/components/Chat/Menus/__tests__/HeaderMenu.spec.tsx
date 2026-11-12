import { render, screen } from '@testing-library/react';
import type { MenuItemProps } from '~/common';

const mockHookState = {
  exportShare: {
    show: true,
    items: [{ label: 'share' }, { label: 'export' }] as MenuItemProps[],
    hasSharedLink: false,
    dialogs: <div data-testid="export-dialogs" />,
  },
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/Sharing/useChatOptions', () => ({
  __esModule: true,
  default: () => mockHookState.exportShare,
}));

/** The real MenuButton needs the MenuProvider that DropdownPopup supplies, which is mocked out below. */
jest.mock('@ariakit/react', () => ({
  MenuButton: ({
    children,
    render: _render,
    ...props
  }: React.ComponentProps<'button'> & { render?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

/**
 * Mirrors DropdownPopup's real contract: `separate` entries render as a divider
 * *instead of* an item, and `show: false` entries are dropped.
 */
jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  TooltipAnchor: ({ render: node }: { render: React.ReactNode }) => node,
  DropdownPopup: ({ trigger, items }: { trigger: React.ReactNode; items: MenuItemProps[] }) => (
    <div>
      {trigger}
      <ul data-testid="menu-items">
        {items
          .filter((item) => item.show !== false)
          .map((item, index) =>
            item.separate === true ? (
              <li key={index} data-kind="separator" />
            ) : (
              <li key={index} data-kind="item" data-sub={item.subItems != null}>
                {item.label}
              </li>
            ),
          )}
      </ul>
    </div>
  ),
}));

import HeaderMenu from '../HeaderMenu';

const labels = () =>
  Array.from(screen.getByTestId('menu-items').children)
    .filter((node) => node.getAttribute('data-kind') === 'item')
    .map((node) => node.textContent);

describe('HeaderMenu', () => {
  beforeEach(() => {
    mockHookState.exportShare.show = true;
    mockHookState.exportShare.hasSharedLink = false;
  });

  it('keeps share and export behind the single overflow trigger', () => {
    render(<HeaderMenu />);

    expect(screen.getByTestId('header-overflow-menu')).toBeInTheDocument();
    expect(labels()).toEqual(['share', 'export']);
    expect(screen.getByTestId('export-dialogs')).toBeInTheDocument();
  });

  it('renders nothing when sharing and export are unavailable', () => {
    mockHookState.exportShare.show = false;

    render(<HeaderMenu />);

    expect(screen.queryByTestId('header-overflow-menu')).not.toBeInTheDocument();
  });

  it('keeps surfacing an active shared link on the collapsed trigger', () => {
    mockHookState.exportShare.hasSharedLink = true;

    render(<HeaderMenu />);

    expect(screen.getByTestId('header-menu-shared-link-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('header-overflow-menu')).toHaveAttribute(
      'aria-label',
      'com_ui_chat_options_link_active',
    );
  });
});
