import React, { useState, useEffect } from 'react';
import { ChefHat, Bell, BellOff, CheckCircle2, Clock, X, Sparkles, Utensils } from 'lucide-react';
import socket from '../services/socket';
import { playOrderReadySound } from '../utils/audio';

export default function PublicDisplay({ onExit, settings: propSettings }) {
  const [orders, setOrders] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Canteen Branding Settings
  const [settings, setSettings] = useState(() => propSettings || {
    canteen_name: 'BMU Canteen',
    canteen_tagline: 'Smart Food Court-Chat and eat',
    canteen_logo: 'utensils',
  });

  useEffect(() => {
    if (propSettings) {
      setSettings(propSettings);
    }
  }, [propSettings]);

  useEffect(() => {
    if (!propSettings) {
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          if (data && typeof data === 'object') {
            setSettings(prev => ({ ...prev, ...data }));
          }
        })
        .catch(err => console.warn('Could not load settings in PublicDisplay:', err));
    }

    const handleSettingsUpdated = (updated) => {
      if (updated && typeof updated === 'object') {
        setSettings(prev => ({ ...prev, ...updated }));
      }
    };

    socket.on('settings-updated', handleSettingsUpdated);
    return () => {
      socket.off('settings-updated', handleSettingsUpdated);
    };
  }, [propSettings]);

  // Fallback exit handler if onExit is not supplied
  const handleExit = () => {
    if (onExit) {
      onExit();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      window.location.href = url.pathname || '/';
    }
  };

  // Fetch initial active orders
  const fetchActive = async () => {
    try {
      const res = await fetch('/api/orders/active');
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchActive();

    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 10000);

    const handleNew = (order) => {
      if (order.status === 'CANCELLED') return;
      if (order.payment_status !== 'PAID' && order.payment_method !== 'CREDIT' && order.order_type !== 'COUNTER') return;
      setOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
    };

    const handleStatus = (updated) => {
      if (updated.status === 'READY' && soundEnabled) {
        playOrderReadySound();
      }

      setOrders(prev => {
        if (updated.status === 'COMPLETED' || updated.status === 'CANCELLED') {
          return prev.filter(o => o.id !== updated.id);
        }
        const exists = prev.find(o => o.id === updated.id);
        if (exists) {
          return prev.map(o => o.id === updated.id ? updated : o);
        }
        if (updated.payment_status === 'PAID' || updated.payment_method === 'CREDIT' || updated.order_type === 'COUNTER') {
          return [updated, ...prev];
        }
        return prev;
      });
    };

    socket.on('new-order', handleNew);
    socket.on('order-status-changed', handleStatus);

    return () => {
      clearInterval(timer);
      socket.off('new-order', handleNew);
      socket.off('order-status-changed', handleStatus);
    };
  }, [soundEnabled]);

  const preparing = orders.filter(o => (o.status === 'PREPARING' || o.status === 'PENDING') && o.status !== 'CANCELLED' && (o.payment_status === 'PAID' || o.payment_method === 'CREDIT' || o.order_type === 'COUNTER'));
  const ready = orders.filter(o => o.status === 'READY' && o.status !== 'CANCELLED');

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col p-3.5 sm:p-6 md:p-8 select-none font-sans">
      {/* Top Banner / Header - Responsive for Mobile & TV */}
      <header className="pb-3.5 sm:pb-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        {/* Brand & Status Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center font-black text-white shadow-lg shadow-orange-500/25 shrink-0 tracking-wider select-none">
              {(!settings?.canteen_logo || settings?.canteen_logo === 'utensils' || settings?.canteen_logo === 'classic' || settings?.canteen_logo === 'original') ? (
                <Utensils className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              ) : (settings?.canteen_logo === 'BMU' || settings?.canteen_logo === 'bmu') ? (
                <span className="text-sm sm:text-base font-black tracking-wider">BMU</span>
              ) : (
                <span className="text-xl sm:text-2xl leading-none">{settings.canteen_logo}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-2xl md:text-3xl font-black tracking-tight text-white leading-tight">
                  {settings?.canteen_name || 'BMU Canteen'}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] sm:text-xs font-bold text-emerald-400 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  LIVE
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 hidden xs:block">
                Pick up your order when your Token appears in green • {settings?.canteen_tagline || 'Smart Food Court-Chat and eat'}
              </p>
            </div>
          </div>

          {/* Mobile Top-Right Exit Display Button */}
          <div className="sm:hidden">
            <button
              onClick={handleExit}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-700 text-slate-200 hover:text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md transition-all shrink-0"
              title="Exit TV Display"
            >
              <span className="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px] font-black">✕</span>
              <span>Exit Display</span>
            </button>
          </div>
        </div>

        {/* Action Controls & Clock Row */}
        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 pt-1 sm:pt-0">
          <p className="text-[11px] text-slate-400 xs:hidden">
            Collect food when token is green
          </p>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
            {/* TV Chime Toggle */}
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playOrderReadySound();
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shrink-0 ${
                soundEnabled
                  ? 'bg-emerald-950/90 border-emerald-500/80 text-emerald-300 shadow-sm'
                  : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={soundEnabled ? 'TV Chime Active' : 'Enable TV Chime Sounds'}
            >
              {soundEnabled ? (
                <Bell className="w-3.5 h-3.5 text-emerald-400 animate-bounce shrink-0" />
              ) : (
                <BellOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
              <span className="text-[11px] sm:text-xs font-semibold">{soundEnabled ? 'Chime ON' : 'Chime OFF'}</span>
            </button>

            {/* Digital Clock */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2.5 sm:px-3 py-1.5 rounded-xl shrink-0">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs sm:text-base md:text-xl font-black font-mono text-amber-400 tracking-wider">
                {currentTime}
              </span>
            </div>

            {/* Desktop / Tablet Exit Display Button */}
            <div className="hidden sm:block">
              <button
                onClick={handleExit}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-700 text-slate-200 hover:text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md transition-all shrink-0 cursor-pointer"
                title="Exit TV Display"
              >
                <span className="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px] font-black">✕</span>
                <span>Exit Display</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Split Columns: PREPARING vs READY */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 pt-4 sm:pt-6">
        
        {/* NOW PREPARING COLUMN */}
        <section className="bg-slate-900/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-800 flex flex-col shadow-lg">
          <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-800/80 mb-4 sm:mb-6">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-amber-500 animate-pulse"></span>
              <h2 className="text-base sm:text-xl md:text-2xl font-black text-amber-400 uppercase tracking-wider">
                Now Preparing
              </h2>
            </div>
            <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-amber-950/80 border border-amber-800/60 text-amber-300 font-bold text-xs sm:text-sm">
              {preparing.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {preparing.length === 0 ? (
              <div className="py-10 sm:py-16 flex flex-col items-center justify-center text-slate-500 space-y-2">
                <ChefHat className="w-8 h-8 text-slate-700 stroke-[1.5]" />
                <p className="text-xs sm:text-sm font-semibold text-slate-400">Kitchen is all caught up</p>
                <p className="text-[11px] text-slate-600">New cooking orders appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
                {preparing.map(o => (
                  <div
                    key={o.id}
                    className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-800/90 border border-amber-500/30 text-center shadow-md flex flex-col items-center justify-center transition-transform hover:scale-105"
                  >
                    <span className="text-2xl sm:text-3xl md:text-4xl font-black text-amber-300 font-mono tracking-tight">
                      #{o.token_no}
                    </span>
                    <span className="text-[10px] sm:text-xs text-slate-400 truncate max-w-[90px] sm:max-w-[110px] mt-0.5 font-medium">
                      {o.customer_name}
                    </span>
                    <span className="text-[9px] text-amber-400/80 font-bold mt-1">Cooking...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* READY FOR PICKUP COLUMN */}
        <section className="bg-gradient-to-b from-emerald-950/25 to-slate-900/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border-2 border-emerald-500/50 flex flex-col shadow-2xl shadow-emerald-950/40">
          <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-emerald-800/50 mb-4 sm:mb-6">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-400 animate-ping"></span>
              <h2 className="text-base sm:text-xl md:text-2xl font-black text-emerald-400 uppercase tracking-wider">
                Ready for Pickup!
              </h2>
            </div>
            <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-emerald-900/80 border border-emerald-600 text-emerald-200 font-bold text-xs sm:text-sm">
              {ready.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {ready.length === 0 ? (
              <div className="py-10 sm:py-16 flex flex-col items-center justify-center text-slate-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-slate-700 stroke-[1.5]" />
                <p className="text-xs sm:text-sm font-semibold text-slate-400">Waiting for ready orders</p>
                <p className="text-[11px] text-slate-600">Tokens ready to collect appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
                {ready.map(o => (
                  <div
                    key={o.id}
                    className="p-3.5 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-slate-950 border-2 border-emerald-300 text-center shadow-xl flex flex-col items-center justify-center animate-ready-glow transition-transform hover:scale-105"
                  >
                    <span className="text-3xl sm:text-4xl md:text-5xl font-black font-mono tracking-tight">
                      #{o.token_no}
                    </span>
                    <span className="text-xs sm:text-sm font-black truncate max-w-[130px] sm:max-w-[150px] mt-0.5 uppercase">
                      {o.customer_name}
                    </span>
                    <span className="mt-1.5 px-2 py-0.5 rounded-full bg-slate-950 text-emerald-300 text-[10px] font-black tracking-widest uppercase shadow-xs">
                      Collect Now
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </main>

      {/* Bottom Ticker */}
      <footer className="pt-3 sm:pt-5 mt-3 sm:mt-4 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-[11px] sm:text-xs text-slate-500 gap-1 sm:gap-0">
        <span>{settings?.canteen_name || 'BMU Canteen'} OS • {settings?.canteen_tagline || 'Smart Food Court-Chat and eat'}</span>
        <span>Please show your Token Number at Counter 1 for pickup</span>
      </footer>
    </div>
  );
}
