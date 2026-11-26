import React, { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useReactToPrint } from 'react-to-print';
import { 
  BookOpen, Printer, Download, X 
} from 'lucide-react';
import { db } from '../db/database';
import { Party, BusinessProfile, PartyLedgerEntry } from '../types';
import { formatIndianCurrency } from '../utils/gstEngine';

interface PartyLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party;
  profile: BusinessProfile;
}

export const PartyLedgerModal: React.FC<PartyLedgerModalProps> = ({
  isOpen,
  onClose,
  party,
  profile
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch all documents for this party
  const documents = useLiveQuery(
    () => db.documents.where('partyId').equals(party.id).toArray(),
    [party.id]
  ) || [];

  // Fetch all purchases for this party
  const purchases = useLiveQuery(
    () => db.purchases.where('partyId').equals(party.id).toArray(),
    [party.id]
  ) || [];

  // Fetch all payment transactions for this party
  const transactions = useLiveQuery(
    () => db.paymentTransactions.where('partyId').equals(party.id).toArray(),
    [party.id]
  ) || [];

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Ledger_Statement_${party.name.replace(/\s+/g, '_')}`
  });

  // Calculate full chronological running ledger
  const ledgerEntries: PartyLedgerEntry[] = useMemo(() => {
    const rawEvents: Array<{
      date: string;
      type: PartyLedgerEntry['type'];
      referenceNumber: string;
      description: string;
      debit: number;
      credit: number;
      timestamp: number;
    }> = [];

    // 1. Opening Balance
    if (party.openingBalance && party.openingBalance > 0) {
      const isDebit = party.openingBalanceType !== 'CREDIT';
      rawEvents.push({
        date: party.createdAt ? party.createdAt.slice(0, 10) : '2026-04-01',
        type: 'OPENING_BALANCE',
        referenceNumber: 'OB',
        description: 'Opening Balance',
        debit: isDebit ? party.openingBalance : 0,
        credit: !isDebit ? party.openingBalance : 0,
        timestamp: new Date(party.createdAt || '2026-04-01').getTime()
      });
    }

    // 2. Sales Invoices & Credit / Debit Notes
    for (const doc of documents) {
      if (doc.docType === 'INVOICE') {
        rawEvents.push({
          date: doc.date,
          type: 'INVOICE',
          referenceNumber: doc.docNumber,
          description: `Tax Invoice (${doc.items.length} items)`,
          debit: doc.grandTotal, // Customer owes us
          credit: 0,
          timestamp: new Date(doc.date).getTime()
        });
      } else if (doc.docType === 'CREDIT_NOTE') {
        rawEvents.push({
          date: doc.date,
          type: 'CREDIT_NOTE',
          referenceNumber: doc.docNumber,
          description: `Credit Note / Sales Return`,
          debit: 0,
          credit: doc.grandTotal, // Reduces customer debt
          timestamp: new Date(doc.date).getTime()
        });
      } else if (doc.docType === 'DEBIT_NOTE') {
        rawEvents.push({
          date: doc.date,
          type: 'DEBIT_NOTE',
          referenceNumber: doc.docNumber,
          description: `Debit Note`,
          debit: doc.grandTotal,
          credit: 0,
          timestamp: new Date(doc.date).getTime()
        });
      }
    }

    // 3. Purchase Bills (Inward)
    for (const pur of purchases) {
      rawEvents.push({
        date: pur.billDate,
        type: 'PURCHASE',
        referenceNumber: pur.billNumber,
        description: `Purchase Bill / Inward Supplies`,
        debit: 0,
        credit: pur.grandTotal, // We owe vendor
        timestamp: new Date(pur.billDate).getTime()
      });
    }

    // 4. Payment Transactions
    for (const tx of transactions) {
      if (tx.type === 'PAYMENT_RECEIVED') {
        rawEvents.push({
          date: tx.date,
          type: 'PAYMENT_RECEIVED',
          referenceNumber: tx.referenceNumber || tx.docNumber || 'RCPT',
          description: `Payment Received via ${tx.paymentMethod} ${tx.notes ? `(${tx.notes})` : ''}`,
          debit: 0,
          credit: tx.amount, // Payment received reduces customer balance
          timestamp: new Date(tx.date).getTime()
        });
      } else if (tx.type === 'PAYMENT_MADE') {
        rawEvents.push({
          date: tx.date,
          type: 'PAYMENT_MADE',
          referenceNumber: tx.referenceNumber || tx.docNumber || 'PYMT',
          description: `Payment Made via ${tx.paymentMethod} ${tx.notes ? `(${tx.notes})` : ''}`,
          debit: tx.amount, // Payment to vendor reduces vendor balance
          credit: 0,
          timestamp: new Date(tx.date).getTime()
        });
      }
    }

    // Sort chronologically
    rawEvents.sort((a, b) => {
      const diff = a.timestamp - b.timestamp;
      if (diff !== 0) return diff;
      return a.referenceNumber.localeCompare(b.referenceNumber);
    });

    // Compute running balance
    let running = 0;
    const computed: PartyLedgerEntry[] = rawEvents.map((ev, idx) => {
      running += (ev.debit - ev.credit);
      return {
        id: `led-${idx}-${ev.referenceNumber}`,
        date: ev.date,
        type: ev.type,
        referenceNumber: ev.referenceNumber,
        description: ev.description,
        debit: ev.debit,
        credit: ev.credit,
        balance: running
      };
    });

    return computed;
  }, [party, documents, purchases, transactions]);

  // Apply date range filters
  const filteredEntries = useMemo(() => {
    return ledgerEntries.filter(entry => {
      const matchStart = !startDate || entry.date >= startDate;
      const matchEnd = !endDate || entry.date <= endDate;
      return matchStart && matchEnd;
    });
  }, [ledgerEntries, startDate, endDate]);

  const totalDebit = useMemo(() => {
    return filteredEntries.reduce((sum, e) => sum + e.debit, 0);
  }, [filteredEntries]);

  const totalCredit = useMemo(() => {
    return filteredEntries.reduce((sum, e) => sum + e.credit, 0);
  }, [filteredEntries]);

  const finalBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance : 0;

  const exportLedgerCsv = () => {
    const headers = ['Date', 'Type', 'Voucher / Doc No', 'Description', 'Debit (Rs)', 'Credit (Rs)', 'Balance (Rs)'];
    const rows = filteredEntries.map(e => [
      `"${e.date}"`,
      `"${e.type}"`,
      `"${e.referenceNumber}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.debit.toFixed(2)}"`,
      `"${e.credit.toFixed(2)}"`,
      `"${e.balance.toFixed(2)}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ledger_${party.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{party.name}</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  party.type === 'customer' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {party.type} Ledger
                </span>
              </div>
              <p className="text-xs text-slate-500">
                GSTIN: <strong className="font-mono text-slate-700">{party.gstin || 'Unregistered'}</strong> • Phone: {party.phone || 'N/A'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportLedgerCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => handlePrint()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statement</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date Filter & Balance Summary Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-blue-600 hover:underline font-semibold"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-slate-500 text-[11px] block">Net Outstanding Balance:</span>
              <span className={`text-sm font-bold ${
                finalBalance > 0 ? 'text-blue-700' : finalBalance < 0 ? 'text-emerald-700' : 'text-slate-700'
              }`}>
                {formatIndianCurrency(Math.abs(finalBalance))} {finalBalance > 0 ? '(Dr - Receivable)' : finalBalance < 0 ? '(Cr - Payable)' : '(Settled)'}
              </span>
            </div>
          </div>
        </div>

        {/* Printable Statement Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div ref={printRef} className="bg-white p-6 rounded-xl border border-slate-100 shadow-2xs print:border-none print:shadow-none print:p-0">
            {/* Print Header */}
            <div className="border-b border-slate-300 pb-4 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{profile.companyName || profile.name}</h1>
                  <p className="text-xs text-slate-500">{profile.addressLine1 || profile.address}</p>
                  <p className="text-xs text-slate-500">GSTIN: {profile.gstin || 'Unregistered'} • Phone: {profile.phone}</p>
                </div>
                <div className="text-right">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-blue-700">Statement of Account (Ledger)</h2>
                  <p className="text-xs text-slate-500 mt-1">Generated: {new Date().toLocaleDateString('en-IN')}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-500 font-medium">Party Name:</p>
                  <p className="font-bold text-slate-900 text-sm">{party.name}</p>
                  {party.gstin && <p className="font-mono text-slate-600">GSTIN: {party.gstin}</p>}
                  <p className="text-slate-500">{party.billingAddress}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 font-medium">Closing Balance:</p>
                  <p className={`font-bold text-sm ${finalBalance > 0 ? 'text-blue-700' : finalBalance < 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                    {formatIndianCurrency(Math.abs(finalBalance))} {finalBalance > 0 ? 'Dr (Receivable)' : finalBalance < 0 ? 'Cr (Payable)' : 'Nil'}
                  </p>
                </div>
              </div>
            </div>

            {/* Ledger Transactions Table */}
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
                <tr>
                  <th className="py-2.5 px-3 w-24">Date</th>
                  <th className="py-2.5 px-3 w-28">Type</th>
                  <th className="py-2.5 px-3 w-28">Doc / Ref No</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 w-28 text-right">Debit (₹)</th>
                  <th className="py-2.5 px-3 w-28 text-right">Credit (₹)</th>
                  <th className="py-2.5 px-3 w-32 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      No transactions recorded for this party yet.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600 font-mono">{entry.date}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          entry.type === 'INVOICE' ? 'bg-blue-50 text-blue-700' :
                          entry.type === 'PURCHASE' ? 'bg-purple-50 text-purple-700' :
                          entry.type === 'PAYMENT_RECEIVED' ? 'bg-emerald-50 text-emerald-700' :
                          entry.type === 'PAYMENT_MADE' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {entry.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono font-medium text-slate-800">{entry.referenceNumber}</td>
                      <td className="py-2 px-3 text-slate-600">{entry.description}</td>
                      <td className="py-2 px-3 text-right font-medium text-slate-800">
                        {entry.debit > 0 ? formatIndianCurrency(entry.debit) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-slate-800">
                        {entry.credit > 0 ? formatIndianCurrency(entry.credit) : '-'}
                      </td>
                      <td className={`py-2 px-3 text-right font-bold ${
                        entry.balance > 0 ? 'text-blue-700' : entry.balance < 0 ? 'text-emerald-700' : 'text-slate-800'
                      }`}>
                        {formatIndianCurrency(Math.abs(entry.balance))} {entry.balance > 0 ? 'Dr' : entry.balance < 0 ? 'Cr' : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 font-bold bg-slate-50">
                <tr>
                  <td colSpan={4} className="py-2.5 px-3 text-slate-800">Total Period Movement:</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">{formatIndianCurrency(totalDebit)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">{formatIndianCurrency(totalCredit)}</td>
                  <td className="py-2.5 px-3 text-right text-blue-800">
                    {formatIndianCurrency(Math.abs(finalBalance))} {finalBalance > 0 ? 'Dr' : finalBalance < 0 ? 'Cr' : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
          <span>{filteredEntries.length} transactions shown</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
