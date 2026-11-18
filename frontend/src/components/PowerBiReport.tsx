import { useEffect, useRef } from 'react';
import { service, factories, models, type Report } from 'powerbi-client';

// What the server returns from GET /api/powerbi/embed.
export interface PowerBiEmbed {
  reportId: string;
  reportName: string;
  embedUrl: string;
  accessToken: string;
  expiresAt: string;
}

// Embeds one Power BI report with an embed token. The page is shown with the filter pane hidden.
export function PowerBiReport({ embed, onError }: { embed: PowerBiEmbed; onError: (message: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const powerbi = new service.Service(factories.hpmFactory, factories.wpmpFactory, factories.routerFactory);
    const report = powerbi.embed(container, {
      type: 'report',
      id: embed.reportId,
      embedUrl: embed.embedUrl,
      accessToken: embed.accessToken,
      tokenType: models.TokenType.Embed,
      permissions: models.Permissions.Read,
      settings: {
        panes: {
          filters: { visible: false, expanded: false },
          pageNavigation: { visible: true },
        },
      },
    }) as Report;

    report.on('error', () => onError('The report could not be shown. Try reloading the page.'));

    return () => {
      powerbi.reset(container);
    };
    // Re-embed only when the embed details change. onError is used for messages only.
  }, [embed]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 480 }} />;
}
