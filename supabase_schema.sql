-- ==============================================================================
-- GoGST Bill - Supabase Cloud Database Schema
-- Provides multi-device synchronization with Row-Level Security (RLS)
-- Run this entire script in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Business Profiles Table
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name text NOT NULL,
  company_name text NOT NULL,
  trade_name text,
  full_name text NOT NULL,
  legal_name text,
  tax_scheme text DEFAULT 'REGULAR',
  is_gst_registered boolean DEFAULT true,
  gstin text,
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  pincode text,
  city text,
  address text,
  state_code text DEFAULT '09',
  bank_name text,
  account_number text,
  ifsc_code text,
  branch_name text,
  upi_id text,
  invoice_prefix text DEFAULT 'INV/26-27/',
  invoice_format text,
  terms_and_conditions text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Parties Table (Customers & Vendors)
CREATE TABLE IF NOT EXISTS public.parties (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  trade_name text,
  gstin text,
  phone text,
  email text,
  billing_address text,
  shipping_address text,
  address_line1 text,
  address_line2 text,
  pincode text,
  city text,
  state_code text,
  type text NOT NULL, -- 'customer' | 'vendor'
  gst_status text DEFAULT 'Verified',
  opening_balance numeric DEFAULT 0,
  opening_balance_type text DEFAULT 'DEBIT',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Products Table (Catalog & Inventory)
CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  sku text,
  hsn text,
  category text,
  type text DEFAULT 'GOODS',
  unit text DEFAULT 'PCS',
  sale_price numeric DEFAULT 0,
  purchase_price numeric DEFAULT 0,
  last_purchase_price numeric,
  gst_rate numeric DEFAULT 18,
  stock numeric DEFAULT 0,
  low_stock_alert numeric DEFAULT 5,
  batch_number text,
  serial_numbers text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Documents Table (Sales Invoices, Quotations, Proformas, Credit Notes)
CREATE TABLE IF NOT EXISTS public.documents (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  doc_type text NOT NULL, -- 'INVOICE' | 'QUOTATION' | 'PROFORMA' | 'CHALLAN' | 'CREDIT_NOTE' | 'DEBIT_NOTE'
  doc_number text NOT NULL,
  date date NOT NULL,
  due_date date,
  party_id text,
  party_name text,
  party_gstin text,
  party_address text,
  party_phone text,
  party_email text,
  shipping_address text,
  place_of_supply text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  sub_total numeric DEFAULT 0,
  total_discount numeric DEFAULT 0,
  total_cgst numeric DEFAULT 0,
  total_sgst numeric DEFAULT 0,
  total_igst numeric DEFAULT 0,
  round_off numeric DEFAULT 0,
  grand_total numeric DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  status text DEFAULT 'UNPAID',
  transport_details jsonb,
  notes text,
  terms text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Purchases Table (Inward Bills)
CREATE TABLE IF NOT EXISTS public.purchases (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bill_number text NOT NULL,
  bill_date date NOT NULL,
  due_date date,
  party_id text,
  party_name text,
  party_gstin text,
  party_address text,
  party_phone text,
  place_of_supply text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  sub_total numeric DEFAULT 0,
  total_discount numeric DEFAULT 0,
  total_cgst numeric DEFAULT 0,
  total_sgst numeric DEFAULT 0,
  total_igst numeric DEFAULT 0,
  round_off numeric DEFAULT 0,
  grand_total numeric DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  status text DEFAULT 'UNPAID',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 7. Payment Transactions Table
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  party_id text,
  party_name text,
  party_type text,
  document_id text,
  doc_number text,
  type text NOT NULL, -- 'PAYMENT_RECEIVED' | 'PAYMENT_MADE'
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  reference_number text,
  date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 8. Audit History Logs Table
CREATE TABLE IF NOT EXISTS public.history_logs (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  title text NOT NULL,
  details text NOT NULL,
  metadata jsonb,
  timestamp timestamptz DEFAULT now()
);

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- Ensures each user can only read, insert, update, and delete their own business records
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history_logs ENABLE ROW LEVEL SECURITY;

-- Business Profiles Policies
DROP POLICY IF EXISTS "Users can manage their own business profile" ON public.business_profiles;
CREATE POLICY "Users can manage their own business profile"
  ON public.business_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Parties Policies
DROP POLICY IF EXISTS "Users can manage their own parties" ON public.parties;
CREATE POLICY "Users can manage their own parties"
  ON public.parties FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Products Policies
DROP POLICY IF EXISTS "Users can manage their own products" ON public.products;
CREATE POLICY "Users can manage their own products"
  ON public.products FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Documents Policies
DROP POLICY IF EXISTS "Users can manage their own documents" ON public.documents;
CREATE POLICY "Users can manage their own documents"
  ON public.documents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Purchases Policies
DROP POLICY IF EXISTS "Users can manage their own purchases" ON public.purchases;
CREATE POLICY "Users can manage their own purchases"
  ON public.purchases FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Payment Transactions Policies
DROP POLICY IF EXISTS "Users can manage their own payments" ON public.payment_transactions;
CREATE POLICY "Users can manage their own payments"
  ON public.payment_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- History Logs Policies
DROP POLICY IF EXISTS "Users can manage their own history logs" ON public.history_logs;
CREATE POLICY "Users can manage their own history logs"
  ON public.history_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_parties_user ON public.parties(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON public.purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON public.history_logs(user_id);
