import { inr } from "@/lib/api";

// PASSBOOK convention (user's choice, Jun 2026) — applies to ledgers, lists, summaries (Trial Balance / Opening Balance stay standard):
//   Credit column = paisa / maal AAYA (ledger-wale ko mila)   → balance badhta hai
//   Debit  column = paisa / maal GAYA (ledger-wale ne diya)   → balance ghatta hai
//   Balance > 0 → "Cr" (party se LENA · cash/bank me paisa HAI) · Balance < 0 → "Dr" (party ko DENA · overdraft)
// Internal numbers are unchanged: +ve = party owes us / cash in hand.
export const drcr = (n) => (n > 0 ? "Cr" : n < 0 ? "Dr" : "");
export const fmtBal = (n, rupee = true) => `${rupee ? "₹ " : ""}${inr(Math.abs(n || 0))} ${drcr(n)}`.trim();
export const LEGEND_PARTY = "CR = PARTY SE LENA (party ko mila) · DR = PARTY KO DENA";
export const LEGEND_CASH = "CR = PAISA AAYA / ACCOUNT ME BAKI · DR = PAISA GAYA / OVERDRAFT";

// Column headings: cash/bank ledger → gaya/aaya; party ledger → party ne diya / party ko mila
export const COL_DEBIT = (isCash) => (isCash ? "Debit (Gaya)" : "Debit (Party ne diya)");
export const COL_CREDIT = (isCash) => (isCash ? "Credit (Aaya)" : "Credit (Party ko mila)");
