import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import CustomerMenu from './pages/CustomerMenu';
import OperatorConsole from './pages/OperatorConsole';
import PublicDisplay from './pages/PublicDisplay';
import socket from './services/socket';

export default function App() {
  // Determine initial view from URL path or search query parameter
  const getInitialView = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'operator' || window.location.pathname === '/operator') return 'operator';
    if (params.get('view') === 'display' || window.location.pathname === '/display') return 'display';
    return 'customer';
  };

  const [currentView, setCurrentView] = useState(getInitialView);
  const [isConnected, setIsConnected] = useState(socket.connected);

  // Cart State with localStorage persistence
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('bmu_canteen_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);

  // Active Order State with localStorage persistence
  const [activeOrder, setActiveOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('bmu_active_order');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Keep socket connection status updated
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Sync Cart to localStorage
  useEffect(() => {
    localStorage.setItem('bmu_canteen_cart', JSON.stringify(cart));
  }, [cart]);

  // Sync Active Order to localStorage
  useEffect(() => {
    if (activeOrder) {
      localStorage.setItem('bmu_active_order', JSON.stringify(activeOrder));
    } else {
      localStorage.removeItem('bmu_active_order');
    }
  }, [activeOrder]);

  // Handle URL history state when changing views
  const handleSetView = (view) => {
    setCurrentView(view);
    const url = view === 'customer' ? '/' : `/?view=${view}`;
    window.history.pushState({}, '', url);
  };

  // Cart Actions
  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart(prev => prev.filter(i => i.id !== itemId));
  };

  const updateQuantity = (itemId, newQty) => {
    if (newQty <= 0) {
      removeFromCart(itemId);
    } else {
      setCart(prev => prev.map(i => i.id === itemId ? { ...i, quantity: newQty } : i));
    }
  };

  const clearCart = () => {
    setCart([]);
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // If in TV Display mode, hide standard navbar to show a distraction-free full-screen kiosk board
  if (currentView === 'display') {
    return (
      <div className="relative">
        <button
          onClick={() => handleSetView('operator')}
          className="fixed top-2 right-2 opacity-10 hover:opacity-100 z-50 text-xs text-white bg-black/60 px-2 py-1 rounded transition-opacity"
          title="Exit TV Mode"
        >
          Exit Display
        </button>
        <PublicDisplay />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        currentView={currentView}
        setView={handleSetView}
        cartCount={totalCartCount}
        setIsCartOpen={setIsCartOpen}
        isConnected={isConnected}
      />

      <main className="flex-1">
        {currentView === 'customer' && (
          <CustomerMenu
            cart={cart}
            addToCart={addToCart}
            removeFromCart={removeFromCart}
            updateQuantity={updateQuantity}
            clearCart={clearCart}
            isCartOpen={isCartOpen}
            setIsCartOpen={setIsCartOpen}
            activeOrder={activeOrder}
            setActiveOrder={setActiveOrder}
          />
        )}

        {currentView === 'operator' && (
          <OperatorConsole />
        )}
      </main>
    </div>
  );
}
