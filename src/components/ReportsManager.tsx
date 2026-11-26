import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileSpreadsheet, Download, Calendar, ArrowUpRight, 
  ArrowDownLeft, ShieldCheck 
} from 'lucide-react';
import { db } from '../db/database';
import { 
  BusinessProfile, UserSession, 
  DateFilterOption, HsnSummaryItem 
} from '../types';
import { 
  formatIndianCurrency, groupHsnSummary 
} from '../utils/gstEngine';
import { 
  exportGstr1B2BCsv, exportGstr1B2CCsv, exportGstr1CdnrCsv, 
  exportHsnSummaryCsv, exportSalesRegisterCsv, exportPurchaseRegisterCsv 
} from '../utils/gstrExport';

interface ReportsManagerProps {
  session: UserSession;
  profile: BusinessProfile;
}

export const ReportsManager: React.FC<ReportsManagerProps> = ({ session, profile: _profile }) => {
  const documents = useLiveQuery(
    () => db.documents.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  const purchases = useLiveQuery(
    () => db.purchases.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  // Active Report Tab
  const [activeTab, setActiveTab] = useState<'SALES' | 'PURCHASES' | 'GSTR1' | 'GSTR3B' | 'HSN'>('SALES');

  // Date Range Filters
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('THIS_MONTH');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Calculate actual date boundaries
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (dateFilter === 'ALL') {
      return { startDate: '', endDate: '' };
    }
    if (dateFilter === 'TODAY') {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (dateFilter === 'THIS_WEEK') {
      const day = now.getDay();
      const diffToMonday = now.getDate() - (day === 0 ? 6 : day - 1);
      const monday = new Date(now.setDate(diffToMonday));
      const monStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
      return { startDate: monStr, endDate: todayStr };
    }
    if (dateFilter === 'THIS_MONTH') {
      const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      return { startDate: start, endDate: todayStr };
    }
    if (dateFilter === 'THIS_QUARTER') {
      const currentMonth = now.getMonth(); // 0-based
      let qStartMonth = 3; // default Q1: April
      if (currentMonth >= 3 && currentMonth <= 5) qStartMonth = 3; // Apr-Jun
      else if (currentMonth >= 6 && currentMonth <= 8) qStartMonth = 6; // Jul-Sep
      else if (currentMonth >= 9 && currentMonth <= 11) qStartMonth = 9; // Oct-Dec
      else qStartMonth = 0; // Jan-Mar

      const start = `${now.getFullYear()}-${pad(qStartMonth + 1)}-01`;
      return { startDate: start, endDate: todayStr };
    }
    if (dateFilter === 'THIS_FY') {
      const currentMonth = now.getMonth();
      const startYear = currentMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const start = `${startYear}-04-01`;
      const end = `${startYear + 1}-03-31`;
      return { startDate: start, endDate: end };
    }
    return { startDate: customStart, endDate: customEnd };
  }, [dateFilter, customStart, customEnd]);

  // Filtered Documents (Sales)
  const filteredDocs = useMemo(() => {
    return documents.filter(d => {
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;
      return true;
    });
  }, [documents, startDate, endDate]);

  // Filtered Purchases (Inward)
  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      if (startDate && p.billDate < startDate) return false;
      if (endDate && p.billDate > endDate) return false;
      return true;
    });
  }, [purchases, startDate, endDate]);

  // Invoices only (excluding estimates/quotations for statutory tax summaries)
  const salesInvoices = useMemo(() => {
    return filteredDocs.filter(d => d.docType === 'INVOICE');
  }, [filteredDocs]);

  // Credit & Debit notes
  const creditDebitNotes = useMemo(() => {
    return filteredDocs.filter(d => d.docType === 'CREDIT_NOTE' || d.docType === 'DEBIT_NOTE');
  }, [filteredDocs]);

  // --- Sales Metrics ---
  const salesTaxable = useMemo(() => salesInvoices.reduce((s, d) => s + d.subTotal, 0), [salesInvoices]);
  const salesCgst = useMemo(() => salesInvoices.reduce((s, d) => s + d.totalCgst, 0), [salesInvoices]);
  const salesSgst = useMemo(() => salesInvoices.reduce((s, d) => s + d.totalSgst, 0), [salesInvoices]);
  const salesIgst = useMemo(() => salesInvoices.reduce((s, d) => s + d.totalIgst, 0), [salesInvoices]);
  const salesTotalTax = salesCgst + salesSgst + salesIgst;
  const salesGrandTotal = useMemo(() => salesInvoices.reduce((s, d) => s + d.grandTotal, 0), [salesInvoices]);

  // --- Purchase Metrics (ITC) ---
  const purchaseTaxable = useMemo(() => filteredPurchases.reduce((s, p) => s + p.subTotal, 0), [filteredPurchases]);
  const purchaseCgstItc = useMemo(() => filteredPurchases.reduce((s, p) => s + (p.totalCgst || 0), 0), [filteredPurchases]);
  const purchaseSgstItc = useMemo(() => filteredPurchases.reduce((s, p) => s + (p.totalSgst || 0), 0), [filteredPurchases]);
  const purchaseIgstItc = useMemo(() => filteredPurchases.reduce((s, p) => s + (p.totalIgst || 0), 0), [filteredPurchases]);
  const totalItc = purchaseCgstItc + purchaseSgstItc + purchaseIgstItc;
  const purchaseGrandTotal = useMemo(() => filteredPurchases.reduce((s, p) => s + p.grandTotal, 0), [filteredPurchases]);

  // --- Net Tax Liability (GSTR-3B) ---
  const netCgstPayable = Math.max(0, salesCgst - purchaseCgstItc);
  const netSgstPayable = Math.max(0, salesSgst - purchaseSgstItc);
  const netIgstPayable = Math.max(0, salesIgst - purchaseIgstItc);
  const totalNetGstPayable = netCgstPayable + netSgstPayable + netIgstPayable;

  // --- HSN Summary Grouping across selected sales period ---
  const hsnSummaryData: HsnSummaryItem[] = useMemo(() => {
    const allItems = salesInvoices.flatMap(d => d.items);
    return groupHsnSummary(allItems);
  }, [salesInvoices]);

  // --- GSTR-1 Breakdown Categories ---
  const gstr1B2B = useMemo(() => {
    return salesInvoices.filter(d => d.partyGstin && d.partyGstin.trim().length === 15);
  }, [salesInvoices]);

  const gstr1B2CS = useMemo(() => {
    return salesInvoices.filter(d => !d.partyGstin || d.partyGstin.trim().length !== 15);
  }, [salesInvoices]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            GST &amp; Financial Reports Center
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Itemized sales &amp; purchase registers, GSTR-1 returns, GSTR-3B monthly tax computation, and HSN summaries.
          </p>
        </div>

        {/* Global Export Options */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'SALES' && (
            <button
              onClick={() => exportSalesRegisterCsv(salesInvoices)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              Export Sales Register CSV
            </button>
          )}

          {activeTab === 'PURCHASES' && (
            <button
              onClick={() => exportPurchaseRegisterCsv(filteredPurchases)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              Export Purchase Register CSV
            </button>
          )}

          {activeTab === 'GSTR1' && (
            <div className="flex gap-2">
              <button
                onClick={() => exportGstr1B2BCsv(salesInvoices)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                B2B CSV
              </button>
              <button
                onClick={() => exportGstr1B2CCsv(salesInvoices)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                B2C CSV
              </button>
              <button
                onClick={() => exportGstr1CdnrCsv(filteredDocs)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                CDNR CSV
              </button>
            </div>
          )}

          {activeTab === 'HSN' && (
            <button
              onClick={() => exportHsnSummaryCsv(salesInvoices)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              Export HSN Summary CSV
            </button>
          )}
        </div>
      </div>

      {/* Date Range Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-slate-600 mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Period:
          </span>
          {[
            { id: 'ALL', label: 'All Time' },
            { id: 'TODAY', label: 'Today' },
            { id: 'THIS_WEEK', label: 'This Week' },
            { id: 'THIS_MONTH', label: 'This Month' },
            { id: 'THIS_QUARTER', label: 'This Quarter' },
            { id: 'THIS_FY', label: 'This FY (2026-27)' },
            { id: 'CUSTOM', label: 'Custom' }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setDateFilter(opt.id as DateFilterOption)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                dateFilter === opt.id 
                  ? 'bg-blue-600 text-white shadow-2xs' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {dateFilter === 'CUSTOM' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
            />
          </div>
        )}

        {(startDate || endDate) && (
          <div className="text-[11px] text-slate-500 font-medium">
            Active: <strong>{startDate || 'Beginning'}</strong> to <strong>{endDate || 'Current'}</strong>
          </div>
        )}
      </div>

      {/* Report Module Tabs */}
      <div className="border-b border-slate-200 flex flex-wrap gap-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('SALES')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'SALES' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Sales Register ({salesInvoices.length})
        </button>
        <button
          onClick={() => setActiveTab('PURCHASES')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'PURCHASES' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Purchase Register &amp; Inward ITC ({filteredPurchases.length})
        </button>
        <button
          onClick={() => setActiveTab('GSTR3B')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'GSTR3B' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          GSTR-3B Tax Computation
        </button>
        <button
          onClick={() => setActiveTab('GSTR1')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'GSTR1' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          GSTR-1 Outward Supplies Summary
        </button>
        <button
          onClick={() => setActiveTab('HSN')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'HSN' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          HSN-wise Summary ({hsnSummaryData.length})
        </button>
      </div>

      {/* TAB 1: SALES REGISTER */}
      {activeTab === 'SALES' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Taxable Sales Value</span>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{formatIndianCurrency(salesTaxable)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Output GST Collected</span>
              <p className="text-xl font-bold text-blue-700 mt-0.5">{formatIndianCurrency(salesTotalTax)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Invoiced Amount</span>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{formatIndianCurrency(salesGrandTotal)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Invoice No</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">GSTIN</th>
                    <th className="py-3 px-4">POS</th>
                    <th className="py-3 px-4 text-right">Taxable</th>
                    <th className="py-3 px-4 text-right">CGST</th>
                    <th className="py-3 px-4 text-right">SGST</th>
                    <th className="py-3 px-4 text-right">IGST</th>
                    <th className="py-3 px-4 text-right">Grand Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        No sales invoices found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    salesInvoices.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{doc.docNumber}</td>
                        <td className="py-3 px-4 text-slate-600">{doc.date}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{doc.partyName}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{doc.partyGstin || 'Unregistered'}</td>
                        <td className="py-3 px-4 text-slate-600">{doc.placeOfSupply}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">{formatIndianCurrency(doc.subTotal)}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatIndianCurrency(doc.totalCgst)}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatIndianCurrency(doc.totalSgst)}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatIndianCurrency(doc.totalIgst)}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{formatIndianCurrency(doc.grandTotal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 text-slate-800">Total:</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(salesTaxable)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(salesCgst)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(salesSgst)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(salesIgst)}</td>
                    <td className="py-3 px-4 text-right text-blue-700">{formatIndianCurrency(salesGrandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PURCHASE REGISTER */}
      {activeTab === 'PURCHASES' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Taxable Purchase Cost</span>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{formatIndianCurrency(purchaseTaxable)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Eligible ITC (Input Tax Credit)</span>
              <p className="text-xl font-bold text-purple-700 mt-0.5">{formatIndianCurrency(totalItc)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Purchase Bills</span>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{formatIndianCurrency(purchaseGrandTotal)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Bill No</th>
                    <th className="py-3 px-4">Bill Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Supplier GSTIN</th>
                    <th className="py-3 px-4">Supplier State</th>
                    <th className="py-3 px-4 text-right">Taxable</th>
                    <th className="py-3 px-4 text-right">CGST ITC</th>
                    <th className="py-3 px-4 text-right">SGST ITC</th>
                    <th className="py-3 px-4 text-right">IGST ITC</th>
                    <th className="py-3 px-4 text-right">Grand Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        No purchase bills recorded for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.billNumber}</td>
                        <td className="py-3 px-4 text-slate-600">{b.billDate}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{b.partyName}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{b.partyGstin || 'Unregistered'}</td>
                        <td className="py-3 px-4 text-slate-600">{b.placeOfSupply}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">{formatIndianCurrency(b.subTotal)}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatIndianCurrency(b.totalCgst || 0)}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatIndianCurrency(b.totalSgst || 0)}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatIndianCurrency(b.totalIgst || 0)}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{formatIndianCurrency(b.grandTotal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 text-slate-800">Total ITC:</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(purchaseTaxable)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(purchaseCgstItc)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(purchaseSgstItc)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(purchaseIgstItc)}</td>
                    <td className="py-3 px-4 text-right text-purple-700">{formatIndianCurrency(purchaseGrandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: GSTR-3B COMPUTATION */}
      {activeTab === 'GSTR3B' && (
        <div className="space-y-6">
          {/* Statutory Advisory Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <span className="font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded text-[10px] shrink-0 uppercase tracking-wide">
              Internal Summary
            </span>
            <p>
              <strong>Notice:</strong> This GSTR-3B computation is an <em>Internal Management Summary</em> (CGST Act Rules 3.1 &amp; 4) calculated from your recorded sales and purchase bills. It is not an automated portal JSON upload. Use these values or consult your Chartered Accountant when filing your monthly return on <a href="https://www.gst.gov.in" target="_blank" rel="noreferrer" className="underline font-semibold">gst.gov.in</a>.
            </p>
          </div>

          {/* Summary Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">1. Outward Tax (Sales)</span>
                <ArrowUpRight className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{formatIndianCurrency(salesTotalTax)}</p>
              <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
                <div className="flex justify-between"><span>CGST:</span> <span>{formatIndianCurrency(salesCgst)}</span></div>
                <div className="flex justify-between"><span>SGST:</span> <span>{formatIndianCurrency(salesSgst)}</span></div>
                <div className="flex justify-between"><span>IGST:</span> <span>{formatIndianCurrency(salesIgst)}</span></div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">2. Input Tax Credit (ITC)</span>
                <ArrowDownLeft className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-700 mt-2">{formatIndianCurrency(totalItc)}</p>
              <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
                <div className="flex justify-between"><span>CGST ITC:</span> <span>{formatIndianCurrency(purchaseCgstItc)}</span></div>
                <div className="flex justify-between"><span>SGST ITC:</span> <span>{formatIndianCurrency(purchaseSgstItc)}</span></div>
                <div className="flex justify-between"><span>IGST ITC:</span> <span>{formatIndianCurrency(purchaseIgstItc)}</span></div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs bg-gradient-to-br from-blue-50/50 to-indigo-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 uppercase">3. Net GST Cash Liability</span>
                <ShieldCheck className="w-5 h-5 text-blue-700" />
              </div>
              <p className="text-2xl font-bold text-blue-800 mt-2">{formatIndianCurrency(totalNetGstPayable)}</p>
              <div className="mt-2 text-[11px] text-blue-900 space-y-0.5 font-medium">
                <div className="flex justify-between"><span>Net CGST Payable:</span> <span>{formatIndianCurrency(netCgstPayable)}</span></div>
                <div className="flex justify-between"><span>Net SGST Payable:</span> <span>{formatIndianCurrency(netSgstPayable)}</span></div>
                <div className="flex justify-between"><span>Net IGST Payable:</span> <span>{formatIndianCurrency(netIgstPayable)}</span></div>
              </div>
            </div>
          </div>

          {/* GSTR-3B Official Table Format */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-900">Table 3.1 &amp; Table 4 - Details of Outward Supplies &amp; Eligible ITC</h3>
              <p className="text-[11px] text-slate-500">Official CBIC GSTR-3B format mapping for monthly return filing.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Nature of Supplies</th>
                    <th className="py-2.5 px-4 text-right">Taxable Value</th>
                    <th className="py-2.5 px-4 text-right">Integrated Tax (IGST)</th>
                    <th className="py-2.5 px-4 text-right">Central Tax (CGST)</th>
                    <th className="py-2.5 px-4 text-right">State/UT Tax (SGST)</th>
                    <th className="py-2.5 px-4 text-right">Cess</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      (a) Outward Taxable Supplies (Other than zero rated, nil rated and exempted)
                    </td>
                    <td className="py-3 px-4 text-right font-medium">{formatIndianCurrency(salesTaxable)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(salesIgst)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(salesCgst)}</td>
                    <td className="py-3 px-4 text-right">{formatIndianCurrency(salesSgst)}</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                  </tr>

                  <tr className="bg-purple-50/40">
                    <td className="py-3 px-4 font-semibold text-purple-900">
                      (4) Eligible ITC - (A) All other ITC (Inward purchases from registered suppliers)
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-purple-900">{formatIndianCurrency(purchaseTaxable)}</td>
                    <td className="py-3 px-4 text-right text-purple-900">{formatIndianCurrency(purchaseIgstItc)}</td>
                    <td className="py-3 px-4 text-right text-purple-900">{formatIndianCurrency(purchaseCgstItc)}</td>
                    <td className="py-3 px-4 text-right text-purple-900">{formatIndianCurrency(purchaseSgstItc)}</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                  </tr>

                  <tr className="bg-blue-50/60 font-bold">
                    <td className="py-3 px-4 text-blue-900">
                      (5) Net Tax Payable in Cash / Electronic Ledger:
                    </td>
                    <td className="py-3 px-4 text-right text-blue-900">-</td>
                    <td className="py-3 px-4 text-right text-blue-900">{formatIndianCurrency(netIgstPayable)}</td>
                    <td className="py-3 px-4 text-right text-blue-900">{formatIndianCurrency(netCgstPayable)}</td>
                    <td className="py-3 px-4 text-right text-blue-900">{formatIndianCurrency(netSgstPayable)}</td>
                    <td className="py-3 px-4 text-right text-slate-400">₹0.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GSTR-1 OUTWARD SUPPLIES SUMMARY */}
      {activeTab === 'GSTR1' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Table 4: B2B Invoices (With GSTIN)</span>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{gstr1B2B.length} Invoices</p>
              <p className="text-xs text-blue-600 font-semibold mt-1">
                Taxable: {formatIndianCurrency(gstr1B2B.reduce((s, d) => s + d.subTotal, 0))}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Table 7: B2C Small (Consumers)</span>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{gstr1B2CS.length} Invoices</p>
              <p className="text-xs text-blue-600 font-semibold mt-1">
                Taxable: {formatIndianCurrency(gstr1B2CS.reduce((s, d) => s + d.subTotal, 0))}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Table 9: Credit &amp; Debit Notes</span>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{creditDebitNotes.length} Notes</p>
              <p className="text-xs text-rose-600 font-semibold mt-1">
                Total: {formatIndianCurrency(creditDebitNotes.reduce((s, d) => s + d.grandTotal, 0))}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">GSTR-1 CA &amp; Offline Tool Ready CSV Exports</h3>
                <p className="text-slate-500 mt-0.5">
                  Formatted according to official CBIC GST Offline Tool schemas. Ready for import into the government portal or sharing with your accountant.
                </p>
              </div>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Official Schema Compatible
              </span>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => exportGstr1B2BCsv(salesInvoices)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Download B2B CSV
              </button>
              <button
                onClick={() => exportGstr1B2CCsv(salesInvoices)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-slate-200"
              >
                <Download className="w-4 h-4" />
                Download B2CS CSV
              </button>
              <button
                onClick={() => exportGstr1CdnrCsv(filteredDocs)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-slate-200"
              >
                <Download className="w-4 h-4" />
                Download CDNR CSV
              </button>
              <button
                onClick={() => exportHsnSummaryCsv(salesInvoices)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-slate-200"
              >
                <Download className="w-4 h-4" />
                Download HSN Summary CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: HSN-WISE SUMMARY */}
      {activeTab === 'HSN' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900">Table 12 - HSN-wise Summary of Outward Supplies</h3>
                <p className="text-[11px] text-slate-500">Grouped by HSN/SAC code and applicable tax rate.</p>
              </div>
              <button
                onClick={() => exportHsnSummaryCsv(salesInvoices)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">HSN / SAC</th>
                    <th className="py-2.5 px-4 text-center">GST Rate</th>
                    <th className="py-2.5 px-4 text-right">Taxable Value</th>
                    <th className="py-2.5 px-4 text-right">CGST Amount</th>
                    <th className="py-2.5 px-4 text-right">SGST Amount</th>
                    <th className="py-2.5 px-4 text-right">IGST Amount</th>
                    <th className="py-2.5 px-4 text-right">Total Tax</th>
                    <th className="py-2.5 px-4 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hsnSummaryData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No items sold in the selected period.
                      </td>
                    </tr>
                  ) : (
                    hsnSummaryData.map((h, i) => (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{h.hsn}</td>
                        <td className="py-2.5 px-4 text-center font-semibold">{h.gstRate}%</td>
                        <td className="py-2.5 px-4 text-right font-medium text-slate-800">{formatIndianCurrency(h.taxableAmount)}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600">{formatIndianCurrency(h.cgstAmount)}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600">{formatIndianCurrency(h.sgstAmount)}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600">{formatIndianCurrency(h.igstAmount)}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-slate-900">{formatIndianCurrency(h.totalTax)}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-blue-700">{formatIndianCurrency(h.totalAmount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
