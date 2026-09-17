# 🍽️ BMU Canteen Management System

> **A smart, cloud-ready canteen web application engineered specifically for a single-operator setup handling both billing and counter food delivery.**

---

## ⚡ The Single-Operator Challenge & Solution

When one person runs the entire counter:
1. **Queues back up** if taking orders takes more than a few seconds.
2. **Touching cash/keyboards** while assembling food is slow and unhygienic.
3. **No shouting tokens**: The operator shouldn't have to scream names across a noisy cafeteria.

### Solution Architecture:
- **Dual Ordering Channels**:
  - **Channel 1: Employee Self-Order (Mobile Web / QR Code)**: Employees order from their phone or desk, pay via UPI / Cash, and receive an instant live Token # with real-time status tracking.
  - **Channel 2: Fast-POS (Operator Touchscreen)**: Quick walk-in cash, UPI QR, or Credit tab billing in under 2 seconds.
- **Smart UPI App Integration**:
  - On mobile devices: 1-tap direct launch into **Google Pay**, **PhonePe**, **Paytm**, **BHIM**, or **Cred** with the merchant VPA and exact bill amount pre-filled.
  - On desktop/tablet: Dynamic real-time high-resolution NPCI QR code for scanning.
  - 12-digit UTR payment reference tracking.
- **Staff Credit (Khata) Ledger**:
  - Track employee accounts by **Name**, **Department/Cabin**, **Mobile Number**, and **Due Balance**.
  - Active ledger cleanly hides ₹0 cleared accounts so only pending balances are shown.
  - Detailed drill-down statement showing order dates, clean item names, quantities, and prices.
  - Full JSON **Backup Download** and **Upload / Restore** for audits and offline archives.
  - **Fast-POS Credit Billing**: Instant search by Name or Phone with 1-click billing to customer tab, and inline quick-registration for new staff.
- **Customer Self-Service Credit Portal & Operator Verification**:
  - Employees can click **`📋 View Credit Dues`** from the mobile navigation bar, search their phone number or name, view their itemized statement, and pay dues via UPI.
  - Once payment is submitted with UTR, the cashier receives a real-time pending settlement notification on the Operator Console.
  - Upon cashier clicking **"Confirm Payment & Verify"**, the balance zeroes to ₹0, all pending orders flip to `PAID`, and celebration confetti erupts on the employee's screen via Socket.IO.
- **Daily Accounting & Consumption Console**:
  - Real-time revenue tally by payment mode: **Cash**, **UPI**, and **Credit**.
  - Aggregated **Item Quantity Sold Tally** showing total quantities consumed for kitchen prep and stock management.
  - Chronological **Token-by-Token Order Ledger** showing Token #, time, customer/desk, itemized items with quantities, payment status, and order total.
- **Audio Chime System**: Web Audio API melodic chime rings on the operator console whenever a new order comes in.
- **1-Tap "86 / Sold Out" Toggle**: Instantly disables sold-out items across all employee phones in real-time.
- **Public TV Token Board (`/?view=display`)**: Live full-screen board displaying **Preparing** and **Ready for Pickup** tokens.

---

## 🚀 Quick Start (Local Run)

### 1. Install Dependencies
```bash
# In the root directory
npm install

# In the client directory
npm --prefix client install
```

### 2. Build the Frontend
```bash
npm run build
```

### 3. Start the Server
```bash
npm start
```

Now open **`http://localhost:5000`** in your browser!

### Automated Tests
```bash
npm test
```
Runs the comprehensive 59-test suite verifying the database, SQLite foreign keys, order validation, Fast-POS credit orders, UPI UTR tracking, concurrent token generation, credit ledger backup/restore, customer self-settlement, and daily accounting.

---

## 🖥️ Views & Navigation

| URL Route | View | Description |
| :--- | :--- | :--- |
| `http://localhost:5000/` | **Employee Mobile Menu** | Browse menu categories, search items, live stock indicators, smart UPI payment, and live animated token tracker. |
| `http://localhost:5000/?view=operator` | **Operator Console** | Live Kanban queue (`Pending` ➔ `Preparing` ➔ `Ready` ➔ `Done`), Fast-POS counter billing, Credit Customer search, and Stock manager. |
| `http://localhost:5000/?view=display` | **Public TV Display** | Full-screen customer-facing token display showing "Now Preparing" & "Ready for Pickup". |
| Navigation Bar ➔ **📋 View Credit Dues** | **Credit Dues Portal** | Customer self-service portal to check statement, view itemized orders, and pay dues via UPI. |
| Operator Console ➔ **📋 Credit Ledger** | **Credit Ledger & Dues** | View pending accounts, itemized statements, download/restore JSON backups, and verify UTR settlements. |
| Operator Console ➔ **📊 Daily Accounting** | **Daily Accounting & Ledger** | Date-selectable revenue summary, item quantity sold breakdown, and token-by-token order ledger. |

---

## ☁️ Cloud Deployment (Render / Railway / Docker)

This application is packaged as a unified fullstack Node.js server that serves both the Socket.IO real-time API and the static React Vite build on a single port.

### Deploying on [Render.com](https://render.com):
1. Push this repository to GitHub.
2. Go to Render Dashboard ➔ **New Web Service** ➔ Select your repository.
3. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm --prefix client install && npm run build`
   - **Start Command**: `npm start`
4. Render provides a live HTTPS URL (e.g. `https://bmu-canteen.onrender.com`).

### Deploying with Docker:
```bash
docker build -t bmu-canteen .
docker run -p 5000:5000 bmu-canteen
```

---

## 💳 UPI Payment Configuration
In the **Operator Console** ➔ click the **⚙️ Settings** tab:
1. Enter your **Merchant UPI ID** (e.g. `yourcanteen@okaxis`, `canteen@upi`, or your phone number VPA).
2. Enter your **Merchant Name** (e.g. `BMU Canteen`).
3. Click **Save Settings**.

All customer and credit settlement QR codes will automatically generate standard NPCI UPI QR codes pre-filled with the exact bill amount!
