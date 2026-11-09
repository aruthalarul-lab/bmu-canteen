package com.bmucanteen.soundbox;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SmsParser {

    // Amount extraction patterns
    // 1. Matches "credited by 150.00", "credited with INR 200.00", "credited for Rs 500"
    private static final Pattern PATTERN_CREDITED_AMOUNT = Pattern.compile(
        "(?:credited|deposited|received|transferred)\\s+(?:by|with|for|of)?\\s*(?:₹|Rs\\.?|INR)?\\s*([0-9,]+(?:\\.[0-9]{1,2})?)",
        Pattern.CASE_INSENSITIVE
    );

    // 2. Matches "₹150.00", "Rs. 250", "INR 500.00"
    private static final Pattern PATTERN_CURRENCY_AMOUNT = Pattern.compile(
        "(?:₹|Rs\\.?|INR)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)",
        Pattern.CASE_INSENSITIVE
    );

    // 3. Matches "150.00 credited", "200.00 received"
    private static final Pattern PATTERN_AMOUNT_THEN_CREDITED = Pattern.compile(
        "([0-9,]+(?:\\.[0-9]{1,2})?)\\s*(?:credited|deposited|received|added)",
        Pattern.CASE_INSENSITIVE
    );

    // Payer extraction patterns
    // 1. Matches Info: UPI/CR/12345/Rahul Sharma or UPI/42350/Priya
    private static final Pattern PATTERN_UPI_INFO = Pattern.compile(
        "(?:Info:\\s*)?UPI\\/(?:CR\\/)?[^\\/]+\\/[^\\/]+\\/([A-Za-z0-9\\s]{2,25})",
        Pattern.CASE_INSENSITIVE
    );

    // 2. Matches "from Rahul Sharma" or "by Suresh Kumar"
    private static final Pattern PATTERN_FROM_BY = Pattern.compile(
        "(?:from|by)\\s+([A-Za-z0-9\\s]{2,25}?)(?:\\s+UPI|\\s+Ref|\\s+txn|\\s+via|\\s+on|\\s+linked|\\.|\\,|$|\\!|-)",
        Pattern.CASE_INSENSITIVE
    );

    // 3. Matches VPA e.g. "VPA rahul@okaxis"
    private static final Pattern PATTERN_VPA = Pattern.compile(
        "(?:VPA|UPI ID)\\s*([A-Za-z0-9.\\-_]+@[A-Za-z0-9]+)",
        Pattern.CASE_INSENSITIVE
    );

    public static boolean isCreditMessage(String msg) {
        if (msg == null || msg.trim().isEmpty()) return false;
        String lower = msg.toLowerCase();

        // Must NOT be a debit or irrelevant notification
        if (lower.contains("debited") || 
            lower.contains("sent to") || 
            lower.contains("paid to") || 
            lower.contains("withdrawn") || 
            lower.contains("atm txn") ||
            lower.contains("purchase of") ||
            lower.contains("spent") ||
            lower.contains("bill paid") ||
            lower.contains("otp") || 
            lower.contains("requesting") ||
            lower.contains("request")) {
            return false;
        }

        // Must indicate incoming money / credit
        return lower.contains("credited") || 
               lower.contains("deposited") || 
               lower.contains("received") || 
               lower.contains("added") || 
               lower.contains("paid you") || 
               lower.contains("sent you") || 
               lower.contains("transferred to your") ||
               lower.contains("cr in your a/c") ||
               lower.contains("cashback");
    }

    public static String extractAmount(String msg) {
        if (msg == null) return null;

        // Try Pattern 1: "credited by 150.00"
        Matcher m1 = PATTERN_CREDITED_AMOUNT.matcher(msg);
        if (m1.find()) {
            String amt = m1.group(1).replace(",", "").trim();
            if (isValidAmount(amt)) return amt;
        }

        // Try Pattern 2: "₹ 150.00" or "Rs. 250"
        Matcher m2 = PATTERN_CURRENCY_AMOUNT.matcher(msg);
        if (m2.find()) {
            String amt = m2.group(1).replace(",", "").trim();
            if (isValidAmount(amt)) return amt;
        }

        // Try Pattern 3: "150.00 credited"
        Matcher m3 = PATTERN_AMOUNT_THEN_CREDITED.matcher(msg);
        if (m3.find()) {
            String amt = m3.group(1).replace(",", "").trim();
            if (isValidAmount(amt)) return amt;
        }

        return null;
    }

    private static boolean isValidAmount(String amt) {
        if (amt == null || amt.isEmpty()) return false;
        try {
            double val = Double.parseDouble(amt);
            return val > 0 && val < 500000; // Reasonable transaction range
        } catch (Exception e) {
            return false;
        }
    }

    public static String extractPayerName(String msg) {
        if (msg == null) return "";

        // Try UPI Info pattern (e.g. Info: UPI/CR/123/Rahul)
        Matcher mInfo = PATTERN_UPI_INFO.matcher(msg);
        if (mInfo.find()) {
            String name = cleanPayerName(mInfo.group(1));
            if (!name.isEmpty()) return name;
        }

        // Try VPA pattern
        Matcher mVpa = PATTERN_VPA.matcher(msg);
        if (mVpa.find()) {
            return mVpa.group(1).trim();
        }

        // Try "from / by" pattern
        Matcher mFrom = PATTERN_FROM_BY.matcher(msg);
        if (mFrom.find()) {
            String name = cleanPayerName(mFrom.group(1));
            if (!name.isEmpty()) return name;
        }

        return "";
    }

    private static String cleanPayerName(String raw) {
        if (raw == null) return "";
        String clean = raw.trim();
        String lower = clean.toLowerCase();

        // Filter out false positives
        if (lower.equals("you") || 
            lower.equals("your") || 
            lower.equals("account") || 
            lower.equals("a/c") || 
            lower.equals("acct") || 
            lower.equals("bank") || 
            lower.equals("upi") || 
            lower.equals("transfer") || 
            lower.equals("user") ||
            lower.equals("customer") ||
            lower.length() < 2) {
            return "";
        }
        return clean;
    }

    public static String extractBankName(String sender, String body) {
        String combined = ((sender != null ? sender : "") + " " + (body != null ? body : "")).toUpperCase();

        if (combined.contains("SBI") || combined.contains("STATE BANK")) return "SBI";
        if (combined.contains("HDFC")) return "HDFC Bank";
        if (combined.contains("ICICI")) return "ICICI Bank";
        if (combined.contains("AXIS")) return "Axis Bank";
        if (combined.contains("KOTAK")) return "Kotak Bank";
        if (combined.contains("PAYTM")) return "Paytm Bank";
        if (combined.contains("BOB") || combined.contains("BARODA")) return "Bank of Baroda";
        if (combined.contains("PNB") || combined.contains("PUNJAB")) return "PNB Bank";
        if (combined.contains("CANARA") || combined.contains("CANBNK")) return "Canara Bank";
        if (combined.contains("UNION")) return "Union Bank";
        if (combined.contains("YES")) return "Yes Bank";
        if (combined.contains("IOB") || combined.contains("INDIAN OVERSEAS")) return "IOB";
        if (combined.contains("INDIAN BANK") || combined.contains("INDBNK")) return "Indian Bank";
        if (combined.contains("FEDERAL")) return "Federal Bank";
        if (combined.contains("IDFC")) return "IDFC First";
        if (combined.contains("INDUS")) return "IndusInd Bank";

        return "Bank SMS";
    }
}
