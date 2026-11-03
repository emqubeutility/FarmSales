type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <header className="top">
        <h1>{title}</h1>
        <span className="pill a">Planned</span>
      </header>
      <main className="body" style={{ display: 'block' }}>
        <section className="card planned-page">
          <div className="planned-page-icon" aria-hidden="true">✦</div>
          <h2>{title}</h2>
          <p>{description}</p>
          <span className="pill n">Coming soon</span>
        </section>
      </main>
    </>
  );
}
