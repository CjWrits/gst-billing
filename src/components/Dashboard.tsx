import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  TrendingUp, Clock, Landmark, AlertTriangle, Plus, 
  ChevronRight, Eye, CheckCircle2, Copy, Check,
  ShoppingBag, CreditCard, FileSpreadsheet, Building2,
  ArrowUpRight, ArrowDownRight, Layers
} from 'lucide-react';
import { db } from '../db/database';
import { Document, DocumentType, BusinessProfile, UserSession } from '../types';
import { formatIndianCurrency, getStateName } from '../utils/gstEngine';

interface DashboardProps {
  session: UserSession;
  profile: BusinessProfile;
  onNavigate: (view: 'dashboard' | 'builder' | 'documents' | 'purchases' | 'payments' | 'reports' | 'parties' | 'products' | 'settings' | 'history', docType?: DocumentType) => void;
  onViewDocument: (doc: Document) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  session, 
  profile, 
  onNavigate, 
  onViewDocument 
}) => {
  const [copiedGstin, setCopiedGstin] = useState(false);

  const documents = useLiveQuery(
    () => db.documents.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  const purchases = useLiveQuery(
    () => db.purchases.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  const products = useLiveQuery(
    () => db.products.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  const parties = useLiveQuery(
    () => db.parties.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  // Current month calculation
  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const currentMonthInvoices = documents.filter(d => 
    d.docType === 'INVOICE' && d.date.startsWith(currentMonthPrefix)
  );
  const totalSalesThisMonth = currentMonthInvoices.reduce((sum, d) => sum + d.grandTotal, 0);

  // Unpaid Receivables
  const unpaidInvoices = documents.filter(d => 
    d.docType === 'INVOICE' && (d.status === 'UNPAID' || d.status === 'PARTIAL')
  );
  const totalReceivables = unpaidInvoices.reduce((sum, d) => 
    sum + Math.max(0, d.grandTotal - d.amountPaid), 0
  );

  // Unpaid Payables
  const unpaidPurchases = purchases.filter(p => p.status === 'UNPAID' || p.status === 'PARTIAL');
  const totalPayables = unpaidPurchases.reduce((sum, p) => 
    sum + Math.max(0, p.grandTotal - (p.amountPaid || 0)), 0
  );

  // Total Purchases
  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + p.grandTotal, 0);

  // GST Collected (Outward)
  const allInvoices = documents.filter(d => d.docType === 'INVOICE');
  const totalCgst = allInvoices.reduce((sum, d) => sum + d.totalCgst, 0);
  const totalSgst = allInvoices.reduce((sum, d) => sum + d.totalSgst, 0);
  const totalIgst = allInvoices.reduce((sum, d) => sum + d.totalIgst, 0);
  const totalGstOutput = totalCgst + totalSgst + totalIgst;

  // GST Input Tax Credit (ITC)
  const totalItc = purchases.reduce((sum, p) => 
    sum + (p.totalCgst || 0) + (p.totalSgst || 0) + (p.totalIgst || 0), 0
  );

  // Net Tax Liability
  const netGstLiability = Math.max(0, totalGstOutput - totalItc);

  // Low Stock Items
  const lowStockItems = products.filter(p => p.stock <= p.lowStockAlert);

  // Recent 5 documents
  const recentDocs = [...documents]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const isBrandNewBusiness = documents.length === 0 && products.length === 0 && parties.length === 0 && purchases.length === 0;

  const copyGstinToClipboard = () => {
    if (profile.gstin) {
      navigator.clipboard.writeText(profile.gstin);
      setCopiedGstin(true);
      setTimeout(() => setCopiedGstin(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Business Entity Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold font-mono border border-slate-200/60">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>{profile.stateCode} • {getStateName(profile.stateCode)}</span>
            </span>

            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200/60">
              {profile.taxScheme || 'Regular'} Scheme
            </span>

            {profile.taxScheme === 'COMPOSITION' && (
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200/60">
                Composition Scheme
              </span>
            )}
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-heading">
            {profile.companyName || profile.name}
          </h1>

          {profile.tradeName && profile.tradeName !== profile.companyName && (
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Trade Name: <strong className="text-slate-700">{profile.tradeName}</strong>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 mt-2">
            <div className="inline-flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/70 font-mono">
              <span className="text-slate-400 font-sans text-[11px]">GSTIN:</span>
              <strong className="text-slate-800 font-semibold">{profile.gstin || 'Not Configured'}</strong>
              {profile.gstin && (
                <button
                  type="button"
                  onClick={copyGstinToClipboard}
                  className="ml-1 text-slate-400 hover:text-blue-600 transition-colors"
                  title="Copy GSTIN"
                >
                  {copiedGstin ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {profile.phone && (
              <span className="text-slate-600">
                Phone: <strong className="text-slate-800">{profile.phone}</strong>
              </span>
            )}

            {profile.email && (
              <span className="text-slate-600">
                Email: <strong className="text-slate-800">{profile.email}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigate('builder', 'INVOICE')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.985]"
          >
            <Plus className="w-4 h-4" />
            <span>Create Tax Invoice</span>
          </button>

          <button
            onClick={() => onNavigate('purchases')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200/90 shadow-xs transition-all active:scale-[0.985]"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
            <span>Record Inward Bill</span>
          </button>

          <button
            onClick={() => onNavigate('payments')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200/90 shadow-xs transition-all active:scale-[0.985]"
          >
            <CreditCard className="w-3.5 h-3.5 text-slate-500" />
            <span>Record Payment</span>
          </button>

          <button
            onClick={() => onNavigate('reports')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200/90 shadow-xs transition-all active:scale-[0.985]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>GST Reports</span>
          </button>
        </div>
      </div>

      {/* Guided Onboarding Checklist for Brand New Setups */}
      {isBrandNewBusiness && (
        <div className="bg-white border border-blue-200/90 rounded-2xl p-6 shadow-xs">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 font-heading">
              Quick Setup Checklist for {profile.companyName || profile.name}
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
            Your local business database is active, secure, and offline-first. Complete these four fundamental steps to start generating compliant GST tax invoices:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4">
            <div 
              onClick={() => onNavigate('parties')}
              className="p-4 bg-slate-50 hover:bg-white rounded-xl border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]">1</span>
                <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600">Party Master</span>
              </div>
              <p className="text-[11px] text-slate-500">Save buyers &amp; suppliers with verified GSTIN auto-fill.</p>
            </div>

            <div 
              onClick={() => onNavigate('products')}
              className="p-4 bg-slate-50 hover:bg-white rounded-xl border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]">2</span>
                <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600">Product &amp; SKU Catalog</span>
              </div>
              <p className="text-[11px] text-slate-500">Pick from verified HSN catalog &amp; initialize stock.</p>
            </div>

            <div 
              onClick={() => onNavigate('purchases')}
              className="p-4 bg-slate-50 hover:bg-white rounded-xl border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]">3</span>
                <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600">Inward Purchases</span>
              </div>
              <p className="text-[11px] text-slate-500">Inward bills auto-increment stock &amp; record ITC credit.</p>
            </div>

            <div 
              onClick={() => onNavigate('builder', 'INVOICE')}
              className="p-4 bg-slate-50 hover:bg-white rounded-xl border border-slate-200/80 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]">4</span>
                <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600">Generate Tax Invoice</span>
              </div>
              <p className="text-[11px] text-slate-500">Print standard A4 &amp; 80mm thermal receipts with UPI QR.</p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Outward Sales */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
              Sales (This Month)
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 font-heading tabular-nums">
            {formatIndianCurrency(totalSalesThisMonth)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{currentMonthInvoices.length} Invoices Issued</span>
            <span className="inline-flex items-center text-emerald-600 font-semibold gap-0.5">
              <ArrowUpRight className="w-3.5 h-3.5" /> Outward
            </span>
          </div>
        </div>

        {/* Inward Purchases */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
              Inward Purchases
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 font-heading tabular-nums">
            {formatIndianCurrency(totalPurchasesAmount)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{purchases.length} Purchase Bills</span>
            <span className="inline-flex items-center text-indigo-600 font-semibold gap-0.5">
              <ArrowDownRight className="w-3.5 h-3.5" /> Inward
            </span>
          </div>
        </div>

        {/* Customer Receivables */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
              Customer Receivables
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-blue-700 mt-2 font-heading tabular-nums">
            {formatIndianCurrency(totalReceivables)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{unpaidInvoices.length} Unsettled Invoices</span>
            <span className="text-blue-700 font-semibold text-[10px]">Due from Buyers</span>
          </div>
        </div>

        {/* Supplier Payables */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
              Supplier Payables
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-700 mt-2 font-heading tabular-nums">
            {formatIndianCurrency(totalPayables)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
            <span>{unpaidPurchases.length} Pending Bills</span>
            <span className="text-amber-700 font-semibold text-[10px]">Payable to Vendors</span>
          </div>
        </div>
      </div>

      {/* GST Monthly Tax Liability & Input Tax Credit Strip */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Landmark className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-heading">
                Monthly GST Computation &amp; ITC Settlement
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Summary of outward tax collected against allowable Input Tax Credit (ITC) from inward purchase bills.
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('reports')}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all shrink-0 active:scale-[0.985]"
          >
            Open GSTR-3B Summary →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <span className="text-[11px] font-medium text-slate-500 block">Outward Tax Collected</span>
            <span className="text-base font-extrabold text-slate-900 font-heading tabular-nums mt-0.5 block">
              {formatIndianCurrency(totalGstOutput)}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              CGST: {formatIndianCurrency(totalCgst)} • SGST: {formatIndianCurrency(totalSgst)} • IGST: {formatIndianCurrency(totalIgst)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <span className="text-[11px] font-medium text-slate-500 block">Input Tax Credit (ITC)</span>
            <span className="text-base font-extrabold text-indigo-700 font-heading tabular-nums mt-0.5 block">
              {formatIndianCurrency(totalItc)}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Eligible credit from registered purchases
            </span>
          </div>

          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/80">
            <span className="text-[11px] font-semibold text-blue-800 block">Net Cash Tax Payable</span>
            <span className="text-base font-extrabold text-blue-900 font-heading tabular-nums mt-0.5 block">
              {formatIndianCurrency(netGstLiability)}
            </span>
            <span className="text-[10px] text-blue-700 mt-0.5 block">
              {netGstLiability === 0 ? 'No cash liability (fully offset by ITC)' : 'Payable via Electronic Cash Ledger'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Operations Grid: Recent Invoices & Low Stock Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices / Documents (2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 font-heading">Recent Invoices &amp; Billing Documents</h2>
            <button
              onClick={() => onNavigate('documents')}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5"
            >
              <span>View All ({documents.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200/80 font-heading">
                  <th className="py-2.5 px-4">Doc Number</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Party Name</th>
                  <th className="py-2.5 px-4 text-right">Grand Total</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentDocs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      <p className="font-semibold text-slate-600">No documents created yet</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Click "Create Tax Invoice" to generate your first document.</p>
                    </td>
                  </tr>
                ) : (
                  recentDocs.map(doc => (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{doc.docNumber}</td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{doc.date}</td>
                      <td className="py-3 px-3 font-semibold text-slate-800">{doc.partyName}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900 tabular-nums font-heading">
                        {formatIndianCurrency(doc.grandTotal)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          doc.status === 'PAID' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                          doc.status === 'PARTIAL' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            doc.status === 'PAID' ? 'bg-emerald-500' :
                            doc.status === 'PARTIAL' ? 'bg-amber-500' :
                            'bg-rose-500'
                          }`}></span>
                          <span>{doc.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onViewDocument(doc)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View / Print Document"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Alerts & Quick Inventory (1 Column) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 font-heading">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Low Stock Watchlist</span>
              </h2>
              <button
                onClick={() => onNavigate('products')}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                Catalog ({products.length})
              </button>
            </div>

            <div className="p-4 space-y-2.5 text-xs">
              {lowStockItems.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <CheckCircle2 className="w-7 h-7 mx-auto mb-1.5 text-emerald-500" />
                  <p className="font-bold text-slate-700">Inventory Levels Healthy</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">All products are currently above their re-order threshold.</p>
                </div>
              ) : (
                lowStockItems.slice(0, 5).map(item => (
                  <div key={item.id} className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">SKU: {item.sku || 'N/A'}</p>
                    </div>
                    <span className="font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md text-[11px]">
                      {item.stock} {item.unit}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 bg-slate-50/70 text-center">
            <button
              onClick={() => onNavigate('purchases')}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 transition-colors"
            >
              + Create Inward Purchase to Restock →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
