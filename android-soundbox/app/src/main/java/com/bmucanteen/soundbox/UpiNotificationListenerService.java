package com.bmucanteen.soundbox;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class UpiNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "UpiNotificationListener";
    public static final String ACTION_PAYMENT_RECEIVED = "com.bmucanteen.soundbox.PAYMENT_RECEIVED";

    // Supported Payment App Packages
    private static final String PKG_GPAY = "com.google.android.apps.nbu.paisa.user";
    private static final String PKG_PHONEPE = "com.phonepe.app";
    private static final String PKG_PAYTM = "net.one97.paytm";
    private static final String PKG_BHIM = "in.org.npci.upiapp";
    private static final String PKG_WHATSAPP = "com.whatsapp";

    // Amount extraction regexes
    private static final Pattern PATTERN_AMOUNT = Pattern.compile("(?:₹|Rs\\.?|INR)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern PATTERN_AMOUNT_POST = Pattern.compile("([0-9,]+(?:\\.[0-9]{1,2})?)\\s*(?:rupees|rs|inr)", Pattern.CASE_INSENSITIVE);

    // Payer extraction regex
    private static final Pattern PATTERN_PAYER = Pattern.compile("(?:from|by)\\s+([A-Za-z0-9\\s]{2,25}?)(?:\\s+via|\\s+to|\\s+on|\\s+ref|\\.|\\,|$|\\!)", Pattern.CASE_INSENSITIVE);

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        String packageName = sbn.getPackageName();
        if (packageName == null) return;

        Bundle extras = sbn.getNotification().extras;
        if (extras == null) return;

        CharSequence titleChar = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textChar = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigTextChar = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

        String title = titleChar != null ? titleChar.toString() : "";
        String text = textChar != null ? textChar.toString() : "";
        String bigText = bigTextChar != null ? bigTextChar.toString() : "";

        String fullMessage = (title + " " + text + " " + bigText).trim();
        if (fullMessage.isEmpty()) return;

        // Process only if it looks like a payment or from a known payment app
        boolean isKnownApp = isPaymentApp(packageName);
        boolean isSmsApp = isMessagingApp(packageName);

        if (!isKnownApp && !isSmsApp) {
            return;
        }

        // Check if message is a received/credit notification
        if (!isCreditMessage(fullMessage)) {
            Log.d(TAG, "Ignored non-credit notification: " + fullMessage);
            return;
        }

        // Extract amount
        String amount = extractAmount(fullMessage);
        if (amount == null || amount.isEmpty() || amount.equals("0")) {
            Log.d(TAG, "No valid amount found in: " + fullMessage);
            return;
        }

        // Extract app name and payer name
        String appName = resolveAppName(packageName, fullMessage);
        String payerName = extractPayerName(title, fullMessage);

        Log.i(TAG, "Valid UPI payment detected! Amount: ₹" + amount + ", Payer: " + payerName + ", App: " + appName);

        // 1. Speak aloud via TextToSpeech
        SoundBoxSpeaker.getInstance(this).speakPayment(amount, payerName, appName);

        // 2. Save in History Ledger
        SoundBoxStorage storage = new SoundBoxStorage(this);
        PaymentRecord record = new PaymentRecord(
            String.valueOf(System.currentTimeMillis()),
            amount,
            payerName,
            appName,
            System.currentTimeMillis()
        );
        storage.addPayment(record);

        // 3. Notify MainActivity if open
        Intent broadcast = new Intent(ACTION_PAYMENT_RECEIVED);
        broadcast.putExtra("amount", amount);
        broadcast.putExtra("payer", payerName);
        broadcast.putExtra("app", appName);
        sendBroadcast(broadcast);
    }

    private boolean isPaymentApp(String pkg) {
        return pkg.equals(PKG_GPAY) || 
               pkg.equals(PKG_PHONEPE) || 
               pkg.equals(PKG_PAYTM) || 
               pkg.equals(PKG_BHIM) ||
               pkg.equals(PKG_WHATSAPP) ||
               pkg.contains("paisa") || 
               pkg.contains("bhim") ||
               pkg.contains("paytm") || 
               pkg.contains("phonepe");
    }

    private boolean isMessagingApp(String pkg) {
        return pkg.contains("messaging") || 
               pkg.contains("mms") || 
               pkg.contains("sms") || 
               pkg.equals("com.google.android.apps.messaging") ||
               pkg.equals("com.samsung.android.messaging");
    }

    private boolean isCreditMessage(String msg) {
        String lower = msg.toLowerCase();

        // Must NOT contain debit signals
        if (lower.contains("debited") || 
            lower.contains("sent to") || 
            lower.contains("paid to") || 
            lower.contains("withdrawn") || 
            lower.contains("otp") || 
            lower.contains("requesting") ||
            lower.contains("bill paid") ||
            lower.contains("spent")) {
            return false;
        }

        // Must contain credit/received signals
        return lower.contains("received") || 
               lower.contains("credited") || 
               lower.contains("paid you") || 
               lower.contains("sent you") || 
               lower.contains("added") || 
               lower.contains("deposited") ||
               lower.contains("payment from") ||
               lower.contains("transferred to your a/c") ||
               lower.contains("money received");
    }

    private String extractAmount(String msg) {
        Matcher m1 = PATTERN_AMOUNT.matcher(msg);
        if (m1.find()) {
            return m1.group(1).replace(",", "").trim();
        }

        Matcher m2 = PATTERN_AMOUNT_POST.matcher(msg);
        if (m2.find()) {
            return m2.group(1).replace(",", "").trim();
        }

        return null;
    }

    private String extractPayerName(String title, String fullMsg) {
        Matcher m = PATTERN_PAYER.matcher(fullMsg);
        if (m.find()) {
            String name = m.group(1).trim();
            if (!name.equalsIgnoreCase("you") && 
                !name.equalsIgnoreCase("account") && 
                !name.equalsIgnoreCase("bank") && 
                !name.equalsIgnoreCase("upi") && 
                name.length() > 2) {
                return name;
            }
        }

        // If title has a person's name (common in WhatsApp or GPay)
        if (title != null && !title.isEmpty() && 
            !title.equalsIgnoreCase("Google Pay") && 
            !title.equalsIgnoreCase("PhonePe") && 
            !title.equalsIgnoreCase("Paytm") && 
            title.length() > 2 && title.length() < 25) {
            return title.trim();
        }

        return "";
    }

    private String resolveAppName(String pkg, String msg) {
        if (pkg.equals(PKG_GPAY) || msg.toLowerCase().contains("google pay") || msg.toLowerCase().contains("gpay")) {
            return "Google Pay";
        } else if (pkg.equals(PKG_PHONEPE) || msg.toLowerCase().contains("phonepe")) {
            return "PhonePe";
        } else if (pkg.equals(PKG_PAYTM) || msg.toLowerCase().contains("paytm")) {
            return "Paytm";
        } else if (pkg.equals(PKG_BHIM) || msg.toLowerCase().contains("bhim")) {
            return "BHIM";
        } else if (pkg.equals(PKG_WHATSAPP)) {
            return "WhatsApp Pay";
        } else if (isMessagingApp(pkg)) {
            return "Bank Account";
        }
        return "UPI";
    }
}
