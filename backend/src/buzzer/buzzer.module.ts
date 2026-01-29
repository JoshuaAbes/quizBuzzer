import { Module } from '@nestjs/common';
import { BuzzerGateway } from './buzzer.gateway';
import { BuzzerService } from './buzzer.service';
import { PlayerModule } from '@/player/player.module';

@Module({
  imports: [PlayerModule],
  providers: [BuzzerGateway, BuzzerService],
  exports: [BuzzerService],
})
export class BuzzerModule {}
