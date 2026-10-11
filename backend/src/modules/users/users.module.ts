import { Module } from '@nestjs/common';
import { LinksModule } from '../links/links.module.js';
import { MediaModule } from '../media/media.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [MediaModule, LinksModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
