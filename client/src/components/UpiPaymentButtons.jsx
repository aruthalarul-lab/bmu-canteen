import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Monitor, Copy, Check, ExternalLink, Zap, 
  CreditCard, ChevronDown, Sparkles, AlertCircle 
} from 'lucide-react';

export default function UpiPaymentButtons({ upiUri, upiId, amount }) {
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDesktopForce, setShowDesktopForce] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const ua = navigator.userAgent || '';
      const mobileKeywords = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(mobileKeywords.test(ua) || (isTouch && window.innerWidth <= 820));
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  if (!upiUri) return null;

  // Clean and construct direct app links
  // NPCI base URI: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
  const genericUri = upiUri;
  const gpayUri = upiUri.replace(/^upi:\/\/pay/, 'tez://upi/pay');
  const phonepeUri = upiUri.replace(/^upi:\/\/pay/, 'phonepe://pay');
  const paytmUri = upiUri.replace(/^upi:\/\/pay/, 'paytmmp://pay');

  const handleCopyUpiId = () => {
    if (upiId && navigator.clipboard) {
      navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleOpenApp = (e, targetUri) => {
    try {
      window.location.href = targetUri;
    } catch (err) {
      console.warn('Direct launch failed, relying on href link', err);
    }
  };

  return (
    <div className="w-full space-y-2.5 pt-1">
      {/* MOBILE EXPERIENCE: Direct UPI App Launchers */}
      {isMobile ? (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 px-0.5">
            <span className="flex items-center gap-1 text-orange-800">
              <Smartphone className="w-3.5 h-3.5 text-orange-600" />
              <span>Mobile Tap & Pay</span>
            </span>
            <button
              type="button"
              onClick={handleCopyUpiId}
              className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-mono font-medium transition-colors bg-white px-2 py-0.5 rounded-lg border border-slate-200"
              title="Copy UPI ID"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy ID</span>
                </>
              )}
            </button>
          </div>

          {/* Primary Default Chooser Button */}
          <a
            href={genericUri}
            onClick={(e) => handleOpenApp(e, genericUri)}
            className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-xs shadow-md shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4 fill-white" />
            <span>⚡ Open in Any UPI App</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>

          {/* Direct 1-Tap App Pills for GPay, PhonePe, Paytm */}
          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
            {/* Google Pay */}
            <a
              href={gpayUri}
              onClick={(e) => handleOpenApp(e, gpayUri)}
              className="py-2 px-1 rounded-xl bg-white hover:bg-slate-50 active:scale-95 text-slate-800 text-[11px] font-bold border border-slate-200 shadow-xs transition-all flex items-center justify-center gap-1 text-center"
            >
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
              <span>GPay</span>
            </a>

            {/* PhonePe */}
            <a
              href={phonepeUri}
              onClick={(e) => handleOpenApp(e, phonepeUri)}
              className="py-2 px-1 rounded-xl bg-[#5f259f]/10 hover:bg-[#5f259f]/20 active:scale-95 text-[#5f259f] text-[11px] font-bold border border-[#5f259f]/30 shadow-xs transition-all flex items-center justify-center gap-1 text-center"
            >
              <span className="w-2 h-2 rounded-full bg-[#5f259f] inline-block"></span>
              <span>PhonePe</span>
            </a>

            {/* Paytm */}
            <a
              href={paytmUri}
              onClick={(e) => handleOpenApp(e, paytmUri)}
              className="py-2 px-1 rounded-xl bg-[#002970]/10 hover:bg-[#002970]/20 active:scale-95 text-[#002970] text-[11px] font-bold border border-[#002970]/30 shadow-xs transition-all flex items-center justify-center gap-1 text-center"
            >
              <span className="w-2 h-2 rounded-full bg-[#00b9f5] inline-block"></span>
              <span>Paytm</span>
            </a>
          </div>
        </div>
      ) : (
        /* DESKTOP / LAPTOP EXPERIENCE: Scan QR Guidance + Copy Button */
        <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-left space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Monitor className="w-4 h-4 text-amber-600" />
              <span>Computer / Laptop Detected</span>
            </div>
            <span className="text-[10px] font-semibold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
              Scan with Phone
            </span>
          </div>

          <p className="text-[11px] text-slate-600 leading-snug">
            UPI apps (GPay, PhonePe, Paytm) only run on smartphones. Point your phone's camera at the <strong>QR code above</strong> to complete payment.
          </p>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyUpiId}
              className="flex-1 py-1.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">UPI ID Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy UPI ID</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowDesktopForce(!showDesktopForce)}
              className="text-[10px] text-slate-400 hover:text-slate-600 underline px-1 py-1"
              title="Force open UPI protocol"
            >
              Using emulator?
            </button>
          </div>

          {showDesktopForce && (
            <div className="pt-2 border-t border-amber-200/60 animate-fade-in">
              <a
                href={genericUri}
                onClick={(e) => handleOpenApp(e, genericUri)}
                className="w-full py-2 px-3 rounded-xl bg-orange-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow"
              >
                <span>⚡ Force Open UPI Protocol</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
