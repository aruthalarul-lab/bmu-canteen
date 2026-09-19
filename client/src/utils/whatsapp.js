/**
 * WhatsApp Helper Utilities for BMU Canteen
 * Provides 1-click WhatsApp deep links for Due Reminders, Menu Specials Broadcasts, and Order Ready Alerts.
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

  const message = 
`👋 Hi *${account.customer_name}*,

Greetings from *${canteenName}*! 🍲

This is a gentle reminder that your current outstanding canteen credit balance is *₹${account.balance}*.${orderBreakdown}

💳 *Pay Instantly via UPI:*
• *UPI ID:* \`${upiId}\`
• *Quick Pay Link:* ${upiPayLink}

_Please reply with your transaction UTR or payment screenshot once paid. Thank you!_ 🙏`;

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

/**
 * 1-Click WhatsApp Today's Specials & Menu Broadcast
 * Opens WhatsApp share picker (groups / status / chats)
 */
export function shareSpecialsWhatsApp({ specials = [], canteenName = 'BMU Canteen', orderUrl = '' }) {
  if (!specials || specials.length === 0) {
    alert("No specials are currently active today. Mark items as 'Special' first!");
    return;
  }

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

  const message =
`🌟 *${canteenName} — Today's Specials!* 🌟
📅 _${todayStr}_

🔥 *Chef's Fresh Picks for Today:*
${specialsList}

⚡ *Skip the line & order online:*
👉 ${webUrl}

_Quick pickup at Counter 1! Have a delicious meal!_ 😋🍲`;

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

  const message =
`🎉 Hi *${order.customer_name}*,

Your order (*Token #${order.token_no}*) is *READY FOR PICKUP* at *${canteenName}* Counter 1! 🍲🔥

Please collect your fresh food at the counter. Enjoy your meal! 🙏`;

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}
