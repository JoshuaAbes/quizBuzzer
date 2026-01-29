import { Controller, Post, Get, Put, Body, Param, Query, HttpCode } from '@nestjs/common';
import { GameService } from './game.service';
import { CreateGameDto, UpdateQuestionsDto } from './dto/game.dto';

@Controller('games')
export class GameController {
  constructor(private gameService: GameService) {}

  @Post()
  async createGame(@Body() dto: CreateGameDto) {
    return this.gameService.createGame(dto);
  }

  @Get(':code')
  async getGame(@Param('code') code: string) {
    return this.gameService.getGameByCode(code);
  }

  @Get(':code/state')
  async getGameState(@Param('code') code: string, @Query('mcToken') mcToken: string) {
    return this.gameService.getGameState(code, mcToken);
  }

  @Put(':code/questions')
  async updateQuestions(
    @Param('code') code: string,
    @Query('mcToken') mcToken: string,
    @Body() dto: UpdateQuestionsDto,
  ) {
    return this.gameService.updateQuestions(code, mcToken, dto);
  }

  @Post(':code/start')
  @HttpCode(200)
  async startGame(@Param('code') code: string, @Query('mcToken') mcToken: string) {
    return this.gameService.startGame(code, mcToken);
  }

  @Post(':code/finish')
  @HttpCode(200)
  async finishGame(@Param('code') code: string, @Query('mcToken') mcToken: string) {
    return this.gameService.finishGame(code, mcToken);
  }

  @Get(':code/scoreboard')
  async getScoreboard(@Param('code') code: string) {
    return this.gameService.getScoreboard(code);
  }
}
