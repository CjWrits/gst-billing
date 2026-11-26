import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  ShoppingBag, Plus, Search, Eye, Trash2, Edit2, 
  ArrowLeft, Save, DollarSign, 
  BookOpen, AlertCircle 
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import { 
  PurchaseBill, DocumentItem, PaymentStatus, 
  ProductUnit, BusinessProfile, UserSession, PaymentMethod, GstRate 
} from '../types';
import { 
  STATE_OPTIONS, calculateItemTaxes, 
  calculateDocumentTotals, formatIndianCurrency, getStateName 
} from '../utils/gstEngine';
import { HsnCatalogModal } from './HsnCatalogModal';

const UNIT_OPTIONS: ProductUnit[] = ['PCS', 'BOX', 'KG', 'LTR', 'SET', 'MTR', 'NOS', 'UNIT'];
const GST_RATES: GstRate[] = [0, 5, 12, 18, 28];

interface PurchaseManagerProps {
  session: UserSession;
  profile: BusinessProfile;
}

export const PurchaseManager: React.FC<PurchaseManagerProps> = ({ session, profile }) => {
  const purchases = useLiveQuery(
    () => db.purchases.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  const parties = useLiveQuery(
    () => db.parties.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  const products = useLiveQuery(
    () => db.products.where('userId').equals(session.userId).toArray(),
    [session.userId]
  ) || [];

  const vendors = useMemo(() => {
    return parties.filter(p => p.type === 'vendor' || p.type === 'customer');
  }, [parties]);

  // View state
  const [isCreating, setIsCreating] = useState(false);
  const [editingBill, setEditingBill] = useState<PurchaseBill | null>(null);
  const [viewingBill, setViewingBill] = useState<PurchaseBill | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Payment recording modal
  const [paymentModalBill, setPaymentModalBill] = useState<PurchaseBill | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // HSN Directory Modal
  const [hsnModalIndex, setHsnModalIndex] = useState<number | null>(null);

  // --- Purchase Bill Form State ---
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  );
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState(profile.stateCode || '09');
  const [notes, setNotes] = useState('');
  const [amountPaidNow, setAmountPaidNow] = useState(0);
  const [paymentModeNow, setPaymentModeNow] = useState<PaymentMethod>('BANK_TRANSFER');
  const [paymentRefNow, setPaymentRefNow] = useState('');

  const [items, setItems] = useState<DocumentItem[]>([
    {
      id: `pitem-${Date.now()}`,
      name: '',
      hsn: '',
      quantity: 1,
      unit: 'PCS',
      rate: 0,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: 0,
      gstRate: 18,
      cgstRate: 9,
      cgstAmount: 0,
      sgstRate: 9,
      sgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      totalAmount: 0
    }
  ]);

  const totals = useMemo(() => {
    return calculateDocumentTotals(items);
  }, [items]);

  const openCreateForm = () => {
    setEditingBill(null);
    setBillNumber('');
    setBillDate(new Date().toISOString().slice(0, 10));
    setDueDate(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
    setPartyId('');
    setPartyName('');
    setPartyGstin('');
    setPartyAddress('');
    setPlaceOfSupply(profile.stateCode || '09');
    setNotes('');
    setAmountPaidNow(0);
    setPaymentRefNow('');
    setItems([
      {
        id: `pitem-${Date.now()}`,
        name: '',
        hsn: '',
        quantity: 1,
        unit: 'PCS',
        rate: 0,
        discountPercent: 0,
        discountAmount: 0,
        taxableAmount: 0,
        gstRate: 18,
        cgstRate: 9,
        cgstAmount: 0,
        sgstRate: 9,
        sgstAmount: 0,
        igstRate: 0,
        igstAmount: 0,
        totalAmount: 0
      }
    ]);
    setIsCreating(true);
  };

  const openEditForm = (bill: PurchaseBill) => {
    setEditingBill(bill);
    setBillNumber(bill.billNumber);
    setBillDate(bill.billDate);
    setDueDate(bill.dueDate || bill.billDate);
    setPartyId(bill.partyId);
    setPartyName(bill.partyName);
    setPartyGstin(bill.partyGstin || '');
    setPartyAddress(bill.partyAddress || '');
    setPlaceOfSupply(bill.placeOfSupply);
    setNotes(bill.notes || '');
    setAmountPaidNow(bill.amountPaid);
    setItems(bill.items);
    setIsCreating(true);
  };

  const handleSelectVendor = (selectedPartyId: string) => {
    setPartyId(selectedPartyId);
    const vendor = parties.find(p => p.id === selectedPartyId);
    if (vendor) {
      setPartyName(vendor.name);
      setPartyGstin(vendor.gstin || '');
      setPartyAddress(vendor.billingAddress || '');
      if (vendor.stateCode) {
        setPlaceOfSupply(vendor.stateCode);
      }
    }
  };

  const handleSelectItemProduct = (index: number, prodId: string) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    const rate = prod.lastPurchasePrice || prod.purchasePrice || 0;
    const taxes = calculateItemTaxes({
      quantity: 1,
      rate,
      discountPercent: 0,
      gstRate: prod.gstRate,
      sellerStateCode: placeOfSupply, // In inward purchases, seller is vendor
      placeOfSupply: profile.stateCode || '09' // Buyer is our business
    });

    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        productId: prod.id,
        name: prod.name,
        sku: prod.sku,
        hsn: prod.hsn || '',
        unit: prod.unit,
        rate,
        discountPercent: 0,
        ...taxes
      };
      return updated;
    });
  };

  const updateItem = (index: number, patch: Partial<DocumentItem>) => {
    setItems(prev => {
      const updated = [...prev];
      const current = { ...updated[index], ...patch };

      const taxes = calculateItemTaxes({
        quantity: current.quantity,
        rate: current.rate,
        discountPercent: current.discountPercent,
        gstRate: current.gstRate,
        sellerStateCode: placeOfSupply,
        placeOfSupply: profile.stateCode || '09'
      });

      updated[index] = {
        ...current,
        ...taxes
      };
      return updated;
    });
  };

  const addItemRow = () => {
    const taxes = calculateItemTaxes({
      quantity: 1,
      rate: 0,
      discountPercent: 0,
      gstRate: 18,
      sellerStateCode: placeOfSupply,
      placeOfSupply: profile.stateCode || '09'
    });

    setItems(prev => [
      ...prev,
      {
        id: `pitem-${Date.now()}-${prev.length}`,
        name: '',
        hsn: '',
        quantity: 1,
        unit: 'PCS',
        rate: 0,
        discountPercent: 0,
        ...taxes
      }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSavePurchaseBill = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!billNumber.trim()) {
      alert('Supplier Bill / Invoice Number is required.');
      return;
    }
    if (!partyName.trim()) {
      alert('Supplier / Vendor Name is required.');
      return;
    }
    if (items.length === 0 || !items[0].name.trim()) {
      alert('Please add at least one line item.');
      return;
    }

    const cleanBillNo = billNumber.trim();
    // Prevent duplicate bill number from the same vendor
    const existingBill = purchases.find(p => 
      p.billNumber.trim().toLowerCase() === cleanBillNo.toLowerCase() &&
      (partyId ? p.partyId === partyId : p.partyName.trim().toLowerCase() === partyName.trim().toLowerCase()) &&
      p.id !== (editingBill ? editingBill.id : '')
    );
    if (existingBill) {
      alert(`A purchase bill with number "${cleanBillNo}" from this supplier has already been recorded.`);
      return;
    }

    const calculatedTotals = calculateDocumentTotals(items);
    const paid = Math.min(calculatedTotals.grandTotal, Math.max(0, amountPaidNow));
    const status: PaymentStatus = paid >= calculatedTotals.grandTotal ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';

    const now = new Date().toISOString();
    const purchaseId = editingBill ? editingBill.id : `pur-${Date.now()}`;

    const purchaseRecord: PurchaseBill = {
      id: purchaseId,
      userId: session.userId,
      billNumber: billNumber.trim(),
      billDate,
      dueDate,
      partyId: partyId || `vendor-adhoc-${Date.now()}`,
      partyName: partyName.trim(),
      partyGstin: partyGstin.trim(),
      partyAddress: partyAddress.trim(),
      placeOfSupply,
      items,
      subTotal: calculatedTotals.subTotal,
      totalDiscount: calculatedTotals.totalDiscount,
      totalCgst: calculatedTotals.totalCgst,
      totalSgst: calculatedTotals.totalSgst,
      totalIgst: calculatedTotals.totalIgst,
      roundOff: calculatedTotals.roundOff,
      grandTotal: calculatedTotals.grandTotal,
      amountPaid: paid,
      status,
      notes: notes.trim(),
      createdAt: editingBill ? editingBill.createdAt : now,
      updatedAt: now
    };

    // Execute atomic Dexie transaction: Save purchase + Update stock + Update last purchase price + Record initial payment
    await db.transaction('rw', [db.purchases, db.products, db.parties, db.paymentTransactions], async () => {
      // 1. If editing an existing bill, first revert old stock changes
      if (editingBill) {
        for (const oldItem of editingBill.items) {
          if (oldItem.productId) {
            const p = await db.products.get(oldItem.productId);
            if (p) {
              await db.products.update(p.id, {
                stock: Math.max(0, p.stock - oldItem.quantity)
              });
            }
          }
        }
      }

      // 2. Save or update purchase record
      if (editingBill) {
        await db.purchases.put(purchaseRecord);
      } else {
        await db.purchases.add(purchaseRecord);
      }

      // 3. Apply inward stock increase & update last purchase price & valuation
      for (const item of purchaseRecord.items) {
        if (item.productId) {
          const p = await db.products.get(item.productId);
          if (p) {
            await db.products.update(p.id, {
              stock: p.stock + item.quantity,
              lastPurchasePrice: item.rate,
              purchasePrice: item.rate // Update current purchase price
            });
          }
        }
      }

      // 4. If newly created with initial payment, log payment transaction
      if (!editingBill && paid > 0) {
        await db.paymentTransactions.add({
          id: `pay-${Date.now()}`,
          userId: session.userId,
          partyId: purchaseRecord.partyId,
          partyName: purchaseRecord.partyName,
          partyType: 'vendor',
          documentId: purchaseRecord.id,
          docNumber: purchaseRecord.billNumber,
          type: 'PAYMENT_MADE',
          amount: paid,
          paymentMethod: paymentModeNow,
          referenceNumber: paymentRefNow.trim() || `Initial payment for Bill ${purchaseRecord.billNumber}`,
          date: purchaseRecord.billDate,
          notes: 'Recorded at inward purchase bill creation',
          createdAt: now
        });
      }
    });

    await logAudit({
      userId: session.userId,
      action: editingBill ? 'PURCHASE_UPDATED' : 'PURCHASE_CREATED',
      entityType: 'PURCHASE',
      entityId: purchaseRecord.id,
      title: `${editingBill ? 'Updated' : 'Recorded'} Purchase Bill ${purchaseRecord.billNumber}`,
      details: `Inward Purchase Bill from ${purchaseRecord.partyName} (₹${purchaseRecord.grandTotal.toFixed(2)}). Inventory stock and last purchase rate updated.`
    });

    setIsCreating(false);
    setEditingBill(null);
  };

  const handleDeletePurchase = async (bill: PurchaseBill) => {
    if (window.confirm(`Delete Purchase Bill "${bill.billNumber}" from ${bill.partyName}? This will deduct the items from inventory stock.`)) {
      await db.transaction('rw', [db.purchases, db.products, db.paymentTransactions], async () => {
        // Revert stock
        for (const item of bill.items) {
          if (item.productId) {
            const p = await db.products.get(item.productId);
            if (p) {
              await db.products.update(p.id, {
                stock: Math.max(0, p.stock - item.quantity)
              });
            }
          }
        }

        // Delete linked payment transactions
        await db.paymentTransactions.where('documentId').equals(bill.id).delete();
        // Delete purchase record
        await db.purchases.delete(bill.id);
      });

      await logAudit({
        userId: session.userId,
        action: 'PURCHASE_DELETED',
        entityType: 'PURCHASE',
        entityId: bill.id,
        title: `Deleted Purchase Bill: ${bill.billNumber}`,
        details: `Deleted Purchase Bill ${bill.billNumber} from ${bill.partyName} (₹${bill.grandTotal.toFixed(2)}). Restored inventory stock.`
      });
    }
  };

  // Quick Payment Recording for an existing bill
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalBill) return;

    const amt = Math.max(0, Number(paymentAmount) || 0);
    if (amt <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    const newAmountPaid = (paymentModalBill.amountPaid || 0) + amt;
    const newStatus: PaymentStatus = newAmountPaid >= paymentModalBill.grandTotal ? 'PAID' : 'PARTIAL';
    const now = new Date().toISOString();

    await db.transaction('rw', [db.purchases, db.paymentTransactions], async () => {
      await db.purchases.update(paymentModalBill.id, {
        amountPaid: newAmountPaid,
        status: newStatus,
        updatedAt: now
      });

      await db.paymentTransactions.add({
        id: `pay-${Date.now()}`,
        userId: session.userId,
        partyId: paymentModalBill.partyId,
        partyName: paymentModalBill.partyName,
        partyType: 'vendor',
        documentId: paymentModalBill.id,
        docNumber: paymentModalBill.billNumber,
        type: 'PAYMENT_MADE',
        amount: amt,
        paymentMethod,
        referenceNumber: paymentRef.trim(),
        date: new Date().toISOString().slice(0, 10),
        notes: paymentNotes.trim(),
        createdAt: now
      });
    });

    await logAudit({
      userId: session.userId,
      action: 'PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: paymentModalBill.id,
      title: `Recorded Payment of ₹${amt.toFixed(2)} to ${paymentModalBill.partyName}`,
      details: `Payment recorded against Purchase Bill ${paymentModalBill.billNumber} via ${paymentMethod}.`
    });

    setPaymentModalBill(null);
  };

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter(b => {
      const term = searchTerm.toLowerCase();
      const matchSearch = 
        b.billNumber.toLowerCase().includes(term) ||
        b.partyName.toLowerCase().includes(term) ||
        (b.partyGstin && b.partyGstin.toLowerCase().includes(term));

      const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
      const matchStart = !startDate || b.billDate >= startDate;
      const matchEnd = !endDate || b.billDate <= endDate;

      return matchSearch && matchStatus && matchStart && matchEnd;
    });
  }, [purchases, searchTerm, statusFilter, startDate, endDate]);

  // Overall totals
  const totalPurchasesAmount = useMemo(() => {
    return purchases.reduce((sum, p) => sum + p.grandTotal, 0);
  }, [purchases]);

  const totalOutstandingPayables = useMemo(() => {
    return purchases.reduce((sum, p) => sum + Math.max(0, p.grandTotal - (p.amountPaid || 0)), 0);
  }, [purchases]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-blue-600" />
            Purchase Management (Inward Bills)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Record supplier bills, track inward GST ITC, auto-increase inventory stock, and manage payables.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isCreating && (
            <button
              onClick={openCreateForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Record Inward Purchase Bill
            </button>
          )}
        </div>
      </div>

      {/* Inward Purchase Bill Form */}
      {isCreating ? (
        <form onSubmit={handleSavePurchaseBill} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingBill ? `Edit Purchase Bill: ${editingBill.billNumber}` : 'Record Inward Purchase Bill'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Items recorded will automatically increase warehouse stock and update last purchase cost.
                </p>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Purchase Bill
            </button>
          </div>

          {/* Supplier & Bill Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Select Saved Supplier / Vendor</label>
              <select
                value={partyId}
                onChange={e => handleSelectVendor(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium"
              >
                <option value="">-- Choose Existing Vendor --</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.gstin || 'Unregistered'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Name*</label>
              <input
                type="text"
                required
                placeholder="Vendor / Supplier Company Name"
                value={partyName}
                onChange={e => setPartyName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier GSTIN</label>
              <input
                type="text"
                placeholder="15-character GSTIN"
                value={partyGstin}
                onChange={e => setPartyGstin(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier State / POS</label>
              <select
                value={placeOfSupply}
                onChange={e => setPlaceOfSupply(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {STATE_OPTIONS.map(s => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Bill / Invoice No*</label>
              <input
                type="text"
                required
                placeholder="e.g. INV-9842"
                value={billNumber}
                onChange={e => setBillNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bill Date*</label>
              <input
                type="date"
                required
                value={billDate}
                onChange={e => setBillDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Address</label>
              <input
                type="text"
                placeholder="City, State, Pincode"
                value={partyAddress}
                onChange={e => setPartyAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Purchase Bill Line Items</h3>
              <span className="text-[11px] text-slate-500">
                Supply Type: <strong>{placeOfSupply === profile.stateCode ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}</strong>
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 min-w-[200px]">Product / Service</th>
                    <th className="py-2.5 px-3 w-28">HSN / SAC</th>
                    <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                    <th className="py-2.5 px-3 w-24">Unit</th>
                    <th className="py-2.5 px-3 w-28 text-right">Rate (₹)</th>
                    <th className="py-2.5 px-3 w-20 text-right">Disc %</th>
                    <th className="py-2.5 px-3 w-24 text-right">Taxable</th>
                    <th className="py-2.5 px-3 w-24 text-center">GST %</th>
                    <th className="py-2.5 px-3 w-28 text-right">Total (₹)</th>
                    <th className="py-2.5 px-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3">
                        <div className="space-y-1">
                          <select
                            value={item.productId || ''}
                            onChange={e => handleSelectItemProduct(idx, e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-slate-700 bg-slate-50"
                          >
                            <option value="">-- Choose from Catalog --</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku || 'N/A'})</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            required
                            placeholder="Description / Product Name"
                            value={item.name}
                            onChange={e => updateItem(idx, { name: e.target.value })}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-medium"
                          />
                        </div>
                      </td>

                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="HSN"
                            value={item.hsn}
                            onChange={e => updateItem(idx, { hsn: e.target.value })}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setHsnModalIndex(idx)}
                            title="Browse HSN directory"
                            className="p-1 text-slate-400 hover:text-blue-600 rounded"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          value={item.quantity}
                          onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-center font-bold"
                        />
                      </td>

                      <td className="py-2 px-3">
                        <select
                          value={item.unit}
                          onChange={e => updateItem(idx, { unit: e.target.value as ProductUnit })}
                          className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                        >
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>

                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={item.rate}
                          onChange={e => updateItem(idx, { rate: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-right font-bold"
                        />
                      </td>

                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={item.discountPercent}
                          onChange={e => updateItem(idx, { discountPercent: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-right"
                        />
                      </td>

                      <td className="py-2 px-3 text-right font-semibold text-slate-700">
                        {formatIndianCurrency(item.taxableAmount)}
                      </td>

                      <td className="py-2 px-3 text-center">
                        <select
                          value={item.gstRate}
                          onChange={e => updateItem(idx, { gstRate: Number(e.target.value) })}
                          className="w-full px-1.5 py-1 border border-slate-300 rounded bg-white font-medium text-center"
                        >
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>

                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {formatIndianCurrency(item.totalAmount)}
                      </td>

                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          disabled={items.length <= 1}
                          className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addItemRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              Add Another Line Item
            </button>
          </div>

          {/* Payment & Totals Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
            {/* Payment Details */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-900 text-xs">Payment Information</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount Paid Now (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max={totals.grandTotal}
                    value={amountPaidNow}
                    onChange={e => setAmountPaidNow(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentModeNow}
                    onChange={e => setPaymentModeNow(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="NEFT_RTGS">NEFT / RTGS</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payment Reference / UTR No</label>
                <input
                  type="text"
                  placeholder="e.g. UTR123456789 or Cheque #0045"
                  value={paymentRefNow}
                  onChange={e => setPaymentRefNow(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Purchase Notes</label>
                <textarea
                  rows={2}
                  placeholder="Notes or internal delivery references..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Sub Total (Taxable Amount):</span>
                  <span className="font-semibold text-slate-900">{formatIndianCurrency(totals.subTotal)}</span>
                </div>
                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Total Discount:</span>
                    <span>-{formatIndianCurrency(totals.totalDiscount)}</span>
                  </div>
                )}
                {totals.totalCgst > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Central GST (CGST):</span>
                    <span className="font-semibold">{formatIndianCurrency(totals.totalCgst)}</span>
                  </div>
                )}
                {totals.totalSgst > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>State GST (SGST):</span>
                    <span className="font-semibold">{formatIndianCurrency(totals.totalSgst)}</span>
                  </div>
                )}
                {totals.totalIgst > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Integrated GST (IGST):</span>
                    <span className="font-semibold">{formatIndianCurrency(totals.totalIgst)}</span>
                  </div>
                )}
                {totals.roundOff !== 0 && (
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>Round Off:</span>
                    <span>{totals.roundOff > 0 ? `+${totals.roundOff.toFixed(2)}` : totals.roundOff.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-300 flex justify-between text-sm font-bold text-slate-900">
                  <span>Grand Total:</span>
                  <span className="text-base text-blue-700">{formatIndianCurrency(totals.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>Amount Paid:</span>
                  <span className="text-emerald-700">{formatIndianCurrency(amountPaidNow)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-rose-700">
                  <span>Balance Due:</span>
                  <span>{formatIndianCurrency(Math.max(0, totals.grandTotal - amountPaidNow))}</span>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Save Inward Purchase Bill
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Purchase Bills</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{purchases.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Purchases Value</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{formatIndianCurrency(totalPurchasesAmount)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Outstanding Payables</p>
                <p className="text-xl font-bold text-rose-700 mt-0.5">{formatIndianCurrency(totalOutstandingPayables)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Bill Number, Supplier Name, or GSTIN..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PARTIAL">Partial</option>
                <option value="UNPAID">Unpaid</option>
              </select>

              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white"
                title="Start Date"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white"
                title="End Date"
              />
            </div>
          </div>

          {/* Purchase Bills Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Bill No</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">State</th>
                    <th className="py-3 px-4 text-right">Taxable</th>
                    <th className="py-3 px-4 text-right">GST Total</th>
                    <th className="py-3 px-4 text-right">Grand Total</th>
                    <th className="py-3 px-4 text-right">Balance Due</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-600">No inward purchase bills found</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;Record Inward Purchase Bill&quot; to add your vendor invoices.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map(b => {
                      const balance = Math.max(0, b.grandTotal - (b.amountPaid || 0));
                      const totalGst = (b.totalCgst || 0) + (b.totalSgst || 0) + (b.totalIgst || 0);

                      return (
                        <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {b.billNumber}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {b.billDate}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{b.partyName}</div>
                            {b.partyGstin && (
                              <div className="text-[10px] font-mono text-slate-500">{b.partyGstin}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {getStateName(b.placeOfSupply)} ({b.placeOfSupply})
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-700">
                            {formatIndianCurrency(b.subTotal)}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-600">
                            {formatIndianCurrency(totalGst)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            {formatIndianCurrency(b.grandTotal)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-rose-700">
                            {formatIndianCurrency(balance)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              b.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                              b.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex items-center gap-1">
                              {balance > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentModalBill(b);
                                    setPaymentAmount(balance);
                                    setPaymentRef('');
                                    setPaymentNotes('');
                                  }}
                                  title="Record Payment Made"
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingBill(b)}
                                title="View Bill Details"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditForm(b)}
                                title="Edit"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePurchase(b)}
                                title="Delete"
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
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
        </>
      )}

      {/* Record Payment Modal */}
      {paymentModalBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5 text-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Record Payment to Supplier: {paymentModalBill.partyName}
            </h3>
            <p className="text-slate-500 mb-4">
              Bill No: <strong>{paymentModalBill.billNumber}</strong> • Balance Due: <strong>{formatIndianCurrency(paymentModalBill.grandTotal - (paymentModalBill.amountPaid || 0))}</strong>
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payment Amount (₹)*</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(Number(e.target.value))}
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
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="NEFT_RTGS">NEFT / RTGS</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reference / UTR / Cheque Number</label>
                <input
                  type="text"
                  placeholder="e.g. UTR9823412"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payment Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes..."
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalBill(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Bill Details Modal */}
      {viewingBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl p-6 text-xs space-y-4">
            <div className="flex justify-between items-start pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  Inward Purchase Bill
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  Bill #{viewingBill.billNumber}
                </h3>
                <p className="text-slate-500">
                  Supplier: <strong>{viewingBill.partyName}</strong> • Date: <strong>{viewingBill.billDate}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingBill(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <p className="text-slate-500 font-medium">Supplier Details:</p>
                <p className="font-semibold text-slate-900">{viewingBill.partyName}</p>
                {viewingBill.partyGstin && <p className="font-mono text-slate-600">GSTIN: {viewingBill.partyGstin}</p>}
                {viewingBill.partyAddress && <p className="text-slate-500">{viewingBill.partyAddress}</p>}
              </div>
              <div>
                <p className="text-slate-500 font-medium">Bill Summary:</p>
                <p>Place of Supply: <strong>{getStateName(viewingBill.placeOfSupply)} ({viewingBill.placeOfSupply})</strong></p>
                <p>Status: <strong className="text-emerald-700">{viewingBill.status}</strong></p>
                <p>Amount Paid: <strong>{formatIndianCurrency(viewingBill.amountPaid)}</strong></p>
                <p>Balance Due: <strong className="text-rose-700">{formatIndianCurrency(Math.max(0, viewingBill.grandTotal - viewingBill.amountPaid))}</strong></p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-3">HSN</th>
                    <th className="py-2 px-3 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Rate</th>
                    <th className="py-2 px-3 text-center">GST</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewingBill.items.map(item => (
                    <tr key={item.id}>
                      <td className="py-2 px-3 font-medium text-slate-900">{item.name}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{item.hsn || '-'}</td>
                      <td className="py-2 px-3 text-center">{item.quantity} {item.unit}</td>
                      <td className="py-2 px-3 text-right">{formatIndianCurrency(item.rate)}</td>
                      <td className="py-2 px-3 text-center">{item.gstRate}%</td>
                      <td className="py-2 px-3 text-right font-bold">{formatIndianCurrency(item.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-slate-500">Grand Total: <strong className="text-slate-900 text-sm">{formatIndianCurrency(viewingBill.grandTotal)}</strong></span>
              <button
                type="button"
                onClick={() => setViewingBill(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HSN Modal Picker for line item */}
      {hsnModalIndex !== null && (
        <HsnCatalogModal
          isOpen={true}
          onClose={() => setHsnModalIndex(null)}
          onSelect={selected => {
            updateItem(hsnModalIndex, {
              hsn: selected.code,
              gstRate: selected.gstRate
            });
            setHsnModalIndex(null);
          }}
        />
      )}
    </div>
  );
};
