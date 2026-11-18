import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Same sign-in as CAFM: the Power BI account's username and password (OAuth password grant), done on the server only.
// The Azure token stays in this process. The browser only gets a view-only embed token for this one report.
// Settings come from the server environment (backend/.env). Nothing is hard-coded here.

const POWER_BI_RESOURCE = 'https://analysis.windows.net/powerbi/api';
const POWER_BI_API = 'https://api.powerbi.com/v1.0/myorg';
const REFRESH_MARGIN_MS = 5 * 60_000;

export interface PowerBiEmbed {
  reportId: string;
  reportName: string;
  embedUrl: string;
  accessToken: string;
  expiresAt: string;
}

interface Settings {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  reportId: string;
  // Only needed when the report is in an app workspace rather than "My workspace".
  workspaceId: string;
}

interface ReportInfo {
  id: string;
  name: string;
  embedUrl: string;
  datasetId: string;
}

interface GeneratedToken {
  token: string;
  expiration: string;
}

@Injectable()
export class PowerBiService {
  private readonly logger = new Logger(PowerBiService.name);
  private azureToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  // Returns what the browser needs to embed the report: the report's embed URL and a short-lived embed token.
  async embedForReport(): Promise<PowerBiEmbed> {
    const settings = this.settings();
    const azure = await this.azureAccessToken(settings);

    const groupPart = settings.workspaceId ? `/groups/${encodeURIComponent(settings.workspaceId)}` : '';
    const reportUrl = `${POWER_BI_API}${groupPart}/reports/${encodeURIComponent(settings.reportId)}`;
    const report = await this.powerBiCall<ReportInfo>(reportUrl, azure, 'GET');

    const generated = settings.workspaceId
      ? await this.powerBiCall<GeneratedToken>(`${reportUrl}/GenerateToken`, azure, 'POST', { accessLevel: 'View' })
      : await this.powerBiCall<GeneratedToken>(`${POWER_BI_API}/GenerateToken`, azure, 'POST', {
          accessLevel: 'View',
          datasets: [{ id: report.datasetId }],
          reports: [{ id: report.id }],
        });

    return {
      reportId: report.id,
      reportName: report.name,
      embedUrl: report.embedUrl,
      accessToken: generated.token,
      expiresAt: generated.expiration,
    };
  }

  private settings(): Settings {
    const read = (key: string) => this.config.get<string>(key)?.trim() ?? '';
    const settings: Settings = {
      // Like CAFM, "common" is used when no tenant is given.
      tenantId: read('POWERBI_TENANT_ID') || 'common',
      clientId: read('POWERBI_CLIENT_ID'),
      clientSecret: read('POWERBI_CLIENT_SECRET'),
      username: read('POWERBI_USERNAME'),
      password: read('POWERBI_PASSWORD'),
      reportId: read('POWERBI_REPORT_ID'),
      workspaceId: read('POWERBI_WORKSPACE_ID'),
    };
    const required: Record<string, string> = {
      POWERBI_CLIENT_ID: settings.clientId,
      POWERBI_USERNAME: settings.username,
      POWERBI_PASSWORD: settings.password,
      POWERBI_REPORT_ID: settings.reportId,
    };
    const missing = Object.entries(required)
      .filter(([, value]) => value === '')
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new ServiceUnavailableException(`Power BI is not set up yet. Missing in the server settings: ${missing.join(', ')}.`);
    }
    return settings;
  }

  // Azure token for the Power BI account (password grant), cached until shortly before it expires.
  private async azureAccessToken(settings: Settings): Promise<string> {
    const now = Date.now();
    if (this.azureToken && this.azureToken.expiresAt - now > REFRESH_MARGIN_MS) return this.azureToken.value;

    const form = new URLSearchParams({
      grant_type: 'password',
      resource: POWER_BI_RESOURCE,
      username: settings.username,
      password: settings.password,
      client_id: settings.clientId,
    });
    if (settings.clientSecret) form.set('client_secret', settings.clientSecret);

    const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId)}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number | string; error?: string; error_description?: string };

    if (!res.ok || !data.access_token) {
      // Log the error code and the AADSTS code only. Never log the username, password or the full description.
      const aadCode = /AADSTS\d+/.exec(data.error_description ?? '')?.[0] ?? '';
      this.logger.error(`Azure sign-in for Power BI failed: HTTP ${res.status} ${data.error ?? ''} ${aadCode}`.trim());
      throw new BadGatewayException(
        'Power BI sign-in failed. Check POWERBI_USERNAME, POWERBI_PASSWORD and POWERBI_CLIENT_ID. Accounts that need MFA cannot sign in this way.',
      );
    }

    const lifetimeMs = Number(data.expires_in ?? 3600) * 1000;
    this.azureToken = { value: data.access_token, expiresAt: now + lifetimeMs };
    return data.access_token;
  }

  private async powerBiCall<T>(url: string, token: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Power BI ${method} ${url} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
      if (res.status === 404) {
        throw new BadGatewayException('Power BI report not found. Check POWERBI_REPORT_ID, and POWERBI_WORKSPACE_ID if the report is in an app workspace.');
      }
      if (res.status === 401 || res.status === 403) {
        throw new BadGatewayException('The Power BI account cannot access this report. Check its permissions in Power BI.');
      }
      throw new BadGatewayException('Power BI did not return the report. See the API log for details.');
    }

    return (await res.json()) as T;
  }
}
