import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import api from '../../services/api';

// Global cache and pub/sub system to share profile picture states across components
const globalCache = {};
const listeners = {};
const pendingRequests = {};

const subscribeProfilePic = (jid, callback) => {
    if (!listeners[jid]) {
        listeners[jid] = [];
    }
    listeners[jid].push(callback);
    return () => {
        listeners[jid] = listeners[jid].filter(cb => cb !== callback);
    };
};

const updateProfilePic = (jid, url) => {
    globalCache[jid] = url;
    if (listeners[jid]) {
        listeners[jid].forEach(cb => cb(url));
    }
};

const Avatar = ({ jid, name, isGroup, className, size = 30 }) => {
    const [imgUrl, setImgUrl] = useState(() => globalCache[jid] || null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!jid) return;

        // Initialize state from global cache
        setImgUrl(globalCache[jid] || null);

        if (isGroup) return; // Keep standard icon for groups

        // Subscribe to updates for this JID
        const unsubscribe = subscribeProfilePic(jid, (newUrl) => {
            setImgUrl(newUrl);
        });

        // If not in cache and no request is currently pending, fetch it
        if (globalCache[jid] === undefined && !pendingRequests[jid]) {
            pendingRequests[jid] = true;
            
            let retryCount = 0;
            const maxRetries = 2;

            const fetchProfilePic = async () => {
                setLoading(true);
                try {
                    const { data } = await api.get(`/api/chat/conversations/${encodeURIComponent(jid)}/profile-picture`);
                    if (data.success) {
                        updateProfilePic(jid, data.url);
                        delete pendingRequests[jid];
                    } else {
                        throw new Error('Unsuccessful status');
                    }
                } catch (err) {
                    console.warn(`[Avatar] Fetch failed for ${jid}:`, err.message);
                    if (retryCount < maxRetries) {
                        retryCount++;
                        // Retry after a delay (e.g. 6 seconds) to give WhatsApp connection time to stabilize
                        setTimeout(fetchProfilePic, 6000);
                    } else {
                        // Mark as null (no picture or failed permanently)
                        updateProfilePic(jid, null);
                        delete pendingRequests[jid];
                    }
                } finally {
                    setLoading(false);
                }
            };

            fetchProfilePic();
        }

        return () => {
            unsubscribe();
        };
    }, [jid, isGroup]);

    const getInitial = (nameStr) => {
        return (nameStr || '?').charAt(0).toUpperCase();
    };

    const getAvatarColor = (rawJid) => {
        const colors = ['#00aa55', '#0088cc', '#aa5500', '#cc0044', '#6600cc', '#00aaaa'];
        let hash = 0;
        for (let i = 0; i < rawJid.length; i++) hash = rawJid.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    if (isGroup) {
        return (
            <div
                className={className}
                style={{
                    backgroundColor: getAvatarColor(jid),
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    flexShrink: 0
                }}
            >
                <Users size={size * 0.46} />
            </div>
        );
    }

    if (imgUrl) {
        return (
            <img
                src={imgUrl}
                alt={name}
                className={className}
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0
                }}
                onError={() => {
                    // If the URL is expired or broken, remove from cache and fall back
                    updateProfilePic(jid, null);
                }}
            />
        );
    }

    // Fallback: Initial letter avatar
    return (
        <div
            className={className}
            style={{
                backgroundColor: getAvatarColor(jid),
                width: size,
                height: size,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: `${size * 0.4}px`,
                fontWeight: '600',
                flexShrink: 0
            }}
        >
            {getInitial(name)}
        </div>
    );
};

export default Avatar;
