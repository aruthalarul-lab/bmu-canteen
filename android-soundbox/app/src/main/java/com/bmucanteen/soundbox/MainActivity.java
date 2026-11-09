package com.bmucanteen.soundbox;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
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
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_RECORD_AUDIO = 201;
    private static final int REQ_OVERLAY_PERMISSION = 202;
    private static final int REQ_SMS_PERMISSION = 203;

    private MaterialCardView cardStatus;
    private TextView tvStatusTitle, tvStatusDesc, tvEmptyHistory, btnClearHistory, btnSyncSms, btnPreviewVoice;
    private MaterialButton btnPermission, btnRepeatLast;
    private SwitchMaterial switchMasterSoundbox;
    
    // LCD Display Screen Views
    private TextView tvMainLcdStatus, tvMainLcdAmount, tvMainLcdPayerApp, tvMainLcdTime, btnMainLcdPopOut;

    private RadioGroup rgLanguage, rgFemaleVoice;
    private RadioButton rbEnglishTamil, rbEnglish, rbTamil, rbHindi, rbHinglish, rbTelugu;
    private RadioButton rbFemaleNatural, rbFemaleCrisp, rbFemaleSoft, rbVoiceDefault;
    private SwitchMaterial switchVoiceCommand, switchWaveRepeat, switchFloatingLcd;
    private SwitchMaterial switchRepeat, switchIncludePayer, switchVolumeBoost;

    // App-specific switches
    private SwitchMaterial switchAppGpay, switchAppPhonepe, switchAppPaytm, switchAppBhim, switchAppBankSms;

    private RecyclerView rvPayments;
    private PaymentHistoryAdapter adapter;
    private SoundBoxStorage storage;

    private VoiceCommandManager voiceCommandManager;
    private ProximitySensorManager proximitySensorManager;

    private final SimpleDateFormat timeFormat = new SimpleDateFormat("hh:mm a", Locale.getDefault());

    private final BroadcastReceiver paymentReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refreshHistory();
            updateLcdDisplay(storage.getLastPayment());
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
        btnPreviewVoice.setOnClickListener(v -> {
            Toast.makeText(this, "Playing Tamil female voice sample...", Toast.LENGTH_SHORT).show();
            SoundBoxSpeaker.getInstance(this).previewTamilVoice();
        });

        btnRepeatLast.setOnClickListener(v -> {
            Toast.makeText(this, "Repeating last payment...", Toast.LENGTH_SHORT).show();
            SoundBoxSpeaker.getInstance(this).repeatLastPayment();
            updateLcdDisplay(storage.getLastPayment());
        });

        btnMainLcdPopOut.setOnClickListener(v -> {
            PaymentRecord last = storage.getLastPayment();
            String amt = last != null ? last.getAmount() : "100";
            String payer = last != null ? last.getPayerName() : "Rahul Sharma";
            String app = last != null ? last.getAppName() : "Google Pay";
            checkAndLaunchFloatingLcd(amt, payer, app);
        });

        btnClearHistory.setOnClickListener(v -> {
            storage.clearHistory();
            refreshHistory();
            updateLcdDisplay(null);
            Toast.makeText(this, "History cleared", Toast.LENGTH_SHORT).show();
        });

        btnSyncSms.setOnClickListener(v -> showSyncSmsDialog());

        // Initialize LCD Screen with last payment or ready state
        updateLcdDisplay(storage.getLastPayment());

        // Check and prompt SMS permission if needed for real-time bank SMS alerts
        if (storage.isBankSmsEnabled() && ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestSmsPermission();
        }
    }

    private void initViews() {
        cardStatus = findViewById(R.id.cardStatus);
        tvStatusTitle = findViewById(R.id.tvStatusTitle);
        tvStatusDesc = findViewById(R.id.tvStatusDesc);
        btnPermission = findViewById(R.id.btnPermission);
        btnRepeatLast = findViewById(R.id.btnRepeatLast);
        switchMasterSoundbox = findViewById(R.id.switchMasterSoundbox);

        // LCD Display in MainActivity
        tvMainLcdStatus = findViewById(R.id.tvMainLcdStatus);
        tvMainLcdAmount = findViewById(R.id.tvMainLcdAmount);
        tvMainLcdPayerApp = findViewById(R.id.tvMainLcdPayerApp);
        tvMainLcdTime = findViewById(R.id.tvMainLcdTime);
        btnMainLcdPopOut = findViewById(R.id.btnMainLcdPopOut);

        rgLanguage = findViewById(R.id.rgLanguage);
        rbEnglishTamil = findViewById(R.id.rbEnglishTamil);
        rbEnglish = findViewById(R.id.rbEnglish);
        rbTamil = findViewById(R.id.rbTamil);
        rbHindi = findViewById(R.id.rbHindi);
        rbHinglish = findViewById(R.id.rbHinglish);
        rbTelugu = findViewById(R.id.rbTelugu);

        // Tamil Female Voice Controls
        btnPreviewVoice = findViewById(R.id.btnPreviewVoice);
        rgFemaleVoice = findViewById(R.id.rgFemaleVoice);
        rbFemaleNatural = findViewById(R.id.rbFemaleNatural);
        rbFemaleCrisp = findViewById(R.id.rbFemaleCrisp);
        rbFemaleSoft = findViewById(R.id.rbFemaleSoft);
        rbVoiceDefault = findViewById(R.id.rbVoiceDefault);

        switchVoiceCommand = findViewById(R.id.switchVoiceCommand);
        switchWaveRepeat = findViewById(R.id.switchWaveRepeat);
        switchFloatingLcd = findViewById(R.id.switchFloatingLcd);

        switchRepeat = findViewById(R.id.switchRepeat);
        switchIncludePayer = findViewById(R.id.switchIncludePayer);
        switchVolumeBoost = findViewById(R.id.switchVolumeBoost);

        // App-specific switches
        switchAppGpay = findViewById(R.id.switchAppGpay);
        switchAppPhonepe = findViewById(R.id.switchAppPhonepe);
        switchAppPaytm = findViewById(R.id.switchAppPaytm);
        switchAppBhim = findViewById(R.id.switchAppBhim);
        switchAppBankSms = findViewById(R.id.switchAppBankSms);

        btnClearHistory = findViewById(R.id.btnClearHistory);
        btnSyncSms = findViewById(R.id.btnSyncSms);
        tvEmptyHistory = findViewById(R.id.tvEmptyHistory);
        rvPayments = findViewById(R.id.rvPayments);
    }

    private void updateLcdDisplay(PaymentRecord record) {
        if (tvMainLcdAmount == null) return;

        if (!storage.isSoundBoxEnabled()) {
            tvMainLcdStatus.setText("PAUSED • SERVICE OFF");
            tvMainLcdStatus.setTextColor(Color.parseColor("#94A3B8"));
            tvMainLcdAmount.setText("PAUSED");
            tvMainLcdPayerApp.setText("SoundBox is paused by user");
            return;
        }

        if (record != null) {
            tvMainLcdStatus.setText("● PAYMENT RECEIVED");
            tvMainLcdStatus.setTextColor(Color.parseColor("#34D399"));
            tvMainLcdAmount.setText("₹ " + record.getAmount());
            tvMainLcdPayerApp.setText(record.getAppName() + " • " + (record.getPayerName().isEmpty() ? "Customer" : record.getPayerName()));
            String timeStr = timeFormat.format(new Date(record.getTimestamp()));
            tvMainLcdTime.setText("Last alert: " + timeStr);
        } else {
            tvMainLcdStatus.setText("READY • WAITING FOR PAYMENT");
            tvMainLcdStatus.setTextColor(Color.parseColor("#059669"));
            tvMainLcdAmount.setText("₹ 0.00");
            tvMainLcdPayerApp.setText("BMU Canteen • Smart Food Court");
            tvMainLcdTime.setText("Last alert: None yet");
        }
    }

    private void checkAndLaunchFloatingLcd(String amount, String payer, String app) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Please allow 'Display over other apps' to show LCD on Home screen", Toast.LENGTH_LONG).show();
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
            startActivityForResult(intent, REQ_OVERLAY_PERMISSION);
        } else {
            FloatingLcdService.showLcd(this, amount, payer, app);
            Toast.makeText(this, "Floating LCD launched! Check your home screen", Toast.LENGTH_SHORT).show();
        }
    }

    private void setupLanguageAndSwitches() {
        // Master SoundBox Enable / Disable Switch
        switchMasterSoundbox.setChecked(storage.isSoundBoxEnabled());
        switchMasterSoundbox.setOnCheckedChangeListener((buttonView, isChecked) -> {
            storage.setSoundBoxEnabled(isChecked);
            updateStatusCard();
            updateLcdDisplay(storage.getLastPayment());

            if (isChecked) {
                Toast.makeText(this, "SoundBox Enabled 🟢", Toast.LENGTH_SHORT).show();
                if (storage.isHandsFreeVoiceEnabled() && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    if (voiceCommandManager != null) voiceCommandManager.setEnabled(true);
                }
                if (storage.isWaveRepeatEnabled() && proximitySensorManager != null) {
                    proximitySensorManager.setEnabled(true);
                }
            } else {
                Toast.makeText(this, "SoundBox Paused ⏸️", Toast.LENGTH_SHORT).show();
                if (voiceCommandManager != null) voiceCommandManager.stopListening();
                if (proximitySensorManager != null) proximitySensorManager.stop();
            }
        });

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

        // Tamil Female Voice Setup
        String voiceProfile = storage.getVoiceProfile();
        if ("female_crisp".equals(voiceProfile)) rbFemaleCrisp.setChecked(true);
        else if ("female_soft".equals(voiceProfile)) rbFemaleSoft.setChecked(true);
        else if ("default".equals(voiceProfile)) rbVoiceDefault.setChecked(true);
        else rbFemaleNatural.setChecked(true);

        rgFemaleVoice.setOnCheckedChangeListener((group, checkedId) -> {
            String selected = "female_natural";
            if (checkedId == R.id.rbFemaleCrisp) selected = "female_crisp";
            else if (checkedId == R.id.rbFemaleSoft) selected = "female_soft";
            else if (checkedId == R.id.rbVoiceDefault) selected = "default";

            storage.setVoiceProfile(selected);
            Toast.makeText(this, "Voice updated! Playing preview...", Toast.LENGTH_SHORT).show();
            SoundBoxSpeaker.getInstance(this).previewTamilVoice();
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

        // Floating LCD Window switch
        switchFloatingLcd.setChecked(storage.isFloatingLcdEnabled());
        switchFloatingLcd.setOnCheckedChangeListener((buttonView, isChecked) -> {
            storage.setFloatingLcdEnabled(isChecked);
            if (isChecked && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
                startActivityForResult(intent, REQ_OVERLAY_PERMISSION);
            }
        });

        switchRepeat.setChecked(storage.isRepeatTwice());
        switchRepeat.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setRepeatTwice(isChecked));

        switchIncludePayer.setChecked(storage.isIncludePayer());
        switchIncludePayer.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setIncludePayer(isChecked));

        switchVolumeBoost.setChecked(storage.isVolumeBoost());
        switchVolumeBoost.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setVolumeBoost(isChecked));

        // Individual App switches
        switchAppGpay.setChecked(storage.isGpayEnabled());
        switchAppGpay.setOnCheckedChangeListener((b, isChecked) -> storage.setGpayEnabled(isChecked));

        switchAppPhonepe.setChecked(storage.isPhonePeEnabled());
        switchAppPhonepe.setOnCheckedChangeListener((b, isChecked) -> storage.setPhonePeEnabled(isChecked));

        switchAppPaytm.setChecked(storage.isPaytmEnabled());
        switchAppPaytm.setOnCheckedChangeListener((b, isChecked) -> storage.setPaytmEnabled(isChecked));

        switchAppBhim.setChecked(storage.isBhimEnabled());
        switchAppBhim.setOnCheckedChangeListener((b, isChecked) -> storage.setBhimEnabled(isChecked));

        switchAppBankSms.setChecked(storage.isBankSmsEnabled());
        switchAppBankSms.setOnCheckedChangeListener((b, isChecked) -> {
            storage.setBankSmsEnabled(isChecked);
            if (isChecked && ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
                requestSmsPermission();
            }
            updateStatusCard();
        });
    }

    private void requestSmsPermission() {
        ActivityCompat.requestPermissions(this, new String[]{
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
        }, REQ_SMS_PERMISSION);
    }

    private void checkAndRequestAudioPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
        } else {
            if (voiceCommandManager != null && storage.isSoundBoxEnabled()) voiceCommandManager.setEnabled(true);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RECORD_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Voice command listening active! Say 'Hey Raj, Repeat'", Toast.LENGTH_LONG).show();
                if (voiceCommandManager != null && storage.isSoundBoxEnabled()) voiceCommandManager.setEnabled(true);
            } else {
                switchVoiceCommand.setChecked(false);
                storage.setHandsFreeVoiceEnabled(false);
                Toast.makeText(this, "Microphone permission needed for 'Hey Raj' voice command", Toast.LENGTH_SHORT).show();
            }
        } else if (requestCode == REQ_SMS_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Real-time Bank SMS Alerts Active! 📩✅", Toast.LENGTH_LONG).show();
            } else {
                Toast.makeText(this, "SMS permission denied. Bank SMS alerts may not trigger.", Toast.LENGTH_LONG).show();
            }
            updateStatusCard();
        }
    }

    private void showSyncSmsDialog() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "SMS permission needed to read past SMS", Toast.LENGTH_SHORT).show();
            requestSmsPermission();
            return;
        }

        String[] options = new String[]{
            "Yesterday's Bank SMS",
            "Today's Bank SMS",
            "Last 7 Days Bank SMS"
        };

        new androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("📥 Import Past Bank SMS")
            .setItems(options, (dialog, which) -> {
                SmsHistoryImporter.TimeRange range;
                if (which == 0) range = SmsHistoryImporter.TimeRange.YESTERDAY;
                else if (which == 1) range = SmsHistoryImporter.TimeRange.TODAY;
                else range = SmsHistoryImporter.TimeRange.LAST_7_DAYS;

                performSmsImport(range);
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void performSmsImport(SmsHistoryImporter.TimeRange range) {
        Toast.makeText(this, "Scanning SMS inbox...", Toast.LENGTH_SHORT).show();
        SmsHistoryImporter.ImportResult result = SmsHistoryImporter.importSms(this, range);

        refreshHistory();
        PaymentRecord last = storage.getLastPayment();
        if (last != null) {
            updateLcdDisplay(last);
        }

        if (result.count > 0) {
            new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("✅ Import Successful")
                .setMessage("Found and created " + result.count + " transaction record(s) from " + result.timeRangeDescription + "!\n\nTotal Amount: ₹" + String.format(Locale.getDefault(), "%.2f", result.totalAmount))
                .setPositiveButton("OK", null)
                .show();
        } else {
            Toast.makeText(this, "No new credit SMS found for " + result.timeRangeDescription, Toast.LENGTH_LONG).show();
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
        boolean notifGranted = isNotificationServiceEnabled();
        boolean smsGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
        boolean soundboxEnabled = storage.isSoundBoxEnabled();

        if (!soundboxEnabled) {
            // Disabled / Paused State
            cardStatus.setCardBackgroundColor(Color.parseColor("#F1F5F9"));
            cardStatus.setStrokeColor(Color.parseColor("#94A3B8"));
            tvStatusTitle.setText("SoundBox Paused ⏸️");
            tvStatusTitle.setTextColor(Color.parseColor("#475569"));
            tvStatusDesc.setText("Service is turned OFF. Incoming payments will not be announced.");
            btnPermission.setVisibility(View.GONE);
            return;
        }

        btnPermission.setVisibility(View.VISIBLE);

        if (!notifGranted) {
            // Notification Permission Needed
            cardStatus.setCardBackgroundColor(Color.parseColor("#FFFBEB"));
            cardStatus.setStrokeColor(Color.parseColor("#F59E0B"));
            tvStatusTitle.setText(R.string.status_inactive);
            tvStatusTitle.setTextColor(Color.parseColor("#92400E"));
            tvStatusDesc.setText("Notification access is needed to detect Google Pay, PhonePe & Paytm alerts.");
            btnPermission.setText(R.string.grant_permission);
            btnPermission.setEnabled(true);
            btnPermission.setBackgroundColor(Color.parseColor("#EA580C"));
            btnPermission.setOnClickListener(v -> openNotificationAccessSettings());
        } else if (!smsGranted && storage.isBankSmsEnabled()) {
            // SMS Permission Needed for Bank SMS
            cardStatus.setCardBackgroundColor(Color.parseColor("#FFFBEB"));
            cardStatus.setStrokeColor(Color.parseColor("#3B82F6"));
            tvStatusTitle.setText("SMS Permission Needed 📩");
            tvStatusTitle.setTextColor(Color.parseColor("#1D4ED8"));
            tvStatusDesc.setText("SMS permission is required to read real-time bank credit alerts (SBI, HDFC, ICICI, etc.).");
            btnPermission.setText("Grant SMS Permission 📩");
            btnPermission.setEnabled(true);
            btnPermission.setBackgroundColor(Color.parseColor("#2563EB"));
            btnPermission.setOnClickListener(v -> requestSmsPermission());
        } else {
            // Active & Listening State
            cardStatus.setCardBackgroundColor(Color.parseColor("#ECFDF5"));
            cardStatus.setStrokeColor(Color.parseColor("#10B981"));
            tvStatusTitle.setText(R.string.status_active);
            tvStatusTitle.setTextColor(Color.parseColor("#065F46"));
            tvStatusDesc.setText(R.string.desc_active);
            btnPermission.setText("All Access Active ✅");
            btnPermission.setEnabled(false);
            btnPermission.setBackgroundColor(Color.parseColor("#10B981"));
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
        updateLcdDisplay(storage.getLastPayment());

        if (storage.isSoundBoxEnabled()) {
            if (storage.isHandsFreeVoiceEnabled() && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                if (voiceCommandManager != null) voiceCommandManager.setEnabled(true);
            }
            if (storage.isWaveRepeatEnabled() && proximitySensorManager != null) {
                proximitySensorManager.setEnabled(true);
            }
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
