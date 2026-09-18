const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'canteen.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize database schema
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'Utensils',
      display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      is_veg INTEGER DEFAULT 1,
      is_available INTEGER DEFAULT 1,
      is_quick_item INTEGER DEFAULT 0,
      image_emoji TEXT DEFAULT '🍲',
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_no INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_desk TEXT,
      customer_phone TEXT DEFAULT '',
      payment_method TEXT NOT NULL, -- 'UPI' or 'CASH'
      payment_status TEXT NOT NULL, -- 'PAID', 'PENDING'
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'
      total_amount REAL NOT NULL,
      order_type TEXT DEFAULT 'ONLINE', -- 'ONLINE' or 'COUNTER'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER,
      item_name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      department TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      desk TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      balance REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS credit_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      amount_paid REAL NOT NULL,
      payment_method TEXT NOT NULL, -- 'CASH' or 'UPI'
      notes TEXT DEFAULT '',
      settled_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe migrations for existing databases
  try {
    db.exec("ALTER TABLE orders ADD COLUMN customer_phone TEXT DEFAULT ''");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE orders ADD COLUMN customer_utr TEXT DEFAULT ''");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE orders ADD COLUMN customer_department TEXT DEFAULT ''");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE credit_accounts ADD COLUMN department TEXT DEFAULT ''");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec("UPDATE credit_accounts SET department = desk WHERE (department IS NULL OR department = '') AND desk != ''");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE credit_settlements ADD COLUMN utr TEXT DEFAULT ''");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE credit_settlements ADD COLUMN status TEXT DEFAULT 'VERIFIED'");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec("UPDATE orders SET payment_status = 'CANCELLED' WHERE status = 'CANCELLED' AND payment_status = 'PENDING'");
  } catch (e) {
    // Ignore
  }

  // Initialize default settings if missing
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('canteen_name', 'BMU Canteen');
  insertSetting.run('upi_id', 'bmucanteen@upi');
  insertSetting.run('upi_name', 'BMU Office Canteen');
  insertSetting.run('is_open', '1');
  insertSetting.run('operator_pin', '1513');
  db.prepare("UPDATE settings SET value = '1513' WHERE key = 'operator_pin' AND value = '1234'").run();

  // Seed categories if empty
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (catCount.count === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, icon, display_order) VALUES (?, ?, ?)');
    insertCat.run('Breakfast', 'Sun', 1);
    insertCat.run('Snacks & Quick Bites', 'Cookie', 2);
    insertCat.run('Meals & Thali', 'UtensilsCrossed', 3);
    insertCat.run('Beverages', 'Coffee', 4);
    insertCat.run('Desserts', 'Cake', 5);
  }

  // Seed menu items if empty
  const itemCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
  if (itemCount.count === 0) {
    const insertItem = db.prepare(`
      INSERT INTO menu_items (category_id, name, description, price, is_veg, is_available, is_quick_item, image_emoji)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const items = [
      // Breakfast (Cat 1)
      [1, 'Masala Dosa', 'Crispy fermented crepe with spiced potato filling, coconut chutney & sambar', 60, 1, 1, 1, '🥞'],
      [1, 'Idli Sambar (2 pcs)', 'Steamed fluffy rice cakes served with hot lentil sambar and fresh chutney', 40, 1, 1, 1, '🥟'],
      [1, 'Indori Poha', 'Light flattened rice tempered with mustard, peanuts, and fresh coriander', 30, 1, 1, 1, '🍚'],
      [1, 'Puri Bhaji (3 pcs)', 'Hot fluffy deep-fried whole wheat puris with mildly spiced potato masala', 50, 1, 1, 0, '🫓'],

      // Snacks & Quick Bites (Cat 2)
      [2, 'Crispy Samosa (2 pcs)', 'Golden crisp pastry triangles filled with spiced potato and peas with mint chutney', 25, 1, 1, 1, '🥟'],
      [2, 'Paneer Kathi Roll', 'Flaky paratha wrap stuffed with marinated cottage cheese, onions, and sauces', 70, 1, 1, 1, '🌯'],
      [2, 'Veg Grilled Sandwich', 'Triple-layer sandwich with cucumber, tomato, potato, green chutney, and cheese', 50, 1, 1, 1, '🥪'],
      [2, 'French Fries', 'Golden salted potato fries with ketchup and mayo dips', 50, 1, 1, 0, '🍟'],
      [2, 'Classic Masala Maggi', 'Two-minute spiced noodles cooked with peas, carrots, and special tastemaker', 35, 1, 1, 1, '🍜'],

      // Meals & Thali (Cat 3)
      [3, 'Special Veg Thali', 'Paneer sabzi, Dal fry, dry seasonal veg, 3 Butter Rotis, Steamed Rice, Gulab Jamun & Salad', 120, 1, 1, 1, '🍱'],
      [3, 'Mini Meal (Dal Rice Combo)', 'Comforting yellow dal tadka with aromatic basmati jeera rice and pickle', 70, 1, 1, 1, '🍛'],
      [3, 'Rajma Chawal Bowl', 'Slow-cooked Punjabi red kidney beans in thick gravy over fragrant steamed rice', 80, 1, 1, 1, '🍲'],
      [3, 'Paneer Butter Masala with 3 Rotis', 'Rich tomato cashew butter gravy with tender paneer cubes and whole wheat rotis', 130, 1, 1, 0, '🥘'],

      // Beverages (Cat 4)
      [4, 'Adrak Masala Chai', 'Traditional hot brewed milk tea infused with crushed ginger and aromatic cardamom', 15, 1, 1, 1, '☕'],
      [4, 'South Indian Filter Coffee', 'Freshly brewed aromatic chicory coffee with frothy hot milk', 20, 1, 1, 1, '☕'],
      [4, 'Thick Cold Coffee', 'Chilled creamy blended coffee topped with chocolate drizzle', 45, 1, 1, 1, '🥤'],
      [4, 'Fresh Lime Soda (Sweet & Salt)', 'Refreshing bubbly club soda with fresh lime juice, mint, and rock salt', 30, 1, 1, 0, '🍋'],
      [4, 'Sweet Punjabi Lassi', 'Rich, thick churned yogurt drink topped with a layer of cream and pistachios', 35, 1, 1, 0, '🥛'],

      // Desserts (Cat 5)
      [5, 'Gulab Jamun (2 pcs)', 'Warm soft khoya dumplings soaked in rose-scented sugar syrup', 30, 1, 1, 1, '🍯'],
      [5, 'Vanilla / Chocolate Ice Cream', 'Creamy dairy ice cream scoop', 35, 1, 1, 0, '🍨'],
    ];

    for (const item of items) {
      insertItem.run(...item);
    }
  }

  // Seed Non-Veg items if missing
  const nonVegCount = db.prepare('SELECT COUNT(*) as count FROM menu_items WHERE is_veg = 0').get();
  if (nonVegCount.count === 0) {
    const insertItem = db.prepare(`
      INSERT INTO menu_items (category_id, name, description, price, is_veg, is_available, is_quick_item, image_emoji)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const nonVegItems = [
      // Breakfast (Cat 1)
      [1, 'Double Egg Omelette with Butter Toast', 'Fluffy two-egg spiced omelette served with two buttered toasted bread slices', 50, 0, 1, 1, '🍳'],
      [1, 'Egg Bhurji with 2 Parathas', 'Indian style scrambled eggs with onions, green chilies, tomatoes, and warm parathas', 60, 0, 1, 1, '🍳'],

      // Snacks & Quick Bites (Cat 2)
      [2, 'Double Egg Kathi Roll', 'Crispy flaky paratha wrapped with double egg, crunchy onions, and tangy mint sauces', 60, 0, 1, 1, '🌯'],
      [2, 'Chicken Kathi Roll', 'Succulent spiced chicken chunks and onions wrapped in a soft layered paratha', 90, 0, 1, 1, '🌯'],
      [2, 'Grilled Chicken Sandwich', 'Toasted triple-decker sandwich with shredded herb chicken, mayo, and lettuce', 80, 0, 1, 1, '🥪'],
      [2, 'Egg Masala Maggi', 'Classic hot spiced noodles tossed with two scrambled eggs and coriander', 50, 0, 1, 1, '🍜'],

      // Meals & Thali (Cat 3)
      [3, 'Special Chicken Dum Biryani Bowl', 'Aromatic long-grain basmati rice slow-cooked with spiced chicken, served with raita & salan', 150, 0, 1, 1, '🍗'],
      [3, 'Homestyle Egg Curry with Steamed Rice', 'Two boiled fried eggs simmered in rich onion tomato gravy served with basmati rice', 90, 0, 1, 1, '🍛'],
      [3, 'Butter Chicken with 3 Rotis', 'Tender tandoori chicken cooked in rich velvety tomato makhani gravy with butter rotis', 160, 0, 1, 0, '🥘'],
    ];

    for (const item of nonVegItems) {
      insertItem.run(...item);
    }
  }
}

// Generate the next daily token number (uses IST offset +5:30 so tokens reset at midnight IST)
function getNextTokenNumber() {
  const row = db.prepare(`
    SELECT MAX(token_no) as max_token 
    FROM orders 
    WHERE date(created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
  `).get();

  return (row && row.max_token) ? row.max_token + 1 : 1;
}

initDb();

module.exports = {
  db,
  getNextTokenNumber,
};
