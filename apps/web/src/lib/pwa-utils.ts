/**
 * PWA detection utilities shared across dashboard components.
 */

export function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
    );
}

export function isIos(): boolean {
    if (typeof window === "undefined") return false;
    const ua = navigator.userAgent;
    const isLegacyIos = /iPad|iPhone|iPod/.test(ua);
    const isIpadOS13Plus = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    return (isLegacyIos || isIpadOS13Plus) && !("MSStream" in window);
}
