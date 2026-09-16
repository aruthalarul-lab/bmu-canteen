import React from 'react';
import { X, CheckCircle, ExternalLink, QrCode, ShieldCheck } from 'lucide-react';

export default function UpiModal({ upiData, order, onClose, onConfirmPaid }) {
  if (!upiData || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-scale-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <QrCode className="w-5 h-5" />
            <h3 className="font-bold text-base">Scan to Pay via UPI</h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center space-y-4">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Token Number</p>
            <p className="text-3xl font-extrabold text-orange-600 font-mono-code">#{order.token_no}</p>
            <p className="text-sm font-medium text-slate-700 mt-1">Total Amount: <span className="font-bold text-lg text-slate-900">₹{order.total_amount}</span></p>
          </div>

          {/* QR Code Container */}
          <div className="inline-block p-3 bg-white rounded-2xl shadow-inner border-2 border-dashed border-orange-200">
            {upiData.qrDataUrl ? (
              <img 
                src={upiData.qrDataUrl} 
                alt="UPI Payment QR Code" 
                className="w-56 h-56 mx-auto rounded-xl object-contain"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-sm">
                Generating QR...
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 inline" />
            Accepts GPay, PhonePe, Paytm, BHIM & any UPI App
          </p>

          {/* Mobile Direct Intent Button (If on mobile phone) */}
          {upiData.upiUri && (
            <a
              href={upiData.upiUri}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold text-xs transition-colors border border-orange-200/80"
            >
              <span>Open in UPI App on this phone</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {/* Confirm Button */}
          <button
            onClick={onConfirmPaid}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-700 hover:to-green-600 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            <span>I have completed payment</span>
          </button>
        </div>
      </div>
    </div>
  );
}
