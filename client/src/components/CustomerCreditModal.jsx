import React, { useState, useEffect } from 'react';
import { 
  X, Search, CreditCard, CheckCircle2, AlertCircle, RefreshCw, 
  Building2, Phone, Clock, ArrowRight, ShieldCheck,
  Receipt, Wallet, Zap
} from 'lucide-react';
import confetti from 'canvas-confetti';
import UpiPaymentButtons from './UpiPaymentButtons';
import socket from '../services/socket';

export default function CustomerCreditModal({ isOpen, onClose }) {
  const [query, setQuery] = useState(() => {
    return localStorage.getItem('bmu_customer_phone') || localStorage.getItem('bmu_customer_name') || '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountData, setAccountData] = useState(null);
  const [showPaySection, setShowPaySection] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [utrNumber, setUtrNumber] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [upiQrData, setUpiQrData] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [activeTab, setActiveTab] = useState('orders');

  const handleSearch = async (searchVal) => {
    const term = (searchVal !== undefined ? searchVal : query).trim();
    if (!term) {
      setError('Please enter your phone number or staff name.');
      return;
    }
    setLoading(true);
    setError('');
    setShowPaySection(false);
    try {
      const res = await fetch('/api/credit/lookup?query=' + encodeURIComponent(term));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Account not found');
      setAccountData(data);
      if (data.matchType === 'exact' && data.account) {
        setPayAmount(data.account.balance || 0);
        if (data.pendingSettlement) {
          setPendingVerification({
            amount: data.pendingSettlement.amount_paid,
            utr: data.pendingSettlement.utr
          });
        } else {
          setPendingVerification(null);
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

  useEffect(() => {
    if (!isOpen || !accountData?.account?.customer_name) return;
    const handleCreditUpdate = (data) => {
      if (data?.customer_name?.toLowerCase() === accountData.account.customer_name.toLowerCase()) {
        handleSearch(accountData.account.customer_name);
      }
    };

    const handleSettlementVerified = (data) => {
      if (data?.customer_name?.toLowerCase() === accountData.account.customer_name.toLowerCase()) {
        // OPERATOR VERIFIED! TRIGGER CONFETTI AND SUCCESS!
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
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
      if (data?.customer_name?.toLowerCase() === accountData.account.customer_name.toLowerCase()) {
        setPendingVerification(null);
        setError('Payment verification was declined by the cashier. Please verify your UTR or contact the counter.');
        handleSearch(accountData.account.customer_name);
      }
    };

    socket.on('credit-updated', handleCreditUpdate);
    socket.on('credit-settlement-verified', handleSettlementVerified);
    socket.on('credit-settlement-rejected', handleSettlementRejected);

    return () => {
      socket.off('credit-updated', handleCreditUpdate);
      socket.off('credit-settlement-verified', handleSettlementVerified);
      socket.off('credit-settlement-rejected', handleSettlementRejected);
    };
  }, [isOpen, accountData?.account?.customer_name]);

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
      
      // Put in pending state awaiting cashier confirmation (confetti triggers on operator verification)
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto animate-scale-up max-h-[92vh] flex flex-col">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 sm:px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-400/30 flex items-center justify-center text-orange-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg tracking-tight">Staff / Student Credit Dues</h2>
              <p className="text-[11px] text-slate-300">Check weekly credit ledger, itemized statement & pay online</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-slate-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200/80 shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter 10-digit Mobile No. or Staff Name..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-xs"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              <span>{loading ? 'Checking...' : 'Check Dues'}</span>
            </button>
          </form>
          {error && (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-xl border border-rose-200 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {pendingVerification && (
            <div className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 text-amber-900 flex items-start gap-3 animate-fade-in">
              <RefreshCw className="w-5 h-5 text-amber-600 mt-0.5 shrink-0 animate-spin" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm text-slate-900">
                    Payment Submitted • Awaiting Cashier Confirmation
                  </p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-300 text-slate-900 uppercase tracking-wide">
                    AWAITING VERIFY
                  </span>
                </div>
                <p className="text-xs text-amber-800">
                  Amount: <b className="font-mono">₹{pendingVerification.amount}</b> | UTR: <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-amber-200">{pendingVerification.utr}</span>
                </p>
                <p className="text-[11px] text-slate-600">
                  The cashier has received your settlement alert. Once verified at the counter, your balance will clear to ₹0 and celebration confetti will appear here automatically!
                </p>
              </div>
            </div>
          )}

          {paymentSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-sm">Payment Verified & Recorded Successfully!</p>
                <p className="text-xs text-emerald-700">Amount: <b>₹{paymentSuccess.amount}</b> | UTR: <span className="font-mono">{paymentSuccess.utr}</span></p>
                <p className="text-xs text-emerald-700">Updated Balance: <b className="text-emerald-800">₹{paymentSuccess.newBalance}</b></p>
              </div>
            </div>
          )}

          {accountData?.matchType === 'multiple' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select your account ({accountData.accounts.length} found):</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {accountData.accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => handleSearch(acc.customer_name)}
                    className="p-3.5 rounded-2xl border border-slate-200 hover:border-orange-400 bg-white hover:bg-orange-50/40 text-left transition-all shadow-xs flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-900 group-hover:text-orange-600 transition-colors">{acc.customer_name}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{acc.department || 'Staff'}</span>
                        {acc.phone && <span className="text-[11px] text-slate-400">• {acc.phone}</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400 font-medium">Due</p>
                      <p className={'font-extrabold text-sm ' + (acc.balance > 0 ? 'text-amber-700' : 'text-emerald-600')}>₹{acc.balance}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {accountData?.matchType === 'exact' && accountData.account && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-slate-700">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">{accountData.account.customer_name}</span>
                      {accountData.account.department && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">{accountData.account.department}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-300 mt-1">
                      {accountData.account.phone && (
                        <span className="flex items-center gap-1 font-mono"><Phone className="w-3 h-3 text-slate-400" />{accountData.account.phone}</span>
                      )}
                      <span className="text-slate-400">{accountData.orders?.length || 0} Total Orders</span>
                    </div>
                  </div>
                  <div className="sm:text-right bg-white/10 px-4 py-2 rounded-xl border border-white/10 w-full sm:w-auto flex sm:flex-col justify-between items-center sm:items-end">
                    <span className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">Due Amount</span>
                    <span className={'font-mono-code font-black text-2xl sm:text-3xl ' + (accountData.account.balance > 0 ? 'text-amber-300' : 'text-emerald-300')}>₹{accountData.account.balance}</span>
                  </div>
                </div>
                {accountData.account.balance > 0 && !showPaySection && (
                  <div className="mt-4 pt-3.5 border-t border-slate-700/60 flex items-center justify-between">
                    <span className="text-xs text-slate-300">Clear weekly credit balance via UPI app</span>
                    <button onClick={() => setShowPaySection(true)} className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 text-white font-extrabold text-xs shadow-md shadow-orange-500/30 active:scale-95 transition-all flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 fill-white" />
                      <span>⚡ Pay ₹{accountData.account.balance} Online</span>
                    </button>
                  </div>
                )}
              </div>

              {showPaySection && accountData.account.balance > 0 && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 border-2 border-amber-200 space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold"><Zap className="w-4 h-4 fill-white" /></div>
                      <h3 className="font-extrabold text-sm text-slate-900">Pay Dues via UPI</h3>
                    </div>
                    <button onClick={() => setShowPaySection(false)} className="text-xs text-slate-500 hover:text-slate-800 font-semibold">✕ Close Payment</button>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-amber-200 flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700">Amount to Pay (₹):</label>
                    <input
                      type="number"
                      min="1"
                      max={accountData.account.balance}
                      value={payAmount}
                      onChange={(e) => setPayAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-32 px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="text-center space-y-3 bg-white p-4 rounded-xl border border-amber-200">
                    <p className="text-xs text-slate-600 font-medium">Scan with Google Pay, PhonePe, Paytm, or tap below:</p>
                    {loadingQr ? (
                      <div className="w-44 h-44 mx-auto flex items-center justify-center text-xs text-slate-400"><RefreshCw className="w-5 h-5 animate-spin text-amber-500" /></div>
                    ) : upiQrData?.qrDataUrl ? (
                      <div className="inline-block p-2 bg-white rounded-xl shadow-xs border border-slate-200">
                        <img src={upiQrData.qrDataUrl} alt="Credit Settlement UPI QR" className="w-44 h-44 mx-auto rounded-lg object-contain" />
                      </div>
                    ) : null}
                    {upiQrData && <UpiPaymentButtons upiUri={upiQrData.upiUri} upiId={upiQrData.upiId} amount={payAmount} />}
                  </div>
                  <form onSubmit={handleSettlePayment} className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">12-Digit UPI Reference / UTR Number <span className="text-rose-500">*</span></label>
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

              <div className="border-b border-slate-200 flex items-center space-x-4 pt-1">
                <button
                  onClick={() => setActiveTab('orders')}
                  className={'pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ' + (activeTab === 'orders' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800')}
                >
                  <Receipt className="w-4 h-4" />
                  <span>Itemized Orders ({accountData.orders?.length || 0})</span>
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={'pb-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ' + (activeTab === 'history' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800')}
                >
                  <Wallet className="w-4 h-4" />
                  <span>Payment History ({accountData.settlements?.length || 0})</span>
                </button>
              </div>

              {activeTab === 'orders' && (
                <div className="space-y-3">
                  {(!accountData.orders || accountData.orders.length === 0) ? (
                    <div className="text-center py-8 text-slate-400 text-xs">No credit orders recorded yet.</div>
                  ) : (
                    accountData.orders.map((order) => {
                      const isCancelled = order.status === 'CANCELLED' || order.payment_status === 'CANCELLED';
                      const isPaid = !isCancelled && order.payment_status === 'PAID';
                      const isDelivered = !isCancelled && !isPaid && order.status === 'COMPLETED';
                      const isPreparing = !isCancelled && !isPaid && !isDelivered;

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
                            {isCancelled ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-rose-100 text-rose-800 border border-rose-200">
                                CANCELLED (NO CHARGE)
                              </span>
                            ) : isPaid ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ✓ PAID
                              </span>
                            ) : isDelivered ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-amber-100 text-amber-900 border border-amber-300">
                                DELIVERED (TO PAY)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-sky-100 text-sky-800 border border-sky-200">
                                ORDERED (IN KITCHEN)
                              </span>
                            )}
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden text-xs">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500">
                                <tr>
                                  <th className="py-1.5 px-3 font-semibold">Item</th>
                                  <th className="py-1.5 px-2 font-semibold text-center">Qty</th>
                                  <th className="py-1.5 px-2 font-semibold text-right">Price</th>
                                  <th className="py-1.5 px-3 font-semibold text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {order.items?.map((item) => (
                                  <tr key={item.id} className="text-slate-700">
                                    <td className="py-1.5 px-3 font-medium text-slate-900">{item.item_name}</td>
                                    <td className="py-1.5 px-2 text-center font-mono font-bold">{item.quantity}</td>
                                    <td className="py-1.5 px-2 text-right font-mono text-slate-600">₹{item.price}</td>
                                    <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">₹{item.total_price}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex justify-between items-center text-xs px-1">
                            <span className="text-slate-500">Order Total</span>
                            <div className="text-right">
                              {isCancelled ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs line-through text-slate-400">₹{order.total_amount}</span>
                                  <span className="font-mono font-extrabold text-xs text-rose-600">₹0 (Cancelled)</span>
                                </div>
                              ) : isPaid ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-extrabold text-sm text-slate-900">₹{order.total_amount}</span>
                                  <span className="text-[11px] font-bold text-emerald-700">(Paid)</span>
                                </div>
                              ) : isDelivered ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-extrabold text-sm text-amber-900">₹{order.total_amount}</span>
                                  <span className="text-[11px] font-extrabold text-amber-700">(Due)</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-semibold text-sm text-slate-700">₹{order.total_amount}</span>
                                  <span className="text-[11px] text-slate-500">(Pending Delivery)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-2.5">
                  {(!accountData.settlements || accountData.settlements.length === 0) ? (
                    <div className="text-center py-8 text-slate-400 text-xs">No previous settlement records found.</div>
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

          {!accountData && !loading && (
            <div className="text-center py-10 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto shadow-sm">
                <Receipt className="w-6 h-6" />
              </div>
              <div className="max-w-xs mx-auto space-y-1">
                <p className="font-bold text-sm text-slate-800">Lookup Your Credit Ledger</p>
                <p className="text-xs text-slate-500">Enter your registered 10-digit mobile number or staff name to view your statement and clear outstanding dues.</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Encrypted & Verified via BMU POS</span>
          </span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-bold text-slate-700 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}