import { INDIAN_STATES, GSTIN_REGEX } from './gstEngine';
import { GstStatus, GstinCacheRecord } from '../types';
import { db } from '../db/database';

export interface LocalGstinParseResult {
  isValid: boolean;
  gstin: string;
  stateCode: string;
  stateName: string;
  pan: string;
  error?: string;
}

export interface GstinLookupResult {
  gstin: string;
  companyName?: string;
  fullName?: string;
  tradeName?: string;
  legalName?: string;
  addressLine1?: string;
  addressLine2?: string;
  pincode?: string;
  city?: string;
  address?: string;
  stateCode: string;
  stateName: string;
  pan: string;
  status: GstStatus;
  taxpayerType?: string;
  isLiveFetched: boolean;
  isCached?: boolean;
  error?: string;
  helperMessage?: string;
}

/**
 * Validates 15-character Indian GSTIN and extracts 2-digit State Code and 10-digit PAN
 */
export function parseGstinLocally(rawGstin: string): LocalGstinParseResult {
  const gstin = (rawGstin || '').trim().toUpperCase();

  if (!gstin) {
    return {
      isValid: false,
      gstin: '',
      stateCode: '',
      stateName: '',
      pan: '',
      error: 'GSTIN cannot be empty'
    };
  }

  if (gstin.length !== 15) {
    const code = gstin.substring(0, 2);
    return {
      isValid: false,
      gstin,
      stateCode: code,
      stateName: INDIAN_STATES[code] || '',
      pan: gstin.length >= 12 ? gstin.substring(2, 12) : '',
      error: `GSTIN must be exactly 15 characters (currently ${gstin.length})`
    };
  }

  if (!GSTIN_REGEX.test(gstin)) {
    const code = gstin.substring(0, 2);
    return {
      isValid: false,
      gstin,
      stateCode: code,
      stateName: INDIAN_STATES[code] || '',
      pan: gstin.substring(2, 12),
      error: 'Invalid GSTIN format. Expected: 2 digits + 10-char PAN + 1 entity num + Z + 1 check digit'
    };
  }

  const stateCode = gstin.substring(0, 2);
  const stateName = INDIAN_STATES[stateCode];

  if (!stateName) {
    return {
      isValid: false,
      gstin,
      stateCode,
      stateName: 'Unknown State',
      pan: gstin.substring(2, 12),
      error: `Invalid state code: "${stateCode}"`
    };
  }

  const pan = gstin.substring(2, 12);

  return {
    isValid: true,
    gstin,
    stateCode,
    stateName,
    pan
  };
}

/**
 * Parses raw JSON payload from GST APIs (supporting gstinapi.in, appyflow.in, sheet.gstincheck.co.in)
 */
function parseApiResponsePayload(data: unknown, cleanGstin: string, defaultStateCode: string, defaultStateName: string): GstinLookupResult {
  const root = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const details = (
    root.data || 
    root.taxpayerDetails || 
    root.result || 
    root
  ) as Record<string, unknown>;

  // Trade & Legal name
  const tradeNam = typeof details.trade_name === 'string' ? details.trade_name :
    typeof details.tradeNam === 'string' ? details.tradeNam : 
    typeof details.tradeName === 'string' ? details.tradeName : '';

  const lgnm = typeof details.legal_name === 'string' ? details.legal_name :
    typeof details.lgnm === 'string' ? details.lgnm : 
    typeof details.legalName === 'string' ? details.legalName : 
    typeof details.name === 'string' ? details.name : '';

  const companyName = (tradeNam || lgnm || '').trim();
  const fullName = (lgnm || companyName).trim();

  // Status mapping
  const rawStatus = (
    details.status || 
    details.sts || 
    details.gstStatus || 
    'Active'
  ).toString().toLowerCase();

  const gstStatus: GstStatus = (rawStatus.includes('can') || rawStatus.includes('susp')) 
    ? 'Cancelled' 
    : 'Active';

  const taxpayerType = typeof details.taxpayer_type === 'string' ? details.taxpayer_type : 
    typeof details.dty === 'string' ? details.dty : 'Regular';

  // State Code
  const responseStateCode = typeof details.state_code === 'string' ? details.state_code.padStart(2, '0') :
    typeof details.stcd === 'string' ? details.stcd.padStart(2, '0') : defaultStateCode;
  const stateCode = responseStateCode || defaultStateCode;
  const stateName = INDIAN_STATES[stateCode] || defaultStateName;

  // Address parsing
  const pradr = (details.pradr && typeof details.pradr === 'object' ? details.pradr : {}) as Record<string, unknown>;
  const addr = (
    pradr.addr || 
    details.addr || 
    details.principalAddress || 
    details
  ) as Record<string, unknown>;

  const bno = typeof addr.bno === 'string' ? addr.bno.trim() : 
    typeof addr.buildingNumber === 'string' ? addr.buildingNumber.trim() : 
    typeof addr.bldgNo === 'string' ? addr.bldgNo.trim() : '';

  const flno = typeof addr.flno === 'string' ? addr.flno.trim() : 
    typeof addr.floorNo === 'string' ? addr.floorNo.trim() : 
    typeof addr.flatNo === 'string' ? addr.flatNo.trim() : '';

  const bnm = typeof addr.bnm === 'string' ? addr.bnm.trim() : 
    typeof addr.buildingName === 'string' ? addr.buildingName.trim() : 
    typeof addr.premises === 'string' ? addr.premises.trim() : '';

  const st = typeof addr.st === 'string' ? addr.st.trim() : 
    typeof addr.street === 'string' ? addr.street.trim() : 
    typeof addr.road === 'string' ? addr.road.trim() : '';

  // addressLine1: Building/Floor/Plot/Street portion
  const line1Parts = [flno, bno, bnm, st].filter(Boolean);
  let addressLine1 = line1Parts.join(', ');
  if (!addressLine1 && typeof details.address === 'string') {
    addressLine1 = details.address.trim();
  }

  // addressLine2: Locality/Area portion
  const loc = typeof addr.loc === 'string' ? addr.loc.trim() : 
    typeof addr.locality === 'string' ? addr.locality.trim() : 
    typeof addr.area === 'string' ? addr.area.trim() : 
    typeof addr.landmark === 'string' ? addr.landmark.trim() : '';

  const dst = typeof addr.dst === 'string' ? addr.dst.trim() : 
    typeof addr.district === 'string' ? addr.district.trim() : '';

  const line2Parts = [loc, (dst && dst !== loc) ? dst : ''].filter(Boolean);
  const addressLine2 = line2Parts.join(', ');

  // pincode: 6-digit pncd
  const pincode = typeof addr.pncd === 'string' ? addr.pncd.trim() : 
    typeof addr.pincode === 'string' ? addr.pincode.trim() : 
    typeof details.pincode === 'string' ? details.pincode.trim() :
    typeof addr.pin === 'string' ? addr.pin.trim() : '';

  // city
  const city = typeof addr.city === 'string' ? addr.city.trim() : 
    typeof addr.dst === 'string' ? addr.dst.trim() : 
    typeof addr.district === 'string' ? addr.district.trim() : '';

  const fullAddress = typeof details.address === 'string' && details.address.trim() 
    ? details.address.trim() 
    : [
        addressLine1, 
        addressLine2, 
        city && pincode ? `${city} - ${pincode}` : (city || pincode)
      ].filter(Boolean).join(', ');

  return {
    gstin: cleanGstin,
    companyName: companyName || cleanGstin,
    fullName: fullName || companyName || cleanGstin,
    tradeName: tradeNam,
    legalName: lgnm,
    addressLine1: addressLine1 || fullAddress,
    addressLine2,
    pincode,
    city,
    address: fullAddress,
    stateCode,
    stateName,
    pan: cleanGstin.substring(2, 12),
    status: gstStatus,
    taxpayerType,
    isLiveFetched: true
  };
}

/**
 * Fetches GSTIN details via IndexedDB cache, gstinapi.in (or configured API),
 * or falls back gracefully to local regex extraction without blocking the user.
 */
export async function fetchGstinDetails(rawGstin: string, apiKeyOverride?: string): Promise<GstinLookupResult> {
  const local = parseGstinLocally(rawGstin);

  if (!local.isValid) {
    return {
      gstin: local.gstin,
      stateCode: local.stateCode,
      stateName: local.stateName,
      pan: local.pan,
      status: 'Cancelled',
      isLiveFetched: false,
      error: local.error || 'Invalid GSTIN'
    };
  }

  // 1. Check local IndexedDB cache first (0 API credits used)
  try {
    const cached = await db.gstinCache.get(local.gstin);
    if (cached) {
      return {
        gstin: cached.gstin,
        companyName: cached.companyName,
        fullName: cached.fullName,
        tradeName: cached.companyName,
        legalName: cached.fullName,
        addressLine1: cached.addressLine1,
        addressLine2: cached.addressLine2,
        pincode: cached.pincode,
        city: cached.city,
        address: [
          cached.addressLine1, 
          cached.addressLine2, 
          cached.city && cached.pincode ? `${cached.city} - ${cached.pincode}` : (cached.city || cached.pincode)
        ].filter(Boolean).join(', '),
        stateCode: cached.stateCode,
        stateName: cached.stateName,
        pan: cached.gstin.substring(2, 12),
        status: cached.status,
        taxpayerType: cached.taxpayerType,
        isLiveFetched: false,
        isCached: true,
        helperMessage: 'Loaded from local offline cache (0 API credits used).'
      };
    }
  } catch (cacheErr) {
    console.warn('Failed reading from gstinCache:', cacheErr);
  }

  // Retrieve user-configured API key from local storage or optional override
  const apiKey = (
    apiKeyOverride || 
    localStorage.getItem('gogst_gstin_api_key') || 
    (import.meta.env.VITE_GSTIN_API_KEY || '')
  ).trim();

  // 2. If API key is provided, attempt live network lookup
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      let endpoint = '';
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };

      if (apiKey.startsWith('gak_') || apiKey.includes('gstinapi')) {
        // gstinapi.in provider endpoint
        endpoint = `https://www.gstinapi.in/v1/gstin/${local.gstin}`;
        headers['x-api-key'] = apiKey;
      } else if (apiKey.startsWith('http')) {
        endpoint = apiKey.includes('{gstin}') 
          ? apiKey.replace('{gstin}', local.gstin) 
          : `${apiKey}/${local.gstin}`;
      } else if (apiKey.toLowerCase().includes('appyflow') || apiKey.length > 40) {
        endpoint = `https://appyflow.in/api/verifyGST?gstNo=${local.gstin}&key_secret=${apiKey}`;
      } else {
        endpoint = `https://sheet.gstincheck.co.in/check/${apiKey}/${local.gstin}`;
      }

      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        
        // Check for gstinapi.in success flag or payload
        if (json && (json.success === true || json.data || json.tradeNam || json.lgnm)) {
          const parsed = parseApiResponsePayload(json, local.gstin, local.stateCode, local.stateName);

          // Cache response in IndexedDB
          const cacheRecord: GstinCacheRecord = {
            gstin: local.gstin,
            companyName: parsed.companyName || '',
            fullName: parsed.fullName || '',
            addressLine1: parsed.addressLine1 || '',
            addressLine2: parsed.addressLine2 || '',
            pincode: parsed.pincode || '',
            city: parsed.city || '',
            stateCode: parsed.stateCode || local.stateCode,
            stateName: parsed.stateName || local.stateName,
            status: parsed.status,
            taxpayerType: parsed.taxpayerType,
            rawResponse: json,
            cachedAt: new Date().toISOString()
          };
          await db.gstinCache.put(cacheRecord);

          return parsed;
        }
      }
    } catch (networkErr) {
      console.warn('Live GSTIN fetch failed or timed out, falling back to local detection:', networkErr);
    }
  }

  // 3. Fallback: Auto-detect state from first 2 digits and show non-blocking helper message
  return {
    gstin: local.gstin,
    companyName: '',
    fullName: '',
    addressLine1: '',
    addressLine2: '',
    pincode: '',
    city: '',
    stateCode: local.stateCode,
    stateName: local.stateName,
    pan: local.pan,
    status: 'Active',
    isLiveFetched: false,
    helperMessage: 'State auto-detected from GSTIN. Enter remaining address details manually or check network connection.'
  };
}
