import { Global, Module } from '@nestjs/common';
import { MediaUrls } from './media-urls.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [MediaUrls, StorageService],
  exports: [MediaUrls, StorageService],
})
export class StorageModule {}
