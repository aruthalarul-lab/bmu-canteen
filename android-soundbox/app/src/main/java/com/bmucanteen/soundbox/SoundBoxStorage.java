package com.bmucanteen.soundbox;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class SoundBoxStorage {
    private static final String PREF_NAME = "upi_soundbox_prefs";
    
    // Master App Enable/Disable
    private static final String KEY_SOUNDBOX_ENABLED = "soundbox_master_enabled";

    // Individual App Toggles
    private static final String KEY_ENABLE_GPAY = "enable_gpay";
    private static final String KEY_ENABLE_PHONEPE = "enable_phonepe";
    private static final String KEY_ENABLE_PAYTM = "enable_paytm";
    private static final String KEY_ENABLE_BHIM = "enable_bhim";
    private static final String KEY_ENABLE_BANK_SMS = "enable_bank_sms";

    private static final String KEY_LANGUAGE = "language";
    private static final String KEY_REPEAT = "repeat_twice";
    private static final String KEY_INCLUDE_PAYER = "include_payer";
    private static final String KEY_VOLUME_BOOST = "volume_boost";
    private static final String KEY_HANDS_FREE_VOICE = "hands_free_voice";
    private static final String KEY_WAVE_REPEAT = "wave_repeat";
    private static final String KEY_FLOATING_LCD = "floating_lcd";
    private static final String KEY_HISTORY = "payment_history";
    private static final String KEY_LAST_PAYMENT = "last_payment_json";

    private final SharedPreferences prefs;

    public SoundBoxStorage(Context context) {
        prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    // Master Switch: Enable / Disable SoundBox
    public boolean isSoundBoxEnabled() {
        return prefs.getBoolean(KEY_SOUNDBOX_ENABLED, true);
    }

    public void setSoundBoxEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_SOUNDBOX_ENABLED, enabled).apply();
    }

    // Individual App Switches
    public boolean isGpayEnabled() {
        return prefs.getBoolean(KEY_ENABLE_GPAY, true);
    }

    public void setGpayEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_ENABLE_GPAY, enabled).apply();
    }

    public boolean isPhonePeEnabled() {
        return prefs.getBoolean(KEY_ENABLE_PHONEPE, true);
    }

    public void setPhonePeEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_ENABLE_PHONEPE, enabled).apply();
    }

    public boolean isPaytmEnabled() {
        return prefs.getBoolean(KEY_ENABLE_PAYTM, true);
    }

    public void setPaytmEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_ENABLE_PAYTM, enabled).apply();
    }

    public boolean isBhimEnabled() {
        return prefs.getBoolean(KEY_ENABLE_BHIM, true);
    }

    public void setBhimEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_ENABLE_BHIM, enabled).apply();
    }

    public boolean isBankSmsEnabled() {
        return prefs.getBoolean(KEY_ENABLE_BANK_SMS, true);
    }

    public void setBankSmsEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_ENABLE_BANK_SMS, enabled).apply();
    }

    public String getLanguage() {
        return prefs.getString(KEY_LANGUAGE, "en_ta"); // Default to English + Tamil!
    }

    public void setLanguage(String lang) {
        prefs.edit().putString(KEY_LANGUAGE, lang).apply();
    }

    public boolean isRepeatTwice() {
        return prefs.getBoolean(KEY_REPEAT, false);
    }

    public void setRepeatTwice(boolean repeat) {
        prefs.edit().putBoolean(KEY_REPEAT, repeat).apply();
    }

    public boolean isIncludePayer() {
        return prefs.getBoolean(KEY_INCLUDE_PAYER, true);
    }

    public void setIncludePayer(boolean include) {
        prefs.edit().putBoolean(KEY_INCLUDE_PAYER, include).apply();
    }

    public boolean isVolumeBoost() {
        return prefs.getBoolean(KEY_VOLUME_BOOST, true);
    }

    public void setVolumeBoost(boolean boost) {
        prefs.edit().putBoolean(KEY_VOLUME_BOOST, boost).apply();
    }

    public boolean isHandsFreeVoiceEnabled() {
        return prefs.getBoolean(KEY_HANDS_FREE_VOICE, true);
    }

    public void setHandsFreeVoiceEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_HANDS_FREE_VOICE, enabled).apply();
    }

    public boolean isWaveRepeatEnabled() {
        return prefs.getBoolean(KEY_WAVE_REPEAT, true);
    }

    public void setWaveRepeatEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_WAVE_REPEAT, enabled).apply();
    }

    public boolean isFloatingLcdEnabled() {
        return prefs.getBoolean(KEY_FLOATING_LCD, true);
    }

    public void setFloatingLcdEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_FLOATING_LCD, enabled).apply();
    }

    public synchronized boolean isRecentDuplicate(String amount, long windowMs) {
        PaymentRecord last = getLastPayment();
        if (last == null || last.getAmount() == null) return false;
        long elapsed = System.currentTimeMillis() - last.getTimestamp();
        return elapsed < windowMs && last.getAmount().equals(amount);
    }

    public synchronized void addPayment(PaymentRecord record) {
        saveLastPayment(record);

        List<PaymentRecord> list = getHistory();
        list.add(0, record);
        if (list.size() > 50) {
            list = list.subList(0, 50);
        }
        saveHistory(list);
    }

    private synchronized void saveLastPayment(PaymentRecord record) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("id", record.getId());
            obj.put("amount", record.getAmount());
            obj.put("payer", record.getPayerName());
            obj.put("app", record.getAppName());
            obj.put("time", record.getTimestamp());
            prefs.edit().putString(KEY_LAST_PAYMENT, obj.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public synchronized PaymentRecord getLastPayment() {
        String jsonStr = prefs.getString(KEY_LAST_PAYMENT, null);
        if (jsonStr == null) {
            List<PaymentRecord> list = getHistory();
            return list.isEmpty() ? null : list.get(0);
        }
        try {
            JSONObject obj = new JSONObject(jsonStr);
            return new PaymentRecord(
                obj.optString("id", ""),
                obj.optString("amount", "0"),
                obj.optString("payer", "Customer"),
                obj.optString("app", "UPI"),
                obj.optLong("time", System.currentTimeMillis())
            );
        } catch (Exception e) {
            return null;
        }
    }

    public synchronized List<PaymentRecord> getHistory() {
        List<PaymentRecord> list = new ArrayList<>();
        String jsonStr = prefs.getString(KEY_HISTORY, "[]");
        try {
            JSONArray arr = new JSONArray(jsonStr);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                list.add(new PaymentRecord(
                    obj.optString("id", ""),
                    obj.optString("amount", "0"),
                    obj.optString("payer", "Customer"),
                    obj.optString("app", "UPI"),
                    obj.optLong("time", System.currentTimeMillis())
                ));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return list;
    }

    private synchronized void saveHistory(List<PaymentRecord> list) {
        try {
            JSONArray arr = new JSONArray();
            for (PaymentRecord p : list) {
                JSONObject obj = new JSONObject();
                obj.put("id", p.getId());
                obj.put("amount", p.getAmount());
                obj.put("payer", p.getPayerName());
                obj.put("app", p.getAppName());
                obj.put("time", p.getTimestamp());
                arr.put(obj);
            }
            prefs.edit().putString(KEY_HISTORY, arr.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void clearHistory() {
        prefs.edit().remove(KEY_HISTORY).remove(KEY_LAST_PAYMENT).apply();
    }
}
