/**
 * Analytics Service — in-memory tracking of conversations and message activity.
 * Resets on server restart. No database dependency.
 */

class AnalyticsService {
    constructor() {
        // Unique JIDs seen per calendar day/week/month
        this.uniqueJidsToday = new Set();
        this.uniqueJidsWeek = new Set();
        this.uniqueJidsMonth = new Set();

        // Previous period unique counts (for growth % calculation)
        this.prevDayCount = 0;
        this.prevWeekCount = 0;
        this.prevMonthCount = 0;

        // Hourly message counts for today (24 slots)
        this.hourlyMessages = new Array(24).fill(0);

        // Daily message counts for last 7 days [{label, incoming, outgoing}]
        this.dailyActivity = this._initDailyActivity();

        // Track last reset date to detect day/week/month boundaries
        this.lastResetDate = new Date().toDateString();
        this.lastResetWeek = this._getWeekNumber(new Date());
        this.lastResetMonth = new Date().getMonth();

        // Schedule periodic boundary checks every minute
        setInterval(() => this._checkPeriodBoundary(), 60 * 1000);
    }

    /**
     * Register an incoming message from a JID.
     * @param {string} jid - WhatsApp JID of the sender
     */
    trackIncoming(jid) {
        this._checkPeriodBoundary();

        const hour = new Date().getHours();
        this.hourlyMessages[hour]++;

        // Track today's daily slot
        const todaySlot = this.dailyActivity[this.dailyActivity.length - 1];
        if (todaySlot) todaySlot.incoming++;

        // Track unique conversations
        this.uniqueJidsToday.add(jid);
        this.uniqueJidsWeek.add(jid);
        this.uniqueJidsMonth.add(jid);
    }

    /**
     * Register an outgoing AI response.
     */
    trackOutgoing() {
        const todaySlot = this.dailyActivity[this.dailyActivity.length - 1];
        if (todaySlot) todaySlot.outgoing++;
    }

    /**
     * Get overview data for the dashboard.
     */
    getOverview() {
        this._checkPeriodBoundary();

        const todayTotal = this.uniqueJidsToday.size;
        const weekTotal = this.uniqueJidsWeek.size;
        const monthTotal = this.uniqueJidsMonth.size;

        // Calculate growth percentages safely
        const dayGrowth = this._growthPercent(todayTotal, this.prevDayCount);
        const weekGrowth = this._growthPercent(weekTotal, this.prevWeekCount);
        const monthGrowth = this._growthPercent(monthTotal, this.prevMonthCount);

        return {
            today: todayTotal,
            week: weekTotal,
            month: monthTotal,
            growth: { day: dayGrowth, week: weekGrowth, month: monthGrowth }
        };
    }

    /**
     * Get activity data: hourly for today + last 7 days summary.
     */
    getActivity() {
        return {
            hourly: this.hourlyMessages.map((count, h) => ({
                hour: h,
                label: `${String(h).padStart(2, '0')}:00`,
                count
            })),
            daily: this.dailyActivity
        };
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    _growthPercent(current, previous) {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    }

    _getWeekNumber(d) {
        const start = new Date(d.getFullYear(), 0, 1);
        return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
    }

    _initDailyActivity() {
        const result = [];
        const now = new Date();
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            result.push({
                label: i === 0 ? 'Hoy' : days[d.getDay()],
                date: d.toDateString(),
                incoming: 0,
                outgoing: 0
            });
        }
        return result;
    }

    _checkPeriodBoundary() {
        const now = new Date();

        // Day boundary reset
        if (now.toDateString() !== this.lastResetDate) {
            this.prevDayCount = this.uniqueJidsToday.size;
            this.uniqueJidsToday = new Set();
            this.hourlyMessages = new Array(24).fill(0);

            // Shift daily activity window
            this.dailyActivity.shift();
            this.dailyActivity.push({
                label: 'Hoy',
                date: now.toDateString(),
                incoming: 0,
                outgoing: 0
            });
            // Relabel last entry of previous day
            if (this.dailyActivity.length > 1) {
                const prev = this.dailyActivity[this.dailyActivity.length - 2];
                const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                const d = new Date(prev.date);
                prev.label = days[d.getDay()];
            }

            this.lastResetDate = now.toDateString();
        }

        // Week boundary reset
        const currentWeek = this._getWeekNumber(now);
        if (currentWeek !== this.lastResetWeek) {
            this.prevWeekCount = this.uniqueJidsWeek.size;
            this.uniqueJidsWeek = new Set();
            this.lastResetWeek = currentWeek;
        }

        // Month boundary reset
        if (now.getMonth() !== this.lastResetMonth) {
            this.prevMonthCount = this.uniqueJidsMonth.size;
            this.uniqueJidsMonth = new Set();
            this.lastResetMonth = now.getMonth();
        }
    }
}

module.exports = new AnalyticsService();
