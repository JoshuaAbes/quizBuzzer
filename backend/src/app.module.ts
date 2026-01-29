import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { GameModule } from './game/game.module';
import { PlayerModule } from './player/player.module';
import { BuzzerModule } from './buzzer/buzzer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    GameModule,
    PlayerModule,
    BuzzerModule,
  ],
})
export class AppModule {}
