import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import Chat from './pages/Chat';
import Campaigns from './pages/Campaigns';
import CallLogs from './pages/CallLogs';
import Billing from './pages/Billing';
import ForgotPassword from './pages/ForgotPassword';
import ProfileSettings from './pages/ProfileSettings';
import Scripts from './pages/Scripts';
import ForwardedCalls from './pages/ForwardedCalls';
import Leads from './pages/Leads';
import LiveDashboard from './pages/LiveDashboard';

const isTokenValid = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (!payload?.exp) return true;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  if (!isTokenValid()) {
    localStorage.removeItem('token');
    return <Navigate to="/login" replace />;
  }
  return children;
};

const PublicOnlyRoute = ({ children }) => {
  if (isTokenValid()) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
        <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
        
        {/* Protected Routes inside Layout */}
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="knowledge" element={<KnowledgeBase />} />
          <Route path="chat" element={<Chat />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="scripts" element={<Scripts />} />
          <Route path="forwarded-calls" element={<ForwardedCalls />} />
          <Route path="leads" element={<Leads />} />
          <Route path="logs" element={<CallLogs />} />
          <Route path="live" element={<LiveDashboard />} />
          <Route path="billing" element={<Billing />} />
          <Route path="profile" element={<ProfileSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
