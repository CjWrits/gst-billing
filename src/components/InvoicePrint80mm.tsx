import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, ArrowLeft, Share2, Check } from 'lucide-react';
import { Document, BusinessProfile } from '../types';
import { getStateName, formatIndianCurrency } from '../utils/gstEngine';

interface InvoicePrint80mmProps {
  document: Document;
  businessProfile: BusinessProfile;
  onBack?: () => void;
  onSwitchToA4?: () => void;
}

export const InvoicePrint80mm: React.FC<InvoicePrint80mmProps> = ({
  document: doc,
  businessProfile: profile,
  onBack,
  onSwitchToA4
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Thermal_${doc.docType}_${doc.docNumber}`,
    pageStyle: `
      @page {
        size: 80mm auto;
        margin: 2mm;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          font-family: monospace, sans-serif;
        }
      }
    `
  });

  const isComposition = profile.taxScheme === 'COMPOSITION';
  const getDocTitle = () => {
    if (isComposition && doc.docType === 'INVOICE') return 'BILL OF SUPPLY';
    switch (doc.docType) {
      case 'INVOICE': return 'TAX INVOICE';
      case 'QUOTATION': return 'ESTIMATE / QUOTATION';
      case 'PROFORMA': return 'PROFORMA INVOICE';
      case 'CHALLAN': return 'DELIVERY CHALLAN';
      case 'CREDIT_NOTE': return 'CREDIT NOTE';
      case 'DEBIT_NOTE': return 'DEBIT NOTE';
      case 'PURCHASE_ORDER': return 'PURCHASE ORDER';
      default: return 'INVOICE';
    }
  };

  const balanceDue = Math.max(0, doc.grandTotal - doc.amountPaid);
  const upiAmount = balanceDue > 0 ? balanceDue : doc.grandTotal;
  const upiUrl = profile.upiId
    ? `upi://pay?pa=${encodeURIComponent(profile.upiId)}&pn=${encodeURIComponent(profile.companyName || profile.name)}&am=${upiAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(doc.docNumber)}`
    : '';

  const copySummary = () => {
    const summaryText = `*${getDocTitle()}: ${doc.docNumber}*
📅 Date: ${doc.date}
🏢 From: ${profile.companyName || profile.name}
👤 To: ${doc.partyName}
💵 *Amount: ${formatIndianCurrency(doc.grandTotal)}*
${profile.upiId ? `📲 UPI: ${profile.upiId}` : ''}`;
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="no-print bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          )}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
              80mm Thermal POS Receipt Mode
            </span>
            <h2 className="text-sm font-bold text-slate-900 mt-0.5">
              {getDocTitle()} - {doc.docNumber}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSwitchToA4 && (
            <button
              type="button"
              onClick={onSwitchToA4}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
            >
              Switch to Standard A4 View
            </button>
          )}

          <button
            onClick={copySummary}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'WhatsApp'}
          </button>

          <button
            onClick={() => handlePrint()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            Print 80mm Receipt
          </button>
        </div>
      </div>

      {/* 80mm Receipt Preview Container */}
      <div className="flex justify-center pb-12 overflow-x-auto">
        <div
          ref={printRef}
          className="w-[80mm] min-h-[140mm] bg-white text-black p-4 border border-dashed border-slate-300 shadow-md text-[11px] font-mono leading-tight print:border-none print:shadow-none print:p-1 print:w-[76mm]"
          style={{ boxSizing: 'border-box' }}
        >
          {/* Header */}
          <div className="text-center pb-2 border-b border-black">
            <h1 className="text-sm font-bold uppercase tracking-wide">
              {profile.companyName || profile.name}
            </h1>
            {(profile.legalName || profile.fullName) && (profile.legalName || profile.fullName) !== (profile.companyName || profile.name) && (
              <p className="text-[10px]">{profile.legalName || profile.fullName}</p>
            )}
            <p className="text-[10px] mt-0.5">
              {[profile.addressLine1, profile.city, profile.pincode].filter(Boolean).join(', ')}
            </p>
            {profile.phone && <p className="text-[10px]">Ph: {profile.phone}</p>}
            {profile.isGstRegistered && profile.gstin ? (
              <p className="text-[10px] font-bold">GSTIN: {profile.gstin}</p>
            ) : (
              <p className="text-[10px]">GST: Unregistered</p>
            )}
            <p className="text-[10px]">State: {profile.stateCode} ({getStateName(profile.stateCode)})</p>
            
            <div className="mt-1 pt-1 border-t border-dashed border-black">
              <span className="font-bold text-xs uppercase">{getDocTitle()}</span>
              {isComposition && (
                <p className="text-[9px] uppercase font-bold mt-0.5">
                  Composition taxable person, not eligible to collect tax on supplies
                </p>
              )}
            </div>
          </div>

          {/* Doc Metadata */}
          <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span>Doc No: <strong>{doc.docNumber}</strong></span>
              <span>Date: {doc.date}</span>
            </div>
            <div className="flex justify-between">
              <span>POS: {doc.placeOfSupply}</span>
              <span>Due: {doc.dueDate || doc.date}</span>
            </div>
            <div className="pt-1">
              <span>Customer: <strong>{doc.partyName}</strong></span>
              {doc.partyGstin && <p>GSTIN: {doc.partyGstin}</p>}
              {doc.partyPhone && <p>Ph: {doc.partyPhone}</p>}
            </div>
          </div>

          {/* Items Table */}
          <div className="py-2 border-b border-black">
            <div className="flex justify-between font-bold border-b border-dashed border-black pb-1 mb-1 text-[10px]">
              <span className="w-1/2">Item</span>
              <span className="w-1/6 text-center">Qty</span>
              <span className="w-1/6 text-right">Rate</span>
              <span className="w-1/6 text-right">Amt</span>
            </div>

            <div className="space-y-1.5 text-[10px]">
              {doc.items.map((item, i) => (
                <div key={item.id || i}>
                  <div className="font-bold truncate">{item.name}</div>
                  <div className="flex justify-between text-[9px] text-gray-700">
                    <span className="w-1/2">HSN: {item.hsn || '-'} {item.gstRate > 0 ? `(${item.gstRate}%)` : ''}</span>
                    <span className="w-1/6 text-center">{item.quantity} {item.unit}</span>
                    <span className="w-1/6 text-right">₹{item.rate.toFixed(0)}</span>
                    <span className="w-1/6 text-right font-bold">₹{item.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tax Breakdown & Totals */}
          <div className="py-2 border-b border-dashed border-black space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span>Taxable Value:</span>
              <span>{formatIndianCurrency(doc.subTotal)}</span>
            </div>
            {doc.totalDiscount > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{formatIndianCurrency(doc.totalDiscount)}</span>
              </div>
            )}
            {doc.totalCgst > 0 && (
              <div className="flex justify-between">
                <span>CGST:</span>
                <span>{formatIndianCurrency(doc.totalCgst)}</span>
              </div>
            )}
            {doc.totalSgst > 0 && (
              <div className="flex justify-between">
                <span>SGST:</span>
                <span>{formatIndianCurrency(doc.totalSgst)}</span>
              </div>
            )}
            {doc.totalIgst > 0 && (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span>{formatIndianCurrency(doc.totalIgst)}</span>
              </div>
            )}
            {doc.roundOff !== 0 && (
              <div className="flex justify-between text-[9px]">
                <span>Round Off:</span>
                <span>{doc.roundOff > 0 ? `+${doc.roundOff.toFixed(2)}` : doc.roundOff.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between font-bold text-xs pt-1 border-t border-black">
              <span>NET TOTAL:</span>
              <span>{formatIndianCurrency(doc.grandTotal)}</span>
            </div>
            {doc.amountPaid > 0 && (
              <div className="flex justify-between text-[10px]">
                <span>Paid:</span>
                <span>{formatIndianCurrency(doc.amountPaid)}</span>
              </div>
            )}
            {balanceDue > 0 && (
              <div className="flex justify-between font-bold text-[10px]">
                <span>BALANCE DUE:</span>
                <span>{formatIndianCurrency(balanceDue)}</span>
              </div>
            )}
          </div>

          {/* UPI QR Code */}
          {upiUrl && (
            <div className="py-2.5 text-center border-b border-dashed border-black flex flex-col items-center">
              <p className="text-[9px] font-bold mb-1">SCAN TO PAY VIA UPI</p>
              <QRCodeSVG
                value={upiUrl}
                size={84}
                level="M"
                includeMargin={false}
              />
              <p className="text-[8px] mt-1 font-mono">{profile.upiId}</p>
            </div>
          )}

          {/* Footer Terms */}
          <div className="pt-2 text-center text-[9px] space-y-1">
            <p>Thank you for your business!</p>
            {profile.termsAndConditions && (
              <p className="text-[8px] leading-tight text-gray-700 max-w-[70mm] mx-auto">
                {profile.termsAndConditions.slice(0, 100)}...
              </p>
            )}
            <p className="text-[8px] text-gray-500 pt-1">GoGST Bill Powered</p>
          </div>
        </div>
      </div>
    </div>
  );
};
