import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';

/** Share URLs (TRD SH-01): App Links / Universal Links that open the app, else the landing page. */
@Injectable()
export class ShareLinks {
  constructor(private readonly config: AppConfig) {}

  post(postId: string): string {
    return `${this.config.links.webBaseUrl}/p/${postId}`;
  }

  profile(username: string): string {
    return `${this.config.links.webBaseUrl}/u/${encodeURIComponent(username)}`;
  }
}
