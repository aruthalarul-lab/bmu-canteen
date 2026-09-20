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

  // Global Canteen Branding Settings
  const [settings, setSettings] = useState({
    canteen_name: 'BMU Canteen',
    canteen_tagline: 'Smart Food Court-Chat and eat',
    canteen_logo: 'utensils',
  });

  // Fetch settings and subscribe to real-time settings updates
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data === 'object') {
          setSettings(prev => ({ ...prev, ...data }));
        }
      })
      .catch(err => console.warn('Could not load settings in App:', err));

    const handleSettingsUpdated = (updated) => {
      if (updated && typeof updated === 'object') {
        setSettings(prev => ({ ...prev, ...updated }));
      }
    };

    socket.on('settings-updated', handleSettingsUpdated);
    return () => {
      socket.off('settings-updated', handleSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    document.title = `${settings?.canteen_name || 'BMU Canteen'} • ${settings?.canteen_tagline || 'Smart Food Court-Chat and eat'}`;
  }, [settings?.canteen_name, settings?.canteen_tagline]);

  // Cart State with localStorage persistence
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('bmu_canteen_cart');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);

  // Active Order State with localStorage persistence
  const [activeOrder, setActiveOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('bmu_active_order');
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && (parsed.status === 'COMPLETED' || parsed.status === 'CANCELLED')) {
        localStorage.removeItem('bmu_active_order');
        return null;
      }
      return (parsed && typeof parsed === 'object' && parsed.id) ? parsed : null;
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

  // Sync Active Order to localStorage (only persist if pending/preparing/ready)
  useEffect(() => {
    if (activeOrder && activeOrder.status !== 'COMPLETED' && activeOrder.status !== 'CANCELLED') {
      localStorage.setItem('bmu_active_order', JSON.stringify(activeOrder));
    } else {
      localStorage.removeItem('bmu_active_order');
    }
  }, [activeOrder]);

  // Proactively verify active order status with server on load, tab focus, or socket reconnect
  useEffect(() => {
    if (!activeOrder?.id) return;

    const verifyOrderStatus = async () => {
      try {
        const res = await fetch(`/api/orders/${activeOrder.id}`);
        if (!res.ok) {
          if (res.status === 404) {
            // Order no longer exists in DB (e.g. wiped or invalid)
            setActiveOrder(null);
            localStorage.removeItem('bmu_active_order');
          }
          return;
        }
        const fresh = await res.json();
        if (fresh.status === 'COMPLETED' || fresh.status === 'CANCELLED') {
          // Order was completed while customer was offline/refreshed
          setActiveOrder(null);
          localStorage.removeItem('bmu_active_order');
        } else if (fresh.status !== activeOrder.status) {
          // Status advanced (e.g. PREPARING or READY)
          setActiveOrder(fresh);
        }
      } catch (err) {
        console.warn('Unable to verify order status with server:', err);
      }
    };

    verifyOrderStatus();

    const handleWindowFocus = () => verifyOrderStatus();
    window.addEventListener('focus', handleWindowFocus);
    socket.on('connect', verifyOrderStatus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      socket.off('connect', verifyOrderStatus);
    };
  }, [activeOrder?.id]);

  const [lastView, setLastView] = useState('customer');

  // Handle URL history state when changing views
  const handleSetView = (view) => {
    if (currentView !== 'display') {
      setLastView(currentView);
    }
    setCurrentView(view);
    const url = view === 'customer' ? '/' : `/?view=${view}`;
    window.history.pushState({}, '', url);
  };

  const handleExitDisplay = () => {
    handleSetView(lastView === 'display' ? 'customer' : (lastView || 'customer'));
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

  // If in TV Display mode, show dedicated kiosk board with integrated exit button
  if (currentView === 'display') {
    return <PublicDisplay onExit={handleExitDisplay} settings={settings} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        currentView={currentView}
        setView={handleSetView}
        cartCount={totalCartCount}
        setIsCartOpen={setIsCartOpen}
        isConnected={isConnected}
        settings={settings}
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
            settings={settings}
          />
        )}

        {currentView === 'operator' && (
          <OperatorConsole />
        )}
      </main>
    </div>
  );
}
