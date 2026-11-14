import {
  SystemRoles,
  superAdminCreateUserSchema,
  superAdminUpdateRoleSchema,
} from 'librechat-data-provider';
import type { TSuperAdminManagedUser } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import type { FilterQuery, Types } from 'mongoose';
import type { Request, Response } from 'express';

/** endowGPT superadmin user management: create an account and move it between
 *  the deployment's two roles. The router is mounted behind JWT auth,
 *  `access:admin` and an ADMIN-role check, so every handler here can assume an
 *  admin caller; the role is re-checked anyway so wiring cannot widen access. */

const OBJECT_ID = /^[a-f\d]{24}$/i;

type SuperAdminUserRequest = Request & {
  user?: { id?: string; role?: string };
};

export interface SuperAdminUserMethods {
  findUser: (filter: FilterQuery<IUser>, fields?: string) => Promise<IUser | null>;
  countUsers: (filter?: FilterQuery<IUser>) => Promise<number>;
  updateUser: (userId: string, data: Partial<IUser>) => Promise<IUser | null>;
  /** Resolves to the created document when `returnUser` is true. */
  createUser: (
    data: Partial<IUser>,
    balanceConfig?: unknown,
    disableTTL?: boolean,
    returnUser?: boolean,
  ) => Promise<Partial<IUser> | Types.ObjectId>;
  hashPassword: (password: string) => Promise<string>;
}

export interface SuperAdminUserHandlers {
  createUser: (req: SuperAdminUserRequest, res: Response) => Promise<Response>;
  updateUserRole: (req: SuperAdminUserRequest, res: Response) => Promise<Response>;
}

function isAdmin(req: SuperAdminUserRequest): boolean {
  return req.user?.role === SystemRoles.ADMIN;
}

/** `createUser` answers with the document only when `returnUser` is true; it
 *  returns an ObjectId otherwise, which carries no profile to report. */
function isCreatedUser(value: Partial<IUser> | Types.ObjectId): value is Partial<IUser> {
  return typeof value === 'object' && value != null && !('_bsontype' in value);
}

function toManagedUser(user: Partial<IUser>): TSuperAdminManagedUser {
  const id = user._id ?? (user as { id?: string }).id;
  return {
    id: id == null ? '' : String(id),
    name: user.name ?? '',
    email: user.email ?? '',
    role: user.role ?? SystemRoles.USER,
    createdAt: user.createdAt == null ? null : new Date(user.createdAt).toISOString(),
  };
}

export function createSuperAdminUserHandlers(deps: SuperAdminUserMethods): SuperAdminUserHandlers {
  const { findUser, countUsers, updateUser, createUser, hashPassword } = deps;

  async function createUserHandler(req: SuperAdminUserRequest, res: Response): Promise<Response> {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'admin_role_required' });
    }

    const parsed = superAdminCreateUserSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body' });
    }

    const email = parsed.data.email.toLowerCase();
    const { name, password, role } = parsed.data;

    try {
      const existing = await findUser({ email }, '_id');
      if (existing != null) {
        return res.status(409).json({ error: 'email_in_use' });
      }

      const created = await createUser(
        {
          provider: 'local',
          email,
          name,
          /** Accounts created here are vouched for by an admin; without SMTP a
           *  verification mail could never be delivered, so they are verified. */
          emailVerified: true,
          role,
          password: await hashPassword(password),
        },
        undefined,
        true,
        true,
      );

      if (!isCreatedUser(created)) {
        return res.status(500).json({ error: 'superadmin_create_user_failed' });
      }

      return res.status(201).json({ user: toManagedUser(created) });
    } catch (error) {
      /** A unique index races the pre-check above; the code is the only stable signal. */
      if ((error as { code?: number }).code === 11000) {
        return res.status(409).json({ error: 'email_in_use' });
      }
      return res.status(500).json({ error: 'superadmin_create_user_failed' });
    }
  }

  async function updateUserRoleHandler(
    req: SuperAdminUserRequest,
    res: Response,
  ): Promise<Response> {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'admin_role_required' });
    }

    const userId = req.params.userId;
    if (typeof userId !== 'string' || !OBJECT_ID.test(userId)) {
      return res.status(400).json({ error: 'invalid_user' });
    }

    const parsed = superAdminUpdateRoleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body' });
    }

    const { role } = parsed.data;

    /** Demoting yourself is the shortest route to a deployment with no admin. */
    if (req.user?.id === userId) {
      return res.status(403).json({ error: 'cannot_change_own_role' });
    }

    try {
      const target = await findUser({ _id: userId });
      if (target == null) {
        return res.status(404).json({ error: 'user_not_found' });
      }

      if (target.role === role) {
        return res.status(200).json({ user: toManagedUser(target) });
      }

      if (target.role === SystemRoles.ADMIN && role !== SystemRoles.ADMIN) {
        const otherAdmins = await countUsers({
          role: SystemRoles.ADMIN,
          _id: { $ne: userId },
        });
        if (otherAdmins === 0) {
          return res.status(409).json({ error: 'last_admin' });
        }
      }

      const updated = await updateUser(userId, { role });
      if (updated == null) {
        return res.status(404).json({ error: 'user_not_found' });
      }

      return res.status(200).json({ user: toManagedUser(updated) });
    } catch {
      return res.status(500).json({ error: 'superadmin_update_role_failed' });
    }
  }

  return { createUser: createUserHandler, updateUserRole: updateUserRoleHandler };
}
