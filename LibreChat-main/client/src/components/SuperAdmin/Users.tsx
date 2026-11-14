import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Input, Spinner, disabledFillClasses } from '@librechat/client';
import { SystemRoles } from 'librechat-data-provider';
import type {
  TSuperAdminCreateUserRequest,
  TSuperAdminManagedRole,
  TSuperAdminUser,
} from 'librechat-data-provider';
import {
  useCreateSuperAdminUserMutation,
  useSuperAdminUsersQuery,
  useUpdateSuperAdminUserRoleMutation,
} from '~/data-provider';
import { useAuthContext } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import { cn } from '~/utils';
import { formatDate } from './format';
import type { Localize } from './panels';
import { LoadingState, Panel } from './panels';

/** Admin-only user management: create an account and move it between the
 *  deployment's two roles. The server rejects anything else, so the UI keeps the
 *  role list closed and never sends a free-form value. */

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 350;
const PASSWORD_MIN_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ERROR_LABEL_KEYS = {
  email_in_use: 'com_superadmin_email_in_use',
  invalid_body: 'com_superadmin_invalid_input',
  cannot_change_own_role: 'com_superadmin_cannot_change_own_role',
  last_admin: 'com_superadmin_last_admin',
  admin_role_required: 'com_superadmin_forbidden',
} as const;

type ErrorCode = keyof typeof ERROR_LABEL_KEYS;

/** Coded failures from the API map to copy; anything unrecognised stays generic. */
function errorLabelKey(code: string | undefined): TranslationKeys {
  if (code != null && code in ERROR_LABEL_KEYS) {
    return ERROR_LABEL_KEYS[code as ErrorCode];
  }
  return 'com_superadmin_save_failed';
}

function errorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : undefined;
}

interface RoleSelectProps {
  value: string;
  disabled: boolean;
  localize: Localize;
  onChange: (role: TSuperAdminManagedRole) => void;
}

function RoleSelect({ value, disabled, localize, onChange }: RoleSelectProps) {
  return (
    <select
      value={value === SystemRoles.ADMIN ? SystemRoles.ADMIN : SystemRoles.USER}
      disabled={disabled}
      aria-label={localize('com_superadmin_role')}
      onChange={(event) => onChange(event.target.value as TSuperAdminManagedRole)}
      className={cn(
        'border-border-medium bg-surface-primary text-text-primary rounded-md border px-2 py-1 text-xs disabled:cursor-not-allowed',
        disabledFillClasses,
      )}
    >
      <option value={SystemRoles.USER}>{localize('com_superadmin_role_user')}</option>
      <option value={SystemRoles.ADMIN}>{localize('com_superadmin_role_admin')}</option>
    </select>
  );
}

export default function Users({
  enabled,
  localize,
  locale,
}: {
  enabled: boolean;
  localize: Localize;
  locale: string;
}) {
  const { user } = useAuthContext();
  const selfId = user?.id;

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<TSuperAdminManagedRole>(SystemRoles.USER);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const usersQuery = useSuperAdminUsersQuery(
    { range: 'all', page, pageSize: PAGE_SIZE, search },
    { enabled },
  );
  const createUser = useCreateSuperAdminUserMutation();
  const updateRole = useUpdateSuperAdminUserRoleMutation();

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setSearch(trimmed);
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [search, searchInput]);

  const formValid =
    name.trim().length > 0 &&
    EMAIL_PATTERN.test(email.trim()) &&
    password.length >= PASSWORD_MIN_LENGTH;

  const handleCreate = () => {
    setFormError('');
    setNotice('');
    const payload: TSuperAdminCreateUserRequest = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role,
    };
    createUser.mutate(payload, {
      onSuccess: (data) => {
        setName('');
        setEmail('');
        setPassword('');
        setRole(SystemRoles.USER);
        setNotice(
          localize('com_superadmin_user_created', { name: data.user.name || data.user.email }),
        );
      },
      onError: (error) => {
        setFormError(localize(errorLabelKey(errorCode(error))));
      },
    });
  };

  const handleRoleChange = (target: TSuperAdminUser, nextRole: TSuperAdminManagedRole) => {
    setFormError('');
    setNotice('');
    updateRole.mutate(
      { userId: target.userId, role: nextRole },
      {
        onSuccess: () => setNotice(localize('com_superadmin_user_updated')),
        onError: (error) => {
          setFormError(localize(errorLabelKey(errorCode(error))));
        },
      },
    );
  };

  if (usersQuery.isLoading && !usersQuery.data) {
    return <LoadingState message={localize('com_superadmin_loading')} />;
  }

  const users = usersQuery.data?.users ?? [];
  const pages = usersQuery.data?.pages ?? 1;
  const busy = createUser.isLoading || updateRole.isLoading;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <Panel className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{localize('com_superadmin_manage_users_title')}</h2>
          <p className="text-text-secondary text-xs">
            {localize('com_superadmin_manage_users_hint')}
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-text-secondary text-xs font-medium">
              {localize('com_superadmin_name')}
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-secondary text-xs font-medium">
              {localize('com_superadmin_email')}
            </span>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-secondary text-xs font-medium">
              {localize('com_superadmin_password')}
            </span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-secondary text-xs font-medium">
              {localize('com_superadmin_role')}
            </span>
            <RoleSelect value={role} disabled={busy} localize={localize} onChange={setRole} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="submit" size="sm" disabled={busy || !formValid} onClick={handleCreate}>
            {createUser.isLoading ? <Spinner tone="secondary" className="size-3.5" /> : null}
            {localize('com_superadmin_create_user')}
          </Button>
          <span className="text-text-secondary text-xs">
            {localize('com_superadmin_password_hint')}
          </span>
        </div>

        {formError.length > 0 ? (
          <p className="text-status-error flex items-center gap-2 text-xs">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        ) : null}
        {notice.length > 0 ? (
          <p className="text-text-secondary flex items-center gap-2 text-xs">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
            {notice}
          </p>
        ) : null}
      </Panel>

      <Panel className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-text-secondary text-xs font-medium">
            {localize('com_superadmin_search_users')}
          </span>
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={localize('com_superadmin_search_users')}
            aria-label={localize('com_superadmin_search_users')}
          />
        </label>

        {users.length === 0 ? (
          <p className="text-text-secondary py-6 text-center text-sm">
            {localize('com_superadmin_no_users')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-start text-sm">
              <thead className="border-border-medium text-text-secondary border-b text-xs">
                <tr>
                  <th className="px-2 py-2 font-medium">{localize('com_superadmin_user')}</th>
                  <th className="px-2 py-2 font-medium">{localize('com_superadmin_role')}</th>
                  <th className="px-2 py-2 text-end font-medium">
                    {localize('com_superadmin_joined')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border-light divide-y">
                {users.map((item) => {
                  const isSelf = selfId === item.userId;
                  return (
                    <tr key={item.userId} className="hover:bg-surface-hover">
                      <td className="max-w-[18rem] px-2 py-3">
                        <div className="truncate font-medium">{item.name || item.email}</div>
                        <div className="text-text-secondary truncate text-xs">{item.email}</div>
                      </td>
                      <td className="px-2 py-3">
                        <RoleSelect
                          value={item.role}
                          disabled={busy || isSelf}
                          localize={localize}
                          onChange={(nextRole) => handleRoleChange(item, nextRole)}
                        />
                        {isSelf ? (
                          <div className="text-text-secondary text-2xs mt-1">
                            {localize('com_superadmin_this_is_you')}
                          </div>
                        ) : null}
                      </td>
                      <td className="text-text-secondary px-2 py-3 text-end whitespace-nowrap">
                        {formatDate(item.createdAt, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-text-secondary text-xs">
            {localize('com_superadmin_page_of', { page, pages })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || usersQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {localize('com_superadmin_previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || usersQuery.isFetching}
              onClick={() => setPage((current) => Math.min(pages, current + 1))}
            >
              {localize('com_superadmin_next')}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
