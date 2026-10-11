import { Global, Module } from '@nestjs/common';
import { MediaUrls } from './media-urls.js';

@Global()
@Module({
  providers: [MediaUrls],
  exports: [MediaUrls],
})
export class StorageModule {}
