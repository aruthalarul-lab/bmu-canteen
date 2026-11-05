package com.bmucanteen.soundbox;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.View;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.switchmaterial.SwitchMaterial;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_RECORD_AUDIO = 201;

    private MaterialCardView cardStatus;
    private TextView tvStatusTitle, tvStatusDesc, tvEmptyHistory, btnClearHistory;
    private MaterialButton btnPermission, btnTestVoice, btnRepeatLast;
    private RadioGroup rgLanguage;
    private RadioButton rbEnglishTamil, rbEnglish, rbTamil, rbHindi, rbHinglish, rbTelugu;
    private SwitchMaterial switchVoiceCommand, switchWaveRepeat;
    private SwitchMaterial switchRepeat, switchIncludePayer, switchVolumeBoost;
    private RecyclerView rvPayments;
    private PaymentHistoryAdapter adapter;
    private SoundBoxStorage storage;

    private VoiceCommandManager voiceCommandManager;
    private ProximitySensorManager proximitySensorManager;

    private final BroadcastReceiver paymentReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refreshHistory();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        storage = new SoundBoxStorage(this);
        initViews();
        setupLanguageAndSwitches();
        setupRecyclerView();

        // Warm up TTS
        SoundBoxSpeaker.getInstance(this);

        // Initialize Hands-Free Managers
        voiceCommandManager = new VoiceCommandManager(this);
        proximitySensorManager = new ProximitySensorManager(this);

        btnPermission.setOnClickListener(v -> openNotificationAccessSettings());
        btnTestVoice.setOnClickListener(v -> {
            Toast.makeText(this, "Testing voice announcement...", Toast.LENGTH_SHORT).show();
            SoundBoxSpeaker.getInstance(this).speakTest("100");
        });

        btnRepeatLast.setOnClickListener(v -> {
            Toast.makeText(this, "Repeating last payment...", Toast.LENGTH_SHORT).show();
            SoundBoxSpeaker.getInstance(this).repeatLastPayment();
        });

        btnClearHistory.setOnClickListener(v -> {
            storage.clearHistory();
            refreshHistory();
            Toast.makeText(this, "History cleared", Toast.LENGTH_SHORT).show();
        });
    }

    private void initViews() {
        cardStatus = findViewById(R.id.cardStatus);
        tvStatusTitle = findViewById(R.id.tvStatusTitle);
        tvStatusDesc = findViewById(R.id.tvStatusDesc);
        btnPermission = findViewById(R.id.btnPermission);
        btnTestVoice = findViewById(R.id.btnTestVoice);
        btnRepeatLast = findViewById(R.id.btnRepeatLast);

        rgLanguage = findViewById(R.id.rgLanguage);
        rbEnglishTamil = findViewById(R.id.rbEnglishTamil);
        rbEnglish = findViewById(R.id.rbEnglish);
        rbTamil = findViewById(R.id.rbTamil);
        rbHindi = findViewById(R.id.rbHindi);
        rbHinglish = findViewById(R.id.rbHinglish);
        rbTelugu = findViewById(R.id.rbTelugu);

        switchVoiceCommand = findViewById(R.id.switchVoiceCommand);
        switchWaveRepeat = findViewById(R.id.switchWaveRepeat);

        switchRepeat = findViewById(R.id.switchRepeat);
        switchIncludePayer = findViewById(R.id.switchIncludePayer);
        switchVolumeBoost = findViewById(R.id.switchVolumeBoost);

        btnClearHistory = findViewById(R.id.btnClearHistory);
        tvEmptyHistory = findViewById(R.id.tvEmptyHistory);
        rvPayments = findViewById(R.id.rvPayments);
    }

    private void setupLanguageAndSwitches() {
        String lang = storage.getLanguage();
        if ("en_ta".equalsIgnoreCase(lang)) rbEnglishTamil.setChecked(true);
        else if ("ta".equalsIgnoreCase(lang)) rbTamil.setChecked(true);
        else if ("en".equalsIgnoreCase(lang)) rbEnglish.setChecked(true);
        else if ("hi".equalsIgnoreCase(lang)) rbHindi.setChecked(true);
        else if ("hinglish".equalsIgnoreCase(lang)) rbHinglish.setChecked(true);
        else if ("te".equalsIgnoreCase(lang)) rbTelugu.setChecked(true);
        else rbEnglishTamil.setChecked(true);

        rgLanguage.setOnCheckedChangeListener((group, checkedId) -> {
            String selected = "en_ta";
            if (checkedId == R.id.rbEnglishTamil) selected = "en_ta";
            else if (checkedId == R.id.rbTamil) selected = "ta";
            else if (checkedId == R.id.rbEnglish) selected = "en";
            else if (checkedId == R.id.rbHindi) selected = "hi";
            else if (checkedId == R.id.rbHinglish) selected = "hinglish";
            else if (checkedId == R.id.rbTelugu) selected = "te";

            storage.setLanguage(selected);
            SoundBoxSpeaker.getInstance(this).setLanguage(selected);
        });

        // Hands-Free Voice Listener switch
        switchVoiceCommand.setChecked(storage.isHandsFreeVoiceEnabled());
        switchVoiceCommand.setOnCheckedChangeListener((buttonView, isChecked) -> {
            storage.setHandsFreeVoiceEnabled(isChecked);
            if (isChecked) {
                checkAndRequestAudioPermission();
            } else {
                if (voiceCommandManager != null) voiceCommandManager.setEnabled(false);
            }
        });

        // Proximity Wave Sensor switch
        switchWaveRepeat.setChecked(storage.isWaveRepeatEnabled());
        switchWaveRepeat.setOnCheckedChangeListener((buttonView, isChecked) -> {
            storage.setWaveRepeatEnabled(isChecked);
            if (proximitySensorManager != null) proximitySensorManager.setEnabled(isChecked);
        });

        switchRepeat.setChecked(storage.isRepeatTwice());
        switchRepeat.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setRepeatTwice(isChecked));

        switchIncludePayer.setChecked(storage.isIncludePayer());
        switchIncludePayer.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setIncludePayer(isChecked));

        switchVolumeBoost.setChecked(storage.isVolumeBoost());
        switchVolumeBoost.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setVolumeBoost(isChecked));
    }

    private void checkAndRequestAudioPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
        } else {
            if (voiceCommandManager != null) voiceCommandManager.setEnabled(true);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RECORD_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Voice command listening active! Say 'Hey Raj, Repeat'", Toast.LENGTH_LONG).show();
                if (voiceCommandManager != null) voiceCommandManager.setEnabled(true);
            } else {
                switchVoiceCommand.setChecked(false);
                storage.setHandsFreeVoiceEnabled(false);
                Toast.makeText(this, "Microphone permission needed for 'Hey Raj' voice command", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void setupRecyclerView() {
        rvPayments.setLayoutManager(new LinearLayoutManager(this));
        List<PaymentRecord> history = storage.getHistory();
        adapter = new PaymentHistoryAdapter(history);
        rvPayments.setAdapter(adapter);
        updateEmptyView(history.isEmpty());
    }

    private void refreshHistory() {
        List<PaymentRecord> history = storage.getHistory();
        adapter.updateList(history);
        updateEmptyView(history.isEmpty());
    }

    private void updateEmptyView(boolean isEmpty) {
        tvEmptyHistory.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
        rvPayments.setVisibility(isEmpty ? View.GONE : View.VISIBLE);
    }

    private boolean isNotificationServiceEnabled() {
        String pkgName = getPackageName();
        final String flat = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        if (!TextUtils.isEmpty(flat)) {
            final String[] names = flat.split(":");
            for (String name : names) {
                final ComponentName cn = ComponentName.unflattenFromString(name);
                if (cn != null && TextUtils.equals(pkgName, cn.getPackageName())) {
                    return true;
                }
            }
        }
        return false;
    }

    private void updateStatusCard() {
        boolean enabled = isNotificationServiceEnabled();
        if (enabled) {
            cardStatus.setCardBackgroundColor(Color.parseColor("#ECFDF5"));
            cardStatus.setStrokeColor(Color.parseColor("#10B981"));
            tvStatusTitle.setText(R.string.status_active);
            tvStatusTitle.setTextColor(Color.parseColor("#065F46"));
            tvStatusDesc.setText(R.string.desc_active);
            btnPermission.setText("Access Active ✅");
            btnPermission.setEnabled(false);
            btnPermission.setBackgroundColor(Color.parseColor("#10B981"));
        } else {
            cardStatus.setCardBackgroundColor(Color.parseColor("#FFFBEB"));
            cardStatus.setStrokeColor(Color.parseColor("#F59E0B"));
            tvStatusTitle.setText(R.string.status_inactive);
            tvStatusTitle.setTextColor(Color.parseColor("#92400E"));
            tvStatusDesc.setText(R.string.desc_inactive);
            btnPermission.setText(R.string.grant_permission);
            btnPermission.setEnabled(true);
            btnPermission.setBackgroundColor(Color.parseColor("#EA580C"));
        }
    }

    private void openNotificationAccessSettings() {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            } else {
                intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            }
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Please enable notification access in phone settings", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateStatusCard();
        refreshHistory();

        if (storage.isHandsFreeVoiceEnabled() && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            if (voiceCommandManager != null) voiceCommandManager.setEnabled(true);
        }

        if (storage.isWaveRepeatEnabled() && proximitySensorManager != null) {
            proximitySensorManager.setEnabled(true);
        }

        IntentFilter filter = new IntentFilter(UpiNotificationListenerService.ACTION_PAYMENT_RECEIVED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(paymentReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(paymentReceiver, filter);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (voiceCommandManager != null) {
            voiceCommandManager.stopListening();
        }
        if (proximitySensorManager != null) {
            proximitySensorManager.stop();
        }
        try {
            unregisterReceiver(paymentReceiver);
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (voiceCommandManager != null) {
            voiceCommandManager.destroy();
        }
    }
}
