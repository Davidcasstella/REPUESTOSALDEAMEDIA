import React from 'react';
import { BrainCircuit, Power } from 'lucide-react';

/**
 * AI Status Module — large, prominent panel showing AI engine status.
 * Receives state and toggle function as props from DashboardPage.
 */
const AIStatusModule = ({ aiEnabled, aiLoading, onToggle }) => {
    return (
        <div className={`ai-status-module premium-card ${aiEnabled ? 'ai-status-on' : 'ai-status-off'}`}>
            {/* Decorative background glow */}
            <div className={`ai-status-glow ${aiEnabled ? 'glow-green' : 'glow-red'}`} />

            <div className="ai-status-left">
                <div className={`ai-status-orb ${aiEnabled ? 'orb-active' : 'orb-inactive'}`}>
                    <BrainCircuit size={32} />
                </div>
                <div className="ai-status-info">
                    <span className="ai-status-system-label">AI SYSTEM</span>
                    <div className="ai-status-indicator">
                        <span className={`ai-status-dot-large ${aiEnabled ? 'dot-active' : 'dot-inactive'}`} />
                        <span className={`ai-status-state-label ${aiEnabled ? 'label-active' : 'label-inactive'}`}>
                            {aiEnabled ? 'ACTIVE' : 'DISABLED'}
                        </span>
                    </div>
                    <span className="ai-status-description">
                        {aiEnabled
                            ? 'The AI engine is responding automatically to WhatsApp messages'
                            : 'AI engine is paused — incoming messages will not receive automated replies'}
                    </span>
                </div>
            </div>

            <div className="ai-status-right">
                <button
                    className={`ai-action-btn ${aiEnabled ? 'ai-btn-disable' : 'ai-btn-enable'} ${aiLoading ? 'ai-btn-loading' : ''}`}
                    onClick={onToggle}
                    disabled={aiLoading}
                >
                    <Power size={18} />
                    {aiLoading ? 'Processing...' : aiEnabled ? 'Disable AI' : 'Enable AI'}
                </button>

                {/* Toggle switch - secondary visual */}
                <div className="ai-toggle-wrap">
                    <button
                        className={`ai-toggle-btn-large ${aiEnabled ? 'toggle-on' : 'toggle-off'} ${aiLoading ? 'toggle-loading' : ''}`}
                        onClick={onToggle}
                        disabled={aiLoading}
                        aria-label="Toggle AI"
                    >
                        <span className="ai-toggle-thumb-large" />
                    </button>
                    <span className="ai-toggle-label">{aiEnabled ? 'ON' : 'OFF'}</span>
                </div>
            </div>
        </div>
    );
};

export default AIStatusModule;
