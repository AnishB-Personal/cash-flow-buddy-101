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

describe('Adversarial Boundary & Oracle Challenge Suite', () => {
  const existingUsers = readInitialUsers();

  // ───────────────────────────────────────────────────────────────────────────
  // 1. USERNAME LENGTH BOUNDARIES
  // ───────────────────────────────────────────────────────────────────────────
  describe('Username Length Boundaries (2, 3, 50, 51)', () => {
    it('boundary length 2: strictly rejects', () => {
      const inputs = ['ab', '12', 'a1', '._', '@-'];
      for (const input of inputs) {
        const res = validateUsername(input, existingUsers);
        expect(res.valid, `Expected "${input}" (len 2) to be rejected`).toBe(false);
        expect(res.error).toBe('Username must be between 3 and 50 characters');
      }
    });

    it('sub-boundary lengths 0 and 1: strictly rejects', () => {
      const inputs = ['', 'a', '1', '.', '_', '@', '-'];
      for (const input of inputs) {
        const res = validateUsername(input, existingUsers);
        expect(res.valid, `Expected "${input}" (len <= 1) to be rejected`).toBe(false);
        expect(res.error).toBe('Username must be between 3 and 50 characters');
      }
    });

    it('boundary length 3: strictly accepts valid unique usernames', () => {
      const inputs = ['abc', '123', 'a.b', 'u_1', 'x-y', 'z@w'];
      for (const input of inputs) {
        const res = validateUsername(input, existingUsers);
        expect(res.valid, `Expected "${input}" (len 3) to be accepted`).toBe(true);
        expect(res.cleanUsername).toBe(input.toLowerCase());
        expect(res.error).toBeUndefined();
      }
    });

    it('boundary length 50: strictly accepts valid unique usernames', () => {
      const inputs = [
        'a'.repeat(50),
        '1'.repeat(50),
        'a' + 'b'.repeat(48) + 'c',
        'user.' + 'x'.repeat(41) + '.end', // 5 + 41 + 4 = 50
        'test_' + '1'.repeat(41) + '_end', // 5 + 41 + 4 = 50
        'sub-' + 'a'.repeat(42) + '-rep',  // 4 + 42 + 4 = 50
      ];
      for (const input of inputs) {
        expect(input.length).toBe(50);
        const res = validateUsername(input, existingUsers);
        expect(res.valid, `Expected len 50 username "${input}" to be accepted`).toBe(true);
        expect(res.cleanUsername).toBe(input.toLowerCase());
        expect(res.cleanUsername?.length).toBe(50);
        expect(res.error).toBeUndefined();
      }
    });

    it('boundary length 51: strictly rejects', () => {
      const inputs = [
        'a'.repeat(51),
        '1'.repeat(51),
        'user.' + 'x'.repeat(42) + '.end', // 5 + 42 + 4 = 51
      ];
      for (const input of inputs) {
        expect(input.length).toBe(51);
        const res = validateUsername(input, existingUsers);
        expect(res.valid, `Expected len 51 username to be rejected`).toBe(false);
        expect(res.error).toBe('Username must be between 3 and 50 characters');
      }
    });

    it('extreme lengths (52, 100, 1000): strictly rejects', () => {
      const inputs = ['a'.repeat(52), 'x'.repeat(100), 'z'.repeat(1000)];
      for (const input of inputs) {
        const res = validateUsername(input, existingUsers);
        expect(res.valid).toBe(false);
        expect(res.error).toBe('Username must be between 3 and 50 characters');
      }
    });

    it('whitespace trimming interaction with length boundaries', () => {
      // '  ab  ' trimmed length is 2 -> reject
      expect(validateUsername('  ab  ', existingUsers)).toEqual({
        valid: false,
        error: 'Username must be between 3 and 50 characters',
      });
      // '   abc   ' trimmed length is 3 -> accept
      expect(validateUsername('   abc   ', existingUsers)).toEqual({
        valid: true,
        cleanUsername: 'abc',
      });
      // '   ' trimmed length is 0 -> reject
      expect(validateUsername('   ', existingUsers)).toEqual({
        valid: false,
        error: 'Username must be between 3 and 50 characters',
      });
      // 50 chars padded with spaces -> trimmed is 50 -> accept
      const padded50 = '   ' + 'a'.repeat(50) + '   ';
      expect(validateUsername(padded50, existingUsers)).toEqual({
        valid: true,
        cleanUsername: 'a'.repeat(50),
      });
      // 51 chars padded with spaces -> trimmed is 51 -> reject
      const padded51 = ' ' + 'a'.repeat(51) + ' ';
      expect(validateUsername(padded51, existingUsers)).toEqual({
        valid: false,
        error: 'Username must be between 3 and 50 characters',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. USERNAME REGEX VALIDATION & CHARACTER CONSTRAINTS
  // ───────────────────────────────────────────────────────────────────────────
  describe('Username Regex Validation: Allowed vs Disallowed Characters', () => {
    it('rejects forbidden symbols: !, #, $, %, *, spaces', () => {
      const forbidden = [
        'user!name',
        '!username',
        'username!',
        'user#name',
        '#hashtag',
        'user$dollar',
        'cash$flow',
        'user%pct',
        'calc%rate',
        'user*star',
        '*staruser',
        'user name',
        'first last',
      ];
      for (const input of forbidden) {
        const res = validateUsername(input, existingUsers);
        expect(res.valid, `Expected "${input}" containing invalid symbols to be rejected`).toBe(false);
        expect(res.error).toBe('Username can only contain alphanumeric characters, ., _, @, -');
      }
    });

    it('rejects broad spectrum of adversarial characters (control, unicode, punctuation)', () => {
      const adversarial = [
        'user\tname',
        'user\nname',
        'user(name)',
        'user+name',
        'user=name',
        'user[name]',
        'user{name}',
        'user/name',
        'user\\name',
        'user|name',
        'user;name',
        'user:name',
        'user\'name',
        'user"name',
        'user<name>',
        'user?name',
        'user,name',
        'user~name',
        'user`name',
        'user^name',
        'user&name',
        'user😀name',
        'пользователь',
        '用户名测试',
      ];
      for (const input of adversarial) {
        const res = validateUsername(input, existingUsers);
        expect(res.valid, `Expected "${input}" to be rejected by regex`).toBe(false);
        expect(res.error).toBe('Username can only contain alphanumeric characters, ., _, @, -');
      }
    });

    it('accepts all permitted character classes: a-z, A-Z, 0-9, ., _, @, -', () => {
      const allowed = [
        'abcdefghijklmnopqrstuvwxyz',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '0123456789',
        'user.name',
        'user_name',
        'user@domain.com',
        'user-name',
        'U.S_e-R@123',
        '.dot-start',
        'dot-end.',
        '_under-start',
        'under-end_',
        '-dash-start',
        'dash-end-',
        '@at-start',
        'at-end@',
      ];
      for (const input of allowed) {
        const res = validateUsername(input, existingUsers);
        expect(res.valid, `Expected "${input}" to be accepted`).toBe(true);
        expect(res.cleanUsername).toBe(input.toLowerCase());
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. CASE-INSENSITIVE DUPLICATE USERNAME CHECKS
  // ───────────────────────────────────────────────────────────────────────────
  describe('Case-Insensitive Duplicate Username Prevention', () => {
    it('rejects exact and case-permuted duplicates for all baseline users', () => {
      const baselinePermutations = [
        // id 1: admin
        'admin', 'ADMIN', 'Admin', 'AdMiN', 'aDmIn', 'admiN', '   ADMIN   ',
        // id 2: finance_lead
        'finance_lead', 'FINANCE_LEAD', 'Finance_Lead', 'Finance_lead', 'FiNaNcE_lEaD',
        // id 3: siliya
        'siliya', 'SILIYA', 'Siliya', 'SiLiYa', 'silIYA',
        // id 4: syama
        'syama', 'SYAMA', 'Syama', 'SyAmA',
        // id 5: anshar
        'anshar', 'ANSHAR', 'Anshar', 'AnShAr',
        // id 6: auditor
        'auditor', 'AUDITOR', 'Auditor', 'AuDiToR',
      ];

      for (const dup of baselinePermutations) {
        const res = validateUsername(dup, existingUsers);
        expect(res.valid, `Expected duplicate "${dup}" to be rejected`).toBe(false);
        expect(res.error).toBe('A user with this username already exists');
      }
    });

    it('rejects case-permutations of dynamically created users in adapter store', () => {
      const adapter = createUsersAdapter(readInitialUsers());
      adapter.createUser({
        username: 'Vikram.Singh',
        password: 'password123',
        full_name: 'Vikram Singh',
      });

      const permutations = [
        'vikram.singh',
        'VIKRAM.SINGH',
        'Vikram.Singh',
        'ViKrAm.SiNgH',
        '  VIKRAM.SINGH  ',
      ];

      for (const p of permutations) {
        const val = adapter.validateCreate({ username: p, password: 'password123' });
        expect(val.valid, `Expected dynamic user duplicate "${p}" to be rejected`).toBe(false);
        expect(val.error).toBe('A user with this username already exists');

        expect(() => {
          adapter.createUser({ username: p, password: 'password123' });
        }).toThrow('A user with this username already exists');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. PASSWORD BOUNDARY TESTING
  // ───────────────────────────────────────────────────────────────────────────
  describe('Password Boundary Testing (0-5 rejected, >=6 accepted)', () => {
    it('boundary length 0 to 5 rejected with exact error "Password must be at least 6 characters"', () => {
      const underMin = [
        undefined,
        '',
        'a',
        '12',
        'abc',
        '1234',
        '12345',
        'abcde',
        'P@ss1',
      ];

      for (const pwd of underMin) {
        const res = validatePassword(pwd);
        expect(res.valid, `Expected password "${pwd}" (len < 6) to be rejected`).toBe(false);
        expect(res.error).toBe('Password must be at least 6 characters');
      }
    });

    it('boundary length 6: strictly accepted', () => {
      const boundary6 = [
        '123456',
        'abcdef',
        'P@ssw1',
        '______',
        '......',
        '      ', // length 6 string of spaces
      ];

      for (const pwd of boundary6) {
        const res = validatePassword(pwd);
        expect(res.valid, `Expected password "${pwd}" (len 6) to be accepted`).toBe(true);
        expect(res.error).toBeUndefined();
      }
    });

    it('passwords longer than 6: strictly accepted', () => {
      const longPwds = [
        '1234567',
        'supersecretpassword',
        'P@ssw0rd!2026#Secure',
        'a'.repeat(50),
        'x'.repeat(256),
      ];

      for (const pwd of longPwds) {
        const res = validatePassword(pwd);
        expect(res.valid, `Expected password of length ${pwd.length} to be accepted`).toBe(true);
        expect(res.error).toBeUndefined();
      }
    });

    it('adapter.validateCreate and createUser enforce password validation boundary', () => {
      const adapter = createUsersAdapter(readInitialUsers());

      // Length 5 throws
      expect(() => {
        adapter.createUser({
          username: 'valid.name',
          password: '12345',
        });
      }).toThrow('Password must be at least 6 characters');

      // Length 6 succeeds
      const created = adapter.createUser({
        username: 'valid.name',
        password: '123456',
      });
      expect(created.id).toBe(7);
      expect(created.username).toBe('valid.name');
      // Password must not exist on created User interface
      expect((created as any).password).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. ROLE BOUNDARY TESTING
  // ───────────────────────────────────────────────────────────────────────────
  describe('Role Boundary Testing', () => {
    it('accepts valid roles: admin, finance, sales, viewer', () => {
      const valid = ['admin', 'finance', 'sales', 'viewer'];
      expect(VALID_ROLES).toEqual(valid);

      for (const role of valid) {
        const res = validateRole(role);
        expect(res.valid, `Expected role "${role}" to be valid`).toBe(true);
        expect(res.error).toBeUndefined();
      }
    });

    it('rejects invalid roles with exact error "Invalid role. Must be one of: admin, finance, sales, viewer"', () => {
      const invalid = [
        'ADMIN',
        'Finance',
        'Sales',
        'Viewer',
        'superadmin',
        'manager',
        'operator',
        'root',
        'guest',
        'user',
        'billing',
        '',
        ' ',
        undefined,
        null as any,
        'random_role',
        '123',
      ];

      for (const role of invalid) {
        const res = validateRole(role);
        expect(res.valid, `Expected invalid role "${role}" to be rejected`).toBe(false);
        expect(res.error).toBe('Invalid role. Must be one of: admin, finance, sales, viewer');
      }
    });

    it('adapter.validateCreate rejects invalid role with exact error message', () => {
      const adapter = createUsersAdapter(readInitialUsers());
      const val = adapter.validateCreate({
        username: 'test.role',
        password: 'password123',
        role: 'superadmin' as any,
      });
      expect(val.valid).toBe(false);
      expect(val.error).toBe('Invalid role. Must be one of: admin, finance, sales, viewer');
    });

    it('adapter.createUser throws on invalid role', () => {
      const adapter = createUsersAdapter(readInitialUsers());
      expect(() => {
        adapter.createUser({
          username: 'test.role',
          password: 'password123',
          role: 'manager' as any,
        });
      }).toThrow('Invalid role. Must be one of: admin, finance, sales, viewer');
    });

    it('adapter.updateUser throws on invalid role', () => {
      const adapter = createUsersAdapter(readInitialUsers());
      expect(() => {
        adapter.updateUser({
          id: 5,
          role: 'invalid_role' as any,
        });
      }).toThrow('Invalid role. Must be one of: admin, finance, sales, viewer');
    });

    it('canManageUsers allows only admin; canViewUserDirectory allows all 4 roles', () => {
      expect(canManageUsers('admin')).toBe(true);
      expect(canManageUsers('finance')).toBe(false);
      expect(canManageUsers('sales')).toBe(false);
      expect(canManageUsers('viewer')).toBe(false);

      expect(canViewUserDirectory('admin')).toBe(true);
      expect(canViewUserDirectory('finance')).toBe(true);
      expect(canViewUserDirectory('sales')).toBe(true);
      expect(canViewUserDirectory('viewer')).toBe(true);
      expect(canViewUserDirectory('guest' as any)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. ADVERSARIAL ORACLES & SYSTEM SAFEGUARDS
  // ───────────────────────────────────────────────────────────────────────────
  describe('System Safeguards & Security Sanitization Oracles', () => {
    it('ensures reviewCreate never exposes passwords in diffs or payload', () => {
      const adapter = createUsersAdapter(readInitialUsers());
      const review = adapter.reviewCreate({
        username: 'secure.user',
        password: 'SuperSecretPassword999!',
        full_name: 'Secure User',
        role: 'sales',
      });

      expect(review.supported).toBe(true);
      expect(review.diffs.some(d => d.field.toLowerCase().includes('password'))).toBe(false);
      expect(JSON.stringify(review.diffs)).not.toContain('SuperSecretPassword999!');
      expect((review.targetUser as any)?.password).toBeUndefined();
    });

    it('sole admin demotion oracle: blocks demoting sole admin, allows when multiple admins exist', () => {
      const adapter = createUsersAdapter(readInitialUsers());

      // Attempt demoting sole admin (id 1)
      expect(() => {
        adapter.updateUser({ id: 1, role: 'viewer' });
      }).toThrow('Cannot demote the only remaining administrator');

      // Promote user 2 to admin
      adapter.updateUser({ id: 2, role: 'admin' });
      expect(adapter.getUser(2)?.role).toBe('admin');

      // Now demoting user 1 succeeds because adminCount is 2
      const demoted1 = adapter.updateUser({ id: 1, role: 'viewer' });
      expect(demoted1.role).toBe('viewer');

      // Now attempting to demote user 2 (now the sole admin) fails
      expect(() => {
        adapter.updateUser({ id: 2, role: 'finance' });
      }).toThrow('Cannot demote the only remaining administrator');
    });

    it('deletion safeguards oracle: self-deletion, sole admin deletion, invoice-linked deletion', () => {
      const adapter = createUsersAdapter(readInitialUsers());
      const invoices = (collectflowData as any).invoices || [];

      // 1. Self deletion blocked
      const selfDel = adapter.validateDelete(1, adapter.listUsers(), invoices, 1);
      expect(selfDel.valid).toBe(false);
      expect(selfDel.error).toBe('Cannot delete your own account');

      // 2. Sole admin deletion blocked (actingAdminId is different)
      const adminDel = adapter.validateDelete(1, adapter.listUsers(), invoices, 2);
      expect(adminDel.valid).toBe(false);
      expect(adminDel.error).toBe('Cannot delete the only remaining administrator');

      // 3. User 3 (siliya) linked to invoice INV-2026-042 blocked
      const siliyaDel = adapter.validateDelete(3, adapter.listUsers(), invoices, 1);
      expect(siliyaDel.valid).toBe(false);
      expect(siliyaDel.error).toBe("Cannot delete user 'siliya' because they are referenced as sales representative on 1 invoice(s).");

      // Review delete reflects blocked state
      const reviewBlocked = adapter.reviewDelete(3, adapter.listUsers(), invoices, 1);
      expect(reviewBlocked.supported).toBe(false);
      expect(reviewBlocked.message).toContain('referenced as sales representative');

      // 4. Eligible user (user 5) can be deleted
      const reviewOk = adapter.reviewDelete(5, adapter.listUsers(), invoices, 1);
      expect(reviewOk.supported).toBe(true);
      expect(adapter.deleteUser(5)).toBe(true);
      expect(adapter.getUser(5)).toBeUndefined();
    });
  });
});
