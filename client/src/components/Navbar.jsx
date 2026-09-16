import React from 'react';
import { Utensils, Monitor, LayoutDashboard, ShoppingBag, Radio } from 'lucide-react';

export default function Navbar({ currentView, setView, cartCount, setIsCartOpen, isConnected }) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('customer')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Utensils className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">BMU Canteen</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800">
                  Campus QuickBite
                </span>
              </div>
              <div className="flex items-center space-x-1.5 text-xs text-slate-500">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                <span>{isConnected ? 'Live Connected' : 'Offline'}</span>
              </div>
            </div>
          </div>

          {/* Navigation View Switcher */}
          <nav className="flex items-center space-x-1 sm:space-x-2 bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs sm:text-sm font-medium">
            <button
              onClick={() => setView('customer')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                currentView === 'customer'
                  ? 'bg-white text-orange-600 font-semibold shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Utensils className="w-4 h-4" />
              <span>Menu</span>
            </button>

            <button
              onClick={() => setView('display')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                currentView === 'display'
                  ? 'bg-emerald-700 text-white font-semibold shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Monitor className="w-4 h-4 text-emerald-400" />
              <span>TV Board</span>
            </button>

            {/* If currently in Operator mode, show active badge; otherwise show discreet staff lock */}
            {currentView === 'operator' ? (
              <span className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold shadow-sm">
                <LayoutDashboard className="w-4 h-4 text-orange-400" />
                <span>Operator POS</span>
              </span>
            ) : (
              <button
                onClick={() => setView('operator')}
                className="p-1.5 px-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
                title="Staff Only Access"
                aria-label="Staff Login"
              >
                <span className="text-[11px] font-medium text-slate-400 hover:text-slate-600">🔒 Staff</span>
              </button>
            )}
          </nav>

          {/* Cart Trigger (visible in Customer view) */}
          {currentView === 'customer' && (
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center justify-center p-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white transition-all shadow-md shadow-orange-500/25"
              aria-label="View Cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">
                  {cartCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
