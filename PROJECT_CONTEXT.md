# Project Context: GoGST Billing & GST Compliance System

## 1. System Architecture Overview
GoGST is a high-performance, offline-first GST billing, inventory management, and compliance web application engineered for Indian businesses.

- **Frontend Core**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite 8.
- **Data Persistence**: Offline-first IndexedDB powered by Dexie v4 (`db.parties`, `db.invoices`, `db.products`, `db.purchases`, `db.payments`, `db.gstinCache`, `db.auditLogs`, `db.businessProfile`).
- **Security & Key Handling**: No API keys or credentials are baked into client bundles or hardcoded in source. GSTIN API keys are stored solely in local browser storage (`gogst_gstin_api_key`) or retrieved from cache.
- **Offline Resilience**: Works 100% offline. If an API key is absent or the device is disconnected, GSTIN lookups gracefully parse the state code, state name, and PAN locally, allowing seamless manual completion.

---

## 2. Feature Specification: Buyer GSTIN Detail Lookup

### 2.1 Problem Statement
Previously, GSTIN-based business detail lookup was only available during initial seller registration/onboarding. When adding or editing customers (buyers) or entering customer GSTINs directly during invoice creation, users had to type company legal names, trade names, state codes, and addresses manually.

### 2.2 Solution & Implementation
Integrated GSTIN detail lookup into both **Add Customer** and **Edit Customer** forms in [PartyManager.tsx](file:///C:/Users/Chirag/Desktop/gogst/src/components/PartyManager.tsx), and extended quick auto-fill to [InvoiceBuilder.tsx](file:///C:/Users/Chirag/Desktop/gogst/src/components/InvoiceBuilder.tsx).

#### Key Components Modified:
1. **[src/types/index.ts](file:///C:/Users/Chirag/Desktop/gogst/src/types/index.ts)**:
   - Extended `Party` interface with optional fields:
     * `city?: string;`
     * `pincode?: string;`
     * `addressLine1?: string;`
     * `addressLine2?: string;`

2. **[src/components/PartyManager.tsx](file:///C:/Users/Chirag/Desktop/gogst/src/components/PartyManager.tsx)**:
   - Added `city` and `pincode` to `formData`, `resetForm()`, and `openEditModal()`.
   - Implemented `handleGstinLookup(inputGstin?: string)`:
     * Validates 15-character length and format.
     * Invokes `fetchGstinDetails(clean)`.
     * Populates `name`, `tradeName`, `billingAddress`, `shippingAddress`, `city`, `pincode`, `stateCode`, and `gstStatus`.
     * Preserves custom fields (e.g. shipping address, phone, email, opening balance) in edit mode without unwanted overwrites.
     * Automatically triggers lookup on 15 characters for newly added parties when name is empty.
     * Dynamic state code auto-detection as soon as first 2 digits are entered.
   - UI Integration:
     * **Auto-Fill Button**: Integrated adjacent to GSTIN field with animated spinner (`isFetchingGstin`).
     * **Status Badges**: Visual indicator (`Active`, `Verified`, `Cancelled`).
     * **Context Alert**: Color-coded banners for success (`Verified via GST Portal`), cache hits (`Loaded from local offline cache - 0 API credits used`), offline auto-detection (`State & PAN Auto-detected`), and errors.
     * **Dedicated Input Fields**: Added City/District and Pincode fields alongside State dropdown.
   - Persistence:
     * Updated `handleSubmit` to save `city` and `pincode` to `db.parties`.

3. **[src/components/InvoiceBuilder.tsx](file:///C:/Users/Chirag/Desktop/gogst/src/components/InvoiceBuilder.tsx)**:
   - Integrated `handleBuyerGstinLookup` into Party GSTIN entry.
   - Auto-populates `partyName`, `partyAddress`, and updates `placeOfSupply` (which automatically recalculates intra-state CGST+SGST vs. inter-state IGST).
   - Provides non-blocking status feedback to the user.

---

## 3. GSTIN Auto-Population & Merge Logic

| Target Field | Fetched Attribute Priority | Preservation Rule |
| :--- | :--- | :--- |
| `name` | `legalName` > `companyName` > `fullName` | Overwritten only if lookup succeeds; user can edit anytime. |
| `tradeName` | `tradeName` > `companyName` | Updated if present in API payload. |
| `billingAddress` | Full formatted address (`addressLine1`, `addressLine2`, `city - pincode`) | Formatted and filled; user editable. |
| `shippingAddress` | Defaults to billing address | **Preserved** if user already entered a custom warehouse/shipping address. |
| `city` | `city` > `district` | Updated if present; user editable. |
| `pincode` | `pincode` / `pncd` (6 digits) | Updated if present; user editable. |
| `stateCode` | `stateCode` (2 digits e.g. 09, 27) | Synced with Place of Supply / State dropdown. |
| `gstStatus` | `status` ('Active' / 'Cancelled') | Flagged with visual badge. |

---

## 4. Verification & Testing Evidence

### 4.1 TypeScript Compiler Check
```powershell
npx tsc --noEmit
# Result: 0 errors
```

### 4.2 Linter (Oxlint)
```powershell
npm run lint
# Result: Found 0 warnings and 0 errors. Finished on 29 files with 96 rules.
```

### 4.3 Automated Verification Suite (10 Passed)
The test suite executed and validated:
1. **Valid UP GSTIN (`09AAACH7409R1ZZ`)**: Correctly extracted state code `09`, state `Uttar Pradesh`, and PAN `AAACH7409R`.
2. **Valid Maharashtra GSTIN (`27AAPFU0939F1ZV`)**: Correctly extracted state code `27`, state `Maharashtra`, and PAN `AAPFU0939F`.
3. **Empty Input Handling**: Gracefully rejected with clear notification.
4. **Invalid Length Input (`09AAACH7409R`)**: Explicit error message indicating 15 characters required.
5. **Invalid Character Structure (`0XAAACH7409R1ZZ`)**: Regex format rejection.
6. **Unknown State Code (`99AAACH7409R1ZZ`)**: Rejected with unknown state code message.
7. **API Payload Mapping**: Successfully mapped `trade_name`, `legal_name`, `pradr.addr`, `pncd`, and `city` into clean `Party` entity fields.
8. **Add Customer Flow**: Successfully populated blank customer form with all fetched fields.
9. **Edit Customer Merge Flow**: Verified that custom shipping address, phone, email, and opening balance are retained and not overwritten.
10. **Offline Fallback Resilience**: Verified zero-crash fallback with state and PAN detection when offline or when no API credentials are provided.

### 4.4 Production Build
```powershell
npm run build
# Result:
# ✓ 2181 modules transformed.
# dist/index.html                   1.23 kB │ gzip:   0.66 kB
# dist/assets/index-Vi7aAn_4.css   49.84 kB │ gzip:   9.21 kB
# dist/assets/index-CVVlS6Qv.js   706.45 kB │ gzip: 181.87 kB
# ✓ built in 529ms
```

---

## 5. UI Polish & Enterprise Craftsmanship Refinement

### 5.1 Elimination of Generic "AI'ish" Tropes
- **Removed AI Clichés**: Replaced generic `Sparkles` icons and cartoonish glowing neon background blurs (`blur-2xl`) in login and registration flows with authentic enterprise accounting aesthetics (`Building2`, `RefreshCw`, `TrendingUp`, `CheckCircle2`).
- **Typography Elevation**: Added **Plus Jakarta Sans** for headlines and **JetBrains Mono** for invoice numbers, GSTINs, and currency figures alongside **Inter**, matching the visual quality of premier financial platforms (Linear, Stripe, Zoho Books).
- **Desktop Navigation Bar**: Added a dedicated top header bar on desktop with live Financial Year calculation (`FY 2026-27`), Place of Supply badge, and an offline IndexedDB synchronization indicator.
- **Enterprise Navigation Structure**: Re-organized the desktop sidebar navigation into clear accounting domains:
  1. *Operations*: Dashboard, Invoices & Billing, Purchases (Inward), Payments & Receipts
  2. *Masters & Catalog*: Customers & Vendors, Products & Inventory, GST Reports & Filing
  3. *System & Audit*: Audit Trail, Business Settings
- **Dashboard Tax Settlement Strip**: Upgraded the GST liability card into a 3-column tax computation strip displaying Outward Tax Liability vs. Eligible Input Tax Credit (ITC) vs. Net Cash Liability.
- **Table Density & Micro-Interactions**: Cleaned table headers with uppercase letter-spacing, subtle dot status indicators (Paid, Partial, Unpaid), and tactile button active states (`active:scale-[0.985]`).

