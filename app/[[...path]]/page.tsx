export const dynamic = 'force-dynamic';

export default function ScanServe() {
  return (
    <div id="scanserve" data-restaurant={process.env.RESTAURANT_SLUG ?? ''}>
      <p className="loading">Opening ScanServe PH.</p>
      <noscript>Enable JavaScript to open the menu or kitchen screen.</noscript>
    </div>
  );
}
