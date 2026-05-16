import React, { useState, useEffect } from 'react';
import api from '../services/api';
import socket from '../services/socket';
import ChatInterface from '../features/chat/components/ChatInterface';
import PendingChatsPage from './PendingChatsPage';
import BlockedNumbersPage from './BlockedNumbersPage';
import { MessageSquare, AlertTriangle, ShieldBan } from 'lucide-react';

const DashboardPage = () => {
    // AI master switch state — kept identical to the original logic
    const [aiEnabled, setAiEnabled] = useState(true);
    const [aiLoading, setAiLoading] = useState(false);
    const [dashboardTab, setDashboardTab] = useState('users');

    useEffect(() => {
        // Fetch current AI state on mount
        const fetchAiStatus = async () => {
            try {
                const { data } = await api.get('/api/ai/status');
                setAiEnabled(data.enabled);
            } catch (error) {
                console.error('Error fetching AI status:', error);
            }
        };

        fetchAiStatus();

        // Listen for real-time AI state changes (from other tabs or admin changes)
        socket.on('ai-status', (data) => {
            setAiEnabled(data.enabled);
        });

        return () => {
            socket.off('ai-status');
        };
    }, []);

    const toggleAI = async () => {
        if (aiLoading) return;
        setAiLoading(true);
        try {
            const { data } = await api.post('/api/ai/toggle');
            setAiEnabled(data.enabled);
        } catch (error) {
            console.error('Error toggling AI:', error);
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <div className="dashboard-content analytics-dashboard">
            {/* ── Tabbed panels — Chats / Pendientes / Bloqueados ── */}
            <div className="dashboard-tabs-section">
                <div className="dashboard-tabs">
                    <button
                        className={`dashboard-tab-btn ${dashboardTab === 'users' ? 'active' : ''}`}
                        onClick={() => setDashboardTab('users')}
                    >
                        <MessageSquare size={18} />
                        <span>Chats</span>
                    </button>
                    <button
                        className={`dashboard-tab-btn ${dashboardTab === 'pending' ? 'active' : ''}`}
                        onClick={() => setDashboardTab('pending')}
                    >
                        <AlertTriangle size={18} />
                        <span>Pendientes</span>
                    </button>
                    <button
                        className={`dashboard-tab-btn ${dashboardTab === 'blocked' ? 'active' : ''}`}
                        onClick={() => setDashboardTab('blocked')}
                    >
                        <ShieldBan size={18} />
                        <span>Bloqueados</span>
                    </button>
                </div>

                <div className="dashboard-tab-content">
                    {dashboardTab === 'users' && <ChatInterface />}
                    {dashboardTab === 'pending' && <PendingChatsPage />}
                    {dashboardTab === 'blocked' && <BlockedNumbersPage />}
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
