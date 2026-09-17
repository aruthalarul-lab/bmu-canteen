import React, { useState, useEffect } from 'react';
import { 
  Bell, Volume2, VolumeX, CheckCircle, Clock, ChefHat, 
  Package, DollarSign, QrCode, RefreshCw, AlertTriangle, 
  Trash2, Plus, Minus, ArrowRight, Settings, Check, X, ShieldAlert,
  Flame, Sparkles, TrendingUp, CreditCard, Edit2, Search,
  Lock, Unlock, BookOpen, FileText, Users, Printer, Download, Upload
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
    operator_pin: '1513',
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Operator Security PIN State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('bmu_operator_auth') === 'true';
  });
  const [operatorPin, setOperatorPin] = useState(() => {
    return sessionStorage.getItem('bmu_operator_pin') || '1513';
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Authenticated fetch helper for operator actions
  const operatorFetch = (url, options = {}) => {
    const pin = operatorPin || sessionStorage.getItem('bmu_operator_pin') || '1513';
    const headers = {
      ...(options.headers || {}),
      'x-operator-pin': pin,
    };
    return fetch(url, { ...options, headers });
  };

  // Credit Ledger State
  const [creditAccounts, setCreditAccounts] = useState([]);
  const [creditStats, setCreditStats] = useState({ total_due: 0, active_debtors: 0, settled_week: 0 });
  const [creditSearch, setCreditSearch] = useState('');
  const [creditViewMode, setCreditViewMode] = useState('table'); // 'table' or 'cards'
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [ledgerDetail, setLedgerDetail] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreModal, setRestoreModal] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Settlement Modal State
  const [showSettleModal, setShowSettleModal] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('CASH');
  const [settleNotes, setSettleNotes] = useState('');
  const [settling, setSettling] = useState(false);

  // Add Customer Modal State
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ customer_name: '', department: '', phone: '', desk: '', notes: '' });
  const [addingCustomer, setAddingCustomer] = useState(false);

  // QR Standee Modal State
  const [showQrStandeeModal, setShowQrStandeeModal] = useState(false);

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
      const res = await operatorFetch('/api/menu', {
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
      const res = await operatorFetch(`/api/menu/${editingItem.id}`, {
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
      const res = await operatorFetch(`/api/menu/${itemId}`, { method: 'DELETE' });
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

  // PIN Verification & Lock Actions
  const handleVerifyPin = async (e) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) return;
    setVerifyingPin(true);
    setPinError('');
    try {
      const res = await fetch('/api/operator/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const pinVal = pinInput.trim();
        sessionStorage.setItem('bmu_operator_auth', 'true');
        sessionStorage.setItem('bmu_operator_pin', pinVal);
        setOperatorPin(pinVal);
        setIsAuthenticated(true);
        setPinInput('');
      } else {
        setPinError(data.error || 'Incorrect PIN');
        setPinInput('');
      }
    } catch (err) {
      setPinError('Connection error verifying PIN');
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleLockConsole = () => {
    sessionStorage.removeItem('bmu_operator_auth');
    sessionStorage.removeItem('bmu_operator_pin');
    setOperatorPin('');
    setIsAuthenticated(false);
    setPinInput('');
  };

  // Credit Ledger Actions
  const loadCreditData = async () => {
    try {
      const [accRes, statsRes] = await Promise.all([
        fetch('/api/credit/accounts'),
        fetch('/api/credit/stats'),
      ]);
      if (accRes.ok) setCreditAccounts(await accRes.json());
      if (statsRes.ok) setCreditStats(await statsRes.json());
    } catch (err) {
      console.error('Failed to load credit data:', err);
    }
  };

  const viewCustomerLedger = async (customerName) => {
    setSelectedLedger(customerName);
    setLoadingLedger(true);
    try {
      const res = await fetch(`/api/credit/accounts/${encodeURIComponent(customerName)}`);
      if (res.ok) {
        setLedgerDetail(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleSettleSubmit = async (e) => {
    e.preventDefault();
    if (!showSettleModal || !settleAmount || parseFloat(settleAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    setSettling(true);
    try {
      const res = await operatorFetch('/api/credit/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: showSettleModal.customer_name,
          amount: parseFloat(settleAmount),
          payment_method: settleMethod,
          notes: settleNotes,
        })
      });
      if (res.ok) {
        await loadCreditData();
        if (selectedLedger === showSettleModal.customer_name) {
          viewCustomerLedger(showSettleModal.customer_name);
        }
        setShowSettleModal(null);
        setSettleAmount('');
        setSettleNotes('');
        alert(`Payment of ₹${settleAmount} recorded successfully!`);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to record settlement');
      }
    } catch (err) {
      alert('Error recording settlement');
    } finally {
      setSettling(false);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.customer_name.trim()) {
      alert('Please enter Employee / Customer Name');
      return;
    }
    setAddingCustomer(true);
    try {
      const res = await operatorFetch('/api/credit/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomer)
      });
      if (res.ok) {
        await loadCreditData();
        setShowAddCustomerModal(false);
        setNewCustomer({ customer_name: '', department: '', phone: '', desk: '', notes: '' });
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add customer');
      }
    } catch (err) {
      alert('Error adding customer');
    } finally {
      setAddingCustomer(false);
    }
  };

  // Download Credit Ledger Backup as JSON
  const handleDownloadBackup = async () => {
    try {
      setBackupLoading(true);
      const res = await operatorFetch('/api/credit/backup');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate backup');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `credit_ledger_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Backup failed: ' + e.message);
    } finally {
      setBackupLoading(false);
    }
  };

  // Export Credit Ledger as CSV for Excel
  const handleExportCsv = () => {
    try {
      if (!creditAccounts || creditAccounts.length === 0) {
        alert('No credit accounts to export.');
        return;
      }
      const headers = ['Customer Name', 'Department', 'Phone Number', 'Due Amount (Rs)', 'Unpaid Orders', 'Notes', 'Last Order Date'];
      const rows = creditAccounts.map(acc => [
        `"${(acc.customer_name || '').replace(/"/g, '""')}"`,
        `"${(acc.department || acc.desk || 'General').replace(/"/g, '""')}"`,
        `"${(acc.phone || '').replace(/"/g, '""')}"`,
        (acc.balance || 0).toFixed(2),
        acc.unpaid_orders_count || 0,
        `"${(acc.notes || '').replace(/"/g, '""')}"`,
        `"${acc.last_order_date || ''}"`
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `credit_ledger_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('CSV Export failed: ' + e.message);
    }
  };

  // Handle file chosen for JSON restore
  const handleFileSelectedForRestore = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const accounts = Array.isArray(parsed) ? parsed : (parsed.credit_accounts || []);
        if (!accounts || accounts.length === 0) {
          alert('Invalid backup file: No credit accounts found in the file.');
          return;
        }
        const totalBalance = accounts.reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
        setRestoreModal({
          fileName: file.name,
          accountsCount: accounts.length,
          totalDue: totalBalance,
          data: parsed
        });
      } catch (err) {
        alert('Invalid JSON file format. Please upload a valid .json backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Confirm and execute Restore
  const handleConfirmRestore = async () => {
    if (!restoreModal) return;
    setRestoring(true);
    try {
      const res = await operatorFetch('/api/credit/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restoreModal.data)
      });
      const result = await res.json();
      if (res.ok) {
        await loadCreditData();
        setRestoreModal(null);
        alert(`Restore Complete!\n${result.message || 'Credit accounts updated successfully.'}`);
      } else {
        alert('Restore Failed: ' + (result.error || 'Server rejected the backup data.'));
      }
    } catch (err) {
      alert('Error restoring backup: ' + err.message);
    } finally {
      setRestoring(false);
    }
  };

  // Load Initial Data
  const loadData = async () => {
    try {
      const [ordersRes, statsRes, menuRes, settingsRes, creditAccRes, creditStatsRes] = await Promise.all([
        fetch('/api/orders/active'),
        fetch('/api/orders/stats'),
        fetch('/api/menu'),
        fetch('/api/settings'),
        fetch('/api/credit/accounts'),
        fetch('/api/credit/stats'),
      ]);

      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (menuRes.ok) {
        const menuData = await menuRes.json();
        setMenuItems(menuData.items || []);
        setCategories(menuData.categories || []);
      }
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (creditAccRes.ok) setCreditAccounts(await creditAccRes.json());
      if (creditStatsRes.ok) setCreditStats(await creditStatsRes.json());
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
    socket.on('credit-updated', loadCreditData);

    return () => {
      socket.off('new-order', handleNewOrder);
      socket.off('order-status-changed', handleStatusChanged);
      socket.off('stock-updated', handleStockUpdated);
      socket.off('menu-changed', handleMenuChanged);
      socket.off('credit-updated', loadCreditData);
    };
  }, [audioEnabled]);

  // Advance Order Status
  const advanceOrderStatus = async (orderId, currentStatus, paymentStatus) => {
    let nextStatus = 'PREPARING';
    if (currentStatus === 'PENDING') nextStatus = 'PREPARING';
    else if (currentStatus === 'PREPARING') nextStatus = 'READY';
    else if (currentStatus === 'READY') nextStatus = 'COMPLETED';

    try {
      const res = await operatorFetch(`/api/orders/${orderId}/status`, {
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

  // 1-Click Order Cancellation
  const cancelOrder = async (orderId, tokenNo) => {
    if (!window.confirm(`Are you sure you want to cancel Token #${tokenNo}? This will immediately remove it from active queue.`)) return;
    try {
      const res = await operatorFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (!res.ok) throw new Error('Failed to cancel order');
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (err) {
      console.error(err);
      alert('Error cancelling order');
    }
  };

  // Mark Cash as Paid
  const markPaymentPaid = async (orderId) => {
    try {
      await operatorFetch(`/api/orders/${orderId}/status`, {
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
      await operatorFetch(`/api/menu/${itemId}/toggle-stock`, { method: 'PATCH' });
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

  // Fast-POS Checkout (Cash, UPI, or Credit)
  const submitPosOrder = async (payMethod, overrideName) => {
    if (posCart.length === 0) return;
    setPosSubmitting(true);

    try {
      const finalName = overrideName || posCustomerName.trim() || (payMethod === 'CREDIT' ? 'Credit Staff' : 'Counter Walk-in');
      const payload = {
        customer_name: finalName,
        customer_desk: 'Counter 1 POS',
        payment_method: payMethod,
        order_type: 'COUNTER',
        payment_status: payMethod === 'CREDIT' ? 'PENDING' : 'PAID',
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

      if (payMethod === 'CREDIT') {
        loadCreditData();
      }

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
      const res = await operatorFetch('/api/settings', {
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
  const unconfirmedCashOrders = orders.filter(o => o.payment_method === 'CASH' && o.payment_status === 'PENDING' && o.status !== 'CANCELLED');
  const pendingOrders = orders.filter(o => o.status === 'PENDING' && o.status !== 'CANCELLED' && (o.payment_status === 'PAID' || o.payment_method === 'CREDIT'));
  const preparingOrders = orders.filter(o => o.status === 'PREPARING' && o.status !== 'CANCELLED');
  const readyOrders = orders.filter(o => o.status === 'READY' && o.status !== 'CANCELLED');

  // If not authenticated, show Operator PIN Gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-900 text-white">
        <div className="bg-slate-800 w-full max-w-sm rounded-3xl p-6 sm:p-8 border border-slate-700 shadow-2xl space-y-6 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center mx-auto shadow-lg shadow-orange-500/30">
            <Lock className="w-8 h-8 text-white" />
          </div>

          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Staff Only Console</h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter 4-digit security PIN to access kitchen dispatch & cashier POS.
            </p>
          </div>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div className="flex justify-center">
              <input
                type="password"
                maxLength={4}
                autoFocus
                placeholder="••••"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-44 text-center tracking-[0.6em] text-3xl font-black py-3 rounded-2xl bg-slate-900 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {pinError && (
              <p className="text-xs font-semibold text-rose-400 bg-rose-950/50 py-1.5 px-3 rounded-xl border border-rose-800/50">
                {pinError}
              </p>
            )}

            {/* Quick 10-Key Pad for Touchscreens */}
            <div className="grid grid-cols-3 gap-2 pt-1 max-w-[240px] mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => pinInput.length < 4 && setPinInput(prev => prev + num)}
                  className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 font-bold text-lg text-white transition-all shadow-sm"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="py-3 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-400 font-bold text-xs transition-all"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pinInput.length < 4 && setPinInput(prev => prev + '0')}
                className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 font-bold text-lg text-white transition-all shadow-sm"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinInput(prev => prev.slice(0, -1))}
                className="py-3 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-400 font-bold text-xs transition-all"
              >
                ⌫
              </button>
            </div>

            <button
              type="submit"
              disabled={verifyingPin || pinInput.length === 0}
              className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-orange-500/25 transition-all"
            >
              {verifyingPin ? 'Verifying...' : 'Unlock Operator Console'}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-700/60">
            <button
              onClick={() => window.location.href = '/'}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              ← Back to Customer Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              <span className="text-slate-400 block font-medium">💵 Cash</span>
              <span className="text-base sm:text-lg font-bold text-emerald-600">
                ₹{stats?.cash_sales || 0}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">⚡ UPI</span>
              <span className="text-base sm:text-lg font-bold text-orange-600">
                ₹{stats?.upi_sales || 0}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">📋 Weekly Credit Due</span>
              <span className="text-base sm:text-lg font-bold text-indigo-600">
                ₹{creditStats?.total_due || 0}
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

          {/* Audio Chime & Console Lock Controls */}
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

            <button
              onClick={handleLockConsole}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 font-semibold text-xs border border-slate-200 flex items-center space-x-1.5 transition-colors"
              title="Lock Console (Staff Logout)"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
          </div>
        </div>

        {/* Tab Controls Bar */}
        <div className="flex items-center justify-between bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <div className="flex items-center space-x-1.5 min-w-max">
            <button
              onClick={() => setTab('queue')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
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
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
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
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
                tab === 'stock'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Menu & Stock</span>
            </button>

            <button
              onClick={() => setTab('credit')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
                tab === 'credit'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Weekly Credit</span>
              {creditStats.total_due > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                  ₹{creditStats.total_due}
                </span>
              )}
            </button>

            <button
              onClick={() => setTab('settings')}
              className={`p-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                tab === 'settings'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Settings & PIN"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowQrStandeeModal(true)}
              className="p-2 rounded-xl text-xs sm:text-sm font-bold text-orange-600 hover:bg-orange-50 transition-all flex items-center gap-1.5"
              title="Print Table & Counter QR Standee"
            >
              <QrCode className="w-4 h-4 text-orange-500" />
              <span className="hidden lg:inline text-xs font-bold">QR Standee</span>
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0 ml-2"
            title="Refresh All Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* ================= VIEW 1: KITCHEN & DELIVERY QUEUE ================= */}
        {tab === 'queue' && (
          <div className="space-y-4 sm:space-y-6">
            
            {/* UNCONFIRMED CASH ORDERS AWAITING COLLECTION AT COUNTER 1 */}
            {unconfirmedCashOrders.length > 0 && (
              <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-4 sm:p-5 text-white shadow-xl border border-amber-300 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-white animate-ping"></span>
                    <h2 className="font-black text-sm sm:text-base uppercase tracking-wider text-white flex items-center gap-2">
                      <span>💵 Cash Payment Required at Counter 1</span>
                      <span className="bg-white text-orange-700 px-2 py-0.5 rounded-full text-xs font-black">
                        {unconfirmedCashOrders.length} Waiting to Pay
                      </span>
                    </h2>
                  </div>
                  <span className="text-xs text-amber-100 font-semibold hidden md:inline">
                    Collect cash ➔ Tap "Confirm Cash Received" ➔ Moves to kitchen queue
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {unconfirmedCashOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl p-4 text-slate-900 shadow-md border-2 border-amber-300 flex flex-col justify-between hover:shadow-lg transition-all">
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="text-2xl font-black text-amber-700 font-mono-code bg-amber-100 px-2.5 py-1 rounded-xl border border-amber-300">
                              #{order.token_no}
                            </span>
                            <div>
                              <span className="text-sm font-bold text-slate-900 block truncate max-w-[130px]">
                                {order.customer_name}
                              </span>
                              <span className="text-xs text-slate-500 block">
                                🆔 {order.customer_desk}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-base font-black text-emerald-700 block">
                              ₹{order.total_amount}
                            </span>
                            <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded uppercase">
                              Unpaid Cash
                            </span>
                          </div>
                        </div>

                        {/* Order Items */}
                        <div className="my-2.5 py-1.5 border-y border-slate-100 space-y-1">
                          {order.items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-slate-700">
                              <span className="font-semibold">{item.quantity}x {item.item_name}</span>
                              <span className="text-slate-400">₹{item.total_price}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Cashier Action Buttons */}
                      <div className="flex items-center gap-2 mt-2 pt-1">
                        <button
                          onClick={() => cancelOrder(order.id, order.token_no)}
                          className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-all flex items-center justify-center gap-1 shrink-0"
                          title="Cancel Order"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                        <button
                          onClick={() => markPaymentPaid(order.id)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>Confirm Cash Received (₹{order.total_amount})</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                            <span className="text-[11px] text-slate-600 font-medium block mt-1">
                              🆔 {order.customer_desk}
                            </span>
                          )}
                          {order.customer_phone && (
                            <span className="text-[11px] text-indigo-700 font-medium block">
                              📞 {order.customer_phone}
                            </span>
                          )}
                          {order.payment_method === 'CREDIT' && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              📋 Staff Credit Tab
                            </span>
                          )}
                          {order.customer_utr && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono-code font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              UTR: {order.customer_utr}
                            </span>
                          )}
                        </div>

                        {/* Payment Status Badge */}
                        <div className="text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            order.payment_method === 'UPI'
                              ? 'bg-orange-100 text-orange-800'
                              : order.payment_method === 'CREDIT'
                              ? 'bg-indigo-100 text-indigo-800'
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

                      {/* Progression & Cancel Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => cancelOrder(order.id, order.token_no)}
                          className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-all flex items-center justify-center gap-1 shrink-0"
                          title="Cancel Order"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                        <button
                          onClick={() => advanceOrderStatus(order.id, 'PENDING', order.payment_status)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center space-x-1.5"
                        >
                          <ChefHat className="w-4 h-4" />
                          <span>Start Preparing</span>
                        </button>
                      </div>
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
                            <span className="text-[11px] text-slate-600 font-medium block mt-1">
                              🆔 {order.customer_desk}
                            </span>
                          )}
                          {order.customer_phone && (
                            <span className="text-[11px] text-indigo-700 font-medium block">
                              📞 {order.customer_phone}
                            </span>
                          )}
                          {order.payment_method === 'CREDIT' && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              📋 Staff Credit Tab
                            </span>
                          )}
                          {order.customer_utr && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono-code font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              UTR: {order.customer_utr}
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

                      {/* Progression & Cancel Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => cancelOrder(order.id, order.token_no)}
                          className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-all flex items-center justify-center gap-1 shrink-0"
                          title="Cancel Order"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                        <button
                          onClick={() => advanceOrderStatus(order.id, 'PREPARING', order.payment_status)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center space-x-1.5"
                        >
                          <Bell className="w-4 h-4" />
                          <span>Ready for Pickup!</span>
                        </button>
                      </div>
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
                          {order.customer_desk && (
                            <span className="text-[11px] text-slate-600 font-medium block mt-1">
                              🆔 {order.customer_desk}
                            </span>
                          )}
                          {order.customer_phone && (
                            <span className="text-[11px] text-indigo-700 font-medium block">
                              📞 {order.customer_phone}
                            </span>
                          )}
                          {order.payment_method === 'CREDIT' && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              📋 Staff Credit Tab
                            </span>
                          )}
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

                      {/* Progression & Cancel Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => cancelOrder(order.id, order.token_no)}
                          className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-all flex items-center justify-center gap-1 shrink-0"
                          title="Cancel Order"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                        <button
                          onClick={() => advanceOrderStatus(order.id, 'READY', 'PAID')}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Hand Over Food (Done)</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
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

                {/* 3-Tap Payment Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    disabled={posCart.length === 0 || posSubmitting}
                    onClick={() => submitPosOrder('CASH')}
                    className="py-3 px-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition-all flex flex-col items-center justify-center"
                  >
                    <span>💵 CASH</span>
                    <span className="text-[10px] font-normal opacity-90">Collect ₹{posTotal}</span>
                  </button>

                  <button
                    disabled={posCart.length === 0 || posSubmitting}
                    onClick={() => submitPosOrder('UPI')}
                    className="py-3 px-2 rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-orange-500/20 transition-all flex flex-col items-center justify-center"
                  >
                    <span>⚡ UPI QR</span>
                    <span className="text-[10px] font-normal opacity-90">Paid ₹{posTotal}</span>
                  </button>

                  <button
                    disabled={posCart.length === 0 || posSubmitting}
                    onClick={() => {
                      if (!posCustomerName.trim()) {
                        const name = prompt('Enter Staff Member Name for Weekly Credit:');
                        if (!name || !name.trim()) return;
                        submitPosOrder('CREDIT', name.trim());
                      } else {
                        submitPosOrder('CREDIT', posCustomerName.trim());
                      }
                    }}
                    className="py-3 px-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-indigo-600/20 transition-all flex flex-col items-center justify-center"
                  >
                    <span>📋 CREDIT</span>
                    <span className="text-[10px] font-normal opacity-90">Weekly Tab</span>
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

        {/* ================= VIEW 4: WEEKLY CREDIT LEDGER ================= */}
        {tab === 'credit' && (
          <div className="space-y-6 animate-fade-in">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Total Credit Due
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-rose-600">
                    ₹{creditStats.total_due || 0}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Uncollected weekly dues
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-inner">
                  <DollarSign className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Staff With Dues
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">
                    {creditStats.active_debtors || 0}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Accounts with active balance
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                  <Users className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Settled Past 7 Days
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-emerald-600">
                    ₹{creditStats.settled_week || 0}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Total weekly collections
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <CheckCircle className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Account List & Filter Bar */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                    <span>Weekly Credit Accounts (Credit Ledger)</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Track staff credit accounts by name, department, phone number, and due amounts.
                  </p>
                </div>

                {/* Action Buttons: Download Backup, Upload Backup, Export CSV, Register */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    id="creditBackupFileInput"
                    accept=".json"
                    onChange={handleFileSelectedForRestore}
                    className="hidden"
                  />

                  <button
                    onClick={handleDownloadBackup}
                    disabled={backupLoading}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-200"
                    title="Download complete JSON backup of credit ledger"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{backupLoading ? 'Exporting...' : 'Download Backup'}</span>
                  </button>

                  <button
                    onClick={() => document.getElementById('creditBackupFileInput').click()}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-200"
                    title="Upload and restore a JSON backup of credit ledger"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Upload Backup</span>
                  </button>

                  <button
                    onClick={handleExportCsv}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-200"
                    title="Export customer credit balances to CSV for Excel"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-600" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={() => setShowAddCustomerModal(true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center space-x-1.5 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register Staff Member</span>
                  </button>
                </div>
              </div>

              {/* Search & View Mode Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search staff by name, department, or phone number..."
                    value={creditSearch}
                    onChange={(e) => setCreditSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                  />
                  {creditSearch && (
                    <button 
                      onClick={() => setCreditSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 self-end sm:self-auto bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    onClick={() => setCreditViewMode('table')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      creditViewMode === 'table'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Table View
                  </button>
                  <button
                    onClick={() => setCreditViewMode('cards')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      creditViewMode === 'cards'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cards View
                  </button>
                </div>
              </div>

              {/* Customer Table View (Primary Requirement 1) */}
              {creditViewMode === 'table' && (
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4">1. Customer / Staff Name</th>
                        <th className="py-3 px-4">2. Department</th>
                        <th className="py-3 px-4">3. Phone Number</th>
                        <th className="py-3 px-4 text-right">4. Due Amount</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {creditAccounts
                        .filter(acc => {
                          const q = creditSearch.toLowerCase().trim();
                          return !q || 
                            (acc.customer_name || '').toLowerCase().includes(q) || 
                            (acc.department || '').toLowerCase().includes(q) || 
                            (acc.desk || '').toLowerCase().includes(q) || 
                            (acc.phone || '').toLowerCase().includes(q);
                        })
                        .map(acc => {
                          const hasDues = (acc.balance || 0) > 0;
                          return (
                            <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => viewCustomerLedger(acc.customer_name)}
                                  className="text-left font-bold text-sm text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1.5"
                                  title="Click to view detailed itemized bill & statement"
                                >
                                  <span>{acc.customer_name}</span>
                                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                </button>
                                {acc.notes && (
                                  <p className="text-[10px] text-slate-400 italic truncate max-w-xs">{acc.notes}</p>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100/80">
                                  {acc.department || acc.desk || 'General Staff'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {acc.phone ? (
                                  <a href={`tel:${acc.phone}`} className="text-slate-700 hover:text-indigo-600 font-mono">
                                    📞 {acc.phone}
                                  </a>
                                ) : (
                                  <span className="text-slate-400 italic">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className={`text-base font-black ${hasDues ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  ₹{acc.balance}
                                </span>
                                <span className={`block text-[10px] font-bold uppercase tracking-wider ${hasDues ? 'text-rose-500' : 'text-emerald-600'}`}>
                                  {hasDues ? `${acc.unpaid_orders_count || 0} unpaid` : 'Cleared'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => viewCustomerLedger(acc.customer_name)}
                                    className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1"
                                    title="View detailed orders, items, and statement"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Statement</span>
                                  </button>
                                  <button
                                    disabled={!hasDues}
                                    onClick={() => {
                                      setShowSettleModal(acc);
                                      setSettleAmount(String(acc.balance));
                                    }}
                                    className="py-1.5 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1"
                                    title="Record payment to settle balance"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>Settle</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Customer Cards Grid View */}
              {creditViewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {creditAccounts
                    .filter(acc => {
                      const q = creditSearch.toLowerCase().trim();
                      return !q || 
                        (acc.customer_name || '').toLowerCase().includes(q) || 
                        (acc.department || '').toLowerCase().includes(q) || 
                        (acc.desk || '').toLowerCase().includes(q) || 
                        (acc.phone || '').toLowerCase().includes(q);
                    })
                    .map(acc => {
                      const hasDues = (acc.balance || 0) > 0;
                      return (
                        <div
                          key={acc.id}
                          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                            hasDues 
                              ? 'bg-white border-slate-200 hover:border-indigo-300 shadow-sm' 
                              : 'bg-slate-50/60 border-slate-200 opacity-80'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <button
                                onClick={() => viewCustomerLedger(acc.customer_name)}
                                className="font-extrabold text-slate-900 text-base text-left hover:text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                <span>{acc.customer_name}</span>
                                <FileText className="w-3.5 h-3.5 text-slate-400 inline" />
                              </button>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-semibold border border-indigo-100">
                                  🏢 {acc.department || acc.desk || 'General'}
                                </span>
                                {acc.phone && <span className="text-slate-400">📞 {acc.phone}</span>}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`text-xl font-black block ${hasDues ? 'text-rose-600' : 'text-emerald-600'}`}>
                                ₹{acc.balance}
                              </span>
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                hasDues ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {hasDues ? `${acc.unpaid_orders_count || 0} Unpaid Orders` : 'All Cleared'}
                              </span>
                            </div>
                          </div>

                          {acc.notes && (
                            <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100 italic">
                              "{acc.notes}"
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                            <button
                              onClick={() => viewCustomerLedger(acc.customer_name)}
                              className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5 text-indigo-600" />
                              <span>View Bill</span>
                            </button>

                            <button
                              disabled={!hasDues}
                              onClick={() => {
                                setShowSettleModal(acc);
                                setSettleAmount(String(acc.balance));
                              }}
                              className="py-2 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Settle Bill</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {creditAccounts.length === 0 && (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <BookOpen className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">No Credit Accounts Registered Yet</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Click "Register Staff Member" or bill an order via "Fast-POS ➔ CREDIT" to start an employee's weekly tab.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= VIEW 5: SETTINGS & CLOSING ================= */}
        {tab === 'settings' && (
          <div className="max-w-2xl mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                <Settings className="w-5 h-5 text-orange-500" />
                <span>Canteen & Security Configuration</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure your UPI VPA to receive mobile order payments and set your Operator PIN.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Operator Security PIN (4 Digits) *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={settings.operator_pin || ''}
                  onChange={(e) => setSettings({ ...settings, operator_pin: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none font-mono tracking-widest"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Protects the Operator Console and kitchen dispatch from customer access.
                </p>
              </div>

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

            {/* Table & Counter QR Standee Card */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-orange-500" />
                    <span>Table & Counter QR Barcode</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Place this QR barcode on dining tables or at the counter so customers can scan and order.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 self-start sm:self-auto">
                  <a
                    href="/how-to-order.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold text-xs transition-all flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span>Customer Guide Poster (A4)</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowQrStandeeModal(true)}
                    className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition-all flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Standee</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
                <img 
                  src="/canteen-qr.png" 
                  alt="BMU Canteen QR Code" 
                  className="w-36 h-36 rounded-xl border border-slate-200 bg-white p-2 shadow-sm shrink-0"
                />
                <div className="text-center sm:text-left space-y-2">
                  <div>
                    <p className="font-bold text-sm text-slate-800">Scan to Order Online</p>
                    <p className="text-xs text-slate-500 font-mono">https://bmu-canteen.onrender.com</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
                    <a 
                      href="/canteen-qr.png" 
                      download="bmu-canteen-qr.png" 
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-colors shadow-sm flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PNG</span>
                    </a>
                    <a 
                      href="/canteen-qr.svg" 
                      download="bmu-canteen-qr.svg" 
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-colors shadow-sm flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download SVG</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
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

        {/* Customer Ledger / History Modal */}
        {selectedLedger && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-lg">
                    {selectedLedger[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base tracking-tight">{selectedLedger}</h3>
                    <p className="text-xs text-slate-300">Staff Weekly Credit Ledger</p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedLedger(null); setLedgerDetail(null); }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                {loadingLedger ? (
                  <div className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-500" />
                    <p className="text-sm font-medium">Loading ledger statement...</p>
                  </div>
                ) : ledgerDetail ? (
                  <>
                    {/* Summary Header */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outstanding Balance</p>
                        <p className={`text-2xl font-black ${ledgerDetail.account.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          ₹{ledgerDetail.account.balance}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-600">
                          <span className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md font-semibold border border-indigo-100">
                            🏢 Department: {ledgerDetail.account.department || ledgerDetail.account.desk || 'General'}
                          </span>
                          {ledgerDetail.account.phone ? (
                            <span className="font-mono">📞 {ledgerDetail.account.phone}</span>
                          ) : (
                            <span className="text-slate-400 italic">📞 No phone</span>
                          )}
                        </div>
                      </div>

                      {ledgerDetail.account.balance > 0 && (
                        <button
                          onClick={() => {
                            setShowSettleModal(ledgerDetail.account);
                            setSettleAmount(String(ledgerDetail.account.balance));
                          }}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Settle Dues (₹{ledgerDetail.account.balance})</span>
                        </button>
                      )}
                    </div>

                    {/* Credit Orders Section: Itemized with Date, Description, Quantity, Price */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-orange-500" />
                          <span>Credit Orders & Itemized Statement ({ledgerDetail.orders.length})</span>
                        </h4>
                        <span className="text-[11px] text-slate-500 font-medium">
                          Date • Items • Quantity • Price
                        </span>
                      </div>

                      {ledgerDetail.orders.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-xs">
                          No credit orders recorded yet.
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                          {ledgerDetail.orders.map((o) => {
                            const orderDate = new Date(o.created_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            });

                            return (
                              <div key={o.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                                {/* Order Header: Date, Token, Status, Bill */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-lg bg-orange-100 text-orange-800 font-mono font-bold text-xs">
                                      Token #{o.token_no}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-700">
                                      📅 {orderDate}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                      o.payment_status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {o.payment_status === 'PAID' ? '✓ PAID' : '⏳ UNPAID'}
                                    </span>
                                  </div>
                                  <div className="text-right font-black text-sm text-slate-900">
                                    Total: ₹{o.total_amount}
                                  </div>
                                </div>

                                {/* Items Table: Description, Quantity, Price, Total */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead className="text-[10px] uppercase font-bold text-slate-400 bg-slate-50 rounded-lg">
                                      <tr>
                                        <th className="py-1.5 px-2.5 rounded-l-lg">Item Name</th>
                                        <th className="py-1.5 px-2 text-center">Qty</th>
                                        <th className="py-1.5 px-2 text-right">Price</th>
                                        <th className="py-1.5 px-2.5 text-right rounded-r-lg">Subtotal</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {o.items && o.items.length > 0 ? (
                                        o.items.map((it, idx) => (
                                          <tr key={it.id || idx} className="hover:bg-slate-50/50">
                                            <td className="py-2 px-2.5">
                                              <span className="font-bold text-slate-800 block">
                                                {it.item_name || it.name}
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 text-center font-mono font-semibold text-slate-700">
                                              {it.quantity}
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono text-slate-600">
                                              ₹{it.price}
                                            </td>
                                            <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900">
                                              ₹{it.total_price || (it.price * it.quantity)}
                                            </td>
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td colSpan={4} className="py-2 text-slate-400 italic text-center">
                                            No item details available
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Past Settlements History */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Past Payment Receipts ({ledgerDetail.settlements.length})
                      </h4>

                      {ledgerDetail.settlements.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">No past payments settled yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {ledgerDetail.settlements.map((s) => (
                            <div key={s.id} className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-emerald-900">Paid ₹{s.amount_paid}</span>
                                  <span className="px-1.5 py-0.5 bg-emerald-200/60 text-emerald-800 rounded font-semibold text-[10px]">
                                    {s.payment_method}
                                  </span>
                                </div>
                                {s.notes && <p className="text-[11px] text-slate-600 mt-0.5">Note: {s.notes}</p>}
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(s.settled_at).toLocaleString()}
                                </p>
                              </div>
                              <Check className="w-4 h-4 text-emerald-600" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>

              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end shrink-0">
                <button
                  onClick={() => { setSelectedLedger(null); setLedgerDetail(null); }}
                  className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors"
                >
                  Close Statement
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Credit Ledger Confirmation Modal */}
        {restoreModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Upload className="w-5 h-5" />
                  <h3 className="font-bold text-base">Restore Credit Ledger</h3>
                </div>
                <button 
                  onClick={() => setRestoreModal(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-sm">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                  <p className="font-bold text-sm flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Valid Backup File Detected</span>
                  </p>
                  <div className="text-xs space-y-1 text-emerald-800">
                    <p><span className="font-bold">File:</span> {restoreModal.fileName}</p>
                    <p><span className="font-bold">Staff Accounts:</span> {restoreModal.accountsCount} records</p>
                    <p><span className="font-bold">Total Dues in Backup:</span> ₹{restoreModal.totalDue.toFixed(2)}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Restoring will update customer accounts, departments, phone numbers, and balances from this backup file.
                </p>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setRestoreModal(null)}
                    disabled={restoring}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    disabled={restoring}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                  >
                    {restoring ? 'Restoring...' : 'Confirm & Restore'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settle Bill Modal */}
        {showSettleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5" />
                  <h3 className="font-bold text-base">Record Weekly Settlement</h3>
                </div>
                <button 
                  onClick={() => setShowSettleModal(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSettleSubmit} className="p-6 space-y-4">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <p className="text-xs text-slate-500 font-semibold">Staff Member</p>
                  <p className="text-base font-extrabold text-slate-800">{showSettleModal.customer_name}</p>
                  <p className="text-xs text-rose-600 font-bold mt-0.5">Current Dues: ₹{showSettleModal.balance}</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Amount Received (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    placeholder="e.g. 240"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setSettleAmount(String(showSettleModal.balance))}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 transition-colors"
                    >
                      Full Dues (₹{showSettleModal.balance})
                    </button>
                    {showSettleModal.balance > 100 && (
                      <button
                        type="button"
                        onClick={() => setSettleAmount('100')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 transition-colors"
                      >
                        ₹100
                      </button>
                    )}
                    {showSettleModal.balance > 500 && (
                      <button
                        type="button"
                        onClick={() => setSettleAmount('500')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 transition-colors"
                      >
                        ₹500
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Payment Mode Received
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettleMethod('CASH')}
                      className={`py-2.5 px-3 rounded-xl border font-bold text-xs transition-all ${
                        settleMethod === 'CASH'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      💵 Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettleMethod('UPI')}
                      className={`py-2.5 px-3 rounded-xl border font-bold text-xs transition-all ${
                        settleMethod === 'UPI'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-800 ring-2 ring-indigo-500/20 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      📱 UPI / QR
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Settlement Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Week 3 payment settled in cash"
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowSettleModal(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={settling}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                  >
                    {settling ? 'Recording...' : 'Confirm Receipt'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Staff Credit Profile Modal */}
        {showAddCustomerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-orange-400" />
                  <h3 className="font-bold text-base">Add Staff Credit Profile</h3>
                </div>
                <button 
                  onClick={() => setShowAddCustomerModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Employee / Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={newCustomer.customer_name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, customer_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Accounts, ECE, Library"
                      value={newCustomer.department || newCustomer.desk}
                      onChange={(e) => setNewCustomer({ ...newCustomer, department: e.target.value, desk: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Clears tab every Friday afternoon"
                    value={newCustomer.notes}
                    onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCustomerModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingCustomer}
                    className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition-all flex items-center gap-1.5"
                  >
                    {addingCustomer ? 'Adding...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Printable QR Standee Poster Modal */}
        {showQrStandeeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in print:p-0 print:bg-white print:fixed print:inset-0">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col print:shadow-none print:border-none print:w-full print:max-w-none">
              
              {/* Header - Hidden on Print */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white flex items-center justify-between print:hidden">
                <div className="flex items-center space-x-2">
                  <QrCode className="w-5 h-5 text-orange-400" />
                  <h3 className="font-bold text-base">Canteen Table / Counter QR Standee</h3>
                </div>
                <button
                  onClick={() => setShowQrStandeeModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Printable Standee Sheet */}
              <div className="p-6 sm:p-8 text-center space-y-5 print:p-8 print:space-y-6">
                {/* Branding Badge */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-100 text-orange-900 font-extrabold text-xs tracking-wider uppercase">
                  <span>🍽️ Campus QuickBite</span>
                </div>

                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {settings.canteen_name || 'BMU CANTEEN'}
                  </h1>
                  <p className="text-xs font-extrabold text-orange-600 uppercase tracking-widest mt-1">
                    SCAN TO ORDER FROM YOUR SEAT
                  </p>
                </div>

                {/* QR Code Container with Standee Frame */}
                <div className="p-4 bg-gradient-to-b from-orange-50 to-amber-50 rounded-3xl border-2 border-orange-400 inline-block shadow-md print:shadow-none">
                  <img
                    src="/canteen-qr.png"
                    alt="Scan to order menu"
                    className="w-56 h-56 mx-auto rounded-2xl bg-white p-2 border-2 border-slate-900"
                  />
                  <div className="mt-2.5 flex items-center justify-center gap-1.5 text-slate-800 font-mono font-bold text-xs">
                    <span>📱 Scan with Any Phone Camera</span>
                  </div>
                </div>

                {/* 3 Step Guide */}
                <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto text-center pt-1">
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-sm">📸</p>
                    <p className="text-[10px] font-bold text-slate-800 mt-0.5">1. Scan</p>
                    <p className="text-[9px] text-slate-500">Camera or Lens</p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-sm">🛒</p>
                    <p className="text-[10px] font-bold text-slate-800 mt-0.5">2. Choose</p>
                    <p className="text-[9px] text-slate-500">Pick food & order</p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-sm">🔔</p>
                    <p className="text-[10px] font-bold text-slate-800 mt-0.5">3. Collect</p>
                    <p className="text-[9px] text-slate-500">Watch token on TV</p>
                  </div>
                </div>

                {/* Direct Link Footer */}
                <div className="text-xs text-slate-500 font-mono pt-1">
                  bmu-canteen.onrender.com
                </div>
              </div>

              {/* Action Buttons - Hidden on Print */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div className="flex gap-2">
                  <a
                    href="/canteen-qr.png"
                    download="bmu-canteen-table-qr.png"
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PNG</span>
                  </a>
                  <a
                    href="/canteen-qr.svg"
                    download="bmu-canteen-table-qr.svg"
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>SVG</span>
                  </a>
                  <a
                    href="/how-to-order.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-xs font-bold text-orange-800 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5 text-orange-600" />
                    <span>Full Customer Poster (A4)</span>
                  </a>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQrStandeeModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition-all flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Standee</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

