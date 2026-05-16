import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Loader2, Power, RotateCcw, Clock, CheckCheck } from 'lucide-react';
import api from '../../../services/api';

const ChatWindow = ({ jid, pushName, messages, loading, onSend, onBack }) => {
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(true);
    const [toggling, setToggling] = useState(null);
    const [toast, setToast] = useState(null);
    const messagesContainerRef = useRef(null);
    const inputRef = useRef(null);

    // Load user state when JID changes
    useEffect(() => {
        if (!jid) return;
        const loadUserState = async () => {
            try {
                const { data } = await api.get('/api/welcome-automation/users');
                const users = data.data || [];
                const user = users.find(u => u.jid === jid);
                if (user) {
                    setAiEnabled(user.aiEnabled);
                }
            } catch (_) { }
        };
        loadUserState();
    }, [jid]);

    // Auto-scroll to bottom on new messages and when opening chat
    useEffect(() => {
        if (messagesContainerRef.current) {
            // Use requestAnimationFrame or a slight timeout to ensure DOM has updated sizes
            setTimeout(() => {
                if (messagesContainerRef.current) {
                    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                }
            }, 50);
        }
    }, [messages, jid]);

    // Focus input when chat opens
    useEffect(() => {
        inputRef.current?.focus();
    }, [jid]);

    const showToast = (type, msg) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSend = async () => {
        if (!inputText.trim() || sending) return;
        const text = inputText.trim();
        setInputText('');
        setSending(true);
        try {
            await onSend(text);
        } finally {
            setSending(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── User control actions ──

    const toggleAI = async () => {
        setToggling('ai');
        try {
            await api.put(`/api/welcome-automation/users/${encodeURIComponent(jid)}/ai`, {
                enabled: !aiEnabled
            });
            setAiEnabled(!aiEnabled);
            showToast('success', `IA ${!aiEnabled ? 'activada' : 'desactivada'}`);
        } catch {
            showToast('error', 'Error al cambiar IA');
        } finally {
            setToggling(null);
        }
    };

    const resetCooldown = async () => {
        setToggling('reset');
        try {
            await api.post('/api/welcome-automation/reset-user', { jid });
            showToast('success', 'Cooldown reseteado — bienvenida se enviará de nuevo');
        } catch {
            showToast('error', 'Error al resetear cooldown');
        } finally {
            setToggling(null);
        }
    };

    const formatTime = (isoStr) => {
        if (!isoStr) return '';
        return new Date(isoStr).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDateSeparator = (isoStr) => {
        const d = new Date(isoStr);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return 'Hoy';
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    // Group messages by date
    const groupedMessages = [];
    let lastDate = '';
    messages.forEach(msg => {
        const msgDate = new Date(msg.timestamp).toDateString();
        if (msgDate !== lastDate) {
            groupedMessages.push({ type: 'date', date: msg.timestamp });
            lastDate = msgDate;
        }
        groupedMessages.push({ type: 'message', ...msg });
    });

    const phoneNumber = jid ? jid.replace(/@.*$/, '').replace(/:\d+$/, '') : '';

    return (
        <div className="chat-window">
            {/* Toast */}
            {toast && (
                <div className={`chat-toast ${toast.type === 'success' ? 'chat-toast-ok' : 'chat-toast-err'}`}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="chat-window-header">
                <button className="chat-back-btn" onClick={onBack}>
                    <ArrowLeft size={20} />
                </button>
                <div className="chat-header-avatar">
                    {(pushName || '?').charAt(0).toUpperCase()}
                </div>
                <div className="chat-header-info">
                    <span className="chat-header-name">{pushName}</span>
                    <span className="chat-header-number">{phoneNumber}</span>
                </div>

                {/* ── User control buttons ── */}
                <div className="chat-header-controls">
                    <button
                        className={`chat-ctrl-btn ${aiEnabled ? 'chat-ctrl-on' : 'chat-ctrl-off'}`}
                        onClick={toggleAI}
                        disabled={toggling === 'ai'}
                        title={aiEnabled ? 'Desactivar IA' : 'Reactivar IA'}
                    >
                        <Power size={14} />
                        <span className="chat-ctrl-label">{aiEnabled ? 'IA ON' : 'IA OFF'}</span>
                    </button>

                    <button
                        className="chat-ctrl-btn chat-ctrl-reset"
                        onClick={resetCooldown}
                        disabled={toggling === 'reset'}
                        title="Resetear cooldown — reactivar bienvenida 24H"
                    >
                        <RotateCcw size={14} />
                        <span className="chat-ctrl-label">Reset</span>
                    </button>
                </div>
            </div>

            {/* Messages area */}
            <div className="chat-messages" ref={messagesContainerRef}>
                {loading ? (
                    <div className="chat-loading">
                        <Loader2 size={24} className="chat-spin" />
                        <span>Cargando mensajes...</span>
                    </div>
                ) : groupedMessages.length === 0 ? (
                    <div className="chat-no-messages">
                        <p>No hay mensajes aún</p>
                    </div>
                ) : (
                    groupedMessages.map((item, i) => {
                        if (item.type === 'date') {
                            return (
                                <div key={`date-${i}`} className="chat-date-separator">
                                    <span>{formatDateSeparator(item.date)}</span>
                                </div>
                            );
                        }
                        return (
                            <div
                                key={item.id || i}
                                className={`chat-bubble ${item.fromMe ? 'chat-bubble-out' : 'chat-bubble-in'}`}
                            >
                                <span className="chat-bubble-text">{item.text}</span>
                                <span className="chat-bubble-time">
                                    {formatTime(item.timestamp)}
                                    {item.fromMe && <span className="chat-bubble-check"> <CheckCheck size={14} /></span>}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Input area */}
            <div className="chat-input-bar">
                <input
                    ref={inputRef}
                    type="text"
                    className="chat-input"
                    placeholder="Escribe un mensaje..."
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                />
                <button
                    className="chat-send-btn"
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending}
                >
                    {sending ? <Loader2 size={18} className="chat-spin" /> : <Send size={18} />}
                </button>
            </div>
        </div>
    );
};

export default ChatWindow;
