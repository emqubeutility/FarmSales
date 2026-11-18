import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MarketplaceConnectionState } from '@farm-sales/shared';
import type { MarketplaceAdapter } from './marketplace-adapter.js';

// Keys come from server config only (backend/.env locally, Vercel env in production). They stay
// unset until the Flipkart seller API access is granted; never put them in the app or in the repo.
@Injectable()
export class FlipkartAdapter implements MarketplaceAdapter {
  readonly marketplace = 'FLIPKART' as const;

  constructor(private readonly config: ConfigService) {}

  connectionState(): MarketplaceConnectionState {
    const appId = this.config.get<string>('FLIPKART_APP_ID');
    const appSecret = this.config.get<string>('FLIPKART_APP_SECRET');
    return appId && appSecret ? 'CONFIGURED' : 'NOT_CONFIGURED';
  }
}
