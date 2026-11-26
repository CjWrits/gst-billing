import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Search, CheckCircle2, AlertTriangle, Download, Upload, 
  Plus, X, BookOpen, Check, HelpCircle 
} from 'lucide-react';
import { db } from '../db/database';
import { HsnCatalogItem, GstRate, ProductClassification } from '../types';
import { VERIFIED_HSN_CATALOG } from '../utils/hsnCatalogData';

interface HsnCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: { code: string; gstRate: GstRate; category?: string; description?: string; type?: ProductClassification }) => void;
  initialSearch?: string;
}

export const HsnCatalogModal: React.FC<HsnCatalogModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialSearch = ''
}) => {
  const customCatalog = useLiveQuery(() => db.hsnCatalog.toArray()) || [];
  
  // Combine db catalog with static catalog (preferring db)
  const allItems = useMemo(() => {
    if (customCatalog.length > 0) return customCatalog;
    return VERIFIED_HSN_CATALOG;
  }, [customCatalog]);

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Custom addition form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newType, setNewType] = useState<ProductClassification>('GOODS');
  const [newRate, setNewRate] = useState<GstRate>(18);
  const [newNotes, setNewNotes] = useState('');

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of allItems) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set).sort();
  }, [allItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return allItems.filter(item => {
      const matchSearch = !term || 
        item.code.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term);

      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchType = selectedType === 'ALL' || item.type === selectedType;

      return matchSearch && matchCat && matchType;
    });
  }, [allItems, searchTerm, selectedCategory, selectedType]);

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newDesc.trim()) {
      alert('HSN/SAC Code and Description are required.');
      return;
    }

    const item: HsnCatalogItem = {
      id: `hsn-${Date.now()}`,
      code: newCode.trim(),
      description: newDesc.trim(),
      category: newCat.trim() || 'Custom',
      type: newType,
      gstRate: newRate,
      effectiveDate: new Date().toISOString().slice(0, 10),
      isVerified: true,
      notes: newNotes.trim() || 'Custom user entry'
    };

    await db.hsnCatalog.add(item);
    setShowAddForm(false);
    setNewCode('');
    setNewDesc('');
    setNewCat('');
    setNewNotes('');
  };

  const exportCatalogCsv = () => {
    const headers = ['Code', 'Type', 'Category', 'GST Rate %', 'Description', 'Verified', 'Notes'];
    const rows = allItems.map(i => [
      `"${i.code}"`,
      `"${i.type}"`,
      `"${i.category}"`,
      `"${i.gstRate}"`,
      `"${i.description.replace(/"/g, '""')}"`,
      `"${i.isVerified ? 'YES' : 'CONFIRM_REQUIRED'}"`,
      `"${(i.notes || '').replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HSN_SAC_Directory_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;

      const newEntries: HsnCatalogItem[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 4) {
          const code = parts[0];
          const type = (parts[1]?.toUpperCase() === 'SERVICES' ? 'SERVICES' : 'GOODS') as ProductClassification;
          const category = parts[2] || 'Imported';
          const rateNum = Number(parts[3]) || 18;
          const gstRate = ([0, 5, 12, 18, 28].includes(rateNum) ? rateNum : 18) as GstRate;
          const description = parts[4] || code;
          const notes = parts[6] || 'Imported from CSV';

          newEntries.push({
            id: `hsn-imp-${Date.now()}-${i}`,
            code,
            type,
            category,
            gstRate,
            description,
            effectiveDate: new Date().toISOString().slice(0, 10),
            isVerified: true,
            notes
          });
        }
      }

      if (newEntries.length > 0) {
        await db.hsnCatalog.bulkAdd(newEntries);
        alert(`Successfully imported ${newEntries.length} HSN/SAC entries.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Verified HSN &amp; SAC Directory</h2>
              <p className="text-xs text-slate-500">
                Official CBIC GST classifications for fire safety, electrical, wooden, hardware &amp; AMC services.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCatalogCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Import CSV</span>
              <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
            </label>

            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom</span>
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

        {/* Add custom form */}
        {showAddForm && (
          <form onSubmit={handleAddNewItem} className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">HSN / SAC Code*</label>
              <input
                type="text"
                placeholder="e.g. 8424 10 00"
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Type</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as ProductClassification)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="GOODS">GOODS (HSN)</option>
                <option value="SERVICES">SERVICES (SAC)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g. Fire Safety"
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">GST Rate</label>
              <select
                value={newRate}
                onChange={e => setNewRate(Number(e.target.value) as GstRate)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value={0}>0% (Nil / Exempt)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block font-semibold text-slate-700 mb-1">Description*</label>
              <input
                type="text"
                placeholder="Detailed description of goods/services"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
              >
                Save Code
              </button>
            </div>
          </form>
        )}

        {/* Search & Filter Bar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by product name, HSN code, or keywords (e.g. extinguisher, refilling, MCB, plywood)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl bg-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs font-medium text-slate-700"
            >
              <option value="ALL">All Types</option>
              <option value="GOODS">Goods (HSN)</option>
              <option value="SERVICES">Services (SAC)</option>
            </select>

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs font-medium text-slate-700 max-w-[200px] truncate"
            >
              <option value="ALL">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Directory Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold">No HSN / SAC entries found matching your query.</p>
              <p className="text-xs text-slate-500 mt-1">Try a different search term or add a custom code above.</p>
            </div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group bg-white shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                      {item.code}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      item.type === 'SERVICES' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {item.type}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      GST {item.gstRate}%
                    </span>
                    {item.isVerified ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified Official CBIC
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        <HelpCircle className="w-3 h-3" />
                        Manual Confirmation Required
                      </span>
                    )}
                    <span className="text-xs text-slate-500 font-medium">
                      • {item.category}
                    </span>
                  </div>

                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {item.description}
                  </p>

                  {item.notes && (
                    <p className="text-[11px] text-slate-500 italic">
                      {item.notes}
                    </p>
                  )}
                </div>

                <div className="sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect({
                        code: item.code,
                        gstRate: item.gstRate,
                        category: item.category,
                        description: item.description,
                        type: item.type
                      });
                      onClose();
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Select
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
          <span>Showing {filteredItems.length} of {allItems.length} classifications</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
