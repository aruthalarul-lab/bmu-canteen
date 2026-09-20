import React, { useState, useEffect } from 'react';
import { 
  X, Search, CreditCard, CheckCircle2, AlertCircle, RefreshCw, 
  Building2, Phone, Clock, ArrowRight, ShieldCheck,
  Receipt, Wallet, Zap, PlusCircle, ArrowDownLeft, ArrowUpRight,
  RotateCcw, Sparkles
} from 'lucide-react';
import confetti from 'canvas-confetti';
import UpiPaymentButtons from './UpiPaymentButtons';
import WhatsAppIcon from './WhatsAppIcon';
import socket from '../services/socket';

export default function CustomerCreditModal({ isOpen, onClose, initialTab = 'wallet', settings }) {
  const canteenName = settings?.canteen_name || 'BMU Canteen';
  const [activeMode, setActiveMode] = useState(initialTab); // 'wallet' or 'credit'
  const [query, setQuery] = useState(() => {
    return localStorage.getItem('bmu_customer_phone') || localStorage.getItem('bmu_customer_name') || '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountData, setAccountData] = useState(null);

  // Credit settlement state
  const [showPaySection, setShowPaySection] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [utrNumber, setUtrNumber] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [upiQrData, setUpiQrData] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [activeCreditTab, setActiveCreditTab] = useState('orders'); // 'orders' or 'history'

  // Wallet recharge & passbook state
  const [showWalletRecharge, setShowWalletRecharge] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState(200);
  const [walletUtr, setWalletUtr] = useState('');
  const [submittingRecharge, setSubmittingRecharge] = useState(false);
  const [walletSuccess, setWalletSuccess] = useState(null);
  const [pendingWalletRecharge, setPendingWalletRecharge] = useState(null);
  const [walletQrData, setWalletQrData] = useState(null);
  const [loadingWalletQr, setLoadingWalletQr] = useState(false);

  // New Wallet Account Activation State
  const [activateName, setActivateName] = useState('');
  const [activatePhone, setActivatePhone] = useState('');
  const [activateDept, setActivateDept] = useState('');
  const [activatingWallet, setActivatingWallet] = useState(false);
  const [showActivateForm, setShowActivateForm] = useState(false);

  useEffect(() => {
    const nums = (query || '').replace(/\D/g, '');
    if (nums.length >= 4) {
      setActivatePhone(nums);
    } else if (!nums && query.trim()) {
      setActivateName(query.trim());
    }
  }, [query]);

  useEffect(() => {
    if (initialTab) {
      setActiveMode(initialTab);
    }
  }, [initialTab, isOpen]);

  const handleQuickActivateWallet = async (e) => {
    if (e) e.preventDefault();
    const name = activateName.trim() || (isNaN(query) ? query.trim() : '');
    const phone = activatePhone.trim() || query.replace(/\D/g, '');
    if (!name && !phone) {
      alert('Please enter your Name or Mobile Number to activate your wallet.');
      return;
    }

    setActivatingWallet(true);
    try {
      const res = await fetch('/api/wallet/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name || `Customer ${phone.slice(-4)}`,
          phone: phone,
          department: activateDept.trim() || 'General'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to activate wallet');

      localStorage.setItem('bmu_customer_name', data.account.customer_name);
      if (data.account.phone) localStorage.setItem('bmu_customer_phone', data.account.phone);

      setError('');
      setShowActivateForm(false);
      await handleSearch(data.account.customer_name);
      setShowWalletRecharge(true); // Open the top-up tray directly!
    } catch (err) {
      alert(err.message || 'Error activating wallet');
    } finally {
      setActivatingWallet(false);
    }
  };

  const handleSearch = async (searchVal) => {
    const term = (searchVal !== undefined ? searchVal : query).trim();
    if (!term) {
      setError('Please enter your phone number or customer name.');
      return;
    }
    setLoading(true);
    setError('');
    setShowPaySection(false);
    setShowWalletRecharge(false);

    try {
      const res = await fetch('/api/credit/lookup?query=' + encodeURIComponent(term));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Account not found');
      setAccountData(data);

      if (data.matchType === 'exact' && data.account) {
        setPayAmount(data.account.balance || 0);

        // Check pending credit settlement
        if (data.pendingSettlement) {
          setPendingVerification({
            amount: data.pendingSettlement.amount_paid,
            utr: data.pendingSettlement.utr
          });
        } else {
          setPendingVerification(null);
        }

        // Check pending wallet recharge (Option B)
        if (data.pendingWalletRecharge) {
          setPendingWalletRecharge({
            amount: data.pendingWalletRecharge.amount,
            utr: data.pendingWalletRecharge.utr
          });
        } else {
          setPendingWalletRecharge(null);
        }

        if (data.account.phone) localStorage.setItem('bmu_customer_phone', data.account.phone);
        if (data.account.customer_name) localStorage.setItem('bmu_customer_name', data.account.customer_name);
      }
    } catch (err) {
      setError(err.message || 'Failed to find account');
      setAccountData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('bmu_customer_phone') || localStorage.getItem('bmu_customer_name') || '';
      if (saved && !accountData) {
        setQuery(saved);
        handleSearch(saved);
      }
    }
  }, [isOpen]);

  // Real-time socket listeners
  useEffect(() => {
    if (!isOpen || !accountData?.account?.customer_name) return;
    const currentName = accountData.account.customer_name.toLowerCase();

    const handleCreditUpdate = (data) => {
      if (!data?.customer_name || data.customer_name.toLowerCase() === currentName) {
        handleSearch(accountData.account.customer_name);
      }
    };

    const handleWalletUpdate = (data) => {
      if (!data?.customer_name || data.customer_name.toLowerCase() === currentName) {
        handleSearch(accountData.account.customer_name);
      }
    };

    const handleSettlementVerified = (data) => {
      if (data?.customer_name?.toLowerCase() === currentName) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        setPaymentSuccess({
          amount: data.amount,
          newBalance: data.new_balance,
          utr: data.utr
        });
        setPendingVerification(null);
        handleSearch(accountData.account.customer_name);
      }
    };

    const handleSettlementRejected = (data) => {
      if (data?.customer_name?.toLowerCase() === currentName) {
        setPendingVerification(null);
        setError('Credit settlement was declined by the cashier. Please verify your UTR at Counter 1.');
        handleSearch(accountData.account.customer_name);
      }
    };

    const handleWalletRechargeVerified = (data) => {
      if (data?.customer_name?.toLowerCase() === currentName) {
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
        setWalletSuccess({
          amount: data.amount,
          newBalance: data.new_wallet_balance,
          utr: data.utr
        });
        setPendingWalletRecharge(null);
        setShowWalletRecharge(false);
        handleSearch(accountData.account.customer_name);
      }
    };

    const handleWalletRechargeRejected = (data) => {
      if (data?.customer_name?.toLowerCase() === currentName) {
        setPendingWalletRecharge(null);
        setError('Wallet recharge request was declined by the cashier. Please verify your UTR with the counter.');
        handleSearch(accountData.account.customer_name);
      }
    };

    socket.on('credit-updated', handleCreditUpdate);
    socket.on('wallet-updated', handleWalletUpdate);
    socket.on('credit-settlement-verified', handleSettlementVerified);
    socket.on('credit-settlement-rejected', handleSettlementRejected);
    socket.on('wallet-recharge-verified', handleWalletRechargeVerified);
    socket.on('wallet-recharge-rejected', handleWalletRechargeRejected);

    return () => {
      socket.off('credit-updated', handleCreditUpdate);
      socket.off('wallet-updated', handleWalletUpdate);
      socket.off('credit-settlement-verified', handleSettlementVerified);
      socket.off('credit-settlement-rejected', handleSettlementRejected);
      socket.off('wallet-recharge-verified', handleWalletRechargeVerified);
      socket.off('wallet-recharge-rejected', handleWalletRechargeRejected);
    };
  }, [isOpen, accountData?.account?.customer_name]);

  // Fetch UPI QR for Credit Settlement
  useEffect(() => {
    if (!showPaySection || !accountData?.account || payAmount <= 0) return;
    let isMounted = true;
    const fetchQr = async () => {
      setLoadingQr(true);
      try {
        const res = await fetch('/api/credit/qr?amount=' + payAmount + '&name=' + encodeURIComponent(accountData.account.customer_name));
        if (res.ok && isMounted) {
          const qr = await res.json();
          setUpiQrData(qr);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoadingQr(false);
      }
    };
    fetchQr();
    return () => { isMounted = false; };
  }, [showPaySection, payAmount, accountData?.account?.customer_name]);

  // Fetch UPI QR for Wallet Recharge
  useEffect(() => {
    if (!showWalletRecharge || !accountData?.account || rechargeAmount <= 0) return;
    let isMounted = true;
    const fetchWalletQr = async () => {
      setLoadingWalletQr(true);
      try {
        const res = await fetch('/api/wallet/qr?amount=' + rechargeAmount + '&name=' + encodeURIComponent(accountData.account.customer_name));
        if (res.ok && isMounted) {
          const qr = await res.json();
          setWalletQrData(qr);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoadingWalletQr(false);
      }
    };
    fetchWalletQr();
    return () => { isMounted = false; };
  }, [showWalletRecharge, rechargeAmount, accountData?.account?.customer_name]);

  // Handle Credit Settlement submission
  const handleSettlePayment = async (e) => {
    e.preventDefault();
    if (!accountData?.account) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid positive payment amount');
      return;
    }
    const cleanUtr = utrNumber.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      alert('Please enter a valid 12-digit UPI reference / UTR number from your payment app.');
      return;
    }
    setSubmittingPayment(true);
    try {
      const res = await fetch('/api/credit/customer-settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: accountData.account.customer_name,
          phone: accountData.account.phone,
          amount: amt,
          payment_method: 'UPI',
          utr: cleanUtr
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to submit payment');
      
      setPendingVerification({
        amount: amt,
        utr: cleanUtr
      });
      setShowPaySection(false);
      setUtrNumber('');
      handleSearch(accountData.account.customer_name);
    } catch (err) {
      alert(err.message || 'Payment submission failed');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handle Wallet Recharge submission (Option B: PENDING verification)
  const handleWalletRechargeSubmit = async (e) => {
    e.preventDefault();
    if (!accountData?.account) return;
    const amt = parseFloat(rechargeAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid positive top-up amount');
      return;
    }
    const cleanUtr = walletUtr.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      alert('Please enter a valid 12-digit UPI reference / UTR number from your UPI app.');
      return;
    }

    setSubmittingRecharge(true);
    try {
      const res = await fetch('/api/wallet/customer-recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: accountData.account.customer_name,
          phone: accountData.account.phone || '',
          department: accountData.account.department || '',
          amount: amt,
          utr: cleanUtr,
          notes: 'Customer Online UPI Top-Up'
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to submit wallet recharge');

      if (result.status === 'INSTANT_CREDIT' || result.mode === 'OPTION_A') {
        // Option A: Instant Self-Credit!
        confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
        setWalletSuccess({
          amount: amt,
          utr: cleanUtr,
          newBalance: result.new_wallet_balance != null ? result.new_wallet_balance : ((accountData?.account?.wallet_balance || 0) + amt)
        });
        setPendingWalletRecharge(null);
        setShowWalletRecharge(false);
        setWalletUtr('');
        handleSearch(accountData.account.customer_name);
      } else {
        // Option B: Pending cashier approval
        setPendingWalletRecharge({
          amount: amt,
          utr: cleanUtr
        });
        setShowWalletRecharge(false);
        setWalletUtr('');
        handleSearch(accountData.account.customer_name);
      }
    } catch (err) {
      alert(err.message || 'Recharge request failed');
    } finally {
      setSubmittingRecharge(false);
    }
  };

  if (!isOpen) return null;

  const currentWalletBalance = accountData?.account?.wallet_balance || accountData?.wallet_balance || 0;
  const currentCreditDues = accountData?.account?.balance || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto animate-scale-up max-h-[92vh] flex flex-col">
        
        {/* Header with Mode Switcher */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 sm:px-6 py-4 text-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                {activeMode === 'wallet' ? <Wallet className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
              </div>
              <div>
                <h2 className="font-extrabold text-base sm:text-lg tracking-tight">
                  {activeMode === 'wallet' ? `${canteenName} - Prepaid Wallet` : 'Staff Credit Dues'}
                </h2>
                <p className="text-[11px] text-slate-300">
                  {activeMode === 'wallet' 
                    ? '1-Tap instant checkout, fast top-up & passbook ledger' 
                    : 'Check weekly staff credit ledger & settle outstanding dues'}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-white/10 rounded-xl max-w-xs gap-1">
            <button
              onClick={() => { setActiveMode('wallet'); setError(''); }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                activeMode === 'wallet'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Prepaid Wallet</span>
            </button>
            <button
              onClick={() => { setActiveMode('credit'); setError(''); }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                activeMode === 'credit'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Credit Dues</span>
            </button>
          </div>
        </div>

        {/* Search Tray */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200/80 shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter 10-digit Mobile No. or Name..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0 ${
                activeMode === 'wallet' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/20'
              }`}
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              <span>{loading ? 'Searching...' : activeMode === 'wallet' ? 'Check Wallet' : 'Check Dues'}</span>
            </button>
          </form>
          {error && activeMode === 'credit' && (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-xl border border-rose-200 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {error && activeMode === 'wallet' && (
            <div className="mt-3 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-400 shadow-sm animate-fade-in space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    New Customer? Activate Wallet in 5 Seconds!
                  </h3>
                  <p className="text-xs text-slate-600">
                    No account exists yet for "{query}". Enter your name to activate your BMU Prepaid Wallet and top up immediately.
                  </p>
                </div>
              </div>

              <form onSubmit={handleQuickActivateWallet} className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Your Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={activateName}
                      onChange={(e) => setActivateName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength="10"
                      placeholder="e.g. 9876543210"
                      value={activatePhone}
                      onChange={(e) => setActivatePhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-semibold focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Department / Student ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Electricity, CSE, Staff"
                    value={activateDept}
                    onChange={(e) => setActivateDept(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={activatingWallet}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-1.5"
                >
                  {activatingWallet ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                  <span>{activatingWallet ? 'Activating Wallet...' : '⚡ Activate Wallet & Open Top-Up'}</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">

          {/* Pending Wallet Recharge Banner */}
          {activeMode === 'wallet' && pendingWalletRecharge && (
            <div className="p-4 rounded-2xl bg-amber-50/95 border-2 border-amber-300 text-amber-900 flex items-start gap-3 animate-fade-in shadow-xs">
              <RefreshCw className="w-5 h-5 text-amber-600 mt-0.5 shrink-0 animate-spin" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-slate-900">
                    Wallet Recharge Submitted • Awaiting Cashier Confirmation
                  </p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-300 text-slate-900 uppercase tracking-wide">
                    OPTION B PENDING
                  </span>
                </div>
                <p className="text-xs text-amber-800">
                  Amount: <b className="font-mono">₹{pendingWalletRecharge.amount}</b> | UTR: <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-amber-200">{pendingWalletRecharge.utr}</span>
                </p>
                <p className="text-[11px] text-slate-600">
                  The cashier at Counter 1 has received your recharge request. Once verified against canteen bank statements, ₹{pendingWalletRecharge.amount} will be instantly credited to your wallet balance!
                </p>
              </div>
            </div>
          )}

          {/* Wallet Recharge Confirmed Banner */}
          {activeMode === 'wallet' && walletSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3 animate-fade-in shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-sm">Wallet Recharge Verified & Credited!</p>
                <p className="text-xs text-emerald-700">Amount Credited: <b>+₹{walletSuccess.amount}</b> | UTR: <span className="font-mono">{walletSuccess.utr}</span></p>
                <p className="text-xs text-emerald-700">Current Wallet Balance: <b className="text-emerald-800 text-sm">₹{walletSuccess.newBalance}</b></p>
              </div>
            </div>
          )}

          {/* Pending Credit Settlement Banner */}
          {activeMode === 'credit' && pendingVerification && (
            <div className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 text-amber-900 flex items-start gap-3 animate-fade-in">
              <RefreshCw className="w-5 h-5 text-amber-600 mt-0.5 shrink-0 animate-spin" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-slate-900">
                    Settlement Submitted • Awaiting Cashier Confirmation
                  </p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-300 text-slate-900 uppercase tracking-wide">
                    AWAITING VERIFY
                  </span>
                </div>
                <p className="text-xs text-amber-800">
                  Amount: <b className="font-mono">₹{pendingVerification.amount}</b> | UTR: <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-amber-200">{pendingVerification.utr}</span>
                </p>
                <p className="text-[11px] text-slate-600">
                  The cashier has received your settlement alert. Once verified at the counter, your dues will clear to ₹0 and celebration confetti will appear here automatically!
                </p>
              </div>
            </div>
          )}

          {/* Credit Settlement Success Banner */}
          {activeMode === 'credit' && paymentSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-sm">Payment Verified & Recorded Successfully!</p>
                <p className="text-xs text-emerald-700">Amount: <b>₹{paymentSuccess.amount}</b> | UTR: <span className="font-mono">{paymentSuccess.utr}</span></p>
                <p className="text-xs text-emerald-700">Updated Balance: <b className="text-emerald-800">₹{paymentSuccess.newBalance}</b></p>
              </div>
            </div>
          )}

          {/* Multiple Accounts Picker */}
          {accountData?.matchType === 'multiple' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select your account ({accountData.accounts.length} found):</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {accountData.accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => handleSearch(acc.customer_name)}
                    className="p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50/40 text-left transition-all shadow-xs flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 transition-colors">{acc.customer_name}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{acc.department || 'General Customer'}</span>
                        {acc.phone && <span className="text-[11px] text-slate-400">• {acc.phone}</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {activeMode === 'wallet' ? (
                        <>
                          <p className="text-xs text-slate-400 font-medium">Wallet</p>
                          <p className="font-extrabold text-sm text-emerald-600">₹{acc.wallet_balance || 0}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-slate-400 font-medium">Due</p>
                          <p className={'font-extrabold text-sm ' + (acc.balance > 0 ? 'text-amber-700' : 'text-emerald-600')}>₹{acc.balance}</p>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Exact Account View */}
          {accountData?.matchType === 'exact' && accountData.account && (
            <div className="space-y-4">
              
              {/* Profile Card with Dual Balance Display */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-slate-700">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">{accountData.account.customer_name}</span>
                      {accountData.account.department && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {accountData.account.department}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-300 mt-1">
                      {accountData.account.phone && (
                        <span className="flex items-center gap-1 font-mono"><Phone className="w-3 h-3 text-slate-400" />{accountData.account.phone}</span>
                      )}
                      <span className="text-slate-400">{accountData.orders?.length || 0} Orders</span>
                    </div>
                  </div>

                  {/* Dual Balances Pill */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl border text-center sm:text-right ${
                      activeMode === 'wallet' ? 'bg-emerald-500/20 border-emerald-400/40' : 'bg-white/5 border-white/10'
                    }`}>
                      <span className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold block">👛 Wallet Balance</span>
                      <span className="font-mono font-black text-xl sm:text-2xl text-emerald-300">₹{currentWalletBalance}</span>
                    </div>
                    <div className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl border text-center sm:text-right ${
                      activeMode === 'credit' ? 'bg-orange-500/20 border-orange-400/40' : 'bg-white/5 border-white/10'
                    }`}>
                      <span className="text-[10px] uppercase tracking-wider text-orange-300 font-bold block">💳 Credit Dues</span>
                      <span className={`font-mono font-black text-xl sm:text-2xl ${currentCreditDues > 0 ? 'text-amber-300' : 'text-slate-400'}`}>₹{currentCreditDues}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions of the Card */}
                <div className="mt-4 pt-3.5 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-300">
                    {activeMode === 'wallet' 
                      ? 'Prepaid funds for 1-tap food ordering'
                      : 'Clear weekly credit dues via UPI QR'}
                  </span>
                  <div className="flex items-center gap-2">
                    {activeMode === 'wallet' ? (
                      <>
                        <button
                          onClick={() => {
                            const name = accountData.account.customer_name;
                            const bal = currentWalletBalance;
                            const msg = `👛 *${canteenName} - Prepaid Wallet*\n👤 *Customer:* ${name}\n💰 *Available Balance:* ₹${bal}\n\n_Recharge your wallet at the counter or scan UPI QR online!_`;
                            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                          }}
                          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs active:scale-95 transition-all flex items-center gap-1.5"
                          title="Share wallet balance to WhatsApp"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                        <button
                          onClick={() => setShowWalletRecharge(!showWalletRecharge)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 text-white font-extrabold text-xs shadow-md shadow-emerald-500/30 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>{showWalletRecharge ? 'Cancel Top-Up' : '⚡ + Top-Up Wallet'}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            const name = accountData.account.customer_name;
                            const bal = currentCreditDues;
                            const upiId = 'bmucanteen@upi';
                            const msg = `🧾 *${canteenName} Credit Statement*\n👤 *Name:* ${name}\n💰 *Total Dues:* ₹${bal}\n\n💳 *Pay via UPI:* ${upiId}\n\n_Thank you!_`;
                            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                          }}
                          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                        {currentCreditDues > 0 && !showPaySection && (
                          <button
                            onClick={() => setShowPaySection(true)}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 text-white font-extrabold text-xs shadow-md shadow-orange-500/30 active:scale-95 transition-all flex items-center gap-1.5"
                          >
                            <Zap className="w-3.5 h-3.5 fill-white" />
                            <span>⚡ Pay ₹{currentCreditDues} Online</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ================= WALLET RECHARGE TRAY (Option B) ================= */}
              {activeMode === 'wallet' && showWalletRecharge && (
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/90 border-2 border-emerald-200 space-y-4 animate-fade-in shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                        <PlusCircle className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900">Recharge {canteenName} Wallet</h3>
                        <p className="text-[11px] text-slate-500">Scan dynamic UPI QR & submit 12-digit UTR for cashier verification</p>
                      </div>
                    </div>
                    <button onClick={() => setShowWalletRecharge(false)} className="text-xs text-slate-500 hover:text-slate-800 font-semibold">✕ Close</button>
                  </div>

                  {/* Preset Amount Chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 mr-1">Quick Select:</span>
                    {[100, 200, 500, 1000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setRechargeAmount(amt)}
                        className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all ${
                          rechargeAmount === amt
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        +₹{amt}
                      </button>
                    ))}
                  </div>

                  {/* Custom Amount Input */}
                  <div className="bg-white p-3 rounded-xl border border-emerald-200 flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700">Top-Up Amount (₹):</label>
                    <input
                      type="number"
                      min="10"
                      max="10000"
                      value={rechargeAmount}
                      onChange={(e) => setRechargeAmount(Math.max(1, parseFloat(e.target.value) || 0))}
                      className="w-32 px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Dynamic UPI QR Code & App Buttons */}
                  <div className="text-center space-y-3 bg-white p-4 rounded-xl border border-emerald-200">
                    <p className="text-xs text-slate-600 font-medium">Scan QR code or click payment app below:</p>
                    {loadingWalletQr ? (
                      <div className="w-44 h-44 mx-auto flex items-center justify-center text-xs text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin text-emerald-500" />
                      </div>
                    ) : walletQrData?.qrDataUrl ? (
                      <div className="inline-block p-2 bg-white rounded-xl shadow-xs border border-slate-200">
                        <img src={walletQrData.qrDataUrl} alt="Wallet Recharge UPI QR" className="w-44 h-44 mx-auto rounded-lg object-contain" />
                      </div>
                    ) : null}
                    {walletQrData && <UpiPaymentButtons upiUri={walletQrData.upiUri} upiId={walletQrData.upiId} amount={rechargeAmount} />}
                  </div>

                  {/* 12-Digit UTR Submission Form */}
                  <form onSubmit={handleWalletRechargeSubmit} className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        12-Digit UPI Reference / UTR Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength="16"
                        value={walletUtr}
                        onChange={(e) => setWalletUtr(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="e.g. 423501987123 (from GPay / PhonePe / Paytm)"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Submitting your 12-digit UTR credits your wallet balance for immediate 1-tap food ordering.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={submittingRecharge || !walletUtr.trim()}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {submittingRecharge ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>{submittingRecharge ? 'Submitting Recharge...' : 'Submit Recharge Request & UTR'}</span>
                    </button>
                  </form>
                </div>
              )}

              {/* ================= CREDIT SETTLEMENT SECTION ================= */}
              {activeMode === 'credit' && showPaySection && currentCreditDues > 0 && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 border-2 border-amber-200 space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold">
                        <Zap className="w-4 h-4 fill-white" />
                      </div>
                      <h3 className="font-extrabold text-sm text-slate-900">Pay Dues via UPI</h3>
                    </div>
                    <button onClick={() => setShowPaySection(false)} className="text-xs text-slate-500 hover:text-slate-800 font-semibold">✕ Close Payment</button>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-amber-200 flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700">Amount to Pay (₹):</label>
                    <input
                      type="number"
                      min="1"
                      max={currentCreditDues}
                      value={payAmount}
                      onChange={(e) => setPayAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-32 px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="text-center space-y-3 bg-white p-4 rounded-xl border border-amber-200">
                    <p className="text-xs text-slate-600 font-medium">Scan with Google Pay, PhonePe, Paytm, or tap below:</p>
                    {loadingQr ? (
                      <div className="w-44 h-44 mx-auto flex items-center justify-center text-xs text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                      </div>
                    ) : upiQrData?.qrDataUrl ? (
                      <div className="inline-block p-2 bg-white rounded-xl shadow-xs border border-slate-200">
                        <img src={upiQrData.qrDataUrl} alt="Credit Settlement UPI QR" className="w-44 h-44 mx-auto rounded-lg object-contain" />
                      </div>
                    ) : null}
                    {upiQrData && <UpiPaymentButtons upiUri={upiQrData.upiUri} upiId={upiQrData.upiId} amount={payAmount} />}
                  </div>
                  <form onSubmit={handleSettlePayment} className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        12-Digit UPI Reference / UTR Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength="16"
                        value={utrNumber}
                        onChange={(e) => setUtrNumber(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Enter 12-digit UTR from UPI app"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white shadow-xs"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">Found in payment details of your GPay, PhonePe or Paytm app.</p>
                    </div>
                    <button
                      type="submit"
                      disabled={submittingPayment || !utrNumber.trim()}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white font-extrabold text-sm shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {submittingPayment ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>{submittingPayment ? 'Verifying & Recording...' : 'Confirm Payment & Submit UTR'}</span>
                    </button>
                  </form>
                </div>
              )}

              {/* ================= TAB SWITCHER FOR WALLET / CREDIT ================= */}
              {activeMode === 'wallet' ? (
                <div>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Receipt className="w-4 h-4 text-emerald-600" />
                      <span>Wallet Passbook & Transaction Ledger</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {accountData.walletTransactions?.length || 0} Records
                    </span>
                  </div>

                  {(!accountData.walletTransactions || accountData.walletTransactions.length === 0) ? (
                    <div className="text-center py-8 text-slate-400 text-xs bg-slate-50/60 rounded-2xl border border-slate-200/60">
                      No wallet transactions recorded yet. Click <strong>+ Top-Up Wallet</strong> above to add balance!
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {accountData.walletTransactions.map((tx) => {
                        const isRecharge = tx.type === 'RECHARGE';
                        const isRefund = tx.type === 'REFUND';
                        const isPayment = tx.type === 'ORDER_PAYMENT';
                        const isPending = tx.status === 'PENDING';

                        return (
                          <div 
                            key={tx.id}
                            className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between text-xs ${
                              isPending 
                                ? 'bg-amber-50/70 border-amber-300 shadow-xs' 
                                : isRefund 
                                  ? 'bg-purple-50/60 border-purple-200' 
                                  : isRecharge 
                                    ? 'bg-emerald-50/50 border-emerald-200/80' 
                                    : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isPending 
                                  ? 'bg-amber-200 text-amber-900' 
                                  : isRefund 
                                    ? 'bg-purple-100 text-purple-700' 
                                    : isRecharge 
                                      ? 'bg-emerald-100 text-emerald-700' 
                                      : 'bg-slate-100 text-slate-700'
                              }`}>
                                {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : isRefund ? <RotateCcw className="w-4 h-4" /> : isRecharge ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">
                                    {isRecharge ? 'Wallet Recharge' : isRefund ? 'Order Refund' : `Order Payment ${tx.order_token ? `#${tx.order_token}` : ''}`}
                                  </span>
                                  {isPending && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-300 text-slate-900 uppercase">
                                      Awaiting Verify
                                    </span>
                                  )}
                                  {tx.status === 'INSTANT_CREDIT' && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-200 text-emerald-900 uppercase flex items-center gap-0.5">
                                      <Zap className="w-2.5 h-2.5" />
                                      Self-Credited
                                    </span>
                                  )}
                                  {isRefund && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-200 text-purple-900">
                                      Refunded
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>{new Date(tx.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                  {tx.utr && <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">UTR: {tx.utr}</span>}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <p className={`font-mono font-extrabold text-sm ${
                                isPending ? 'text-amber-700' : isRecharge || isRefund ? 'text-emerald-700' : 'text-slate-900'
                              }`}>
                                {isRecharge || isRefund ? `+₹${tx.amount}` : `-₹${tx.amount}`}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                Bal: ₹{tx.balance_after}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* CREDIT MODE TABS */
                <div>
                  <div className="border-b border-slate-200 flex items-center space-x-4 pt-1 mb-3">
                    <button
                      onClick={() => setActiveCreditTab('orders')}
                      className={'pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ' + (activeCreditTab === 'orders' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800')}
                    >
                      <Receipt className="w-4 h-4" />
                      <span>Itemized Orders ({accountData.orders?.length || 0})</span>
                    </button>
                    <button
                      onClick={() => setActiveCreditTab('history')}
                      className={'pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ' + (activeCreditTab === 'history' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800')}
                    >
                      <Wallet className="w-4 h-4" />
                      <span>Payment History ({accountData.settlements?.length || 0})</span>
                    </button>
                  </div>

                  {activeCreditTab === 'orders' && (
                    <div className="space-y-3">
                      {(!accountData.orders || accountData.orders.length === 0) ? (
                        <div className="text-center py-8 text-slate-400 text-xs">No credit orders recorded yet.</div>
                      ) : (
                        accountData.orders.map((order) => {
                          const isCancelled = order.status === 'CANCELLED' || order.payment_status === 'CANCELLED';
                          const isPaid = !isCancelled && order.payment_status === 'PAID';
                          const isDelivered = !isCancelled && !isPaid && order.status === 'COMPLETED';

                          return (
                            <div 
                              key={order.id} 
                              className={'rounded-2xl border p-3.5 space-y-2.5 transition-all ' + (
                                isCancelled 
                                  ? 'bg-slate-50/70 border-slate-200 opacity-80' 
                                  : isDelivered 
                                    ? 'bg-amber-50/60 border-amber-300 shadow-xs' 
                                    : isPaid 
                                      ? 'bg-white border-slate-200/80'
                                      : 'bg-sky-50/40 border-sky-200'
                              )}
                            >
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">Token #{order.token_no}</span>
                                  <span className="text-slate-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {new Date(order.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  isCancelled ? 'bg-rose-100 text-rose-700' : isPaid ? 'bg-emerald-100 text-emerald-800' : isDelivered ? 'bg-amber-200 text-amber-900' : 'bg-sky-100 text-sky-800'
                                }`}>
                                  {isCancelled ? 'CANCELLED' : isPaid ? 'PAID' : isDelivered ? 'DELIVERED (DUE)' : 'PREPARING'}
                                </span>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <tbody>
                                    {order.items?.map((item) => (
                                      <tr key={item.id} className="text-slate-700">
                                        <td className="py-1 px-2 font-medium text-slate-900">{item.item_name}</td>
                                        <td className="py-1 px-2 text-center font-mono font-bold">{item.quantity}x</td>
                                        <td className="py-1 px-2 text-right font-mono text-slate-600">₹{item.price}</td>
                                        <td className="py-1 px-2 text-right font-mono font-bold text-slate-900">₹{item.total_price}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              <div className="flex justify-between items-center text-xs px-1 pt-1 border-t border-slate-100">
                                <span className="text-slate-500">Order Total</span>
                                <span className="font-mono font-extrabold text-sm text-slate-900">₹{order.total_amount}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {activeCreditTab === 'history' && (
                    <div className="space-y-2.5">
                      {(!accountData.settlements || accountData.settlements.length === 0) ? (
                        <div className="text-center py-8 text-slate-400 text-xs">No previous credit settlement records found.</div>
                      ) : (
                        accountData.settlements.map((setl) => (
                          <div key={setl.id} className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs">
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Paid via {setl.payment_method}</span>
                                {setl.utr && <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">UTR: {setl.utr}</span>}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {new Date(setl.settled_at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                {setl.notes ? ' • ' + setl.notes : ''}
                              </p>
                            </div>
                            <span className="font-mono font-extrabold text-emerald-700 text-sm">+₹{setl.amount_paid}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Initial Blank State */}
          {!accountData && !loading && (
            <div className="text-center py-8 px-4 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                {activeMode === 'wallet' ? <Wallet className="w-6 h-6" /> : <Receipt className="w-6 h-6" />}
              </div>
              <div className="max-w-xs mx-auto space-y-1">
                <p className="font-bold text-sm text-slate-800">
                  {activeMode === 'wallet' ? 'Access Your Prepaid BMU Wallet' : 'Lookup Your Credit Ledger'}
                </p>
                <p className="text-xs text-slate-500">
                  {activeMode === 'wallet'
                    ? 'Enter your mobile number or name to check available balance, view transaction passbook, or recharge online.'
                    : 'Enter your registered 10-digit mobile number or staff name to view your statement and clear outstanding dues.'}
                </p>
              </div>

              {activeMode === 'wallet' && !showActivateForm && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowActivateForm(true);
                      setError('');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 active:scale-95 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ New Customer? Activate / Top-Up Wallet</span>
                  </button>
                </div>
              )}

              {activeMode === 'wallet' && showActivateForm && (
                <div className="max-w-md mx-auto p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-400 shadow-sm animate-fade-in space-y-3 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900">
                          Activate BMU Prepaid Wallet
                        </h3>
                        <p className="text-[11px] text-slate-600">
                          Takes 5 seconds. Top up immediately via UPI QR!
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowActivateForm(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ✕ Cancel
                    </button>
                  </div>

                  <form onSubmit={handleQuickActivateWallet} className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Your Full Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rahul Sharma"
                          value={activateName}
                          onChange={(e) => setActivateName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Mobile Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          maxLength="10"
                          placeholder="e.g. 9876543210"
                          value={activatePhone}
                          onChange={(e) => setActivatePhone(e.target.value.replace(/\D/g, ''))}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-semibold focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Department / Student ID (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Electricity, CSE, Staff"
                        value={activateDept}
                        onChange={(e) => setActivateDept(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={activatingWallet}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-1.5"
                    >
                      {activatingWallet ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                      <span>{activatingWallet ? 'Activating Wallet...' : '⚡ Activate Wallet & Open Top-Up'}</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Secure & Verified • A Product of NULIFE</span>
          </span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-bold text-slate-700 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}