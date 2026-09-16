const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const { db, getNextTokenNumber } = require('./db');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  },
});

app.use(cors());
app.use(express.json());

// Helper to get all settings as an object
function getSettingsObj() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Generate UPI Payment Link & QR Code
// Standard NPCI UPI URI scheme:
// upi://pay?pa={UPI_ID}&pn={MERCHANT_NAME}&am={AMOUNT}&cu=INR&tn=Order_{TOKEN}
async function generateUpiQr(amount, tokenNo) {
  try {
    const settings = getSettingsObj();
    const upiId = settings.upi_id || 'bmucanteen@upi';
    const upiName = settings.upi_name || 'BMU Canteen';
    
    // Clean merchant name for URI
    const encodedName = encodeURIComponent(upiName);
    const upiUri = `upi://pay?pa=${upiId}&pn=${encodedName}&am=${Number(amount).toFixed(2)}&cu=INR&tn=Token_${tokenNo}`;
    
    // Generate QR as Data URL (PNG base64)
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      width: 320,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return { upiUri, qrDataUrl };
  } catch (err) {
    console.error('Error generating UPI QR:', err);
    return { upiUri: '', qrDataUrl: '' };
  }
}

// ---------------- REST API ROUTES ----------------

// GET /api/settings
app.get('/api/settings', (req, res) => {
  res.json(getSettingsObj());
});

// POST /api/settings
app.post('/api/settings', (req, res) => {
  const updates = req.body;
  const updateStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  
  const updateMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      updateStmt.run(key, String(value));
    }
  });

  updateMany(Object.entries(updates));
  const newSettings = getSettingsObj();
  io.emit('settings-updated', newSettings);
  res.json(newSettings);
});

// GET /api/menu - Categories and Menu Items
app.get('/api/menu', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY display_order ASC, name ASC').all();
  const items = db.prepare(`
    SELECT m.*, c.name as category_name 
    FROM menu_items m
    LEFT JOIN categories c ON m.category_id = c.id
    ORDER BY m.is_quick_item DESC, m.name ASC
  `).all();

  res.json({ categories, items });
});

// PATCH /api/menu/:id/toggle-stock - Instant 1-Tap Out-of-Stock toggle
app.patch('/api/menu/:id/toggle-stock', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const newStatus = item.is_available === 1 ? 0 : 1;
  db.prepare('UPDATE menu_items SET is_available = ? WHERE id = ?').run(newStatus, id);

  // Broadcast instantly to all connected mobile & operator screens
  io.emit('stock-updated', { id, is_available: newStatus });

  res.json({ id, is_available: newStatus });
});

// POST /api/menu - Add new item
app.post('/api/menu', (req, res) => {
  const { category_id, name, description, price, is_veg, is_quick_item, image_emoji } = req.body;

  if (!name || price == null) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  const result = db.prepare(`
    INSERT INTO menu_items (category_id, name, description, price, is_veg, is_available, is_quick_item, image_emoji)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(category_id || 1, name, description || '', parseFloat(price), is_veg ? 1 : 0, is_quick_item ? 1 : 0, image_emoji || '🍲');

  const created = db.prepare(`
    SELECT m.*, c.name as category_name 
    FROM menu_items m
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  io.emit('menu-changed', { action: 'create', item: created });
  res.status(201).json(created);
});

// PUT /api/menu/:id - Edit item
app.put('/api/menu/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { category_id, name, description, price, is_veg, is_quick_item, image_emoji } = req.body;

  db.prepare(`
    UPDATE menu_items 
    SET category_id = ?, name = ?, description = ?, price = ?, is_veg = ?, is_quick_item = ?, image_emoji = ?
    WHERE id = ?
  `).run(category_id || 1, name, description || '', parseFloat(price), is_veg ? 1 : 0, is_quick_item ? 1 : 0, image_emoji || '🍲', id);

  const updated = db.prepare(`
    SELECT m.*, c.name as category_name 
    FROM menu_items m
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.id = ?
  `).get(id);

  io.emit('menu-changed', { action: 'update', item: updated });
  res.json(updated);
});

// DELETE /api/menu/:id - Delete item
app.delete('/api/menu/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  io.emit('menu-changed', { action: 'delete', id });
  res.json({ success: true, id });
});

// Helper to fetch full order with items
function getOrderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  return { ...order, items };
}

// GET /api/orders/active - Pending, Preparing, Ready
app.get('/api/orders/active', (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders 
    WHERE status IN ('PENDING', 'PREPARING', 'READY')
    ORDER BY CASE status 
      WHEN 'READY' THEN 1 
      WHEN 'PREPARING' THEN 2 
      WHEN 'PENDING' THEN 3 
      ELSE 4 
    END, id ASC
  `).all();

  const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const enrichedOrders = orders.map(order => ({
    ...order,
    items: getItems.all(order.id),
  }));

  res.json(enrichedOrders);
});

// GET /api/orders/history - Completed and cancelled today
app.get('/api/orders/history', (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders 
    WHERE date(created_at, 'localtime') = date('now', 'localtime')
    ORDER BY id DESC
    LIMIT 100
  `).all();

  const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const enriched = orders.map(order => ({
    ...order,
    items: getItems.all(order.id),
  }));

  res.json(enriched);
});

// GET /api/orders/stats - Daily Sales Summary
app.get('/api/orders/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total_amount ELSE 0 END), 0) as total_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'CASH' AND status != 'CANCELLED' THEN total_amount ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'UPI' AND status != 'CANCELLED' THEN total_amount ELSE 0 END), 0) as upi_sales,
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'PREPARING' THEN 1 END) as preparing_count,
      COUNT(CASE WHEN status = 'READY' THEN 1 END) as ready_count,
      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_count
    FROM orders
    WHERE date(created_at, 'localtime') = date('now', 'localtime')
  `).get();

  // Top selling items today
  const topItems = db.prepare(`
    SELECT oi.item_name, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE date(o.created_at, 'localtime') = date('now', 'localtime') AND o.status != 'CANCELLED'
    GROUP BY oi.item_name
    ORDER BY total_qty DESC
    LIMIT 5
  `).all();

  res.json({ ...stats, topItems });
});

// POST /api/orders - Place Order (Online or Counter Fast-POS)
app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, customer_desk, payment_method, order_type, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    // Calculate total and prepare items
    let calculatedTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.menu_item_id);
      if (!menuItem) {
        return res.status(400).json({ error: `Item with id ${item.menu_item_id} not found` });
      }
      if (menuItem.is_available === 0) {
        return res.status(400).json({ error: `Sorry, "${menuItem.name}" just sold out!` });
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const itemTotal = menuItem.price * qty;
      calculatedTotal += itemTotal;

      validatedItems.push({
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        price: menuItem.price,
        quantity: qty,
        total_price: itemTotal,
      });
    }

    const tokenNo = getNextTokenNumber();
    const finalPaymentMethod = payment_method === 'CASH' ? 'CASH' : 'UPI';
    // For counter POS orders, payment can be marked PAID directly if cashier took cash/UPI
    const paymentStatus = (order_type === 'COUNTER' || req.body.payment_status === 'PAID') ? 'PAID' : 'PENDING';
    const finalOrderType = order_type === 'COUNTER' ? 'COUNTER' : 'ONLINE';
    const customerName = (customer_name && customer_name.trim()) || `Guest #${tokenNo}`;

    // Insert order in database transaction
    const createOrderTransaction = db.transaction(() => {
      const orderInsert = db.prepare(`
        INSERT INTO orders (token_no, customer_name, customer_desk, payment_method, payment_status, status, total_amount, order_type)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(
        tokenNo,
        customerName,
        customer_desk || '',
        finalPaymentMethod,
        paymentStatus,
        calculatedTotal,
        finalOrderType
      );

      const orderId = orderInsert.lastInsertRowid;
      const itemInsert = db.prepare(`
        INSERT INTO order_items (order_id, menu_item_id, item_name, price, quantity, total_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const vi of validatedItems) {
        itemInsert.run(orderId, vi.menu_item_id, vi.item_name, vi.price, vi.quantity, vi.total_price);
      }

      return orderId;
    });

    const orderId = createOrderTransaction();
    const createdOrder = getOrderWithItems(orderId);

    // Generate UPI QR if payment is UPI
    let upiData = null;
    if (finalPaymentMethod === 'UPI') {
      upiData = await generateUpiQr(calculatedTotal, tokenNo);
    }

    const fullResponse = {
      ...createdOrder,
      upi: upiData,
    };

    // Broadcast NEW ORDER to operator and public display!
    // Triggers instant Audio Chime on the Operator console!
    io.emit('new-order', fullResponse);

    res.status(201).json(fullResponse);
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Internal server error while placing order' });
  }
});

// GET /api/orders/:id - Get single order details (for mobile customer tracking)
app.get('/api/orders/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const order = getOrderWithItems(id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  let upiData = null;
  if (order.payment_method === 'UPI' && order.payment_status === 'PENDING') {
    upiData = await generateUpiQr(order.total_amount, order.token_no);
  }

  res.json({ ...order, upi: upiData });
});

// PATCH /api/orders/:id/status - Progress Order (Pending -> Preparing -> Ready -> Completed)
app.patch('/api/orders/:id/status', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, payment_status } = req.body;

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const validStatuses = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
  const newStatus = status && validStatuses.includes(status) ? status : existing.status;
  const newPayStatus = payment_status ? payment_status : existing.payment_status;

  db.prepare(`
    UPDATE orders 
    SET status = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(newStatus, newPayStatus, id);

  const updatedOrder = getOrderWithItems(id);

  // Broadcast state change to all clients (Customer tracker, Operator screen, TV display)
  io.emit('order-status-changed', updatedOrder);

  res.json(updatedOrder);
});

// WebSocket Connection Events
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Health check endpoint for Render / Railway container health checks
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Production: Serve built Vite frontend static files
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Catch-all fallback to support client-side routing (Vite React SPA)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return next();
  }
  const indexHtml = path.join(clientDist, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>BMU Canteen API</title></head>
          <body style="font-family:sans-serif;padding:40px;text-align:center;">
            <h2>BMU Canteen API Server is running!</h2>
            <p>To view the web application, build the client with <code>npm run build</code> or run the client dev server.</p>
          </body>
        </html>
      `);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] BMU Canteen Server listening on 0.0.0.0:${PORT}`);
  console.log(`[Server] URL: http://0.0.0.0:${PORT}`);
});
