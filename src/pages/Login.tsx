/**
 * Demo sign-in adapted from ecobank-alm-platform design.
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
  const [password, setPassword] = useState('password123');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const account = DEMO_ACCOUNTS.find((a) => a.role === selected) ?? DEMO_ACCOUNTS[0]!;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    login({
      ...account,
      isActive: true,
      mfaEnrolled: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });
    setIsSubmitting(false);
  };

  return (
    <div className="flex h-screen bg-gray-50 w-full font-sans">
      {/* Left Panel */}
      <div className="w-[40%] bg-navy-900 flex flex-col justify-between p-12 text-white">
        <div>
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                <span className="text-[24px] font-bold text-gold-500">E</span>
              </div>
              <div>
                <h1 className="text-[20px] font-bold tracking-wide">Ecobank</h1>
                <p className="text-[12px] text-white/60">ALM Platform</p>
              </div>
            </div>
          </div>
          <p className="text-gold-400 text-sm tracking-wide uppercase">Group Asset & Liability Management</p>
          <div className="h-1 w-10 bg-gold-500 mt-6 mb-12 rounded-full"></div>

          <div className="space-y-6">
            {[
              "Group-Wide Liquidity Risk & IRRBB Monitoring",
              "Basel III-Aligned Stress Testing & Scenario Analysis",
              "Regulatory-Grade Audit Trails & Segregation of Duties",
            ].map((feature, i) => (
              <div key={i} className="flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gold-500 mr-3 shrink-0 mt-0.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p className="text-gray-200 text-sm leading-relaxed">{feature}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500">Powered by Qucoon Limited</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col justify-center items-center p-12 relative overflow-y-auto">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-10 my-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-navy-900 mb-2">Sign In</h2>
            <p className="text-sm text-gray-500">Ascent ALM Platform — Ecobank Group</p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Sign in as</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ROLES).map(([roleCode, role]) => (
                <button
                  key={roleCode}
                  type="button"
                  onClick={() => setSelected(roleCode as RoleCode)}
                  className={
                    selected === roleCode
                      ? "px-3 py-2 rounded-md text-xs font-bold bg-navy-900 text-white text-left transition-all"
                      : "px-3 py-2 rounded-md text-xs font-bold bg-gray-50 text-gray-600 text-left border border-gray-200 hover:border-navy-900/30 transition-all"
                  }
                >
                  {role.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">{ROLES[selected].description}</p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <input
                type="email"
                value={account.email}
                readOnly
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all text-gray-700"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <a href="#" className="text-xs text-gold-600 hover:underline">Forgot password?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all tracking-wider"
                required
              />
            </div>

            <div className="flex items-center">
              <input type="checkbox" id="remember" defaultChecked className="h-4 w-4 text-gold-500 focus:ring-gold-500 border-gray-300 rounded" />
              <label htmlFor="remember" className="ml-2 block text-sm text-gray-600">
                Remember this device
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-navy-900 hover:bg-navy-800 text-white font-medium rounded-md shadow hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-navy-900 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Signing In…' : `Sign In as ${ROLES[selected].name}`}
            </button>
          </form>

          <div className="mt-6 flex items-start p-3 bg-warning-bg rounded border border-warning/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-warning mr-2 shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs text-warning-700 font-medium">Multi-factor authentication required on first sign-in.</p>
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 pb-4">
          <p>© 2026 Ecobank Group. All rights reserved.</p>
          <p>Aligned with Basel III / IRRBB regulatory standards across all affiliate markets.</p>
        </div>
      </div>
    </div>
  );
}
