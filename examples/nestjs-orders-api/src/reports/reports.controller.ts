import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(ApiKeyGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  daily() {
    return this.reports.dailySummary();
  }
}
