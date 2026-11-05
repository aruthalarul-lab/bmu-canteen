package com.bmucanteen.soundbox;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import java.util.ArrayList;
import java.util.Locale;

public class VoiceCommandManager {
    private static final String TAG = "VoiceCommandManager";
    private final Context context;
    private SpeechRecognizer speechRecognizer;
    private Intent recognizerIntent;
    private boolean isListening = false;
    private boolean isEnabled = true;
    private final Handler handler = new Handler(Looper.getMainLooper());

    public VoiceCommandManager(Context context) {
        this.context = context.getApplicationContext();
        initRecognizer();
    }

    private void initRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.w(TAG, "SpeechRecognizer is not available on this device.");
            return;
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context);
        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}

            @Override
            public void onError(int error) {
                isListening = false;
                // Restart listening after short pause if enabled
                if (isEnabled) {
                    handler.postDelayed(() -> startListening(), 1000);
                }
            }

            @Override
            public void onResults(Bundle results) {
                isListening = false;
                handleVoiceResults(results);
                if (isEnabled) {
                    handler.postDelayed(() -> startListening(), 800);
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                handleVoiceResults(partialResults);
            }

            @Override public void onEvent(int eventType, Bundle params) {}
        });
    }

    private void handleVoiceResults(Bundle bundle) {
        if (bundle == null) return;
        ArrayList<String> matches = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;

        for (String match : matches) {
            String text = match.toLowerCase();
            Log.d(TAG, "Heard voice: " + text);

            if (text.contains("hey raj") || 
                text.contains("raj repeat") || 
                text.contains("repeat") || 
                text.contains("raj") ||
                text.contains("again") ||
                text.contains("marrubadiyum") ||
                text.contains("marupadiyum")) {
                
                Log.i(TAG, "Trigger phrase recognized: " + text);
                SoundBoxSpeaker.getInstance(context).repeatLastPayment();
                break;
            }
        }
    }

    public void startListening() {
        if (!isEnabled || isListening || speechRecognizer == null) return;
        try {
            isListening = true;
            speechRecognizer.startListening(recognizerIntent);
        } catch (Exception e) {
            isListening = false;
            Log.w(TAG, "Could not start speech listening: " + e.getMessage());
        }
    }

    public void stopListening() {
        isListening = false;
        if (speechRecognizer != null) {
            try {
                speechRecognizer.stopListening();
                speechRecognizer.cancel();
            } catch (Exception ignored) {}
        }
    }

    public void setEnabled(boolean enabled) {
        this.isEnabled = enabled;
        if (enabled) {
            startListening();
        } else {
            stopListening();
        }
    }

    public void destroy() {
        isEnabled = false;
        stopListening();
        if (speechRecognizer != null) {
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
    }
}
