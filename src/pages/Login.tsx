/**
 * Demo sign-in.
 *
 * Six seeded accounts, one per role, so the role model can be demonstrated
 * by switching between them. Real authentication (MFA via otplib, Azure AD
 * SSO via MSAL) is implemented in v1 and is out of scope here — see build
 * plan §15.
 */

import { useState } from 'react';
import { ROLES, useAuth } from '@/context/AuthContext';
import type { RoleCode, User } from '@/engine/types';

const DEMO_ACCOUNTS: Array<Pick<User, 'id' | 'name' | 'email' | 'role' | 'affiliateCode'>> = [
  { id: 'U-001', name: 'Adaeze Okonkwo', email: 'adaeze.okonkwo@ecobank.com', role: 'ADMIN', affiliateCode: 'GROUP' },
  { id: 'U-002', name: 'Chinwe Okafor', email: 'chinwe.okafor@ecobank.com', role: 'RISK_ANALYST', affiliateCode: 'NG' },
  {
    id: 'U-003',
    name: 'Aminata Traoré',
    email: 'aminata.traore@ecobank.com',
    role: 'TREASURY_USER',
    affiliateCode: 'CI',
  },
  {
    id: 'U-004',
    name: 'Yaw Boateng',
    email: 'yaw.boateng@ecobank.com',
    role: 'EXECUTIVE_VIEWER',
    affiliateCode: 'GROUP',
  },
  { id: 'U-005', name: 'Fatima Bello', email: 'fatima.bello@ecobank.com', role: 'CONTROL_TESTER', affiliateCode: 'NG' },
  { id: 'U-006', name: 'Samuel Owusu', email: 'samuel.owusu@ecobank.com', role: 'REPORTING_USER', affiliateCode: 'GH' },
];

export function Login() {
  const { login } = useAuth();
  const [selected, setSelected] = useState<RoleCode>('RISK_ANALYST');

  const account = DEMO_ACCOUNTS.find((a) => a.role === selected) ?? DEMO_ACCOUNTS[0]!;

  const handleSignIn = () => {
    login({
      ...account,
      isActive: true,
      mfaEnrolled: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-900 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-[20px] font-bold text-navy-900">Ascent ALM Platform</h1>
        <p className="mt-1 text-[12px] text-gray-500">Asset &amp; Liability Management · Ecobank Group</p>

        <fieldset className="mt-6">
          <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Sign in as</legend>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((a) => (
              <div
                key={a.role}
                className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                  selected === a.role ? 'border-navy-700 bg-navy-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  id={`role-${a.role}`}
                  type="radio"
                  name="role"
                  value={a.role}
                  checked={selected === a.role}
                  onChange={() => setSelected(a.role)}
                  className="mt-0.5 accent-gold-500"
                />
                <label htmlFor={`role-${a.role}`} className="cursor-pointer">
                  <span className="block text-[12px] font-bold text-navy-900">{ROLES[a.role].name}</span>
                  <span className="block text-[11px] leading-relaxed text-gray-500">{ROLES[a.role].description}</span>
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSignIn}
          className="mt-6 w-full rounded-lg bg-navy-900 py-2.5 text-[13px] font-bold text-white hover:bg-navy-700"
        >
          Sign in as {account.name}
        </button>

        <p className="mt-4 text-[10px] leading-relaxed text-gray-400">
          Demo accounts. Real MFA and Azure AD SSO are implemented in the microservices build and are deliberately out
          of scope here.
        </p>
      </div>
    </main>
  );
}
