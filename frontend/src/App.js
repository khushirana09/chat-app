import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ChatApp from "./pages/ChatApp";
import WelcomeName from "./pages/WelcomeName";
import SelectAvatar from "./pages/SelectAvatar";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PrivateRoute from "./pages/PrivateRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Redirect to chat if already logged in
const PublicRoute = ({ children }) => {
  const { user } = useAuth();
  return user ? <Navigate to="/chat" /> : children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<PublicRoute><WelcomeName /></PublicRoute>} />
          <Route path="/welcome" element={<PublicRoute><WelcomeName /></PublicRoute>} />
          <Route path="/select-avatar" element={<SelectAvatar />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/chat" element={<PrivateRoute><ChatApp /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
