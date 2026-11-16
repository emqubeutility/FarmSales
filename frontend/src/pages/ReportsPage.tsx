// The FarmSales Power BI report, shown inside the app. It is a publish-to-web link: anyone who has
// the link can open the report, so only publish figures that are fine to share.
const POWER_BI_REPORT_URL =
  'https://app.powerbi.com/view?r=eyJrIjoiY2JkMzRhZGItYzEzYy00ZWJhLWIwMDItODE4MDc0ZDU0NmEwIiwidCI6ImM2NzQ0YmU0LWU3MGUtNDg2NS05Y2I2LTUzNDgxMzJmMTM5OCJ9';

export function ReportsPage() {
  return (
    <>
      <div className="top" style={{ gap: 12 }}>
        <div>
          <h1>Reports</h1>
          <div className="muted" style={{ fontSize: 12 }}>Sales overview from Power BI</div>
        </div>
      </div>

      <div className="body" style={{ flexDirection: 'column', gap: 16 }}>
        <section className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, minHeight: 480 }}>
          <iframe
            title="FarmSales Power BI report"
            src={POWER_BI_REPORT_URL}
            allowFullScreen
            style={{ width: '100%', height: '100%', minHeight: 480, border: 0, display: 'block' }}
          />
        </section>
      </div>
    </>
  );
}
