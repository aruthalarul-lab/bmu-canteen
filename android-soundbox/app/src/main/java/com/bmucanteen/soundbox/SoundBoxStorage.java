package com.bmucanteen.soundbox;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class SoundBoxStorage {
    private static final String PREF_NAME = "upi_soundbox_prefs";
    private static final String KEY_LANGUAGE = "language";
    private static final String KEY_REPEAT = "repeat_twice";
    private static final String KEY_INCLUDE_PAYER = "include_payer";
    private static final String KEY_VOLUME_BOOST = "volume_boost";
    private static final String KEY_HANDS_FREE_VOICE = "hands_free_voice";
    private static final String KEY_WAVE_REPEAT = "wave_repeat";
    private static final String KEY_HISTORY = "payment_history";
    private static final String KEY_LAST_PAYMENT = "last_payment_json";

    private final SharedPreferences prefs;

    public SoundBoxStorage(Context context) {
        prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
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

    public synchronized void addPayment(PaymentRecord record) {
        // Save as last payment
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
