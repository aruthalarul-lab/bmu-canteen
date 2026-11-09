package com.bmucanteen.soundbox;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "SmsReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            return;
        }

        SoundBoxStorage storage = new SoundBoxStorage(context);
        // Master Check: Is SoundBox enabled?
        if (!storage.isSoundBoxEnabled()) {
            Log.d(TAG, "SoundBox is disabled/paused. Ignoring SMS.");
            return;
        }

        // Check if Bank SMS is enabled
        if (!storage.isBankSmsEnabled()) {
            Log.d(TAG, "Bank SMS alert is disabled in settings. Ignoring SMS.");
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        String format = bundle.getString("format");
        if (pdus == null || pdus.length == 0) return;

        StringBuilder fullBody = new StringBuilder();
        String sender = "";

        for (Object pdu : pdus) {
            SmsMessage smsMessage;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
            } else {
                smsMessage = SmsMessage.createFromPdu((byte[]) pdu);
            }
            if (smsMessage != null) {
                if (sender.isEmpty()) {
                    sender = smsMessage.getDisplayOriginatingAddress();
                }
                fullBody.append(smsMessage.getMessageBody());
            }
        }

        String message = fullBody.toString();
        Log.i(TAG, "Real-time SMS arrived from " + sender + ": " + message);

        // Check if message is a credit notification
        if (!SmsParser.isCreditMessage(message)) {
            Log.d(TAG, "Ignored non-credit SMS: " + message);
            return;
        }

        // Extract amount
        String amount = SmsParser.extractAmount(message);
        if (amount == null || amount.isEmpty()) {
            Log.d(TAG, "No valid credit amount found in SMS: " + message);
            return;
        }

        // Deduplicate: avoid double-announcing within 4 seconds
        if (storage.isRecentDuplicate(amount, 4000)) {
            Log.d(TAG, "Ignoring duplicate SMS alert within 4s window: " + amount);
            return;
        }

        // Extract bank name and payer name
        String bankName = SmsParser.extractBankName(sender, message);
        String payerName = SmsParser.extractPayerName(message);

        Log.i(TAG, "Valid Bank Credit SMS detected! Amount: ₹" + amount + ", Bank: " + bankName + ", Payer: " + payerName);

        // 1. Speak aloud via TextToSpeech immediately
        SoundBoxSpeaker.getInstance(context).speakPayment(amount, payerName, bankName);

        // 2. Show in Floating LCD Display on Mobile Home Page
        FloatingLcdService.showLcd(context, amount, payerName, bankName);

        // 3. Save in History Ledger
        PaymentRecord record = new PaymentRecord(
            String.valueOf(System.currentTimeMillis()),
            amount,
            payerName,
            bankName,
            System.currentTimeMillis()
        );
        storage.addPayment(record);

        // 4. Notify MainActivity if open
        Intent broadcast = new Intent(UpiNotificationListenerService.ACTION_PAYMENT_RECEIVED);
        broadcast.putExtra("amount", amount);
        broadcast.putExtra("payer", payerName);
        broadcast.putExtra("app", bankName);
        context.sendBroadcast(broadcast);
    }
}
