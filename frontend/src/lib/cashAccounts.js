import api from "@/lib/api";

// Cash/Bank ledgers = parties in the CASH & BANK group + legacy accounts collection (same list Rokad uses)
export const fetchCashAccounts = async () => {
  const [p, a] = await Promise.all([api.get("/parties"), api.get("/accounts")]);
  const partyCash = p.data.filter((x) => /cash|bank/i.test(x.group_name || ""));
  const oldAcc = a.data.filter((x) => /cash|bank/i.test(x.group_name || "")).map((x) => ({ ...x, _isAccount: true }));
  return [...partyCash, ...oldAcc];
};

export const defaultCashAccount = (accounts) =>
  accounts.find((a) => Number(a.code) === 301) || accounts.find((a) => /cash/i.test(a.name || "")) || accounts[0];

export const accountLabel = (a) => `${a.code ? `${a.code} · ` : ""}${a.name}`;
