import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

/** endowGPT superadmin user management. Both mutations refresh the user list and
 *  the overview, so counts follow a role change without a manual reload. */

export interface UpdateSuperAdminUserRoleVars {
  userId: string;
  role: t.TSuperAdminManagedRole;
}

export const useCreateSuperAdminUserMutation = (): UseMutationResult<
  t.TSuperAdminManagedUserResponse,
  unknown,
  t.TSuperAdminCreateUserRequest
> => {
  const queryClient = useQueryClient();
  return useMutation<t.TSuperAdminManagedUserResponse, unknown, t.TSuperAdminCreateUserRequest>({
    mutationFn: (payload) => dataService.createSuperAdminUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.superAdminUsers] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.superAdminOverview] });
    },
  });
};

export const useUpdateSuperAdminUserRoleMutation = (): UseMutationResult<
  t.TSuperAdminManagedUserResponse,
  unknown,
  UpdateSuperAdminUserRoleVars
> => {
  const queryClient = useQueryClient();
  return useMutation<t.TSuperAdminManagedUserResponse, unknown, UpdateSuperAdminUserRoleVars>({
    mutationFn: ({ userId, role }) => dataService.updateSuperAdminUserRole(userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.superAdminUsers] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.superAdminOverview] });
    },
  });
};
