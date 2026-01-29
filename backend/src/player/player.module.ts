import { Module } from '@nestjs/common';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';
import { CodeGeneratorService } from '@/common/code-generator.service';

@Module({
  controllers: [PlayerController],
  providers: [PlayerService, CodeGeneratorService],
  exports: [PlayerService],
})
export class PlayerModule {}
