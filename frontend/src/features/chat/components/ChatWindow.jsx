import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Loader2, Power, RotateCcw, Clock, CheckCheck, Edit2, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import Avatar from '../../../components/ui/Avatar';

const ChatWindow = ({ jid, pushName, messages, loading, onSend, onBack, onRenameContact, whatsappStatus }) => {
    const navigate = useNavigate();
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(true);
    const [toggling, setToggling] = useState(null);
    const [toast, setToast] = useState(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');
    const [savingName, setSavingName] = useState(false);
    const messagesContainerRef = useRef(null);
    const inputRef = useRef(null);

    // Quick Replies states
    const [quickReplies, setQuickReplies] = useState([]);
    const [qrSearchQuery, setQrSearchQuery] = useState('');
    const [qrSelectedIndex, setQrSelectedIndex] = useState(0);
    const [dropdownClosedManually, setDropdownClosedManually] = useState(false);

    // Load user state when JID changes
    useEffect(() => {
        if (!jid) return;
        setIsEditingName(false);
        setEditNameValue('');
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

    // Fetch quick replies when JID changes (switching chats)
    useEffect(() => {
        if (!jid) return;
        const loadQuickReplies = async () => {
            try {
                const { data } = await api.get('/api/quick-replies');
                setQuickReplies(data.data || []);
            } catch (err) {
                console.error('Error loading quick replies:', err);
            }
        };
        loadQuickReplies();
        setDropdownClosedManually(false);
        setQrSelectedIndex(0);
        setQrSearchQuery('');
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

    // Filter quick replies in real-time
    const filteredReplies = quickReplies.filter(r => 
        r.shortcut.toLowerCase().includes(qrSearchQuery.toLowerCase()) ||
        r.name.toLowerCase().includes(qrSearchQuery.toLowerCase())
    );
    const showQrDropdown = inputText.startsWith('/') && !dropdownClosedManually;

    const selectQuickReply = (reply) => {
        const phoneNumber = jid ? jid.replace(/@.*$/, '').replace(/:\d+$/, '') : '';
        const resolved = reply.content
            .replace(/\{\{nombre\}\}/gi, pushName || '')
            .replace(/\{\{telefono\}\}/gi, phoneNumber || '')
            .replace(/\{\{email\}\}/gi, '')
            .replace(/\{\{empresa\}\}/gi, '');
        setInputText(resolved);
        setDropdownClosedManually(true);
        setTimeout(() => inputRef.current?.focus(), 10);
    };

    const handleInputChange = (e) => {
        const value = e.target.value;
        setInputText(value);
        
        if (value.startsWith('/')) {
            setQrSearchQuery(value.slice(1));
            setQrSelectedIndex(0);
            if (value === '/') {
                setDropdownClosedManually(false);
            }
        } else {
            setDropdownClosedManually(false);
        }
    };

    const handleKeyDown = (e) => {
        if (showQrDropdown && filteredReplies.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setQrSelectedIndex(prev => (prev + 1) % filteredReplies.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setQrSelectedIndex(prev => (prev - 1 + filteredReplies.length) % filteredReplies.length);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                selectQuickReply(filteredReplies[qrSelectedIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setDropdownClosedManually(true);
                return;
            }
        }

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

    const handleSaveName = async () => {
        if (!editNameValue.trim() || savingName) return;
        const newName = editNameValue.trim();
        setSavingName(true);
        try {
            await api.put(`/api/chat/conversations/${encodeURIComponent(jid)}/name`, { name: newName });
            if (onRenameContact) {
                onRenameContact(jid, newName);
            }
            setIsEditingName(false);
            showToast('success', 'Nombre de contacto actualizado');
        } catch (err) {
            showToast('error', 'Error al guardar nombre');
        } finally {
            setSavingName(false);
        }
    };

    const formatTime = (isoStr) => {
        if (!isoStr) return '';
        return new Date(isoStr).toLocaleTimeString('es-CO', {
            timeZone: 'America/Bogota',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    const formatDateSeparator = (isoStr) => {
        const d = new Date(isoStr);
        const now = new Date();
        
        const getColombianDateString = (date) => {
            return new Intl.DateTimeFormat('es-CO', {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date(date));
        };
        
        const dStr = getColombianDateString(d);
        const nowStr = getColombianDateString(now);
        const yesterdayStr = getColombianDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
        
        if (dStr === nowStr) return 'Hoy';
        if (dStr === yesterdayStr) return 'Ayer';
        return d.toLocaleDateString('es-CO', {
            timeZone: 'America/Bogota',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
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
                <Avatar
                    jid={jid}
                    name={pushName}
                    isGroup={jid?.includes('@g.us')}
                    className="chat-header-avatar"
                    size={32}
                />
                <div className="chat-header-info">
                    {isEditingName ? (
                        <div className="chat-header-name-edit-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                                type="text"
                                className="chat-header-name-input"
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveName();
                                    if (e.key === 'Escape') setIsEditingName(false);
                                }}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    padding: '2px 8px',
                                    fontSize: '0.95rem',
                                    outline: 'none',
                                    width: '180px'
                                }}
                                disabled={savingName}
                                autoFocus
                            />
                            <button
                                onClick={handleSaveName}
                                style={{ background: 'none', border: 'none', color: '#00ee00', cursor: 'pointer', padding: '2px' }}
                                disabled={savingName}
                                title="Guardar"
                            >
                                <Check size={16} />
                            </button>
                            <button
                                onClick={() => setIsEditingName(false)}
                                style={{ background: 'none', border: 'none', color: '#ff3333', cursor: 'pointer', padding: '2px' }}
                                disabled={savingName}
                                title="Cancelar"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                                className="chat-header-name"
                                onClick={() => {
                                    setEditNameValue(pushName);
                                    setIsEditingName(true);
                                }}
                                style={{ cursor: 'pointer' }}
                                title="Editar nombre"
                            >
                                {pushName}
                            </span>
                            <button
                                onClick={() => {
                                    setEditNameValue(pushName);
                                    setIsEditingName(true);
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '2px',
                                    borderRadius: '4px'
                                }}
                                className="chat-header-edit-btn"
                                title="Editar nombre"
                            >
                                <Edit2 size={12} />
                            </button>
                        </div>
                    )}
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

            {/* Warning banner if WhatsApp is disconnected */}
            {whatsappStatus !== 'connected' && (
                <div className="chat-status-warning-banner">
                    <span>⚠️ WhatsApp está desconectado. Los mensajes no se enviarán ni se guardarán. Conéctalo desde la pestaña <a href="/whatsapp" onClick={(e) => { e.preventDefault(); navigate('/whatsapp'); }}>WhatsApp</a>.</span>
                </div>
            )}

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

            {/* Quick replies dropdown */}
            {showQrDropdown && filteredReplies.length > 0 && (
                <div className="chat-qr-dropdown">
                    {filteredReplies.map((reply, index) => (
                        <div
                            key={reply.id}
                            className={`chat-qr-item ${index === qrSelectedIndex ? 'chat-qr-item-active' : ''}`}
                            onClick={() => selectQuickReply(reply)}
                        >
                            <span className="chat-qr-shortcut-badge">/{reply.shortcut}</span>
                            <span className="chat-qr-name">{reply.name}</span>
                            <span className="chat-qr-preview">{reply.content}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Input area */}
            <div className="chat-input-bar">
                <input
                    ref={inputRef}
                    type="text"
                    className="chat-input"
                    placeholder={whatsappStatus !== 'connected' ? "WhatsApp desconectado. Conéctalo para chatear..." : "Escribe un mensaje..."}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    disabled={sending || whatsappStatus !== 'connected'}
                />
                <button
                    className="chat-send-btn"
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending || whatsappStatus !== 'connected'}
                >
                    {sending ? <Loader2 size={18} className="chat-spin" /> : <Send size={18} />}
                </button>
            </div>
        </div>
    );
};

export default ChatWindow;
