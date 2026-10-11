import { describe, it, expect, beforeEach } from 'vitest';
import {
  INITIAL_USERS,
  readInitialUsers,
  createUsersAdapter,
  validateDelete,
  validateUpdate,
  validateUsername,
  validatePassword,
  validateRole,
  canManageUsers,
  canViewUserDirectory,
  type User,
  type Role,
  type UserCreateInput,
  type UserUpdateInput,
  type UserAdapter,
} from '@/data/users';
import collectflowData from '@/data/collectflow.json';

describe('Adversarial Business Safeguards & Empirical Stress Suite (Challenger 2)', () => {
  let adapter: UserAdapter;
  let baselineUsers: User[];
  const invoices = (collectflowData as any).invoices || [];

  beforeEach(() => {
    baselineUsers = readInitialUsers();
    adapter = createUsersAdapter(baselineUsers);
  });

  // ─── 1. SELF-DELETION BLOCKING ─────────────────────────────────────────────
  describe('1. Self-Deletion Safeguard (Acting Admin id: 1)', () => {
    it('strictly blocks self-deletion when target userId equals actingAdminId', () => {
      const res = validateDelete(1, baselineUsers, invoices, 1);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Cannot delete your own account');
    });

    it('reviewDelete reports supported: false and returns self-deletion message', () => {
      const review = adapter.reviewDelete(1, adapter.listUsers(), invoices, 1);
      expect(review.supported).toBe(false);
      expect(review.message).toBe('Cannot delete your own account');
      expect(review.diffs).toHaveLength(0);
    });

    it('leaves user store intact when self-deletion is evaluated', () => {
      const initialCount = adapter.listUsers().length;
      adapter.reviewDelete(1, adapter.listUsers(), invoices, 1);
      expect(adapter.listUsers().length).toBe(initialCount);
      expect(adapter.getUser(1)?.username).toBe('admin');
    });
  });

  // ─── 2. SOLE ADMIN DELETION BLOCKING ───────────────────────────────────────
  describe('2. Sole Administrator Deletion Safeguard', () => {
    it('strictly blocks deleting the sole remaining administrator (even if actingAdminId != userId)', () => {
      const res = validateDelete(1, baselineUsers, invoices, 2);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Cannot delete the only remaining administrator');
    });

    it('allows deleting an admin when multiple administrators exist and target has no invoices', () => {
      // Promote user 2 to admin
      const multiAdminUsers = readInitialUsers();
      multiAdminUsers.find(u => u.id === 2)!.role = 'admin';
      expect(multiAdminUsers.filter(u => u.role === 'admin').length).toBe(2);

      const res = validateDelete(2, multiAdminUsers, invoices, 1);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('re-engages sole admin deletion safeguard immediately once admin count returns to 1', () => {
      const multiAdminUsers = readInitialUsers();
      multiAdminUsers.find(u => u.id === 2)!.role = 'admin';
      const multiAdapter = createUsersAdapter(multiAdminUsers);

      // Delete admin 2
      multiAdapter.deleteUser(2);
      expect(multiAdapter.listUsers().filter(u => u.role === 'admin').length).toBe(1);

      // Now attempting to delete admin 1 must fail
      const res = validateDelete(1, multiAdapter.listUsers(), invoices, 3);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Cannot delete the only remaining administrator');
    });
  });

  // ─── 3. SOLE ADMIN DEMOTION BLOCKING ───────────────────────────────────────
  describe('3. Sole Administrator Demotion Safeguard', () => {
    it('strictly blocks demoting the sole administrator to finance, sales, or viewer', () => {
      const roles: Role[] = ['finance', 'sales', 'viewer'];
      for (const targetRole of roles) {
        const res = validateUpdate(1, targetRole, baselineUsers);
        expect(res.valid).toBe(false);
        expect(res.error).toBe('Cannot demote the only remaining administrator');
      }
    });

    it('permits non-role updates on the sole administrator (e.g. full_name update)', () => {
      const res = validateUpdate(1, undefined, baselineUsers);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('allows demoting an admin when quorum is preserved by another admin', () => {
      const multiAdminUsers = readInitialUsers();
      multiAdminUsers.find(u => u.id === 4)!.role = 'admin';
      expect(multiAdminUsers.filter(u => u.role === 'admin').length).toBe(2);

      // Demoting user 1 is now allowed
      const res = validateUpdate(1, 'finance', multiAdminUsers);
      expect(res.valid).toBe(true);

      // After user 1 is demoted, user 4 becomes sole admin and cannot be demoted
      const multiAdapter = createUsersAdapter(multiAdminUsers);
      multiAdapter.updateUser({ id: 1, role: 'finance' });
      expect(multiAdapter.listUsers().filter(u => u.role === 'admin').length).toBe(1);

      const res4 = validateUpdate(4, 'sales', multiAdapter.listUsers());
      expect(res4.valid).toBe(false);
      expect(res4.error).toBe('Cannot demote the only remaining administrator');
    });
  });

  // ─── 4. HISTORICAL INVOICE REFERENCE BLOCKING (NEHA RAO ID: 3) ──────────────
  describe('4. Historical Invoice Reference Safeguard on Neha Rao (id: 3)', () => {
    it('identifies invoice INV-2026-042 linked to user 3 (siliya / Neha Rao)', () => {
      const nehaInvoices = invoices.filter((inv: any) => inv.executive_id === 3 && (inv.order_type !== 'PO' || inv.invoice_number));
      expect(nehaInvoices).toHaveLength(1);
      expect(nehaInvoices[0].invoice_number).toBe('INV-2026-042');
    });

    it('strictly blocks deletion of Neha Rao with exact invoice reference error', () => {
      const res = validateDelete(3, baselineUsers, invoices, 1);
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Cannot delete user 'siliya' because they are referenced as sales representative on 1 invoice(s).");
    });

    it('reviewDelete reports supported: false and returns explanatory message', () => {
      const review = adapter.reviewDelete(3, adapter.listUsers(), invoices, 1);
      expect(review.supported).toBe(false);
      expect(review.message).toContain("referenced as sales representative on 1 invoice(s)");
    });

    it('handles multiple invoice references correctly in error message pluralization', () => {
      const mockInvoices = [
        { id: 101, invoice_number: 'INV-A', executive_id: 3 },
        { id: 102, invoice_number: 'INV-B', executive_id: 3 },
        { id: 103, invoice_number: 'INV-C', executive_id: 3 },
        { id: 104, invoice_number: 'INV-D', executive_id: 3 },
      ];
      const res = validateDelete(3, baselineUsers, mockInvoices, 1);
      expect(res.valid).toBe(false);
      expect(res.error).toBe("Cannot delete user 'siliya' because they are referenced as sales representative on 4 invoice(s).");
    });

    it('distinguishes unbilled purchase orders from issued invoices (PO without invoice_number does not block)', () => {
      // User 4 (syama / Kavya Nair) has 1 unbilled PO but 0 issued invoices
      const syamaIssuedInvoices = invoices.filter((inv: any) => inv.executive_id === 4 && (inv.order_type !== 'PO' || inv.invoice_number));
      expect(syamaIssuedInvoices).toHaveLength(0);

      const res = validateDelete(4, baselineUsers, invoices, 1);
      expect(res.valid).toBe(true);
    });

    it('permits deleting user 5 (anshar / Arjun Mehta) with zero invoice references', () => {
      const res = validateDelete(5, baselineUsers, invoices, 1);
      expect(res.valid).toBe(true);
    });
  });

  // ─── 5. UNLINKED USER DELETION INTEGRITY ────────────────────────────────────
  describe('5. Unlinked User Deletion Blast Radius', () => {
    it('deletes unlinked user cleanly without affecting remaining user records', () => {
      const initialCount = adapter.listUsers().length;
      const success = adapter.deleteUser(5);
      expect(success).toBe(true);

      const remaining = adapter.listUsers();
      expect(remaining.length).toBe(initialCount - 1);
      expect(remaining.map(u => u.id)).toEqual([1, 2, 3, 4, 6]);
      expect(adapter.getUser(5)).toBeUndefined();

      // Ensure other users retain exact properties
      expect(adapter.getUser(1)?.username).toBe('admin');
      expect(adapter.getUser(2)?.username).toBe('finance_lead');
      expect(adapter.getUser(3)?.username).toBe('siliya');
      expect(adapter.getUser(4)?.username).toBe('syama');
      expect(adapter.getUser(6)?.username).toBe('auditor');
    });
  });

  // ─── 6. ZERO STATE MUTATION AFTER 50 CONSECUTIVE BLOCKED OPERATIONS ───────
  describe('6. Zero State Mutation After 50 Adversarial Blocked Operations', () => {
    it('maintains 100% byte-for-byte user store integrity after 50 rejected operations', () => {
      const baselineJson = JSON.stringify(adapter.listUsers());

      // 1. 10 blocked self-deletions
      for (let i = 0; i < 10; i++) {
        const rev = adapter.reviewDelete(1, adapter.listUsers(), invoices, 1);
        expect(rev.supported).toBe(false);
      }

      // 2. 10 blocked sole admin demotions
      for (let i = 0; i < 10; i++) {
        const rev = adapter.reviewUpdate({ id: 1, role: 'sales' }, adapter.listUsers());
        expect(rev.supported).toBe(false);
      }

      // 3. 10 blocked invoice-linked deletions on Neha Rao
      for (let i = 0; i < 10; i++) {
        const rev = adapter.reviewDelete(3, adapter.listUsers(), invoices, 1);
        expect(rev.supported).toBe(false);
      }

      // 4. 10 blocked duplicate username creations (case variations)
      const duplicateNames = ['ADMIN', 'Admin', 'siliya', 'SILIYA', 'finance_lead', 'FINANCE_LEAD', 'syama', 'anshar', 'auditor', 'AUDITOR'];
      for (const dup of duplicateNames) {
        const rev = adapter.reviewCreate({ username: dup, password: 'password123' }, adapter.listUsers());
        expect(rev.supported).toBe(false);
      }

      // 5. 10 blocked short password creations
      for (let i = 0; i < 10; i++) {
        const rev = adapter.reviewCreate({ username: `valid_user_${i}`, password: '123' }, adapter.listUsers());
        expect(rev.supported).toBe(false);
      }

      const postStressJson = JSON.stringify(adapter.listUsers());
      expect(postStressJson).toBe(baselineJson);
      expect(adapter.listUsers().length).toBe(6);
    });
  });

  // ─── 7. PASSWORD SANITIZATION & LEAK PREVENTION ORACLE ─────────────────────
  describe('7. Password Sanitization & Sensitive Credential Leak Prevention', () => {
    it('strictly purges password from reviewCreate diffs and review object', () => {
      const secret = 'AdversarialSuperSecretPassword#2026!';
      const input: UserCreateInput = {
        username: 'sanitized.rep',
        password: secret,
        full_name: 'Sanitized Rep',
        role: 'sales',
      };

      const review = adapter.reviewCreate(input);
      expect(review.supported).toBe(true);

      // Verify diffs contain no password field or value
      const hasPasswordInDiffs = review.diffs.some(
        d => d.field.toLowerCase().includes('password') || d.current.includes(secret) || d.previous.includes(secret),
      );
      expect(hasPasswordInDiffs).toBe(false);

      // Verify created User entity contains no credential metadata
      const createdUser = adapter.createUser(input);
      const userKeys = Object.keys(createdUser);
      expect(userKeys).toEqual(['id', 'username', 'full_name', 'role', 'created_at']);
      expect(JSON.stringify(createdUser).includes(secret)).toBe(false);
      expect(JSON.stringify(adapter.listUsers()).includes(secret)).toBe(false);
    });
  });

  // ─── 8. RBAC PERMISSIONS MATRIX ──────────────────────────────────────────
  describe('8. Role-Based Access Control Permissions Matrix', () => {
    it('enforces canManageUsers strictly for admin role only', () => {
      expect(canManageUsers('admin')).toBe(true);
      expect(canManageUsers('finance')).toBe(false);
      expect(canManageUsers('sales')).toBe(false);
      expect(canManageUsers('viewer')).toBe(false);
    });

    it('enforces canViewUserDirectory for all 4 valid roles', () => {
      expect(canViewUserDirectory('admin')).toBe(true);
      expect(canViewUserDirectory('finance')).toBe(true);
      expect(canViewUserDirectory('sales')).toBe(true);
      expect(canViewUserDirectory('viewer')).toBe(true);
      expect(canViewUserDirectory('unknown' as any)).toBe(false);
    });
  });
});
