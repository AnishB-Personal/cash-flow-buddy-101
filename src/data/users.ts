import type { Invoice } from './collectflow';

export type Role = 'admin' | 'finance' | 'sales' | 'viewer';

export interface User {
  id: number;
  username: string;
  role: Role;
  full_name: string;
  created_at: string;
}

export interface UserCreateInput {
  username: string;
  password?: string;
  full_name?: string;
  role?: Role;
}

export interface UserUpdateInput {
  id: number;
  full_name?: string;
  role?: Role;
}

export interface UserReviewDiff {
  field: string;
  previous: string;
  current: string;
}

export interface UserReview {
  action: 'create' | 'update' | 'delete';
  targetUser?: User | undefined;
  input?: UserCreateInput | UserUpdateInput | undefined;
  diffs: UserReviewDiff[];
  supported: boolean;
  message?: string | undefined;
}

export interface UserAdapter {
  current?: UserAdapter;
  listUsers(): User[];
  getUser(id: number): User | undefined;
  validateCreate(input: UserCreateInput, existingUsers?: User[]): { valid: boolean; error?: string };
  validateUpdate(input: UserUpdateInput, existingUsers?: User[]): { valid: boolean; error?: string };
  validateDelete(userId: number, existingUsers?: User[], invoices?: any[], actingAdminId?: number): { valid: boolean; error?: string };
  reviewCreate(input: UserCreateInput, existingUsers?: User[]): UserReview;
  reviewUpdate(input: UserUpdateInput, existingUsers?: User[]): UserReview;
  reviewDelete(userId: number, existingUsers?: User[], invoices?: any[], actingAdminId?: number): UserReview;
  createUser(input: UserCreateInput): User;
  updateUser(input: UserUpdateInput): User;
  deleteUser(userId: number): boolean;
  reset(): void;
}

export const INITIAL_USERS: User[] = [
  { id: 1, username: 'admin', full_name: 'System Administrator', role: 'admin', created_at: '2026-04-01 00:00:00' },
  { id: 2, username: 'finance_lead', full_name: 'Aisha Khan', role: 'finance', created_at: '2026-04-02 10:15:00' },
  { id: 3, username: 'siliya', full_name: 'Neha Rao', role: 'sales', created_at: '2026-04-03 11:30:00' },
  { id: 4, username: 'syama', full_name: 'Kavya Nair', role: 'sales', created_at: '2026-04-03 11:45:00' },
  { id: 5, username: 'anshar', full_name: 'Arjun Mehta', role: 'sales', created_at: '2026-04-03 12:00:00' },
  { id: 6, username: 'auditor', full_name: 'Kavita Rao', role: 'viewer', created_at: '2026-04-05 09:00:00' },
];

export function readInitialUsers(): User[] {
  return structuredClone(INITIAL_USERS);
}

export const VALID_ROLES: Role[] = ['admin', 'finance', 'sales', 'viewer'];

export function validateUsername(username: string, existingUsers: User[] = []): { valid: boolean; error?: string; cleanUsername?: string } {
  const clean = (username || '').trim().toLowerCase();
  if (clean.length < 3 || clean.length > 50) {
    return { valid: false, error: 'Username must be between 3 and 50 characters' };
  }
  if (!/^[a-zA-Z0-9_.@-]+$/.test(clean)) {
    return { valid: false, error: 'Username can only contain alphanumeric characters, ., _, @, -' };
  }
  const isDuplicate = existingUsers.some(user => user.username.toLowerCase() === clean);
  if (isDuplicate) {
    return { valid: false, error: 'A user with this username already exists' };
  }
  return { valid: true, cleanUsername: clean };
}

export function validatePassword(password?: string): { valid: boolean; error?: string } {
  if (!password || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  return { valid: true };
}

export function validateRole(role?: string): { valid: boolean; error?: string } {
  if (!role || !VALID_ROLES.includes(role as Role)) {
    return { valid: false, error: 'Invalid role. Must be one of: admin, finance, sales, viewer' };
  }
  return { valid: true };
}

export function canManageUsers(role: Role): boolean {
  return role === 'admin';
}

export function canViewUserDirectory(role: Role): boolean {
  return VALID_ROLES.includes(role);
}

export function validateDelete(
  userId: number,
  existingUsers: User[],
  invoices: Invoice[] | any[] = [],
  actingAdminId = 1,
): { valid: boolean; error?: string } {
  if (userId === actingAdminId) {
    return { valid: false, error: 'Cannot delete your own account' };
  }
  const user = existingUsers.find(u => u.id === userId);
  if (!user) {
    return { valid: false, error: 'User not found' };
  }
  const adminCount = existingUsers.filter(u => u.role === 'admin').length;
  if (user.role === 'admin' && adminCount <= 1) {
    return { valid: false, error: 'Cannot delete the only remaining administrator' };
  }
  const invCount = invoices.filter(
    i => (i.order_type === 'PO' && !i.invoice_number ? false : i.executive_id === userId),
  ).length;
  if (invCount > 0) {
    return {
      valid: false,
      error: `Cannot delete user '${user.username}' because they are referenced as sales representative on ${invCount} invoice(s).`,
    };
  }
  return { valid: true };
}

export function validateUpdate(
  userId: number,
  newRole: Role | undefined,
  existingUsers: User[],
): { valid: boolean; error?: string } {
  const user = existingUsers.find(u => u.id === userId);
  if (!user) {
    return { valid: false, error: 'User not found' };
  }
  if (newRole) {
    const roleValidation = validateRole(newRole);
    if (!roleValidation.valid) {
      return roleValidation;
    }
    const adminCount = existingUsers.filter(u => u.role === 'admin').length;
    if (user.role === 'admin' && newRole !== 'admin' && adminCount <= 1) {
      return { valid: false, error: 'Cannot demote the only remaining administrator' };
    }
  }
  return { valid: true };
}

export function createUsersAdapter(initialUsers: User[] = INITIAL_USERS): UserAdapter {
  let store: User[] = structuredClone(initialUsers);

  const adapter: UserAdapter = {
    listUsers(): User[] {
      return structuredClone(store);
    },

    getUser(id: number): User | undefined {
      const match = store.find(u => u.id === id);
      return match ? structuredClone(match) : undefined;
    },

    validateCreate(input: UserCreateInput, existingUsers: User[] = store): { valid: boolean; error?: string } {
      const usernameVal = validateUsername(input.username, existingUsers);
      if (!usernameVal.valid) return usernameVal;

      const passwordVal = validatePassword(input.password);
      if (!passwordVal.valid) return passwordVal;

      if (input.role) {
        const roleVal = validateRole(input.role);
        if (!roleVal.valid) return roleVal;
      }
      return { valid: true };
    },

    validateUpdate(input: UserUpdateInput, existingUsers: User[] = store): { valid: boolean; error?: string } {
      return validateUpdate(input.id, input.role, existingUsers);
    },

    validateDelete(userId: number, existingUsers: User[] = store, invoices: any[] = [], actingAdminId = 1): { valid: boolean; error?: string } {
      return validateDelete(userId, existingUsers, invoices, actingAdminId);
    },

    reviewCreate(input: UserCreateInput, existingUsers: User[] = store): UserReview {
      const val = adapter.validateCreate(input, existingUsers);
      if (!val.valid) {
        return {
          action: 'create',
          input,
          diffs: [],
          supported: false,
          message: val.error,
        };
      }
      const cleanUsername = (input.username || '').trim().toLowerCase();
      const fullName = input.full_name?.trim() || (cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1));
      const role: Role = input.role ?? 'sales';
      const nextId = store.length > 0 ? Math.max(...store.map(u => u.id)) + 1 : 1;
      const targetUser: User = {
        id: nextId,
        username: cleanUsername,
        full_name: fullName,
        role,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      };

      const diffs: UserReviewDiff[] = [
        { field: 'Username', previous: '—', current: cleanUsername },
        { field: 'Full Name', previous: '—', current: fullName },
        { field: 'Role', previous: '—', current: role },
      ];

      return {
        action: 'create',
        targetUser,
        input,
        diffs,
        supported: true,
        message: 'Ready to create user account.',
      };
    },

    reviewUpdate(input: UserUpdateInput, existingUsers: User[] = store): UserReview {
      const targetUser = store.find(u => u.id === input.id);
      if (!targetUser) {
        return {
          action: 'update',
          input,
          diffs: [],
          supported: false,
          message: 'User not found',
        };
      }

      const val = adapter.validateUpdate(input, existingUsers);
      if (!val.valid) {
        return {
          action: 'update',
          targetUser: structuredClone(targetUser),
          input,
          diffs: [],
          supported: false,
          message: val.error,
        };
      }

      const nextFullName = input.full_name !== undefined ? (input.full_name.trim() || targetUser.full_name) : targetUser.full_name;
      const nextRole = input.role ?? targetUser.role;

      const diffs: UserReviewDiff[] = [];
      if (nextFullName !== targetUser.full_name) {
        diffs.push({ field: 'Full Name', previous: targetUser.full_name, current: nextFullName });
      }
      if (nextRole !== targetUser.role) {
        diffs.push({ field: 'Role', previous: targetUser.role, current: nextRole });
      }

      return {
        action: 'update',
        targetUser: {
          ...structuredClone(targetUser),
          full_name: nextFullName,
          role: nextRole,
        },
        input,
        diffs,
        supported: true,
        message: 'Ready to update user details.',
      };
    },

    reviewDelete(userId: number, existingUsers: User[] = store, invoices: any[] = [], actingAdminId = 1): UserReview {
      const targetUser = store.find(u => u.id === userId);
      if (!targetUser) {
        return {
          action: 'delete',
          diffs: [],
          supported: false,
          message: 'User not found',
        };
      }

      const val = adapter.validateDelete(userId, existingUsers, invoices, actingAdminId);
      if (!val.valid) {
        return {
          action: 'delete',
          targetUser: structuredClone(targetUser),
          diffs: [],
          supported: false,
          message: val.error,
        };
      }

      const diffs: UserReviewDiff[] = [
        { field: 'Status', previous: 'Active', current: 'Deleted' },
        { field: 'Username', previous: targetUser.username, current: '—' },
        { field: 'Role', previous: targetUser.role, current: '—' },
      ];

      return {
        action: 'delete',
        targetUser: structuredClone(targetUser),
        diffs,
        supported: true,
        message: `Ready to delete user account '${targetUser.username}'.`,
      };
    },

    createUser(input: UserCreateInput): User {
      const validation = adapter.validateCreate(input, store);
      if (!validation.valid) {
        throw new Error(validation.error || 'User creation validation failed');
      }

      const cleanUsername = (input.username || '').trim().toLowerCase();
      const fullName = input.full_name?.trim() || (cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1));
      const role: Role = input.role ?? 'sales';
      const nextId = store.length > 0 ? Math.max(...store.map(u => u.id)) + 1 : 1;

      const newUser: User = {
        id: nextId,
        username: cleanUsername,
        full_name: fullName,
        role,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      };

      store.push(newUser);
      return structuredClone(newUser);
    },

    updateUser(input: UserUpdateInput): User {
      const userIndex = store.findIndex(u => u.id === input.id);
      if (userIndex === -1) {
        throw new Error('User not found');
      }

      const validation = adapter.validateUpdate(input, store);
      if (!validation.valid) {
        throw new Error(validation.error || 'User update validation failed');
      }

      const current = store[userIndex]!;
      const updatedUser: User = {
        ...current,
        full_name: input.full_name !== undefined ? (input.full_name.trim() || current.full_name) : current.full_name,
        role: input.role ?? current.role,
      };

      store[userIndex] = updatedUser;
      return structuredClone(updatedUser);
    },

    deleteUser(userId: number): boolean {
      const userIndex = store.findIndex(u => u.id === userId);
      if (userIndex === -1) {
        throw new Error('User not found');
      }
      store.splice(userIndex, 1);
      return true;
    },

    reset(): void {
      store = structuredClone(initialUsers);
    },
  };

  adapter.current = adapter;
  return adapter;
}
