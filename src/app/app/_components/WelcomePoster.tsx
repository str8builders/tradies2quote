/** Lightweight first paint and a complete alternative to the WebGL scene. */
export function WelcomePoster() {
  return <div className="t2q-welcome-poster" aria-hidden="true">
    <div className="t2q-welcome-paper">
      <span className="t2q-welcome-paper-label">SITE NOTE → QUOTE</span>
      <span className="t2q-welcome-paper-title">Ready for<br />the next job.</span>
      {[82, 65, 74].map((width) => <span key={width} className="t2q-welcome-paper-line" style={{ width: `${width}%` }} />)}
      <span className="t2q-welcome-paper-total">Tradies2Quote</span>
    </div>
  </div>;
}
