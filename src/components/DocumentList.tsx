import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileText, Search, Plus, Eye, Copy, Trash2, 
  ArrowRightCircle, DollarSign, Calendar
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import { Document, DocumentType, PaymentStatus, UserSession, PaymentMethod } from '../types';
import { formatIndianCurrency, getStateName } from '../utils/gstEngine';
import { isSupabaseConfigured } from '../utils/supabase';
import { pushToCloud } from '../utils/cloudSync';

interface DocumentListProps {
  session: UserSession;
  onNewDocument: (type?: DocumentType) => void;
  onEditDocument: (doc: Document) => void;
  onViewDocument: (doc: Document) => void;
}

const DOCUMENT_TYPES: { type: string; label: string }[] = [
  { type: 'ALL', label: 'All Documents' },
  { type: 'INVOICE', label: 'Tax Invoices' },
  { type: 'QUOTATION', label: 'Quotations' },
  { type: 'PROFORMA', label: 'Proforma' },
  { type: 'CHALLAN', label: 'Challans' },
  { type: 'CREDIT_NOTE', label: 'Credit Notes' },
  { type: 'DEBIT_NOTE', label: 'Debit Notes' },
  { type: 'PURCHASE_ORDER', label: 'Purchase Orders' }
];

export const DocumentList: React.FC<DocumentListProps> = ({
  session,
  onNewDocument,
  onViewDocument
}) => {
  const documents = useLiveQuery(
    () => db.documents.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  const profile = useLiveQuery(
    () => db.businessProfile.where('userId').equals(session.userId).first(),
    [session.userId]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Payment Recording Modal State
  const [paymentModalDoc, setPaymentModalDoc] = useState<Document | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [paymentRefNumber, setPaymentRefNumber] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // 1-Click Convert Quotation -> Tax Invoice
  const handleConvertQuotationToInvoice = async (quote: Document) => {
    if (!profile) return;
    if (window.confirm(`Convert Quotation "${quote.docNumber}" into a Tax Invoice? This will generate the next Invoice Number and update inventory stock.`)) {
      const invoices = documents.filter(d => d.docType === 'INVOICE');
      const nextNum = String(invoices.length + 1).padStart(3, '0');
      
      const docDate = new Date();
      const month = docDate.getMonth();
      const fullYear = docDate.getFullYear();
      const startYear = month >= 3 ? fullYear : fullYear - 1;
      const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
      const fy = `${String(startYear % 100).padStart(2, '0')}-${endYearShort}`;
      const prefix = profile.invoicePrefix ? profile.invoicePrefix.replace(/\/.*$/, '') : 'INV';
      const invoiceNumber = `${prefix}/${fy}/${nextNum}`;
      const now = new Date().toISOString();

      const newInvoice: Document = {
        ...quote,
        id: `doc-${Date.now()}`,
        userId: session.userId,
        docType: 'INVOICE',
        docNumber: invoiceNumber,
        date: now.slice(0, 10),
        dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        status: 'UNPAID',
        amountPaid: 0,
        createdAt: now,
        updatedAt: now
      };

      await db.transaction('rw', [db.documents, db.products], async () => {
        for (const item of newInvoice.items) {
          if (item.productId) {
            const p = await db.products.get(item.productId);
            if (p) {
              await db.products.update(p.id, { stock: Math.max(0, p.stock - item.quantity) });
            }
          }
        }
        await db.documents.add(newInvoice);
      });

      await logAudit({
        userId: session.userId,
        action: 'QUOTATION_CONVERTED',
        entityType: 'DOCUMENT',
        entityId: newInvoice.id,
        title: `Converted Quotation ${quote.docNumber} to Tax Invoice ${invoiceNumber}`,
        details: `Created Tax Invoice ${invoiceNumber} for ${quote.partyName} (₹${quote.grandTotal.toFixed(2)}) from Quotation ${quote.docNumber}.`
      });

      alert(`Successfully generated Tax Invoice: ${invoiceNumber}`);
    }
  };

  // Duplicate Document
  const handleDuplicate = async (doc: Document) => {
    const matchingDocs = documents.filter(d => d.docType === doc.docType);
    const nextNum = String(matchingDocs.length + 1).padStart(3, '0');
    
    const docDate = new Date();
    const month = docDate.getMonth();
    const fullYear = docDate.getFullYear();
    const startYear = month >= 3 ? fullYear : fullYear - 1;
    const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
    const fy = `${String(startYear % 100).padStart(2, '0')}-${endYearShort}`;

    let typePrefix = 'INV';
    if (doc.docType === 'QUOTATION') typePrefix = 'QTN';
    else if (doc.docType === 'PROFORMA') typePrefix = 'PI';
    else if (doc.docType === 'CHALLAN') typePrefix = 'DC';
    else if (doc.docType === 'CREDIT_NOTE') typePrefix = 'CN';
    else if (doc.docType === 'DEBIT_NOTE') typePrefix = 'DN';
    else if (doc.docType === 'PURCHASE_ORDER') typePrefix = 'PO';

    const now = new Date().toISOString();
    const duplicatedDoc: Document = {
      ...doc,
      id: `doc-${Date.now()}`,
      userId: session.userId,
      docNumber: `${typePrefix}/${fy}/${nextNum}`,
      date: now.slice(0, 10),
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
      status: 'DRAFT',
      amountPaid: 0,
      createdAt: now,
      updatedAt: now
    };

    await db.documents.add(duplicatedDoc);

    await logAudit({
      userId: session.userId,
      action: 'INVOICE_CREATED',
      entityType: 'DOCUMENT',
      entityId: duplicatedDoc.id,
      title: `Duplicated ${doc.docType} as Draft ${duplicatedDoc.docNumber}`,
      details: `Created draft clone of ${doc.docNumber} with new number ${duplicatedDoc.docNumber}.`
    });

    alert(`Duplicated as draft: ${duplicatedDoc.docNumber}`);
  };

  // Delete Document
  const handleDelete = async (doc: Document) => {
    if (window.confirm(`Are you sure you want to delete ${doc.docType} "${doc.docNumber}"?`)) {
      await db.transaction('rw', [db.documents, db.products, db.paymentTransactions], async () => {
        if (doc.docType === 'INVOICE' || doc.docType === 'DEBIT_NOTE') {
          for (const item of doc.items) {
            if (item.productId) {
              const p = await db.products.get(item.productId);
              if (p) {
                await db.products.update(p.id, { stock: p.stock + item.quantity });
              }
            }
          }
        } else if (doc.docType === 'CREDIT_NOTE') {
          for (const item of doc.items) {
            if (item.productId) {
              const p = await db.products.get(item.productId);
              if (p) {
                await db.products.update(p.id, { stock: Math.max(0, p.stock - item.quantity) });
              }
            }
          }
        }
        await db.paymentTransactions.where('documentId').equals(doc.id).delete();
        await db.documents.delete(doc.id);
      });

      await logAudit({
        userId: session.userId,
        action: 'INVOICE_DELETED',
        entityType: 'DOCUMENT',
        entityId: doc.id,
        title: `Deleted ${doc.docType}: ${doc.docNumber}`,
        details: `Deleted ${doc.docType} ${doc.docNumber} of amount ₹${doc.grandTotal.toFixed(2)} for ${doc.partyName}. Restored inventory.`
      });

      if (isSupabaseConfigured() && session?.userId) {
        pushToCloud(session.userId).catch(console.warn);
      }
    }
  };

  // Quick Record Payment
  const openPaymentModal = (doc: Document) => {
    setPaymentModalDoc(doc);
    setPaymentAmountInput(Math.max(0, doc.grandTotal - doc.amountPaid));
    setPaymentMethod('UPI');
    setPaymentRefNumber('');
    setPaymentNotes('');
  };

  const handleSavePayment = async () => {
    if (!paymentModalDoc) return;
    const paymentAmount = Number(paymentAmountInput || 0);
    if (paymentAmount <= 0) return;

    const newPaid = Number(paymentModalDoc.amountPaid || 0) + paymentAmount;
    const finalPaid = Math.min(paymentModalDoc.grandTotal, Math.max(0, newPaid));
    
    let newStatus: PaymentStatus = 'PARTIAL';
    if (finalPaid >= paymentModalDoc.grandTotal) {
      newStatus = 'PAID';
    } else if (finalPaid === 0) {
      newStatus = 'UNPAID';
    }

    const now = new Date().toISOString();

    await db.transaction('rw', [db.documents, db.paymentTransactions, db.historyLogs], async () => {
      await db.documents.update(paymentModalDoc.id, {
        amountPaid: finalPaid,
        status: newStatus,
        updatedAt: now
      });

      await db.paymentTransactions.add({
        id: `pay-${Date.now()}`,
        userId: session.userId,
        partyId: paymentModalDoc.partyId,
        partyName: paymentModalDoc.partyName,
        partyType: 'customer',
        documentId: paymentModalDoc.id,
        docNumber: paymentModalDoc.docNumber,
        type: 'PAYMENT_RECEIVED',
        amount: paymentAmount,
        paymentMethod,
        referenceNumber: paymentRefNumber.trim(),
        date: now.slice(0, 10),
        notes: paymentNotes.trim(),
        createdAt: now
      });
    });

    await logAudit({
      userId: session.userId,
      action: 'PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: paymentModalDoc.id,
      title: `Recorded Payment of ${formatIndianCurrency(paymentAmount)} for ${paymentModalDoc.docNumber}`,
      details: `Received ₹${paymentAmount.toFixed(2)} via ${paymentMethod}${paymentRefNumber ? ` (Ref: ${paymentRefNumber})` : ''} from ${paymentModalDoc.partyName}. New Status: ${newStatus}.`
    });

    setPaymentModalDoc(null);

    if (isSupabaseConfigured() && session?.userId) {
      pushToCloud(session.userId).catch(console.warn);
    }
  };

  // Filter Logic
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = 
      doc.docNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.partyGstin && doc.partyGstin.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = selectedType === 'ALL' || doc.docType === selectedType;
    const matchesStatus = selectedStatus === 'ALL' || doc.status === selectedStatus;

    let matchesDate = true;
    if (startDate && doc.date < startDate) matchesDate = false;
    if (endDate && doc.date > endDate) matchesDate = false;

    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2 font-heading">
            <FileText className="w-5 h-5 text-blue-600" />
            <span>Billing &amp; Documents Registry</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Tax Invoices, Quotations, Proforma Invoices, Delivery Challans, Credit Notes, Debit Notes &amp; Purchase Orders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNewDocument('INVOICE')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.985]"
          >
            <Plus className="w-4 h-4" />
            <span>New Tax Invoice</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by invoice no, customer, GSTIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <span className="text-xs text-slate-500 font-semibold font-heading">Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-600 bg-white"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-600 bg-white"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-xs text-blue-600 hover:underline font-semibold ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {DOCUMENT_TYPES.map(t => (
              <button
                key={t.type}
                onClick={() => setSelectedType(t.type)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedType === t.type
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-semibold mr-1 font-heading">Status:</span>
            {['ALL', 'PAID', 'PARTIAL', 'UNPAID'].map(s => (
              <button
                key={s}
                onClick={() => setSelectedStatus(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedStatus === s
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 font-bold uppercase tracking-wider text-[10px] text-slate-500 font-heading">
                <th className="px-4 py-3">Doc # &amp; Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Customer / Party</th>
                <th className="px-4 py-3 text-right">Grand Total</th>
                <th className="px-4 py-3 text-right">Balance Due</th>
                <th className="px-4 py-3 text-center">Payment Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No documents found in this view. Click &quot;+ New Tax Invoice&quot; to issue your first bill.
                  </td>
                </tr>
              ) : (
                filteredDocuments.map(doc => {
                  const balanceDue = Math.max(0, doc.grandTotal - doc.amountPaid);
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 font-mono text-[13px]">{doc.docNumber}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{doc.date}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          doc.docType === 'INVOICE' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          doc.docType === 'QUOTATION' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          doc.docType === 'PROFORMA' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                          doc.docType === 'CHALLAN' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                          doc.docType === 'CREDIT_NOTE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          doc.docType === 'DEBIT_NOTE' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                          'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {doc.docType.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{doc.partyName}</div>
                        <div className="text-[11px] text-slate-500">
                          {doc.partyGstin ? <span className="font-mono">{doc.partyGstin}</span> : 'Unregistered'}
                          <span className="mx-1">•</span>
                          <span>{getStateName(doc.placeOfSupply)} ({doc.placeOfSupply})</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                        {formatIndianCurrency(doc.grandTotal)}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {balanceDue > 0 ? (
                          <span className="text-rose-700">{formatIndianCurrency(balanceDue)}</span>
                        ) : (
                          <span className="text-emerald-700">Settled</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          doc.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                          doc.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' :
                          doc.status === 'UNPAID' ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {doc.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* 1-Click Convert Quotation -> Tax Invoice */}
                          {doc.docType === 'QUOTATION' && (
                            <button
                              onClick={() => handleConvertQuotationToInvoice(doc)}
                              className="px-2 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded flex items-center gap-1 transition-colors"
                              title="Convert to Tax Invoice"
                            >
                              <ArrowRightCircle className="w-3.5 h-3.5" />
                              Convert
                            </button>
                          )}

                          {/* Quick Payment Button */}
                          {doc.docType === 'INVOICE' && balanceDue > 0 && (
                            <button
                              onClick={() => openPaymentModal(doc)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Record Customer Payment"
                            >
                              <DollarSign className="w-4 h-4" />
                            </button>
                          )}

                          {/* Print / View */}
                          <button
                            onClick={() => onViewDocument(doc)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Print / View Invoice"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Duplicate as Draft */}
                          <button
                            onClick={() => handleDuplicate(doc)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                            title="Duplicate as New Draft"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {paymentModalDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-150 text-xs">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Record Payment: {paymentModalDoc.docNumber}
            </h3>
            <p className="text-slate-500 mb-4">
              Customer: <strong>{paymentModalDoc.partyName}</strong> • Balance Due: <strong>{formatIndianCurrency(Math.max(0, paymentModalDoc.grandTotal - paymentModalDoc.amountPaid))}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Payment Amount Received (₹) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={paymentModalDoc.grandTotal - paymentModalDoc.amountPaid}
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="UPI">UPI (Google Pay, PhonePe, Paytm)</option>
                  <option value="BANK_TRANSFER">Bank Transfer (IMPS / NEFT)</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CARD">Debit / Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Reference / UTR Number</label>
                <input
                  type="text"
                  placeholder="e.g. UTR123456789 or Cheque #0045"
                  value={paymentRefNumber}
                  onChange={(e) => setPaymentRefNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Internal Notes</label>
                <input
                  type="text"
                  placeholder="Optional payment notes..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalDoc(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePayment}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Confirm Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
