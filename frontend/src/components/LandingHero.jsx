const quickStats = [
  { label: 'Live Crowd Index', value: '82,450' },
  { label: 'Monitored Gates', value: '8 Active' },
  { label: 'Response Time', value: '< 45 sec' },
];

export default function LandingHero() {
  return (
    <section className="hero">
      <div className="hero__content">
        <p className="hero__eyebrow">Large Event Safety Platform</p>
        <h1>Crowd Management, Rebuilt for Real-Time Decisions</h1>
        <p className="hero__description">
          Track crowd pressure, monitor CCTV hotspots, and coordinate response
          teams from one unified command dashboard.
        </p>

        <div className="hero__actions">
          <button className="btn btn--primary">Open Command Dashboard</button>
          <button className="btn btn--ghost">View Simulation Preview</button>
        </div>

        <div className="hero__stats">
          {quickStats.map((item) => (
            <article className="stat-card" key={item.label}>
              <p className="stat-card__label">{item.label}</p>
              <p className="stat-card__value">{item.value}</p>
            </article>
          ))}
        </div>
      </div>

      <aside className="hero__panel" aria-label="Live status preview">
        <div className="status-pill">
          <span className="pulse" />
          System Status: Operational
        </div>

        <div className="mini-map">
          <div className="mini-map__ring mini-map__ring--hot" />
          <div className="mini-map__ring mini-map__ring--moderate" />
          <div className="mini-map__ring mini-map__ring--low" />
          <p className="mini-map__caption">Pune Event Zone Snapshot</p>
        </div>

        <ul className="alerts-list">
          <li>Gate 3: High density spike detected</li>
          <li>Swargate: Moderate pressure, monitoring</li>
          <li>Parking South: Flow stable</li>
        </ul>
      </aside>
    </section>
  );
}
