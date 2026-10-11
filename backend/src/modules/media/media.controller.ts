import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { CreateUploadDto, MediaStatus, UploadIntent } from './media.dto.js';
import { MediaService } from './media.service.js';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Upload intent: a presigned PUT URL for one photo (15 min)' })
  @ApiResponse({ status: 201, type: UploadIntent })
  createUpload(@CurrentUser() user: AuthUser, @Body() dto: CreateUploadDto): Promise<UploadIntent> {
    return this.media.createUpload(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Processing status of your own upload' })
  @ApiResponse({ status: 200, type: MediaStatus })
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MediaStatus> {
    return this.media.status(user.id, id);
  }
}
