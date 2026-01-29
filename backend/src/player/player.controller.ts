import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { PlayerService } from './player.service';
import { JoinGameDto } from './dto/player.dto';

@Controller('games/:code/players')
export class PlayerController {
  constructor(private playerService: PlayerService) {}

  @Post('join')
  async joinGame(@Param('code') code: string, @Body() dto: JoinGameDto) {
    return this.playerService.joinGame(code, dto);
  }

  @Get('me')
  async getPlayer(@Query('token') token: string) {
    return this.playerService.getPlayerByToken(token);
  }
}
