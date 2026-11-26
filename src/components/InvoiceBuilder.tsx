import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  FileText, Plus, Trash2, ArrowLeft, Save, Truck, BookOpen, 
  RefreshCw, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import { 
  Document, DocumentItem, DocumentType, PaymentStatus, 
  ProductUnit, BusinessProfile, UserSession 
} from '../types';
import { 
  STATE_OPTIONS, calculateItemTaxes, 
  calculateDocumentTotals, formatIndianCurrency 
} from '../utils/gstEngine';
import { numberToIndianWords } from '../utils/numberToWords';
import { fetchGstinDetails } from '../utils/gstinLookup';
import { HsnCatalogModal } from './HsnCatalogModal';

const UNIT_OPTIONS: ProductUnit[] = ['PCS', 'BOX', 'KG', 'LTR', 'SET', 'MTR', 'NOS', 'UNIT'];
const GST_RATES = [0, 5, 12, 18, 28];

const ALL_DOC_TYPES: { type: DocumentType; label: string }[] = [
  { type: 'INVOICE', label: 'Tax Invoice' },
  { type: 'QUOTATION', label: 'Quotation' },
  { type: 'PROFORMA', label: 'Proforma' },
  { type: 'CHALLAN', label: 'Challan' },
  { type: 'CREDIT_NOTE', label: 'Credit Note' },
  { type: 'DEBIT_NOTE', label: 'Debit Note' },
  { type: 'PURCHASE_ORDER', label: 'Purchase Order' }
];

interface InvoiceBuilderProps {
  session: UserSession;
  profile: BusinessProfile;
  initialDocType?: DocumentType;
  editingDocument?: Document | null;
  onSaved: (savedDoc: Document) => void;
  onCancel: () => void;
}

export const InvoiceBuilder: React.FC<InvoiceBuilderProps> = ({
  session,
  profile,
  initialDocType = 'INVOICE',
  editingDocument,
  onSaved,
  onCancel
}) => {
  const parties = useLiveQuery(
    () => db.parties.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  const products = useLiveQuery(
    () => db.products.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  const allDocs = useLiveQuery(
    () => db.documents.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  const [docType, setDocType] = useState<DocumentType>(editingDocument?.docType || initialDocType);
  const [docNumber, setDocNumber] = useState<string>(editingDocument?.docNumber || '');
  const [date, setDate] = useState<string>(editingDocument?.date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(
    editingDocument?.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  );

  // Party details
  const [partyId, setPartyId] = useState<string>(editingDocument?.partyId || '');
  const [partyName, setPartyName] = useState<string>(editingDocument?.partyName || '');
  const [partyGstin, setPartyGstin] = useState<string>(editingDocument?.partyGstin || '');
  const [partyAddress, setPartyAddress] = useState<string>(editingDocument?.partyAddress || '');
  const [partyPhone, setPartyPhone] = useState<string>(editingDocument?.partyPhone || '');
  const [shippingAddress, setShippingAddress] = useState<string>(editingDocument?.shippingAddress || '');
  const [placeOfSupply, setPlaceOfSupply] = useState<string>(editingDocument?.placeOfSupply || profile?.stateCode || '09');

  // HSN Directory Modal
  const [hsnModalIndex, setHsnModalIndex] = useState<number | null>(null);

  // Items
  const [items, setItems] = useState<DocumentItem[]>(
    editingDocument?.items || [
      {
        id: `item-${Date.now()}`,
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
    ]
  );

  // Transport details
  const [showTransport, setShowTransport] = useState<boolean>(Boolean(editingDocument?.transportDetails?.ewayBillNo));
  const [ewayBillNo, setEwayBillNo] = useState<string>(editingDocument?.transportDetails?.ewayBillNo || '');
  const [vehicleNo, setVehicleNo] = useState<string>(editingDocument?.transportDetails?.vehicleNo || '');
  const [transporterName, setTransporterName] = useState<string>(editingDocument?.transportDetails?.transporterName || '');
  const [lrNo, setLrNo] = useState<string>(editingDocument?.transportDetails?.lrNo || '');

  // Payment status
  const [status, setStatus] = useState<PaymentStatus>(editingDocument?.status || 'UNPAID');
  const [amountPaid, setAmountPaid] = useState<number>(editingDocument?.amountPaid || 0);

  // Notes & terms
  const [notes, setNotes] = useState<string>(
    editingDocument?.notes !== undefined ? editingDocument.notes : 'Thank you for your business!'
  );
  const [terms, setTerms] = useState<string>(
    editingDocument?.terms || profile?.termsAndConditions || ''
  );

  // Buyer GSTIN Lookup state
  const [isFetchingBuyerGstin, setIsFetchingBuyerGstin] = useState(false);
  const [buyerGstinFeedback, setBuyerGstinFeedback] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error' | 'info';
  } | null>(null);

  const handleBuyerGstinLookup = async (inputGstin: string) => {
    const clean = inputGstin.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!clean) {
      setBuyerGstinFeedback({ text: 'Please enter a 15-character GSTIN to auto-fill.', type: 'warning' });
      return;
    }
    if (clean.length !== 15) {
      setBuyerGstinFeedback({ text: `GSTIN must be 15 characters (currently ${clean.length}).`, type: 'warning' });
      return;
    }

    setIsFetchingBuyerGstin(true);
    setBuyerGstinFeedback(null);

    try {
      const result = await fetchGstinDetails(clean);
      const legalOrName = result.legalName || result.companyName || result.fullName || '';
      const formattedAddress = result.address || [result.addressLine1, result.addressLine2, result.city, result.pincode].filter(Boolean).join(', ');

      if (legalOrName) {
        setPartyName(legalOrName);
      }
      if (formattedAddress) {
        setPartyAddress(formattedAddress);
        if (!shippingAddress || shippingAddress === partyAddress) {
          setShippingAddress(formattedAddress);
        }
      }
      if (result.stateCode) {
        handlePlaceOfSupplyChange(result.stateCode);
      }

      if (result.isLiveFetched) {
        setBuyerGstinFeedback({
          text: `Verified via GST Portal: ${legalOrName || 'Active Taxpayer'} (${result.status})`,
          type: result.status === 'Active' ? 'success' : 'warning'
        });
      } else if (result.isCached) {
        setBuyerGstinFeedback({
          text: result.helperMessage || 'Auto-filled from local offline cache (0 API credits used).',
          type: 'info'
        });
      } else {
        setBuyerGstinFeedback({
          text: `State & PAN Auto-detected (${result.stateName}, PAN: ${result.pan}).`,
          type: 'success'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBuyerGstinFeedback({
        text: `Lookup failed: ${msg}. Enter details manually.`,
        type: 'error'
      });
    } finally {
      setIsFetchingBuyerGstin(false);
    }
  };

  // Auto-generate document number using Indian FY
  useEffect(() => {
    if (!editingDocument && profile) {
      const docDate = date ? new Date(date) : new Date();
      const month = docDate.getMonth(); // 0 = Jan, 3 = April
      const fullYear = docDate.getFullYear();
      const startYear = month >= 3 ? fullYear : fullYear - 1;
      const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
      const fy = `${String(startYear % 100).padStart(2, '0')}-${endYearShort}`; // e.g. "26-27"

      let typePrefix = 'INV';
      switch (docType) {
        case 'QUOTATION': typePrefix = 'QTN'; break;
        case 'PROFORMA': typePrefix = 'PI'; break;
        case 'CHALLAN': typePrefix = 'DC'; break;
        case 'CREDIT_NOTE': typePrefix = 'CN'; break;
        case 'DEBIT_NOTE': typePrefix = 'DN'; break;
        case 'PURCHASE_ORDER': typePrefix = 'PO'; break;
        case 'INVOICE':
        default:
          typePrefix = profile.invoicePrefix ? profile.invoicePrefix.replace(/\/.*$/, '') : 'INV';
          break;
      }

      const matchingDocs = allDocs.filter(d => d.docType === docType);
      const nextNum = String(matchingDocs.length + 1).padStart(3, '0');
      setDocNumber(`${typePrefix}/${fy}/${nextNum}`);
    }
  }, [docType, profile, editingDocument, allDocs.length, date]);

  useEffect(() => {
    if (!terms && profile?.termsAndConditions) {
      setTerms(profile.termsAndConditions);
    }
    if (!editingDocument && profile?.stateCode && !placeOfSupply) {
      setPlaceOfSupply(profile.stateCode);
    }
  }, [profile, editingDocument, terms, placeOfSupply]);

  // Recalculate item line taxes
  const updateItem = (index: number, patch: Partial<DocumentItem>) => {
    setItems(prevItems => {
      const updated = [...prevItems];
      const current = { ...updated[index], ...patch };

      const sellerState = profile?.stateCode || '09';
      const isComposition = profile?.taxScheme === 'COMPOSITION';
      const taxes = calculateItemTaxes({
        quantity: current.quantity,
        rate: current.rate,
        discountPercent: current.discountPercent,
        gstRate: current.gstRate,
        sellerStateCode: sellerState,
        placeOfSupply: placeOfSupply,
        isComposition
      });

      updated[index] = {
        ...current,
        ...taxes
      };
      return updated;
    });
  };

  const handlePlaceOfSupplyChange = (newPos: string) => {
    setPlaceOfSupply(newPos);
    const sellerState = profile?.stateCode || '09';
    const isComposition = profile?.taxScheme === 'COMPOSITION';

    setItems(prev => prev.map(item => {
      const taxes = calculateItemTaxes({
        quantity: item.quantity,
        rate: item.rate,
        discountPercent: item.discountPercent,
        gstRate: item.gstRate,
        sellerStateCode: sellerState,
        placeOfSupply: newPos,
        isComposition
      });
      return { ...item, ...taxes };
    }));
  };

  const handleSelectParty = (selectedId: string) => {
    setPartyId(selectedId);
    const party = parties.find(p => p.id === selectedId);
    if (party) {
      setPartyName(party.name);
      setPartyGstin(party.gstin || '');
      setPartyAddress(party.billingAddress || '');
      setPartyPhone(party.phone || '');
      setShippingAddress(party.shippingAddress || party.billingAddress || '');
      if (party.stateCode) {
        handlePlaceOfSupplyChange(party.stateCode);
      }
    }
  };

  const handleSelectProduct = (index: number, prodId: string) => {
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      updateItem(index, {
        productId: prod.id,
        name: prod.name,
        sku: prod.sku,
        hsn: prod.hsn,
        unit: prod.unit,
        rate: prod.salePrice,
        gstRate: prod.gstRate
      });
    }
  };

  const addItemRow = () => {
    const sellerState = profile?.stateCode || '09';
    const isComposition = profile?.taxScheme === 'COMPOSITION';
    const taxes = calculateItemTaxes({
      quantity: 1,
      rate: 0,
      discountPercent: 0,
      gstRate: 18,
      sellerStateCode: sellerState,
      placeOfSupply,
      isComposition
    });

    setItems(prev => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length}`,
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

  // Live document totals
  const totals = calculateDocumentTotals(items);
  const isIntraState = placeOfSupply === (profile?.stateCode || '09');

  const handlePaymentStatusChange = (newStatus: PaymentStatus) => {
    setStatus(newStatus);
    if (newStatus === 'PAID') {
      setAmountPaid(totals.grandTotal);
    } else if (newStatus === 'UNPAID' || newStatus === 'DRAFT') {
      setAmountPaid(0);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!partyName.trim()) {
      alert('Please enter or select a buyer / customer name.');
      return;
    }

    if (items.some(i => !i.name.trim())) {
      alert('All line items must have a description or item name.');
      return;
    }

    const docId = editingDocument?.id || `doc-${Date.now()}`;
    const now = new Date().toISOString();
    const cleanDocNumber = docNumber.trim();

    // Prevent duplicate document numbers within the same document type for this business
    const duplicateDoc = allDocs.find(d => 
      d.docType === docType && 
      d.docNumber.trim().toLowerCase() === cleanDocNumber.toLowerCase() && 
      d.id !== docId
    );

    if (duplicateDoc) {
      alert(`A ${docType} with number "${cleanDocNumber}" already exists. Document numbers must be unique.`);
      return;
    }

    const docToSave: Document = {
      id: docId,
      userId: session.userId,
      docType,
      docNumber: cleanDocNumber,
      date,
      dueDate,
      partyId: partyId || `party-adhoc-${Date.now()}`,
      partyName: partyName.trim(),
      partyGstin: partyGstin.trim(),
      partyAddress: partyAddress.trim(),
      partyPhone: partyPhone.trim(),
      shippingAddress: (shippingAddress || partyAddress).trim(),
      placeOfSupply,
      items,
      ...totals,
      amountPaid: Number(amountPaid) || 0,
      status,
      transportDetails: showTransport ? {
        ewayBillNo: ewayBillNo.trim(),
        vehicleNo: vehicleNo.trim(),
        transporterName: transporterName.trim(),
        lrNo: lrNo.trim()
      } : undefined,
      notes: notes.trim(),
      terms: terms.trim(),
      createdAt: editingDocument?.createdAt || now,
      updatedAt: now
    };

    // Inventory stock update & payment record logic
    await db.transaction('rw', [db.documents, db.products, db.paymentTransactions], async () => {
      // Revert stock for edited document
      if (editingDocument) {
        if (editingDocument.docType === 'INVOICE' || editingDocument.docType === 'DEBIT_NOTE') {
          for (const oldItem of editingDocument.items) {
            if (oldItem.productId) {
              const p = await db.products.get(oldItem.productId);
              if (p) {
                await db.products.update(p.id, { stock: p.stock + oldItem.quantity });
              }
            }
          }
        } else if (editingDocument.docType === 'CREDIT_NOTE') {
          for (const oldItem of editingDocument.items) {
            if (oldItem.productId) {
              const p = await db.products.get(oldItem.productId);
              if (p) {
                await db.products.update(p.id, { stock: Math.max(0, p.stock - oldItem.quantity) });
              }
            }
          }
        }
      }

      // Apply new stock adjustments
      if (docType === 'INVOICE' || docType === 'DEBIT_NOTE') {
        for (const newItem of items) {
          if (newItem.productId) {
            const p = await db.products.get(newItem.productId);
            if (p) {
              await db.products.update(p.id, { stock: Math.max(0, p.stock - newItem.quantity) });
            }
          }
        }
      } else if (docType === 'CREDIT_NOTE') {
        for (const newItem of items) {
          if (newItem.productId) {
            const p = await db.products.get(newItem.productId);
            if (p) {
              await db.products.update(p.id, { stock: p.stock + newItem.quantity });
            }
          }
        }
      }

      // If document is newly created with initial payment, sync to paymentTransactions
      if (!editingDocument && docToSave.amountPaid > 0) {
        await db.paymentTransactions.add({
          id: `pay-${Date.now()}`,
          userId: session.userId,
          partyId: docToSave.partyId,
          partyName: docToSave.partyName,
          partyType: 'customer',
          documentId: docToSave.id,
          docNumber: docToSave.docNumber,
          type: 'PAYMENT_RECEIVED',
          amount: docToSave.amountPaid,
          paymentMethod: 'UPI',
          referenceNumber: `Payment on ${docToSave.docNumber}`,
          date: docToSave.date,
          notes: 'Recorded at invoice creation',
          createdAt: now
        });
      }

      await db.documents.put(docToSave);
    });

    // Write real audit history log
    await logAudit({
      userId: session.userId,
      action: editingDocument ? 'INVOICE_UPDATED' : 'INVOICE_CREATED',
      entityType: 'DOCUMENT',
      entityId: docToSave.id,
      title: `${editingDocument ? 'Updated' : 'Created'} ${docType}: ${docToSave.docNumber}`,
      details: `${docType} for ${docToSave.partyName} (₹${docToSave.grandTotal.toFixed(2)}).`
    });

    onSaved(docToSave);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Doc Type Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-600" />
              {editingDocument ? `Edit ${docType}` : `Create New Document`}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Seller: {profile.companyName || profile.name} ({profile.stateCode}) • Scheme: {profile.taxScheme || 'Regular'}
            </p>
          </div>
        </div>

        {/* Document Type Selector Tabs */}
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
          {ALL_DOC_TYPES.map(item => (
            <button
              key={item.type}
              type="button"
              onClick={() => setDocType(item.type)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                docType === item.type
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Document Meta & Party Details */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Document Number *
              </label>
              <input
                type="text"
                required
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Document Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Place of Supply *
              </label>
              <select
                value={placeOfSupply}
                onChange={(e) => handlePlaceOfSupplyChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              >
                {STATE_OPTIONS.map(s => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="text-[11px] font-medium mt-1">
                {isIntraState ? (
                  <span className="text-emerald-600">Intra-State: CGST + SGST (50/50)</span>
                ) : (
                  <span className="text-blue-600">Inter-State: IGST (100%)</span>
                )}
              </div>
            </div>
          </div>

          {/* Party Details Selection */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Buyer / Customer Details
              </label>
              <div className="w-64">
                <select
                  value={partyId}
                  onChange={(e) => handleSelectParty(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700"
                >
                  <option value="">-- Quick Load Saved Party --</option>
                  {parties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.gstin || 'Unregistered'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Party / Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sharma Enterprise"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-medium text-slate-600">Party GSTIN (Optional)</label>
                  <button
                    type="button"
                    onClick={() => handleBuyerGstinLookup(partyGstin)}
                    disabled={isFetchingBuyerGstin || partyGstin.trim().length < 2}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40 inline-flex items-center gap-1"
                    title="Fetch buyer name & address from GSTIN"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetchingBuyerGstin ? 'animate-spin' : ''}`} />
                    <span>{isFetchingBuyerGstin ? 'Fetching...' : 'Auto-Fill'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="15-digit GSTIN"
                  value={partyGstin}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
                    setPartyGstin(val);
                    setBuyerGstinFeedback(null);
                    if (val.length === 15 && !partyName.trim()) {
                      handleBuyerGstinLookup(val);
                    } else if (val.length >= 2) {
                      const sc = val.substring(0, 2);
                      if (STATE_OPTIONS.some(s => s.code === sc)) {
                        handlePlaceOfSupplyChange(sc);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {buyerGstinFeedback && (
                  <div className={`mt-1.5 p-2 rounded text-[11px] font-medium flex items-center gap-1.5 ${
                    buyerGstinFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                    buyerGstinFeedback.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                    buyerGstinFeedback.type === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                    'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    {buyerGstinFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{buyerGstinFeedback.text}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 94140 00000"
                  value={partyPhone}
                  onChange={(e) => setPartyPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Billing Address</label>
                <textarea
                  rows={2}
                  placeholder="Street, City, Pincode"
                  value={partyAddress}
                  onChange={(e) => setPartyAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-medium text-slate-600">Shipping Address</label>
                  <button
                    type="button"
                    onClick={() => setShippingAddress(partyAddress)}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    Same as Billing
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Delivery address / warehouse"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Line Items &amp; Tax Calculation</h2>
              <p className="text-xs text-slate-500">Pick from inventory catalog or lookup verified HSN codes freely.</p>
            </div>
            <button
              type="button"
              onClick={addItemRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item Row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-2 w-8 text-center">#</th>
                  <th className="py-2.5 px-2 min-w-[200px]">Item Name / Description</th>
                  <th className="py-2.5 px-2 w-28">HSN / SAC</th>
                  <th className="py-2.5 px-2 w-20 text-right">Qty</th>
                  <th className="py-2.5 px-2 w-24">Unit</th>
                  <th className="py-2.5 px-2 w-24 text-right">Rate (₹)</th>
                  <th className="py-2.5 px-2 w-20 text-right">Disc %</th>
                  <th className="py-2.5 px-2 w-24 text-right">Taxable</th>
                  <th className="py-2.5 px-2 w-24 text-center">GST Slab</th>
                  <th className="py-2.5 px-2 w-24 text-right">Tax (₹)</th>
                  <th className="py-2.5 px-2 w-28 text-right">Total (₹)</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={item.id} className="align-top hover:bg-slate-50/50">
                    <td className="py-2.5 px-2 text-center text-slate-400 font-medium">
                      {index + 1}
                    </td>

                    <td className="py-2.5 px-2 space-y-1">
                      <input
                        type="text"
                        required
                        placeholder="Item description"
                        value={item.name}
                        onChange={(e) => updateItem(index, { name: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs font-medium border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <select
                        value={item.productId || ''}
                        onChange={(e) => handleSelectProduct(index, e.target.value)}
                        className="w-full text-[11px] text-slate-500 border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50"
                      >
                        <option value="">-- Choose from Catalog ({products.length}) --</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sku ? `[SKU: ${p.sku}]` : ''} (₹{p.salePrice} • {p.gstRate}% GST • Stock: {p.stock})
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="HSN"
                          value={item.hsn}
                          onChange={(e) => updateItem(index, { hsn: e.target.value })}
                          className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setHsnModalIndex(index)}
                          title="Browse HSN directory"
                          className="p-1 text-slate-400 hover:text-blue-600 rounded"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        required
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 text-xs text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                      />
                    </td>

                    <td className="py-2.5 px-2">
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(index, { unit: e.target.value as ProductUnit })}
                        className="w-full px-1.5 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        {UNIT_OPTIONS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={item.rate || ''}
                        onChange={(e) => updateItem(index, { rate: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 text-xs text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                      />
                    </td>

                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={item.discountPercent || ''}
                        onChange={(e) => updateItem(index, { discountPercent: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 text-xs text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    <td className="py-2.5 px-2 text-right font-medium tabular-nums text-slate-800">
                      {formatIndianCurrency(item.taxableAmount)}
                    </td>

                    <td className="py-2.5 px-2">
                      <select
                        value={item.gstRate}
                        onChange={(e) => updateItem(index, { gstRate: Number(e.target.value) })}
                        className="w-full px-1 py-1.5 text-xs text-center border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium"
                      >
                        {GST_RATES.map(r => (
                          <option key={r} value={r}>{r}%</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">
                      {formatIndianCurrency(item.cgstAmount + item.sgstAmount + item.igstAmount)}
                    </td>

                    <td className="py-2.5 px-2 text-right font-bold tabular-nums text-slate-900">
                      {formatIndianCurrency(item.totalAmount)}
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeItemRow(index)}
                        disabled={items.length <= 1}
                        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Calculation Summary & Transport & Payment Status */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Transport, Notes & Terms */}
          <div className="md:col-span-7 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-blue-600" />
                  E-Way Bill &amp; Transport Logistics
                </label>
                <button
                  type="button"
                  onClick={() => setShowTransport(!showTransport)}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  {showTransport ? 'Hide Logistics' : '+ Add E-Way Bill / Vehicle Details'}
                </button>
              </div>

              {showTransport && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">E-Way Bill Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 341209876543"
                      value={ewayBillNo}
                      onChange={(e) => setEwayBillNo(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Vehicle Number</label>
                    <input
                      type="text"
                      placeholder="e.g. RJ-14-GB-9876"
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                      className="w-full px-3 py-1.5 text-xs font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Transporter Name</label>
                    <input
                      type="text"
                      placeholder="e.g. VRL Logistics Ltd"
                      value={transporterName}
                      onChange={(e) => setTransporterName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">LR / RR Number</label>
                    <input
                      type="text"
                      placeholder="e.g. VRL-MUM-8912"
                      value={lrNo}
                      onChange={(e) => setLrNo(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Notes
                </label>
                <input
                  type="text"
                  placeholder="Notes shown on invoice..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Terms &amp; Conditions
                </label>
                <textarea
                  rows={2}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Tax Breakdown Box & Payment Status */}
          <div className="md:col-span-5 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider pb-2 border-b border-slate-100">
                Payment &amp; Tax Calculation Breakdown
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Taxable Subtotal:</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatIndianCurrency(totals.subTotal)}
                  </span>
                </div>

                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Total Discount:</span>
                    <span className="font-semibold tabular-nums">
                      - {formatIndianCurrency(totals.totalDiscount)}
                    </span>
                  </div>
                )}

                {isIntraState ? (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Total CGST:</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatIndianCurrency(totals.totalCgst)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Total SGST:</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatIndianCurrency(totals.totalSgst)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-slate-600">
                    <span>Total IGST:</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatIndianCurrency(totals.totalIgst)}
                    </span>
                  </div>
                )}

                {totals.roundOff !== 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Auto Round-Off:</span>
                    <span className="tabular-nums">
                      {totals.roundOff > 0 ? `+${totals.roundOff.toFixed(2)}` : totals.roundOff.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                  <span>Grand Total:</span>
                  <span className="text-base text-blue-700 tabular-nums">
                    {formatIndianCurrency(totals.grandTotal)}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] italic text-slate-700 leading-snug">
                  {numberToIndianWords(totals.grandTotal)}
                </div>
              </div>

              {/* Payment Status Selector */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Payment Status
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['PAID', 'PARTIAL', 'UNPAID', 'DRAFT'] as PaymentStatus[]).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handlePaymentStatusChange(st)}
                        className={`py-1.5 text-xs font-bold rounded border transition-colors ${
                          status === st
                            ? st === 'PAID' ? 'bg-emerald-600 text-white border-emerald-600' :
                              st === 'PARTIAL' ? 'bg-amber-600 text-white border-amber-600' :
                              st === 'UNPAID' ? 'bg-rose-600 text-white border-rose-600' :
                              'bg-slate-700 text-white border-slate-700'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Amount Paid (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max={totals.grandTotal}
                    value={amountPaid}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setAmountPaid(val);
                      if (val >= totals.grandTotal && totals.grandTotal > 0) {
                        setStatus('PAID');
                      } else if (val > 0) {
                        setStatus('PARTIAL');
                      } else {
                        setStatus('UNPAID');
                      }
                    }}
                    className="w-full px-3 py-2 text-sm font-semibold tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-slate-500">Balance Due:</span>
                    <span className="font-bold text-rose-700 tabular-nums">
                      {formatIndianCurrency(Math.max(0, totals.grandTotal - amountPaid))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-1/3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  Save {docType === 'INVOICE' ? 'Tax Invoice' : docType}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* HSN Directory Modal */}
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
