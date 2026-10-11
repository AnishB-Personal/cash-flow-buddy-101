import { describe, expect, it, beforeEach } from 'vitest';
import {
  INITIAL_USERS,
  readInitialUsers,
  VALID_ROLES,
  validateUsername,
  validatePassword,
  validateRole,
  canManageUsers,
  canViewUserDirectory,
  validateDelete,
  validateUpdate,
  createUsersAdapter,
  type User,
  type Role,
  type UserCreateInput,
  type UserUpdateInput,
  type UserAdapter,
} from '@/data/users';
import collectflowData from '@/data/collectflow.json';

describe('Stage 5 — User Management & RBAC Data Layer (Unit Tests)', () => {
  // ─── 1. BASELINE USERS INTEGRITY ─────────────────────────────────────────
  describe('Baseline Users Integrity', () => {
    it('contains exactly 6 baseline users with correct IDs, roles, and usernames', () => {
      expect(INITIAL_USERS).toHaveLength(6);

      const expectedUsers = [
        { id: 1, username: 'admin', full_name: 'System Administrator', role: 'admin' },
        { id: 2, username: 'finance_lead', full_name: 'Aisha Khan', role: 'finance' },
        { id: 3, username: 'siliya', full_name: 'Neha Rao', role: 'sales' },
        { id: 4, username: 'syama', full_name: 'Kavya Nair', role: 'sales' },
        { id: 5, username: 'anshar', full_name: 'Arjun Mehta', role: 'sales' },
        { id: 6, username: 'auditor', full_name: 'Kavita Rao', role: 'viewer' },
      ];

      expectedUsers.forEach((expected, index) => {
        const actual = INITIAL_USERS[index]!;
        expect(actual.id).toBe(expected.id);
        expect(actual.username).toBe(expected.username);
        expect(actual.full_name).toBe(expected.full_name);
        expect(actual.role).toBe(expected.role);
        expect(actual.created_at).toBeDefined();
      });
    });

    it('matches the users defined in collectflow.json baseline fixture', () => {
      const fixtureUsers = (collectflowData as any).users;
      expect(fixtureUsers).toBeDefined();
      expect(fixtureUsers).toHaveLength(6);

      INITIAL_USERS.forEach((user, idx) => {
        const fixture = fixtureUsers[idx];
        expect(user.id).toBe(fixture.id);
        expect(user.username).toBe(fixture.username);
        expect(user.role).toBe(fixture.role);
        expect(user.full_name).toBe(fixture.full_name);
      });
    });

    it('readInitialUsers returns a detached deep clone preventing mutation', () => {
      const users1 = readInitialUsers();
      const users2 = readInitialUsers();

      expect(users1).toEqual(users2);
      expect(users1).not.toBe(users2);
      expect(users1[0]).not.toBe(users2[0]);

      users1[0]!.full_name = 'Mutated Administrator';
      expect(INITIAL_USERS[0]!.full_name).toBe('System Administrator');
      expect(readInitialUsers()[0]!.full_name).toBe('System Administrator');
    });
  });

  // ─── 2. USERNAME VALIDATION ──────────────────────────────────────────────
  describe('Username Validation (validateUsername)', () => {
    const existingUsers = readInitialUsers();

    it('accepts valid usernames conforming to length and regex [a-zA-Z0-9_.@-]', () => {
      const validNames = [
        'john_doe',
        'priya.sharma',
        'sales-rep',
        'admin_2026',
        'user@domain.com',
        'ABC_123',
        'dev-test.user',
      ];

      validNames.forEach(name => {
        const res = validateUsername(name, existingUsers);
        expect(res.valid, `Expected "${name}" to be valid`).toBe(true);
        expect(res.cleanUsername).toBe(name.trim().toLowerCase());
        expect(res.error).toBeUndefined();
      });
    });

    it('trims leading/trailing whitespace and downcases username', () => {
      const res = validateUsername('   NewUser.99   ', existingUsers);
      expect(res.valid).toBe(true);
      expect(res.cleanUsername).toBe('newuser.99');
    });

    it('rejects usernames shorter than 3 characters', () => {
      const tooShort = ['', 'a', 'ab', '  x  '];
      tooShort.forEach(name => {
        const res = validateUsername(name, existingUsers);
        expect(res.valid).toBe(false);
        expect(res.error).toBe('Username must be between 3 and 50 characters');
      });
    });

    it('rejects usernames longer than 50 characters', () => {
      const tooLong = 'a'.repeat(51);
      const res = validateUsername(tooLong, existingUsers);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Username must be between 3 and 50 characters');
    });

    it('rejects invalid characters (spaces, special symbols)', () => {
      const invalidNames = [
        'user name',
        'user!admin',
        'user#hashtag',
        'dollar$bill',
        'user*star',
        'slash/user',
        'plus+user',
      ];

      invalidNames.forEach(name => {
        const res = validateUsername(name, existingUsers);
        expect(res.valid).toBe(false);
        expect(res.error).toBe('Username can only contain alphanumeric characters, ., _, @, -');
      });
    });

    it('enforces case-insensitive duplicate username checks against existing users', () => {
      const duplicateAttempts = [
        'admin',
        'ADMIN',
        'Admin',
        'AdMiN',
        'siliya',
        'SILIYA',
        'Siliya',
        'finance_lead',
        'FINANCE_LEAD',
        'auditor',
        'AUDITOR',
      ];

      duplicateAttempts.forEach(dup => {
        const res = validateUsername(dup, existingUsers);
        expect(res.valid, `Expected duplicate "${dup}" to be rejected`).toBe(false);
        expect(res.error).toBe('A user with this username already exists');
      });
    });
  });

  // ─── 3. PASSWORD VALIDATION ──────────────────────────────────────────────
  describe('Password Validation (validatePassword)', () => {
    it('accepts passwords of 6 characters or longer', () => {
      const validPasswords = ['123456', 'secure_pass', 'P@ssw0rd!2026', 'a'.repeat(50)];
      validPasswords.forEach(pwd => {
        const res = validatePassword(pwd);
        expect(res.valid).toBe(true);
        expect(res.error).toBeUndefined();
      });
    });

    it('rejects passwords shorter than 6 characters or undefined/empty', () => {
      const invalidPasswords = [undefined, '', '123', '12345', 'abcde'];
      invalidPasswords.forEach(pwd => {
        const res = validatePassword(pwd);
        expect(res.valid).toBe(false);
        expect(res.error).toBe('Password must be at least 6 characters');
      });
    });
  });

  // ─── 4. ROLE VALIDATION & PERMISSIONS ────────────────────────────────────
  describe('Role Validation & RBAC Permissions', () => {
    it('accepts all 4 valid roles: admin, finance, sales, viewer', () => {
      expect(VALID_ROLES).toEqual(['admin', 'finance', 'sales', 'viewer']);
      VALID_ROLES.forEach(r => {
        const res = validateRole(r);
        expect(res.valid).toBe(true);
        expect(res.error).toBeUndefined();
      });
    });

    it('rejects invalid or unauthorized roles with exact error message', () => {
      const invalidRoles = ['superadmin', 'manager', 'root', 'guest', '', undefined];
      invalidRoles.forEach(r => {
        const res = validateRole(r);
        expect(res.valid).toBe(false);
        expect(res.error).toBe('Invalid role. Must be one of: admin, finance, sales, viewer');
      });
    });

    it('canManageUsers permits ONLY admin', () => {
      expect(canManageUsers('admin')).toBe(true);
      expect(canManageUsers('finance')).toBe(false);
      expect(canManageUsers('sales')).toBe(false);
      expect(canManageUsers('viewer')).toBe(false);
    });

    it('canViewUserDirectory permits all authenticated roles', () => {
      expect(canViewUserDirectory('admin')).toBe(true);
      expect(canViewUserDirectory('finance')).toBe(true);
      expect(canViewUserDirectory('sales')).toBe(true);
      expect(canViewUserDirectory('viewer')).toBe(true);
    });
  });

  // ─── 5. UPDATE & DEMOTION SAFEGUARDS ─────────────────────────────────────
  describe('Update & Demotion Safeguards (validateUpdate)', () => {
    let users: User[];

    beforeEach(() => {
      users = readInitialUsers();
    });

    it('blocks sole administrator demotion with exact error message', () => {
      // Baseline has 1 admin (id: 1)
      const demoteToRoles: Role[] = ['finance', 'sales', 'viewer'];
      demoteToRoles.forEach(newRole => {
        const res = validateUpdate(1, newRole, users);
        expect(res.valid).toBe(false);
        expect(res.error).toBe('Cannot demote the only remaining administrator');
      });
    });

    it('allows demoting an admin if another admin exists', () => {
      const multiAdminUsers: User[] = [
        ...users,
        { id: 7, username: 'admin2', full_name: 'Second Admin', role: 'admin', created_at: '2026-04-10' },
      ];
      const res = validateUpdate(1, 'finance', multiAdminUsers);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('allows updating role of non-admin users', () => {
      // Change sales user (id: 4) to finance
      const res = validateUpdate(4, 'finance', users);
      expect(res.valid).toBe(true);
    });

    it('allows promoting non-admin to admin', () => {
      const res = validateUpdate(2, 'admin', users);
      expect(res.valid).toBe(true);
    });

    it('allows updating full name without role change on sole admin', () => {
      const res = validateUpdate(1, undefined, users);
      expect(res.valid).toBe(true);
    });

    it('rejects update for non-existent user ID', () => {
      const res = validateUpdate(999, 'admin', users);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('User not found');
    });
  });

  // ─── 6. DELETION SAFEGUARDS & INVOICE REFERENCE BLOCKING ──────────────────
  describe('Deletion Safeguards & Foreign Key Check (validateDelete)', () => {
    let users: User[];
    const invoices = (collectflowData as any).invoices || [];

    beforeEach(() => {
      users = readInitialUsers();
    });

    it('strictly blocks self-deletion (acting admin deleting their own account)', () => {
      const res = validateDelete(1, users, invoices, 1);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Cannot delete your own account');
    });

    it('strictly blocks deleting the sole remaining administrator', () => {
      // Acting admin 2 (finance or hypothetical admin) tries to delete user 1 (the only admin)
      const res = validateDelete(1, users, invoices, 2);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Cannot delete the only remaining administrator');
    });

    it('returns error when user to delete does not exist', () => {
      const res = validateDelete(999, users, invoices, 1);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('User not found');
    });

    it('strictly blocks deletion of user id: 3 (siliya / Neha Rao) referenced on invoice INV-2026-042', () => {
      // Find invoice referencing user 3
      const linkedInvoice = invoices.find((inv: any) => inv.executive_id === 3);
      expect(linkedInvoice).toBeDefined();
      expect(linkedInvoice.invoice_number).toBe('INV-2026-042');

      const res = validateDelete(3, users, invoices, 1);
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Cannot delete user 'siliya' because they are referenced as sales representative on 1 invoice(s).");
    });

    it('correctly handles pluralization for multiple invoice references', () => {
      const mockInvoices = [
        { id: 1, invoice_number: 'INV-1', executive_id: 3 },
        { id: 2, invoice_number: 'INV-2', executive_id: 3 },
        { id: 3, invoice_number: 'INV-3', executive_id: 3 },
      ];
      const res = validateDelete(3, users, mockInvoices, 1);
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Cannot delete user 'siliya' because they are referenced as sales representative on 3 invoice(s).");
    });

    it('allows deleting eligible users with no invoice associations', () => {
      // User 4 (syama / Kavya Nair) has 0 baseline issued invoices (only 1 unbilled PO)
      const syamaInvoices = invoices.filter((inv: any) => inv.invoice_number && inv.executive_id === 4);
      expect(syamaInvoices).toHaveLength(0);

      const res4 = validateDelete(4, users, invoices, 1);
      expect(res4.valid).toBe(true);
      expect(res4.error).toBeUndefined();

      // User 5 (anshar / Arjun Mehta) has 0 baseline invoices
      const res5 = validateDelete(5, users, invoices, 1);
      expect(res5.valid).toBe(true);

      // User 6 (auditor / Kavita Rao) has 0 baseline invoices
      const res6 = validateDelete(6, users, invoices, 1);
      expect(res6.valid).toBe(true);
    });
  });

  // ─── 7. USER ADAPTER OPERATIONS ──────────────────────────────────────────
  describe('UserAdapter Operations (createUsersAdapter)', () => {
    let adapter: UserAdapter;

    beforeEach(() => {
      adapter = createUsersAdapter(readInitialUsers());
    });

    it('lists all baseline users', () => {
      const list = adapter.listUsers();
      expect(list).toHaveLength(6);
      expect(list[0]!.username).toBe('admin');
    });

    it('retrieves user by id or returns undefined if not found', () => {
      const u2 = adapter.getUser(2);
      expect(u2).toBeDefined();
      expect(u2?.username).toBe('finance_lead');

      const nonExistent = adapter.getUser(999);
      expect(nonExistent).toBeUndefined();
    });

    describe('User Creation Workflow', () => {
      it('validates, reviews, and creates a new user successfully', () => {
        const input: UserCreateInput = {
          username: 'priya.sharma',
          password: 'securePassword123',
          full_name: 'Priya Sharma',
          role: 'sales',
        };

        // 1. Validation
        const val = adapter.validateCreate(input);
        expect(val.valid).toBe(true);

        // 2. Review
        const rev = adapter.reviewCreate(input);
        expect(rev.action).toBe('create');
        expect(rev.supported).toBe(true);
        expect(rev.targetUser).toBeDefined();
        expect(rev.targetUser?.id).toBe(7);
        expect(rev.targetUser?.username).toBe('priya.sharma');
        expect(rev.diffs).toHaveLength(3);

        // Verify password is NOT in diffs
        const passwordDiff = rev.diffs.find(d => d.field.toLowerCase().includes('password'));
        expect(passwordDiff).toBeUndefined();

        // 3. Execution
        const created = adapter.createUser(input);
        expect(created.id).toBe(7);
        expect(created.username).toBe('priya.sharma');
        expect(created.full_name).toBe('Priya Sharma');
        expect(created.role).toBe('sales');

        expect(adapter.listUsers()).toHaveLength(7);
      });

      it('defaults full_name to capitalized username when omitted or blank', () => {
        const input: UserCreateInput = {
          username: 'tarun_kumar',
          password: 'password123',
        };

        const created = adapter.createUser(input);
        expect(created.full_name).toBe('Tarun_kumar');
        expect(created.role).toBe('sales'); // default role is sales
      });

      it('throws an error when creating user with duplicate username', () => {
        expect(() => {
          adapter.createUser({
            username: 'ADMIN',
            password: 'password123',
          });
        }).toThrow('A user with this username already exists');
      });

      it('throws an error when password is shorter than 6 characters', () => {
        expect(() => {
          adapter.createUser({
            username: 'valid.user',
            password: '123',
          });
        }).toThrow('Password must be at least 6 characters');
      });
    });

    describe('User Update Workflow', () => {
      it('reviews and updates role and full name cleanly', () => {
        const input: UserUpdateInput = {
          id: 5,
          full_name: 'Arjun Mehta (Lead)',
          role: 'finance',
        };

        const rev = adapter.reviewUpdate(input);
        expect(rev.supported).toBe(true);
        expect(rev.diffs).toHaveLength(2);

        const updated = adapter.updateUser(input);
        expect(updated.id).toBe(5);
        expect(updated.full_name).toBe('Arjun Mehta (Lead)');
        expect(updated.role).toBe('finance');

        const fetched = adapter.getUser(5);
        expect(fetched?.full_name).toBe('Arjun Mehta (Lead)');
        expect(fetched?.role).toBe('finance');
      });

      it('throws an error when attempting to demote sole admin', () => {
        expect(() => {
          adapter.updateUser({
            id: 1,
            role: 'sales',
          });
        }).toThrow('Cannot demote the only remaining administrator');
      });
    });

    describe('User Deletion Workflow', () => {
      const invoices = (collectflowData as any).invoices || [];

      it('reviews and deletes eligible user cleanly', () => {
        const rev = adapter.reviewDelete(4, adapter.listUsers(), invoices, 1);
        expect(rev.supported).toBe(true);
        expect(rev.diffs).toHaveLength(3);

        const success = adapter.deleteUser(4);
        expect(success).toBe(true);
        expect(adapter.getUser(4)).toBeUndefined();
        expect(adapter.listUsers()).toHaveLength(5);
      });

      it('blocks reviewDelete for user with historical invoice references', () => {
        const rev = adapter.reviewDelete(3, adapter.listUsers(), invoices, 1);
        expect(rev.supported).toBe(false);
        expect(rev.message).toBe("Cannot delete user 'siliya' because they are referenced as sales representative on 1 invoice(s).");
      });

      it('rejected deletion does NOT alter internal user list', () => {
        const initialCount = adapter.listUsers().length;
        const rev = adapter.reviewDelete(3, adapter.listUsers(), invoices, 1);
        expect(rev.supported).toBe(false);

        // Verify count remains unchanged
        expect(adapter.listUsers()).toHaveLength(initialCount);
        expect(adapter.getUser(3)).toBeDefined();
      });

      it('safeguards financial integrity: user with invoices (Neha Rao id:3) is blocked, user with targets (Arjun Mehta id:5) deletes and cascades targets', () => {
        // User with invoices: BLOCKED
        const blockedVal = adapter.validateDelete(3, adapter.listUsers(), invoices, 1);
        expect(blockedVal.valid).toBe(false);
        expect(blockedVal.error).toContain("referenced as sales representative on 1 invoice(s)");
        expect(adapter.getUser(3)).toBeDefined();

        // User without invoices but with targets (Arjun Mehta id:5): PERMITTED
        const allowedVal = adapter.validateDelete(5, adapter.listUsers(), invoices, 1);
        expect(allowedVal.valid).toBe(true);
        expect(allowedVal.error).toBeUndefined();

        // Perform deletion of Arjun Mehta
        const deleted = adapter.deleteUser(5);
        expect(deleted).toBe(true);
        expect(adapter.getUser(5)).toBeUndefined();
        expect(adapter.listUsers()).toHaveLength(5);
      });

      it('throws error when deleting non-existent user id', () => {
        expect(() => {
          adapter.deleteUser(999);
        }).toThrow('User not found');
      });
    });

    describe('Adapter Reset', () => {
      it('restores initial 6 baseline users after modifications and deletions', () => {
        // Add user
        adapter.createUser({
          username: 'temp_user',
          password: 'password123',
        });
        expect(adapter.listUsers()).toHaveLength(7);

        // Delete user
        adapter.deleteUser(4);
        expect(adapter.listUsers()).toHaveLength(6);

        // Reset
        adapter.reset();
        const restored = adapter.listUsers();
        expect(restored).toHaveLength(6);
        expect(restored.find(u => u.username === 'temp_user')).toBeUndefined();
        expect(restored.find(u => u.id === 4)).toBeDefined();
        expect(restored.find(u => u.id === 4)?.username).toBe('syama');
      });
    });
  });
});
