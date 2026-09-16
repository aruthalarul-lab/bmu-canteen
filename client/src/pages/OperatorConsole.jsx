import React, { useState, useEffect } from 'react';
import { 
  Bell, Volume2, VolumeX, CheckCircle, Clock, ChefHat, 
  Package, DollarSign, QrCode, RefreshCw, AlertTriangle, 
  Trash2, Plus, Minus, ArrowRight, Settings, Check, X, ShieldAlert,
  Flame, Sparkles, TrendingUp, CreditCard, Edit2, Search
} from 'lucide-react';
import { playNewOrderSound, playOrderReadySound } from '../utils/audio';
import socket from '../services/socket';

export default function OperatorConsole() {
  const [tab, setTab] = useState('queue'); // 'queue', 'pos', 'stock', 'settings'
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [lastOrderSoundTime, setLastOrderSoundTime] = useState(null);

  // Fast-POS State
  const [posCart, setPosCart] = useState([]);
  const [posCustomerName, setPosCustomerName] = useState('');
  const [posCategory, setPosCategory] = useState('ALL');
  const [posSubmitting, setPosSubmitting] = useState(false);
  const [posLastPlacedToken, setPosLastPlacedToken] = useState(null);

  // Settings State
  const [settings, setSettings] = useState({
    canteen_name: 'BMU Canteen',
    upi_id: 'bmucanteen@upi',
    upi_name: 'BMU Office Canteen',
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Add Item Modal State
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category_id: 1,
    price: '',
    description: '',
    is_veg: 0,
    is_quick_item: 1,
    image_emoji: '🍗',
  });
  const [addingItem, setAddingItem] = useState(false);

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) {
      alert('Please enter Item Name and Price');
      return;
    }
    setAddingItem(true);
    try {
      const res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });
      if (res.ok) {
        const created = await res.json();
        setMenuItems(prev => [created, ...prev]);
        setShowAddItemModal(false);
        setNewItem({
          name: '',
          category_id: 1,
          price: '',
          description: '',
          is_veg: 0,
          is_quick_item: 1,
          image_emoji: '🍗',
        });
      } else {
        alert('Failed to add item');
      }
    } catch (err) {
      console.error(err);
      alert('Error creating item');
    } finally {
      setAddingItem(false);
    }
  };

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState(null);
  const [editItemForm, setEditItemForm] = useState({
    name: '',
    category_id: 1,
    price: '',
    description: '',
    is_veg: 1,
    is_quick_item: 1,
    image_emoji: '🍲',
  });
  const [updatingItem, setUpdatingItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);

  // Stock / Menu Manager Search & Filter State
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState('ALL');

  const startEditItem = (item) => {
    setEditingItem(item);
    setEditItemForm({
      name: item.name,
      category_id: item.category_id || 1,
      price: String(item.price),
      description: item.description || '',
      is_veg: item.is_veg === 1 ? 1 : 0,
      is_quick_item: item.is_quick_item === 1 ? 1 : 0,
      image_emoji: item.image_emoji || '🍲',
    });
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!editItemForm.name || !editItemForm.price) {
      alert('Please enter Item Name and Price');
      return;
    }
    setUpdatingItem(true);
    try {
      const res = await fetch(`/api/menu/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editItemForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setMenuItems(prev => prev.map(i => i.id === updated.id ? updated : i));
        setEditingItem(null);
      } else {
        alert('Failed to update item');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating item');
    } finally {
      setUpdatingItem(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Are you sure you want to permanently delete this item from the menu?')) return;
    setDeletingItem(true);
    try {
      const res = await fetch(`/api/menu/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        setMenuItems(prev => prev.filter(i => i.id !== itemId));
        setEditingItem(null);
      } else {
        alert('Failed to delete item');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting item');
    } finally {
      setDeletingItem(false);
    }
  };

  // Load Initial Data
  const loadData = async () => {
    try {
      const [ordersRes, statsRes, menuRes, settingsRes] = await Promise.all([
        fetch('/api/orders/active'),
        fetch('/api/orders/stats'),
        fetch('/api/menu'),
        fetch('/api/settings'),
      ]);

      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        setMenuItems(menuData.items || []);
        setCategories(menuData.categories || []);
      }
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (err) {
      console.error('Failed to load operator data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // WebSocket Listeners
    const handleNewOrder = (newOrder) => {
      setOrders((prev) => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
      
      // Play audio chime!
      if (audioEnabled) {
        playNewOrderSound();
        setLastOrderSoundTime(new Date().toLocaleTimeString());
      }

      // Refresh statistics
      fetch('/api/orders/stats')
        .then(r => r.json())
        .then(data => setStats(data))
        .catch(() => {});
    };

    const handleStatusChanged = (updatedOrder) => {
      setOrders((prev) => {
        if (updatedOrder.status === 'COMPLETED' || updatedOrder.status === 'CANCELLED') {
          return prev.filter(o => o.id !== updatedOrder.id);
        }
        return prev.map(o => o.id === updatedOrder.id ? updatedOrder : o);
      });

      fetch('/api/orders/stats')
        .then(r => r.json())
        .then(data => setStats(data))
        .catch(() => {});
    };

    const handleStockUpdated = ({ id, is_available }) => {
      setMenuItems((prev) => 
        prev.map(item => item.id === id ? { ...item, is_available } : item)
      );
    };

    const handleMenuChanged = () => {
      fetch('/api/menu')
        .then(r => r.json())
        .then(data => {
          if (data.items) setMenuItems(data.items);
          if (data.categories) setCategories(data.categories);
        })
        .catch(() => {});
    };

    socket.on('new-order', handleNewOrder);
    socket.on('order-status-changed', handleStatusChanged);
    socket.on('stock-updated', handleStockUpdated);
    socket.on('menu-changed', handleMenuChanged);

    return () => {
      socket.off('new-order', handleNewOrder);
      socket.off('order-status-changed', handleStatusChanged);
      socket.off('stock-updated', handleStockUpdated);
      socket.off('menu-changed', handleMenuChanged);
    };
  }, [audioEnabled]);

  // Advance Order Status
  const advanceOrderStatus = async (orderId, currentStatus, paymentStatus) => {
    let nextStatus = 'PREPARING';
    if (currentStatus === 'PENDING') nextStatus = 'PREPARING';
    else if (currentStatus === 'PREPARING') nextStatus = 'READY';
    else if (currentStatus === 'READY') nextStatus = 'COMPLETED';

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, payment_status: paymentStatus }),
      });
      if (!res.ok) throw new Error('Status update failed');
    } catch (err) {
      console.error(err);
      alert('Error advancing order status');
    }
  };

  // Mark Cash as Paid
  const markPaymentPaid = async (orderId) => {
    try {
      await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: 'PAID' }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // 1-Tap Out of Stock Toggle
  const toggleStock = async (itemId) => {
    try {
      // Optimistic UI update
      setMenuItems(prev => prev.map(i => i.id === itemId ? { ...i, is_available: i.is_available === 1 ? 0 : 1 } : i));
      await fetch(`/api/menu/${itemId}/toggle-stock`, { method: 'PATCH' });
    } catch (err) {
      console.error(err);
      loadData();
    }
  };

  // Fast-POS Cart Helpers
  const addToPosCart = (item) => {
    setPosCart(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updatePosQty = (id, delta) => {
    setPosCart(prev => {
      return prev
        .map(i => i.id === id ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0);
    });
  };

  const posTotal = posCart.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  // Fast-POS 2-Tap Checkout (Cash or UPI)
  const submitPosOrder = async (payMethod) => {
    if (posCart.length === 0) return;
    setPosSubmitting(true);

    try {
      const payload = {
        customer_name: posCustomerName.trim() || 'Counter Walk-in',
        payment_method: payMethod,
        order_type: 'COUNTER',
        payment_status: 'PAID', // In-person walk-ins are marked paid upon billing
        items: posCart.map(item => ({
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
        const err = await res.json();
        alert(err.error || 'Failed to process POS order');
        return;
      }

      const orderData = await res.json();
      setPosLastPlacedToken(orderData.token_no);
      setPosCart([]);
      setPosCustomerName('');

      // Auto clear banner after 4 seconds
      setTimeout(() => setPosLastPlacedToken(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Error placing POS order');
    } finally {
      setPosSubmitting(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        alert('Settings updated successfully!');
      }
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Partition active orders for Kanban
  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  const preparingOrders = orders.filter(o => o.status === 'PREPARING');
  const readyOrders = orders.filter(o => o.status === 'READY');

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-100 p-3 sm:p-6 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* Top Summary Bar & Quick Stats */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
          {/* Daily Tally */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm">
            <div>
              <span className="text-slate-400 block font-medium">Today's Sales</span>
              <span className="text-xl sm:text-2xl font-black text-slate-900">
                ₹{stats?.total_sales || 0}
              </span>
            </div>
            <div className="h-8 w-[1px] bg-slate-200 hidden sm:block"></div>
            <div>
              <span className="text-slate-400 block font-medium">💵 Cash Sales</span>
              <span className="text-base sm:text-lg font-bold text-emerald-600">
                ₹{stats?.cash_sales || 0}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">⚡ UPI Sales</span>
              <span className="text-base sm:text-lg font-bold text-orange-600">
                ₹{stats?.upi_sales || 0}
              </span>
            </div>
            <div className="h-8 w-[1px] bg-slate-200 hidden sm:block"></div>
            <div>
              <span className="text-slate-400 block font-medium">Active Queue</span>
              <span className="text-base sm:text-lg font-bold text-slate-800">
                {orders.length} orders
              </span>
            </div>
          </div>

          {/* Audio Chime Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                playNewOrderSound();
              }}
              className="px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold text-xs border border-orange-200 flex items-center space-x-1.5 transition-colors"
              title="Test the chime sound"
            >
              <Bell className="w-3.5 h-3.5 text-orange-600" />
              <span>Test Chime</span>
            </button>

            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                audioEnabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-rose-50 text-rose-700 border-rose-300'
              }`}
              title="Toggle Audio Notifications"
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">{audioEnabled ? 'Sound ON' : 'Muted'}</span>
            </button>
          </div>
        </div>

        {/* Tab Controls Bar */}
        <div className="flex items-center justify-between bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-1.5 w-full sm:w-auto">
            <button
              onClick={() => setTab('queue')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
                tab === 'queue'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              <span>Delivery Queue</span>
              {orders.length > 0 && (
                <span className="px-2 py-0.2 rounded-full text-xs font-black bg-orange-500 text-white">
                  {orders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setTab('pos')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
                tab === 'pos'
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>⚡ Fast-POS</span>
            </button>

            <button
              onClick={() => setTab('stock')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
                tab === 'stock'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>1-Tap Stock</span>
            </button>

            <button
              onClick={() => setTab('settings')}
              className={`p-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                tab === 'settings'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Settings & UPI"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Refresh All Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* ================= VIEW 1: KITCHEN & DELIVERY QUEUE ================= */}
        {tab === 'queue' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            
            {/* COLUMN 1: PENDING / NEW ORDERS */}
            <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200 flex flex-col h-[calc(100vh-14rem)] min-h-[500px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
                  <h2 className="font-extrabold text-sm uppercase tracking-wide text-amber-900">
                    1. New Orders
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-900">
                  {pendingOrders.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {pendingOrders.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-amber-700/60 italic">
                    No new orders right now
                  </div>
                ) : (
                  pendingOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200 hover:shadow-md transition-shadow">
                      {/* Order Card Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xl font-black text-slate-900 font-mono-code bg-amber-100 px-2.5 py-0.5 rounded-xl border border-amber-300">
                              #{order.token_no}
                            </span>
                            <span className="text-xs font-semibold text-slate-700 truncate max-w-[120px]">
                              {order.customer_name}
                            </span>
                          </div>
                          {order.customer_desk && (
                            <span className="text-[11px] text-slate-400 block mt-1">
                              📍 {order.customer_desk}
                            </span>
                          )}
                        </div>

                        {/* Payment Status Badge */}
                        <div className="text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            order.payment_method === 'UPI'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {order.payment_method} • ₹{order.total_amount}
                          </span>
                          {order.payment_status === 'PENDING' && order.payment_method === 'CASH' && (
                            <button
                              onClick={() => markPaymentPaid(order.id)}
                              className="block mt-1 text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded"
                            >
                              Collect Cash
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="my-3 py-2 border-y border-slate-100 space-y-1">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-slate-800">
                            <span className="font-semibold">{item.quantity}x {item.item_name}</span>
                            <span className="text-slate-400">₹{item.total_price}</span>
                          </div>
                        ))}
                      </div>

                      {/* Progression Button */}
                      <button
                        onClick={() => advanceOrderStatus(order.id, 'PENDING', order.payment_status)}
                        className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center space-x-1.5"
                      >
                        <ChefHat className="w-4 h-4" />
                        <span>Start Preparing</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* COLUMN 2: PREPARING */}
            <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-200 flex flex-col h-[calc(100vh-14rem)] min-h-[500px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500 animate-spin"></span>
                  <h2 className="font-extrabold text-sm uppercase tracking-wide text-blue-900">
                    2. Kitchen Preparing
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-200 text-blue-900">
                  {preparingOrders.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {preparingOrders.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-blue-700/60 italic">
                    Nothing cooking currently
                  </div>
                ) : (
                  preparingOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm border border-blue-200 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xl font-black text-slate-900 font-mono-code bg-blue-100 px-2.5 py-0.5 rounded-xl border border-blue-300">
                              #{order.token_no}
                            </span>
                            <span className="text-xs font-semibold text-slate-700 truncate max-w-[120px]">
                              {order.customer_name}
                            </span>
                          </div>
                          {order.customer_desk && (
                            <span className="text-[11px] text-slate-400 block mt-1">
                              📍 {order.customer_desk}
                            </span>
                          )}
                        </div>

                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800">
                          ₹{order.total_amount}
                        </span>
                      </div>

                      {/* Items List */}
                      <div className="my-3 py-2 border-y border-slate-100 space-y-1">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-slate-800">
                            <span className="font-bold text-blue-950">{item.quantity}x {item.item_name}</span>
                            <span className="text-slate-400">₹{item.total_price}</span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => advanceOrderStatus(order.id, 'PREPARING', order.payment_status)}
                        className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center space-x-1.5"
                      >
                        <Bell className="w-4 h-4" />
                        <span>Ready for Pickup!</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* COLUMN 3: READY FOR PICKUP */}
            <div className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-200 flex flex-col h-[calc(100vh-14rem)] min-h-[500px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
                  <h2 className="font-extrabold text-sm uppercase tracking-wide text-emerald-900">
                    3. Counter Pickup (Ready)
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-200 text-emerald-900">
                  {readyOrders.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {readyOrders.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-emerald-700/60 italic">
                    No orders waiting at counter
                  </div>
                ) : (
                  readyOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl p-4 shadow-md border-2 border-emerald-400 hover:shadow-lg transition-shadow relative overflow-hidden">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-2xl font-black text-emerald-700 font-mono-code bg-emerald-100 px-3 py-1 rounded-xl border border-emerald-300 animate-pulse">
                              #{order.token_no}
                            </span>
                            <div>
                              <span className="text-xs font-bold text-slate-800 block">
                                {order.customer_name}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {order.order_type === 'COUNTER' ? 'Counter Walk-in' : 'Mobile Order'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Cash Reminder Warning if unpaid */}
                        {order.payment_method === 'CASH' && order.payment_status === 'PENDING' ? (
                          <button
                            onClick={() => markPaymentPaid(order.id)}
                            className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-900 text-xs font-black shadow-sm flex items-center space-x-1"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>Collect ₹{order.total_amount}</span>
                          </button>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            Paid ₹{order.total_amount}
                          </span>
                        )}
                      </div>

                      {/* Items List */}
                      <div className="my-3 py-2 border-y border-slate-100 space-y-1">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-slate-800">
                            <span className="font-bold">{item.quantity}x {item.item_name}</span>
                            <span className="text-slate-400">₹{item.total_price}</span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => advanceOrderStatus(order.id, 'READY', 'PAID')}
                        className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Hand Over Food (Done)</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* ================= VIEW 2: FAST-POS (2-TAP COUNTER BILLING) ================= */}
        {tab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: Quick Item Buttons */}
            <div className="lg:col-span-2 space-y-4">
              {/* Category Pills */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-2 no-scrollbar">
                <button
                  onClick={() => setPosCategory('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    posCategory === 'ALL'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  All Items
                </button>
                {categories.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setPosCategory(c.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      String(posCategory) === String(c.id)
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* Big Touch Item Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {menuItems
                  .filter(i => posCategory === 'ALL' || String(i.category_id) === String(posCategory))
                  .map(item => {
                    const isAvailable = item.is_available === 1;
                    return (
                      <button
                        key={item.id}
                        disabled={!isAvailable}
                        onClick={() => addToPosCart(item)}
                        className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 active:scale-95 transition-all shadow-sm ${
                          !isAvailable
                            ? 'opacity-40 bg-slate-100 border-slate-200 cursor-not-allowed'
                            : 'bg-white hover:border-orange-400 hover:shadow-md border-slate-200/90'
                        }`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <span className="text-2xl select-none">{item.image_emoji || '🍲'}</span>
                          <span className="font-extrabold text-sm text-slate-900">₹{item.price}</span>
                        </div>
                        <div>
                          <p className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-1 leading-tight">
                            {item.name}
                          </p>
                          <span className="text-[10px] text-slate-400 block">{item.category_name}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Right: POS Ticket & 2-Tap Payment */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-lg flex flex-col h-[calc(100vh-14rem)] min-h-[500px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5 text-orange-500" />
                  <h3 className="font-extrabold text-base text-slate-900">Current Ticket</h3>
                </div>
                {posCart.length > 0 && (
                  <button 
                    onClick={() => setPosCart([])}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Pos Token Success Notification */}
              {posLastPlacedToken && (
                <div className="my-2 p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center space-x-3 animate-slide-up">
                  <Check className="w-5 h-5 text-emerald-600 stroke-[3]" />
                  <div>
                    <span className="text-xs font-bold text-emerald-900 block">Order Placed!</span>
                    <span className="text-lg font-black text-emerald-700 font-mono-code">Token #{posLastPlacedToken}</span>
                  </div>
                </div>
              )}

              {/* Ticket Items */}
              <div className="flex-1 overflow-y-auto py-3 space-y-2">
                {posCart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
                    <p className="text-sm font-semibold">Ticket is empty</p>
                    <p className="text-xs mt-1">Tap items on the left to add to bill.</p>
                  </div>
                ) : (
                  posCart.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-bold text-xs text-slate-800 truncate">{item.name}</p>
                        <p className="text-[11px] text-slate-400">₹{item.price} each</p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => updatePosQty(item.id, -1)}
                          className="w-6 h-6 rounded bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <span className="text-xs font-black min-w-[16px] text-center">{item.quantity}</span>
                        <button
                          onClick={() => updatePosQty(item.id, 1)}
                          className="w-6 h-6 rounded bg-orange-500 text-white flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                        <span className="text-xs font-black text-slate-900 min-w-[45px] text-right">
                          ₹{item.price * item.quantity}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Walk-in Customer Label Input */}
              <div className="pt-3 border-t border-slate-100">
                <input
                  type="text"
                  placeholder="Customer Name / Token Note (Optional)"
                  value={posCustomerName}
                  onChange={(e) => setPosCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none mb-3"
                />

                {/* Total */}
                <div className="flex items-center justify-between mb-3 text-slate-900">
                  <span className="font-semibold text-sm">Bill Amount</span>
                  <span className="text-2xl font-black">₹{posTotal}</span>
                </div>

                {/* 2-Tap Payment Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={posCart.length === 0 || posSubmitting}
                    onClick={() => submitPosOrder('CASH')}
                    className="py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition-all flex flex-col items-center justify-center"
                  >
                    <span>💵 CASH</span>
                    <span className="text-[10px] font-normal opacity-90">Collect ₹{posTotal}</span>
                  </button>

                  <button
                    disabled={posCart.length === 0 || posSubmitting}
                    onClick={() => submitPosOrder('UPI')}
                    className="py-3 px-3 rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-orange-500/20 transition-all flex flex-col items-center justify-center"
                  >
                    <span>⚡ UPI QR</span>
                    <span className="text-[10px] font-normal opacity-90">Paid ₹{posTotal}</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ================= VIEW 3: 1-TAP "86" STOCK & MENU MANAGER ================= */}
        {tab === 'stock' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                  <Package className="w-5 h-5 text-orange-500" />
                  <span>Menu & Stock Manager</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Edit name, price, category, or tap "Sold Out" to update customer phones live.
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-bold text-slate-500 hidden sm:inline">
                  {menuItems.filter(i => i.is_available === 1).length} / {menuItems.length} Available
                </span>
                <button
                  onClick={() => setShowAddItemModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-md shadow-orange-500/20 flex items-center space-x-1.5 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Menu Item</span>
                </button>
              </div>
            </div>

            {/* Search & Category Filter Pills */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search item to edit or toggle stock..."
                  value={stockSearchQuery}
                  onChange={(e) => setStockSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
                {stockSearchQuery && (
                  <button 
                    onClick={() => setStockSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  onClick={() => setStockCategoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    stockCategoryFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({menuItems.length})
                </button>
                {categories.map(c => {
                  const count = menuItems.filter(i => String(i.category_id) === String(c.id)).length;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setStockCategoryFilter(String(c.id))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        String(stockCategoryFilter) === String(c.id)
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {c.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grid of Menu Items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {menuItems
                .filter(item => {
                  const matchesCat = stockCategoryFilter === 'ALL' || String(item.category_id) === String(stockCategoryFilter);
                  const q = (stockSearchQuery || '').toLowerCase().trim();
                  const matchesSearch = !q || (item.name || '').toLowerCase().includes(q) || (item.category_name || '').toLowerCase().includes(q);
                  return matchesCat && matchesSearch;
                })
                .map(item => {
                  const isAvailable = item.is_available === 1;
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                        isAvailable
                          ? 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
                          : 'bg-rose-50/50 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className="text-2xl shrink-0">{item.image_emoji || '🍲'}</span>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            {item.is_veg === 1 ? (
                              <span className="w-2.5 h-2.5 rounded-sm border border-emerald-600 bg-white flex items-center justify-center p-0.5 shrink-0" title="Veg">
                                <span className="w-1 h-1 rounded-full bg-emerald-600"></span>
                              </span>
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-sm border border-rose-600 bg-white flex items-center justify-center p-0.5 shrink-0" title="Non-Veg">
                                <span className="w-1 h-1 rounded-full bg-rose-600"></span>
                              </span>
                            )}
                            <p className="font-bold text-sm text-slate-900 truncate">{item.name}</p>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 font-medium">
                            <span className="font-bold text-slate-800">₹{item.price}</span> • <span className="text-slate-400">{item.category_name || 'Item'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          onClick={() => startEditItem(item)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 transition-colors text-xs font-bold flex items-center gap-1 active:scale-95"
                          title="Edit Name, Price, Category"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-orange-600" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => toggleStock(item.id)}
                          className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all shadow-sm active:scale-95 ${
                            isAvailable
                              ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                              : 'bg-rose-600 hover:bg-rose-700 text-white'
                          }`}
                        >
                          {isAvailable ? 'In Stock' : 'SOLD OUT'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ================= VIEW 4: SETTINGS & CLOSING ================= */}
        {tab === 'settings' && (
          <div className="max-w-2xl mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <Settings className="w-5 h-5 text-orange-500" />
                <span>Canteen & UPI Configuration</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure your UPI VPA to receive mobile order payments directly into your bank account.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Canteen Name
                </label>
                <input
                  type="text"
                  value={settings.canteen_name}
                  onChange={(e) => setSettings({ ...settings, canteen_name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Merchant UPI ID (VPA) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. yourname@okaxis or canteen@upi"
                  value={settings.upi_id}
                  onChange={(e) => setSettings({ ...settings, upi_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  All customer scan-to-pay QR codes will route payments directly to this UPI ID.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Merchant Display Name
                </label>
                <input
                  type="text"
                  value={settings.upi_name}
                  onChange={(e) => setSettings({ ...settings, upi_name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={settingsSaving}
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm shadow-md transition-all"
              >
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Plus className="w-5 h-5 text-orange-400" />
                  <h3 className="font-bold text-base">Add New Menu Item</h3>
                </div>
                <button 
                  onClick={() => setShowAddItemModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddItem} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Item Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chicken Dum Biryani / Egg Roll"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Category *
                    </label>
                    <select
                      value={newItem.category_id}
                      onChange={(e) => setNewItem({ ...newItem, category_id: parseInt(e.target.value, 10) })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      placeholder="e.g. 120"
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Diet Type Selector (Veg vs Non-Veg) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Food Type (Diet) *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewItem({ ...newItem, is_veg: 1 })}
                      className={`p-3 rounded-xl border flex items-center justify-center space-x-2 font-bold text-xs transition-all ${
                        newItem.is_veg === 1
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-sm border border-emerald-600 bg-white flex items-center justify-center p-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      </span>
                      <span>Pure Veg 🟢</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewItem({ ...newItem, is_veg: 0 })}
                      className={`p-3 rounded-xl border flex items-center justify-center space-x-2 font-bold text-xs transition-all ${
                        newItem.is_veg === 0
                          ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-sm border border-rose-600 bg-white flex items-center justify-center p-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                      </span>
                      <span>Non-Veg 🔴</span>
                    </button>
                  </div>
                </div>

                {/* Emoji Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Select Icon Emoji
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['🍗', '🍳', '🌯', '🥪', '🍛', '🥘', '🍜', '🥟', '🥞', '☕', '🥤', '🍨', '🍱', '🍔', '🍕'].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewItem({ ...newItem, image_emoji: emoji })}
                        className={`w-9 h-9 text-lg rounded-xl flex items-center justify-center transition-all ${
                          newItem.image_emoji === emoji
                            ? 'bg-orange-100 border-2 border-orange-500 scale-110 shadow-sm'
                            : 'bg-slate-100 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Short Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Served with hot spicy gravy and raita"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="quickItemCheck"
                    checked={newItem.is_quick_item === 1}
                    onChange={(e) => setNewItem({ ...newItem, is_quick_item: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                  />
                  <label htmlFor="quickItemCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Show as Fast-POS quick button on operator screen
                  </label>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingItem}
                    className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition-all"
                  >
                    {addingItem ? 'Adding...' : 'Add to Menu'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Menu Item Modal */}
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <Edit2 className="w-5 h-5 text-orange-400" />
                  <h3 className="font-bold text-base">Edit Menu Item</h3>
                </div>
                <button 
                  onClick={() => setEditingItem(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateItem} className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Item Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Masala Dosa"
                      value={editItemForm.name}
                      onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Category *
                    </label>
                    <select
                      value={editItemForm.category_id}
                      onChange={(e) => setEditItemForm({ ...editItemForm, category_id: parseInt(e.target.value, 10) })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      placeholder="e.g. 50"
                      value={editItemForm.price}
                      onChange={(e) => setEditItemForm({ ...editItemForm, price: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Diet Type Selector (Veg vs Non-Veg) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Food Type (Diet) *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditItemForm({ ...editItemForm, is_veg: 1 })}
                      className={`p-3 rounded-xl border flex items-center justify-center space-x-2 font-bold text-xs transition-all ${
                        editItemForm.is_veg === 1
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-sm border border-emerald-600 bg-white flex items-center justify-center p-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      </span>
                      <span>Pure Veg 🟢</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditItemForm({ ...editItemForm, is_veg: 0 })}
                      className={`p-3 rounded-xl border flex items-center justify-center space-x-2 font-bold text-xs transition-all ${
                        editItemForm.is_veg === 0
                          ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-sm border border-rose-600 bg-white flex items-center justify-center p-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                      </span>
                      <span>Non-Veg 🔴</span>
                    </button>
                  </div>
                </div>

                {/* Emoji Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Select Icon Emoji
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['🍲', '🍗', '🍳', '🌯', '🥪', '🍛', '🥘', '🍜', '🥟', '🥞', '☕', '🥤', '🍨', '🍱', '🍔', '🍕', '🥗', '🍩', '🍪'].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditItemForm({ ...editItemForm, image_emoji: emoji })}
                        className={`w-9 h-9 text-lg rounded-xl flex items-center justify-center transition-all ${
                          editItemForm.image_emoji === emoji
                            ? 'bg-orange-100 border-2 border-orange-500 scale-110 shadow-sm'
                            : 'bg-slate-100 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Short Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Served hot with fresh chutney and sambar"
                    value={editItemForm.description}
                    onChange={(e) => setEditItemForm({ ...editItemForm, description: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="editQuickItemCheck"
                    checked={editItemForm.is_quick_item === 1}
                    onChange={(e) => setEditItemForm({ ...editItemForm, is_quick_item: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                  />
                  <label htmlFor="editQuickItemCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Show as Fast-POS quick button on operator screen
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={deletingItem}
                    onClick={() => handleDeleteItem(editingItem.id)}
                    className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs flex items-center gap-1.5 transition-colors border border-rose-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingItem ? 'Deleting...' : 'Delete Item'}</span>
                  </button>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updatingItem}
                      className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition-all flex items-center gap-1.5"
                    >
                      {updatingItem ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
