import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';

/**
 * Exempted from the global rate limit (see docs/ARCHITECTURE.md's load
 * testing section) - a Kubernetes liveness probe or load balancer health
 * check polling every few seconds can exceed the global 100/min limit on
 * its own, and 429'ing your own infrastructure's health check defeats the
 * point of having one.
 */
@SkipThrottle()
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
