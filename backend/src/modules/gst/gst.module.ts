import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GstController } from './controllers/gst.controller';
import { GstService } from './services/gst.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [GstController],
  providers: [GstService],
  exports: [GstService],
})
export class GstModule {}
