package com.bmucanteen.soundbox;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class PaymentHistoryAdapter extends RecyclerView.Adapter<PaymentHistoryAdapter.ViewHolder> {
    private List<PaymentRecord> list;
    private final SimpleDateFormat timeFormat = new SimpleDateFormat("hh:mm a", Locale.getDefault());
    private final SimpleDateFormat dateFormat = new SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault());

    public PaymentHistoryAdapter(List<PaymentRecord> list) {
        this.list = list;
    }

    public void updateList(List<PaymentRecord> newList) {
        this.list = newList;
        notifyDataSetChanged();
    }

    private String formatDateTime(long timestamp) {
        Calendar recordCal = Calendar.getInstance();
        recordCal.setTimeInMillis(timestamp);

        Calendar todayCal = Calendar.getInstance();
        if (recordCal.get(Calendar.YEAR) == todayCal.get(Calendar.YEAR) &&
            recordCal.get(Calendar.DAY_OF_YEAR) == todayCal.get(Calendar.DAY_OF_YEAR)) {
            return "Today, " + timeFormat.format(new Date(timestamp));
        }

        todayCal.add(Calendar.DAY_OF_YEAR, -1);
        if (recordCal.get(Calendar.YEAR) == todayCal.get(Calendar.YEAR) &&
            recordCal.get(Calendar.DAY_OF_YEAR) == todayCal.get(Calendar.DAY_OF_YEAR)) {
            return "Yesterday, " + timeFormat.format(new Date(timestamp));
        }

        return dateFormat.format(new Date(timestamp));
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_payment, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        PaymentRecord record = list.get(position);
        
        String app = record.getAppName();
        String badge = "UPI";
        if (app.toLowerCase().contains("google")) badge = "GPay";
        else if (app.toLowerCase().contains("phonepe")) badge = "PhPe";
        else if (app.toLowerCase().contains("paytm")) badge = "Paytm";
        else if (app.toLowerCase().contains("bhim")) badge = "BHIM";
        else if (app.toLowerCase().contains("bank") || app.toLowerCase().contains("sbi") || app.toLowerCase().contains("hdfc") || app.toLowerCase().contains("icici") || app.toLowerCase().contains("axis")) badge = "Bank";

        holder.tvAppBadge.setText(badge);
        
        String payer = record.getPayerName();
        if (payer == null || payer.trim().isEmpty()) {
            payer = "UPI Customer";
        }
        holder.tvPayer.setText(payer);

        String timeStr = formatDateTime(record.getTimestamp());
        holder.tvTime.setText(timeStr + " • " + record.getAppName());

        holder.tvAmount.setText("+₹" + record.getAmount());
    }

    @Override
    public int getItemCount() {
        return list != null ? list.size() : 0;
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvAppBadge, tvPayer, tvTime, tvAmount;

        ViewHolder(View itemView) {
            super(itemView);
            tvAppBadge = itemView.findViewById(R.id.tvAppBadge);
            tvPayer = itemView.findViewById(R.id.tvPayer);
            tvTime = itemView.findViewById(R.id.tvTime);
            tvAmount = itemView.findViewById(R.id.tvAmount);
        }
    }
}
