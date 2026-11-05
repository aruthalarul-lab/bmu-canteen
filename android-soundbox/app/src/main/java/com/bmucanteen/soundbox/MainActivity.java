package com.bmucanteen.soundbox;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.switchmaterial.SwitchMaterial;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private MaterialCardView cardStatus;
    private TextView tvStatusTitle, tvStatusDesc, tvEmptyHistory, btnClearHistory;
    private MaterialButton btnPermission, btnTestVoice;
    private RadioGroup rgLanguage;
    private RadioButton rbEnglish, rbHindi, rbHinglish, rbTamil, rbTelugu;
    private SwitchMaterial switchRepeat, switchIncludePayer, switchVolumeBoost;
    private RecyclerView rvPayments;
    private PaymentHistoryAdapter adapter;
    private SoundBoxStorage storage;

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

        btnPermission.setOnClickListener(v -> openNotificationAccessSettings());
        btnTestVoice.setOnClickListener(v -> {
            Toast.makeText(this, "Testing voice announcement...", Toast.LENGTH_SHORT).show();
            SoundBoxSpeaker.getInstance(this).speakTest("100");
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

        rgLanguage = findViewById(R.id.rgLanguage);
        rbEnglish = findViewById(R.id.rbEnglish);
        rbHindi = findViewById(R.id.rbHindi);
        rbHinglish = findViewById(R.id.rbHinglish);
        rbTamil = findViewById(R.id.rbTamil);
        rbTelugu = findViewById(R.id.rbTelugu);

        switchRepeat = findViewById(R.id.switchRepeat);
        switchIncludePayer = findViewById(R.id.switchIncludePayer);
        switchVolumeBoost = findViewById(R.id.switchVolumeBoost);

        btnClearHistory = findViewById(R.id.btnClearHistory);
        tvEmptyHistory = findViewById(R.id.tvEmptyHistory);
        rvPayments = findViewById(R.id.rvPayments);
    }

    private void setupLanguageAndSwitches() {
        String lang = storage.getLanguage();
        if ("hi".equalsIgnoreCase(lang)) rbHindi.setChecked(true);
        else if ("hinglish".equalsIgnoreCase(lang)) rbHinglish.setChecked(true);
        else if ("ta".equalsIgnoreCase(lang)) rbTamil.setChecked(true);
        else if ("te".equalsIgnoreCase(lang)) rbTelugu.setChecked(true);
        else rbEnglish.setChecked(true);

        rgLanguage.setOnCheckedChangeListener((group, checkedId) -> {
            String selected = "en";
            if (checkedId == R.id.rbHindi) selected = "hi";
            else if (checkedId == R.id.rbHinglish) selected = "hinglish";
            else if (checkedId == R.id.rbTamil) selected = "ta";
            else if (checkedId == R.id.rbTelugu) selected = "te";

            storage.setLanguage(selected);
            SoundBoxSpeaker.getInstance(this).setLanguage(selected);
        });

        switchRepeat.setChecked(storage.isRepeatTwice());
        switchRepeat.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setRepeatTwice(isChecked));

        switchIncludePayer.setChecked(storage.isIncludePayer());
        switchIncludePayer.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setIncludePayer(isChecked));

        switchVolumeBoost.setChecked(storage.isVolumeBoost());
        switchVolumeBoost.setOnCheckedChangeListener((buttonView, isChecked) -> storage.setVolumeBoost(isChecked));
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
        try {
            unregisterReceiver(paymentReceiver);
        } catch (Exception ignored) {}
    }
}
