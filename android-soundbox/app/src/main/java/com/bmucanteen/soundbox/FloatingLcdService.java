package com.bmucanteen.soundbox;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.annotation.Nullable;

public class FloatingLcdService extends Service {
    private static final String TAG = "FloatingLcdService";
    public static final String EXTRA_AMOUNT = "extra_amount";
    public static final String EXTRA_PAYER = "extra_payer";
    public static final String EXTRA_APP = "extra_app";

    private WindowManager windowManager;
    private View floatingView;
    private WindowManager.LayoutParams layoutParams;
    private final Handler autoDismissHandler = new Handler(Looper.getMainLooper());
    private final Runnable autoDismissRunnable = this::stopSelf;

    public static void showLcd(Context context, String amount, String payer, String appName) {
        try {
            SoundBoxStorage storage = new SoundBoxStorage(context);
            if (!storage.isFloatingLcdEnabled()) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                Log.w(TAG, "Cannot draw overlay: permission not granted");
                return;
            }

            Intent intent = new Intent(context, FloatingLcdService.class);
            intent.putExtra(EXTRA_AMOUNT, amount);
            intent.putExtra(EXTRA_PAYER, payer);
            intent.putExtra(EXTRA_APP, appName);
            context.startService(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start FloatingLcdService: " + e.getMessage());
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        initFloatingWindow();
    }

    private void initFloatingWindow() {
        if (floatingView != null) return;

        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        LayoutInflater inflater = (LayoutInflater) getSystemService(LAYOUT_INFLATER_SERVICE);
        floatingView = inflater.inflate(R.layout.window_floating_lcd, null);

        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        layoutParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );

        layoutParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        layoutParams.x = 0;
        layoutParams.y = 120; // Near top of home screen

        // Enable Dragging
        floatingView.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = layoutParams.x;
                        initialY = layoutParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        layoutParams.x = initialX + (int) (event.getRawX() - initialTouchX);
                        layoutParams.y = initialY + (int) (event.getRawY() - initialTouchY);
                        if (windowManager != null && floatingView != null) {
                            windowManager.updateViewLayout(floatingView, layoutParams);
                        }
                        return true;
                }
                return false;
            }
        });

        View btnClose = floatingView.findViewById(R.id.btnLcdClose);
        if (btnClose != null) {
            btnClose.setOnClickListener(v -> stopSelf());
        }

        try {
            windowManager.addView(floatingView, layoutParams);
        } catch (Exception e) {
            Log.e(TAG, "Could not add floating view to WindowManager: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && floatingView != null) {
            String amount = intent.getStringExtra(EXTRA_AMOUNT);
            String payer = intent.getStringExtra(EXTRA_PAYER);
            String app = intent.getStringExtra(EXTRA_APP);

            TextView tvAmount = floatingView.findViewById(R.id.tvLcdAmount);
            TextView tvPayerApp = floatingView.findViewById(R.id.tvLcdPayerApp);
            TextView tvStatus = floatingView.findViewById(R.id.tvLcdStatus);

            if (tvAmount != null && amount != null) {
                tvAmount.setText("₹ " + amount);
            }
            if (tvPayerApp != null) {
                String appName = app != null ? app : "UPI";
                String payerName = (payer != null && !payer.trim().isEmpty()) ? payer : "Customer";
                tvPayerApp.setText(appName + " • " + payerName);
            }
            if (tvStatus != null) {
                tvStatus.setText("● PAYMENT RECEIVED");
            }

            // Auto dismiss after 15 seconds
            autoDismissHandler.removeCallbacks(autoDismissRunnable);
            autoDismissHandler.postDelayed(autoDismissRunnable, 15000);
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        autoDismissHandler.removeCallbacks(autoDismissRunnable);
        if (floatingView != null && windowManager != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception ignored) {}
            floatingView = null;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
