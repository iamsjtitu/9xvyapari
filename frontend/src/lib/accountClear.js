import api from "@/lib/api";

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// Party-wise make-up of the Account Clear head from /reports/account-clear rows.
// headBalance (optional): adds an "Opening / other postings" row so the sub-rows add up to the head.
export const aggregateClearRows = (rows, headBalance) => {
  const by = new Map();
  for (const row of rows || []) {
    const key = row.party_id || row.party_name;
    const cur = by.get(key) || { party_id: row.party_id || key, party_name: row.party_name, net: 0, last_date: "", count: 0 };
    cur.net += row.side === "off" ? row.amount : -row.amount;
    cur.count += 1;
    if (row.date > cur.last_date) cur.last_date = row.date;
    by.set(key, cur);
  }
  const out = [...by.values()].filter((b) => Math.abs(b.net) >= 0.005).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  if (typeof headBalance === "number") {
    const other = headBalance - out.reduce((t, b) => t + b.net, 0);
    if (Math.abs(other) >= 0.005) out.push({ party_id: "other", party_name: "Opening / other postings", net: other, last_date: "", count: 1 });
  }
  return out;
};

export const clearRowLabel = (b) => `↳ ${b.party_name}${b.last_date ? ` · cleared upto ${fmtDate(b.last_date)}` : ""}${b.count > 1 ? ` (${b.count})` : ""}`;

// Fetch + aggregate in one go. dateTo omitted → everything till today.
export const fetchClearBreakdown = async (ledgerId, headBalance, dateTo) => {
  const { data } = await api.get("/reports/account-clear", { params: dateTo ? { date_to: dateTo } : {} });
  return { ledgerId, rows: aggregateClearRows(data.rows, headBalance) };
};
