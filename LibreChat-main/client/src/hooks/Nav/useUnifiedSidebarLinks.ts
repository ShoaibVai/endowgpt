import { useMemo } from 'react';
import { MessagesSquare, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavLink } from '~/common';
import { useSuperAdminAccessQuery } from '~/data-provider';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import { useAuthContext } from '~/hooks';

/**
 * The simple shell: search and history, plus the superadmin portal for the one
 * account that administers the deployment. Everything else in the product is
 * reached from the conversation itself.
 */
export default function useUnifiedSidebarLinks() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthContext();
  const { data: superAdminAccess } = useSuperAdminAccessQuery(user?.id, { enabled: !!user });
  const superAdminEnabled = superAdminAccess?.access === true;

  return useMemo(() => {
    const links: NavLink[] = [
      {
        title: 'com_ui_chat_history',
        label: '',
        icon: MessagesSquare,
        id: 'conversations',
        Component: ConversationsSection,
      },
    ];

    if (superAdminEnabled) {
      links.push({
        title: 'com_superadmin_navigation',
        label: '',
        icon: ShieldCheck,
        id: 'superadmin',
        onClick: () => {
          if (!location.pathname.startsWith('/superadmin')) {
            navigate('/superadmin');
          }
        },
      });
    }

    return links;
  }, [location.pathname, navigate, superAdminEnabled]);
}
