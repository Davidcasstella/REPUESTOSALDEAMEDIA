import React, { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, Trash2, Check, CheckCheck, Users, Tag, Edit2, X } from 'lucide-react';
import api from '../../../services/api';
import Avatar from '../../../components/ui/Avatar';

/**
 * ConversationList
 *
 * Displays the list of conversations with:
 *   - Search bar
 *   - Filter chips (All, Groups, + dynamic category chips)
 *   - Context menu for group classification
 *   - Category badges on classified groups
 *
 * SOLID: Single Responsibility — presentation and interaction only.
 * All data mutations are delegated upward via callbacks.
 */
const ConversationList = ({
    conversations,
    activeJid,
    onSelect,
    onDelete,
    searchTerm,
    onSearchChange,
    activeFilter,
    onFilterChange,
    categories,
    categoryMap,
    onAddToCategory,
    onRemoveFromCategory,
    onRenameContact
}) => {
    const [confirmDelete, setConfirmDelete] = useState(null);

    // Editing states for contact name
    const [editingJid, setEditingJid] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');
    const [savingJid, setSavingJid] = useState(null);

    const handleSaveName = async (e, jid) => {
        e.stopPropagation();
        if (!editNameValue.trim() || savingJid) return;
        const newName = editNameValue.trim();
        setSavingJid(jid);
        try {
            await api.put(`/api/chat/conversations/${encodeURIComponent(jid)}/name`, { name: newName });
            if (onRenameContact) {
                onRenameContact(jid, newName);
            }
            setEditingJid(null);
        } catch (err) {
            console.error('Error saving name:', err);
            alert('Error al guardar el nombre');
        } finally {
            setSavingJid(null);
        }
    };

    // ── Context Menu State ──
    const [contextMenu, setContextMenu] = useState(null); // { x, y, jid, isGroup }
    const contextMenuRef = useRef(null);

    // Close context menu on outside click or Escape
    useEffect(() => {
        const handleClick = (e) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
                setContextMenu(null);
            }
        };
        const handleEsc = (e) => {
            if (e.key === 'Escape') setContextMenu(null);
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleEsc);
        };
    }, []);

    const formatTime = (isoStr) => {
        if (!isoStr) return '';
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
        
        if (dStr === nowStr) {
            return d.toLocaleTimeString('es-CO', {
                timeZone: 'America/Bogota',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        }
        if (dStr === yesterdayStr) {
            return 'Ayer';
        }
        return d.toLocaleDateString('es-CO', {
            timeZone: 'America/Bogota',
            day: '2-digit',
            month: '2-digit'
        });
    };

    const getInitial = (name) => {
        return (name || '?').charAt(0).toUpperCase();
    };

    const getAvatarColor = (jid) => {
        const colors = ['#00aa55', '#0088cc', '#aa5500', '#cc0044', '#6600cc', '#00aaaa'];
        let hash = 0;
        for (let i = 0; i < jid.length; i++) hash = jid.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    // ── Context Menu Handler ──
    const handleContextMenu = (e, conv) => {
        if (!conv.isGroup) return; // Only show for groups
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            jid: conv.jid,
            isGroup: true
        });
    };

    // Get categories a group belongs to
    const getGroupCategories = (jid) => categoryMap[jid] || [];

    // Build filter chips: fixed chips + dynamic from categories
    const filterChips = [
        { key: 'all', label: 'Todos', icon: <MessageSquare size={13} /> },
        { key: 'groups', label: 'Grupos', icon: <Users size={13} /> },
        ...Object.entries(categories).map(([name, cat]) => ({
            key: `category:${name}`,
            label: cat.label,
            icon: <Tag size={13} />,
            color: cat.color
        }))
    ];

    return (
        <div className="conv-list">
            <div className="conv-list-header">
                <h3 className="conv-list-title">
                    <MessageSquare size={18} />
                    Chats
                </h3>
                <span className="conv-list-count">{conversations.length}</span>
            </div>

            <div className="conv-search-wrapper">
                <Search size={14} className="conv-search-icon" />
                <input
                    type="text"
                    className="conv-search-input"
                    placeholder="Buscar chat..."
                    value={searchTerm}
                    onChange={e => onSearchChange(e.target.value)}
                />
            </div>

            {/* ── Filter Chips ── */}
            <div className="conv-filter-chips">
                {filterChips.map(chip => (
                    <button
                        key={chip.key}
                        className={`conv-filter-chip ${activeFilter === chip.key ? 'conv-filter-chip-active' : ''}`}
                        onClick={() => onFilterChange(chip.key)}
                        style={
                            activeFilter === chip.key && chip.color
                                ? { borderColor: chip.color, color: chip.color, background: `${chip.color}15` }
                                : {}
                        }
                    >
                        {chip.icon}
                        {chip.label}
                    </button>
                ))}
            </div>

            <div className="conv-list-items">
                {conversations.length === 0 ? (
                    <div className="conv-empty">
                        <MessageSquare size={32} />
                        <p>{searchTerm ? 'Sin resultados' : 'No hay chats aún'}</p>
                    </div>
                ) : (
                    conversations.map(conv => {
                        const groupCats = getGroupCategories(conv.jid);
                        return (
                            <div
                                key={conv.jid}
                                className={`conv-item ${conv.jid === activeJid ? 'conv-item-active' : ''}`}
                                onClick={() => onSelect(conv.jid)}
                                onContextMenu={(e) => handleContextMenu(e, conv)}
                            >
                                <Avatar
                                    jid={conv.jid}
                                    name={conv.pushName}
                                    isGroup={conv.isGroup}
                                    className="conv-avatar"
                                    size={30}
                                />
                                <div className="conv-info">
                                    <div className="conv-info-top">
                                        {editingJid === conv.jid ? (
                                            <div className="conv-name-edit-wrapper" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', marginRight: '8px' }}>
                                                <input
                                                    type="text"
                                                    className="conv-name-input"
                                                    value={editNameValue}
                                                    onChange={e => setEditNameValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleSaveName(e, conv.jid);
                                                        if (e.key === 'Escape') setEditingJid(null);
                                                    }}
                                                    style={{
                                                        background: '#fff',
                                                        border: '1px solid #cbd5e0',
                                                        borderRadius: '4px',
                                                        color: '#1a202c',
                                                        padding: '1px 4px',
                                                        fontSize: '0.75rem',
                                                        outline: 'none',
                                                        flex: 1,
                                                        minWidth: '50px'
                                                    }}
                                                    disabled={savingJid === conv.jid}
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={(e) => handleSaveName(e, conv.jid)}
                                                    style={{ background: 'none', border: 'none', color: '#00aa55', cursor: 'pointer', padding: '1px', display: 'flex', alignItems: 'center' }}
                                                    disabled={savingJid === conv.jid}
                                                >
                                                    <Check size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingJid(null); }}
                                                    style={{ background: 'none', border: 'none', color: '#ff3333', cursor: 'pointer', padding: '1px', display: 'flex', alignItems: 'center' }}
                                                    disabled={savingJid === conv.jid}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <span
                                                    className="conv-name"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditNameValue(conv.pushName);
                                                        setEditingJid(conv.jid);
                                                    }}
                                                    onDoubleClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditNameValue(conv.pushName);
                                                        setEditingJid(conv.jid);
                                                    }}
                                                    title="Clic para editar"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1, minWidth: 0 }}
                                                >
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.pushName}</span>
                                                    {conv.isGroup && <span className="conv-group-badge">grupo</span>}
                                                    <span
                                                        className="conv-edit-icon-hover"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditNameValue(conv.pushName);
                                                            setEditingJid(conv.jid);
                                                        }}
                                                        style={{ cursor: 'pointer' }}
                                                        title="Editar nombre"
                                                    >
                                                        <Edit2 size={10} />
                                                    </span>
                                                </span>
                                                <span className={`conv-time ${conv.unreadCount > 0 ? 'conv-time-unread' : ''}`}>
                                                    {formatTime(conv.lastMessageTime)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="conv-info-bottom">
                                        <span className="conv-last-msg">
                                            {conv.lastMessageFromMe && <span className="conv-check"><CheckCheck size={14} /> </span>}
                                            {conv.lastMessage
                                                ? (conv.lastMessage.length > 45
                                                    ? conv.lastMessage.substring(0, 45) + '...'
                                                    : conv.lastMessage)
                                                : 'Sin mensajes'
                                            }
                                        </span>
                                        <div className="conv-badges-row">
                                            {/* Category badges */}
                                            {groupCats.map(catName => {
                                                const cat = categories[catName];
                                                return cat ? (
                                                    <span
                                                        key={catName}
                                                        className="conv-category-badge"
                                                        style={{ background: cat.color + '25', color: cat.color, borderColor: cat.color + '50' }}
                                                        title={cat.label}
                                                    >
                                                        <Tag size={9} />
                                                    </span>
                                                ) : null;
                                            })}
                                            {conv.unreadCount > 0 && (
                                                <span className="conv-unread-badge">{conv.unreadCount}</span>
                                            )}
                                        </div>
                                        <button
                                            className="conv-delete-btn"
                                            title={
                                                conv.isGroup
                                                    ? (confirmDelete === conv.jid ? "Click para confirmar" : "Quitar de categorías")
                                                    : (confirmDelete === conv.jid ? "Click para confirmar" : "Eliminar chat")
                                            }
                                            style={confirmDelete === conv.jid ? { color: '#f15c6d', background: 'rgba(241, 92, 109, 0.1)' } : {}}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirmDelete === conv.jid) {
                                                    if (conv.isGroup) {
                                                        // Groups: remove from all categories, don't delete conversation
                                                        const groupCats = getGroupCategories(conv.jid);
                                                        groupCats.forEach(catName => onRemoveFromCategory(catName, conv.jid));
                                                    } else {
                                                        // Private chats: full delete
                                                        onDelete(conv.jid);
                                                    }
                                                    setConfirmDelete(null);
                                                } else {
                                                    setConfirmDelete(conv.jid);
                                                    setTimeout(() => setConfirmDelete(null), 3000);
                                                }
                                            }}
                                        >
                                            {confirmDelete === conv.jid ? <Check size={13} /> : <Trash2 size={13} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ── Context Menu (right-click on groups) ── */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="conv-context-menu"
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        zIndex: 1000
                    }}
                >
                    <div className="conv-context-header">
                        Clasificar grupo
                    </div>
                    {Object.entries(categories).map(([catName, cat]) => {
                        const isInCat = (categoryMap[contextMenu.jid] || []).includes(catName);
                        return (
                            <button
                                key={catName}
                                className={`conv-context-item ${isInCat ? 'conv-context-item-active' : ''}`}
                                onClick={() => {
                                    if (isInCat) {
                                        onRemoveFromCategory(catName, contextMenu.jid);
                                    } else {
                                        onAddToCategory(catName, contextMenu.jid);
                                    }
                                    setContextMenu(null);
                                }}
                            >
                                <Tag size={14} style={{ color: cat.color }} />
                                <span>{isInCat ? `Quitar de ${cat.label}` : `Añadir a ${cat.label}`}</span>
                                {isInCat && <Check size={14} className="conv-context-check" />}
                            </button>
                        );
                    })}
                    {Object.keys(categories).length === 0 && (
                        <div className="conv-context-empty">
                            No hay categorías creadas
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ConversationList;
