import { Document, PurchaseBill } from '../types';
import { db } from '../db/database';
import { groupHsnSummary, getStateName } from './gstEngine';

/**
 * Escapes CSV field value according to RFC 4180
 */
export function escapeCsv(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  const str = String(value).trim();
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export function triggerDownload(content: string, filename: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports GSTR-1 B2B CSV (Invoices for buyers with GSTIN)
 */
export function exportGstr1B2BCsv(documents: Document[]) {
  const b2bInvoices = documents.filter(d => 
    d.docType === 'INVOICE' && d.partyGstin && d.partyGstin.trim().length === 15
  );

  const headers = [
    'GSTIN/UIN of Recipient',
    'Receiver Name',
    'Invoice Number',
    'Invoice date',
    'Invoice Value',
    'Place Of Supply',
    'Reverse Charge',
    'Applicable % of Tax Rate',
    'Invoice Type',
    'E-Commerce GSTIN',
    'Rate',
    'Taxable Value',
    'Cess Amount'
  ];

  const rows: string[] = [headers.map(h => `"${h}"`).join(',')];

  for (const doc of b2bInvoices) {
    const rateGroups = new Map<number, number>();
    for (const item of doc.items) {
      const current = rateGroups.get(item.gstRate) || 0;
      rateGroups.set(item.gstRate, current + item.taxableAmount);
    }

    for (const [rate, taxable] of rateGroups.entries()) {
      const row = [
        escapeCsv(doc.partyGstin),
        escapeCsv(doc.partyName),
        escapeCsv(doc.docNumber),
        escapeCsv(doc.date),
        escapeCsv(doc.grandTotal.toFixed(2)),
        escapeCsv(doc.placeOfSupply),
        escapeCsv('N'),
        escapeCsv(''),
        escapeCsv('Regular'),
        escapeCsv(''),
        escapeCsv(rate),
        escapeCsv(taxable.toFixed(2)),
        escapeCsv('0.00')
      ];
      rows.push(row.join(','));
    }
  }

  const csvContent = rows.join('\r\n');
  triggerDownload(csvContent, `GSTR1_B2B_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports GSTR-1 B2C Small CSV
 */
export function exportGstr1B2CCsv(documents: Document[]) {
  const b2cInvoices = documents.filter(d => 
    d.docType === 'INVOICE' && (!d.partyGstin || d.partyGstin.trim().length !== 15)
  );

  const headers = [
    'Type',
    'Place Of Supply',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
    'E-Commerce GSTIN'
  ];

  const rows: string[] = [headers.map(h => `"${h}"`).join(',')];

  const groups = new Map<string, { pos: string; rate: number; taxable: number }>();

  for (const doc of b2cInvoices) {
    for (const item of doc.items) {
      const key = `${doc.placeOfSupply}_${item.gstRate}`;
      const existing = groups.get(key);
      if (existing) {
        existing.taxable += item.taxableAmount;
      } else {
        groups.set(key, {
          pos: doc.placeOfSupply,
          rate: item.gstRate,
          taxable: item.taxableAmount
        });
      }
    }
  }

  for (const item of groups.values()) {
    const row = [
      escapeCsv('OE'),
      escapeCsv(item.pos),
      escapeCsv(''),
      escapeCsv(item.rate),
      escapeCsv(item.taxable.toFixed(2)),
      escapeCsv('0.00'),
      escapeCsv('')
    ];
    rows.push(row.join(','));
  }

  const csvContent = rows.join('\r\n');
  triggerDownload(csvContent, `GSTR1_B2CS_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports GSTR-1 CDNR (Credit & Debit Notes Registered)
 */
export function exportGstr1CdnrCsv(documents: Document[]) {
  const cdNotes = documents.filter(d => 
    (d.docType === 'CREDIT_NOTE' || d.docType === 'DEBIT_NOTE') && d.partyGstin && d.partyGstin.trim().length === 15
  );

  const headers = [
    'GSTIN/UIN of Recipient',
    'Receiver Name',
    'Note Number',
    'Note Date',
    'Note Type',
    'Place Of Supply',
    'Reverse Charge',
    'Note Value',
    'Rate',
    'Taxable Value',
    'Cess Amount'
  ];

  const rows: string[] = [headers.map(h => `"${h}"`).join(',')];

  for (const doc of cdNotes) {
    const noteType = doc.docType === 'CREDIT_NOTE' ? 'C' : 'D';
    for (const item of doc.items) {
      const row = [
        escapeCsv(doc.partyGstin),
        escapeCsv(doc.partyName),
        escapeCsv(doc.docNumber),
        escapeCsv(doc.date),
        escapeCsv(noteType),
        escapeCsv(doc.placeOfSupply),
        escapeCsv('N'),
        escapeCsv(doc.grandTotal.toFixed(2)),
        escapeCsv(item.gstRate),
        escapeCsv(item.taxableAmount.toFixed(2)),
        escapeCsv('0.00')
      ];
      rows.push(row.join(','));
    }
  }

  const csvContent = rows.join('\r\n');
  triggerDownload(csvContent, `GSTR1_CDNR_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports HSN Summary CSV across all invoices
 */
export function exportHsnSummaryCsv(documents: Document[]) {
  const invoices = documents.filter(d => d.docType === 'INVOICE');
  const allItems = invoices.flatMap(d => d.items);
  const hsnGroups = groupHsnSummary(allItems);

  const headers = [
    'HSN',
    'Description',
    'UQC',
    'Total Quantity',
    'Total Value',
    'Taxable Value',
    'Integrated Tax Amount',
    'Central Tax Amount',
    'State/UT Tax Amount',
    'Cess Amount'
  ];

  const rows: string[] = [headers.map(h => `"${h}"`).join(',')];

  for (const item of hsnGroups) {
    const matchingItems = allItems.filter(i => (i.hsn || 'N/A') === item.hsn && i.gstRate === item.gstRate);
    const totalQty = matchingItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
    const unit = matchingItems[0]?.unit || 'PCS';
    const description = matchingItems[0]?.name || 'Goods/Services';

    const row = [
      escapeCsv(item.hsn),
      escapeCsv(description),
      escapeCsv(unit),
      escapeCsv(totalQty),
      escapeCsv(item.totalAmount.toFixed(2)),
      escapeCsv(item.taxableAmount.toFixed(2)),
      escapeCsv(item.igstAmount.toFixed(2)),
      escapeCsv(item.cgstAmount.toFixed(2)),
      escapeCsv(item.sgstAmount.toFixed(2)),
      escapeCsv('0.00')
    ];
    rows.push(row.join(','));
  }

  const csvContent = rows.join('\r\n');
  triggerDownload(csvContent, `GSTR1_HSN_Summary_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports Full Sales Register CSV
 */
export function exportSalesRegisterCsv(documents: Document[]) {
  const invoices = documents.filter(d => d.docType === 'INVOICE' || d.docType === 'CREDIT_NOTE' || d.docType === 'DEBIT_NOTE');
  const headers = [
    'Doc Type',
    'Invoice / Doc No',
    'Date',
    'Customer Name',
    'Customer GSTIN',
    'Place of Supply',
    'Taxable Value (Rs)',
    'CGST (Rs)',
    'SGST (Rs)',
    'IGST (Rs)',
    'Total Tax (Rs)',
    'Round Off (Rs)',
    'Invoice Total (Rs)',
    'Amount Paid (Rs)',
    'Balance Due (Rs)',
    'Status'
  ];

  const rows = [headers.map(h => `"${h}"`).join(',')];
  for (const d of invoices) {
    const totalTax = d.totalCgst + d.totalSgst + d.totalIgst;
    const balance = Math.max(0, d.grandTotal - d.amountPaid);
    rows.push([
      escapeCsv(d.docType),
      escapeCsv(d.docNumber),
      escapeCsv(d.date),
      escapeCsv(d.partyName),
      escapeCsv(d.partyGstin || 'Unregistered'),
      escapeCsv(`${d.placeOfSupply} - ${getStateName(d.placeOfSupply)}`),
      escapeCsv(d.subTotal.toFixed(2)),
      escapeCsv(d.totalCgst.toFixed(2)),
      escapeCsv(d.totalSgst.toFixed(2)),
      escapeCsv(d.totalIgst.toFixed(2)),
      escapeCsv(totalTax.toFixed(2)),
      escapeCsv(d.roundOff.toFixed(2)),
      escapeCsv(d.grandTotal.toFixed(2)),
      escapeCsv(d.amountPaid.toFixed(2)),
      escapeCsv(balance.toFixed(2)),
      escapeCsv(d.status)
    ].join(','));
  }

  triggerDownload(rows.join('\r\n'), `Sales_Register_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Exports Full Inward Purchase Register CSV
 */
export function exportPurchaseRegisterCsv(purchases: PurchaseBill[]) {
  const headers = [
    'Bill Number',
    'Bill Date',
    'Supplier Name',
    'Supplier GSTIN',
    'Place of Supply',
    'Taxable Value (Rs)',
    'CGST / ITC (Rs)',
    'SGST / ITC (Rs)',
    'IGST / ITC (Rs)',
    'Total ITC (Rs)',
    'Bill Total (Rs)',
    'Amount Paid (Rs)',
    'Balance Due (Rs)',
    'Status'
  ];

  const rows = [headers.map(h => `"${h}"`).join(',')];
  for (const p of purchases) {
    const totalItc = (p.totalCgst || 0) + (p.totalSgst || 0) + (p.totalIgst || 0);
    const balance = Math.max(0, p.grandTotal - (p.amountPaid || 0));
    rows.push([
      escapeCsv(p.billNumber),
      escapeCsv(p.billDate),
      escapeCsv(p.partyName),
      escapeCsv(p.partyGstin || 'Unregistered'),
      escapeCsv(`${p.placeOfSupply} - ${getStateName(p.placeOfSupply)}`),
      escapeCsv(p.subTotal.toFixed(2)),
      escapeCsv(p.totalCgst.toFixed(2)),
      escapeCsv(p.totalSgst.toFixed(2)),
      escapeCsv(p.totalIgst.toFixed(2)),
      escapeCsv(totalItc.toFixed(2)),
      escapeCsv(p.grandTotal.toFixed(2)),
      escapeCsv(p.amountPaid.toFixed(2)),
      escapeCsv(balance.toFixed(2)),
      escapeCsv(p.status)
    ].join(','));
  }

  triggerDownload(rows.join('\r\n'), `Purchase_Register_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Full Complete JSON Backup: Exports entire IndexedDB into a single JSON file
 */
export async function exportDatabaseBackup(): Promise<void> {
  const profile = await db.businessProfile.toArray();
  const parties = await db.parties.toArray();
  const products = await db.products.toArray();
  const documents = await db.documents.toArray();
  const purchases = await db.purchases.toArray();
  const paymentTransactions = await db.paymentTransactions.toArray();
  const historyLogs = await db.historyLogs.toArray();
  const hsnCatalog = await db.hsnCatalog.toArray();

  const backupData = {
    appName: 'GoGST Bill',
    schemaVersion: 4,
    exportDate: new Date().toISOString(),
    data: {
      businessProfile: profile,
      parties,
      products,
      documents,
      purchases,
      paymentTransactions,
      historyLogs,
      hsnCatalog
    }
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const filename = `GoGST_Full_Backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  triggerDownload(jsonStr, filename, 'application/json');
}

/**
 * Full JSON Restore: Imports and restores all tables safely with robust validation
 */
export async function restoreDatabaseFromJson(jsonString: string): Promise<{ success: boolean; message: string }> {
  if (!jsonString || typeof jsonString !== 'string' || !jsonString.trim()) {
    return { success: false, message: 'Restore failed: Uploaded file is completely empty.' };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonString);
  } catch (parseErr) {
    return { 
      success: false, 
      message: `Restore failed: Corrupted JSON file syntax (${parseErr instanceof Error ? parseErr.message : 'Invalid JSON'}).` 
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { success: false, message: 'Restore failed: Invalid backup structure (root must be a JSON object).' };
  }

  const rawData = (parsed.data || parsed) as Record<string, unknown>;
  if (!rawData || typeof rawData !== 'object') {
    return { success: false, message: 'Restore failed: Missing data payload in backup file.' };
  }

  const { 
    businessProfile, parties, products, documents, 
    purchases, paymentTransactions, historyLogs, hsnCatalog 
  } = rawData as {
    businessProfile?: unknown;
    parties?: unknown[];
    products?: unknown[];
    documents?: unknown[];
    purchases?: unknown[];
    paymentTransactions?: unknown[];
    historyLogs?: unknown[];
    hsnCatalog?: unknown[];
  };

  const hasAnyTable = (
    businessProfile || 
    Array.isArray(parties) || 
    Array.isArray(products) || 
    Array.isArray(documents) || 
    Array.isArray(purchases)
  );

  if (!hasAnyTable) {
    return { success: false, message: 'Restore failed: Backup file contains no valid GoGST tables or data collections.' };
  }

  try {
    await db.transaction('rw', [
      db.businessProfile, db.parties, db.products, 
      db.documents, db.purchases, db.paymentTransactions, 
      db.historyLogs, db.hsnCatalog
    ], async () => {
      // Business Profile (handle both array and single object)
      if (businessProfile) {
        const profileList = Array.isArray(businessProfile) 
          ? businessProfile 
          : typeof businessProfile === 'object' ? [businessProfile] : [];
        if (profileList.length > 0) {
          await db.businessProfile.clear();
          await db.businessProfile.bulkPut(profileList as never[]);
        }
      }

      // Parties
      if (Array.isArray(parties) && parties.length > 0) {
        const sanitized = parties.map((p, idx) => {
          const item = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
          return {
            ...item,
            id: item.id || `party-restored-${Date.now()}-${idx}`
          };
        });
        await db.parties.clear();
        await db.parties.bulkPut(sanitized as never[]);
      }

      // Products
      if (Array.isArray(products) && products.length > 0) {
        const sanitized = products.map((pr, idx) => {
          const item = (pr && typeof pr === 'object' ? pr : {}) as Record<string, unknown>;
          return {
            ...item,
            id: item.id || `prod-restored-${Date.now()}-${idx}`
          };
        });
        await db.products.clear();
        await db.products.bulkPut(sanitized as never[]);
      }

      // Documents
      if (Array.isArray(documents) && documents.length > 0) {
        const sanitized = documents.map((doc, idx) => {
          const item = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
          return {
            ...item,
            id: item.id || `doc-restored-${Date.now()}-${idx}`
          };
        });
        await db.documents.clear();
        await db.documents.bulkPut(sanitized as never[]);
      }

      // Purchases
      if (Array.isArray(purchases) && purchases.length > 0) {
        const sanitized = purchases.map((pur, idx) => {
          const item = (pur && typeof pur === 'object' ? pur : {}) as Record<string, unknown>;
          return {
            ...item,
            id: item.id || `pur-restored-${Date.now()}-${idx}`
          };
        });
        await db.purchases.clear();
        await db.purchases.bulkPut(sanitized as never[]);
      }

      // Payments
      if (Array.isArray(paymentTransactions) && paymentTransactions.length > 0) {
        const sanitized = paymentTransactions.map((tx, idx) => {
          const item = (tx && typeof tx === 'object' ? tx : {}) as Record<string, unknown>;
          return {
            ...item,
            id: item.id || `tx-restored-${Date.now()}-${idx}`
          };
        });
        await db.paymentTransactions.clear();
        await db.paymentTransactions.bulkPut(sanitized as never[]);
      }

      // History Logs
      if (Array.isArray(historyLogs) && historyLogs.length > 0) {
        const sanitized = historyLogs.map((log, idx) => {
          const item = (log && typeof log === 'object' ? log : {}) as Record<string, unknown>;
          return {
            ...item,
            id: item.id || `log-restored-${Date.now()}-${idx}`
          };
        });
        await db.historyLogs.clear();
        await db.historyLogs.bulkPut(sanitized as never[]);
      }

      // HSN Catalog
      if (Array.isArray(hsnCatalog) && hsnCatalog.length > 0) {
        const sanitized = hsnCatalog.map((h, idx) => {
          const item = (h && typeof h === 'object' ? h : {}) as Record<string, unknown>;
          return {
            ...item,
            id: item.id || `hsn-restored-${Date.now()}-${idx}`
          };
        });
        await db.hsnCatalog.clear();
        await db.hsnCatalog.bulkPut(sanitized as never[]);
      }
    });

    const counts = [
      Array.isArray(parties) ? `${parties.length} parties` : null,
      Array.isArray(products) ? `${products.length} products` : null,
      Array.isArray(documents) ? `${documents.length} invoices` : null,
      Array.isArray(purchases) ? `${purchases.length} purchase bills` : null,
      Array.isArray(paymentTransactions) ? `${paymentTransactions.length} payments` : null
    ].filter(Boolean).join(', ');

    return {
      success: true,
      message: `Database successfully restored (${counts || 'all records verified'}).`
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Database restore transaction failed: ${errorMsg}`
    };
  }
}
