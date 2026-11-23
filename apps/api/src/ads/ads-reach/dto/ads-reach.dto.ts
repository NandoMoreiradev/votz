import { PickType } from '@nestjs/swagger'
import { AdSetInputDto } from '../../ads-campaigns/dto/ads-campaigns.dto'

/** O público do passo a passo (sem nome, orçamento e datas): só o que muda o alcance. */
export class AdReachEstimateDto extends PickType(AdSetInputDto, ['states', 'cities', 'interests', 'ageBands', 'genders', 'automaticAudience'] as const) {}
