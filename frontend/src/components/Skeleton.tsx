// Placeholders shown while data loads, so people can see the page is coming and wait for it.

// One table row that says the data is loading, for a list whose rows have not arrived yet.
export function LoadingRow({ columns }: { columns: number }) {
  return (
    <tr>
      <td colSpan={columns} role="status" aria-live="polite" style={{ textAlign: 'center', padding: 40 }}>
        <span className="loading-text">
          Loading data
          <span className="loading-dots" aria-hidden="true" />
        </span>
      </td>
    </tr>
  );
}

// A block the height of a card or panel, for content that is still loading.
export function SkeletonBlock({ height = 120 }: { height?: number }) {
  return <div className="skeleton" aria-hidden="true" style={{ height, width: '100%' }} />;
}

// The whole page while its first data arrives: a header line and a few blocks.
export function PageSkeleton() {
  return (
    <div className="body" role="status" aria-label="Loading data" style={{ flexDirection: 'column', gap: 16 }}>
      <SkeletonBlock height={28} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <SkeletonBlock height={96} />
        <SkeletonBlock height={96} />
        <SkeletonBlock height={96} />
      </div>
      <SkeletonBlock height={320} />
    </div>
  );
}
