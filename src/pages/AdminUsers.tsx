/**
 * Users, Roles & Permissions — screen 56 (Phase 8).
 *
 * User management with role-based access control and permission administration.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { ROLES } from '@/context/AuthContext';

export function AdminUsers() {
  const { hasPermission } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'users' | 'roles' | 'permissions'>('users');

  // Mock user data
  const mockUsers = [
    { id: 'U-001', name: 'Adaeze Okonkwo', email: 'adaeze.okonkwo@ecobank.com', role: 'ADMIN', status: 'Active', lastLogin: '2026-08-25' },
    { id: 'U-002', name: 'Chinwe Okafor', email: 'chinwe.okafor@ecobank.com', role: 'RISK_ANALYST', status: 'Active', lastLogin: '2026-08-25' },
    { id: 'U-003', name: 'Aminata Traoré', email: 'aminata.traore@ecobank.com', role: 'TREASURY_USER', status: 'Active', lastLogin: '2026-08-24' },
    { id: 'U-004', name: 'Yaw Boateng', email: 'yaw.boateng@ecobank.com', role: 'EXECUTIVE_VIEWER', status: 'Active', lastLogin: '2026-08-25' },
    { id: 'U-005', name: 'Fatima Bello', email: 'fatima.bello@ecobank.com', role: 'CONTROL_TESTER', status: 'Active', lastLogin: '2026-08-23' },
    { id: 'U-006', name: 'Samuel Owusu', email: 'samuel.owusu@ecobank.com', role: 'REPORTING_USER', status: 'Active', lastLogin: '2026-08-25' },
  ];

  const activeUsers = mockUsers.filter((u) => u.status === 'Active');

  return (
    <>
      <ModuleHeader
        title="Users, Roles & Permissions"
        description="User management with role-based access control and permission administration"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Total Users', value: String(mockUsers.length) },
          { label: 'Active Users', value: String(activeUsers.length), tone: 'success' },
          { label: 'Roles Defined', value: String(Object.keys(ROLES).length) },
          { label: 'Permission Categories', value: '12' },
        ]}
      />

      <div className="mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedTab('users')}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
              selectedTab === 'users' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
            }`}
          >
            Users ({mockUsers.length})
          </button>
          <button
            onClick={() => setSelectedTab('roles')}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
              selectedTab === 'roles' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
            }`}
          >
            Roles ({Object.keys(ROLES).length})
          </button>
          <button
            onClick={() => setSelectedTab('permissions')}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-colors ${
              selectedTab === 'permissions' ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy-700'
            }`}
          >
            Permissions
          </button>
        </div>
      </div>

      {selectedTab === 'users' && (
        <div className="table-datagrid-container">
          <div className="p-5 border-b border-gray-100 bg-white/50 flex justify-between items-center">
            <h3 className="font-bold text-navy-900 text-sm uppercase tracking-wider">User Directory</h3>
            <button className="rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700 transition-colors">
              Add User
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="table-datagrid">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mockUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="font-bold text-navy-900">{user.name}</td>
                    <td className="text-gray-600">{user.email}</td>
                    <td>{ROLES[user.role as keyof typeof ROLES].name}</td>
                    <td><StatusBadge status={user.status} /></td>
                    <td>{new Date(user.lastLogin).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="rounded border border-gray-200 px-3 py-1 text-[11px] font-bold text-navy-900 hover:bg-gray-50 transition-colors">
                          Edit
                        </button>
                        <button className="rounded border border-danger px-3 py-1 text-[11px] font-bold text-danger hover:bg-danger/5 transition-colors">
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTab === 'roles' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Role Definitions</h3>
            <p className="text-[11px] text-gray-400 font-medium mt-1">System roles and their associated permissions</p>
          </div>
          <div className="space-y-4">
            {Object.entries(ROLES).map(([code, role]) => (
              <div key={code} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[12px] font-bold text-navy-900">{role.name}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">{code}</p>
                  </div>
                  <span className="px-2 py-0.5 bg-navy-100 text-navy900 rounded text-[10px] font-bold">
                    {role.permissions.length} permissions
                  </span>
                </div>
                <p className="text-[11px] text-gray-600">{role.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {role.permissions.slice(0, 5).map((permission) => (
                    <span key={permission} className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">
                      {permission}
                    </span>
                  ))}
                  {role.permissions.length > 5 && (
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">
                      +{role.permissions.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTab === 'permissions' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Permission Matrix</h3>
            <p className="text-[11px]] text-gray-400 font-medium mt-1">Permission assignments by role</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-2.5 px-3 font-bold">Permission</th>
                  {Object.values(ROLES).map((role) => (
                    <th key={role.code} className="py-2.5 px-3 font-bold">{role.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  'dashboard.view', 'risk.view', 'treasury.view', 'reporting.view', 'data.view', 'admin.manage', 'group.manage', 'data.configure', 'risk.configure', 'rules.edit', 'run.execute', 'reporting.generate', 'approvals.approve', 'audit.view',
                ].slice(0, 8).map((permission) => (
                  <tr key={permission} className="border-b border-gray-50 py-2 px-3 text-[13px] text-gray-700 font-medium">
                    <td className="font-mono text-[11px]">{permission}</td>
                    {Object.values(ROLES).map((role) => (
                      <td key={role.code} className="text-center">
                        {role.permissions.includes(permission) ? (
                          <span className="text-gold-500">✓</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}