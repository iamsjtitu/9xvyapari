import { Toaster as Sonner } from "sonner";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import RokadPanna from "@/pages/RokadPanna";
import PartyKhata from "@/pages/PartyKhata";
import PartyLedger from "@/pages/PartyLedger";
import GallaMaster from "@/pages/GallaMaster";
import NayaBill from "@/pages/NayaBill";
import BillView from "@/pages/BillView";
import Reports from "@/pages/Reports";
import AccountGroups from "@/pages/AccountGroups";
import Accounts from "@/pages/Accounts";
import JournalEntry from "@/pages/JournalEntry";
import Backup from "@/pages/Backup";
import Settings from "@/pages/Settings";
import YearEnd from "@/pages/YearEnd";
import Inward from "@/pages/Inward";
import TrialBalance from "@/pages/TrialBalance";
import ImportDBF from "@/pages/ImportDBF";
import GSTReturns from "@/pages/GSTReturns";
import "@/App.css";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen grid place-items-center text-muted2 font-heading">
        Loading...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Sonner position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route
            path="/"
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="rokad" element={<RokadPanna />} />
            <Route path="journal" element={<JournalEntry />} />
            <Route path="parties" element={<PartyKhata />} />
            <Route path="parties/:id" element={<PartyLedger />} />
            <Route path="items" element={<GallaMaster />} />
            <Route path="bills" element={<NayaBill />} />
            <Route path="bills/:id" element={<BillView />} />
            <Route path="reports" element={<Reports />} />
            <Route path="account-groups" element={<AccountGroups />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="inward" element={<Inward />} />
            <Route path="trial-balance" element={<TrialBalance />} />
            <Route path="gst-returns" element={<GSTReturns />} />
            <Route path="import-dbf" element={<ImportDBF />} />
            <Route path="backup" element={<Backup />} />
            <Route path="settings" element={<Settings />} />
            <Route path="year-end" element={<YearEnd />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
