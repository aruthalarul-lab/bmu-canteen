package com.bmucanteen.soundbox;

public class PaymentRecord {
    private String id;
    private String amount;
    private String payerName;
    private String appName;
    private long timestamp;

    public PaymentRecord(String id, String amount, String payerName, String appName, long timestamp) {
        this.id = id;
        this.amount = amount;
        this.payerName = payerName;
        this.appName = appName;
        this.timestamp = timestamp;
    }

    public String getId() { return id; }
    public String getAmount() { return amount; }
    public String getPayerName() { return payerName; }
    public String getAppName() { return appName; }
    public long getTimestamp() { return timestamp; }
}
