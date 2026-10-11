import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/auth.decorators.js';
import { PrismaService } from '../infrastructure/prisma/prisma.service.js';

class HealthStatus {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}

/** Liveness and readiness for Docker / the load balancer (TRD §5.1). Public. */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'The process is up' })
  @ApiResponse({ status: 200, type: HealthStatus })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(200)
  @ApiOperation({ summary: 'The API can serve requests (database reachable)' })
  @ApiResponse({ status: 200, type: HealthStatus })
  @ApiResponse({ status: 503, description: 'Database unreachable' })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
