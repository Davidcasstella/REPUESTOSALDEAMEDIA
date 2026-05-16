import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WhatsAppPage from './pages/WhatsAppPage';
import AIProvidersPage from './pages/AIProvidersPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import BlockedNumbersPage from './pages/BlockedNumbersPage';
import WelcomeAutomationPage from './pages/WelcomeAutomationPage';
import PendingChatsPage from './pages/PendingChatsPage';
import AIAutomationsPage from './pages/AIAutomationsPage';
import AnalyticsPage from './pages/AnalyticsPage';

const App = () => {
    return (
        <AuthProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                    {/* Rutas Públicas */}
                    <Route path="/login" element={<LoginPage />} />

                    {/* Rutas Protegidas */}
                    <Route element={<ProtectedRoute />}>
                        <Route element={<DashboardLayout />}>
                            <Route path="/" element={<DashboardPage />} />
                            <Route path="/whatsapp" element={<WhatsAppPage />} />
                            <Route path="/ai-providers" element={<AIProvidersPage />} />
                            <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
                            <Route path="/blocked-numbers" element={<BlockedNumbersPage />} />
                            <Route path="/welcome-automation" element={<WelcomeAutomationPage />} />
                            <Route path="/pending-chats" element={<PendingChatsPage />} />
                            <Route path="/ai-automations" element={<AIAutomationsPage />} />
                            <Route path="/analytics" element={<AnalyticsPage />} />
                            <Route path="/chats" element={<div>Próximamente...</div>} />
                        </Route>
                    </Route>

                    {/* Redirección por defecto */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
