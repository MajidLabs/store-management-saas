import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { register } from './metrics.registry';

/**
 * Excluded from Swagger (ApiExcludeController) - this is a
 * scrape target for Prometheus, not a documented API endpoint for API
 * consumers. @Public() because a metrics scraper doesn't have (and
 * shouldn't need) a store's JWT; in a real deployment this route should be
 * blocked at the reverse proxy from anything but the monitoring network,
 * the same way you wouldn't expose it to the public internet unauthenticated
 * - see docs/DEPLOYMENT.md. @SkipThrottle() for the same reason as
 * HealthController - a monitoring scrape shouldn't compete with real users
 * for the same rate-limit budget.
 */
@SkipThrottle()
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}
