import React, { useState } from 'react';
import { Utensils, Monitor, LayoutDashboard, ShoppingBag, Radio, QrCode, X, Copy, Check, Wallet } from 'lucide-react';
import CustomerCreditModal from './CustomerCreditModal';

export default function Navbar({ currentView, setView, cartCount, setIsCartOpen, isConnected, settings }) {
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditModalTab, setCreditModalTab] = useState('wallet');
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText('https://bmu-canteen.onrender.com');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm transition-all w-full">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-1.5 sm:gap-4">
            {/* Brand Logo & Name */}
            <div 
              className="flex items-center space-x-2 sm:space-x-3 cursor-pointer shrink-0 min-w-0" 
              onClick={() => setView('customer')}
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/20 text-white shrink-0 select-none">
                {(!settings?.canteen_logo || settings?.canteen_logo === 'utensils' || settings?.canteen_logo === 'classic' || settings?.canteen_logo === 'original') ? (
                  <Utensils className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (settings?.canteen_logo === 'BMU' || settings?.canteen_logo === 'bmu') ? (
                  <span className="font-black text-xs sm:text-sm tracking-wider">BMU</span>
                ) : (
                  <span className="text-base sm:text-xl leading-none">{settings.canteen_logo}</span>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-black text-sm sm:text-lg tracking-tight text-slate-900 leading-tight truncate">
                  {settings?.canteen_name || 'BMU Canteen'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium truncate hidden min-[360px]:inline">
                  {settings?.canteen_tagline || 'A Product of NULIFE'}
                </span>
              </div>
            </div>

            {/* View Switcher & Action Buttons */}
            <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
              <nav className="flex items-center space-x-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80">
                {/* Menu Tab */}
                <button
                  onClick={() => setView('customer')}
                  className={`flex items-center space-x-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    currentView === 'customer'
                      ? 'bg-white text-orange-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>Menu</span>
                </button>

                {/* Live TV Token Board */}
                <button
                  onClick={() => setView('display')}
                  className={`flex items-center space-x-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg font-bold transition-all ${
                    currentView === 'display'
                      ? 'bg-white text-orange-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                  <span className="hidden md:inline text-xs sm:text-sm">TV Board</span>
                </button>

                {/* QR Barcode Button (Hidden on Mobile) */}
                <button
                  onClick={() => setShowQrModal(true)}
                  className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-all"
                  title="Scan QR Code to open on phone"
                >
                  <QrCode className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="hidden md:inline">Scan QR</span>
                </button>

                {/* Prepaid Wallet Button */}
                <button
                  onClick={() => {
                    setCreditModalTab('wallet');
                    setShowCreditModal(true);
                  }}
                  className="flex items-center space-x-1 px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-emerald-800 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-900 border border-emerald-200/80 transition-all font-bold text-xs sm:text-sm shadow-xs"
                  title="BMU Canteen - Prepaid Wallet"
                >
                  <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="hidden sm:inline">Wallet</span>
                </button>

                {/* If currently in Operator mode, show active badge; otherwise show discreet staff lock */}
                {currentView === 'operator' ? (
                  <span className="flex items-center space-x-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-slate-900 text-white font-semibold shadow-sm">
                    <LayoutDashboard className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="hidden sm:inline">Operator POS</span>
                    <span className="sm:hidden text-[10px]">POS</span>
                  </span>
                ) : (
                  <button
                    onClick={() => setView('operator')}
                    className="p-1.5 sm:px-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
                    title="Staff Only Access"
                    aria-label="Staff Login"
                  >
                    <span className="text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-0.5">
                      🔒<span className="hidden sm:inline"> Staff</span>
                    </span>
                  </button>
                )}
              </nav>

              {/* Cart Trigger (visible in Customer view) - Pinned & always within range */}
              {currentView === 'customer' && (
                <button
                  onClick={() => setIsCartOpen(true)}
                  className="relative flex items-center justify-center p-2 sm:p-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white transition-all shadow-md shadow-orange-500/25 shrink-0 ml-0.5"
                  aria-label="View Cart"
                  title="View Cart"
                >
                  <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white text-[10px] sm:text-[11px] font-bold min-w-[1.125rem] h-4.5 sm:min-w-[1.25rem] sm:h-5 px-1 rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">
                      {cartCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Scan Site QR Barcode Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-slate-100 text-center p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <QrCode className="w-5 h-5 text-orange-500" />
                <h3 className="font-extrabold text-base text-slate-900">Scan Menu Barcode</h3>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Scan this QR code with any phone camera or Google Lens to view the menu and order.
            </p>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block shadow-inner">
              <img
                src="/canteen-qr.png"
                alt="BMU Canteen QR Code"
                className="w-52 h-52 mx-auto rounded-xl bg-white p-2 border border-slate-200 shadow-sm"
              />
            </div>

            <div className="bg-slate-100 p-2.5 rounded-xl flex items-center justify-between text-xs">
              <span className="font-mono text-slate-700 truncate mr-2">
                bmu-canteen.onrender.com
              </span>
              <button
                onClick={handleCopyLink}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 shadow-sm transition-all flex items-center gap-1 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <a
              href="/how-to-order.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline pt-1"
            >
              <span>📄 View Printable Customer Step-by-Step Guide</span>
            </a>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Customer Credit Dues & Statement Modal */}
      <CustomerCreditModal
        isOpen={showCreditModal}
        initialTab={creditModalTab}
        onClose={() => setShowCreditModal(false)}
        settings={settings}
      />
    </>
  );
}
