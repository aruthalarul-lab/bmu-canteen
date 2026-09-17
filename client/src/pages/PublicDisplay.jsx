import React, { useState, useEffect } from 'react';
import { ChefHat, Bell, CheckCircle2, Clock } from 'lucide-react';
import socket from '../services/socket';
import { playOrderReadySound } from '../utils/audio';

export default function PublicDisplay() {
  const [orders, setOrders] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [soundEnabled, setSoundEnabled] = useState(false);

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
        return prev.map(o => o.id === updated.id ? updated : o);
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
    <div className="min-h-screen bg-slate-950 text-white flex flex-col p-6 sm:p-10 select-none">
      {/* Top Banner / Header */}
      <header className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center font-black text-2xl shadow-lg shadow-orange-500/30">
            BMU
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              BMU Canteen • Order Status
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Pick up your order when your Token Number appears in green
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              if (!soundEnabled) playOrderReadySound();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              soundEnabled
                ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            {soundEnabled ? '🔔 TV Chime ON' : '🔕 TV Chime OFF'}
          </button>

          <div className="text-right">
            <span className="text-2xl sm:text-3xl font-black font-mono-code text-orange-400">
              {currentTime}
            </span>
          </div>
        </div>
      </header>

      {/* Main Split Columns: PREPARING vs READY */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
        
        {/* PREPARING COLUMN */}
        <section className="bg-slate-900/80 rounded-3xl p-6 sm:p-8 border border-slate-800/80 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
            <div className="flex items-center space-x-3">
              <span className="w-4 h-4 rounded-full bg-amber-500 animate-spin"></span>
              <h2 className="text-xl sm:text-2xl font-black text-amber-400 uppercase tracking-wider">
                Now Preparing
              </h2>
            </div>
            <span className="px-3 py-1 rounded-full bg-amber-950 border border-amber-800/60 text-amber-400 font-bold text-sm">
              {preparing.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {preparing.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600 font-medium text-lg">
                No orders in kitchen
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {preparing.map(o => (
                  <div
                    key={o.id}
                    className="p-4 rounded-2xl bg-slate-800/90 border border-amber-500/30 text-center shadow-md flex flex-col items-center justify-center transition-transform hover:scale-105"
                  >
                    <span className="text-3xl sm:text-4xl font-black text-amber-300 font-mono-code">
                      #{o.token_no}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[100px] mt-1 font-medium">
                      {o.customer_name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* READY FOR PICKUP COLUMN */}
        <section className="bg-emerald-950/20 rounded-3xl p-6 sm:p-8 border-2 border-emerald-500/60 flex flex-col shadow-2xl shadow-emerald-950/40">
          <div className="flex items-center justify-between pb-4 border-b border-emerald-800/60 mb-6">
            <div className="flex items-center space-x-3">
              <span className="w-4 h-4 rounded-full bg-emerald-400 animate-ping"></span>
              <h2 className="text-xl sm:text-2xl font-black text-emerald-400 uppercase tracking-wider">
                Ready for Pickup!
              </h2>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-900 border border-emerald-600 text-emerald-200 font-bold text-sm">
              {ready.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {ready.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600 font-medium text-lg">
                Waiting for ready orders
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {ready.map(o => (
                  <div
                    key={o.id}
                    className="p-5 rounded-2xl bg-emerald-500 text-slate-950 border-2 border-emerald-300 text-center shadow-xl flex flex-col items-center justify-center animate-ready-glow"
                  >
                    <span className="text-4xl sm:text-5xl font-black font-mono-code tracking-tight">
                      #{o.token_no}
                    </span>
                    <span className="text-xs font-extrabold truncate max-w-[120px] mt-1 uppercase">
                      {o.customer_name}
                    </span>
                    <span className="mt-1 px-2 py-0.5 rounded-full bg-slate-950 text-emerald-300 text-[10px] font-black tracking-widest uppercase">
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
      <footer className="pt-6 mt-4 border-t border-slate-900 flex items-center justify-between text-xs text-slate-500">
        <span>BMU Office Canteen System</span>
        <span>Please show your token number at the counter</span>
      </footer>
    </div>
  );
}
