package com.bmucanteen.soundbox;

import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.util.Log;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

public class SmsHistoryImporter {
    private static final String TAG = "SmsHistoryImporter";

    public enum TimeRange {
        YESTERDAY,
        TODAY,
        LAST_7_DAYS
    }

    public static class ImportResult {
        public final int count;
        public final double totalAmount;
        public final String timeRangeDescription;

        public ImportResult(int count, double totalAmount, String timeRangeDescription) {
            this.count = count;
            this.totalAmount = totalAmount;
            this.timeRangeDescription = timeRangeDescription;
        }
    }

    public static ImportResult importSms(Context context, TimeRange range) {
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_SMS) 
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_SMS permission not granted.");
            return new ImportResult(0, 0, "No permission");
        }

        long startTime;
        long endTime;
        String rangeDesc;

        Calendar cal = Calendar.getInstance();
        // Today midnight (00:00:00.000)
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        long todayMidnight = cal.getTimeInMillis();

        switch (range) {
            case YESTERDAY:
                cal.add(Calendar.DAY_OF_YEAR, -1);
                startTime = cal.getTimeInMillis();
                endTime = todayMidnight - 1;
                rangeDesc = "Yesterday";
                break;

            case TODAY:
                startTime = todayMidnight;
                endTime = System.currentTimeMillis();
                rangeDesc = "Today";
                break;

            case LAST_7_DAYS:
            default:
                cal.add(Calendar.DAY_OF_YEAR, -7);
                startTime = cal.getTimeInMillis();
                endTime = System.currentTimeMillis();
                rangeDesc = "Last 7 Days";
                break;
        }

        SoundBoxStorage storage = new SoundBoxStorage(context);
        List<PaymentRecord> existing = storage.getHistory();

        int importedCount = 0;
        double totalAmt = 0.0;

        Uri inboxUri = Uri.parse("content://sms/inbox");
        String selection = "date >= ? AND date <= ?";
        String[] selectionArgs = new String[]{ String.valueOf(startTime), String.valueOf(endTime) };
        String sortOrder = "date ASC";

        try (Cursor cursor = context.getContentResolver().query(
                inboxUri,
                new String[]{"_id", "address", "body", "date"},
                selection,
                selectionArgs,
                sortOrder)) {

            if (cursor != null && cursor.moveToFirst()) {
                int colId = cursor.getColumnIndex("_id");
                int colAddr = cursor.getColumnIndex("address");
                int colBody = cursor.getColumnIndex("body");
                int colDate = cursor.getColumnIndex("date");

                List<PaymentRecord> toAdd = new ArrayList<>();

                do {
                    String smsId = colId != -1 ? cursor.getString(colId) : "";
                    String address = colAddr != -1 ? cursor.getString(colAddr) : "";
                    String body = colBody != -1 ? cursor.getString(colBody) : "";
                    long smsDate = colDate != -1 ? cursor.getLong(colDate) : 0;

                    if (!SmsParser.isCreditMessage(body)) {
                        continue;
                    }

                    String amount = SmsParser.extractAmount(body);
                    if (amount == null || amount.isEmpty()) {
                        continue;
                    }

                    // Check if already in ledger
                    boolean alreadyExists = false;
                    for (PaymentRecord r : existing) {
                        if (r.getAmount().equals(amount) && Math.abs(r.getTimestamp() - smsDate) < 5000) {
                            alreadyExists = true;
                            break;
                        }
                    }
                    if (alreadyExists) continue;

                    String bankName = SmsParser.extractBankName(address, body);
                    String payerName = SmsParser.extractPayerName(body);

                    PaymentRecord record = new PaymentRecord(
                        "sms_" + (smsId.isEmpty() ? String.valueOf(smsDate) : smsId),
                        amount,
                        payerName,
                        bankName,
                        smsDate
                    );

                    toAdd.add(record);
                    importedCount++;
                    try {
                        totalAmt += Double.parseDouble(amount);
                    } catch (Exception ignored) {}

                } while (cursor.moveToNext());

                // Add newly imported records to storage (newest first in history)
                for (PaymentRecord r : toAdd) {
                    storage.addPayment(r);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error importing SMS: " + e.getMessage(), e);
        }

        return new ImportResult(importedCount, totalAmt, rangeDesc);
    }
}
