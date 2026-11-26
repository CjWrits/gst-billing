import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  CreditCard, Search, Download, ArrowDownLeft, 
  ArrowUpRight, Trash2, AlertCircle, CheckCircle2, 
  Clock 
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import { 
  PaymentTransaction, PaymentMethod, PaymentTransactionType, 
  UserSession, BusinessProfile, Party, PaymentStatus 
} from '../types';
import { formatIndianCurrency } from '../utils/gstEngine';

interface PaymentManagerProps {
  session: UserSession;
  profile: BusinessProfile;
  onOpenLedger?: (party: Party) => void;
}

export const PaymentManager: React.FC<PaymentManagerProps> = ({ session, profile: _profile, onOpenLedger: _onOpenLedger }) => {
  const transactions = useLiveQuery(
    () => db.paymentTransactions.where('userId').equals(session.userId).reverse().toArray(),
    [session.userId]
  ) || [];

  const parties = useLiveQuery(
    () => db.parties.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  const documents = useLiveQuery(
    () => db.documents.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  const purchases = useLiveQuery(
    () => db.purchases.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  // Active Tab
  const [activeTab, setActiveTab] = useState<'ALL' | 'RECEIPTS' | 'PAYMENTS' | 'RECEIVABLES' | 'PAYABLES'>('ALL');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Record Payment Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<PaymentTransactionType>('PAYMENT_RECEIVED');
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Filter parties based on modal type
  const availableParties = useMemo(() => {
    if (modalType === 'PAYMENT_RECEIVED') {
      return parties.filter(p => p.type === 'customer' || !p.type);
    }
    return parties.filter(p => p.type === 'vendor' || !p.type);
  }, [parties, modalType]);

  // Unpaid invoices / bills for the selected party
  const partyUnpaidDocs = useMemo(() => {
    if (!selectedPartyId) return [];
    if (modalType === 'PAYMENT_RECEIVED') {
      return documents.filter(d => 
        d.partyId === selectedPartyId && 
        d.docType === 'INVOICE' && 
        d.status !== 'PAID'
      );
    } else {
      return purchases.filter(p => 
        p.partyId === selectedPartyId && 
        p.status !== 'PAID'
      );
    }
  }, [selectedPartyId, modalType, documents, purchases]);

  const handleSelectDoc = (docId: string) => {
    setSelectedDocId(docId);
    if (!docId) return;

    if (modalType === 'PAYMENT_RECEIVED') {
      const doc = documents.find(d => d.id === docId);
      if (doc) {
        setAmount(Math.max(0, doc.grandTotal - (doc.amountPaid || 0)));
      }
    } else {
      const pur = purchases.find(p => p.id === docId);
      if (pur) {
        setAmount(Math.max(0, pur.grandTotal - (pur.amountPaid || 0)));
      }
    }
  };

  const openRecordModal = (type: PaymentTransactionType) => {
    setModalType(type);
    setSelectedPartyId('');
    setSelectedDocId('');
    setAmount(0);
    setPaymentMethod(type === 'PAYMENT_RECEIVED' ? 'UPI' : 'BANK_TRANSFER');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setReferenceNumber('');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPartyId) {
      alert('Please select a party.');
      return;
    }
    if (amount <= 0) {
      alert('Payment amount must be greater than zero.');
      return;
    }

    const party = parties.find(p => p.id === selectedPartyId);
    if (!party) return;

    let docNumber = '';
    const now = new Date().toISOString();
    const transactionId = `pay-${Date.now()}`;

    await db.transaction('rw', [db.paymentTransactions, db.documents, db.purchases], async () => {
      // 1. If linked to an invoice
      if (modalType === 'PAYMENT_RECEIVED' && selectedDocId) {
        const doc = await db.documents.get(selectedDocId);
        if (doc) {
          docNumber = doc.docNumber;
          const newPaid = (doc.amountPaid || 0) + amount;
          const newStatus: PaymentStatus = newPaid >= doc.grandTotal ? 'PAID' : 'PARTIAL';
          await db.documents.update(doc.id, {
            amountPaid: newPaid,
            status: newStatus,
            updatedAt: now
          });
        }
      }

      // 2. If linked to a purchase bill
      if (modalType === 'PAYMENT_MADE' && selectedDocId) {
        const pur = await db.purchases.get(selectedDocId);
        if (pur) {
          docNumber = pur.billNumber;
          const newPaid = (pur.amountPaid || 0) + amount;
          const newStatus: PaymentStatus = newPaid >= pur.grandTotal ? 'PAID' : 'PARTIAL';
          await db.purchases.update(pur.id, {
            amountPaid: newPaid,
            status: newStatus,
            updatedAt: now
          });
        }
      }

      // 3. Record transaction
      const tx: PaymentTransaction = {
        id: transactionId,
        userId: session.userId,
        partyId: party.id,
        partyName: party.name,
        partyType: party.type,
        documentId: selectedDocId || undefined,
        docNumber: docNumber || undefined,
        type: modalType,
        amount,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        date: paymentDate,
        notes: notes.trim() || undefined,
        createdAt: now
      };
      await db.paymentTransactions.add(tx);
    });

    await logAudit({
      userId: session.userId,
      action: 'PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: transactionId,
      title: `${modalType === 'PAYMENT_RECEIVED' ? 'Receipt' : 'Payment'} of ₹${amount.toFixed(2)} (${party.name})`,
      details: `${modalType === 'PAYMENT_RECEIVED' ? 'Received from' : 'Paid to'} ${party.name} via ${paymentMethod} ${docNumber ? `for ${docNumber}` : 'on account'}.`
    });

    setIsModalOpen(false);
  };

  const handleDeleteTransaction = async (tx: PaymentTransaction) => {
    if (window.confirm(`Delete this payment record of ₹${tx.amount.toFixed(2)} for ${tx.partyName}? This will adjust document balances.`)) {
      await db.transaction('rw', [db.paymentTransactions, db.documents, db.purchases], async () => {
        // Reverse invoice or purchase balance if linked
        if (tx.documentId) {
          if (tx.type === 'PAYMENT_RECEIVED') {
            const doc = await db.documents.get(tx.documentId);
            if (doc) {
              const newPaid = Math.max(0, (doc.amountPaid || 0) - tx.amount);
              const newStatus: PaymentStatus = newPaid <= 0 ? 'UNPAID' : newPaid < doc.grandTotal ? 'PARTIAL' : 'PAID';
              await db.documents.update(doc.id, { amountPaid: newPaid, status: newStatus });
            }
          } else {
            const pur = await db.purchases.get(tx.documentId);
            if (pur) {
              const newPaid = Math.max(0, (pur.amountPaid || 0) - tx.amount);
              const newStatus: PaymentStatus = newPaid <= 0 ? 'UNPAID' : newPaid < pur.grandTotal ? 'PARTIAL' : 'PAID';
              await db.purchases.update(pur.id, { amountPaid: newPaid, status: newStatus });
            }
          }
        }

        await db.paymentTransactions.delete(tx.id);
      });
    }
  };

  // Outstanding Receivables calculation
  const outstandingReceivables = useMemo(() => {
    const list: Array<{
      partyId: string;
      partyName: string;
      partyGstin: string;
      docNumber: string;
      date: string;
      dueDate: string;
      grandTotal: number;
      amountPaid: number;
      balanceDue: number;
      ageDays: number;
    }> = [];

    const nowTime = Date.now();
    for (const doc of documents) {
      if (doc.docType === 'INVOICE' && doc.status !== 'PAID') {
        const balance = Math.max(0, doc.grandTotal - (doc.amountPaid || 0));
        if (balance > 0) {
          const docTime = new Date(doc.date).getTime();
          const ageDays = Math.max(0, Math.floor((nowTime - docTime) / 86400000));
          list.push({
            partyId: doc.partyId,
            partyName: doc.partyName,
            partyGstin: doc.partyGstin,
            docNumber: doc.docNumber,
            date: doc.date,
            dueDate: doc.dueDate || doc.date,
            grandTotal: doc.grandTotal,
            amountPaid: doc.amountPaid || 0,
            balanceDue: balance,
            ageDays
          });
        }
      }
    }
    return list.sort((a, b) => b.balanceDue - a.balanceDue);
  }, [documents]);

  // Outstanding Payables calculation
  const outstandingPayables = useMemo(() => {
    const list: Array<{
      partyId: string;
      partyName: string;
      partyGstin?: string;
      billNumber: string;
      billDate: string;
      dueDate: string;
      grandTotal: number;
      amountPaid: number;
      balanceDue: number;
      ageDays: number;
    }> = [];

    const nowTime = Date.now();
    for (const pur of purchases) {
      if (pur.status !== 'PAID') {
        const balance = Math.max(0, pur.grandTotal - (pur.amountPaid || 0));
        if (balance > 0) {
          const purTime = new Date(pur.billDate).getTime();
          const ageDays = Math.max(0, Math.floor((nowTime - purTime) / 86400000));
          list.push({
            partyId: pur.partyId,
            partyName: pur.partyName,
            partyGstin: pur.partyGstin,
            billNumber: pur.billNumber,
            billDate: pur.billDate,
            dueDate: pur.dueDate || pur.billDate,
            grandTotal: pur.grandTotal,
            amountPaid: pur.amountPaid || 0,
            balanceDue: balance,
            ageDays
          });
        }
      }
    }
    return list.sort((a, b) => b.balanceDue - a.balanceDue);
  }, [purchases]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const term = searchTerm.toLowerCase();
      const matchSearch = 
        tx.partyName.toLowerCase().includes(term) ||
        (tx.referenceNumber && tx.referenceNumber.toLowerCase().includes(term)) ||
        (tx.docNumber && tx.docNumber.toLowerCase().includes(term));

      const matchTab = 
        activeTab === 'ALL' ||
        (activeTab === 'RECEIPTS' && tx.type === 'PAYMENT_RECEIVED') ||
        (activeTab === 'PAYMENTS' && tx.type === 'PAYMENT_MADE');

      const matchStart = !startDate || tx.date >= startDate;
      const matchEnd = !endDate || tx.date <= endDate;

      return matchSearch && matchTab && matchStart && matchEnd;
    });
  }, [transactions, searchTerm, activeTab, startDate, endDate]);

  const totalReceipts = useMemo(() => {
    return transactions.filter(t => t.type === 'PAYMENT_RECEIVED').reduce((s, t) => s + t.amount, 0);
  }, [transactions]);

  const totalDisbursements = useMemo(() => {
    return transactions.filter(t => t.type === 'PAYMENT_MADE').reduce((s, t) => s + t.amount, 0);
  }, [transactions]);

  const totalReceivableSum = useMemo(() => {
    return outstandingReceivables.reduce((s, r) => s + r.balanceDue, 0);
  }, [outstandingReceivables]);

  const totalPayableSum = useMemo(() => {
    return outstandingPayables.reduce((s, p) => s + p.balanceDue, 0);
  }, [outstandingPayables]);

  const exportPaymentsCsv = () => {
    const headers = ['Date', 'Type', 'Party Name', 'Amount (Rs)', 'Method', 'Voucher / Doc No', 'Reference / UTR', 'Notes'];
    const rows = filteredTransactions.map(t => [
      `"${t.date}"`,
      `"${t.type}"`,
      `"${t.partyName}"`,
      `"${t.amount.toFixed(2)}"`,
      `"${t.paymentMethod}"`,
      `"${t.docNumber || ''}"`,
      `"${t.referenceNumber || ''}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payments_Register_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-600" />
            Payment &amp; Receipt Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Centralized register for money received from clients and payments made to suppliers, with outstanding aging tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportPaymentsCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            Export Register
          </button>

          <button
            type="button"
            onClick={() => openRecordModal('PAYMENT_RECEIVED')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
          >
            <ArrowDownLeft className="w-4 h-4" />
            + Record Receipt (From Customer)
          </button>

          <button
            type="button"
            onClick={() => openRecordModal('PAYMENT_MADE')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
          >
            <ArrowUpRight className="w-4 h-4" />
            + Record Payment (To Supplier)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Received (Receipts)</p>
            <p className="text-lg font-bold text-emerald-700 mt-0.5">{formatIndianCurrency(totalReceipts)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Paid (Disbursements)</p>
            <p className="text-lg font-bold text-rose-700 mt-0.5">{formatIndianCurrency(totalDisbursements)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Outstanding Receivables</p>
            <p className="text-lg font-bold text-blue-700 mt-0.5">{formatIndianCurrency(totalReceivableSum)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Outstanding Payables</p>
            <p className="text-lg font-bold text-amber-700 mt-0.5">{formatIndianCurrency(totalPayableSum)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex flex-wrap gap-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'ALL' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          All Transactions ({transactions.length})
        </button>
        <button
          onClick={() => setActiveTab('RECEIPTS')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'RECEIPTS' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Receipts Inward ({transactions.filter(t => t.type === 'PAYMENT_RECEIVED').length})
        </button>
        <button
          onClick={() => setActiveTab('PAYMENTS')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'PAYMENTS' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Payments Outward ({transactions.filter(t => t.type === 'PAYMENT_MADE').length})
        </button>
        <button
          onClick={() => setActiveTab('RECEIVABLES')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'RECEIVABLES' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Outstanding Receivables ({outstandingReceivables.length})
        </button>
        <button
          onClick={() => setActiveTab('PAYABLES')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeTab === 'PAYABLES' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Outstanding Payables ({outstandingPayables.length})
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === 'RECEIVABLES' ? (
        /* Receivables Aging Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-900">Uncollected Customer Receivables (Aging Report)</h3>
            <span className="font-bold text-blue-700">Total: {formatIndianCurrency(totalReceivableSum)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-4">Invoice Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4 text-right">Invoice Total</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Aging</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outstandingReceivables.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                      All invoices are fully paid! No outstanding receivables.
                    </td>
                  </tr>
                ) : (
                  outstandingReceivables.map(r => (
                    <tr key={r.docNumber} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.docNumber}</td>
                      <td className="py-3 px-4 text-slate-600">{r.date}</td>
                      <td className="py-3 px-4 text-slate-600">{r.dueDate}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{r.partyName}</td>
                      <td className="py-3 px-4 text-right text-slate-700">{formatIndianCurrency(r.grandTotal)}</td>
                      <td className="py-3 px-4 text-right text-emerald-700">{formatIndianCurrency(r.amountPaid)}</td>
                      <td className="py-3 px-4 text-right font-bold text-blue-700">{formatIndianCurrency(r.balanceDue)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.ageDays <= 30 ? 'bg-emerald-100 text-emerald-800' :
                          r.ageDays <= 60 ? 'bg-amber-100 text-amber-800' :
                          'bg-rose-100 text-rose-800'
                        }`}>
                          {r.ageDays} days
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setModalType('PAYMENT_RECEIVED');
                            setSelectedPartyId(r.partyId);
                            setSelectedDocId(documents.find(d => d.docNumber === r.docNumber)?.id || '');
                            setAmount(r.balanceDue);
                            setPaymentMethod('UPI');
                            setIsModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors"
                        >
                          Receive Payment
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'PAYABLES' ? (
        /* Payables Aging Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-900">Unpaid Supplier Payables</h3>
            <span className="font-bold text-amber-700">Total: {formatIndianCurrency(totalPayableSum)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Bill No</th>
                  <th className="py-3 px-4">Bill Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Bill Amount</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Aging</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outstandingPayables.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                      All supplier bills are settled! No outstanding payables.
                    </td>
                  </tr>
                ) : (
                  outstandingPayables.map(p => (
                    <tr key={p.billNumber} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.billNumber}</td>
                      <td className="py-3 px-4 text-slate-600">{p.billDate}</td>
                      <td className="py-3 px-4 text-slate-600">{p.dueDate}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{p.partyName}</td>
                      <td className="py-3 px-4 text-right text-slate-700">{formatIndianCurrency(p.grandTotal)}</td>
                      <td className="py-3 px-4 text-right text-emerald-700">{formatIndianCurrency(p.amountPaid)}</td>
                      <td className="py-3 px-4 text-right font-bold text-amber-700">{formatIndianCurrency(p.balanceDue)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.ageDays <= 30 ? 'bg-emerald-100 text-emerald-800' :
                          p.ageDays <= 60 ? 'bg-amber-100 text-amber-800' :
                          'bg-rose-100 text-rose-800'
                        }`}>
                          {p.ageDays} days
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setModalType('PAYMENT_MADE');
                            setSelectedPartyId(p.partyId);
                            setSelectedDocId(purchases.find(pur => pur.billNumber === p.billNumber)?.id || '');
                            setAmount(p.balanceDue);
                            setPaymentMethod('BANK_TRANSFER');
                            setIsModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold transition-colors"
                        >
                          Make Payment
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Transactions Register Table */
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search payments by Party Name, Reference/UTR, or Document Number..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Party</th>
                    <th className="py-3 px-4">Doc / Voucher</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Reference / UTR</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        No payment or receipt transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono">{tx.date}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] ${
                            tx.type === 'PAYMENT_RECEIVED' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {tx.type === 'PAYMENT_RECEIVED' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {tx.type === 'PAYMENT_RECEIVED' ? 'Receipt' : 'Payment'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{tx.partyName}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{tx.docNumber || 'On Account'}</td>
                        <td className="py-3 px-4 font-medium text-slate-700">{tx.paymentMethod}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{tx.referenceNumber || '-'}</td>
                        <td className={`py-3 px-4 text-right font-bold ${
                          tx.type === 'PAYMENT_RECEIVED' ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {formatIndianCurrency(tx.amount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteTransaction(tx)}
                            title="Delete transaction"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment / Receipt Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 text-xs space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {modalType === 'PAYMENT_RECEIVED' ? (
                  <>
                    <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                    Record Receipt from Customer
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-5 h-5 text-rose-600" />
                    Record Payment to Supplier
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {modalType === 'PAYMENT_RECEIVED' ? 'Select Customer*' : 'Select Supplier*'}
                </label>
                <select
                  required
                  value={selectedPartyId}
                  onChange={e => {
                    setSelectedPartyId(e.target.value);
                    setSelectedDocId('');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="">-- Choose Party --</option>
                  {availableParties.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.gstin || 'Unregistered'})</option>
                  ))}
                </select>
              </div>

              {selectedPartyId && partyUnpaidDocs.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Apply against Invoice / Bill (Optional)
                  </label>
                  <select
                    value={selectedDocId}
                    onChange={e => handleSelectDoc(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- On Account (No specific document) --</option>
                    {partyUnpaidDocs.map(d => {
                      const num = 'docNumber' in d ? d.docNumber : d.billNumber;
                      const bal = d.grandTotal - (d.amountPaid || 0);
                      return (
                        <option key={d.id} value={d.id}>
                          {num} - Total: ₹{d.grandTotal.toFixed(2)} (Due: ₹{bal.toFixed(2)})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount (₹)*</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={e => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer (IMPS)</option>
                    <option value="NEFT_RTGS">NEFT / RTGS</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Reference / UTR / Cheque No</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR12345678"
                    value={referenceNumber}
                    onChange={e => setReferenceNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes or remarks..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-white rounded-lg font-bold shadow-sm ${
                    modalType === 'PAYMENT_RECEIVED' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
