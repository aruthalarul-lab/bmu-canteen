package com.bmucanteen.soundbox;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import java.util.Locale;

public class SoundBoxSpeaker {
    private static final String TAG = "SoundBoxSpeaker";
    private static SoundBoxSpeaker instance;
    private final Context appContext;
    private TextToSpeech tts;
    private boolean isTtsReady = false;
    private final SoundBoxStorage storage;

    private SoundBoxSpeaker(Context context) {
        this.appContext = context.getApplicationContext();
        this.storage = new SoundBoxStorage(appContext);
        initTts();
    }

    public static synchronized SoundBoxSpeaker getInstance(Context context) {
        if (instance == null) {
            instance = new SoundBoxSpeaker(context);
        }
        return instance;
    }

    private void initTts() {
        tts = new TextToSpeech(appContext, status -> {
            if (status == TextToSpeech.SUCCESS) {
                isTtsReady = true;
                applyAudioAttributes();
                setLanguage(storage.getLanguage());
                Log.d(TAG, "TextToSpeech initialized successfully.");
            } else {
                Log.e(TAG, "TextToSpeech initialization failed with status: " + status);
            }
        });
    }

    private void applyAudioAttributes() {
        if (tts != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            tts.setAudioAttributes(audioAttributes);
        }
    }

    public void setLanguage(String langCode) {
        if (!isTtsReady || tts == null) return;
        Locale locale = Locale.US;
        if ("hi".equalsIgnoreCase(langCode)) {
            locale = new Locale("hi", "IN");
        } else if ("ta".equalsIgnoreCase(langCode)) {
            locale = new Locale("ta", "IN");
        } else if ("te".equalsIgnoreCase(langCode)) {
            locale = new Locale("te", "IN");
        } else if ("hinglish".equalsIgnoreCase(langCode)) {
            locale = new Locale("hi", "IN");
        }
        
        int result = tts.setLanguage(locale);
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts.setLanguage(Locale.US);
        }
    }

    public void boostVolume() {
        try {
            if (storage.isVolumeBoost()) {
                AudioManager audioManager = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
                if (audioManager != null) {
                    int maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, maxVol, 0);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not set volume: " + e.getMessage());
        }
    }

    public void speakPayment(String amount, String payer, String appName) {
        if (!isTtsReady) {
            initTts();
            new Handler(Looper.getMainLooper()).postDelayed(() -> speakPayment(amount, payer, appName), 600);
            return;
        }

        boostVolume();
        String message = buildSpeechText(amount, payer, appName);
        executeSpeech(message);

        if (storage.isRepeatTwice()) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> executeSpeech(message), 2500);
        }
    }

    public void speakTest(String amount) {
        speakPayment(amount, "Rahul Sharma", "Google Pay");
    }

    private void executeSpeech(String message) {
        if (tts == null) return;
        tts.setSpeechRate(0.95f);
        tts.setPitch(1.0f);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            tts.speak(message, TextToSpeech.QUEUE_ADD, null, "SoundBoxUtterance_" + System.currentTimeMillis());
        } else {
            tts.speak(message, TextToSpeech.QUEUE_ADD, null);
        }
    }

    private String buildSpeechText(String amount, String payer, String appName) {
        String lang = storage.getLanguage();
        boolean includePayer = storage.isIncludePayer() && payer != null && !payer.trim().isEmpty();
        String cleanPayer = includePayer ? payer.trim() : "";
        String cleanAmount = amount != null ? amount.replaceAll("[^0-9.]", "") : "0";

        if ("hi".equalsIgnoreCase(lang)) {
            if (includePayer) {
                return appName + " par " + cleanPayer + " se " + cleanAmount + " rupaye praapt hue.";
            } else {
                return appName + " par " + cleanAmount + " rupaye praapt hue.";
            }
        } else if ("hinglish".equalsIgnoreCase(lang)) {
            if (includePayer) {
                return appName + " par " + cleanAmount + " rupaye received from " + cleanPayer + ".";
            } else {
                return appName + " par " + cleanAmount + " rupaye received.";
            }
        } else if ("ta".equalsIgnoreCase(lang)) {
            return appName + " il " + cleanAmount + " roobai vandhadhu.";
        } else if ("te".equalsIgnoreCase(lang)) {
            return appName + " lo " + cleanAmount + " roopaayilu vachhaayi.";
        } else {
            // English default
            if (includePayer) {
                return "Received " + cleanAmount + " rupees on " + appName + " from " + cleanPayer + ".";
            } else {
                return "Received " + cleanAmount + " rupees on " + appName + ".";
            }
        }
    }

    public void destroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        isTtsReady = false;
    }
}
