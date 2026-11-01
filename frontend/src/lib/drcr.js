import { inr } from "@/lib/api";

// STANDARD (Tally) convention — user's choice, Jun 2026 — applies to every ledger, list, summary and print:
//   Party ledger : Debit  = party KO diya (payment / udhaar / sale bill)  → party par baki badhta hai
//                  Credit = party NE diya (receipt / purchase bill)       → party par baki ghatta hai
//                  Balance > 0 → "Dr" (party se LENA)  ·  Balance < 0 → "Cr" (party ko DENA)
//   Cash / Bank  : Debit  = paisa AAYA (receipt) · Credit = paisa GAYA (payment)
//                  Balance > 0 → "Dr" (paisa HAI)  ·  Balance < 0 → "Cr" (overdraft)
// Internal numbers are unchanged: +ve = party owes us / cash in hand.
export const drcr = (n) => (n > 0 ? "Dr" : n < 0 ? "Cr" : "");
export const fmtBal = (n, rupee = true) => `${rupee ? "₹ " : ""}${inr(Math.abs(n || 0))} ${drcr(n)}`.trim();
export const LEGEND_PARTY = "DR = PARTY SE LENA (party ko diya) · CR = PARTY KO DENA (party ne diya)";
export const LEGEND_CASH = "DR = PAISA AAYA / ACCOUNT ME BAKI · CR = PAISA GAYA / OVERDRAFT";

// Column headings: cash/bank ledger → aaya/gaya; party ledger → party ko diya / party ne diya
export const COL_DEBIT = (isCash) => (isCash ? "Debit (Aaya)" : "Debit (Party ko diya)");
export const COL_CREDIT = (isCash) => (isCash ? "Credit (Gaya)" : "Credit (Party ne diya)");
