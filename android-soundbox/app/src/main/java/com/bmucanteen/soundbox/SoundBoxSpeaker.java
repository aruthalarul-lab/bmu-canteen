package com.bmucanteen.soundbox;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.util.Log;
import java.util.Locale;
import java.util.Set;

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
        } else if ("en_ta".equalsIgnoreCase(langCode)) {
            locale = Locale.US;
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
        String lang = storage.getLanguage();

        if ("en_ta".equalsIgnoreCase(lang)) {
            // Dual Announcement: English first, then Tamil!
            speakDualEnglishTamil(amount, payer, appName, false);
        } else {
            String message = buildSingleLanguageText(amount, payer, appName, lang);
            executeSpeech(message, getLocaleForLanguage(lang));

            if (storage.isRepeatTwice()) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> executeSpeech(message, getLocaleForLanguage(lang)), 2500);
            }
        }
    }

    private void speakDualEnglishTamil(String amount, String payer, String appName, boolean isRepeatPrefix) {
        boolean includePayer = storage.isIncludePayer() && payer != null && !payer.trim().isEmpty();
        String cleanPayer = includePayer ? payer.trim() : "";
        String cleanAmount = amount != null ? amount.replaceAll("[^0-9.]", "") : "0";

        // 1. English Utterance
        String prefix = isRepeatPrefix ? "Repeating: " : "";
        String enText = prefix + "Received " + cleanAmount + " rupees on " + appName + (includePayer ? " from " + cleanPayer : "") + ".";
        executeSpeech(enText, Locale.US);

        // 2. Tamil Utterance after 1.8 seconds
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            String taText;
            Locale tamilLocale = new Locale("ta", "IN");
            int check = tts != null ? tts.isLanguageAvailable(tamilLocale) : TextToSpeech.LANG_NOT_SUPPORTED;

            if (check >= TextToSpeech.LANG_AVAILABLE) {
                // Native Tamil script
                taText = appName + "-il " + (includePayer ? cleanPayer + "-idamirundhu " : "") + cleanAmount + " ரூபாய் பெறப்பட்டது.";
                executeSpeech(taText, tamilLocale);
            } else {
                // Phonetic transliteration that English TTS reads with Tamil pronunciation
                taText = appName + " il " + (includePayer ? cleanPayer + " idamirundhu " : "") + cleanAmount + " roobai vandhadhu.";
                executeSpeech(taText, Locale.US);
            }
        }, 1800);

        if (storage.isRepeatTwice() && !isRepeatPrefix) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> speakDualEnglishTamil(amount, payer, appName, false), 4800);
        }
    }

    public void repeatLastPayment() {
        PaymentRecord record = storage.getLastPayment();
        if (record == null) {
            String lang = storage.getLanguage();
            if ("en_ta".equalsIgnoreCase(lang)) {
                executeSpeech("No payments received yet today.", Locale.US);
                new Handler(Looper.getMainLooper()).postDelayed(() -> executeSpeech("Indru endha panamum perappadavillai.", Locale.US), 1600);
            } else {
                executeSpeech("No payments received yet today.", getLocaleForLanguage(lang));
            }
            return;
        }

        boostVolume();
        String lang = storage.getLanguage();
        if ("en_ta".equalsIgnoreCase(lang)) {
            speakDualEnglishTamil(record.getAmount(), record.getPayerName(), record.getAppName(), true);
        } else {
            String text = "Repeating last payment: " + buildSingleLanguageText(record.getAmount(), record.getPayerName(), record.getAppName(), lang);
            executeSpeech(text, getLocaleForLanguage(lang));
        }
    }

    public void previewTamilVoice() {
        if (!isTtsReady) {
            initTts();
            new Handler(Looper.getMainLooper()).postDelayed(this::previewTamilVoice, 500);
            return;
        }
        boostVolume();
        Locale tamilLocale = new Locale("ta", "IN");
        int check = tts != null ? tts.isLanguageAvailable(tamilLocale) : TextToSpeech.LANG_NOT_SUPPORTED;
        if (check >= TextToSpeech.LANG_AVAILABLE) {
            executeSpeech("நூற்று ஐம்பது ரூபாய் பெறப்பட்டது.", tamilLocale);
        } else {
            executeSpeech("Noottru aimbadhu roobai petrappattadhu.", Locale.US);
        }
    }

    private void applyVoiceProfileForLocale(Locale locale) {
        if (tts == null) return;
        String profile = storage.getVoiceProfile();

        float pitch = 1.18f;
        float rate = 0.90f;

        if ("female_crisp".equals(profile)) {
            pitch = 1.30f;
            rate = 0.93f;
        } else if ("female_soft".equals(profile)) {
            pitch = 1.06f;
            rate = 0.88f;
        } else if ("default".equals(profile)) {
            pitch = 1.00f;
            rate = 0.95f;
        }

        tts.setPitch(pitch);
        tts.setSpeechRate(rate);

        // On Android 5.0+ (API 21+), look for high quality female voice for the target language
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && !"default".equals(profile)) {
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null && locale != null) {
                    Voice bestVoice = null;
                    String targetLang = locale.getLanguage().toLowerCase();

                    for (Voice v : voices) {
                        if (v.getLocale() != null && targetLang.equalsIgnoreCase(v.getLocale().getLanguage())) {
                            String vName = v.getName().toLowerCase();
                            // Google Tamil neural female voice names usually contain 'taf', 'tac', or 'female'
                            boolean matchesFemale = vName.contains("female") || 
                                                   vName.contains("taf") || 
                                                   vName.contains("tac") || 
                                                   vName.contains("cce") || 
                                                   vName.contains("end") || 
                                                   (!vName.contains("male") && v.getQuality() >= Voice.QUALITY_VERY_HIGH);

                            if (matchesFemale) {
                                bestVoice = v;
                                break;
                            }
                        }
                    }
                    if (bestVoice != null) {
                        tts.setVoice(bestVoice);
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    private void executeSpeech(String message, Locale locale) {
        if (tts == null) return;
        if (locale != null) {
            try {
                tts.setLanguage(locale);
            } catch (Exception ignored) {}
        }
        applyVoiceProfileForLocale(locale);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            tts.speak(message, TextToSpeech.QUEUE_ADD, null, "SoundBoxUtterance_" + System.currentTimeMillis());
        } else {
            tts.speak(message, TextToSpeech.QUEUE_ADD, null);
        }
    }

    private Locale getLocaleForLanguage(String lang) {
        if ("hi".equalsIgnoreCase(lang) || "hinglish".equalsIgnoreCase(lang)) return new Locale("hi", "IN");
        if ("ta".equalsIgnoreCase(lang)) return new Locale("ta", "IN");
        if ("te".equalsIgnoreCase(lang)) return new Locale("te", "IN");
        return Locale.US;
    }

    private String buildSingleLanguageText(String amount, String payer, String appName, String lang) {
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
            return appName + " il " + (includePayer ? cleanPayer + " idamirundhu " : "") + cleanAmount + " roobai vandhadhu.";
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
