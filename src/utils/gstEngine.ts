import { DocumentItem, HsnSummaryItem } from '../types';

export const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (New)',
  '38': 'Ladakh',
  '97': 'Other Territory'
};

export const STATE_OPTIONS = Object.entries(INDIAN_STATES).map(([code, name]) => ({
  code,
  name,
  label: `${name} ( ${code} )`
}));

export function formatStateWithCode(stateCode: string): string {
  const name = INDIAN_STATES[stateCode] || 'Unknown State';
  return `${name} ( ${stateCode} )`;
}

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(gstin: string): boolean {
  if (!gstin) return false;
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

export function getStateCodeFromGstin(gstin: string): string | null {
  if (!gstin) return null;
  const clean = gstin.trim().toUpperCase();
  if (clean.length >= 2) {
    const code = clean.substring(0, 2);
    if (INDIAN_STATES[code]) {
      return code;
    }
  }
  return null;
}

export function getStateName(code: string): string {
  return INDIAN_STATES[code] || `State (${code})`;
}

export function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export interface CalculateItemInput {
  quantity: number;
  rate: number;
  discountPercent: number;
  gstRate: number;
  sellerStateCode: string;
  placeOfSupply: string;
  isComposition?: boolean;
}

export function calculateItemTaxes(input: CalculateItemInput) {
  const qty = Number(input.quantity) || 0;
  const rate = Number(input.rate) || 0;
  const discPercent = Math.max(0, Math.min(100, Number(input.discountPercent) || 0));
  const gstRate = Number(input.gstRate) || 0;

  const grossAmount = roundToTwo(qty * rate);
  const discountAmount = roundToTwo(grossAmount * (discPercent / 100));
  const taxableAmount = roundToTwo(Math.max(0, grossAmount - discountAmount));

  // Composition scheme dealers cannot collect GST on outward supplies (Section 10 of CGST Act)
  if (input.isComposition) {
    return {
      gstRate: 0,
      grossAmount,
      discountAmount,
      taxableAmount,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      totalTax: 0,
      totalAmount: taxableAmount
    };
  }

  const isIntraState = input.sellerStateCode && input.placeOfSupply
    ? input.sellerStateCode === input.placeOfSupply
    : true; // default to intra-state if not specified

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (gstRate > 0) {
    if (isIntraState) {
      cgstRate = gstRate / 2;
      sgstRate = gstRate / 2;
      // Calculate half tax on taxable amount, symmetric to avoid 1-paisa drift
      cgstAmount = roundToTwo(taxableAmount * (cgstRate / 100));
      sgstAmount = cgstAmount;
    } else {
      igstRate = gstRate;
      igstAmount = roundToTwo(taxableAmount * (igstRate / 100));
    }
  }

  const totalTax = roundToTwo(cgstAmount + sgstAmount + igstAmount);
  const totalAmount = roundToTwo(taxableAmount + totalTax);

  return {
    gstRate,
    grossAmount,
    discountAmount,
    taxableAmount,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalTax,
    totalAmount
  };
}

export function calculateDocumentTotals(items: DocumentItem[]) {
  let subTotal = 0;
  let totalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  for (const item of items) {
    subTotal += Number(item.taxableAmount) || 0;
    totalDiscount += Number(item.discountAmount) || 0;
    totalCgst += Number(item.cgstAmount) || 0;
    totalSgst += Number(item.sgstAmount) || 0;
    totalIgst += Number(item.igstAmount) || 0;
  }

  subTotal = roundToTwo(subTotal);
  totalDiscount = roundToTwo(totalDiscount);
  totalCgst = roundToTwo(totalCgst);
  totalSgst = roundToTwo(totalSgst);
  totalIgst = roundToTwo(totalIgst);

  const rawGrandTotal = roundToTwo(subTotal + totalCgst + totalSgst + totalIgst);
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = roundToTwo(grandTotal - rawGrandTotal);

  return {
    subTotal,
    totalDiscount,
    totalCgst,
    totalSgst,
    totalIgst,
    roundOff,
    grandTotal
  };
}

export function groupHsnSummary(items: DocumentItem[]): HsnSummaryItem[] {
  const map = new Map<string, HsnSummaryItem>();

  for (const item of items) {
    const key = `${item.hsn || 'N/A'}_${item.gstRate}`;
    const existing = map.get(key);

    const taxable = Number(item.taxableAmount) || 0;
    const cgst = Number(item.cgstAmount) || 0;
    const sgst = Number(item.sgstAmount) || 0;
    const igst = Number(item.igstAmount) || 0;
    const tax = roundToTwo(cgst + sgst + igst);
    const total = roundToTwo(taxable + tax);

    if (existing) {
      existing.taxableAmount = roundToTwo(existing.taxableAmount + taxable);
      existing.cgstAmount = roundToTwo(existing.cgstAmount + cgst);
      existing.sgstAmount = roundToTwo(existing.sgstAmount + sgst);
      existing.igstAmount = roundToTwo(existing.igstAmount + igst);
      existing.totalTax = roundToTwo(existing.totalTax + tax);
      existing.totalAmount = roundToTwo(existing.totalAmount + total);
    } else {
      map.set(key, {
        hsn: item.hsn || 'N/A',
        gstRate: item.gstRate,
        taxableAmount: taxable,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalTax: tax,
        totalAmount: total
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.hsn.localeCompare(b.hsn));
}

export function formatIndianCurrency(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  
  const formatted = absAmount.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
  
  return `${isNegative ? '-' : ''}₹${formatted}`;
}
