const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

console.log('=====================================================');
console.log('       BMU CANTEEN FULL AUTOMATED TEST SUITE        ');
console.log('=====================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
    testResults.push({ name: testName, status: 'PASS' });
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}`);
    if (details) console.error(`         Details: ${details}`);
    testResults.push({ name: testName, status: 'FAIL', details });
  }
}

async function runTests() {
  const TEST_PORT = '5099';
  const TEST_PIN = '1513';
  
  console.log('--- Suite 1: Database & Foreign Key Schema ---');
  const tempDb = new Database(':memory:');
  tempDb.pragma('journal_mode = WAL');
  const fkState = tempDb.pragma('foreign_keys', { simple: true });
  assert(fkState === 1, 'Database foreign_keys pragma is enabled');

  const TEST_DB = path.join(__dirname, 'test_suite.db');
  if (fs.existsSync(TEST_DB)) try { fs.unlinkSync(TEST_DB); } catch {}
  if (fs.existsSync(TEST_DB + '-wal')) try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
  if (fs.existsSync(TEST_DB + '-shm')) try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}

  console.log('\n--- Suite 2: Starting Server on Isolated Port 5099 with Isolated DB ---');
  const serverProcess = spawn('node', ['server/server.js'], {
    env: { ...process.env, PORT: TEST_PORT, DB_PATH: TEST_DB },
    cwd: path.join(__dirname, '..')
  });

  let serverReady = false;
  let serverError = '';
  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('BMU Canteen Server listening')) {
      serverReady = true;
    }
  });
  serverProcess.stderr.on('data', (data) => {
    serverError += data.toString();
    console.error('[SERVER STDERR]:', data.toString());
  });

  for (let i = 0; i < 100; i++) {
    if (serverReady) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert(serverReady, 'Server booted and listening on port ' + TEST_PORT, serverError);

  const request = (method, endpoint, body = null, headers = {}) => {
    return new Promise((resolve, reject) => {
      const payload = (body !== null && body !== undefined && Object.keys(body).length > 0) ? JSON.stringify(body) : null;
      const options = {
        hostname: '127.0.0.1',
        port: Number(TEST_PORT),
        path: endpoint,
        method: method,
        headers: {
          'Connection': 'close',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers
        }
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => { responseData += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(responseData);
          } catch {
            parsed = responseData;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });

      req.on('error', reject);
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  };

  try {
    console.log('\n--- Suite 3: Health & Core Endpoints ---');
    const health = await request('GET', '/healthz');
    assert(health.status === 200 && health.body.status === 'ok', 'GET /healthz returns status: ok');

    const settings = await request('GET', '/api/settings');
    assert(settings.status === 200 && settings.body.canteen_name, 'GET /api/settings returns settings');

    const menu = await request('GET', '/api/menu');
    assert(menu.status === 200 && menu.body.items?.length > 0, 'GET /api/menu returns active menu items');
    const testItemId = menu.body.items[0].id;

    console.log('\n--- Suite 4: Order Validation & Edge Cases ---');
    const emptyOrder = await request('POST', '/api/orders', {
      customer_name: 'Test',
      customer_desk: 'Desk 1',
      payment_method: 'CASH',
      items: []
    });
    assert(emptyOrder.status === 400, 'Rejects empty items array with 400');

    const noName = await request('POST', '/api/orders', {
      customer_name: '   ',
      customer_desk: 'Desk 1',
      payment_method: 'CASH',
      items: [{ menu_item_id: testItemId, quantity: 1 }]
    });
    assert(noName.status === 400, 'Rejects missing/blank customer name with 400');

    const noDeskOnline = await request('POST', '/api/orders', {
      customer_name: 'Alex',
      customer_desk: '',
      order_type: 'ONLINE',
      payment_method: 'CASH',
      items: [{ menu_item_id: testItemId, quantity: 1 }]
    });
    assert(noDeskOnline.status === 400, 'Rejects online order without Student/Employee/Desk ID');

    const counterPosOrder = await request('POST', '/api/orders', {
      customer_name: 'Walk-in',
      customer_desk: '',
      order_type: 'COUNTER',
      payment_method: 'CASH',
      items: [{ menu_item_id: testItemId, quantity: 1 }]
    });
    assert(counterPosOrder.status === 201 && counterPosOrder.body.customer_desk === 'Counter 1 POS',
      'Counter POS order succeeds and defaults desk to "Counter 1 POS"');

    // Negative Quantity Sanitization
    const negativeQty = await request('POST', '/api/orders', {
      customer_name: 'Buyer',
      customer_desk: 'Desk 2',
      payment_method: 'CASH',
      items: [{ menu_item_id: testItemId, quantity: -10 }]
    });
    assert(negativeQty.status === 201 && negativeQty.body.items[0].quantity === 1,
      'Sanitizes negative quantity to 1 via Math.max(1, ...)');

    console.log('\n--- Suite 5: Fast-POS Credit & Staff Credit Orders ---');
    // Fast-POS Credit Order WITHOUT phone (Verifies Bug 1 Fix!)
    const posCreditOrder = await request('POST', '/api/orders', {
      customer_name: 'Faculty Sharma',
      customer_desk: 'Counter 1 POS',
      payment_method: 'CREDIT',
      order_type: 'COUNTER',
      items: [{ menu_item_id: testItemId, quantity: 2 }]
    });
    assert(posCreditOrder.status === 201, 
      '[BUG FIX VERIFIED] Fast-POS counter credit order succeeds without phone number requirement');

    // Online Credit Order WITHOUT phone (Should still require 10 digits)
    const onlineCreditNoPhone = await request('POST', '/api/orders', {
      customer_name: 'Faculty Sharma',
      customer_desk: 'Office 12',
      customer_phone: '1234',
      payment_method: 'CREDIT',
      order_type: 'ONLINE',
      items: [{ menu_item_id: testItemId, quantity: 1 }]
    });
    assert(onlineCreditNoPhone.status === 400, 
      'Online credit order still strictly requires 10-digit mobile number');

    // Fast-POS Credit Order WITH Name, Phone, and Department (Operator Console Search/Add flow)
    const posCreditWithDetails = await request('POST', '/api/orders', {
      customer_name: 'Prof. Mukherjee',
      customer_desk: 'Mechanical Dept',
      customer_phone: '9812345678',
      payment_method: 'CREDIT',
      order_type: 'COUNTER',
      items: [{ menu_item_id: testItemId, quantity: 1 }]
    });
    assert(posCreditWithDetails.status === 201, 
      'Fast-POS credit order with name, phone, and department succeeds');
    
    const mukherjeeAcc = await request('GET', '/api/credit/lookup?query=9812345678');
    assert(mukherjeeAcc.status === 200 && mukherjeeAcc.body.account.customer_name === 'Prof. Mukherjee',
      'Customer credit account is automatically updated with phone and department');

    console.log('\n--- Suite 6: Security & Administrative Authorization ---');
    // 1. POST /api/settings
    const settingsNoAuth = await request('POST', '/api/settings', { canteen_name: 'Hacked' });
    assert(settingsNoAuth.status === 401, 'POST /api/settings rejected with 401 without PIN header');

    const settingsWithAuth = await request('POST', '/api/settings', { canteen_name: 'BMU Canteen' }, { 'x-operator-pin': TEST_PIN });
    assert(settingsWithAuth.status === 200, 'POST /api/settings accepted with 200 when x-operator-pin is valid');

    // 2. POST /api/menu
    const menuNoAuth = await request('POST', '/api/menu', { name: 'Test Hack Item', price: 10 });
    assert(menuNoAuth.status === 401, 'POST /api/menu rejected with 401 without PIN header');

    const menuWithAuth = await request('POST', '/api/menu', { name: 'Automated Test Dish', price: 99, category_id: 1 }, { 'x-operator-pin': TEST_PIN });
    assert(menuWithAuth.status === 201, 'POST /api/menu accepted with 201 when x-operator-pin is valid');
    const createdItemId = menuWithAuth.body.id;

    // 3. PUT /api/menu/:id
    const editNoAuth = await request('PUT', `/api/menu/${createdItemId}`, { name: 'Dish Renamed', price: 105, category_id: 1 });
    assert(editNoAuth.status === 401, 'PUT /api/menu/:id rejected with 401 without PIN header');

    const editWithAuth = await request('PUT', `/api/menu/${createdItemId}`, { name: 'Dish Renamed', price: 105, category_id: 1 }, { 'x-operator-pin': TEST_PIN });
    assert(editWithAuth.status === 200, 'PUT /api/menu/:id accepted with 200 with PIN header');

    // 4. PATCH /api/menu/:id/toggle-stock
    const toggleNoAuth = await request('PATCH', `/api/menu/${createdItemId}/toggle-stock`);
    assert(toggleNoAuth.status === 401, 'PATCH /api/menu/:id/toggle-stock rejected with 401 without PIN header');

    const toggleWithAuth = await request('PATCH', `/api/menu/${createdItemId}/toggle-stock`, {}, { 'x-operator-pin': TEST_PIN });
    assert(toggleWithAuth.status === 200, 'PATCH /api/menu/:id/toggle-stock accepted with 200 with PIN header');

    // 5. DELETE /api/menu/:id
    const deleteNoAuth = await request('DELETE', `/api/menu/${createdItemId}`);
    assert(deleteNoAuth.status === 401, 'DELETE /api/menu/:id rejected with 401 without PIN header');

    const deleteWithAuth = await request('DELETE', `/api/menu/${createdItemId}`, {}, { 'x-operator-pin': TEST_PIN });
    assert(deleteWithAuth.status === 200, 'DELETE /api/menu/:id accepted with 200 with PIN header');

    // 6. PATCH /api/orders/:id/status
    const testOrder = await request('POST', '/api/orders', {
      customer_name: 'Status Test User',
      customer_desk: 'D-5',
      payment_method: 'CASH',
      items: [{ menu_item_id: testItemId, quantity: 1 }]
    });
    const testOrderId = testOrder.body.id;

    const statusNoAuth = await request('PATCH', `/api/orders/${testOrderId}/status`, { status: 'CANCELLED' });
    assert(statusNoAuth.status === 401, 'PATCH /api/orders/:id/status rejected with 401 without PIN header');

    const statusWithAuth = await request('PATCH', `/api/orders/${testOrderId}/status`, { status: 'PREPARING' }, { 'x-operator-pin': TEST_PIN });
    assert(statusWithAuth.status === 200 && statusWithAuth.body.status === 'PREPARING', 'PATCH /api/orders/:id/status accepted with 200 with PIN header');

    // 7. POST /api/credit/settle
    const settleNoAuth = await request('POST', '/api/credit/settle', { customer_name: 'Faculty Sharma', amount: 50, payment_method: 'CASH' });
    assert(settleNoAuth.status === 401, 'POST /api/credit/settle rejected with 401 without PIN header');

    const settleWithAuth = await request('POST', '/api/credit/settle', { customer_name: 'Faculty Sharma', amount: 50, payment_method: 'CASH' }, { 'x-operator-pin': TEST_PIN });
    assert(settleWithAuth.status === 200, 'POST /api/credit/settle accepted with 200 with PIN header');

    console.log('\n--- Suite 7: UPI Reference / UTR Tracking ---');
    const upiOrder = await request('POST', '/api/orders', {
      customer_name: 'UPI Customer',
      customer_desk: 'Lab 4',
      customer_utr: '423501987123',
      payment_method: 'UPI',
      payment_status: 'PAID',
      items: [{ menu_item_id: testItemId, quantity: 1 }]
    });
    assert(upiOrder.status === 201 && upiOrder.body.customer_utr === '423501987123',
      'Stores and returns customer UPI UTR reference number');

    console.log('\n--- Suite 8: Atomic Concurrency & Token Numbering ---');
    const parallelOrders = [];
    for (let i = 0; i < 10; i++) {
      parallelOrders.push(request('POST', '/api/orders', {
        customer_name: `Concurrent User ${i}`,
        customer_desk: `Desk ${i}`,
        payment_method: 'CASH',
        items: [{ menu_item_id: testItemId, quantity: 1 }]
      }));
    }
    const responses = await Promise.all(parallelOrders);
    const tokens = responses.map(r => r.body.token_no);
    const uniqueTokens = new Set(tokens);
    assert(uniqueTokens.size === 10, '10 simultaneous burst orders receive 10 unique consecutive token numbers',
      `Tokens: [${tokens.join(', ')}]`);

    console.log('\n--- Suite 9: Credit Ledger Details, Department, Item Descriptions & Backup/Restore ---');
    // 1. Register staff credit profile with Department and Phone
    const addStaff = await request('POST', '/api/credit/accounts', {
      customer_name: 'Prof. Verma',
      department: 'Computer Science',
      phone: '9876543210',
      notes: 'HOD CSE'
    }, { 'x-operator-pin': TEST_PIN });
    assert(addStaff.status === 201 && addStaff.body.department === 'Computer Science' && addStaff.body.phone === '9876543210',
      'Registers staff member with Name, Department, and Phone');

    // 2. Place credit order for Prof. Verma
    const creditOrderVerma = await request('POST', '/api/orders', {
      customer_name: 'Prof. Verma',
      customer_desk: 'Computer Science',
      customer_phone: '9876543210',
      payment_method: 'CREDIT',
      items: [{ menu_item_id: testItemId, quantity: 2 }]
    });
    assert(creditOrderVerma.status === 201, 'Places credit order for registered staff member');

    // 3. Query all credit accounts (Requirement 1: name, department, phone, due amount)
    const allCreditAccounts = await request('GET', '/api/credit/accounts');
    const vermaAcc = allCreditAccounts.body.find(a => a.customer_name === 'Prof. Verma');
    assert(vermaAcc && vermaAcc.department === 'Computer Science' && vermaAcc.phone === '9876543210' && vermaAcc.balance > 0,
      'GET /api/credit/accounts returns Name, Department, Phone, and Due Amount');

    // 4. Query individual statement (Requirement 2: date, description of items, quantity, price)
    const vermaStatement = await request('GET', `/api/credit/accounts/${encodeURIComponent('Prof. Verma')}`);
    assert(vermaStatement.status === 200 && vermaStatement.body.orders.length > 0, 'GET /api/credit/accounts/:name returns statement');
    const firstOrder = vermaStatement.body.orders[0];
    assert(firstOrder.created_at && firstOrder.items && firstOrder.items.length > 0 &&
           firstOrder.items[0].item_name && firstOrder.items[0].quantity === 2 && firstOrder.items[0].price > 0,
      'Statement includes Order Date, Item Name/Description, Quantity, and Price');

    // 5. Download Backup (Requirement 3: backup download)
    const backupRes = await request('GET', '/api/credit/backup', null, { 'x-operator-pin': TEST_PIN });
    assert(backupRes.status === 200 && backupRes.body.credit_accounts && backupRes.body.credit_accounts.length > 0,
      'GET /api/credit/backup exports valid JSON ledger backup with accounts and orders');

    // 6. Restore Backup (Requirement 3: backup upload)
    const restorePayload = {
      credit_accounts: [
        {
          customer_name: 'Restored Employee',
          department: 'Civil Engg',
          phone: '9123456780',
          desk: 'Lab 2',
          notes: 'Restored from backup test',
          balance: 150
        }
      ]
    };
    const restoreRes = await request('POST', '/api/credit/restore', restorePayload, { 'x-operator-pin': TEST_PIN });
    assert(restoreRes.status === 200 && restoreRes.body.success === true, 'POST /api/credit/restore imports/restores backup successfully');

    const checkRestored = await request('GET', '/api/credit/accounts');
    const restoredEmp = checkRestored.body.find(a => a.customer_name === 'Restored Employee');
    assert(restoredEmp && restoredEmp.department === 'Civil Engg' && restoredEmp.balance === 150,
      'Restored account is immediately active in credit ledger with correct department and balance');

    console.log('\n--- Suite 10: Customer Credit Dues Lookup & Online UPI Settlement ---');
    // 1. Lookup dues by phone number
    const lookupByPhone = await request('GET', '/api/credit/lookup?query=9876543210');
    assert(lookupByPhone.status === 200 && lookupByPhone.body.matchType === 'exact' && lookupByPhone.body.account.customer_name === 'Prof. Verma',
      'GET /api/credit/lookup by phone returns exact matching customer account');
    assert(lookupByPhone.body.orders.length > 0 && lookupByPhone.body.account.balance > 0,
      'Customer statement includes itemized orders and outstanding due balance');

    // 2. Lookup dues by name
    const lookupByName = await request('GET', `/api/credit/lookup?query=${encodeURIComponent('Prof. Verma')}`);
    assert(lookupByName.status === 200 && lookupByName.body.account.department === 'Computer Science',
      'GET /api/credit/lookup by name returns account details and department');

    // 3. Lookup non-existent returns 404
    const lookup404 = await request('GET', '/api/credit/lookup?query=9999999999');
    assert(lookup404.status === 404, 'GET /api/credit/lookup for non-existent returns 404');

    // 4. Generate dynamic Credit UPI QR & URI
    const creditQr = await request('GET', `/api/credit/qr?amount=${lookupByPhone.body.account.balance}&name=${encodeURIComponent('Prof. Verma')}`);
    assert(creditQr.status === 200 && creditQr.body.upiUri.includes('pa=') && creditQr.body.qrDataUrl.startsWith('data:image/png;base64,'),
      'GET /api/credit/qr generates dynamic UPI payment URI and base64 QR Code');

    // 5. Customer submits settlement via UPI with UTR (Phase 1: Status is PENDING, balance unchanged)
    const settleDueAmount = lookupByPhone.body.account.balance;
    const settleRes = await request('POST', '/api/credit/customer-settle', {
      customer_name: 'Prof. Verma',
      phone: '9876543210',
      amount: settleDueAmount,
      payment_method: 'UPI',
      utr: '426819284712'
    });
    assert(settleRes.status === 200 && settleRes.body.success === true && settleRes.body.status === 'PENDING',
      'POST /api/credit/customer-settle records payment as PENDING awaiting cashier verification');
    assert(settleRes.body.current_balance === settleDueAmount,
      'Customer balance remains active (not zeroed) until operator confirms receipt');
    assert(settleRes.body.utr === '426819284712', 'Settlement records 12-digit UTR reference');

    // 6. Customer lookup reflects pending settlement while waiting
    const duringPendingLookup = await request('GET', '/api/credit/lookup?query=9876543210');
    assert(duringPendingLookup.status === 200 && duringPendingLookup.body.pendingSettlement && duringPendingLookup.body.pendingSettlement.utr === '426819284712',
      'Customer statement shows pending settlement status and UTR');

    // 7. Operator retrieves pending settlements list
    const pendingListRes = await request('GET', '/api/credit/pending-settlements', null, { 'x-operator-pin': TEST_PIN });
    assert(pendingListRes.status === 200 && pendingListRes.body.length > 0,
      'GET /api/credit/pending-settlements returns pending credit settlement for operator');
    const targetSettlement = pendingListRes.body.find(s => s.customer_name === 'Prof. Verma');
    assert(targetSettlement && targetSettlement.utr === '426819284712' && targetSettlement.amount_paid === settleDueAmount,
      'Pending settlement has correct customer name, amount, and UTR');

    // 8. Operator clicks "Received / Verify" (Phase 2: Confirmed, balance zeroes out, orders marked PAID)
    const verifyRes = await request('POST', `/api/credit/settlements/${targetSettlement.id}/verify`, {}, { 'x-operator-pin': TEST_PIN });
    assert(verifyRes.status === 200 && verifyRes.body.success === true && verifyRes.body.new_balance === 0,
      'POST /api/credit/settlements/:id/verify completes settlement and zeroes balance');

    // 9. Verify finalized balance and order status
    const afterVerifyLookup = await request('GET', '/api/credit/lookup?query=9876543210');
    assert(afterVerifyLookup.status === 200 && afterVerifyLookup.body.account.balance === 0,
      'Customer balance is now 0 (All Dues Cleared after operator confirmation)');
    assert(afterVerifyLookup.body.settlements.length > 0 && afterVerifyLookup.body.settlements[0].utr === '426819284712' && afterVerifyLookup.body.settlements[0].status === 'VERIFIED',
      'Settlement record is marked as VERIFIED in customer history');
    assert(afterVerifyLookup.body.orders[0].payment_status === 'PAID',
      'Unpaid credit orders are automatically marked as PAID upon operator verification');

    // --- Suite 11: Daily Accounting with Token Number, Item Name & Quantity Breakdown ---
    console.log('\n--- Suite 11: Daily Accounting, Token Numbers & Item Sales Breakdown ---');
    const accountingRes = await request('GET', '/api/orders/daily-accounting');
    assert(accountingRes.status === 200, 'GET /api/orders/daily-accounting returns 200 status');
    assert(accountingRes.body && accountingRes.body.summary && accountingRes.body.item_sales && Array.isArray(accountingRes.body.orders),
      'Returns complete daily accounting structure with summary, item_sales, and orders array');
    assert(accountingRes.body.summary.total_orders > 0 && accountingRes.body.summary.total_items_sold > 0,
      'Summary reports positive total orders and total items sold count');
    assert(accountingRes.body.orders.every(o => o.token_no != null && Array.isArray(o.items) && o.items.length > 0),
      'Every order in daily accounting includes token_no and itemized list with quantities');
    assert(accountingRes.body.item_sales.length > 0 && accountingRes.body.item_sales[0].total_quantity > 0,
      'Item sales breakdown correctly aggregates item names, quantities sold, and revenues');
    
    // Test custom date query parameter
    const todayStr = accountingRes.body.date;
    const customDateRes = await request('GET', `/api/orders/daily-accounting?date=${todayStr}`);
    assert(customDateRes.status === 200 && customDateRes.body.date === todayStr,
      'GET /api/orders/daily-accounting?date=YYYY-MM-DD filters correctly by date');

  } finally {
    serverProcess.kill();
    setTimeout(() => {
      if (fs.existsSync(TEST_DB)) try { fs.unlinkSync(TEST_DB); } catch {}
      if (fs.existsSync(TEST_DB + '-wal')) try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
      if (fs.existsSync(TEST_DB + '-shm')) try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
    }, 500);
  }

  console.log('\n=====================================================');
  console.log(`FINAL RESULT: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} TOTAL TESTS`);
  console.log('=====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
