export type ProductUnit = 'PCS' | 'BOX' | 'KG' | 'LTR' | 'SET' | 'MTR' | 'NOS' | 'UNIT';

export type GstRate = 0 | 5 | 12 | 18 | 28;

export type PartyType = 'customer' | 'vendor';

export type GstStatus = 'Active' | 'Cancelled' | 'Unregistered' | 'Verified' | 'Pending';

export type TaxScheme = 'REGULAR' | 'COMPOSITION';

export type ProductClassification = 'GOODS' | 'SERVICES';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: 'owner' | 'manager' | 'accountant';
  createdAt: string;
  lastLoginAt: string;
}

export interface UserSession {
  token: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  expiresAt: string;
}

export interface BusinessProfile {
  id?: number;
  userId: string;
  name: string; // trade / company name
  companyName: string;
  tradeName?: string;
  fullName: string; // authorized signatory / proprietor name
  legalName?: string;
  taxScheme: TaxScheme; // Regular GST vs Composition Scheme
  isGstRegistered: boolean;
  gstin: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  pincode: string;
  city: string;
  address?: string; // composite address for backward compatibility
  stateCode: string; // default '09' for Uttar Pradesh
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  upiId: string;
  invoicePrefix: string;
  invoiceFormat?: string;
  gstinApiKey?: string; // Stored securely in user's local database
  termsAndConditions: string;
  createdAt: string;
  updatedAt: string;
}

export interface GstinCacheRecord {
  gstin: string;
  companyName: string;
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  pincode: string;
  city: string;
  stateCode: string;
  stateName: string;
  status: GstStatus;
  taxpayerType?: string;
  rawResponse?: unknown;
  cachedAt: string;
}

export interface Party {
  id: string;
  userId: string;
  name: string;
  tradeName?: string;
  gstin: string;
  phone: string;
  email: string;
  billingAddress: string;
  shippingAddress: string;
  addressLine1?: string;
  addressLine2?: string;
  pincode?: string;
  city?: string;
  stateCode: string;
  type: PartyType;
  gstStatus?: GstStatus;
  openingBalance?: number;
  openingBalanceType?: 'DEBIT' | 'CREDIT'; // DEBIT = Party owes us, CREDIT = We owe party
  createdAt: string;
}

export interface Product {
  id: string;
  userId: string;
  name: string;
  sku: string; // Internal product code - separate from HSN/SAC
  hsn: string; // HSN/SAC code
  category?: string;
  type?: ProductClassification;
  unit: ProductUnit;
  salePrice: number;
  purchasePrice: number;
  lastPurchasePrice?: number;
  gstRate: GstRate;
  stock: number;
  lowStockAlert: number;
  batchNumber?: string;
  serialNumbers?: string[];
  createdAt: string;
}

export interface HsnCatalogItem {
  id: string;
  code: string;
  description: string;
  category: string;
  type: ProductClassification;
  gstRate: GstRate;
  effectiveDate: string;
  isVerified: boolean;
  notes?: string;
}

export type DocumentType = 
  | 'INVOICE' 
  | 'QUOTATION' 
  | 'PROFORMA' 
  | 'CHALLAN' 
  | 'CREDIT_NOTE' 
  | 'DEBIT_NOTE' 
  | 'PURCHASE_ORDER';

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'DRAFT';

export interface DocumentItem {
  id: string;
  productId?: string;
  name: string;
  sku?: string;
  hsn: string;
  quantity: number;
  unit: ProductUnit;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalAmount: number;
}

export interface TransportDetails {
  ewayBillNo?: string;
  vehicleNo?: string;
  lrNo?: string;
  transporterName?: string;
  supplyDate?: string;
}

export interface Document {
  id: string;
  userId: string;
  docType: DocumentType;
  docNumber: string;
  date: string;
  dueDate: string;
  partyId: string;
  partyName: string;
  partyGstin: string;
  partyAddress: string;
  partyPhone?: string;
  partyEmail?: string;
  shippingAddress?: string;
  placeOfSupply: string; // 2-digit state code
  items: DocumentItem[];
  subTotal: number;
  totalDiscount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  status: PaymentStatus;
  transportDetails?: TransportDetails;
  notes?: string;
  terms?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseBill {
  id: string;
  userId: string;
  billNumber: string; // Supplier Bill / Invoice Number
  billDate: string;
  dueDate: string;
  partyId: string; // Vendor ID
  partyName: string;
  partyGstin?: string;
  partyAddress?: string;
  partyPhone?: string;
  placeOfSupply: string;
  items: DocumentItem[];
  subTotal: number;
  totalDiscount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  status: PaymentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HsnSummaryItem {
  hsn: string;
  gstRate: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  totalAmount: number;
}

export type AuditAction = 
  | 'USER_REGISTERED'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'PROFILE_UPDATED'
  | 'INVOICE_CREATED'
  | 'INVOICE_UPDATED'
  | 'INVOICE_DELETED'
  | 'QUOTATION_CREATED'
  | 'QUOTATION_CONVERTED'
  | 'PURCHASE_CREATED'
  | 'PURCHASE_UPDATED'
  | 'PURCHASE_DELETED'
  | 'PAYMENT_RECORDED'
  | 'STOCK_ADJUSTED'
  | 'PARTY_CREATED'
  | 'PARTY_UPDATED'
  | 'PARTY_DELETED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'BACKUP_CREATED'
  | 'DATABASE_RESTORED';

export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: 'AUTH' | 'PROFILE' | 'DOCUMENT' | 'PAYMENT' | 'PRODUCT' | 'PARTY' | 'PURCHASE' | 'SYSTEM';
  entityId: string;
  title: string;
  details: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export type PaymentMethod = 'UPI' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'CARD' | 'NEFT_RTGS';

export type PaymentTransactionType = 'PAYMENT_RECEIVED' | 'PAYMENT_MADE';

export interface PaymentTransaction {
  id: string;
  userId: string;
  partyId: string;
  partyName: string;
  partyType?: PartyType;
  documentId?: string; // ID of Document or PurchaseBill
  docNumber?: string;
  type: PaymentTransactionType;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string; // UTR, Cheque No, Transaction ID
  date: string;
  notes?: string;
  createdAt: string;
}

export interface PartyLedgerEntry {
  id: string;
  date: string;
  type: 'INVOICE' | 'PURCHASE' | 'PAYMENT_RECEIVED' | 'PAYMENT_MADE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'OPENING_BALANCE';
  referenceNumber: string;
  description: string;
  debit: number; // Increases party balance (party owes more)
  credit: number; // Decreases party balance (payment received or credit note)
  balance: number;
}

export type DateFilterOption = 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_FY' | 'CUSTOM';
