/**
 * Token Usage Service — tracks AI token consumption and estimates costs.
 * Resets daily/monthly counts automatically. No external DB needed.
 */

// Groq llama-3.3-70b pricing: $0.59 per 1M input tokens, $0.79 per 1M output tokens
// We use a blended average of ~$0.69 per 1M tokens for simplicity
const PRICE_PER_1M_TOKENS = 0.69;
const PRICE_PER_1K_TOKENS = PRICE_PER_1M_TOKENS / 1000;
const DEFAULT_MONTHLY_LIMIT = 2_000_000; // 2M tokens

class TokenUsageService {
    constructor() {
        this.tokensToday = 0;
        this.tokensMonth = 0;
        this.monthlyLimit = DEFAULT_MONTHLY_LIMIT;

        // Track daily usage for projection
        this.dailySnapshots = []; // [{date, tokens}]
        this.lastResetDate = new Date().toDateString();
        this.lastResetMonth = new Date().getMonth();

        setInterval(() => this._checkBoundary(), 60 * 1000);
    }

    /**
     * Record token usage from an AI API call.
     * @param {number} tokensUsed - Total tokens used (prompt + completion)
     */
    trackUsage(tokensUsed) {
        if (!tokensUsed || tokensUsed <= 0) return;
        this._checkBoundary();

        this.tokensToday += tokensUsed;
        this.tokensMonth += tokensUsed;

        console.log(`🔢 Token usage tracked: +${tokensUsed} (today: ${this.tokensToday}, month: ${this.tokensMonth})`);
    }

    /**
     * Get current token usage stats and cost estimations.
     */
    getUsageStats() {
        this._checkBoundary();

        const usagePercent = Math.min(
            Math.round((this.tokensMonth / this.monthlyLimit) * 100),
            100
        );

        const estimatedCostMonth = (this.tokensMonth / 1000) * PRICE_PER_1K_TOKENS;

        // Project end-of-month usage based on average daily tokens
        const dayOfMonth = new Date().getDate();
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const avgDailyTokens = dayOfMonth > 0 ? this.tokensMonth / dayOfMonth : 0;
        const projectedMonthTokens = Math.round(avgDailyTokens * daysInMonth);
        const projectedCost = (projectedMonthTokens / 1000) * PRICE_PER_1K_TOKENS;

        // Determine risk level
        let riskLevel = 'safe';
        if (usagePercent >= 85) riskLevel = 'critical';
        else if (usagePercent >= 60) riskLevel = 'warning';

        return {
            tokensToday: this.tokensToday,
            tokensMonth: this.tokensMonth,
            monthlyLimit: this.monthlyLimit,
            usagePercent,
            riskLevel,
            pricing: {
                per1kTokens: PRICE_PER_1K_TOKENS.toFixed(4),
                per1mTokens: PRICE_PER_1M_TOKENS.toFixed(2)
            },
            costs: {
                estimatedMonth: estimatedCostMonth.toFixed(2),
                projectedMonth: projectedCost.toFixed(2)
            }
        };
    }

    /**
     * Update the monthly token limit.
     * @param {number} limit - New limit in tokens
     */
    setMonthlyLimit(limit) {
        this.monthlyLimit = limit;
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    _checkBoundary() {
        const now = new Date();

        // Day boundary
        if (now.toDateString() !== this.lastResetDate) {
            this.dailySnapshots.push({ date: this.lastResetDate, tokens: this.tokensToday });
            if (this.dailySnapshots.length > 31) this.dailySnapshots.shift();
            this.tokensToday = 0;
            this.lastResetDate = now.toDateString();
        }

        // Month boundary
        if (now.getMonth() !== this.lastResetMonth) {
            this.tokensMonth = 0;
            this.lastResetMonth = now.getMonth();
        }
    }
}

module.exports = new TokenUsageService();
