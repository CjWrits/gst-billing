import React, { useState, useEffect } from 'react';
import { 
  Building2, RefreshCw, Loader2, CheckCircle2, AlertCircle, 
  Info, Save, ArrowRight, QrCode, Phone, ChevronDown, ChevronUp 
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import { BusinessProfile, UserSession, GstStatus } from '../types';
import { STATE_OPTIONS, isValidGstin, getStateCodeFromGstin } from '../utils/gstEngine';
import { fetchGstinDetails } from '../utils/gstinLookup';
import { isSupabaseConfigured } from '../utils/supabase';
import { pushToCloud } from '../utils/cloudSync';

export interface BusinessRegistrationProps {
  session: UserSession;
  initialProfile?: BusinessProfile | null;
  onSuccess?: (profile: BusinessProfile) => void;
  isSettingsMode?: boolean;
}

export const BusinessRegistration: React.FC<BusinessRegistrationProps> = ({
  session,
  initialProfile,
  onSuccess,
  isSettingsMode = false
}) => {
  // 1. Are you registered under GST? Segmented Yes / No toggle (default: Yes)
  const [isGstRegistered, setIsGstRegistered] = useState<boolean>(() => {
    if (initialProfile) {
      return initialProfile.isGstRegistered ?? Boolean(initialProfile.gstin);
    }
    return true;
  });

  const [taxScheme, setTaxScheme] = useState<'REGULAR' | 'COMPOSITION'>(() => {
    return initialProfile?.taxScheme || 'REGULAR';
  });

  // 2. GSTIN
  const [gstin, setGstin] = useState<string>(initialProfile?.gstin || '');
  const [isFetchingGstin, setIsFetchingGstin] = useState(false);
  const [gstinStatus, setGstinStatus] = useState<GstStatus | null>(null);
  const [gstinFeedback, setGstinFeedback] = useState<{
    text: string;
    type: 'success' | 'warning' | 'info' | 'error';
  } | null>(null);

  // 3. Company / Legal Name*
  const [companyName, setCompanyName] = useState<string>(
    initialProfile?.companyName || initialProfile?.name || ''
  );

  const [tradeName, setTradeName] = useState<string>(
    initialProfile?.tradeName || initialProfile?.companyName || initialProfile?.name || ''
  );

  // 4. Full Name* (Proprietor / Authorized Person Name)
  const [fullName, setFullName] = useState<string>(
    initialProfile?.fullName || initialProfile?.legalName || initialProfile?.companyName || initialProfile?.name || ''
  );

  // 5. Email (Optional)
  const [email, setEmail] = useState<string>(
    initialProfile?.email || session.email || ''
  );

  // 6. Address Line 1*
  const [addressLine1, setAddressLine1] = useState<string>(
    initialProfile?.addressLine1 || initialProfile?.address || ''
  );

  // 7. Address Line 2 (Optional)
  const [addressLine2, setAddressLine2] = useState<string>(
    initialProfile?.addressLine2 || ''
  );

  // 8. Pincode* (6 digits)
  const [pincode, setPincode] = useState<string>(
    initialProfile?.pincode || ''
  );

  // 9. City*
  const [city, setCity] = useState<string>(
    initialProfile?.city || ''
  );

  // 10. State* (Required Dropdown covering all 37 Indian States/UTs - Default Uttar Pradesh 09)
  const [stateCode, setStateCode] = useState<string>(
    initialProfile?.stateCode || '09'
  );

  // Additional optional business fields
  const [phone, setPhone] = useState<string>(initialProfile?.phone || '');
  const [upiId, setUpiId] = useState<string>(initialProfile?.upiId || '');
  const [invoicePrefix, setInvoicePrefix] = useState<string>(
    initialProfile?.invoicePrefix || 'INV/26-27/'
  );
  const [bankName, setBankName] = useState<string>(initialProfile?.bankName || '');
  const [accountNumber, setAccountNumber] = useState<string>(initialProfile?.accountNumber || '');
  const [ifscCode, setIfscCode] = useState<string>(initialProfile?.ifscCode || '');
  const [branchName, setBranchName] = useState<string>(initialProfile?.branchName || '');
  const [termsAndConditions, setTermsAndConditions] = useState<string>(
    initialProfile?.termsAndConditions || 
    '1. Goods once sold will not be taken back.\n2. Payment due within 15 days of invoice date.\n3. Subject to local jurisdiction only.'
  );

  const [showAdvanced, setShowAdvanced] = useState<boolean>(isSettingsMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Sync state if initialProfile changes
  useEffect(() => {
    if (initialProfile) {
      setIsGstRegistered(initialProfile.isGstRegistered ?? Boolean(initialProfile.gstin));
      setTaxScheme(initialProfile.taxScheme || 'REGULAR');
      setGstin(initialProfile.gstin || '');
      setCompanyName(initialProfile.companyName || initialProfile.name || '');
      setTradeName(initialProfile.tradeName || initialProfile.companyName || initialProfile.name || '');
      setFullName(initialProfile.fullName || initialProfile.legalName || initialProfile.companyName || '');
      setEmail(initialProfile.email || session.email || '');
      setAddressLine1(initialProfile.addressLine1 || initialProfile.address || '');
      setAddressLine2(initialProfile.addressLine2 || '');
      setPincode(initialProfile.pincode || '');
      setCity(initialProfile.city || '');
      setStateCode(initialProfile.stateCode || '09');
      setPhone(initialProfile.phone || '');
      setUpiId(initialProfile.upiId || '');
      setInvoicePrefix(initialProfile.invoicePrefix || 'INV/26-27/');
      setBankName(initialProfile.bankName || '');
      setAccountNumber(initialProfile.accountNumber || '');
      setIfscCode(initialProfile.ifscCode || '');
      setBranchName(initialProfile.branchName || '');
      if (initialProfile.termsAndConditions) {
        setTermsAndConditions(initialProfile.termsAndConditions);
      }
    }
  }, [initialProfile, session.email]);

  // Handle GST toggle
  const handleToggleGst = (registered: boolean) => {
    setIsGstRegistered(registered);
    setFormError(null);
    if (!registered) {
      setGstinStatus(null);
      setGstinFeedback(null);
    }
  };

  // Handle GSTIN change
  const handleGstinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
    setGstin(val);
    setGstinStatus(null);
    setGstinFeedback(null);
    setFormError(null);

    // Auto-detect state from first 2 digits
    const detectedState = getStateCodeFromGstin(val);
    if (detectedState) {
      setStateCode(detectedState);
    }
  };

  // Auto-Fill Handler
  const handleAutoFill = async () => {
    const cleanGstin = gstin.trim().toUpperCase();
    if (!cleanGstin) {
      setFormError('Please enter a 15-character GSTIN before clicking Auto Fill.');
      return;
    }

    if (cleanGstin.length !== 15) {
      setFormError(`GSTIN must be exactly 15 characters (currently ${cleanGstin.length}).`);
      return;
    }

    if (!isValidGstin(cleanGstin)) {
      setFormError('Invalid GSTIN format. Expected 2 digits + 10-char PAN + 1 entity num + Z + 1 check digit.');
      return;
    }

    setIsFetchingGstin(true);
    setGstinFeedback(null);
    setFormError(null);

    try {
      const result = await fetchGstinDetails(cleanGstin);

      // Auto-populate State
      if (result.stateCode) {
        setStateCode(result.stateCode);
      }

      // Auto-populate Company Name & Full Name
      if (result.companyName) {
        setCompanyName(result.companyName);
      }
      if (result.fullName) {
        setFullName(result.fullName);
      }

      // Auto-populate Address Lines, Pincode, City
      if (result.addressLine1) {
        setAddressLine1(result.addressLine1);
      }
      if (result.addressLine2) {
        setAddressLine2(result.addressLine2);
      }
      if (result.pincode) {
        setPincode(result.pincode);
      }
      if (result.city) {
        setCity(result.city);
      }

      // Set status badge
      setGstinStatus(result.status);

      // Set feedback message
      if (result.isCached) {
        setGstinFeedback({
          text: result.helperMessage || 'Auto-filled instantly from local offline cache (0 API credits used).',
          type: 'success'
        });
      } else if (result.isLiveFetched) {
        setGstinFeedback({
          text: `Verified via GST Portal: ${result.companyName} (${result.status})`,
          type: result.status === 'Active' ? 'success' : 'warning'
        });
      } else if (result.helperMessage) {
        setGstinFeedback({
          text: result.helperMessage,
          type: 'info'
        });
      }
    } catch (err) {
      console.error('Auto Fill error:', err);
      // Graceful fallback to state detection
      const fallbackState = getStateCodeFromGstin(cleanGstin);
      if (fallbackState) {
        setStateCode(fallbackState);
      }
      setGstinFeedback({
        text: 'State auto-detected from GSTIN. Enter remaining address details or add VITE_GSTIN_API_KEY in .env for full auto-fill.',
        type: 'info'
      });
    } finally {
      setIsFetchingGstin(false);
    }
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessToast(null);

    // Validation
    if (isGstRegistered) {
      const cleanGstin = gstin.trim().toUpperCase();
      if (!cleanGstin) {
        setFormError('Please enter your 15-character GSTIN or select "No" if not registered.');
        return;
      }
      if (!isValidGstin(cleanGstin)) {
        setFormError('Please enter a valid 15-character Indian GSTIN.');
        return;
      }
    }

    if (!companyName.trim()) {
      setFormError('Company Name is required.');
      return;
    }

    if (!fullName.trim()) {
      setFormError('Full Name (Proprietor / Authorized Person) is required.');
      return;
    }

    if (!addressLine1.trim()) {
      setFormError('Address Line 1 is required.');
      return;
    }

    const cleanPincode = pincode.trim();
    if (!cleanPincode || cleanPincode.length !== 6 || !/^\d{6}$/.test(cleanPincode)) {
      setFormError('Pincode must be exactly 6 numeric digits.');
      return;
    }

    if (!city.trim()) {
      setFormError('City is required.');
      return;
    }

    if (!stateCode) {
      setFormError('Please select a State.');
      return;
    }

    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();
      const cleanGstin = isGstRegistered ? gstin.trim().toUpperCase() : '';
      const compName = companyName.trim();
      const flName = fullName.trim();
      const addr1 = addressLine1.trim();
      const addr2 = addressLine2.trim();
      const ct = city.trim();
      const pin = cleanPincode;

      const compositeAddress = [
        addr1,
        addr2,
        ct && pin ? `${ct} - ${pin}` : (ct || pin)
      ].filter(Boolean).join(', ');

      const profilePayload: BusinessProfile = {
        userId: session.userId,
        name: compName,
        companyName: compName,
        tradeName: tradeName.trim() || compName,
        fullName: flName,
        legalName: flName,
        taxScheme: taxScheme || 'REGULAR',
        isGstRegistered,
        gstin: cleanGstin,
        phone: phone.trim(),
        email: email.trim(),
        addressLine1: addr1,
        addressLine2: addr2,
        pincode: pin,
        city: ct,
        address: compositeAddress,
        stateCode: stateCode.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        branchName: branchName.trim(),
        upiId: upiId.trim(),
        invoicePrefix: invoicePrefix.trim() || 'INV/26-27/',
        termsAndConditions: termsAndConditions.trim() || 
          '1. Goods once sold will not be taken back.\n2. Payment due within 15 days.\n3. Subject to local jurisdiction.',
        createdAt: initialProfile?.createdAt || now,
        updatedAt: now
      };

      // Check existing record by userId or initialProfile.id
      let targetId = initialProfile?.id;
      if (!targetId) {
        const existing = await db.businessProfile.where('userId').equals(session.userId).first();
        if (existing?.id) {
          targetId = existing.id;
        }
      }

      if (targetId) {
        await db.businessProfile.update(targetId, profilePayload);
        profilePayload.id = targetId;
      } else {
        const newId = await db.businessProfile.add(profilePayload);
        profilePayload.id = newId;
      }

      await logAudit({
        userId: session.userId,
        action: 'PROFILE_UPDATED',
        entityType: 'PROFILE',
        entityId: session.userId,
        title: isSettingsMode ? 'Updated Business Profile' : 'Business Registration Completed',
        details: `Saved profile for ${profilePayload.companyName} (${profilePayload.isGstRegistered ? `GSTIN: ${profilePayload.gstin}` : 'Unregistered'}).`
      });

      setSuccessToast(
        isSettingsMode ? 'Business Profile saved successfully!' : 'Business registered successfully!'
      );

      if (isSupabaseConfigured() && session?.userId) {
        pushToCloud(session.userId).catch(console.warn);
      }

      if (onSuccess) {
        onSuccess(profilePayload);
      }
    } catch (err) {
      console.error('Failed to save business profile:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save business profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="p-6 border-b border-slate-100 flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              {isSettingsMode ? 'Seller Identity & Tax Registration' : 'Business Registration'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isSettingsMode 
                ? 'Manage your GST registration, company trade identity, and billing address.'
                : 'Enter your GST & business details to start generating GST compliant invoices.'}
            </p>
          </div>
        </div>

        {successToast && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {successToast}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
        {/* Error Alert */}
        {formError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* 1. Are you registered under GST? — Segmented Yes / No toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Are you registered under GST? <span className="text-rose-500">*</span>
            </label>
            <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => handleToggleGst(true)}
                className={`px-5 py-2 text-xs font-bold rounded-md transition-all ${
                  isGstRegistered
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Yes, Registered
              </button>
              <button
                type="button"
                onClick={() => handleToggleGst(false)}
                className={`px-5 py-2 text-xs font-bold rounded-md transition-all ${
                  !isGstRegistered
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unregistered
              </button>
            </div>
          </div>

          {isGstRegistered && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                GST Tax Scheme <span className="text-rose-500">*</span>
              </label>
              <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setTaxScheme('REGULAR')}
                  className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                    taxScheme === 'REGULAR'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Regular GST
                </button>
                <button
                  type="button"
                  onClick={() => setTaxScheme('COMPOSITION')}
                  className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                    taxScheme === 'COMPOSITION'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Composition Scheme
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. GSTIN Row with inline Auto Fill button (visible when GST = Yes) */}
        {isGstRegistered && (
          <div className="animate-in fade-in duration-200">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              GSTIN <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  maxLength={15}
                  required={isGstRegistered}
                  placeholder="e.g. 08ABNCS1711R1ZQ"
                  value={gstin}
                  onChange={handleGstinInputChange}
                  className="w-full px-3 py-2.5 text-sm font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {gstinStatus && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {gstinStatus === 'Active' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        Cancelled / Suspended
                      </span>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleAutoFill}
                disabled={isFetchingGstin || gstin.trim().length < 2}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 text-xs font-bold rounded-lg shadow-xs transition-colors shrink-0"
              >
                {isFetchingGstin ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 text-white" />
                    Auto Fill
                  </>
                )}
              </button>
            </div>

            {/* Non-blocking feedback message */}
            {gstinFeedback && (
              <div className={`mt-2 p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                gstinFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                gstinFeedback.type === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                'bg-blue-50 text-blue-800 border border-blue-200'
              }`}>
                {gstinFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : gstinFeedback.type === 'warning' ? (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{gstinFeedback.text}</span>
              </div>
            )}
          </div>
        )}

        {/* 3. Company & Trade Names */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Legal Business Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Acme Safety Solutions Pvt Ltd"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Trade / Brand Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Acme Fire Protection"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* 4. Full Name* (Required) */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400 font-normal">
              Proprietor / Authorized Person
            </span>
          </div>
          <input
            type="text"
            required
            placeholder="Sameva Energy Private Limited"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* 5. Email (Optional) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Email <span className="text-[11px] text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="email"
            placeholder="Enter email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* 6. Address Line 1* (Required) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Address Line 1 <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="Shop At Plot No.6 (Building, Shop, Plot No. & Street)"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* 7. Address Line 2 (Optional) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Address Line 2 <span className="text-[11px] text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            placeholder="Canal Road (Locality, Road, Landmark)"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* 8. Pincode* & 9. City* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Pincode (6 Digits) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={6}
              placeholder="324008"
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              City <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Kota"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* 10. State* (Required Dropdown covering all 37 Indian States/UTs) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            State <span className="text-rose-500">*</span>
          </label>
          <select
            required
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
          >
            {STATE_OPTIONS.map((state) => (
              <option key={state.code} value={state.code}>
                {state.label}
              </option>
            ))}
          </select>
        </div>

        {/* Collapsible Additional Details Section (Phone, UPI, Banking, Invoice Prefix) */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between py-2 text-xs font-bold text-slate-700 hover:text-blue-600 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              Additional Details (Phone, UPI QR, Banking &amp; Invoice Settings)
            </span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Business Phone
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98290 00000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                    UPI ID (For Scan &amp; Pay QR)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. yourbusiness@upi"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Invoice Prefix
                  </label>
                  <input
                    type="text"
                    placeholder="INV/26-27/"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. State Bank of India"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    placeholder="Bank Account No"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    placeholder="SBIN0001234"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-lg focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    placeholder="Main Branch"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Default Terms &amp; Conditions
                </label>
                <textarea
                  rows={2}
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Form Action Button */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving Profile...
              </>
            ) : isSettingsMode ? (
              <>
                <Save className="w-4 h-4" />
                Save Business Profile
              </>
            ) : (
              <>
                Complete Registration &amp; Launch Dashboard
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
