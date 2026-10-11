import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';

/**
 * Object keys → public URLs (TRD API-10, MD-05). Only variant keys are ever passed in; originals
 * stay private. Keys come from the database (built in SQL or by the worker), never from clients.
 */
@Injectable()
export class MediaUrls {
  constructor(private readonly config: AppConfig) {}

  of(key: string | null | undefined): string | null {
    return key ? `${this.config.mediaBaseUrl}/${key}` : null;
  }
}
