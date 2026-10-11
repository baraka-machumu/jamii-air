import { Module } from '@nestjs/common';
import { LinksModule } from '../links/links.module.js';
import { MediaModule } from '../media/media.module.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [MediaModule, LinksModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
