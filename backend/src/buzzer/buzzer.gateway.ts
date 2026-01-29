import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { BuzzerService } from './buzzer.service';
import { PrismaService } from '@/prisma/prisma.service';
import { PlayerService } from '@/player/player.service';

interface ClientData {
  gameId?: string;
  playerId?: string;
  role?: 'mc' | 'player' | 'screen';
  code?: string;
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  },
})
export class BuzzerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('BuzzerGateway');

  constructor(
    private buzzerService: BuzzerService,
    private prisma: PrismaService,
    private playerService: PlayerService,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as ClientData;
    this.logger.log(`Client disconnected: ${client.id}`);

    // Si c'est un joueur, marquer comme déconnecté
    if (data.playerId) {
      await this.playerService.updateConnectionStatus(data.playerId, false);
      this.emitToGame(data.gameId, 'player:disconnected', {
        playerId: data.playerId,
      });
    }

    // Si c'est le MC, mettre le jeu en pause
    if (data.role === 'mc' && data.gameId) {
      await this.prisma.game.update({
        where: { id: data.gameId },
        data: { status: 'PAUSED' },
      });
      this.emitToGame(data.gameId, 'game:paused', {
        reason: 'MC déconnecté',
      });
    }
  }

  /**
   * Connexion d'un client (MC, joueur, ou écran public)
   */
  @SubscribeMessage('auth:connect')
  async handleConnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { code: string; token: string; role: 'mc' | 'player' | 'screen' },
  ) {
    try {
      const game = await this.prisma.game.findUnique({
        where: { code: data.code.toUpperCase() },
      });

      if (!game) {
        return { success: false, error: 'Partie introuvable' };
      }

      // Rejoindre la room du jeu
      client.join(`game:${game.id}`);
      (client.data as ClientData).gameId = game.id;
      (client.data as ClientData).code = game.code;
      (client.data as ClientData).role = data.role;

      if (data.role === 'mc') {
        if (game.mcToken !== data.token) {
          return { success: false, error: 'Token MC invalide' };
        }
        this.logger.log(`MC connected to game ${game.code}`);
      } else if (data.role === 'player') {
        const player = await this.prisma.player.findUnique({
          where: { token: data.token },
        });

        if (!player || player.gameId !== game.id) {
          return { success: false, error: 'Token joueur invalide' };
        }

        (client.data as ClientData).playerId = player.id;
        await this.playerService.updateConnectionStatus(player.id, true);
        this.logger.log(`Player ${player.name} connected to game ${game.code}`);

        // Notifier les autres
        this.emitToGame(game.id, 'player:connected', {
          playerId: player.id,
          playerName: player.name,
        });
      }

      // Envoyer l'état complet du jeu
      await this.sendGameState(game.id);

      return { success: true, gameId: game.id };
    } catch (error) {
      this.logger.error('Error in auth:connect', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * MC ouvre le buzz
   */
  @SubscribeMessage('mc:open_buzz')
  async handleOpenBuzz(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { questionId: string },
  ) {
    try {
      const clientData = client.data as ClientData;
      if (clientData.role !== 'mc') {
        return { success: false, error: 'Seul le MC peut ouvrir le buzz' };
      }

      await this.buzzerService.openBuzz(clientData.gameId, data.questionId);

      // Notifier tous les joueurs
      this.emitToGame(clientData.gameId, 'question:opened', {
        questionId: data.questionId,
        timestamp: new Date(),
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Error in mc:open_buzz', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Joueur buzz
   */
  @SubscribeMessage('player:buzz')
  async handleBuzz(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { questionId: string; clientTimestamp: string },
  ) {
    try {
      const clientData = client.data as ClientData;
      if (!clientData.playerId) {
        return { success: false, error: 'Non authentifié' };
      }

      const result = await this.buzzerService.handleBuzz(
        clientData.gameId,
        data.questionId,
        clientData.playerId,
        new Date(data.clientTimestamp),
      );

      // Notifier tout le monde du winner
      this.emitToGame(clientData.gameId, 'buzz:winner', {
        questionId: data.questionId,
        playerId: result.playerId,
        playerName: result.playerName,
        timestamp: new Date(),
      });

      return { success: true, result };
    } catch (error) {
      this.logger.error('Error in player:buzz', error);

      // Notifier le joueur que son buzz est rejeté
      client.emit('buzz:rejected', {
        questionId: data.questionId,
        reason: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * MC juge le buzz
   */
  @SubscribeMessage('mc:judge_buzz')
  async handleJudgeBuzz(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      questionId: string;
      playerId: string;
      isCorrect: boolean;
    },
  ) {
    try {
      const clientData = client.data as ClientData;
      if (clientData.role !== 'mc') {
        return { success: false, error: 'Seul le MC peut juger' };
      }

      const game = await this.prisma.game.findUnique({
        where: { id: clientData.gameId },
      });

      const result = await this.buzzerService.judgeBuzz(
        clientData.gameId,
        data.questionId,
        data.playerId,
        data.isCorrect,
        game.mcToken,
      );

      if (result.isCorrect) {
        // Notifier que la réponse est correcte
        this.emitToGame(clientData.gameId, 'buzz:correct', {
          questionId: data.questionId,
          playerId: data.playerId,
          points: result.points,
        });

        // Envoyer le scoreboard mis à jour
        await this.sendScoreboard(clientData.gameId);
      } else {
        // Notifier que la réponse est fausse + réouverture
        this.emitToGame(clientData.gameId, 'buzz:wrong', {
          questionId: data.questionId,
          playerId: data.playerId,
          penalty: result.penalty,
        });

        this.emitToGame(clientData.gameId, 'player:locked', {
          questionId: data.questionId,
          playerId: data.playerId,
        });

        // Le buzz est réouvert
        this.emitToGame(clientData.gameId, 'question:reopened', {
          questionId: data.questionId,
        });
      }

      return { success: true, result };
    } catch (error) {
      this.logger.error('Error in mc:judge_buzz', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * MC passe à la question suivante
   */
  @SubscribeMessage('mc:next_question')
  async handleNextQuestion(@ConnectedSocket() client: Socket) {
    try {
      const clientData = client.data as ClientData;
      if (clientData.role !== 'mc') {
        return { success: false, error: 'Seul le MC peut changer de question' };
      }

      const game = await this.prisma.game.findUnique({
        where: { id: clientData.gameId },
      });

      const result = await this.buzzerService.nextQuestion(clientData.gameId, game.mcToken);

      // Notifier tout le monde
      this.emitToGame(clientData.gameId, 'question:changed', {
        questionIndex: result.currentQuestionIndex,
        question: result.question,
      });

      return { success: true, result };
    } catch (error) {
      this.logger.error('Error in mc:next_question', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * MC débloque un joueur
   */
  @SubscribeMessage('mc:unlock_player')
  async handleUnlockPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { questionId: string; playerId: string },
  ) {
    try {
      const clientData = client.data as ClientData;
      if (clientData.role !== 'mc') {
        return { success: false, error: 'Seul le MC peut débloquer' };
      }

      const game = await this.prisma.game.findUnique({
        where: { id: clientData.gameId },
      });

      await this.buzzerService.unlockPlayer(
        clientData.gameId,
        data.questionId,
        data.playerId,
        game.mcToken,
      );

      this.emitToGame(clientData.gameId, 'player:unlocked', {
        questionId: data.questionId,
        playerId: data.playerId,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Error in mc:unlock_player', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Utilitaire: envoyer à tous les clients d'une partie
   */
  private emitToGame(gameId: string, event: string, data: any) {
    this.server.to(`game:${gameId}`).emit(event, data);
  }

  /**
   * Envoyer l'état complet du jeu
   */
  private async sendGameState(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        questions: {
          orderBy: { index: 'asc' },
        },
        players: {
          orderBy: { score: 'desc' },
        },
        questionStates: {
          include: {
            winnerPlayer: true,
            lockedPlayers: true,
          },
        },
      },
    });

    const currentQuestion = game.questions[game.currentQuestionIndex];
    const currentQuestionState = game.questionStates.find(
      (qs) => qs.questionId === currentQuestion?.id,
    );

    this.emitToGame(gameId, 'game:state', {
      status: game.status,
      currentQuestionIndex: game.currentQuestionIndex,
      currentQuestion,
      currentQuestionState,
      players: game.players,
    });
  }

  /**
   * Envoyer le scoreboard mis à jour
   */
  private async sendScoreboard(gameId: string) {
    const players = await this.prisma.player.findMany({
      where: { gameId },
      orderBy: { score: 'desc' },
      select: {
        id: true,
        name: true,
        score: true,
      },
    });

    this.emitToGame(gameId, 'scoreboard:updated', { players });
  }
}
