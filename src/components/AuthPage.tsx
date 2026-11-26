import React, { useState } from 'react';
import { 
  ShieldCheck, User, Mail, Lock, Eye, EyeOff, 
  ArrowRight, AlertCircle, Building2, Cloud, CloudOff, 
  RefreshCw
} from 'lucide-react';
import { registerUserAccount, loginUser } from '../utils/auth';
import { isSupabaseConfigured } from '../utils/supabase';
import { UserSession, BusinessProfile } from '../types';

interface AuthPageProps {
  onAuthSuccess: (session: UserSession, profile?: BusinessProfile | null) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userConfirmPassword, setUserConfirmPassword] = useState('');

  const hasCloud = isSupabaseConfigured();

  // Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { session, profile } = await loginUser(loginEmail, loginPassword);
      onAuthSuccess(session, profile);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Register submission
  const handleRegisterAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!userName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!userEmail.trim()) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (userPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (userPassword !== userConfirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const { session } = await registerUserAccount(userName, userEmail, userPassword);
      onAuthSuccess(session, null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.06)] overflow-hidden">
        {/* Brand Header */}
        <div className="bg-slate-900 text-white p-6 sm:p-8 text-center relative border-b border-slate-800">
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center font-extrabold text-2xl text-white shadow-md ring-1 ring-blue-500/30 mb-3">
              G
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight font-heading">GoGST Bill</h1>
              <span className="text-[10px] font-bold text-blue-400 bg-blue-950/80 border border-blue-800/80 px-1.5 py-0.5 rounded">
                ENTERPRISE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 max-w-sm">
              Indian GST Invoicing, Inward Purchases &amp; Stock Ledger Platform
            </p>

            {/* Cloud Sync Status Indicator Pill */}
            <div className="flex items-center gap-2 mt-3">
              <div className={`flex items-center gap-2 text-[11px] font-medium px-3 py-1 rounded-full border ${
                hasCloud 
                  ? 'text-emerald-300 bg-emerald-950/70 border-emerald-800/80' 
                  : 'text-slate-300 bg-slate-800/80 border-slate-700/80'
              }`}>
                {hasCloud ? (
                  <>
                    <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Cloud Sync Active • Multi-Device Ready</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3.5 h-3.5 text-amber-400" />
                    <span>100% Offline • Local Database</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50/70 p-1.5">
          <button
            type="button"
            onClick={() => { setActiveTab('LOGIN'); setErrorMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'LOGIN'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Sign In to Existing Account
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('REGISTER'); setErrorMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'REGISTER'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Create New Account &amp; Business
          </button>
        </div>

        <div className="p-6 sm:p-8">
          {/* Error Notice */}
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tab 1: SIGN IN FORM */}
          {activeTab === 'LOGIN' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-heading">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-heading">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.985] flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('REGISTER')}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  New business? Register your account in 1 minute &rarr;
                </button>
              </div>
            </form>
          )}

          {/* Tab 2: REGISTER FORM */}
          {activeTab === 'REGISTER' && (
            <form onSubmit={handleRegisterAccountSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-heading">
                  Your Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chirag Sharma"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-heading">
                  Your Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. chirag@mybusiness.com"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-heading">
                    Password (Min 6 chars) *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-heading">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={userConfirmPassword}
                    onChange={(e) => setUserConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.985] flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-4 h-4 text-white" />
                    <span>Continue to Business Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('LOGIN')}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  Already have an account? Sign In &rarr;
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-100 p-4 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Offline-First Engine • {hasCloud ? 'Supabase Cloud Sync Active' : 'Private Local Database'}</span>
        </div>
      </div>
    </div>
  );
};
