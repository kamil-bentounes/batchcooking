/** Le navigateur sait-il lire un code-barres (`BarcodeDetector`) ? Chromium sur Android oui ; Safari et Firefox non. */
export const saitLireUnCode = () => typeof window !== 'undefined' && 'BarcodeDetector' in window
