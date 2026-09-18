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

// Middleware to authenticate Operator actions via PIN header
function requireOperatorAuth(req, res, next) {
  const pinHeader = req.headers['x-operator-pin'];
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('operator_pin');
  const storedPin = row ? row.value : '1513';

  if (pinHeader && String(pinHeader).trim() === String(storedPin).trim()) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Valid Operator PIN required.' });
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

    return { upiUri, qrDataUrl, upiId, upiName, amount };
  } catch (err) {
    console.error('Error generating UPI QR:', err);
    return { upiUri: '', qrDataUrl: '', upiId: '', upiName: '' };
  }
}

// ---------------- REST API ROUTES ----------------

// GET /api/settings
app.get('/api/settings', (req, res) => {
  res.json(getSettingsObj());
});

// POST /api/settings - Requires Operator Authentication
app.post('/api/settings', requireOperatorAuth, (req, res) => {
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

// GET /api/qr/site - Return Site URL QR Code
app.get('/api/qr/site', async (req, res) => {
  try {
    const siteUrl = 'https://bmu-canteen.onrender.com';
    const format = req.query.format;

    if (format === 'image') {
      const buffer = await QRCode.toBuffer(siteUrl, {
        width: 600,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      res.setHeader('Content-Type', 'image/png');
      return res.send(buffer);
    }

    if (format === 'svg') {
      const svg = await QRCode.toString(siteUrl, { type: 'svg', margin: 2 });
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(svg);
    }

    const dataUrl = await QRCode.toDataURL(siteUrl, {
      width: 600,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    });

    res.json({
      url: siteUrl,
      qr_data_url: dataUrl
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// GET /api/qr/upi-preview - Generate UPI URI & QR Code before placing order
app.get('/api/qr/upi-preview', async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount) || 0;
    const settings = getSettingsObj();
    const upiId = settings.upi_id || 'bmucanteen@upi';
    const upiName = settings.upi_name || 'BMU Canteen';
    const encodedName = encodeURIComponent(upiName);
    const upiUri = `upi://pay?pa=${upiId}&pn=${encodedName}&am=${Number(amount).toFixed(2)}&cu=INR&tn=BMU_Canteen_Order`;
    
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      width: 320,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({ upiUri, qrDataUrl, upiId, upiName, amount });
  } catch (err) {
    console.error('UPI preview generation error:', err);
    res.status(500).json({ error: 'Failed to generate UPI QR' });
  }
});

// POST /api/operator/verify-pin - Secure Operator Console Access
app.post('/api/operator/verify-pin', (req, res) => {
  const { pin } = req.body;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('operator_pin');
  const storedPin = row ? row.value : '1513';
  if (pin && String(pin).trim() === String(storedPin).trim()) {
    return res.json({ success: true, message: 'Operator authenticated' });
  }
  return res.status(401).json({ error: 'Incorrect PIN' });
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

// PATCH /api/menu/:id/toggle-stock - Instant 1-Tap Out-of-Stock toggle (Requires Operator Auth)
app.patch('/api/menu/:id/toggle-stock', requireOperatorAuth, (req, res) => {
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

// POST /api/menu - Add new item (Requires Operator Auth)
app.post('/api/menu', requireOperatorAuth, (req, res) => {
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

// PUT /api/menu/:id - Edit item (Requires Operator Auth)
app.put('/api/menu/:id', requireOperatorAuth, (req, res) => {
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

// DELETE /api/menu/:id - Delete item (Requires Operator Auth)
app.delete('/api/menu/:id', requireOperatorAuth, (req, res) => {
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

// GET /api/orders/active - Pending, Preparing, Ready (Includes unconfirmed cash orders for counter verification)
app.get('/api/orders/active', (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders 
    WHERE status IN ('PENDING', 'PREPARING', 'READY')
      AND status != 'CANCELLED'
      AND (payment_status = 'PAID' OR payment_method = 'CREDIT' OR order_type = 'COUNTER' OR (payment_method = 'CASH' AND payment_status = 'PENDING'))
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
    WHERE date(created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
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
      COALESCE(SUM(CASE WHEN payment_method = 'CREDIT' AND status != 'CANCELLED' THEN total_amount ELSE 0 END), 0) as credit_sales,
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'PREPARING' THEN 1 END) as preparing_count,
      COUNT(CASE WHEN status = 'READY' THEN 1 END) as ready_count,
      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_count
    FROM orders
    WHERE date(created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
  `).get();

  // Top selling items today
  const topItems = db.prepare(`
    SELECT oi.item_name, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE date(o.created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes') AND o.status != 'CANCELLED'
    GROUP BY oi.item_name
    ORDER BY total_qty DESC
    LIMIT 5
  `).all();

  res.json({ ...stats, topItems });
});

// GET /api/orders/daily-accounting - Complete Daily Accounting with Token Number, Items & Quantities
app.get('/api/orders/daily-accounting', (req, res) => {
  try {
    const targetDate = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : null;

    const dateCondition = targetDate
      ? "date(created_at, '+5 hours', '+30 minutes') = ?"
      : "date(created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')";
    const dateParams = targetDate ? [targetDate] : [];

    // Financial & Order Summary
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status != 'CANCELLED' THEN 1 END) as valid_orders,
        COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total_amount ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' AND status != 'CANCELLED' THEN total_amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'UPI' AND status != 'CANCELLED' THEN total_amount ELSE 0 END), 0) as upi_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'CREDIT' AND status != 'CANCELLED' THEN total_amount ELSE 0 END), 0) as credit_sales,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_orders
      FROM orders
      WHERE ${dateCondition}
    `).get(...dateParams);

    // Total Items Sold Quantity
    const totalItemsRow = db.prepare(`
      SELECT COALESCE(SUM(oi.quantity), 0) as total_items_sold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE ${targetDate ? "date(o.created_at, '+5 hours', '+30 minutes') = ?" : "date(o.created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')"}
        AND o.status != 'CANCELLED'
    `).get(...dateParams);
    summary.total_items_sold = totalItemsRow ? totalItemsRow.total_items_sold : 0;

    // Item-wise Breakdown (Item Name, Total Quantity Sold, Unit Price, Revenue)
    const itemSales = db.prepare(`
      SELECT 
        oi.item_name,
        SUM(oi.quantity) as total_quantity,
        MAX(oi.price) as unit_price,
        SUM(oi.total_price) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE ${targetDate ? "date(o.created_at, '+5 hours', '+30 minutes') = ?" : "date(o.created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')"}
        AND o.status != 'CANCELLED'
      GROUP BY oi.item_name
      ORDER BY total_quantity DESC, total_revenue DESC
    `).all(...dateParams);

    // All Orders for this date with token_no, customer info, items
    const orders = db.prepare(`
      SELECT * FROM orders
      WHERE ${dateCondition}
      ORDER BY token_no ASC, id ASC
    `).all(...dateParams);

    const getItems = db.prepare('SELECT id, item_name, price, quantity, total_price FROM order_items WHERE order_id = ?');
    const enrichedOrders = orders.map(order => ({
      ...order,
      items: getItems.all(order.id),
    }));

    // Resolved date string
    const resolvedDateRow = targetDate 
      ? { target_date: targetDate }
      : db.prepare("SELECT date('now', '+5 hours', '+30 minutes') as target_date").get();

    res.json({
      date: resolvedDateRow ? resolvedDateRow.target_date : targetDate,
      summary,
      item_sales: itemSales,
      orders: enrichedOrders,
    });
  } catch (err) {
    console.error('Error in /api/orders/daily-accounting:', err);
    res.status(500).json({ error: 'Failed to retrieve daily accounting data' });
  }
});

// POST /api/orders - Place Order (Online or Counter Fast-POS)
app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, customer_desk, customer_phone, customer_utr, payment_method, payment_status, order_type, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    // 1. Customer Name is compulsory
    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ error: 'Customer Name is compulsory.' });
    }

    const finalPaymentMethod = payment_method === 'CASH' ? 'CASH' : payment_method === 'CREDIT' ? 'CREDIT' : 'UPI';
    const finalOrderType = order_type === 'COUNTER' ? 'COUNTER' : 'ONLINE';

    // 2. Student / Employee / Desk ID is compulsory for online orders
    if (finalOrderType === 'ONLINE' && (!customer_desk || !customer_desk.trim())) {
      return res.status(400).json({ error: 'Student / Employee / Desk ID is compulsory.' });
    }

    // 3. For Staff Credit online orders, mobile number is mandatory (for counter billing, operator can bill directly)
    if (finalPaymentMethod === 'CREDIT' && finalOrderType === 'ONLINE') {
      const cleanPhone = (customer_phone || '').trim().replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        return res.status(400).json({ error: 'Mobile number (minimum 10 digits) is mandatory for Staff Credit.' });
      }
    }

    // 4. For online UPI orders, payment status must be completed (PAID) before placing order
    if (finalOrderType === 'ONLINE' && finalPaymentMethod === 'UPI') {
      if (payment_status !== 'PAID') {
        return res.status(400).json({ error: 'Payment status must be completed before placing order.' });
      }
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

    // Online cash orders remain PENDING until cashier confirms receipt at Counter 1
    const finalPaymentStatus = (finalPaymentMethod === 'CREDIT' || (finalPaymentMethod === 'CASH' && finalOrderType === 'ONLINE')) ? 'PENDING' : 'PAID';
    const cleanCustomerName = customer_name.trim();
    const cleanCustomerDesk = customer_desk && customer_desk.trim() ? customer_desk.trim() : (finalOrderType === 'COUNTER' ? 'Counter 1 POS' : '');
    const cleanCustomerPhone = customer_phone ? customer_phone.trim() : '';
    const cleanCustomerUtr = customer_utr ? String(customer_utr).trim() : '';

    // Insert order in database transaction (token generated atomically inside transaction)
    const createOrderTransaction = db.transaction(() => {
      const tokenNo = getNextTokenNumber();
      const orderInsert = db.prepare(`
        INSERT INTO orders (token_no, customer_name, customer_desk, customer_phone, customer_utr, payment_method, payment_status, status, total_amount, order_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(
        tokenNo,
        cleanCustomerName,
        cleanCustomerDesk,
        cleanCustomerPhone,
        cleanCustomerUtr,
        finalPaymentMethod,
        finalPaymentStatus,
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

      // If placed on Credit, automatically update customer credit account
      if (finalPaymentMethod === 'CREDIT') {
        const cleanDept = (cleanCustomerDesk || '').trim();
        const existingAcc = db.prepare('SELECT * FROM credit_accounts WHERE LOWER(customer_name) = LOWER(?)').get(cleanCustomerName);
        if (existingAcc) {
          db.prepare(`
            UPDATE credit_accounts 
            SET balance = balance + ?, 
                phone = CASE WHEN ? != '' THEN ? ELSE phone END,
                department = CASE WHEN ? != '' THEN ? ELSE department END,
                desk = CASE WHEN ? != '' THEN ? ELSE desk END,
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(calculatedTotal, cleanCustomerPhone, cleanCustomerPhone, cleanDept, cleanDept, cleanCustomerDesk, cleanCustomerDesk, existingAcc.id);
        } else {
          db.prepare(`
            INSERT INTO credit_accounts (customer_name, department, phone, desk, balance) 
            VALUES (?, ?, ?, ?, ?)
          `).run(cleanCustomerName, cleanDept, cleanCustomerPhone, cleanCustomerDesk, calculatedTotal);
        }
      }

      return { orderId, tokenNo };
    });

    const { orderId, tokenNo } = createOrderTransaction();
    const createdOrder = getOrderWithItems(orderId);

    if (finalPaymentMethod === 'CREDIT') {
      io.emit('credit-updated', { customer_name: cleanCustomerName });
    }

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

// PATCH /api/orders/:id/status - Progress Order (Requires Operator Auth)
app.patch('/api/orders/:id/status', requireOperatorAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, payment_status } = req.body;

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const validStatuses = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
  const newStatus = status && validStatuses.includes(status) ? status : existing.status;
  let newPayStatus = payment_status ? payment_status : existing.payment_status;

  // If order is cancelled, revert pending credit if it was charged to staff credit
  if (newStatus === 'CANCELLED' && existing.status !== 'CANCELLED') {
    if (existing.payment_method === 'CREDIT' && existing.payment_status === 'PENDING') {
      db.prepare(`
        UPDATE credit_accounts 
        SET balance = MAX(0, balance - ?) 
        WHERE LOWER(customer_name) = LOWER(?)
      `).run(existing.total_amount, existing.customer_name);
      io.emit('credit-updated', { customer_name: existing.customer_name });
    }
    // Automatically cancel pending payment status if not explicitly overridden
    if (!payment_status && existing.payment_status === 'PENDING') {
      newPayStatus = 'CANCELLED';
    }
  }

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

// ---------------- CREDIT LEDGER API ROUTES ----------------

// GET /api/credit/accounts - List all customer credit ledger accounts
app.get('/api/credit/accounts', (req, res) => {
  const accounts = db.prepare(`
    SELECT 
      ca.*,
      (SELECT COUNT(*) FROM orders o WHERE LOWER(o.customer_name) = LOWER(ca.customer_name) AND o.payment_method = 'CREDIT' AND o.payment_status = 'PENDING' AND o.status != 'CANCELLED') as unpaid_orders_count,
      (SELECT MAX(created_at) FROM orders o WHERE LOWER(o.customer_name) = LOWER(ca.customer_name) AND o.payment_method = 'CREDIT') as last_order_date
    FROM credit_accounts ca
    ORDER BY ca.balance DESC, ca.customer_name ASC
  `).all();
  res.json(accounts);
});

// POST /api/credit/accounts - Add or update a customer credit profile (Requires Operator Auth)
app.post('/api/credit/accounts', requireOperatorAuth, (req, res) => {
  const { customer_name, department, phone, desk, notes } = req.body;
  if (!customer_name || !customer_name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }
  const cleanName = customer_name.trim();
  const cleanDept = (department || desk || '').trim();
  const cleanPhone = (phone || '').trim();
  const cleanDesk = (desk || cleanDept || '').trim();
  const cleanNotes = (notes || '').trim();

  const existing = db.prepare('SELECT * FROM credit_accounts WHERE LOWER(customer_name) = LOWER(?)').get(cleanName);
  if (existing) {
    db.prepare(`
      UPDATE credit_accounts 
      SET department = ?, phone = ?, desk = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(cleanDept, cleanPhone, cleanDesk, cleanNotes, existing.id);
    const updated = db.prepare('SELECT * FROM credit_accounts WHERE id = ?').get(existing.id);
    io.emit('credit-updated', { customer_name: cleanName });
    return res.json(updated);
  }

  const result = db.prepare(`
    INSERT INTO credit_accounts (customer_name, department, phone, desk, notes, balance) 
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(cleanName, cleanDept, cleanPhone, cleanDesk, cleanNotes);
  const created = db.prepare('SELECT * FROM credit_accounts WHERE id = ?').get(result.lastInsertRowid);
  io.emit('credit-updated', { customer_name: cleanName });
  res.status(201).json(created);
});

// GET /api/credit/accounts/:name - Get individual ledger & order breakdown with item descriptions
app.get('/api/credit/accounts/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name).trim();
  const account = db.prepare('SELECT * FROM credit_accounts WHERE LOWER(customer_name) = LOWER(?)').get(name);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Fetch all orders placed on credit by this customer
  const orders = db.prepare(`
    SELECT * FROM orders 
    WHERE LOWER(customer_name) = LOWER(?) AND payment_method = 'CREDIT'
    ORDER BY id DESC
  `).all(name);

  const getItems = db.prepare(`
    SELECT oi.*, COALESCE(mi.description, '') as description
    FROM order_items oi
    LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE oi.order_id = ?
  `);
  const enrichedOrders = orders.map(o => ({
    ...o,
    items: getItems.all(o.id)
  }));

  // Fetch settlements history
  const settlements = db.prepare(`
    SELECT * FROM credit_settlements 
    WHERE LOWER(customer_name) = LOWER(?)
    ORDER BY id DESC
  `).all(name);

  res.json({
    account,
    orders: enrichedOrders,
    settlements
  });
});

// POST /api/credit/settle - Settle/pay credit balance (Requires Operator Auth)
app.post('/api/credit/settle', requireOperatorAuth, (req, res) => {
  const { customer_name, amount, payment_method, notes } = req.body;
  const settleAmount = parseFloat(amount);
  if (!customer_name || isNaN(settleAmount) || settleAmount <= 0) {
    return res.status(400).json({ error: 'Valid customer name and amount are required' });
  }
  const cleanName = customer_name.trim();
  const account = db.prepare('SELECT * FROM credit_accounts WHERE LOWER(customer_name) = LOWER(?)').get(cleanName);
  if (!account) {
    return res.status(404).json({ error: 'Customer credit account not found' });
  }

  const finalMethod = payment_method === 'UPI' ? 'UPI' : 'CASH';

  const settleTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO credit_settlements (customer_name, amount_paid, payment_method, notes)
      VALUES (?, ?, ?, ?)
    `).run(account.customer_name, settleAmount, finalMethod, notes || '');

    const newBalance = Math.max(0, account.balance - settleAmount);
    db.prepare(`
      UPDATE credit_accounts 
      SET balance = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newBalance, account.id);

    // If fully cleared or settled, mark pending credit orders as PAID
    if (newBalance === 0) {
      db.prepare(`
        UPDATE orders 
        SET payment_status = 'PAID', updated_at = CURRENT_TIMESTAMP 
        WHERE LOWER(customer_name) = LOWER(?) AND payment_method = 'CREDIT' AND payment_status = 'PENDING'
      `).run(account.customer_name);
    }

    return newBalance;
  });

  const newBalance = settleTx();
  io.emit('credit-updated', { customer_name: account.customer_name, balance: newBalance });
  res.json({ success: true, customer_name: account.customer_name, new_balance: newBalance });
});

// GET /api/credit/lookup - Public endpoint for customer to check their own credit statement and dues
app.get('/api/credit/lookup', (req, res) => {
  const query = (req.query.query || req.query.phone || req.query.name || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Search query (phone or name) is required' });
  }

  const numericOnly = query.replace(/\D/g, '');
  let accounts = [];

  // 1. If numeric query with at least 4 digits, search by phone
  if (numericOnly.length >= 4) {
    accounts = db.prepare(`
      SELECT * FROM credit_accounts 
      WHERE phone LIKE ? OR phone = ?
      ORDER BY balance DESC, customer_name ASC
    `).all(`%${numericOnly}%`, query);
  }

  // 2. If no accounts found or query is alphabetical, search by customer name
  if (accounts.length === 0) {
    accounts = db.prepare(`
      SELECT * FROM credit_accounts 
      WHERE LOWER(customer_name) = LOWER(?) OR LOWER(customer_name) LIKE LOWER(?)
      ORDER BY balance DESC, customer_name ASC
    `).all(query, `%${query}%`);
  }

  if (accounts.length === 0) {
    return res.status(404).json({ error: 'No credit account found for this name or phone number' });
  }

  // If exactly 1 account matched, return full enriched details (statement + orders)
  if (accounts.length === 1) {
    const account = accounts[0];
    const orders = db.prepare(`
      SELECT * FROM orders 
      WHERE LOWER(customer_name) = LOWER(?) AND payment_method = 'CREDIT'
      ORDER BY id DESC
    `).all(account.customer_name);

    const getItems = db.prepare(`
      SELECT id, menu_item_id, item_name, price, quantity, total_price
      FROM order_items
      WHERE order_id = ?
    `);

    const enrichedOrders = orders.map(o => ({
      ...o,
      items: getItems.all(o.id)
    }));

    const settlements = db.prepare(`
      SELECT * FROM credit_settlements 
      WHERE LOWER(customer_name) = LOWER(?)
      ORDER BY id DESC
    `).all(account.customer_name);

    const pendingSettlement = db.prepare(`
      SELECT * FROM credit_settlements 
      WHERE LOWER(customer_name) = LOWER(?) AND status = 'PENDING'
      ORDER BY id DESC LIMIT 1
    `).get(account.customer_name);

    return res.json({
      matchType: 'exact',
      account,
      orders: enrichedOrders,
      settlements,
      pendingSettlement: pendingSettlement || null
    });
  }

  // If multiple accounts matched (e.g. partial name match), return clean candidate list with masked phone
  res.json({
    matchType: 'multiple',
    accounts: accounts.map(a => ({
      id: a.id,
      customer_name: a.customer_name,
      department: a.department,
      phone: a.phone ? a.phone.replace(/(\d{2})\d{4}(\d{4})/, '$1****$2') : '',
      balance: a.balance
    }))
  });
});

// GET /api/credit/qr - Generate UPI QR Code & URI for Credit Dues Settlement
app.get('/api/credit/qr', async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount) || 0;
    const name = (req.query.name || 'BMU Staff').trim();
    const settings = getSettingsObj();
    const upiId = settings.upi_id || 'bmucanteen@upi';
    const upiName = settings.upi_name || 'BMU Canteen';
    const encodedName = encodeURIComponent(upiName);
    const safeNote = encodeURIComponent(`Credit_${name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`);
    const upiUri = `upi://pay?pa=${upiId}&pn=${encodedName}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${safeNote}`;
    
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      width: 320,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({ upiUri, qrDataUrl, upiId, upiName, amount, customer_name: name });
  } catch (err) {
    console.error('Credit UPI preview generation error:', err);
    res.status(500).json({ error: 'Failed to generate UPI QR' });
  }
});

// POST /api/credit/customer-settle - Customer self-settlement via UPI with UTR (Awaiting Operator Verification)
app.post('/api/credit/customer-settle', (req, res) => {
  const { customer_name, phone, amount, payment_method, utr, notes } = req.body;
  const settleAmount = parseFloat(amount);
  if ((!customer_name && !phone) || isNaN(settleAmount) || settleAmount <= 0) {
    return res.status(400).json({ error: 'Valid customer name/phone and positive payment amount are required' });
  }

  const cleanName = (customer_name || '').trim();
  const cleanPhone = (phone || '').trim();
  const cleanUtr = (utr || '').trim();

  // Search by exact name, or by phone
  let account = null;
  if (cleanName) {
    account = db.prepare('SELECT * FROM credit_accounts WHERE LOWER(customer_name) = LOWER(?)').get(cleanName);
  }
  if (!account && cleanPhone) {
    account = db.prepare('SELECT * FROM credit_accounts WHERE phone = ? OR phone LIKE ?').get(cleanPhone, `%${cleanPhone.slice(-10)}`);
  }

  if (!account) {
    return res.status(404).json({ error: 'Customer credit account not found' });
  }

  const finalMethod = 'UPI';
  const finalNotes = cleanUtr ? `Customer UPI Online (UTR: ${cleanUtr})` : (notes || 'Customer UPI Online Settlement');

  // Insert settlement with status 'PENDING' - balance is NOT deducted until operator clicks "Received / Verify"
  const result = db.prepare(`
    INSERT INTO credit_settlements (customer_name, amount_paid, payment_method, notes, utr, status)
    VALUES (?, ?, ?, ?, ?, 'PENDING')
  `).run(account.customer_name, settleAmount, finalMethod, finalNotes, cleanUtr);

  const settlementId = result.lastInsertRowid;

  // Broadcast to Operator Console that a new customer credit payment needs verification
  io.emit('credit-settlement-submitted', {
    id: settlementId,
    customer_name: account.customer_name,
    amount_paid: settleAmount,
    payment_method: finalMethod,
    utr: cleanUtr,
    department: account.department || '',
    phone: account.phone || '',
    current_balance: account.balance,
    settled_at: new Date().toISOString()
  });

  res.json({
    success: true,
    status: 'PENDING',
    settlement_id: settlementId,
    message: 'Payment submitted! Awaiting cashier verification.',
    customer_name: account.customer_name,
    amount_paid: settleAmount,
    current_balance: account.balance,
    utr: cleanUtr
  });
});

// GET /api/credit/pending-settlements - List all credit settlements awaiting operator confirmation (Requires Operator Auth)
app.get('/api/credit/pending-settlements', requireOperatorAuth, (req, res) => {
  const pending = db.prepare(`
    SELECT cs.*, ca.department, ca.phone, ca.balance as current_balance
    FROM credit_settlements cs
    LEFT JOIN credit_accounts ca ON LOWER(cs.customer_name) = LOWER(ca.customer_name)
    WHERE cs.status = 'PENDING'
    ORDER BY cs.id DESC
  `).all();
  res.json(pending);
});

// POST /api/credit/settlements/:id/verify - Cashier clicks "Received / Verified" to confirm receipt
app.post('/api/credit/settlements/:id/verify', requireOperatorAuth, (req, res) => {
  const settlementId = parseInt(req.params.id);
  const settlement = db.prepare('SELECT * FROM credit_settlements WHERE id = ?').get(settlementId);
  if (!settlement) {
    return res.status(404).json({ error: 'Settlement record not found' });
  }
  if (settlement.status === 'VERIFIED') {
    return res.status(400).json({ error: 'Settlement is already verified' });
  }

  const account = db.prepare('SELECT * FROM credit_accounts WHERE LOWER(customer_name) = LOWER(?)').get(settlement.customer_name);
  if (!account) {
    return res.status(404).json({ error: 'Customer account not found' });
  }

  const settleTx = db.transaction(() => {
    // 1. Mark settlement status as VERIFIED
    db.prepare("UPDATE credit_settlements SET status = 'VERIFIED' WHERE id = ?").run(settlementId);

    // 2. Deduct customer balance
    const newBalance = Math.max(0, account.balance - settlement.amount_paid);
    db.prepare(`
      UPDATE credit_accounts 
      SET balance = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newBalance, account.id);

    // 3. If fully cleared or settled, mark pending credit orders as PAID
    if (newBalance === 0) {
      db.prepare(`
        UPDATE orders 
        SET payment_status = 'PAID', updated_at = CURRENT_TIMESTAMP 
        WHERE LOWER(customer_name) = LOWER(?) AND payment_method = 'CREDIT' AND payment_status = 'PENDING'
      `).run(account.customer_name);
    }

    return newBalance;
  });

  const newBalance = settleTx();

  // Broadcast real-time events across system
  io.emit('credit-settlement-verified', {
    settlement_id: settlementId,
    customer_name: account.customer_name,
    amount: settlement.amount_paid,
    new_balance: newBalance,
    utr: settlement.utr
  });
  io.emit('credit-updated', { customer_name: account.customer_name, balance: newBalance });
  io.emit('order-updated', { customer_name: account.customer_name });

  res.json({
    success: true,
    message: 'Settlement verified and balance updated successfully',
    settlement_id: settlementId,
    customer_name: account.customer_name,
    amount_paid: settlement.amount_paid,
    new_balance: newBalance,
    utr: settlement.utr
  });
});

// POST /api/credit/settlements/:id/reject - Cashier declines / rejects an invalid UTR settlement (Requires Operator Auth)
app.post('/api/credit/settlements/:id/reject', requireOperatorAuth, (req, res) => {
  const settlementId = parseInt(req.params.id);
  const settlement = db.prepare('SELECT * FROM credit_settlements WHERE id = ?').get(settlementId);
  if (!settlement) {
    return res.status(404).json({ error: 'Settlement record not found' });
  }

  db.prepare("UPDATE credit_settlements SET status = 'REJECTED' WHERE id = ?").run(settlementId);

  io.emit('credit-settlement-rejected', {
    settlement_id: settlementId,
    customer_name: settlement.customer_name
  });
  io.emit('credit-updated', { customer_name: settlement.customer_name });

  res.json({
    success: true,
    message: 'Settlement rejected',
    settlement_id: settlementId
  });
});

// GET /api/credit/backup - Export full credit ledger backup (Requires Operator Auth)
app.get('/api/credit/backup', requireOperatorAuth, (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM credit_accounts ORDER BY id ASC').all();
    const settlements = db.prepare('SELECT * FROM credit_settlements ORDER BY id ASC').all();
    const orders = db.prepare(`
      SELECT o.*, 
        (SELECT json_group_array(json_object(
          'id', oi.id,
          'menu_item_id', oi.menu_item_id,
          'item_name', oi.item_name,
          'price', oi.price,
          'quantity', oi.quantity,
          'total_price', oi.total_price,
          'description', COALESCE(mi.description, '')
        )) 
        FROM order_items oi 
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
        WHERE oi.order_id = o.id
      ) as items_json
      FROM orders o 
      WHERE o.payment_method = 'CREDIT'
      ORDER BY o.id ASC
    `).all();

    const parsedOrders = orders.map(o => ({
      ...o,
      items: o.items_json ? JSON.parse(o.items_json) : []
    }));

    const totalDue = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

    const backup = {
      system: 'BMU Canteen Credit Ledger',
      version: 1,
      exported_at: new Date().toISOString(),
      accounts_count: accounts.length,
      total_due: totalDue,
      credit_accounts: accounts,
      credit_settlements: settlements,
      credit_orders: parsedOrders
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="credit_ledger_backup_${new Date().toISOString().slice(0,10)}.json"`);
    res.json(backup);
  } catch (err) {
    console.error('[Credit Backup Error]', err);
    res.status(500).json({ error: 'Failed to generate credit backup: ' + err.message });
  }
});

// POST /api/credit/restore - Restore/import credit ledger backup (Requires Operator Auth)
app.post('/api/credit/restore', requireOperatorAuth, (req, res) => {
  try {
    const data = req.body;
    const accounts = Array.isArray(data) ? data : (data.credit_accounts || []);
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ error: 'Invalid backup file: no credit accounts found' });
    }

    const restoreTx = db.transaction(() => {
      let upsertedCount = 0;
      const checkStmt = db.prepare('SELECT id FROM credit_accounts WHERE LOWER(customer_name) = LOWER(?)');
      const updateStmt = db.prepare(`
        UPDATE credit_accounts 
        SET department = ?, phone = ?, desk = ?, notes = ?, balance = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      const insertStmt = db.prepare(`
        INSERT INTO credit_accounts (customer_name, department, phone, desk, notes, balance) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const acc of accounts) {
        if (!acc.customer_name || !acc.customer_name.trim()) continue;
        const name = acc.customer_name.trim();
        const dept = (acc.department || acc.desk || '').trim();
        const phone = (acc.phone || '').trim();
        const desk = (acc.desk || dept || '').trim();
        const notes = (acc.notes || '').trim();
        const balance = isNaN(parseFloat(acc.balance)) ? 0 : parseFloat(acc.balance);

        const existing = checkStmt.get(name);
        if (existing) {
          updateStmt.run(dept, phone, desk, notes, balance, existing.id);
        } else {
          insertStmt.run(name, dept, phone, desk, notes, balance);
        }
        upsertedCount++;
      }

      // Restore settlements if present
      if (Array.isArray(data.credit_settlements) && data.credit_settlements.length > 0) {
        const insertSettlement = db.prepare(`
          INSERT INTO credit_settlements (customer_name, amount_paid, payment_method, notes, settled_at)
          VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        `);
        for (const s of data.credit_settlements) {
          if (s.customer_name && s.amount_paid) {
            insertSettlement.run(s.customer_name, s.amount_paid, s.payment_method || 'CASH', s.notes || '', s.settled_at || null);
          }
        }
      }

      return upsertedCount;
    });

    const count = restoreTx();
    io.emit('credit-updated', { type: 'restored', count });
    res.json({ success: true, count, message: `Successfully restored ${count} credit accounts.` });
  } catch (err) {
    console.error('[Credit Restore Error]', err);
    res.status(500).json({ error: 'Failed to restore credit backup: ' + err.message });
  }
});

// GET /api/credit/stats - Summary metrics for Credit
app.get('/api/credit/stats', (req, res) => {
  const totalDue = db.prepare('SELECT COALESCE(SUM(balance), 0) as total_due FROM credit_accounts WHERE balance > 0').get().total_due;
  const activeDebtors = db.prepare('SELECT COUNT(*) as count FROM credit_accounts WHERE balance > 0').get().count;
  const settledWeek = db.prepare(`
    SELECT COALESCE(SUM(amount_paid), 0) as total 
    FROM credit_settlements 
    WHERE date(settled_at, '+5 hours', '+30 minutes') >= date('now', '+5 hours', '+30 minutes', '-7 days')
  `).get().total;
  const recentSettlements = db.prepare(`
    SELECT * FROM credit_settlements 
    ORDER BY id DESC LIMIT 15
  `).all();

  res.json({
    total_due: totalDue,
    active_debtors: activeDebtors,
    settled_week: settledWeek,
    recent_settlements: recentSettlements
  });
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

module.exports = {
  app,
  server,
  requireOperatorAuth
};
