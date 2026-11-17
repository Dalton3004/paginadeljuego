/**
 * Utilidades de UI compartidas (XSS).
 * Una sola función esc() para todo dato dinámico que vaya a innerHTML.
 */
(function (g) {
    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    g.esc = esc;
})(typeof window !== "undefined" ? window : globalThis);

export const esc = globalThis.esc;
