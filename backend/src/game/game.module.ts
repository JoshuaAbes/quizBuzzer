import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { CodeGeneratorService } from '@/common/code-generator.service';

@Module({
  controllers: [GameController],
  providers: [GameService, CodeGeneratorService],
  exports: [GameService],
})
export class GameModule {}
