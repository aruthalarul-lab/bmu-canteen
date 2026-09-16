# 🍽️ BMU Canteen Management System

> **A smart, cloud-ready canteen web application engineered specifically for a single-operator setup handling both billing and counter food delivery.**

---

## ⚡ The Single-Operator Challenge & Solution

When one person runs the entire counter:
1. **Queues back up** if taking orders takes more than a few seconds.
2. **Touching cash/keyboards** while assembling food is slow and unhygienic.
3. **No shouting tokens**: The operator shouldn't have to scream names across a noisy cafeteria.

### Solution Provided:
- **Dual Channels**:
  - **Channel 1: Employee Self-Order (Mobile Web / QR Code)**: Employees order from their desk or scan a table QR, pay via UPI / Cash, and receive an instant live Token # with real-time status tracking.
  - **Channel 2: 2-Tap Fast-POS (Operator Touchscreen)**: Quick walk-in cash or UPI billing in under 2 seconds.
- **Audio Chime System**: Web Audio API melodic chime rings on the operator console whenever a new order comes in.
- **1-Tap "86 / Sold Out" Toggle**: Single tap turns any item "Sold Out", instantly disabling it on all employee phones in real-time.
- **Public TV Token Board (`/display`)**: Mount an old tablet or connect an HDMI TV displaying live **Preparing** and **Ready for Pickup** tokens.
- **Closing Reconciliation**: Real-time sales summary with Cash vs. UPI revenue breakdown.

---

## 🚀 Quick Start (Local Run)

### 1. Install Dependencies
```bash
# In the root directory
npm install

# In the client directory
cd client
npm install
cd ..
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

---

## 🖥️ Views & Routes

| URL Route | Mode | Description |
| :--- | :--- | :--- |
| `http://localhost:5000/` | **Employee Mobile Menu** | Browse categories, live stock, cart, UPI QR scan-to-pay, and live animated token tracker. |
| `http://localhost:5000/?view=operator` | **Operator Console** | Kanban order queue (`Pending` ➔ `Preparing` ➔ `Ready` ➔ `Done`), Fast-POS, and 1-tap stock manager. |
| `http://localhost:5000/?view=display` | **Public TV Display** | Full-screen customer-facing token board showing "Now Preparing" & "Ready for Pickup". |

---

## ☁️ 1-Click Cloud Deployment (Render / Railway)

This app is built as a unified fullstack Node.js server that serves both the Socket.IO real-time API and the static React Vite build on a single port.

### Deploying on [Render.com](https://render.com) (Free Tier):
1. Push this repository to GitHub.
2. Go to Render Dashboard ➔ **New Web Service** ➔ Select your repository.
3. Configure the settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm --prefix client install && npm run build`
   - **Start Command**: `npm start`
4. Click **Deploy Web Service**!
   Render will provide a live HTTPS URL (e.g., `https://bmu-canteen.onrender.com`). Employees can open this link from anywhere in the office.

---

## 💳 UPI Payment Configuration
In the **Operator Console** ➔ click the **⚙️ Settings** tab:
1. Enter your **Merchant UPI ID** (e.g. `yourcanteen@okaxis`, `canteen@upi`, or your phone number UPI VPA).
2. Enter your **Merchant Name** (e.g. `BMU Canteen`).
3. Click **Save Settings**.
All customer orders selecting UPI will automatically generate standard NPCI UPI QR codes pre-filled with the exact bill amount!
