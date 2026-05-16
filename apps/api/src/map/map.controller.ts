import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { MapService } from './map.service'
import { MapQueryDto } from './dto/map-query.dto'

@ApiTags('map')
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('reports')
  @ApiOperation({ summary: 'Get geo-located reports for map display' })
  @ApiQuery({ name: 'swLat', required: false })
  @ApiQuery({ name: 'swLng', required: false })
  @ApiQuery({ name: 'neLat', required: false })
  @ApiQuery({ name: 'neLng', required: false })
  getReports(@Query() query: MapQueryDto) {
    return this.mapService.getMapReports(query)
  }
}
