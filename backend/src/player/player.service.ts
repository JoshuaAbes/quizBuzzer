import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CodeGeneratorService } from '@/common/code-generator.service';
import { JoinGameDto } from './dto/player.dto';
import { GameStatus } from '@prisma/client';

@Injectable()
export class PlayerService {
  constructor(
    private prisma: PrismaService,
    private codeGenerator: CodeGeneratorService,
  ) {}

  /**
   * Rejoindre une partie
   */
  async joinGame(code: string, dto: JoinGameDto) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        players: true,
      },
    });

    if (!game) {
      throw new NotFoundException('Partie introuvable');
    }

    if (game.status === GameStatus.FINISHED) {
      throw new BadRequestException('La partie est terminée');
    }

    if (game.status === GameStatus.RUNNING) {
      throw new BadRequestException('La partie a déjà démarré');
    }

    // Vérifier si le nom est déjà pris
    const existingPlayer = game.players.find(
      (p) => p.name.toLowerCase() === dto.name.toLowerCase(),
    );

    if (existingPlayer) {
      throw new BadRequestException('Ce nom est déjà pris');
    }

    const token = this.codeGenerator.generateToken();

    const player = await this.prisma.player.create({
      data: {
        gameId: game.id,
        name: dto.name,
        token,
        isConnected: true,
      },
    });

    return {
      playerId: player.id,
      playerToken: player.token,
      name: player.name,
      gameCode: game.code,
    };
  }

  /**
   * Récupérer un joueur par token
   */
  async getPlayerByToken(token: string) {
    const player = await this.prisma.player.findUnique({
      where: { token },
      include: {
        game: {
          select: {
            code: true,
            status: true,
            currentQuestionIndex: true,
          },
        },
      },
    });

    if (!player) {
      throw new NotFoundException('Joueur introuvable');
    }

    return player;
  }

  /**
   * Mettre à jour le statut de connexion
   */
  async updateConnectionStatus(playerId: string, isConnected: boolean) {
    await this.prisma.player.update({
      where: { id: playerId },
      data: { isConnected },
    });
  }
}
