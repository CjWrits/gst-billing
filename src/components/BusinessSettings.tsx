import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Building2, Download, Upload, FileSpreadsheet, 
  CheckCircle2, AlertCircle, User as UserIcon, LogOut,
  Key, ShieldCheck, Eye, EyeOff, RefreshCw, Check
} from 'lucide-react';
import { db, clearAllUserData } from '../db/database';
import { UserSession } from '../types';
import { 
  exportGstr1B2BCsv, exportGstr1B2CCsv, exportHsnSummaryCsv, 
  exportDatabaseBackup, restoreDatabaseFromJson 
} from '../utils/gstrExport';
import { fetchGstinDetails } from '../utils/gstinLookup';
import { BusinessRegistration } from './BusinessRegistration';

interface BusinessSettingsProps {
  session: UserSession;
  onLogout: () => void;
}

export const BusinessSettings: React.FC<BusinessSettingsProps> = ({ session, onLogout }) => {
  const profileRecord = useLiveQuery(
    () => db.businessProfile.where('userId').equals(session.userId).first(), 
    [session.userId]
  );
  
  const documents = useLiveQuery(
    () => db.documents.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  const [restoreMessage, setRestoreMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Private GSTIN API Key management (stored locally in browser, never compiled into bundle)
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem('gogst_gstin_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiSaveSuccess, setApiSaveSuccess] = useState(false);
  const [apiTestStatus, setApiTestStatus] = useState<{ loading: boolean; message: string; success?: boolean } | null>(null);

  useEffect(() => {
    if (profileRecord?.gstinApiKey && !localStorage.getItem('gogst_gstin_api_key')) {
      setApiKeyInput(profileRecord.gstinApiKey);
      localStorage.setItem('gogst_gstin_api_key', profileRecord.gstinApiKey);
    }
  }, [profileRecord]);

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = apiKeyInput.trim();
    localStorage.setItem('gogst_gstin_api_key', cleanKey);
    if (profileRecord?.id) {
      await db.businessProfile.update(profileRecord.id, { gstinApiKey: cleanKey });
    }
    setApiSaveSuccess(true);
    setTimeout(() => setApiSaveSuccess(false), 3000);
  };

  const handleTestApiKey = async () => {
    const cleanKey = apiKeyInput.trim();
    if (!cleanKey) {
      setApiTestStatus({
        loading: false,
        message: 'Please enter an API key to test.',
        success: false
      });
      return;
    }
    setApiTestStatus({ loading: true, message: 'Testing connection to GSTIN provider...' });
    try {
      const res = await fetchGstinDetails('33AAACC1206D1ZN', cleanKey);
      if (res.isLiveFetched) {
        setApiTestStatus({
          loading: false,
          message: `Connection successful! Verified taxpayer: "${res.companyName || res.fullName}". Provider is active and functional.`,
          success: true
        });
      } else {
        setApiTestStatus({
          loading: false,
          message: res.error || 'Live test failed. Check key validity, remaining credits or network connection.',
          success: false
        });
      }
    } catch (err: unknown) {
      setApiTestStatus({
        loading: false,
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        success: false
      });
    }
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        if (window.confirm('Restoring will merge/replace existing database tables with this backup. Continue?')) {
          const res = await restoreDatabaseFromJson(content);
          setRestoreMessage({
            text: res.message,
            type: res.success ? 'success' : 'error'
          });
          setTimeout(() => setRestoreMessage(null), 5000);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearAccountData = async () => {
    if (window.confirm(`Are you sure you want to completely erase all data and delete the account for ${session.email}? This cannot be undone.`)) {
      await clearAllUserData(session.userId);
      onLogout();
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Business Profile &amp; Account Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your registered business profile, tax registration, UPI payments, and data backups.
          </p>
        </div>
      </div>

      {/* User Account Details Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
            {session.name ? session.name.substring(0, 2).toUpperCase() : <UserIcon className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">{session.name}</h2>
            <p className="text-xs text-slate-500 font-mono">{session.email}</p>
            <span className="inline-block mt-0.5 px-2 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active Business Session
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-rose-600 text-xs font-semibold transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>

      {/* Business Registration & Tax Profile Card */}
      <BusinessRegistration
        session={session}
        initialProfile={profileRecord}
        isSettingsMode={true}
      />

      {/* Section 3: GSTIN Lookup API & Credential Security */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">GSTIN Lookup API &amp; Local Security</h2>
              <p className="text-xs text-slate-500">Configure your optional GSTIN lookup API key for live company &amp; address autofill.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Local Sandbox Protected
          </span>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1.5">
          <p>
            <strong>Client-Side Security Guarantee:</strong> In accordance with secure offline-first architecture, your API key is stored <em>only</em> inside your local browser database. It is never exposed in static website bundles or transmitted to any middleman server.
          </p>
          <p className="text-[11px] text-slate-500">
            Supported Providers: <strong>gstinapi.in</strong> (recommended; starts with <code className="bg-slate-200 px-1 rounded">gak_</code>), <strong>sheet.gstincheck.co.in</strong>, or <strong>appyflow.in</strong>. If left blank, GoGST operates in 100% offline mode with regex validation and state detection at 0 cost.
          </p>
        </div>

        <form onSubmit={handleSaveApiKey} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Your GSTIN API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                placeholder="e.g. gak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                className="w-full pl-3 pr-20 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title={showApiKey ? 'Hide Key' : 'Show Key'}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              {apiSaveSuccess ? <Check className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
              {apiSaveSuccess ? 'Saved to Browser!' : 'Save Key Privately'}
            </button>

            <button
              type="button"
              onClick={handleTestApiKey}
              disabled={apiTestStatus?.loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors border border-slate-300 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${apiTestStatus?.loading ? 'animate-spin' : ''}`} />
              Test Live Connection
            </button>

            {apiKeyInput && (
              <button
                type="button"
                onClick={() => {
                  setApiKeyInput('');
                  localStorage.removeItem('gogst_gstin_api_key');
                  if (profileRecord?.id) {
                    db.businessProfile.update(profileRecord.id, { gstinApiKey: '' });
                  }
                  setApiTestStatus(null);
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1"
              >
                Clear Key
              </button>
            )}
          </div>

          {apiTestStatus && (
            <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              apiTestStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
              apiTestStatus.loading ? 'bg-blue-50 text-blue-800 border border-blue-200' :
              'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {apiTestStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> :
               apiTestStatus.loading ? <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-blue-600" /> :
               <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
              <span>{apiTestStatus.message}</span>
            </div>
          )}
        </form>
      </div>

      {/* Section 4: Data Exports & Backup / Restore */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <FileSpreadsheet className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">GSTR-1 CA Filing &amp; Offline Data Backup</h2>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            GSTR-1 CSV Exports for GST Portal / Chartered Accountant
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => exportGstr1B2BCsv(documents)}
              className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 transition-colors"
            >
              <Download className="w-4 h-4 text-blue-600" />
              Export GSTR-1 B2B CSV
            </button>

            <button
              type="button"
              onClick={() => exportGstr1B2CCsv(documents)}
              className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 transition-colors"
            >
              <Download className="w-4 h-4 text-blue-600" />
              Export GSTR-1 B2C CSV
            </button>

            <button
              type="button"
              onClick={() => exportHsnSummaryCsv(documents)}
              className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 transition-colors"
            >
              <Download className="w-4 h-4 text-blue-600" />
              Export HSN Summary CSV
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Complete Database Backup &amp; Offline Restore
          </h3>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={() => exportDatabaseBackup()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Full JSON Backup
            </button>

            <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-colors border border-slate-300">
              <Upload className="w-4 h-4" />
              Restore from JSON Backup
              <input
                type="file"
                accept=".json"
                onChange={handleFileRestore}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleClearAccountData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold transition-colors"
            >
              Delete My Account &amp; Data
            </button>
          </div>

          {restoreMessage && (
            <div className={`mt-3 p-3 rounded-lg text-xs flex items-center gap-2 ${
              restoreMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {restoreMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{restoreMessage.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
