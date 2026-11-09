package com.bmucanteen.soundbox;

import android.graphics.Color;
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

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_payment, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        PaymentRecord record = list.get(position);
        
        String payer = record.getPayerName();
        if (payer == null || payer.trim().isEmpty()) {
            payer = "UPI Customer";
        }
        holder.tvPayer.setText(payer);

        String app = record.getAppName();
        holder.tvApp.setText("• " + app);

        long timestamp = record.getTimestamp();
        Calendar recordCal = Calendar.getInstance();
        recordCal.setTimeInMillis(timestamp);

        Calendar todayCal = Calendar.getInstance();
        boolean isToday = recordCal.get(Calendar.YEAR) == todayCal.get(Calendar.YEAR) &&
                          recordCal.get(Calendar.DAY_OF_YEAR) == todayCal.get(Calendar.DAY_OF_YEAR);

        todayCal.add(Calendar.DAY_OF_YEAR, -1);
        boolean isYesterday = recordCal.get(Calendar.YEAR) == todayCal.get(Calendar.YEAR) &&
                              recordCal.get(Calendar.DAY_OF_YEAR) == todayCal.get(Calendar.DAY_OF_YEAR);

        if (isToday) {
            holder.tvTime.setText("Today, " + timeFormat.format(new Date(timestamp)));
            holder.tvTime.setTextColor(Color.parseColor("#059669")); // Green for today
        } else if (isYesterday) {
            // Show actual date in blue color for yesterday
            holder.tvTime.setText(dateFormat.format(new Date(timestamp)));
            holder.tvTime.setTextColor(Color.parseColor("#2563EB")); // Blue for yesterday
        } else {
            holder.tvTime.setText(dateFormat.format(new Date(timestamp)));
            holder.tvTime.setTextColor(Color.parseColor("#64748B")); // Subtle slate for older
        }

        holder.tvAmount.setText("+₹" + record.getAmount());
    }

    @Override
    public int getItemCount() {
        return list != null ? list.size() : 0;
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvPayer, tvApp, tvTime, tvAmount;

        ViewHolder(View itemView) {
            super(itemView);
            tvPayer = itemView.findViewById(R.id.tvPayer);
            tvApp = itemView.findViewById(R.id.tvApp);
            tvTime = itemView.findViewById(R.id.tvTime);
            tvAmount = itemView.findViewById(R.id.tvAmount);
        }
    }
}
