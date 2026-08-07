import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { AssetController } from './controllers/asset.controller';
import { AssetTypeService } from './services/asset-type.service';
import { AssetItemService } from './services/asset-item.service';
import { AssetAssignmentService } from './services/asset-assignment.service';

@Module({
  imports: [forwardRef(() => AuthModule), PlatformModule],
  controllers: [AssetController],
  providers: [AssetTypeService, AssetItemService, AssetAssignmentService],
  exports: [AssetTypeService, AssetItemService, AssetAssignmentService],
})
export class AssetsModule {}
