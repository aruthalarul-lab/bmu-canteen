import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, Minus, ShoppingBag, Clock, CheckCircle2, 
  Sparkles, AlertCircle, ArrowRight, X, Phone, User, MapPin,
  RefreshCw, Check, CreditCard, LayoutGrid, List, AlignJustify, Utensils
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playOrderReadySound } from '../utils/audio';
import UpiModal from '../components/UpiModal';
import UpiPaymentButtons from '../components/UpiPaymentButtons';
import CustomerCreditModal from '../components/CustomerCreditModal';
import socket from '../services/socket';

export default function CustomerMenu({ 
  cart: rawCart, 
  addToCart, 
  removeFromCart, 
  updateQuantity, 
  clearCart, 
  isCartOpen, 
  setIsCartOpen,
  activeOrder,
  setActiveOrder
}) {
  const cart = Array.isArray(rawCart) ? rawCart : [];
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietFilter, setDietFilter] = useState('ALL'); // 'ALL', 'VEG', 'NON_VEG'
  const [loading, setLoading] = useState(true);

  // View mode: 'list' (default), 'tile', 'compact'
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('bmu_customer_view_mode') || 'list';
    } catch (e) {
      return 'list';
    }
  });
  const [inStockOnly, setInStockOnly] = useState(false);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('bmu_customer_view_mode', mode);
    } catch (e) {}
  };

  // Customer Details Form
  const [customerName, setCustomerName] = useState(() => localStorage.getItem('bmu_customer_name') || '');
  const [customerDesk, setCustomerDesk] = useState(() => localStorage.getItem('bmu_customer_desk') || '');
  const [customerPhone, setCustomerPhone] = useState(() => localStorage.getItem('bmu_customer_phone') || '');
  const [customerUtr, setCustomerUtr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI'); // 'UPI', 'CREDIT', 'CASH'
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [completedNotice, setCompletedNotice] = useState(null);
  const [upiPreview, setUpiPreview] = useState(null);
  const [loadingUpiPreview, setLoadingUpiPreview] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);

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

        if (updated.status === 'COMPLETED') {
          // Food handed over! Clear active tracker and show celebratory completed banner
          setCompletedNotice(updated);
          setActiveOrder(null);
          setTimeout(() => {
            setCompletedNotice(null);
          }, 10000);
        } else if (updated.status === 'CANCELLED') {
          setActiveOrder(null);
        } else {
          setActiveOrder(updated);
        }
      }
    };

    socket.on('order-status-changed', handleStatusChange);
    return () => {
      socket.off('order-status-changed', handleStatusChange);
    };
  }, [activeOrder?.id, activeOrder?.status]);

  const safeCart = Array.isArray(cart) ? cart : [];
  const safeItems = Array.isArray(items) ? items : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  // Compute Cart Totals
  const cartSubtotal = safeCart.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0);
  const cartItemCount = safeCart.reduce((sum, i) => sum + (i.quantity || 1), 0);

  // Filter & sort items (in-stock items prioritized on top)
  const filteredItems = safeItems
    .filter(item => {
      if (!item) return false;
      const matchesCategory = selectedCategory === 'ALL' || String(item.category_id) === String(selectedCategory);
      const matchesDiet = 
        dietFilter === 'ALL' ? true :
        dietFilter === 'VEG' ? item.is_veg === 1 :
        item.is_veg === 0;
      const matchesInStock = inStockOnly ? item.is_available === 1 : true;
      const q = (searchQuery || '').toLowerCase().trim();
      const matchesSearch = !q || (item.name || '').toLowerCase().includes(q) || ((item.description || '').toLowerCase().includes(q));
      return matchesCategory && matchesSearch && matchesDiet && matchesInStock;
    })
    .sort((a, b) => {
      // In-stock items strictly on top:
      const aStock = a.is_available === 1 ? 1 : 0;
      const bStock = b.is_available === 1 ? 1 : 0;
      if (bStock !== aStock) {
        return bStock - aStock; // 1 (in-stock) comes before 0 (sold out)
      }
      return 0;
    });

  // Fetch UPI preview QR when drawer is open and UPI is selected
  useEffect(() => {
    if (isCartOpen && cartSubtotal > 0 && paymentMethod === 'UPI') {
      let isCurrent = true;
      setLoadingUpiPreview(true);
      fetch(`/api/qr/upi-preview?amount=${cartSubtotal}`)
        .then(r => r.json())
        .then(data => {
          if (isCurrent) {
            setUpiPreview(data);
            setLoadingUpiPreview(false);
          }
        })
        .catch(err => {
          console.error('Failed to load UPI QR preview:', err);
          if (isCurrent) setLoadingUpiPreview(false);
        });
      return () => { isCurrent = false; };
    }
  }, [isCartOpen, cartSubtotal, paymentMethod]);

  // Handle Checkout Submission
  const handlePlaceOrder = async (e) => {
    if (e) e.preventDefault();
    if (cart.length === 0) return;

    // 1. Customer Name is compulsory
    if (!customerName.trim()) {
      alert('⚠️ Name is compulsory! Please enter your Full Name.');
      return;
    }

    // 2. Student / Employee / Desk ID is compulsory
    if (!customerDesk.trim()) {
      alert('⚠️ ID is compulsory! Please enter your Student / Employee / Desk ID.');
      return;
    }

    // 3. For Staff Credit, mobile number is mandatory
    if (paymentMethod === 'CREDIT') {
      const cleanPhone = customerPhone.trim().replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        alert('📞 Mobile number (minimum 10 digits) is mandatory for Staff Credit (Weekly Tab).');
        return;
      }
    }

    setSubmittingOrder(true);

    try {
      localStorage.setItem('bmu_customer_name', customerName.trim());
      localStorage.setItem('bmu_customer_desk', customerDesk.trim());
      if (customerPhone.trim()) {
        localStorage.setItem('bmu_customer_phone', customerPhone.trim());
      }

      const payload = {
        customer_name: customerName.trim(),
        customer_desk: customerDesk.trim(),
        customer_phone: customerPhone.trim(),
        customer_utr: customerUtr.trim(),
        payment_method: paymentMethod,
        order_type: 'ONLINE',
        payment_status: (paymentMethod === 'CREDIT' || paymentMethod === 'CASH') ? 'PENDING' : 'PAID',
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
        particleCount: 60,
        spread: 70,
        origin: { y: 0.7 }
      });
    } catch (err) {
      console.error('Order submission error:', err);
      alert('Network error placing order. Please check connection.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-24">
      {/* Order Handed Over / Completed Celebration Banner */}
      {completedNotice && (
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 shadow-lg sticky top-16 z-30 transition-all animate-fade-in border-b border-emerald-400">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3 text-center sm:text-left">
              <div className="px-3 py-1.5 rounded-xl bg-white text-emerald-700 font-extrabold text-xl font-mono-code shadow-md">
                Token #{completedNotice.token_no}
              </div>
              <div>
                <div className="flex items-center space-x-2 justify-center sm:justify-start">
                  <span className="font-bold text-base flex items-center gap-1.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                    Order Handed Over!
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide bg-emerald-400 text-slate-900">
                    DELIVERED
                  </span>
                </div>
                <p className="text-xs text-emerald-100">
                  Thank you for dining with BMU Canteen. Enjoy your meal!
                </p>
              </div>
            </div>
            <button
              onClick={() => setCompletedNotice(null)}
              className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}

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
                  <span className="font-bold text-base">
                    {activeOrder.payment_method === 'CASH' && activeOrder.payment_status === 'PENDING'
                      ? '💵 Pay Cash at Counter 1'
                      : 'Your Order is in Progress'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide ${
                    activeOrder.payment_method === 'CASH' && activeOrder.payment_status === 'PENDING'
                      ? 'bg-amber-300 text-slate-900 animate-pulse'
                      : activeOrder.status === 'READY' 
                      ? 'bg-emerald-400 text-slate-900 animate-ready-glow' 
                      : activeOrder.status === 'PREPARING'
                      ? 'bg-amber-300 text-slate-900'
                      : 'bg-white/20 text-white'
                  }`}>
                    {activeOrder.payment_method === 'CASH' && activeOrder.payment_status === 'PENDING'
                      ? '⏳ AWAITING CASH'
                      : activeOrder.status === 'READY' 
                      ? '🎉 READY FOR PICKUP!' 
                      : activeOrder.status}
                  </span>
                </div>
                <p className="text-xs text-orange-100">
                  {activeOrder.payment_method === 'CASH' && activeOrder.payment_status === 'PENDING'
                    ? `Please visit Counter 1 and pay ₹${activeOrder.total_amount} to cashier. Cooking will begin once confirmed!`
                    : activeOrder.status === 'READY' 
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
                onClick={() => setActiveOrder(null)}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-xs font-medium transition-colors flex items-center gap-1"
                title="Dismiss Order Tracker"
              >
                <X className="w-3.5 h-3.5" />
                <span>Dismiss</span>
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
            <div className="mt-4 pt-3.5 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-300">
                Staff / Faculty Credit Account Holder?
              </span>
              <button
                type="button"
                onClick={() => setShowCreditModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 text-xs font-bold transition-all active:scale-95 shadow-xs"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Check My Credit Dues & Pay Online</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
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

        {/* Menu Controls Toolbar (In-Stock filter & View Switcher) */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pt-1">
          {/* Left: Item count & In-stock quick filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setInStockOnly(prev => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all border ${
                inStockOnly 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Show only in-stock items"
            >
              <span className={`w-2 h-2 rounded-full ${inStockOnly ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
              <span>In Stock Only</span>
            </button>
          </div>

          {/* Right: Mobile View Options (List, Tile, Compact) */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-xs space-x-1">
            <button
              type="button"
              onClick={() => handleViewModeChange('list')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="List View (Default)"
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('tile')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'tile'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Tile Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Tile</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('compact')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'compact'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Compact View"
            >
              <AlignJustify className="w-3.5 h-3.5" />
              <span>Compact</span>
            </button>
          </div>
        </div>

        {/* Menu Items Render */}
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
        ) : viewMode === 'list' ? (
          /* ================= VIEW: LIST ================= */
          <div className="space-y-2.5 sm:space-y-3">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              const isAvailable = item.is_available === 1;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border p-3 sm:p-4 flex items-center justify-between gap-3 transition-all duration-200 shadow-xs ${
                    !isAvailable 
                      ? 'opacity-60 bg-slate-50 border-slate-200 grayscale-[40%]' 
                      : 'hover:shadow-md hover:border-orange-200 border-slate-200/80'
                  }`}
                >
                  {/* Left: Thumbnail Emoji with Veg Badge */}
                  <div className="relative shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-orange-50/70 border border-orange-100 flex items-center justify-center text-2xl sm:text-3xl select-none">
                    {item.image_emoji || '🍲'}
                    <div className="absolute -top-1 -right-1">
                      {item.is_veg === 1 ? (
                        <span className="w-3.5 h-3.5 rounded-sm border border-emerald-600 bg-white flex items-center justify-center p-0.5 shadow-xs" title="Pure Veg">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                        </span>
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-sm border border-rose-600 bg-white flex items-center justify-center p-0.5 shadow-xs" title="Non-Veg">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                        {item.name}
                      </h3>
                      {!isAvailable && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                          Sold Out
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="font-medium text-slate-400">{item.category_name}</span>
                      {item.description && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[160px] sm:max-w-xs text-slate-500">{item.description}</span>
                        </>
                      )}
                    </div>
                    <div className="font-extrabold text-sm sm:text-base text-slate-900 mt-1">
                      ₹{item.price}
                    </div>
                  </div>

                  {/* Right: Quantity Stepper or Add Button */}
                  <div className="shrink-0">
                    {!isAvailable ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200">
                        Unavailable
                      </span>
                    ) : inCart ? (
                      <div className="flex items-center space-x-1.5 bg-orange-50 border border-orange-200 rounded-xl p-1">
                        <button
                          onClick={() => updateQuantity(item.id, inCart.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-white text-orange-600 shadow-xs flex items-center justify-center hover:bg-orange-100 transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-xs sm:text-sm text-slate-900 min-w-[20px] text-center">
                          {inCart.quantity}
                        </span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-7 h-7 rounded-lg bg-orange-500 text-white shadow-xs flex items-center justify-center hover:bg-orange-600 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center space-x-1"
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
        ) : viewMode === 'compact' ? (
          /* ================= VIEW: COMPACT ================= */
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              const isAvailable = item.is_available === 1;

              return (
                <div
                  key={item.id}
                  className={`p-3 flex items-center justify-between gap-2 hover:bg-slate-50/80 transition-colors ${
                    !isAvailable ? 'opacity-60 bg-slate-50/50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.is_veg === 1 ? (
                      <span className="w-3.5 h-3.5 rounded-sm border border-emerald-600 bg-white flex items-center justify-center p-0.5 shrink-0" title="Pure Veg">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      </span>
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-sm border border-rose-600 bg-white flex items-center justify-center p-0.5 shrink-0" title="Non-Veg">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                      </span>
                    )}
                    <span className="text-xl select-none shrink-0" role="img" aria-label={item.name}>
                      {item.image_emoji || '🍲'}
                    </span>
                    <div className="min-w-0">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 block truncate">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {item.category_name}
                      </span>
                    </div>
                    {!isAvailable && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                        Sold Out
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-extrabold text-xs sm:text-sm text-slate-900 min-w-[45px] text-right">
                      ₹{item.price}
                    </span>
                    {!isAvailable ? (
                      <span className="text-[10px] font-bold text-slate-400 italic">Unavailable</span>
                    ) : inCart ? (
                      <div className="flex items-center space-x-1 bg-orange-50 border border-orange-200 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(item.id, inCart.quantity - 1)}
                          className="w-5 h-5 rounded bg-white text-orange-600 flex items-center justify-center text-xs font-bold"
                        >
                          -
                        </button>
                        <span className="font-bold text-xs text-slate-900 min-w-[14px] text-center">
                          {inCart.quantity}
                        </span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-5 h-5 rounded bg-orange-500 text-white flex items-center justify-center text-xs font-bold"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs"
                      >
                        + ADD
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ================= VIEW: TILE (DEFAULT) ================= */
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-6">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              const isAvailable = item.is_available === 1;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border p-3 sm:p-4 flex flex-col justify-between transition-all duration-200 shadow-xs ${
                    !isAvailable 
                      ? 'opacity-60 bg-slate-50 border-slate-200 grayscale-[40%]' 
                      : 'hover:shadow-md hover:border-orange-200 border-slate-200/80'
                  }`}
                >
                  <div>
                    {/* Item Header / Badges */}
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="text-2xl sm:text-3xl select-none" role="img" aria-label={item.name}>
                        {item.image_emoji || '🍲'}
                      </span>
                      <div className="flex items-center gap-1">
                        {item.is_veg === 1 ? (
                          <span className="w-3.5 h-3.5 rounded-sm border border-emerald-600 bg-white flex items-center justify-center p-0.5 shrink-0" title="Pure Veg">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                          </span>
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-sm border border-rose-600 bg-white flex items-center justify-center p-0.5 shrink-0" title="Non-Veg">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                          </span>
                        )}
                        {!isAvailable && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-rose-100 text-rose-700 border border-rose-200">
                            Sold Out
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2">
                      <h3 className="font-bold text-slate-900 text-xs sm:text-base leading-snug line-clamp-2 min-h-[2rem] sm:min-h-0">
                        {item.name}
                      </h3>
                      <span className="text-[10px] sm:text-xs font-medium text-slate-400 block truncate">
                        {item.category_name}
                      </span>
                    </div>

                    {/* Description (desktop / tablets) */}
                    {item.description && (
                      <p className="hidden sm:block text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Price & Action Row */}
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                    <div>
                      <span className="hidden sm:block text-[10px] text-slate-400 font-medium">Price</span>
                      <div className="font-extrabold text-sm sm:text-lg text-slate-900 leading-none">
                        ₹{item.price}
                      </div>
                    </div>

                    {/* Add / Quantity Stepper Button */}
                    {!isAvailable ? (
                      <span className="text-[11px] font-bold text-slate-400 italic">Sold Out</span>
                    ) : inCart ? (
                      <div className="flex items-center space-x-1 sm:space-x-2 bg-orange-50 border border-orange-200 rounded-xl p-0.5 sm:p-1">
                        <button
                          onClick={() => updateQuantity(item.id, inCart.quantity - 1)}
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white text-orange-600 shadow-xs flex items-center justify-center hover:bg-orange-100 transition-colors"
                        >
                          <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                        <span className="font-bold text-xs sm:text-sm text-slate-900 min-w-[16px] sm:min-w-[20px] text-center">
                          {inCart.quantity}
                        </span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-orange-500 text-white shadow-xs flex items-center justify-center hover:bg-orange-600 transition-colors"
                        >
                          <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center space-x-1"
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

        {/* Discreet Staff Portal Link */}
        <div className="mt-16 text-center text-xs text-slate-400 border-t border-slate-200/60 pt-6 pb-6 space-y-1">
          <p>© BMU Canteen • Fresh & Fast Office Dining</p>
          <a
            href="/?view=operator"
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors mt-1"
          >
            <span>🔒 Staff & Canteen Operator Portal</span>
          </a>
        </div>
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
                      Customer & Pickup Information
                    </h3>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Full Name <span className="text-red-500">*</span>
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
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Student / Employee / Desk ID <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          required
                          placeholder="e.g. Roll No 23BMU042 / Staff ID 104"
                          value={customerDesk}
                          onChange={(e) => setCustomerDesk(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Payment Method Selector */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1.5">
                        Payment Method <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('UPI')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center transition-all ${
                            paymentMethod === 'UPI'
                              ? 'bg-orange-50 border-orange-400 text-orange-700 ring-1 ring-orange-400 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>⚡ UPI QR</span>
                          <span className="text-[10px] font-normal text-slate-500 mt-0.5">Pay Online</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMethod('CREDIT')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center transition-all ${
                            paymentMethod === 'CREDIT'
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-700 ring-1 ring-indigo-400 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>📋 Staff Credit</span>
                          <span className="text-[10px] font-normal text-slate-500 mt-0.5">Weekly Tab</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMethod('CASH')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center transition-all ${
                            paymentMethod === 'CASH'
                              ? 'bg-amber-50 border-amber-400 text-amber-700 ring-1 ring-amber-400 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>💵 Cash</span>
                          <span className="text-[10px] font-normal text-slate-500 mt-0.5">Counter 1</span>
                        </button>
                      </div>

                      {/* UPI QR Payment Block (Pay Before Submitting) */}
                      {paymentMethod === 'UPI' && (
                        <div className="mt-3 p-4 rounded-2xl bg-orange-50/60 border border-orange-200 text-center space-y-2.5 animate-fade-in">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-orange-900">
                            <Sparkles className="w-4 h-4 text-orange-500" />
                            <span>Scan & Pay Before Placing Order</span>
                          </div>

                          {loadingUpiPreview ? (
                            <div className="py-6 flex items-center justify-center text-xs text-slate-400">
                              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                              Generating Dynamic UPI QR...
                            </div>
                          ) : upiPreview ? (
                            <div className="flex flex-col items-center">
                              <div className="p-2 bg-white rounded-2xl shadow-sm border border-orange-200 inline-block">
                                <img 
                                  src={upiPreview.qrDataUrl} 
                                  alt="UPI QR Code" 
                                  className="w-40 h-40 sm:w-44 sm:h-44 object-contain rounded-xl"
                                />
                              </div>
                              <p className="text-xs font-mono font-bold text-slate-700 mt-2">
                                UPI: <span className="text-orange-700">{upiPreview.upiId}</span>
                              </p>
                              <p className="text-sm font-black text-slate-900">
                                Exact Amount: <span className="text-emerald-700">₹{cartSubtotal}</span>
                              </p>

                              <UpiPaymentButtons 
                                upiUri={upiPreview.upiUri} 
                                upiId={upiPreview.upiId} 
                                amount={cartSubtotal} 
                              />

                              <p className="text-[11px] text-slate-500 mt-2">
                                <strong>Step 1:</strong> Pay ₹{cartSubtotal} using buttons above or scan QR code.<br />
                                <strong>Step 2:</strong> Enter 12-digit UTR below & click Place Order!
                              </p>

                              <div className="mt-2.5 text-left">
                                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                                  UPI Reference / UTR No. <span className="text-slate-400 font-normal">(12-digit Ref from app)</span>
                                </label>
                                <input
                                  type="text"
                                  maxLength={20}
                                  placeholder="e.g. 423501987123"
                                  value={customerUtr}
                                  onChange={(e) => setCustomerUtr(e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono-code focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-slate-900"
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Staff Credit (Weekly Tab) - Mobile number mandatory */}
                      {paymentMethod === 'CREDIT' && (
                        <div className="mt-3 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-2.5 animate-fade-in">
                          <div className="font-bold flex items-center gap-1.5 text-indigo-800">
                            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span>Staff Credit (Weekly Tab)</span>
                          </div>
                          <p className="text-indigo-700 leading-tight">
                            This order (₹{cartSubtotal}) will be charged to your weekly staff account.
                          </p>

                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">
                              Mobile Number <span className="text-red-500">*</span> (Mandatory for Weekly Tab)
                            </label>
                            <div className="relative">
                              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="tel"
                                required
                                maxLength={15}
                                placeholder="10-digit mobile number (e.g. 9876543210)"
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cash Payment Notice */}
                      {paymentMethod === 'CASH' && (
                        <div className="mt-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2 animate-fade-in">
                          <div className="font-bold flex items-center gap-1.5 text-amber-800">
                            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Pay Cash at Counter 1 Workflow</span>
                          </div>
                          <p className="text-slate-700 leading-tight">
                            You will receive a Token Number right now. Please walk up to <strong>Counter 1</strong> and pay ₹{cartSubtotal} in cash to the cashier.
                          </p>
                          <div className="bg-white p-2.5 rounded-xl border border-amber-200 font-semibold text-amber-950 text-[11px]">
                            🔔 <strong>Note:</strong> Kitchen will start preparing your meal fresh immediately after the cashier confirms your cash payment.
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                )}
              </div>

              {/* Drawer Footer / Submit */}
              {cart.length > 0 && (
                <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-medium">To Pay</span>
                    <span className="text-xl font-extrabold text-slate-900">₹{cartSubtotal}</span>
                  </div>

                  {paymentMethod === 'UPI' && (
                    <button
                      onClick={handlePlaceOrder}
                      disabled={submittingOrder || !customerName.trim() || !customerDesk.trim()}
                      className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center space-x-2"
                    >
                      {submittingOrder ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Submitting Order...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>I Have Completed Payment (Place Order)</span>
                        </>
                      )}
                    </button>
                  )}

                  {paymentMethod === 'CREDIT' && (
                    <button
                      onClick={handlePlaceOrder}
                      disabled={submittingOrder || !customerName.trim() || !customerDesk.trim() || customerPhone.replace(/\D/g, '').length < 10}
                      className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2"
                    >
                      {submittingOrder ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Recording Staff Tab...</span>
                        </>
                      ) : (
                        <>
                          <span>Confirm Staff Credit Order</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}

                  {paymentMethod === 'CASH' && (
                    <button
                      onClick={handlePlaceOrder}
                      disabled={submittingOrder || !customerName.trim() || !customerDesk.trim()}
                      className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-98 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center space-x-2"
                    >
                      {submittingOrder ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Generating Token...</span>
                        </>
                      ) : (
                        <>
                          <span>💵 Place Order (Pay Cash at Counter 1)</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}
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

      {/* Customer Credit Dues & Statement Modal */}
      <CustomerCreditModal
        isOpen={showCreditModal}
        onClose={() => setShowCreditModal(false)}
      />
    </div>
  );
}
