import { Module } from '@nestjs/common';
import { LinksController } from './links.controller.js';
import { ShareLinks } from './share-links.js';

@Module({
  controllers: [LinksController],
  providers: [ShareLinks],
  exports: [ShareLinks],
})
export class LinksModule {}
