import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import useDrawerViewport from '~/hooks/Nav/useDrawerViewport';
import { OpenSidebar, NewChat, HeaderMenu } from './Menus';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import { cn } from '~/utils';
import store from '~/store';

/** Keep one DOM order while sharing the sidebar's scaled drawer breakpoint. */
function Header({ readOnly = false }: { parentConversationId?: string; readOnly?: boolean }) {
  const { data: startupConfig } = useGetStartupConfig();
  const navVisible = useRecoilValue(store.sidebarExpanded);
  const isSmallScreen = useDrawerViewport();
  const { conversationId: routeConversationId } = useParams();
  const isNewChat = routeConversationId == null || routeConversationId === Constants.NEW_CONVO;

  /** The drawer covers the header on mobile; keep its controls out of the tab order. */
  const hiddenBehindNav = navVisible === true && isSmallScreen && 'hidden';

  return (
    <div className="from-surface-canvas via-surface-canvas/70 text-text-primary md:from-surface-canvas/80 md:via-surface-canvas/50 2xl:from-surface-canvas/0 theme-chrome-quiet:bg-surface-canvas theme-chrome-quiet:bg-none absolute top-0 z-20 flex h-[3.25rem] w-full items-center gap-2 bg-gradient-to-b to-transparent p-2 font-semibold 2xl:via-transparent">
      <div className={cn('flex-shrink-0 items-center', isSmallScreen ? 'flex' : 'hidden')}>
        <OpenSidebar testId="header-open-sidebar-button" />
      </div>

      <div className={cn('flex min-w-0 flex-1 items-center gap-2', hiddenBehindNav)} />

      <div className={cn('flex shrink-0 items-center gap-2', hiddenBehindNav)}>
        {!isNewChat && <NewChat className={isSmallScreen ? undefined : 'hidden'} />}
        <HeaderMenu
          startupConfig={startupConfig}
          readOnly={readOnly}
          className={isSmallScreen ? undefined : 'hidden'}
        />
        <div className={cn('items-center gap-2', isSmallScreen ? 'hidden' : 'flex')}>
          <ExportAndShareMenu
            isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
}

const MemoizedHeader = memo(Header);
MemoizedHeader.displayName = 'Header';

export default MemoizedHeader;
