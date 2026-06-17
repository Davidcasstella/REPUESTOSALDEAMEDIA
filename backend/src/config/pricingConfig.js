/**
 * Pricing Configuration — Centralized pricing percentages
 *
 * All pricing calculations across the application consume these values.
 * To change percentages in the future, only this file needs to be modified.
 *
 * Formula:
 *   Subtotal = Base + (Base × MARGIN%) + (Base × CHATBOT%)
 *   IVA      = Subtotal × IVA%
 *   Final    = Subtotal + IVA
 */

module.exports = {
    // Commercial margin applied over base price
    MARGIN_PERCENT: 30,

    // Operational / chatbot maintenance costs
    CHATBOT_PERCENT: 5,

    // Colombian IVA tax rate
    IVA_PERCENT: 19,
};
