import { SetMetadata } from '@nestjs/common'
import { OrgPermission } from '@prisma/client'
import { FeatureKey, OrgPlanType } from '@votz/shared-types'

export const FEATURE_METADATA_KEY = 'required_plan_feature'

export interface RequiredFeatureMetadata {
  feature: FeatureKey
  orgType?: OrgPlanType
  permission?: OrgPermission
}

export const RequiresFeature = (
  feature: FeatureKey,
  orgType?: OrgPlanType,
  permission?: OrgPermission,
) => SetMetadata(FEATURE_METADATA_KEY, { feature, orgType, permission } satisfies RequiredFeatureMetadata)
