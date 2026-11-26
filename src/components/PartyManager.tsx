import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Users, Plus, Search, Edit2, Trash2, CheckCircle2, XCircle, 
  RefreshCw, Phone, Mail, Building, AlertCircle, BookOpen 
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import { Party, PartyType, GstStatus, UserSession, BusinessProfile } from '../types';
import { STATE_OPTIONS, getStateName } from '../utils/gstEngine';
import { fetchGstinDetails, parseGstinLocally } from '../utils/gstinLookup';
import { isSupabaseConfigured } from '../utils/supabase';
import { pushToCloud } from '../utils/cloudSync';
import { PartyLedgerModal } from './PartyLedgerModal';

interface PartyManagerProps {
  session: UserSession;
  profile: BusinessProfile;
  onSelectPartyForDoc?: (party: Party) => void;
}

export const PartyManager: React.FC<PartyManagerProps> = ({ session, profile, onSelectPartyForDoc }) => {
  const parties = useLiveQuery(
    () => db.parties.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'customer' | 'vendor'>('ALL');
  
  // Ledger Modal State
  const [ledgerParty, setLedgerParty] = useState<Party | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    tradeName: string;
    type: PartyType;
    gstin: string;
    phone: string;
    email: string;
    billingAddress: string;
    shippingAddress: string;
    city: string;
    pincode: string;
    stateCode: string;
    gstStatus: GstStatus;
    openingBalance: number;
    openingBalanceType: 'DEBIT' | 'CREDIT';
  }>({
    name: '',
    tradeName: '',
    type: 'customer',
    gstin: '',
    phone: '',
    email: '',
    billingAddress: '',
    shippingAddress: '',
    city: '',
    pincode: '',
    stateCode: '09', // Uttar Pradesh default
    gstStatus: 'Pending',
    openingBalance: 0,
    openingBalanceType: 'DEBIT'
  });

  const [isFetchingGstin, setIsFetchingGstin] = useState(false);
  const [gstinMessage, setGstinMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' | 'info' } | null>(null);

  const resetForm = () => {
    setFormData({
      name: '',
      tradeName: '',
      type: 'customer',
      gstin: '',
      phone: '',
      email: '',
      billingAddress: '',
      shippingAddress: '',
      city: '',
      pincode: '',
      stateCode: profile?.stateCode || '09',
      gstStatus: 'Pending',
      openingBalance: 0,
      openingBalanceType: 'DEBIT'
    });
    setEditingPartyId(null);
    setGstinMessage(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (party: Party) => {
    setEditingPartyId(party.id);
    setFormData({
      name: party.name,
      tradeName: party.tradeName || '',
      type: party.type,
      gstin: party.gstin || '',
      phone: party.phone || '',
      email: party.email || '',
      billingAddress: party.billingAddress || '',
      shippingAddress: party.shippingAddress || party.billingAddress || '',
      city: party.city || '',
      pincode: party.pincode || '',
      stateCode: party.stateCode || profile?.stateCode || '09',
      gstStatus: party.gstStatus || 'Pending',
      openingBalance: party.openingBalance || 0,
      openingBalanceType: party.openingBalanceType || 'DEBIT'
    });
    setGstinMessage(null);
    setIsModalOpen(true);
  };

  const handleGstinLookup = async (inputGstin?: string) => {
    const clean = (inputGstin || formData.gstin).trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!clean) {
      setGstinMessage({
        text: 'Please enter a 15-character GSTIN to look up.',
        type: 'warning'
      });
      return;
    }

    if (clean.length !== 15) {
      setGstinMessage({
        text: `GSTIN must be exactly 15 characters (currently ${clean.length}).`,
        type: 'warning'
      });
      return;
    }

    setIsFetchingGstin(true);
    setGstinMessage(null);

    try {
      const result = await fetchGstinDetails(clean);

      if (result.error && !result.stateCode) {
        setGstinMessage({
          text: result.error,
          type: 'error'
        });
        return;
      }

      const legalOrName = result.legalName || result.companyName || result.fullName || '';
      const trade = result.tradeName || result.companyName || '';
      const formattedAddress = result.address || [result.addressLine1, result.addressLine2, result.city, result.pincode].filter(Boolean).join(', ');

      setFormData(prev => ({
        ...prev,
        gstin: clean,
        name: legalOrName || prev.name,
        tradeName: trade || prev.tradeName,
        billingAddress: formattedAddress || prev.billingAddress,
        shippingAddress: prev.shippingAddress ? prev.shippingAddress : (formattedAddress || prev.billingAddress),
        city: result.city || prev.city,
        pincode: result.pincode || prev.pincode,
        stateCode: result.stateCode || prev.stateCode,
        gstStatus: result.status
      }));

      if (result.isCached) {
        setGstinMessage({
          text: result.helperMessage || 'Loaded instantly from local offline cache (0 API credits used).',
          type: 'info'
        });
      } else if (result.isLiveFetched) {
        setGstinMessage({
          text: `Verified via GST Portal: ${trade || legalOrName || 'Active Taxpayer'} (${result.status})`,
          type: result.status === 'Active' ? 'success' : 'warning'
        });
      } else {
        setGstinMessage({
          text: result.helperMessage || `State & PAN Auto-detected (${result.stateName}, PAN: ${result.pan}). Please complete address manually if needed.`,
          type: 'warning'
        });
      }
    } catch (err: unknown) {
      const local = parseGstinLocally(clean);
      if (local.isValid) {
        setFormData(prev => ({
          ...prev,
          stateCode: local.stateCode,
          gstStatus: 'Verified'
        }));
        setGstinMessage({
          text: `State & PAN Auto-detected (${local.stateName}, PAN: ${local.pan}). Enter remaining details manually.`,
          type: 'warning'
        });
      } else {
        const errorText = err instanceof Error ? err.message : String(err);
        setGstinMessage({
          text: `Lookup failed: ${errorText}. You can enter customer details manually.`,
          type: 'error'
        });
      }
    } finally {
      setIsFetchingGstin(false);
    }
  };

  const handleGstinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
    setFormData(prev => ({ ...prev, gstin: value }));
    setGstinMessage(null);

    // Auto-detect state code from first 2 digits
    if (value.length >= 2) {
      const stateCode = value.substring(0, 2);
      if (STATE_OPTIONS.some(s => s.code === stateCode)) {
        setFormData(prev => ({ ...prev, stateCode }));
      }
    }

    // Auto-fetch if 15 characters entered on new customer when name is not yet typed
    if (value.length === 15 && !formData.name.trim() && !editingPartyId) {
      handleGstinLookup(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Party Name is required.');
      return;
    }

    const partyRecord: Party = {
      id: editingPartyId || `pty-${Date.now()}`,
      userId: session.userId,
      name: formData.name.trim(),
      tradeName: formData.tradeName.trim(),
      type: formData.type,
      gstin: formData.gstin.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      billingAddress: formData.billingAddress.trim(),
      shippingAddress: (formData.shippingAddress || formData.billingAddress).trim(),
      city: formData.city.trim(),
      pincode: formData.pincode.trim(),
      stateCode: formData.stateCode,
      gstStatus: formData.gstin ? (formData.gstStatus || 'Verified') : 'Unregistered',
      openingBalance: Number(formData.openingBalance) || 0,
      openingBalanceType: formData.openingBalanceType,
      createdAt: new Date().toISOString()
    };

    if (editingPartyId) {
      await db.parties.update(editingPartyId, partyRecord);
      await logAudit({
        userId: session.userId,
        action: 'PARTY_UPDATED',
        entityType: 'PARTY',
        entityId: partyRecord.id,
        title: `Updated ${partyRecord.type}: ${partyRecord.name}`,
        details: `Updated details for ${partyRecord.name} (GSTIN: ${partyRecord.gstin || 'None'}).`
      });
    } else {
      await db.parties.add(partyRecord);
      await logAudit({
        userId: session.userId,
        action: 'PARTY_CREATED',
        entityType: 'PARTY',
        entityId: partyRecord.id,
        title: `Added New ${partyRecord.type}: ${partyRecord.name}`,
        details: `Created ${partyRecord.type} record for ${partyRecord.name} (${partyRecord.stateCode}).`
      });
    }

    setIsModalOpen(false);
    resetForm();

    if (isSupabaseConfigured() && session?.userId) {
      pushToCloud(session.userId).catch(console.warn);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      await db.parties.delete(id);
      await logAudit({
        userId: session.userId,
        action: 'PARTY_DELETED',
        entityType: 'PARTY',
        entityId: id,
        title: `Deleted Party: ${name}`,
        details: `Removed party record for ${name}.`
      });

      if (isSupabaseConfigured() && session?.userId) {
        pushToCloud(session.userId).catch(console.warn);
      }
    }
  };

  const filteredParties = parties.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.tradeName && p.tradeName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.gstin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm);

    const matchesType = filterType === 'ALL' || p.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Party Master (Customers &amp; Suppliers)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Store buyer &amp; supplier GSTINs, addresses, states, and view running transaction ledgers.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add New Party
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search party by name, trade name, GSTIN, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-500 font-medium">Type:</span>
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-medium">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 rounded-md transition-colors ${filterType === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              All ({parties.length})
            </button>
            <button
              onClick={() => setFilterType('customer')}
              className={`px-3 py-1 rounded-md transition-colors ${filterType === 'customer' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Customers ({parties.filter(p => p.type === 'customer').length})
            </button>
            <button
              onClick={() => setFilterType('vendor')}
              className={`px-3 py-1 rounded-md transition-colors ${filterType === 'vendor' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Vendors ({parties.filter(p => p.type === 'vendor').length})
            </button>
          </div>
        </div>
      </div>

      {/* Parties Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Party Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">GSTIN &amp; Status</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredParties.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <Building className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No parties added yet. Click &quot;Add New Party&quot; to save your customers and suppliers.
                  </td>
                </tr>
              ) : (
                filteredParties.map(party => (
                  <tr key={party.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{party.name}</div>
                      {party.tradeName && party.tradeName !== party.name && (
                        <div className="text-[11px] text-slate-600 font-medium">{party.tradeName}</div>
                      )}
                      <div className="text-xs text-slate-500 max-w-xs truncate">{party.billingAddress || 'No address'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        party.type === 'customer' 
                          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}>
                        {party.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {party.gstin ? (
                        <div>
                          <div className="font-mono text-xs font-bold text-slate-800">{party.gstin}</div>
                          <div className="mt-0.5">
                            {party.gstStatus === 'Active' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                                <CheckCircle2 className="w-3 h-3" /> Active
                              </span>
                            )}
                            {party.gstStatus === 'Cancelled' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                                <XCircle className="w-3 h-3" /> Cancelled
                              </span>
                            )}
                            {(!party.gstStatus || party.gstStatus === 'Verified') && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Validated
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Unregistered / Consumer</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <span className="font-bold text-slate-900">{party.stateCode}</span> - {getStateName(party.stateCode)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 space-y-0.5">
                      {party.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{party.phone}</span>
                        </div>
                      )}
                      {party.email && (
                        <div className="flex items-center gap-1 text-slate-500">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[140px]">{party.email}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLedgerParty(party)}
                          className="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200 transition-colors inline-flex items-center gap-1"
                        >
                          <BookOpen className="w-3 h-3" />
                          Ledger
                        </button>
                        {onSelectPartyForDoc && (
                          <button
                            type="button"
                            onClick={() => onSelectPartyForDoc(party)}
                            className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors"
                          >
                            Use in Doc
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(party)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit Party"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(party.id, party.name)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="Delete Party"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Party Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 text-xs">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingPartyId 
                  ? `Edit ${formData.type === 'customer' ? 'Customer (Buyer)' : 'Vendor (Supplier)'}` 
                  : `Add New ${formData.type === 'customer' ? 'Customer (Buyer)' : 'Vendor (Supplier)'}`}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Party Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as PartyType }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="customer">Customer (Buyer)</option>
                    <option value="vendor">Vendor (Supplier)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Party GSTIN (Optional)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        maxLength={15}
                        placeholder="e.g. 08ABNCS1711R1ZQ"
                        value={formData.gstin}
                        onChange={handleGstinChange}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono uppercase text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      {formData.gstStatus && formData.gstStatus !== 'Pending' && formData.gstin.length === 15 && (
                        <span className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-bold ${
                          formData.gstStatus === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                          formData.gstStatus === 'Verified' ? 'bg-blue-100 text-blue-800' :
                          'bg-rose-100 text-rose-800'
                        }`}>
                          {formData.gstStatus}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleGstinLookup(formData.gstin)}
                      disabled={isFetchingGstin || formData.gstin.trim().length < 2}
                      className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs transition-colors border border-blue-200 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
                      title="Fetch legal name, trade name, and registered address from GST Portal"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isFetchingGstin ? 'animate-spin' : ''}`} />
                      <span>{isFetchingGstin ? 'Fetching...' : 'Auto-Fill'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {gstinMessage && (
                <div className={`p-2.5 rounded-lg border text-[11px] font-medium flex items-center gap-2 ${
                  gstinMessage.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : gstinMessage.type === 'info'
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : gstinMessage.type === 'warning'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {gstinMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{gstinMessage.text}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Legal / Company Name*</label>
                  <input
                    type="text"
                    required
                    placeholder="Registered Legal Name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Trade Name</label>
                  <input
                    type="text"
                    placeholder="Trade / Brand Name"
                    value={formData.tradeName}
                    onChange={(e) => setFormData(prev => ({ ...prev, tradeName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="party@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Billing / Registered Address</label>
                <textarea
                  rows={2}
                  placeholder="Street, locality, building name"
                  value={formData.billingAddress}
                  onChange={(e) => setFormData(prev => ({ ...prev, billingAddress: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">State* (Place of Supply)</label>
                  <select
                    value={formData.stateCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, stateCode: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs"
                  >
                    {STATE_OPTIONS.map(s => (
                      <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">City / District</label>
                  <input
                    type="text"
                    placeholder="e.g. Kanpur"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Pincode</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 208001"
                    value={formData.pincode}
                    onChange={(e) => setFormData(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '') }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Opening Balance (₹)</label>
                <div className="flex gap-2 max-w-sm">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.openingBalance}
                    onChange={(e) => setFormData(prev => ({ ...prev, openingBalance: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold"
                  />
                  <select
                    value={formData.openingBalanceType}
                    onChange={(e) => setFormData(prev => ({ ...prev, openingBalanceType: e.target.value as 'DEBIT' | 'CREDIT' }))}
                    className="px-2 py-2 border border-slate-200 rounded-lg bg-white font-semibold text-xs"
                  >
                    <option value="DEBIT">Dr (Receivable)</option>
                    <option value="CREDIT">Cr (Payable)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm"
                >
                  {editingPartyId ? 'Save Changes' : 'Create Party'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Party Running Ledger Modal */}
      {ledgerParty && (
        <PartyLedgerModal
          isOpen={true}
          onClose={() => setLedgerParty(null)}
          party={ledgerParty}
          profile={profile}
        />
      )}
    </div>
  );
};
