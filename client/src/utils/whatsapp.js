/**
 * WhatsApp Helper Utilities & Dynamic Template Engine for BMU Canteen
 * Provides 1-click WhatsApp deep links for Due Reminders, Menu Specials Broadcasts, Order Ready Alerts, and Wallet Statements.
 */

export function cleanIndianPhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  // If 10 digits, prepend 91 (India)
  if (digits.length === 10) return `91${digits}`;
  // If 11 digits starting with 0, drop 0 and prepend 91
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  // If already 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export const DEFAULT_WA_TEMPLATES = {
  order_ready: `🎉 Hi *{customer_name}*,

Your order (*Token #{token_no}*) is *READY FOR PICKUP* at *{canteen_name}* Counter 1! 🍲🔥

Please collect your fresh food at the counter. Enjoy your meal! 🙏`,

  due_reminder: `👋 Hi *{customer_name}*,

Greetings from *{canteen_name}*! 🍲

This is a gentle reminder that your current outstanding canteen credit balance is *₹{balance}*.{order_breakdown}

💳 *Pay Instantly via UPI:*
• *UPI ID:* \`{upi_id}\`
• *Quick Pay Link:* {upi_pay_link}

_Please reply with your transaction UTR or payment screenshot once paid. Thank you!_ 🙏`,

  specials: `🌟 *{canteen_name} — Today's Specials!* 🌟
📅 _{date}_

🔥 *Chef's Fresh Picks for Today:*
{specials_list}

⚡ *Skip the line & order online:*
👉 {order_url}

_Quick pickup at Counter 1! Have a delicious meal!_ 😋🍲`,

  wallet: `👛 *{canteen_name} - Prepaid Wallet*
👤 *Customer:* {customer_name}
💰 *Available Balance:* ₹{balance}

_Recharge your wallet at the counter or scan UPI QR online!_`
};

/**
 * Interpolates template string with variables map
 */
export function interpolateTemplate(template, vars = {}) {
  if (!template) return '';
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(placeholder, value !== undefined && value !== null ? value : '');
  }
  return result;
}

/**
 * Generates sample interpolated message for live UI preview in POS Settings
 */
export function getSampleWhatsAppMessage(type, customTemplate, settings = {}) {
  const canteenName = settings.canteen_name || 'BMU Canteen';
  const upiId = settings.upi_id || 'bmucanteen@upi';
  const upiName = encodeURIComponent(settings.upi_name || canteenName);
  const upiPayLink = `upi://pay?pa=${upiId}&pn=${upiName}&am=240&cu=INR`;
  const orderUrl = typeof window !== 'undefined' ? window.location.origin : 'https://bmu-canteen.onrender.com';
  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  });

  const sampleVariables = {
    order_ready: {
      customer_name: 'Rahul Sharma',
      token_no: '42',
      canteen_name: canteenName,
      items_list: '2x Masala Dosa, 1x Filter Coffee',
      total_amount: '160',
    },
    due_reminder: {
      customer_name: 'Dr. Suresh Kumar',
      balance: '350',
      canteen_name: canteenName,
      upi_id: upiId,
      upi_pay_link: upiPayLink,
      order_breakdown: '\n\n📋 *Pending Delivered Orders:*\n• 18 Sep: 2x Thali Meal, 1x Lassi (₹220)\n• 19 Sep: 1x Paneer Roll, 1x Chai (₹130)',
    },
    specials: {
      canteen_name: canteenName,
      date: todayStr,
      specials_list: '☕ 🟢 *Adrak Masala Chai* — *₹15*\n🌯 🔴 *Chicken Kathi Roll* — *₹90*\n🍜 🟢 *Classic Masala Maggi* — *₹35*',
      order_url: orderUrl,
    },
    wallet: {
      customer_name: 'Pooja Verma',
      balance: '450',
      canteen_name: canteenName,
    }
  };

  const rawTemplate = customTemplate || DEFAULT_WA_TEMPLATES[type] || '';
  return interpolateTemplate(rawTemplate, sampleVariables[type] || {});
}

/**
 * 1-Click WhatsApp Dues & Settlement Reminder
 */
export function sendWhatsAppDueReminder({ account, orders = [], settings = {} }) {
  if (!account) return;

  let rawPhone = (account.phone || '').trim();
  if (!rawPhone) {
    const input = window.prompt(`Enter 10-digit WhatsApp number for ${account.customer_name}:`);
    if (!input) return;
    rawPhone = input.trim();
  }

  const phone = cleanIndianPhoneNumber(rawPhone);
  if (!phone || phone.length < 10) {
    alert('Please provide a valid 10-digit mobile number.');
    return;
  }

  const canteenName = settings.canteen_name || 'BMU Canteen';
  const upiId = settings.upi_id || 'bmucanteen@upi';
  const upiName = encodeURIComponent(settings.upi_name || canteenName);
  const upiPayLink = `upi://pay?pa=${upiId}&pn=${upiName}&am=${account.balance}&cu=INR`;

  // Itemized pending orders breakdown (up to 5 recent)
  const pendingOrders = (orders || []).filter(
    o => o.status === 'COMPLETED' && o.payment_status === 'PENDING'
  );

  let orderBreakdown = '';
  if (pendingOrders.length > 0) {
    const lines = pendingOrders.slice(0, 5).map(o => {
      const itemsList = (o.items || []).map(i => `${i.quantity}x ${i.item_name}`).join(', ');
      const dateStr = o.created_at
        ? new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        : '';
      return `• ${dateStr ? `${dateStr}: ` : ''}${itemsList} (₹${o.total_amount})`;
    });
    orderBreakdown = `\n\n📋 *Pending Delivered Orders:*\n${lines.join('\n')}`;
    if (pendingOrders.length > 5) {
      orderBreakdown += `\n_...and ${pendingOrders.length - 5} more orders_`;
    }
  }

  const template = settings.wa_template_due_reminder || DEFAULT_WA_TEMPLATES.due_reminder;
  const message = interpolateTemplate(template, {
    customer_name: account.customer_name,
    balance: account.balance,
    canteen_name: canteenName,
    upi_id: upiId,
    upi_pay_link: upiPayLink,
    order_breakdown: orderBreakdown
  });

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

/**
 * 1-Click WhatsApp Today's Specials & Menu Broadcast
 * Opens WhatsApp share picker (groups / status / chats)
 */
export function shareSpecialsWhatsApp({ specials = [], canteenName = 'BMU Canteen', orderUrl = '', settings = {} }) {
  if (!specials || specials.length === 0) {
    alert("No specials are currently active today. Mark items as 'Special' first!");
    return;
  }

  const effectiveCanteenName = settings.canteen_name || canteenName || 'BMU Canteen';
  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  });

  const webUrl = orderUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  const specialsList = specials.map(s => {
    const vegBadge = s.is_veg === 1 ? '🟢' : '🔴';
    return `${s.image_emoji || '🍲'} ${vegBadge} *${s.name}* — *₹${s.price}*`;
  }).join('\n');

  const template = settings.wa_template_specials || DEFAULT_WA_TEMPLATES.specials;
  const message = interpolateTemplate(template, {
    canteen_name: effectiveCanteenName,
    date: todayStr,
    specials_list: specialsList,
    order_url: webUrl
  });

  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

/**
 * 1-Click WhatsApp Order Ready Alert
 */
export function sendOrderReadyWhatsApp({ order, settings = {} }) {
  if (!order) return;
  const rawPhone = (order.customer_phone || '').trim();
  if (!rawPhone) {
    alert('This customer did not provide a mobile number.');
    return;
  }
  const phone = cleanIndianPhoneNumber(rawPhone);
  const canteenName = settings.canteen_name || 'BMU Canteen';

  const itemsList = Array.isArray(order.items)
    ? order.items.map(i => `${i.quantity}x ${i.item_name}`).join(', ')
    : '';

  const template = settings.wa_template_order_ready || DEFAULT_WA_TEMPLATES.order_ready;
  const message = interpolateTemplate(template, {
    customer_name: order.customer_name,
    token_no: order.token_no,
    canteen_name: canteenName,
    items_list: itemsList,
    total_amount: order.total_amount || 0
  });

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

/**
 * Generates WhatsApp share message for Customer Wallet statement
 */
export function formatWalletShareMessage({ account, settings = {} }) {
  const canteenName = settings.canteen_name || 'BMU Canteen';
  const name = account?.customer_name || account?.name || 'Customer';
  const bal = account?.wallet_balance !== undefined ? account.wallet_balance : (account?.balance || 0);

  const template = settings.wa_template_wallet || DEFAULT_WA_TEMPLATES.wallet;
  return interpolateTemplate(template, {
    customer_name: name,
    balance: bal,
    canteen_name: canteenName
  });
}
