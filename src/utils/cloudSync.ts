import { db } from '../db/database';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { 
  BusinessProfile, Party, Product, Document, PurchaseBill, 
  PaymentTransaction, TaxScheme, PartyType, GstStatus, DocumentType, PaymentStatus, PaymentMethod, PaymentTransactionType
} from '../types';

export interface SyncResult {
  success: boolean;
  message: string;
  pushedCount?: number;
  pulledCount?: number;
  error?: unknown;
}

/**
 * Pulls all user records from Supabase cloud into the local Dexie IndexedDB
 */
export async function pullFromCloud(userId: string): Promise<SyncResult> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) {
    return { success: false, message: 'Cloud sync is not configured.' };
  }

  try {
    let pulledCount = 0;

    // 1. Pull Business Profile
    const { data: profiles, error: profileErr } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', userId);

    if (profileErr) throw profileErr;

    if (profiles && profiles.length > 0) {
      const p = profiles[0];
      const localProfile: BusinessProfile = {
        userId: p.user_id,
        name: p.name || p.company_name,
        companyName: p.company_name,
        tradeName: p.trade_name || p.company_name,
        fullName: p.full_name,
        legalName: p.legal_name || p.full_name,
        taxScheme: (p.tax_scheme as TaxScheme) || 'REGULAR',
        isGstRegistered: p.is_gst_registered ?? true,
        gstin: p.gstin || '',
        phone: p.phone || '',
        email: p.email || '',
        addressLine1: p.address_line1 || '',
        addressLine2: p.address_line2 || '',
        pincode: p.pincode || '',
        city: p.city || '',
        address: p.address || '',
        stateCode: p.state_code || '09',
        bankName: p.bank_name || '',
        accountNumber: p.account_number || '',
        ifscCode: p.ifsc_code || '',
        branchName: p.branch_name || '',
        upiId: p.upi_id || '',
        invoicePrefix: p.invoice_prefix || 'INV/26-27/',
        invoiceFormat: p.invoice_format || 'A4_MODERN',
        termsAndConditions: p.terms_and_conditions || '',
        createdAt: p.created_at || new Date().toISOString(),
        updatedAt: p.updated_at || new Date().toISOString()
      };

      const existing = await db.businessProfile.where('userId').equals(userId).first();
      if (existing && existing.id) {
        localProfile.id = existing.id;
        await db.businessProfile.put(localProfile);
      } else {
        await db.businessProfile.add(localProfile);
      }
      pulledCount++;
    }

    // 2. Pull Parties
    const { data: partiesData, error: partiesErr } = await supabase
      .from('parties')
      .select('*')
      .eq('user_id', userId);

    if (partiesErr) throw partiesErr;

    if (partiesData && partiesData.length > 0) {
      const localParties: Party[] = partiesData.map(p => ({
        id: p.id,
        userId: p.user_id,
        name: p.name,
        tradeName: p.trade_name,
        gstin: p.gstin || '',
        phone: p.phone || '',
        email: p.email || '',
        billingAddress: p.billing_address || '',
        shippingAddress: p.shipping_address || p.billing_address || '',
        addressLine1: p.address_line1,
        addressLine2: p.address_line2,
        pincode: p.pincode,
        city: p.city,
        stateCode: p.state_code || '09',
        type: (p.type as PartyType) || 'customer',
        gstStatus: (p.gst_status as GstStatus) || 'Verified',
        openingBalance: Number(p.opening_balance) || 0,
        openingBalanceType: p.opening_balance_type || 'DEBIT',
        createdAt: p.created_at || new Date().toISOString()
      }));

      await db.parties.bulkPut(localParties);
      pulledCount += localParties.length;
    }

    // 3. Pull Products
    const { data: productsData, error: productsErr } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId);

    if (productsErr) throw productsErr;

    if (productsData && productsData.length > 0) {
      const localProducts: Product[] = productsData.map(p => ({
        id: p.id,
        userId: p.user_id,
        name: p.name,
        sku: p.sku || '',
        hsn: p.hsn || '',
        category: p.category,
        type: p.type,
        unit: p.unit || 'PCS',
        salePrice: Number(p.sale_price) || 0,
        purchasePrice: Number(p.purchase_price) || 0,
        lastPurchasePrice: p.last_purchase_price ? Number(p.last_purchase_price) : undefined,
        gstRate: p.gst_rate ?? 18,
        stock: Number(p.stock) || 0,
        lowStockAlert: Number(p.low_stock_alert) || 5,
        batchNumber: p.batch_number,
        serialNumbers: p.serial_numbers || [],
        createdAt: p.created_at || new Date().toISOString()
      }));

      await db.products.bulkPut(localProducts);
      pulledCount += localProducts.length;
    }

    // 4. Pull Documents (Invoices, Quotations, etc.)
    const { data: documentsData, error: docsErr } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId);

    if (docsErr) throw docsErr;

    if (documentsData && documentsData.length > 0) {
      const localDocs: Document[] = documentsData.map(d => ({
        id: d.id,
        userId: d.user_id,
        docType: (d.doc_type as DocumentType) || 'INVOICE',
        docNumber: d.doc_number,
        date: d.date,
        dueDate: d.due_date || d.date,
        partyId: d.party_id || '',
        partyName: d.party_name || '',
        partyGstin: d.party_gstin || '',
        partyAddress: d.party_address || '',
        partyPhone: d.party_phone,
        partyEmail: d.party_email,
        shippingAddress: d.shipping_address,
        placeOfSupply: d.place_of_supply || '09',
        items: Array.isArray(d.items) ? d.items : [],
        subTotal: Number(d.sub_total) || 0,
        totalDiscount: Number(d.total_discount) || 0,
        totalCgst: Number(d.total_cgst) || 0,
        totalSgst: Number(d.total_sgst) || 0,
        totalIgst: Number(d.total_igst) || 0,
        roundOff: Number(d.round_off) || 0,
        grandTotal: Number(d.grand_total) || 0,
        amountPaid: Number(d.amount_paid) || 0,
        status: (d.status as PaymentStatus) || 'UNPAID',
        transportDetails: d.transport_details,
        notes: d.notes,
        terms: d.terms,
        createdAt: d.created_at || new Date().toISOString(),
        updatedAt: d.updated_at || new Date().toISOString()
      }));

      await db.documents.bulkPut(localDocs);
      pulledCount += localDocs.length;
    }

    // 5. Pull Purchases
    const { data: purchasesData, error: purchasesErr } = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', userId);

    if (purchasesErr) throw purchasesErr;

    if (purchasesData && purchasesData.length > 0) {
      const localPurchases: PurchaseBill[] = purchasesData.map(pb => ({
        id: pb.id,
        userId: pb.user_id,
        billNumber: pb.bill_number,
        billDate: pb.bill_date,
        dueDate: pb.due_date || pb.bill_date,
        partyId: pb.party_id || '',
        partyName: pb.party_name || '',
        partyGstin: pb.party_gstin,
        partyAddress: pb.party_address,
        partyPhone: pb.party_phone,
        placeOfSupply: pb.place_of_supply || '09',
        items: Array.isArray(pb.items) ? pb.items : [],
        subTotal: Number(pb.sub_total) || 0,
        totalDiscount: Number(pb.total_discount) || 0,
        totalCgst: Number(pb.total_cgst) || 0,
        totalSgst: Number(pb.total_sgst) || 0,
        totalIgst: Number(pb.total_igst) || 0,
        roundOff: Number(pb.round_off) || 0,
        grandTotal: Number(pb.grand_total) || 0,
        amountPaid: Number(pb.amount_paid) || 0,
        status: (pb.status as PaymentStatus) || 'UNPAID',
        notes: pb.notes,
        createdAt: pb.created_at || new Date().toISOString(),
        updatedAt: pb.updated_at || new Date().toISOString()
      }));

      await db.purchases.bulkPut(localPurchases);
      pulledCount += localPurchases.length;
    }

    // 6. Pull Payment Transactions
    const { data: paymentsData, error: paymentsErr } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('user_id', userId);

    if (paymentsErr) throw paymentsErr;

    if (paymentsData && paymentsData.length > 0) {
      const localPayments: PaymentTransaction[] = paymentsData.map(pt => ({
        id: pt.id,
        userId: pt.user_id,
        partyId: pt.party_id || '',
        partyName: pt.party_name || '',
        partyType: pt.party_type as PartyType,
        documentId: pt.document_id,
        docNumber: pt.doc_number,
        type: (pt.type as PaymentTransactionType) || 'PAYMENT_RECEIVED',
        amount: Number(pt.amount) || 0,
        paymentMethod: (pt.payment_method as PaymentMethod) || 'UPI',
        referenceNumber: pt.reference_number,
        date: pt.date,
        notes: pt.notes,
        createdAt: pt.created_at || new Date().toISOString()
      }));

      await db.paymentTransactions.bulkPut(localPayments);
      pulledCount += localPayments.length;
    }

    return { 
      success: true, 
      message: `Successfully synchronized ${pulledCount} items from Cloud.`,
      pulledCount 
    };
  } catch (err) {
    console.error('Error pulling data from cloud:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to pull data from cloud.',
      error: err
    };
  }
}

/**
 * Pushes all local records for the given user to Supabase cloud
 */
export async function pushToCloud(userId: string): Promise<SyncResult> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) {
    return { success: false, message: 'Cloud sync is not configured.' };
  }

  try {
    let pushedCount = 0;

    // 1. Push Profile
    const profile = await db.businessProfile.where('userId').equals(userId).first();
    if (profile) {
      const cloudProfile = {
        user_id: userId,
        name: profile.name || profile.companyName,
        company_name: profile.companyName,
        trade_name: profile.tradeName || profile.companyName,
        full_name: profile.fullName,
        legal_name: profile.legalName || profile.fullName,
        tax_scheme: profile.taxScheme || 'REGULAR',
        is_gst_registered: profile.isGstRegistered ?? true,
        gstin: profile.gstin || '',
        phone: profile.phone || '',
        email: profile.email || '',
        address_line1: profile.addressLine1 || '',
        address_line2: profile.addressLine2 || '',
        pincode: profile.pincode || '',
        city: profile.city || '',
        address: profile.address || '',
        state_code: profile.stateCode || '09',
        bank_name: profile.bankName || '',
        account_number: profile.accountNumber || '',
        ifsc_code: profile.ifscCode || '',
        branch_name: profile.branchName || '',
        upi_id: profile.upiId || '',
        invoice_prefix: profile.invoicePrefix || 'INV/26-27/',
        invoice_format: profile.invoiceFormat || 'A4_MODERN',
        terms_and_conditions: profile.termsAndConditions || '',
        updated_at: new Date().toISOString()
      };

      const { error: profileErr } = await supabase
        .from('business_profiles')
        .upsert(cloudProfile, { onConflict: 'user_id' });

      if (profileErr) throw profileErr;
      pushedCount++;
    }

    // 2. Push Parties
    const parties = await db.parties.where('userId').equals(userId).toArray();
    if (parties.length > 0) {
      const cloudParties = parties.map(p => ({
        id: p.id,
        user_id: userId,
        name: p.name,
        trade_name: p.tradeName,
        gstin: p.gstin,
        phone: p.phone,
        email: p.email,
        billing_address: p.billingAddress,
        shipping_address: p.shippingAddress,
        address_line1: p.addressLine1,
        address_line2: p.addressLine2,
        pincode: p.pincode,
        city: p.city,
        state_code: p.stateCode,
        type: p.type,
        gst_status: p.gstStatus,
        opening_balance: p.openingBalance,
        opening_balance_type: p.openingBalanceType,
        created_at: p.createdAt,
        updated_at: new Date().toISOString()
      }));

      const { error: partyErr } = await supabase
        .from('parties')
        .upsert(cloudParties, { onConflict: 'id' });

      if (partyErr) throw partyErr;
      pushedCount += cloudParties.length;
    }

    // 3. Push Products
    const products = await db.products.where('userId').equals(userId).toArray();
    if (products.length > 0) {
      const cloudProducts = products.map(pr => ({
        id: pr.id,
        user_id: userId,
        name: pr.name,
        sku: pr.sku,
        hsn: pr.hsn,
        category: pr.category,
        type: pr.type,
        unit: pr.unit,
        sale_price: pr.salePrice,
        purchase_price: pr.purchasePrice,
        last_purchase_price: pr.lastPurchasePrice,
        gst_rate: pr.gstRate,
        stock: pr.stock,
        low_stock_alert: pr.lowStockAlert,
        batch_number: pr.batchNumber,
        serial_numbers: pr.serialNumbers,
        created_at: pr.createdAt,
        updated_at: new Date().toISOString()
      }));

      const { error: prodErr } = await supabase
        .from('products')
        .upsert(cloudProducts, { onConflict: 'id' });

      if (prodErr) throw prodErr;
      pushedCount += cloudProducts.length;
    }

    // 4. Push Documents
    const documents = await db.documents.where('userId').equals(userId).toArray();
    if (documents.length > 0) {
      const cloudDocs = documents.map(d => ({
        id: d.id,
        user_id: userId,
        doc_type: d.docType,
        doc_number: d.docNumber,
        date: d.date,
        due_date: d.dueDate,
        party_id: d.partyId,
        party_name: d.partyName,
        party_gstin: d.partyGstin,
        party_address: d.partyAddress,
        party_phone: d.partyPhone,
        party_email: d.partyEmail,
        shipping_address: d.shippingAddress,
        place_of_supply: d.placeOfSupply,
        items: d.items,
        sub_total: d.subTotal,
        total_discount: d.totalDiscount,
        total_cgst: d.totalCgst,
        total_sgst: d.totalSgst,
        total_igst: d.totalIgst,
        round_off: d.roundOff,
        grand_total: d.grandTotal,
        amount_paid: d.amountPaid,
        status: d.status,
        transport_details: d.transportDetails,
        notes: d.notes,
        terms: d.terms,
        created_at: d.createdAt,
        updated_at: d.updatedAt || new Date().toISOString()
      }));

      const { error: docErr } = await supabase
        .from('documents')
        .upsert(cloudDocs, { onConflict: 'id' });

      if (docErr) throw docErr;
      pushedCount += cloudDocs.length;
    }

    // 5. Push Purchases
    const purchases = await db.purchases.where('userId').equals(userId).toArray();
    if (purchases.length > 0) {
      const cloudPurchases = purchases.map(pb => ({
        id: pb.id,
        user_id: userId,
        bill_number: pb.billNumber,
        bill_date: pb.billDate,
        due_date: pb.dueDate,
        party_id: pb.partyId,
        party_name: pb.partyName,
        party_gstin: pb.partyGstin,
        party_address: pb.partyAddress,
        party_phone: pb.partyPhone,
        place_of_supply: pb.placeOfSupply,
        items: pb.items,
        sub_total: pb.subTotal,
        total_discount: pb.totalDiscount,
        total_cgst: pb.totalCgst,
        total_sgst: pb.totalSgst,
        total_igst: pb.totalIgst,
        round_off: pb.roundOff,
        grand_total: pb.grandTotal,
        amount_paid: pb.amountPaid,
        status: pb.status,
        notes: pb.notes,
        created_at: pb.createdAt,
        updated_at: pb.updatedAt || new Date().toISOString()
      }));

      const { error: purchErr } = await supabase
        .from('purchases')
        .upsert(cloudPurchases, { onConflict: 'id' });

      if (purchErr) throw purchErr;
      pushedCount += cloudPurchases.length;
    }

    // 6. Push Payments
    const payments = await db.paymentTransactions.where('userId').equals(userId).toArray();
    if (payments.length > 0) {
      const cloudPayments = payments.map(pt => ({
        id: pt.id,
        user_id: userId,
        party_id: pt.partyId,
        party_name: pt.partyName,
        party_type: pt.partyType,
        document_id: pt.documentId,
        doc_number: pt.docNumber,
        type: pt.type,
        amount: pt.amount,
        payment_method: pt.paymentMethod,
        reference_number: pt.referenceNumber,
        date: pt.date,
        notes: pt.notes,
        created_at: pt.createdAt
      }));

      const { error: payErr } = await supabase
        .from('payment_transactions')
        .upsert(cloudPayments, { onConflict: 'id' });

      if (payErr) throw payErr;
      pushedCount += cloudPayments.length;
    }

    return { 
      success: true, 
      message: `Successfully pushed ${pushedCount} items to Cloud.`,
      pushedCount 
    };
  } catch (err) {
    console.error('Error pushing data to cloud:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to push data to cloud.',
      error: err
    };
  }
}

/**
 * Full bidirectional sync: pulls updates from cloud, then pushes local data
 */
export async function syncAll(userId: string): Promise<SyncResult> {
  const pullRes = await pullFromCloud(userId);
  if (!pullRes.success) {
    return pullRes;
  }
  const pushRes = await pushToCloud(userId);
  return {
    success: pushRes.success,
    message: `Sync complete (${pullRes.pulledCount ?? 0} pulled, ${pushRes.pushedCount ?? 0} pushed).`,
    pulledCount: pullRes.pulledCount,
    pushedCount: pushRes.pushedCount
  };
}
