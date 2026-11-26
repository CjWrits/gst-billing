import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  History, Search, Download, FileText, DollarSign, 
  Package, Users, Key, Calendar
} from 'lucide-react';
import { db } from '../db/database';
import { AuditLog } from '../types';

interface AuditHistoryProps {
  userId: string;
}

export const AuditHistory: React.FC<AuditHistoryProps> = ({ userId }) => {
  const logs = useLiveQuery(
    () => db.historyLogs.where('userId').equals(userId).reverse().sortBy('timestamp'),
    [userId]
  ) || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesCat = true;
    if (selectedCategory === 'DOCUMENT') {
      matchesCat = log.entityType === 'DOCUMENT';
    } else if (selectedCategory === 'PAYMENT') {
      matchesCat = log.entityType === 'PAYMENT';
    } else if (selectedCategory === 'PRODUCT') {
      matchesCat = log.entityType === 'PRODUCT';
    } else if (selectedCategory === 'PARTY') {
      matchesCat = log.entityType === 'PARTY';
    } else if (selectedCategory === 'AUTH') {
      matchesCat = log.entityType === 'AUTH' || log.entityType === 'PROFILE';
    }

    return matchesSearch && matchesCat;
  });

  const getActionBadge = (log: AuditLog) => {
    switch (log.entityType) {
      case 'DOCUMENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <FileText className="w-3 h-3" />
            Invoice / Doc
          </span>
        );
      case 'PAYMENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <DollarSign className="w-3 h-3" />
            Payment
          </span>
        );
      case 'PRODUCT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Package className="w-3 h-3" />
            Inventory
          </span>
        );
      case 'PARTY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Users className="w-3 h-3" />
            Customer/Party
          </span>
        );
      case 'AUTH':
      case 'PROFILE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Key className="w-3 h-3" />
            Account/Security
          </span>
        );
    }
  };

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Category', 'Action', 'Title', 'Details'];
    const rows = filteredLogs.map(log => [
      `"${log.timestamp}"`,
      `"${log.entityType}"`,
      `"${log.action}"`,
      `"${log.title.replace(/"/g, '""')}"`,
      `"${log.details.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Activity_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" />
            Activity History &amp; Audit Trail
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Complete immutable ledger of all invoices created, payments recorded, stock adjustments, and profile changes.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={filteredLogs.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors border border-slate-200"
        >
          <Download className="w-4 h-4 text-slate-600" />
          Export Audit CSV
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audit trail by description or doc #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'ALL', label: `All Events (${logs.length})` },
              { id: 'DOCUMENT', label: 'Invoices' },
              { id: 'PAYMENT', label: 'Payments' },
              { id: 'PRODUCT', label: 'Inventory' },
              { id: 'PARTY', label: 'Parties' },
              { id: 'AUTH', label: 'Security' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History Timeline / Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <th className="px-4 py-3 w-40">Date &amp; Time</th>
                <th className="px-4 py-3 w-32">Category</th>
                <th className="px-4 py-3">Event Summary</th>
                <th className="px-4 py-3">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No activity logs recorded yet. Real business actions will be recorded here automatically.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const dateObj = new Date(log.timestamp);
                  const formattedDate = dateObj.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  });
                  const formattedTime = dateObj.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{formattedDate}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {formattedTime}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {getActionBadge(log)}
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {log.title}
                      </td>

                      <td className="px-4 py-3 text-slate-600 leading-relaxed">
                        {log.details}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
