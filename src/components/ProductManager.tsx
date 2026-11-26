import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Package, Plus, Search, Edit2, Trash2, AlertTriangle, 
  ArrowUpRight, BookOpen, Download, Upload, 
  Boxes, ShieldAlert, TrendingUp 
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import { Product, ProductUnit, GstRate, UserSession, ProductClassification } from '../types';
import { formatIndianCurrency } from '../utils/gstEngine';
import { isSupabaseConfigured } from '../utils/supabase';
import { pushToCloud } from '../utils/cloudSync';
import { HsnCatalogModal } from './HsnCatalogModal';

const UNIT_OPTIONS: ProductUnit[] = ['PCS', 'BOX', 'KG', 'LTR', 'SET', 'MTR', 'NOS', 'UNIT'];
const GST_RATE_OPTIONS: GstRate[] = [0, 5, 12, 18, 28];

const PRESET_CATEGORIES = [
  'Fire Safety Equipment',
  'Fire Protection Accessories',
  'Wooden Products & Furniture',
  'Electrical Equipment',
  'Hardware & Fasteners',
  'Maintenance & Refilling Services',
  'Installation Services',
  'General Supplies'
];

interface ProductManagerProps {
  session: UserSession;
}

export const ProductManager: React.FC<ProductManagerProps> = ({ session }) => {
  const products = useLiveQuery(
    () => db.products.where('userId').equals(session.userId).toArray(), 
    [session.userId]
  ) || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Add/Edit Product Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // HSN Directory Modal State
  const [isHsnModalOpen, setIsHsnModalOpen] = useState(false);

  const [formData, setFormData] = useState<{
    name: string;
    sku: string; // Internal Product Code
    hsn: string; // HSN/SAC Code
    category: string;
    type: ProductClassification;
    unit: ProductUnit;
    salePrice: number;
    purchasePrice: number;
    gstRate: GstRate;
    stock: number;
    lowStockAlert: number;
    batchNumber?: string;
  }>({
    name: '',
    sku: '',
    hsn: '',
    category: 'Fire Safety Equipment',
    type: 'GOODS',
    unit: 'PCS',
    salePrice: 0,
    purchasePrice: 0,
    gstRate: 18,
    stock: 0,
    lowStockAlert: 5,
    batchNumber: ''
  });

  // Stock Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<'ADD' | 'SUBTRACT'>('ADD');

  // Categories list
  const allCategories = useMemo(() => {
    const set = new Set<string>(PRESET_CATEGORIES);
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [products]);

  // Inventory valuation summary
  const totalValuation = useMemo(() => {
    return products.reduce((sum, p) => {
      const price = p.lastPurchasePrice || p.purchasePrice || 0;
      return sum + (p.stock * price);
    }, 0);
  }, [products]);

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      hsn: '',
      category: 'Fire Safety Equipment',
      type: 'GOODS',
      unit: 'PCS',
      salePrice: 0,
      purchasePrice: 0,
      gstRate: 18,
      stock: 0,
      lowStockAlert: 5,
      batchNumber: ''
    });
    setEditingProductId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProductId(p.id);
    setFormData({
      name: p.name,
      sku: p.sku || '',
      hsn: p.hsn || '',
      category: p.category || 'General Supplies',
      type: p.type || 'GOODS',
      unit: p.unit,
      salePrice: p.salePrice,
      purchasePrice: p.purchasePrice,
      gstRate: p.gstRate,
      stock: p.stock,
      lowStockAlert: p.lowStockAlert,
      batchNumber: p.batchNumber || ''
    });
    setIsModalOpen(true);
  };

  const openStockAdjustModal = (p: Product) => {
    setAdjustingProduct(p);
    setAdjustQty(1);
    setAdjustType('ADD');
    setIsAdjustModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Product or Service name is required.');
      return;
    }

    if (formData.sku.trim()) {
      const cleanSku = formData.sku.trim().toLowerCase();
      const existingSku = products.find(p => 
        p.sku && p.sku.trim().toLowerCase() === cleanSku &&
        p.id !== (editingProductId || '')
      );
      if (existingSku) {
        alert(`A product with SKU "${formData.sku.trim()}" already exists (${existingSku.name}). Internal SKU codes must be unique.`);
        return;
      }
    }

    const productRecord: Product = {
      id: editingProductId || `prod-${Date.now()}`,
      userId: session.userId,
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      hsn: formData.hsn.trim(),
      category: formData.category.trim() || 'General Supplies',
      type: formData.type,
      unit: formData.unit,
      salePrice: Number(formData.salePrice) || 0,
      purchasePrice: Number(formData.purchasePrice) || 0,
      lastPurchasePrice: Number(formData.purchasePrice) || 0,
      gstRate: formData.gstRate,
      stock: Number(formData.stock) || 0,
      lowStockAlert: Number(formData.lowStockAlert) || 0,
      batchNumber: formData.batchNumber?.trim(),
      createdAt: new Date().toISOString()
    };

    if (editingProductId) {
      await db.products.put(productRecord);
      await logAudit({
        userId: session.userId,
        action: 'PRODUCT_UPDATED',
        entityType: 'PRODUCT',
        entityId: productRecord.id,
        title: `Updated Item: ${productRecord.name}`,
        details: `Updated details for ${productRecord.name} (SKU: ${productRecord.sku}, HSN: ${productRecord.hsn}, Rate: ₹${productRecord.salePrice}, Stock: ${productRecord.stock} ${productRecord.unit}).`
      });
    } else {
      await db.products.add(productRecord);
      await logAudit({
        userId: session.userId,
        action: 'PRODUCT_CREATED',
        entityType: 'PRODUCT',
        entityId: productRecord.id,
        title: `Added Item: ${productRecord.name}`,
        details: `Added ${productRecord.name} to catalog (SKU: ${productRecord.sku || 'N/A'}, HSN: ${productRecord.hsn}, Rate: ₹${productRecord.salePrice}, Stock: ${productRecord.stock} ${productRecord.unit}).`
      });
    }

    setIsModalOpen(false);
    resetForm();

    if (isSupabaseConfigured() && session?.userId) {
      pushToCloud(session.userId).catch(console.warn);
    }
  };

  const handleApplyStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;

    const diff = adjustType === 'ADD' ? adjustQty : -adjustQty;
    const newStock = Math.max(0, adjustingProduct.stock + diff);

    await db.products.update(adjustingProduct.id, {
      stock: newStock
    });

    await logAudit({
      userId: session.userId,
      action: 'STOCK_ADJUSTED',
      entityType: 'PRODUCT',
      entityId: adjustingProduct.id,
      title: `Stock Adjustment for ${adjustingProduct.name}`,
      details: `${adjustType === 'ADD' ? 'Added' : 'Deducted'} ${adjustQty} ${adjustingProduct.unit}. Stock updated from ${adjustingProduct.stock} to ${newStock} ${adjustingProduct.unit}.`
    });

    setIsAdjustModalOpen(false);
    setAdjustingProduct(null);

    if (isSupabaseConfigured() && session?.userId) {
      pushToCloud(session.userId).catch(console.warn);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      await db.products.delete(id);
      await logAudit({
        userId: session.userId,
        action: 'PRODUCT_DELETED',
        entityType: 'PRODUCT',
        entityId: id,
        title: `Deleted Product: ${name}`,
        details: `Removed product "${name}" from inventory catalog.`
      });

      if (isSupabaseConfigured() && session?.userId) {
        pushToCloud(session.userId).catch(console.warn);
      }
    }
  };

  // Bulk CSV Export
  const handleExportCsv = () => {
    const headers = [
      'Internal SKU',
      'Name',
      'Category',
      'Type (GOODS/SERVICES)',
      'HSN or SAC Code',
      'Unit',
      'Sale Price',
      'Purchase Price',
      'Last Purchase Price',
      'GST Rate %',
      'Current Stock',
      'Low Stock Alert'
    ];

    const rows = products.map(p => [
      `"${p.sku || ''}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.category || ''}"`,
      `"${p.type || 'GOODS'}"`,
      `"${p.hsn || ''}"`,
      `"${p.unit}"`,
      `"${p.salePrice}"`,
      `"${p.purchasePrice}"`,
      `"${p.lastPurchasePrice || p.purchasePrice}"`,
      `"${p.gstRate}"`,
      `"${p.stock}"`,
      `"${p.lowStockAlert}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Products_Catalog_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Bulk CSV Import
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;

      const newProducts: Product[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 2 && parts[1]) {
          const sku = parts[0] || '';
          const name = parts[1];
          const category = parts[2] || 'General Supplies';
          const type = (parts[3]?.toUpperCase() === 'SERVICES' ? 'SERVICES' : 'GOODS') as ProductClassification;
          const hsn = parts[4] || '';
          const unit = (UNIT_OPTIONS.includes(parts[5] as ProductUnit) ? parts[5] : 'PCS') as ProductUnit;
          const salePrice = Number(parts[6]) || 0;
          const purchasePrice = Number(parts[7]) || 0;
          const lastPurchasePrice = Number(parts[8]) || purchasePrice;
          const gstRateNum = Number(parts[9]) || 18;
          const gstRate = ([0, 5, 12, 18, 28].includes(gstRateNum) ? gstRateNum : 18) as GstRate;
          const stock = Number(parts[10]) || 0;
          const lowStockAlert = Number(parts[11]) || 5;

          newProducts.push({
            id: `prod-imp-${Date.now()}-${i}`,
            userId: session.userId,
            sku,
            name,
            category,
            type,
            hsn,
            unit,
            salePrice,
            purchasePrice,
            lastPurchasePrice,
            gstRate,
            stock,
            lowStockAlert,
            createdAt: new Date().toISOString()
          });
        }
      }

      if (newProducts.length > 0) {
        await db.products.bulkAdd(newProducts);
        alert(`Successfully imported ${newProducts.length} items into catalog.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      p.name.toLowerCase().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.hsn && p.hsn.toLowerCase().includes(term)) ||
      (p.category && p.category.toLowerCase().includes(term));

    const matchesLowStock = !filterLowStockOnly || p.stock <= p.lowStockAlert;
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;

    return matchesSearch && matchesLowStock && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header & Valuation Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            Product &amp; SKU Catalog
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage goods &amp; services, separate internal SKU codes, verified HSN/SAC codes, and live inventory stock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHsnModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold transition-colors"
          >
            <BookOpen className="w-4 h-4 text-purple-600" />
            HSN / SAC Directory
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
            title="Export products to CSV"
          >
            <Download className="w-4 h-4 text-blue-600" />
            Export CSV
          </button>

          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-emerald-600" />
            Import CSV
            <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
          </label>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add New Item
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Catalog Items</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{products.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Inventory Stock Valuation</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{formatIndianCurrency(totalValuation)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Low Stock Alerts</p>
            <p className="text-xl font-bold text-amber-600 mt-0.5">
              {products.filter(p => p.stock <= p.lowStockAlert).length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Item Name, internal SKU code, HSN code, or category..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white"
          >
            <option value="ALL">All Categories</option>
            {allCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
              filterLowStockOnly 
                ? 'bg-amber-500 text-white border-amber-600' 
                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Stock Only
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Item Details</th>
                <th className="py-3 px-4">Internal SKU</th>
                <th className="py-3 px-4">HSN / SAC</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Sale Price</th>
                <th className="py-3 px-4 text-right">Last Purchase</th>
                <th className="py-3 px-4 text-center">Stock</th>
                <th className="py-3 px-4 text-right">Valuation</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No products or services found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;Add New Item&quot; to add your first product or import via CSV.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const isLow = p.stock <= p.lowStockAlert;
                  const purchaseRate = p.lastPurchasePrice || p.purchasePrice || 0;
                  const val = p.stock * purchaseRate;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                          <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                            p.type === 'SERVICES' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {p.type || 'GOODS'}
                          </span>
                          <span>GST {p.gstRate}%</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-slate-700">
                        {p.sku ? (
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 text-[11px]">
                            {p.sku}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700">
                        {p.hsn || <span className="text-slate-400 italic">N/A</span>}
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {p.category || 'General Supplies'}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {formatIndianCurrency(p.salePrice)}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-600">
                        {formatIndianCurrency(purchaseRate)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isLow 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {p.stock} {p.unit}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                        {formatIndianCurrency(val)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openStockAdjustModal(p)}
                            title="Adjust Stock"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            title="Edit"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id, p.name)}
                            title="Delete"
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[95vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingProductId ? 'Edit Product / Service' : 'Add New Item to Catalog'}
                </h2>
                <p className="text-xs text-slate-500">
                  Specify separate internal SKU code, HSN/SAC code, and rates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Product / Service Name*</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ABC 4kg Dry Powder Fire Extinguisher"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Classification Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as ProductClassification })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="GOODS">GOODS (Physical Items)</option>
                    <option value="SERVICES">SERVICES (Maintenance, Refilling, AMC)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Product Category</label>
                  <input
                    type="text"
                    list="category-suggestions"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g. Fire Safety Equipment"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <datalist id="category-suggestions">
                    {PRESET_CATEGORIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Internal SKU Code (Separate from HSN)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. FE-ABC-04KG"
                    value={formData.sku}
                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Your company internal stock code</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">HSN / SAC Code</label>
                    <button
                      type="button"
                      onClick={() => setIsHsnModalOpen(true)}
                      className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 text-[11px]"
                    >
                      <BookOpen className="w-3 h-3" />
                      Browse HSN Directory
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 8424 10 00"
                    value={formData.hsn}
                    onChange={e => setFormData({ ...formData, hsn: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Official GST classification code</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit of Measurement</label>
                  <select
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value as ProductUnit })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GST Tax Rate</label>
                  <select
                    value={formData.gstRate}
                    onChange={e => setFormData({ ...formData, gstRate: Number(e.target.value) as GstRate })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    {GST_RATE_OPTIONS.map(r => (
                      <option key={r} value={r}>{r}% GST</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selling Price (₹)*</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.salePrice}
                    onChange={e => setFormData({ ...formData, salePrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Purchase / Cost Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.purchasePrice}
                    onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Opening Stock Quantity</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.stock}
                    onChange={e => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Low Stock Alert Level</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.lowStockAlert}
                    onChange={e => setFormData({ ...formData, lowStockAlert: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-colors"
                >
                  {editingProductId ? 'Update Product' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {isAdjustModalOpen && adjustingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5 text-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Adjust Stock: {adjustingProduct.name}
            </h3>
            <p className="text-slate-500 mb-4">
              Current stock: <strong>{adjustingProduct.stock} {adjustingProduct.unit}</strong>
            </p>

            <form onSubmit={handleApplyStockAdjustment} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType('ADD')}
                  className={`py-2 text-center rounded-lg font-bold border transition-colors ${
                    adjustType === 'ADD' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('SUBTRACT')}
                  className={`py-2 text-center rounded-lg font-bold border transition-colors ${
                    adjustType === 'SUBTRACT' 
                      ? 'bg-rose-50 text-rose-700 border-rose-300' 
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  - Deduct Stock
                </button>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={adjustQty}
                  onChange={e => setAdjustQty(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verified HSN / SAC Directory Modal */}
      <HsnCatalogModal
        isOpen={isHsnModalOpen}
        onClose={() => setIsHsnModalOpen(false)}
        onSelect={selected => {
          setFormData(prev => ({
            ...prev,
            hsn: selected.code,
            gstRate: selected.gstRate,
            category: selected.category || prev.category,
            type: selected.type || prev.type
          }));
        }}
      />
    </div>
  );
};
