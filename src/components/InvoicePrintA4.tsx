import React, { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Check, ArrowLeft, Share2, Receipt } from 'lucide-react';
import { Document, BusinessProfile } from '../types';
import { getStateName, groupHsnSummary, formatIndianCurrency } from '../utils/gstEngine';
import { numberToIndianWords } from '../utils/numberToWords';
import { InvoicePrint80mm } from './InvoicePrint80mm';

interface InvoicePrintA4Props {
  document: Document;
  businessProfile: BusinessProfile;
  onBack?: () => void;
}

export const InvoicePrintA4: React.FC<InvoicePrintA4Props> = ({
  document: doc,
  businessProfile: profile,
  onBack
}) => {
  const [printLayout, setPrintLayout] = useState<'A4' | '80mm'>('A4');
  const printRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${doc.docType}_${doc.docNumber}`
  });

  if (printLayout === '80mm') {
    return (
      <InvoicePrint80mm
        document={doc}
        businessProfile={profile}
        onBack={onBack}
        onSwitchToA4={() => setPrintLayout('A4')}
      />
    );
  }

  const hsnSummary = groupHsnSummary(doc.items);
  const isIntraState = doc.placeOfSupply === profile.stateCode;
  const isComposition = profile.taxScheme === 'COMPOSITION';

  // Dynamic UPI payment URL for QR Code
  const balanceDue = Math.max(0, doc.grandTotal - doc.amountPaid);
  const upiAmount = balanceDue > 0 ? balanceDue : doc.grandTotal;
  const upiUrl = profile.upiId
    ? `upi://pay?pa=${encodeURIComponent(profile.upiId)}&pn=${encodeURIComponent(profile.companyName || profile.name)}&am=${upiAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(doc.docNumber)}`
    : '';

  const getDocTitle = () => {
    if (isComposition && doc.docType === 'INVOICE') {
      return 'BILL OF SUPPLY';
    }
    switch (doc.docType) {
      case 'INVOICE':
        return 'TAX INVOICE';
      case 'QUOTATION':
        return 'QUOTATION / ESTIMATE';
      case 'PROFORMA':
        return 'PROFORMA INVOICE';
      case 'CHALLAN':
        return 'DELIVERY CHALLAN';
      case 'CREDIT_NOTE':
        return 'CREDIT NOTE';
      case 'DEBIT_NOTE':
        return 'DEBIT NOTE';
      case 'PURCHASE_ORDER':
        return 'PURCHASE ORDER';
      default:
        return 'INVOICE';
    }
  };

  const copyWhatsAppSummary = () => {
    const summaryText = `*${getDocTitle()}: ${doc.docNumber}*
📅 Date: ${doc.date}
🏢 From: ${profile.companyName || profile.name}
👤 To: ${doc.partyName}
💵 *Amount Due: ${formatIndianCurrency(balanceDue > 0 ? balanceDue : doc.grandTotal)}*
${profile.upiId ? `📲 Pay via UPI: ${profile.upiId}\n🔗 UPI Link: ${upiUrl}` : ''}
Thank you for your business!`;

    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar (hidden when printing) */}
      <div className="no-print bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {getDocTitle()} - {doc.docNumber}
            </h2>
            <p className="text-xs text-slate-500">
              Party: {doc.partyName} • Grand Total: {formatIndianCurrency(doc.grandTotal)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch to 80mm POS Thermal Receipt view */}
          <button
            type="button"
            onClick={() => setPrintLayout('80mm')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-semibold transition-colors"
          >
            <Receipt className="w-3.5 h-3.5 text-purple-600" />
            <span>80mm Thermal Receipt</span>
          </button>

          <button
            onClick={copyWhatsAppSummary}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-medium transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4 text-emerald-600" />}
            {copied ? 'Copied WhatsApp Text!' : 'Copy WhatsApp Summary'}
          </button>

          <button
            onClick={() => handlePrint()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print / Save A4 PDF
          </button>
        </div>
      </div>

      {/* A4 Printable Sheet Container */}
      <div className="overflow-x-auto pb-8 flex justify-center">
        <div
          ref={printRef}
          className="w-[210mm] min-h-[297mm] bg-white text-slate-900 p-8 border border-slate-200 shadow-md text-xs print:border-none print:shadow-none print:p-0 print:w-full"
          style={{ boxSizing: 'border-box' }}
        >
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-3 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {profile.companyName || profile.name}
                </h1>
                {(profile.fullName || profile.legalName) && (profile.fullName || profile.legalName) !== (profile.companyName || profile.name) && (
                  <p className="text-xs text-slate-600 font-medium">{profile.fullName || profile.legalName}</p>
                )}
                
                <div className="text-xs text-slate-600 max-w-md mt-1 leading-relaxed">
                  {profile.addressLine1 && <p>{profile.addressLine1}</p>}
                  {profile.addressLine2 && <p>{profile.addressLine2}</p>}
                  {(profile.city || profile.pincode) ? (
                    <p>{[profile.city, profile.pincode].filter(Boolean).join(' - ')}</p>
                  ) : null}
                  {!profile.addressLine1 && profile.address && <p>{profile.address}</p>}
                </div>

                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-700 font-medium">
                  {profile.isGstRegistered && profile.gstin ? (
                    <span><strong>GSTIN:</strong> {profile.gstin}</span>
                  ) : (
                    <span className="text-slate-500"><strong>GST:</strong> Unregistered</span>
                  )}
                  <span><strong>State:</strong> {getStateName(profile.stateCode)} ( {profile.stateCode} )</span>
                  {profile.phone && <span><strong>Phone:</strong> {profile.phone}</span>}
                  {profile.email && <span><strong>Email:</strong> {profile.email}</span>}
                </div>

                {isComposition && (
                  <div className="mt-2 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded inline-block uppercase">
                    Composition taxable person, not eligible to collect tax on supplies
                  </div>
                )}
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 text-slate-900 font-bold text-sm tracking-wider uppercase rounded">
                  {getDocTitle()}
                </span>
                <div className="mt-2 text-xs space-y-0.5">
                  <p><span className="text-slate-500">Doc No:</span> <strong>{doc.docNumber}</strong></p>
                  <p><span className="text-slate-500">Date:</span> <strong>{doc.date}</strong></p>
                  {doc.dueDate && (
                    <p><span className="text-slate-500">Due Date:</span> <strong>{doc.dueDate}</strong></p>
                  )}
                  <p><span className="text-slate-500">Place of Supply:</span> <strong>{doc.placeOfSupply} - {getStateName(doc.placeOfSupply)}</strong></p>
                  <p><span className="text-slate-500">Reverse Charge:</span> <strong>No</strong></p>
                </div>
              </div>
            </div>
          </div>

          {/* Bill To & Ship To Sections */}
          <div className="grid grid-cols-2 gap-4 border border-slate-200 rounded p-3 mb-4 bg-slate-50/50">
            <div>
              <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-1">
                Billed To (Customer):
              </p>
              <p className="font-semibold text-sm text-slate-900">{doc.partyName}</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{doc.partyAddress}</p>
              <div className="mt-1 space-y-0.5 text-xs text-slate-700">
                {doc.partyGstin ? (
                  <p><strong>GSTIN:</strong> {doc.partyGstin}</p>
                ) : (
                  <p className="text-slate-500">GSTIN: Unregistered Consumer</p>
                )}
                {doc.partyPhone && <p><strong>Phone:</strong> {doc.partyPhone}</p>}
                {doc.partyEmail && <p><strong>Email:</strong> {doc.partyEmail}</p>}
              </div>
            </div>

            <div>
              <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-1">
                Shipped To (Delivery Address):
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                {doc.shippingAddress || doc.partyAddress || 'Same as billing address'}
              </p>

              {doc.transportDetails?.ewayBillNo && (
                <div className="mt-2 pt-2 border-t border-slate-200 text-xs space-y-0.5">
                  <p className="font-bold text-slate-800 text-[10px] uppercase">Transport Details:</p>
                  <p><strong>E-Way Bill:</strong> {doc.transportDetails.ewayBillNo}</p>
                  {doc.transportDetails.vehicleNo && (
                    <p><strong>Vehicle No:</strong> {doc.transportDetails.vehicleNo}</p>
                  )}
                  {doc.transportDetails.transporterName && (
                    <p><strong>Transporter:</strong> {doc.transportDetails.transporterName}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded overflow-hidden mb-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-200 font-bold text-[11px]">
                  <th className="p-2 w-8 text-center">#</th>
                  <th className="p-2">Item Description</th>
                  <th className="p-2 w-20 text-center">HSN/SAC</th>
                  <th className="p-2 w-14 text-center">Qty</th>
                  <th className="p-2 w-16 text-right">Rate</th>
                  <th className="p-2 w-16 text-right">Taxable</th>
                  {isIntraState ? (
                    <>
                      <th className="p-2 w-16 text-right">CGST</th>
                      <th className="p-2 w-16 text-right">SGST</th>
                    </>
                  ) : (
                    <th className="p-2 w-20 text-right">IGST</th>
                  )}
                  <th className="p-2 w-20 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doc.items.map((item, idx) => (
                  <tr key={item.id} className="text-slate-800">
                    <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                    <td className="p-2 font-medium">
                      {item.name}
                      {item.sku && <span className="text-[10px] text-slate-500 font-mono ml-1">({item.sku})</span>}
                    </td>
                    <td className="p-2 text-center font-mono text-slate-600">{item.hsn || '-'}</td>
                    <td className="p-2 text-center">{item.quantity} {item.unit}</td>
                    <td className="p-2 text-right">{formatIndianCurrency(item.rate)}</td>
                    <td className="p-2 text-right">{formatIndianCurrency(item.taxableAmount)}</td>
                    {isIntraState ? (
                      <>
                        <td className="p-2 text-right">
                          {item.cgstAmount > 0 ? (
                            <div>
                              <div>{formatIndianCurrency(item.cgstAmount)}</div>
                              <div className="text-[9px] text-slate-500">@{item.cgstRate}%</div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="p-2 text-right">
                          {item.sgstAmount > 0 ? (
                            <div>
                              <div>{formatIndianCurrency(item.sgstAmount)}</div>
                              <div className="text-[9px] text-slate-500">@{item.sgstRate}%</div>
                            </div>
                          ) : '-'}
                        </td>
                      </>
                    ) : (
                      <td className="p-2 text-right">
                        {item.igstAmount > 0 ? (
                          <div>
                            <div>{formatIndianCurrency(item.igstAmount)}</div>
                            <div className="text-[9px] text-slate-500">@{item.igstRate}%</div>
                          </div>
                        ) : '-'}
                      </td>
                    )}
                    <td className="p-2 text-right font-bold">{formatIndianCurrency(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Calculation Summary & HSN Summary */}
          <div className="grid grid-cols-12 gap-4 mb-4">
            {/* HSN Summary (CBIC Compliant) */}
            <div className="col-span-7 border border-slate-200 rounded p-2.5 bg-slate-50/50">
              <p className="font-bold text-[10px] text-slate-700 uppercase tracking-wider mb-1.5">
                HSN / SAC Tax Summary:
              </p>
              <table className="w-full text-[10px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="pb-1">HSN/SAC</th>
                    <th className="pb-1 text-center">Tax Rate</th>
                    <th className="pb-1 text-right">Taxable Value</th>
                    <th className="pb-1 text-right">Tax Amount</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {hsnSummary.map(s => (
                    <tr key={`${s.hsn}_${s.gstRate}`}>
                      <td className="py-1 font-mono">{s.hsn}</td>
                      <td className="py-1 text-center">{s.gstRate}%</td>
                      <td className="py-1 text-right">{formatIndianCurrency(s.taxableAmount)}</td>
                      <td className="py-1 text-right">{formatIndianCurrency(s.totalTax)}</td>
                      <td className="py-1 text-right font-medium">{formatIndianCurrency(s.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Amount in words */}
              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px]">
                <span className="text-slate-500">Total in Words:</span>
                <p className="font-bold text-slate-900 capitalize">
                  {numberToIndianWords(doc.grandTotal)}
                </p>
              </div>
            </div>

            {/* Totals Table */}
            <div className="col-span-5 border border-slate-200 rounded p-3 bg-slate-50 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Taxable Amount (Subtotal):</span>
                <span className="font-semibold text-slate-900">{formatIndianCurrency(doc.subTotal)}</span>
              </div>
              {doc.totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Total Discount:</span>
                  <span>-{formatIndianCurrency(doc.totalDiscount)}</span>
                </div>
              )}
              {doc.totalCgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Central Tax (CGST):</span>
                  <span>{formatIndianCurrency(doc.totalCgst)}</span>
                </div>
              )}
              {doc.totalSgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>State Tax (SGST):</span>
                  <span>{formatIndianCurrency(doc.totalSgst)}</span>
                </div>
              )}
              {doc.totalIgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Integrated Tax (IGST):</span>
                  <span>{formatIndianCurrency(doc.totalIgst)}</span>
                </div>
              )}
              {doc.roundOff !== 0 && (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Round Off:</span>
                  <span>{doc.roundOff > 0 ? `+${doc.roundOff.toFixed(2)}` : doc.roundOff.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-300 flex justify-between font-bold text-sm text-slate-900">
                <span>Grand Total:</span>
                <span className="text-blue-700">{formatIndianCurrency(doc.grandTotal)}</span>
              </div>
              {doc.amountPaid > 0 && (
                <div className="flex justify-between text-slate-600 font-semibold">
                  <span>Amount Paid:</span>
                  <span>{formatIndianCurrency(doc.amountPaid)}</span>
                </div>
              )}
              {balanceDue > 0 && (
                <div className="flex justify-between text-rose-700 font-bold">
                  <span>Balance Due:</span>
                  <span>{formatIndianCurrency(balanceDue)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bank Details & QR Code & Authorized Signatory */}
          <div className="grid grid-cols-12 gap-4 border border-slate-200 rounded p-3 mb-4 bg-slate-50/50">
            {/* Bank Details */}
            <div className="col-span-5 text-xs space-y-1">
              <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                Bank &amp; Payment Details:
              </p>
              {profile.bankName && <p><strong>Bank:</strong> {profile.bankName}</p>}
              {profile.accountNumber && <p><strong>A/C No:</strong> <span className="font-mono">{profile.accountNumber}</span></p>}
              {profile.ifscCode && <p><strong>IFSC:</strong> <span className="font-mono">{profile.ifscCode}</span></p>}
              {profile.branchName && <p><strong>Branch:</strong> {profile.branchName}</p>}
              {profile.upiId && <p><strong>UPI ID:</strong> <span className="font-mono">{profile.upiId}</span></p>}
            </div>

            {/* UPI QR Code */}
            <div className="col-span-4 flex flex-col items-center justify-center border-l border-r border-slate-200 px-2 text-center">
              {upiUrl ? (
                <>
                  <QRCodeSVG
                    value={upiUrl}
                    size={80}
                    level="M"
                    includeMargin={false}
                  />
                  <p className="text-[10px] font-bold text-slate-800 mt-1">Scan to Pay via UPI</p>
                  <p className="text-[9px] text-slate-500 font-mono truncate max-w-[150px]">{profile.upiId}</p>
                </>
              ) : (
                <div className="text-[10px] text-slate-400 italic">
                  Add UPI ID in Settings to enable dynamic payment QR Code
                </div>
              )}
            </div>

            {/* Authorized Signatory */}
            <div className="col-span-3 flex flex-col justify-between h-24 text-right">
              <p className="text-[11px] font-semibold text-slate-800">
                For {profile.companyName || profile.name}
              </p>
              <div className="border-t border-slate-300 pt-1 text-[10px] text-slate-600">
                Authorized Signatory
              </div>
            </div>
          </div>

          {/* Terms & Conditions & Footer Note */}
          <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-2 space-y-1">
            {doc.terms && (
              <div>
                <strong>Terms &amp; Conditions:</strong>
                <pre className="font-sans text-[10px] text-slate-600 whitespace-pre-wrap mt-0.5">
                  {doc.terms}
                </pre>
              </div>
            )}
            {doc.notes && (
              <p><strong>Notes:</strong> {doc.notes}</p>
            )}
            <p className="text-center text-[9px] text-slate-400 pt-1">
              This is a computer-generated invoice and requires no physical signature. Generated with GoGST Bill.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
