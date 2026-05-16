import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../services/api';
import socket from '../../../services/socket';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import './ChatInterface.css';

/**
 * ChatInterface
 *
 * Main chat container. Manages:
 *   - Conversation loading (with group support via include_groups param)
 *   - Active filter state (all | groups | category:<name>)
 *   - Category map for badges and filtering
 *   - Real-time updates via Socket.io
 *
 * SOLID: Single Responsibility — orchestrates chat state only.
 * Child components handle their own presentation logic.
 */
const ChatInterface = () => {
    const [conversations, setConversations] = useState([]);
    const [activeJid, setActiveJid] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // ── Filter & category state ──
    const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'groups' | 'category:repuestos' | ...
    const [categories, setCategories] = useState({});        // { repuestos: { label, color, groups: [] }, ... }
    const [categoryMap, setCategoryMap] = useState({});       // { jid: ['repuestos', ...] }

    // Ref to track activeJid without re-creating socket listener
    const activeJidRef = useRef(null);
    useEffect(() => {
        activeJidRef.current = activeJid;
    }, [activeJid]);

    // Load conversations + categories on mount, sync groups from WhatsApp
    useEffect(() => {
        const init = async () => {
            await syncGroups(); // Fetch all groups from WhatsApp first
            await loadConversations(); // Then load conversations (now includes groups)
            await loadCategories();
        };
        init();
    }, []);

    // Socket.io real-time message listener — mounted ONCE, uses ref for activeJid
    useEffect(() => {
        const handleNewMessage = ({ jid, message }) => {
            // Update conversations list (move to top)
            setConversations(prev => {
                const exists = prev.find(c => c.jid === jid);
                if (exists) {
                    return prev.map(c =>
                        c.jid === jid
                            ? {
                                ...c,
                                lastMessage: message.text,
                                lastMessageTime: message.timestamp,
                                lastMessageFromMe: message.fromMe,
                                unreadCount: c.jid === activeJidRef.current ? 0 : c.unreadCount + (message.fromMe ? 0 : 1)
                            }
                            : c
                    ).sort((a, b) => {
                        const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                        const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                        return bTime - aTime;
                    });
                } else {
                    // New conversation
                    return [{
                        jid,
                        pushName: jid.replace('@s.whatsapp.net', '').replace('@g.us', ''),
                        lastMessage: message.text,
                        lastMessageTime: message.timestamp,
                        lastMessageFromMe: message.fromMe,
                        messageCount: 1,
                        unreadCount: message.fromMe ? 0 : 1,
                        isGroup: jid.includes('@g.us')
                    }, ...prev];
                }
            });

            // Add message to active chat if it matches — with deduplication by ID
            if (jid === activeJidRef.current) {
                setMessages(prev => {
                    // Deduplicate: skip if message with same ID already exists
                    if (message.id && prev.some(m => m.id === message.id)) {
                        return prev;
                    }
                    return [...prev, message];
                });
            }
        };

        socket.on('chat:message', handleNewMessage);
        return () => socket.off('chat:message', handleNewMessage);
    }, []); // Empty deps: listener is stable, uses refs

    const syncGroups = async () => {
        try {
            await api.post('/api/groups/sync');
        } catch (err) {
            // Silently fail — groups will appear as messages arrive
            console.warn('Group sync skipped:', err.message);
        }
    };

    const loadConversations = async () => {
        try {
            const { data } = await api.get('/api/chat/conversations?include_groups=true');
            setConversations(data.data || []);
        } catch (err) {
            console.error('Error loading conversations:', err);
        }
    };

    const loadCategories = async () => {
        try {
            const [catRes, mapRes] = await Promise.all([
                api.get('/api/groups/categories'),
                api.get('/api/groups/map')
            ]);
            setCategories(catRes.data.data || {});
            setCategoryMap(mapRes.data.data || {});
        } catch (err) {
            console.error('Error loading categories:', err);
        }
    };

    const selectConversation = useCallback(async (jid) => {
        setActiveJid(jid);
        setLoading(true);
        try {
            const { data } = await api.get(`/api/chat/messages/${encodeURIComponent(jid)}`);
            setMessages(data.data?.messages || []);
            // Mark as read
            await api.post(`/api/chat/mark-read/${encodeURIComponent(jid)}`);
            setConversations(prev =>
                prev.map(c => c.jid === jid ? { ...c, unreadCount: 0 } : c)
            );
        } catch (err) {
            console.error('Error loading messages:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const sendMessage = useCallback(async (text) => {
        if (!activeJid || !text.trim()) return;
        try {
            await api.post('/api/chat/send', { jid: activeJid, text });
        } catch (err) {
            console.error('Error sending message:', err);
        }
    }, [activeJid]);

    const goBack = () => setActiveJid(null);

    const handleDeleteConversation = async (jid) => {
        try {
            await api.delete(`/api/chat/${encodeURIComponent(jid)}`);
            setConversations(prev => prev.filter(c => c.jid !== jid));
            if (activeJid === jid) {
                setActiveJid(null);
                setMessages([]);
            }
        } catch (err) {
            console.error('Error deleting chat:', err);
            alert('Error al eliminar chat');
        }
    };

    // ── Category actions (passed to ConversationList) ──

    const handleAddToCategory = async (categoryName, jid) => {
        try {
            await api.put(`/api/groups/categories/${categoryName}/add`, { jid });
            // Update local state immediately for responsive UI
            setCategoryMap(prev => ({
                ...prev,
                [jid]: [...(prev[jid] || []), categoryName]
            }));
            // Refresh categories to stay in sync
            const { data } = await api.get('/api/groups/categories');
            setCategories(data.data || {});
        } catch (err) {
            console.error('Error adding to category:', err);
        }
    };

    const handleRemoveFromCategory = async (categoryName, jid) => {
        try {
            await api.put(`/api/groups/categories/${categoryName}/remove`, { jid });
            setCategoryMap(prev => {
                const updated = { ...prev };
                if (updated[jid]) {
                    updated[jid] = updated[jid].filter(c => c !== categoryName);
                    if (updated[jid].length === 0) delete updated[jid];
                }
                return updated;
            });
            const { data } = await api.get('/api/groups/categories');
            setCategories(data.data || {});
        } catch (err) {
            console.error('Error removing from category:', err);
        }
    };

    // ── Filtering logic ──

    const activeConversation = conversations.find(c => c.jid === activeJid);

    const filteredConversations = conversations.filter(c => {
        // Text search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matchesSearch = c.pushName.toLowerCase().includes(term) ||
                c.jid.toLowerCase().includes(term) ||
                (c.lastMessage && c.lastMessage.toLowerCase().includes(term));
            if (!matchesSearch) return false;
        }

        // Category/type filter
        switch (activeFilter) {
            case 'all':
                return true;
            case 'groups':
                return c.isGroup === true;
            default:
                // 'category:<name>' pattern
                if (activeFilter.startsWith('category:')) {
                    const catName = activeFilter.replace('category:', '');
                    const groupCats = categoryMap[c.jid] || [];
                    return groupCats.includes(catName);
                }
                return true;
        }
    });

    return (
        <div className={`chat-interface ${activeJid ? 'chat-active' : ''}`}>
            <div className="chat-sidebar">
                <ConversationList
                    conversations={filteredConversations}
                    activeJid={activeJid}
                    onSelect={selectConversation}
                    onDelete={handleDeleteConversation}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                    categories={categories}
                    categoryMap={categoryMap}
                    onAddToCategory={handleAddToCategory}
                    onRemoveFromCategory={handleRemoveFromCategory}
                />
            </div>
            <div className="chat-main">
                {activeJid ? (
                    <ChatWindow
                        jid={activeJid}
                        pushName={activeConversation?.pushName || activeJid.replace('@s.whatsapp.net', '').replace('@g.us', '')}
                        messages={messages}
                        loading={loading}
                        onSend={sendMessage}
                        onBack={goBack}
                    />
                ) : (
                    <div className="chat-empty-state">
                        <div className="chat-empty-icon">💬</div>
                        <h3>Selecciona un chat</h3>
                        <p>Elige una conversación para ver los mensajes y responder</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatInterface;
