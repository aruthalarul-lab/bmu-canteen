import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, Minus, ShoppingBag, Clock, CheckCircle2, 
  Sparkles, AlertCircle, ArrowRight, X, Phone, User, MapPin,
  RefreshCw, Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playOrderReadySound } from '../utils/audio';
import UpiModal from '../components/UpiModal';
import socket from '../services/socket';

export default function CustomerMenu({ 
  cart, 
  addToCart, 
  removeFromCart, 
  updateQuantity, 
  clearCart, 
  isCartOpen, 
  setIsCartOpen,
  activeOrder,
  setActiveOrder
}) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dietFilter, setDietFilter] = useState('ALL'); // 'ALL', 'VEG', 'NON_VEG'
  const [loading, setLoading] = useState(true);

  // Customer Details Form
  const [customerName, setCustomerName] = useState(() => localStorage.getItem('bmu_customer_name') || '');
  const [customerDesk, setCustomerDesk] = useState(() => localStorage.getItem('bmu_customer_desk') || '');
  const [paymentMethod, setPaymentMethod] = useState('UPI'); // 'UPI' or 'CASH'
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);

  // Fetch menu on load
  const fetchMenu = async () => {
    try {
      const res = await fetch('/api/menu');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch menu:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();

    // Listen for real-time stock updates from operator
    const handleStockUpdate = ({ id, is_available }) => {
      setItems(prevItems => 
        prevItems.map(item => item.id === id ? { ...item, is_available } : item)
      );
    };

    // Listen for menu additions/changes
    const handleMenuChange = () => {
      fetchMenu();
    };

    socket.on('stock-updated', handleStockUpdate);
    socket.on('menu-changed', handleMenuChange);

    return () => {
      socket.off('stock-updated', handleStockUpdate);
      socket.off('menu-changed', handleMenuChange);
    };
  }, []);

  // Listen for status changes on the customer's active order
  useEffect(() => {
    if (!activeOrder?.id) return;

    const handleStatusChange = (updated) => {
      if (updated.id === activeOrder.id) {
        // If order transitioned to READY, celebrate!
        if (updated.status === 'READY' && activeOrder.status !== 'READY') {
          playOrderReadySound();
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
        setActiveOrder(updated);
      }
    };

    socket.on('order-status-changed', handleStatusChange);
    return () => {
      socket.off('order-status-changed', handleStatusChange);
    };
  }, [activeOrder]);

  // Compute Cart Totals
  const cartSubtotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const cartItemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'ALL' || String(item.category_id) === String(selectedCategory);
    const matchesDiet = 
      dietFilter === 'ALL' ? true :
      dietFilter === 'VEG' ? item.is_veg === 1 :
      item.is_veg === 0;
    return matchesCategory && matchesSearch && matchesDiet;
  });

  // Handle Checkout Submission
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;
    if (!customerName.trim()) {
      alert('Please enter your name so the counter can identify your order.');
      return;
    }

    setSubmittingOrder(true);

    try {
      localStorage.setItem('bmu_customer_name', customerName.trim());
      localStorage.setItem('bmu_customer_desk', customerDesk.trim());

      const payload = {
        customer_name: customerName.trim(),
        customer_desk: customerDesk.trim(),
        payment_method: paymentMethod,
        order_type: 'ONLINE',
        items: cart.map(item => ({
          menu_item_id: item.id,
          quantity: item.quantity,
        })),
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to place order. Please try again.');
        return;
      }

      const orderData = await res.json();
      setActiveOrder(orderData);
      clearCart();
      setIsCartOpen(false);

      // Trigger celebratory confetti
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });

      // If UPI, trigger the payment QR modal
      if (orderData.payment_method === 'UPI' && orderData.upi) {
        setShowUpiModal(true);
      }
    } catch (err) {
      console.error('Order submission error:', err);
      alert('Network error placing order. Please check connection.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-24">
      {/* Active Order Live Tracker Banner (If customer placed an order) */}
      {activeOrder && activeOrder.status !== 'COMPLETED' && activeOrder.status !== 'CANCELLED' && (
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 text-white p-4 shadow-lg sticky top-16 z-30 transition-all">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3 text-center sm:text-left">
              <div className="px-3 py-1.5 rounded-xl bg-white text-orange-600 font-extrabold text-xl font-mono-code shadow-md">
                Token #{activeOrder.token_no}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-base">Your Order is in Progress</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide ${
                    activeOrder.status === 'READY' 
                      ? 'bg-emerald-400 text-slate-900 animate-ready-glow' 
                      : activeOrder.status === 'PREPARING'
                      ? 'bg-amber-300 text-slate-900'
                      : 'bg-white/20 text-white'
                  }`}>
                    {activeOrder.status === 'READY' ? '🎉 READY FOR PICKUP!' : activeOrder.status}
                  </span>
                </div>
                <p className="text-xs text-orange-100">
                  {activeOrder.status === 'READY' 
                    ? 'Please collect your food at the counter right now!' 
                    : activeOrder.status === 'PREPARING'
                    ? 'Chef is preparing your meal fresh at the counter.'
                    : 'Order received. Waiting for kitchen to start.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {activeOrder.payment_method === 'UPI' && activeOrder.payment_status === 'PENDING' && (
                <button
                  onClick={() => setShowUpiModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-sm transition-colors"
                >
                  View UPI QR
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm('Dismiss this order tracker?')) {
                    setActiveOrder(null);
                  }
                }}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        {/* Welcome Header */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden mb-8 border border-slate-700/50">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-orange-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="relative z-10 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30 mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Skip the Queue • Order from Desk
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Order fresh food & pick up at the counter
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Select items, pay with UPI QR or Cash, and get an instant live token number.
            </p>
          </div>
        </div>

        {/* Search & Veg Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Chai, Samosa, Thali, Dosa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 3-State Diet Filter */}
          <div className="flex items-center bg-white p-1 rounded-2xl border border-slate-200 shadow-sm space-x-1 shrink-0">
            <button
              type="button"
              onClick={() => setDietFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                dietFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setDietFilter('VEG')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                dietFilter === 'VEG'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <span className="w-3 h-3 rounded-sm border border-emerald-600 bg-white flex items-center justify-center p-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              </span>
              <span>Veg</span>
            </button>
            <button
              type="button"
              onClick={() => setDietFilter('NON_VEG')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                dietFilter === 'NON_VEG'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              <span className="w-3 h-3 rounded-sm border border-rose-600 bg-white flex items-center justify-center p-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
              </span>
              <span>Non-Veg</span>
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            All Items ({items.length})
          </button>
          {categories.map(cat => {
            const count = items.filter(i => String(i.category_id) === String(cat.id)).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                  String(selectedCategory) === String(cat.id)
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Menu Items Grid */}
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-500" />
            <p className="text-sm">Loading canteen menu...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center mx-auto mb-3">
              <Utensils className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800">No items found</h3>
            <p className="text-xs text-slate-500 mt-1">Try clearing filters or search query.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              const isAvailable = item.is_available === 1;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200 shadow-sm ${
                    !isAvailable 
                      ? 'opacity-60 bg-slate-50 border-slate-200 grayscale-[40%]' 
                      : 'hover:shadow-md hover:border-orange-200 border-slate-200/80'
                  }`}
                >
                  <div>
                    {/* Item Header / Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl select-none" role="img" aria-label={item.name}>
                          {item.image_emoji || '🍲'}
                        </span>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            {item.is_veg === 1 ? (
                              <span className="w-3.5 h-3.5 rounded-sm border border-emerald-600 bg-white flex items-center justify-center p-0.5 shrink-0" title="Pure Veg">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              </span>
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-sm border border-rose-600 bg-white flex items-center justify-center p-0.5 shrink-0" title="Non-Veg">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                              </span>
                            )}
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                              {item.name}
                            </h3>
                          </div>
                          <span className="text-[11px] font-medium text-slate-400">
                            {item.category_name}
                          </span>
                        </div>
                      </div>

                      {/* Stock Status Badge */}
                      {!isAvailable && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-100 text-rose-700 border border-rose-200">
                          Sold Out
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {item.description && (
                      <p className="text-xs text-slate-500 mt-2.5 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Price & Action Row */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <div>
                      <span className="text-xs text-slate-400 font-medium">Price</span>
                      <div className="font-extrabold text-base sm:text-lg text-slate-900 leading-none">
                        ₹{item.price}
                      </div>
                    </div>

                    {/* Add / Quantity Stepper Button */}
                    {!isAvailable ? (
                      <span className="text-xs font-semibold text-slate-400 italic">Unavailable</span>
                    ) : inCart ? (
                      <div className="flex items-center space-x-2 bg-orange-50 border border-orange-200 rounded-xl p-1">
                        <button
                          onClick={() => updateQuantity(item.id, inCart.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-white text-orange-600 shadow-sm flex items-center justify-center hover:bg-orange-100 transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-sm text-slate-900 min-w-[20px] text-center">
                          {inCart.quantity}
                        </span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-7 h-7 rounded-lg bg-orange-500 text-white shadow-sm flex items-center justify-center hover:bg-orange-600 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs sm:text-sm transition-all shadow-sm flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>ADD</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar (for Mobile quick checkout) */}
      {cartItemCount > 0 && !isCartOpen && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40 animate-slide-up">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-slate-900 hover:bg-black text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between border border-slate-700/60 active:scale-98 transition-all"
          >
            <div className="flex items-center space-x-2.5">
              <span className="w-7 h-7 rounded-lg bg-orange-500 text-white font-extrabold text-xs flex items-center justify-center">
                {cartItemCount}
              </span>
              <span className="font-bold text-sm">View Your Order</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-base text-orange-400">₹{cartSubtotal}</span>
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </div>
          </button>
        </div>
      )}

      {/* Slide-over Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsCartOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center space-x-2">
                  <ShoppingBag className="w-5 h-5 text-orange-500" />
                  <h2 className="font-extrabold text-base text-slate-900">Your Canteen Tray</h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                    {cartItemCount} items
                  </span>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {cart.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-2 stroke-1" />
                    <p className="font-semibold text-sm">Tray is empty</p>
                    <p className="text-xs mt-1">Add items from the menu to start order.</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                      <div className="flex items-center space-x-2.5">
                        <span className="text-xl">{item.image_emoji || '🍲'}</span>
                        <div>
                          <p className="font-bold text-sm text-slate-800 leading-tight">{item.name}</p>
                          <p className="text-xs text-slate-500 font-medium">₹{item.price} each</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-1.5 bg-white border border-slate-200 rounded-lg p-1">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-xs min-w-[18px] text-center text-slate-800">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => addToCart(item)}
                            className="w-6 h-6 rounded bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-extrabold text-sm text-slate-900 min-w-[50px] text-right">
                          ₹{item.price * item.quantity}
                        </span>
                      </div>
                    </div>
                  ))
                )}

                {/* Customer Details Inputs */}
                {cart.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Pickup Information
                    </h3>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Your Name / ID *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rahul Sharma"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Desk / Department (Optional)
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="e.g. 2nd Floor Marketing"
                          value={customerDesk}
                          onChange={(e) => setCustomerDesk(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Payment Method Selector */}
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Payment Method
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('UPI')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center transition-all ${
                            paymentMethod === 'UPI'
                              ? 'bg-orange-50 border-orange-400 text-orange-700 ring-1 ring-orange-400'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>⚡ UPI / QR Scan</span>
                          <span className="text-[10px] font-normal text-slate-500 mt-0.5">Pay online instantly</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMethod('CASH')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center transition-all ${
                            paymentMethod === 'CASH'
                              ? 'bg-orange-50 border-orange-400 text-orange-700 ring-1 ring-orange-400'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>💵 Cash at Counter</span>
                          <span className="text-[10px] font-normal text-slate-500 mt-0.5">Pay when collecting</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer Footer / Submit */}
              {cart.length > 0 && (
                <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">To Pay</span>
                    <span className="text-xl font-extrabold text-slate-900">₹{cartSubtotal}</span>
                  </div>

                  <button
                    onClick={handlePlaceOrder}
                    disabled={submittingOrder}
                    className="w-full py-3.5 px-4 rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-98 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center space-x-2"
                  >
                    {submittingOrder ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Generating Token...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm & Get Token</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UPI QR Payment Modal */}
      {showUpiModal && activeOrder?.upi && (
        <UpiModal
          upiData={activeOrder.upi}
          order={activeOrder}
          onClose={() => setShowUpiModal(false)}
          onConfirmPaid={() => setShowUpiModal(false)}
        />
      )}
    </div>
  );
}
