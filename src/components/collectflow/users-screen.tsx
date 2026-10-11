import { useState } from 'react';
import {
  Users,
  ShieldCheck,
  Briefcase,
  TrendingUp,
  Eye,
  Search,
  SlidersHorizontal,
  Plus,
  Info,
  LockKeyhole,
  ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterChoice, EmptyState } from './controls';
import { useMockSession } from './session';
import { UserDrawer, type UserDrawerMode } from './user-drawer';
import { type User, type Role, canManageUsers } from '@/data/users';

export interface UsersScreenProps {
  container?: HTMLElement | null | undefined;
  empty?: boolean | undefined;
}

export function UsersScreen({ container, empty = false }: UsersScreenProps) {
  const { role, users, demo } = useMockSession();
  const isAdmin = canManageUsers(role);

  // Search & Filter state
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [sort, setSort] = useState<'name' | 'username' | 'role' | 'date'>('name');
  const [asc, setAsc] = useState(true);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<UserDrawerMode>('create');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Active user list
  const activeUsers = empty ? [] : users;

  // KPI Metrics calculation
  const totalUsersCount = activeUsers.length;
  const adminCount = activeUsers.filter(u => u.role === 'admin').length;
  const financeCount = activeUsers.filter(u => u.role === 'finance').length;
  const salesCount = activeUsers.filter(u => u.role === 'sales').length;
  const viewerCount = activeUsers.filter(u => u.role === 'viewer').length;

  // Filter users by search query and role filter
  const filtered = activeUsers.filter(user => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      user.username.toLowerCase().includes(q) ||
      user.full_name.toLowerCase().includes(q);
    const matchesRole =
      roleFilter === 'All roles' || user.role === roleFilter;
    return matchesQuery && matchesRole;
  });

  // Sort users
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sort === 'name') {
      cmp = a.full_name.localeCompare(b.full_name);
    } else if (sort === 'username') {
      cmp = a.username.localeCompare(b.username);
    } else if (sort === 'role') {
      cmp = a.role.localeCompare(b.role);
    } else if (sort === 'date') {
      cmp = a.created_at.localeCompare(b.created_at);
    }
    return asc ? cmp : -cmp;
  });

  function toggleSort(field: typeof sort) {
    if (sort === field) {
      setAsc(!asc);
    } else {
      setSort(field);
      setAsc(true);
    }
  }

  function resetFilters() {
    setQuery('');
    setRoleFilter('All roles');
    setSort('name');
    setAsc(true);
  }

  function handleCreate() {
    setSelectedUser(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  }

  function handleEdit(userToEdit: User) {
    setSelectedUser(userToEdit);
    setDrawerMode('update');
    setDrawerOpen(true);
  }

  function handleDelete(userToDelete: User) {
    setSelectedUser(userToDelete);
    setDrawerMode('delete');
    setDrawerOpen(true);
  }

  function getRoleBadgeProps(userRole: Role) {
    switch (userRole) {
      case 'admin':
        return {
          label: 'Admin',
          style: {
            backgroundColor: 'color-mix(in oklch, var(--primary) 14%, var(--card))',
            color: 'var(--primary)',
            border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)',
          },
        };
      case 'finance':
        return {
          label: 'Finance',
          style: {
            backgroundColor: 'oklch(0.93 0.05 160)',
            color: 'oklch(0.35 0.1 160)',
            border: '1px solid oklch(0.85 0.08 160)',
          },
        };
      case 'sales':
        return {
          label: 'Sales',
          style: {
            backgroundColor: 'oklch(0.93 0.05 220)',
            color: 'oklch(0.35 0.1 220)',
            border: '1px solid oklch(0.85 0.08 220)',
          },
        };
      case 'viewer':
        return {
          label: 'Viewer',
          style: {
            backgroundColor: 'var(--muted)',
            color: 'var(--muted-foreground)',
            border: '1px solid var(--border)',
          },
        };
    }
  }

  return (
    <section className="cf-users-section" data-testid="users-screen">
      {/* Top Header with Title and "New User" Action */}
      <header className="cf-section-header" style={{ marginBottom: 20 }}>
        <div>
          <h2>User Directory & Administration</h2>
          <p className="cf-muted" style={{ fontSize: 13, marginTop: 4 }}>
            System accounts, assigned security roles, and access management for CollectFlow.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isAdmin ? (
            <Button onClick={handleCreate} aria-label="New User" data-testid="btn-new-user">
              <Plus size={16} /> New User
            </Button>
          ) : (
            <Button
              disabled
              title="Viewing mode: User administration is restricted to Administrators. Role permissions are enforced."
              aria-label="New User (disabled in viewing mode)"
              data-testid="btn-new-user-disabled"
            >
              <Plus size={16} /> New User
            </Button>
          )}
        </div>
      </header>

      {/* Non-Admin Viewing Mode Banner */}
      {!isAdmin && (
        <div
          className="cf-viewing-banner cf-lock-note"
          data-testid="users-viewing-banner"
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            backgroundColor: 'var(--accent)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            marginBottom: 20,
            fontSize: 13,
            color: 'var(--foreground)',
          }}
        >
          <Info size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span>
            Viewing mode: User administration is restricted to Administrators. Role permissions are enforced.
          </span>
        </div>
      )}

      {/* KPI Metrics Summary (Total Users, Admins, Finance, Sales, Viewers) */}
      <div
        className="cf-metrics"
        data-testid="users-kpis"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div className="cf-metric" data-testid="metric-total-users">
          <div>
            <span>Total Users</span>
            <Users size={16} />
          </div>
          <strong>{totalUsersCount}</strong>
          <small>Active user accounts</small>
        </div>

        <div className="cf-metric" data-testid="metric-admins">
          <div>
            <span>Admins</span>
            <ShieldCheck size={16} />
          </div>
          <strong>{adminCount}</strong>
          <small>System administrators</small>
        </div>

        <div className="cf-metric" data-testid="metric-finance">
          <div>
            <span>Finance</span>
            <Briefcase size={16} />
          </div>
          <strong>{financeCount}</strong>
          <small>Financial managers</small>
        </div>

        <div className="cf-metric" data-testid="metric-sales">
          <div>
            <span>Sales</span>
            <TrendingUp size={16} />
          </div>
          <strong>{salesCount}</strong>
          <small>Sales representatives</small>
        </div>

        <div className="cf-metric" data-testid="metric-viewers">
          <div>
            <span>Viewers</span>
            <Eye size={16} />
          </div>
          <strong>{viewerCount}</strong>
          <small>Auditors & observers</small>
        </div>
      </div>

      {/* Search & Role Filters Toolbar */}
      <div className="cf-table-tools" style={{ marginBottom: 18 }}>
        <div className="cf-table-search">
          <Search size={17} />
          <Input
            aria-label="Search users by name or username"
            placeholder="Search full name or username…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <FilterChoice
          label="Role filter"
          value={roleFilter}
          options={['All roles', 'admin', 'finance', 'sales', 'viewer']}
          onChange={setRoleFilter}
        />

        <div />

        <Button
          variant="outline"
          size="icon"
          title="Reset filters"
          aria-label="Reset filters"
          onClick={resetFilters}
        >
          <SlidersHorizontal size={16} />
        </Button>
      </div>

      {/* Mobile Sort Control */}
      <div className="cf-sort-mobile" style={{ marginBottom: 14 }}>
        <FilterChoice
          label="Sort users"
          value={sort}
          options={['name', 'username', 'role', 'date']}
          onChange={val => setSort(val as typeof sort)}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Reverse sort direction"
          onClick={() => setAsc(!asc)}
        >
          <ArrowUpDown size={15} />
        </Button>
      </div>

      {/* User Directory Content */}
      {sorted.length > 0 ? (
        <>
          {/* Desktop & Tablet Table Layout (> 600px) */}
          <div className="cf-table-container" data-testid="users-table-container">
            <table className="cf-table cf-users-table" data-testid="users-table">
              <thead>
                <tr>
                  <th aria-sort={sort === 'name' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => toggleSort('name')}>
                      User <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th aria-sort={sort === 'role' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => toggleSort('role')}>
                      Role <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th aria-sort={sort === 'date' ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <Button variant="ghost" onClick={() => toggleSort('date')}>
                      Created Date <ArrowUpDown size={13} />
                    </Button>
                  </th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(u => {
                  const badge = getRoleBadgeProps(u.role);
                  return (
                    <tr key={u.id} data-testid={`user-row-${u.id}`}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            className="cf-avatar"
                            style={{
                              width: 30,
                              height: 30,
                              fontSize: 11,
                              backgroundColor: 'var(--accent)',
                              color: 'var(--primary)',
                            }}
                          >
                            {u.full_name
                              ? u.full_name.split(' ').map(n => n[0]).join('')
                              : u.username.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong style={{ display: 'block', fontSize: 13 }}>{u.full_name}</strong>
                            <small className="cf-muted" style={{ fontSize: 11 }}>
                              @{u.username} · ID: {u.id}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`cf-status cf-role-${u.role}`}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '3px 9px',
                            borderRadius: 4,
                            display: 'inline-block',
                            ...badge.style,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                          {u.created_at}
                        </span>
                      </td>
                      <td>
                        <span className="cf-status paid">Active</span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isAdmin ? (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit role for ${u.username}`}
                              onClick={() => handleEdit(u)}
                            >
                              Edit Role
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Delete user ${u.username}`}
                              onClick={() => handleDelete(u)}
                              style={{ color: 'var(--destructive)' }}
                            >
                              Delete
                            </Button>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              title="Viewing mode: User administration is restricted to Administrators"
                              aria-label={`Edit role for ${u.username} (disabled)`}
                            >
                              Edit Role
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              title="Viewing mode: User administration is restricted to Administrators"
                              aria-label={`Delete user ${u.username} (disabled)`}
                            >
                              Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards Layout (<= 600px) */}
          <div className="cf-mobile-cards" data-testid="users-mobile-cards">
            {sorted.map(u => {
              const badge = getRoleBadgeProps(u.role);
              return (
                <article className="cf-record-card" key={u.id} data-testid={`user-card-${u.id}`}>
                  <header
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 14 }}>{u.full_name}</strong>
                      <small style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: 11, marginTop: 2 }}>
                        @{u.username} · ID: {u.id}
                      </small>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span
                        className={`cf-status cf-role-${u.role}`}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 4,
                          ...badge.style,
                        }}
                      >
                        {badge.label}
                      </span>
                      <span className="cf-status paid" style={{ fontSize: 10, padding: '2px 6px' }}>
                        Active
                      </span>
                    </div>
                  </header>

                  <dl>
                    <div>
                      <dt>Created Date</dt>
                      <dd>{u.created_at}</dd>
                    </div>
                    <div>
                      <dt>Account ID</dt>
                      <dd>#{u.id}</dd>
                    </div>
                  </dl>

                  <footer>
                    {isAdmin ? (
                      <div style={{ display: 'flex', gap: 6, width: '100%', justifyContent: 'flex-end' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Edit role for ${u.username}`}
                          onClick={() => handleEdit(u)}
                        >
                          Edit Role
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete user ${u.username}`}
                          onClick={() => handleDelete(u)}
                          style={{ color: 'var(--destructive)' }}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span
                        className="cf-muted"
                        style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <LockKeyhole size={12} /> Viewing mode
                      </span>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>

          <footer className="cf-table-footer">
            <span>
              Showing {sorted.length} of {activeUsers.length} users
            </span>
          </footer>
        </>
      ) : (
        <EmptyState type="empty" onReset={resetFilters} />
      )}

      {/* User Drawer Modal Dialog */}
      {drawerOpen && (
        <UserDrawer
          mode={drawerMode}
          user={selectedUser}
          container={container}
          close={() => {
            setDrawerOpen(false);
            setSelectedUser(null);
          }}
        />
      )}
    </section>
  );
}

export default UsersScreen;
