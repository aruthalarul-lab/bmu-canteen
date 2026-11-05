package com.bmucanteen.soundbox;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.util.Log;

public class ProximitySensorManager implements SensorEventListener {
    private static final String TAG = "ProximitySensorManager";
    private final Context context;
    private final SensorManager sensorManager;
    private Sensor proximitySensor;
    private boolean isEnabled = true;
    private boolean wasNear = false;
    private long lastTriggerTime = 0;

    public ProximitySensorManager(Context context) {
        this.context = context.getApplicationContext();
        this.sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            this.proximitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY);
        }
    }

    public void start() {
        if (!isEnabled || sensorManager == null || proximitySensor == null) return;
        sensorManager.registerListener(this, proximitySensor, SensorManager.SENSOR_DELAY_UI);
    }

    public void stop() {
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
        wasNear = false;
    }

    public void setEnabled(boolean enabled) {
        this.isEnabled = enabled;
        if (enabled) {
            start();
        } else {
            stop();
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!isEnabled || event.sensor.getType() != Sensor.TYPE_PROXIMITY) return;

        float distance = event.values[0];
        float maxRange = proximitySensor.getMaximumRange();
        boolean isNear = distance < maxRange && distance < 5.0f;

        if (isNear) {
            wasNear = true;
        } else {
            // Hand covered the sensor and has now moved away (A complete wave!)
            if (wasNear) {
                wasNear = false;
                long now = System.currentTimeMillis();
                // 2-second debounce between waves
                if (now - lastTriggerTime > 2000) {
                    lastTriggerTime = now;
                    Log.i(TAG, "Wave gesture detected! Triggering repeat last payment...");
                    SoundBoxSpeaker.getInstance(context).repeatLastPayment();
                }
            }
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
