import Dexie, { type EntityTable } from 'dexie';
import { 
  BusinessProfile, Party, Product, Document, PurchaseBill,
  User, UserSession, AuditLog, PaymentTransaction, GstinCacheRecord, HsnCatalogItem 
} from '../types';

export class GoGstDatabase extends Dexie {
  users!: EntityTable<User, 'id'>;
  sessions!: EntityTable<UserSession, 'token'>;
  businessProfile!: EntityTable<BusinessProfile, 'id'>;
  parties!: EntityTable<Party, 'id'>;
  products!: EntityTable<Product, 'id'>;
  documents!: EntityTable<Document, 'id'>;
  purchases!: EntityTable<PurchaseBill, 'id'>;
  historyLogs!: EntityTable<AuditLog, 'id'>;
  paymentTransactions!: EntityTable<PaymentTransaction, 'id'>;
  gstinCache!: EntityTable<GstinCacheRecord, 'gstin'>;
  hsnCatalog!: EntityTable<HsnCatalogItem, 'id'>;

  constructor() {
    super('GoGstBillDB');

    this.version(3).stores({
      users: 'id, email',
      sessions: 'token, userId',
      businessProfile: '++id, userId, gstin, stateCode, companyName, isGstRegistered',
      parties: 'id, userId, name, gstin, phone, email, stateCode, type',
      products: 'id, userId, name, sku, hsn, stock, lowStockAlert',
      documents: 'id, userId, docType, docNumber, date, partyId, status',
      historyLogs: 'id, userId, action, entityType, timestamp',
      paymentTransactions: 'id, userId, documentId, date',
      gstinCache: 'gstin, cachedAt'
    });

    this.version(4).stores({
      users: 'id, email',
      sessions: 'token, userId',
      businessProfile: '++id, userId, gstin, stateCode, companyName, isGstRegistered',
      parties: 'id, userId, name, gstin, phone, email, stateCode, type',
      products: 'id, userId, name, sku, hsn, category, stock, lowStockAlert',
      documents: 'id, userId, docType, docNumber, date, partyId, status',
      purchases: 'id, userId, billNumber, billDate, partyId, status',
      historyLogs: 'id, userId, action, entityType, timestamp',
      paymentTransactions: 'id, userId, partyId, documentId, type, date',
      gstinCache: 'gstin, cachedAt',
      hsnCatalog: 'id, code, category, type, isVerified'
    });
  }
}

export const db = new GoGstDatabase();

/**
 * Logs a real audit record to the persistent database history table
 */
export async function logAudit(entry: {
  userId: string;
  action: AuditLog['action'];
  entityType: AuditLog['entityType'];
  entityId: string;
  title: string;
  details: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const auditRecord: AuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    title: entry.title,
    details: entry.details,
    metadata: entry.metadata,
    timestamp: new Date().toISOString()
  };

  try {
    await db.historyLogs.add(auditRecord);
  } catch (err) {
    console.error('Failed to write audit history log:', err);
  }
}

/**
 * Clean wipe of all user data tables if requested by user in settings
 */
export async function clearAllUserData(userId: string): Promise<void> {
  await db.transaction('rw', [
    db.users, db.sessions, db.businessProfile, 
    db.parties, db.products, db.documents, db.purchases,
    db.historyLogs, db.paymentTransactions
  ], async () => {
    await db.sessions.where('userId').equals(userId).delete();
    await db.businessProfile.where('userId').equals(userId).delete();
    await db.parties.where('userId').equals(userId).delete();
    await db.products.where('userId').equals(userId).delete();
    await db.documents.where('userId').equals(userId).delete();
    await db.purchases.where('userId').equals(userId).delete();
    await db.historyLogs.where('userId').equals(userId).delete();
    await db.paymentTransactions.where('userId').equals(userId).delete();
    await db.users.delete(userId);
  });
  localStorage.removeItem('gogst_auth_session_token');
}
