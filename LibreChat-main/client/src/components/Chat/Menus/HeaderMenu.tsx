import { useState, useId } from 'react';
import { Ellipsis } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import { DropdownPopup, TooltipAnchor, Button } from '@librechat/client';
import type { TStartupConfig } from 'librechat-data-provider';
import type * as t from '~/common';
import useChatOptions from '~/hooks/Sharing/useChatOptions';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Mobile overflow menu. With the developer controls gone, the only actions left
 * are the ones that leave the conversation: share and export.
 */
export default function HeaderMenu({
  startupConfig,
  className,
  readOnly = false,
}: {
  startupConfig?: TStartupConfig;
  /** A read-only subagent thread offers share and export but no edits to the chat. */
  readOnly?: boolean;
  className?: string;
}) {
  const localize = useLocalize();
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const exportShare = useChatOptions({
    isSharedButtonEnabled: startupConfig?.sharedLinksEnabled ?? false,
    readOnly,
    isMenuOpen: isOpen,
    closeMenu: () => setIsOpen(false),
  });

  const items: t.MenuItemProps[] = [];

  if (exportShare.show) {
    items.push(...exportShare.items);
  }

  if (items.length === 0) {
    return null;
  }

  /** Mirrors the desktop share button, which surfaces an active link in its tooltip. */
  const triggerDescription = exportShare.hasSharedLink
    ? localize('com_ui_chat_options_link_active')
    : localize('com_ui_more_options');

  return (
    <>
      <DropdownPopup
        portal={true}
        menuId={menuId}
        focusLoop={true}
        unmountOnHide={true}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        items={items}
        trigger={
          <TooltipAnchor
            description={triggerDescription}
            render={
              <Ariakit.MenuButton
                id="header-menu-button"
                data-testid="header-overflow-menu"
                aria-label={triggerDescription}
                aria-expanded={isOpen}
                render={
                  <Button
                    size="icon"
                    variant="header-action"
                    className={cn('relative size-9 shrink-0', className)}
                  />
                }
              >
                <Ellipsis className="icon-md" aria-hidden="true" />
                {exportShare.hasSharedLink && (
                  <span
                    className="bg-status-info ring-presentation absolute -inset-e-0.5 -top-0.5 size-2 rounded-full ring-2"
                    data-testid="header-menu-shared-link-indicator"
                    aria-hidden="true"
                  />
                )}
              </Ariakit.MenuButton>
            }
          />
        }
      />
      {exportShare.dialogs}
    </>
  );
}
