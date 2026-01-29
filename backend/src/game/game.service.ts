import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CodeGeneratorService } from '@/common/code-generator.service';
import { CreateGameDto, UpdateQuestionsDto, JudgeBuzzDto } from './dto/game.dto';
import { GameStatus, QuestionStateStatus } from '@prisma/client';

@Injectable()
export class GameService {
  constructor(
    private prisma: PrismaService,
    private codeGenerator: CodeGeneratorService,
  ) {}

  /**
   * Crée une nouvelle partie
   */
  async createGame(dto: CreateGameDto) {
    const code = this.codeGenerator.generateGameCode();
    const mcToken = this.codeGenerator.generateToken();

    const game = await this.prisma.game.create({
      data: {
        code,
        mcToken,
        allowNegativePoints: dto.allowNegativePoints || false,
        questions: dto.questions
          ? {
              create: dto.questions.map((q, index) => ({
                index,
                text: q.text,
                answer: q.answer,
                points: q.points || 1,
                timeLimit: q.timeLimit,
              })),
            }
          : undefined,
      },
      include: {
        questions: {
          orderBy: { index: 'asc' },
        },
      },
    });

    // Créer les QuestionState pour chaque question
    if (game.questions.length > 0) {
      await this.prisma.questionState.createMany({
        data: game.questions.map((q) => ({
          gameId: game.id,
          questionId: q.id,
          status: QuestionStateStatus.IDLE,
        })),
      });
    }

    return {
      gameId: game.id,
      code: game.code,
      mcToken: game.mcToken,
      questions: game.questions,
    };
  }

  /**
   * Récupère une partie par code
   */
  async getGameByCode(code: string) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        questions: {
          orderBy: { index: 'asc' },
          select: {
            id: true,
            index: true,
            text: true,
            points: true,
            timeLimit: true,
            // On ne renvoie PAS la réponse aux joueurs
          },
        },
        players: {
          orderBy: { score: 'desc' },
          select: {
            id: true,
            name: true,
            score: true,
            isConnected: true,
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Partie introuvable');
    }

    return game;
  }

  /**
   * Récupère l'état complet (pour le MC)
   */
  async getGameState(code: string, mcToken: string) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        questions: {
          orderBy: { index: 'asc' },
          include: {
            questionStates: true,
          },
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

    if (!game) {
      throw new NotFoundException('Partie introuvable');
    }

    if (game.mcToken !== mcToken) {
      throw new BadRequestException('Token MC invalide');
    }

    const currentQuestion = game.questions[game.currentQuestionIndex];
    const currentQuestionState = game.questionStates.find(
      (qs) => qs.questionId === currentQuestion?.id,
    );

    return {
      game,
      currentQuestion,
      currentQuestionState,
    };
  }

  /**
   * Met à jour les questions d'une partie
   */
  async updateQuestions(code: string, mcToken: string, dto: UpdateQuestionsDto) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!game) {
      throw new NotFoundException('Partie introuvable');
    }

    if (game.mcToken !== mcToken) {
      throw new BadRequestException('Token MC invalide');
    }

    if (game.status !== GameStatus.LOBBY) {
      throw new BadRequestException('Impossible de modifier les questions après le démarrage');
    }

    // Supprimer les anciennes questions
    await this.prisma.question.deleteMany({
      where: { gameId: game.id },
    });

    // Créer les nouvelles
    const questions = await this.prisma.question.createMany({
      data: dto.questions.map((q, index) => ({
        gameId: game.id,
        index,
        text: q.text,
        answer: q.answer,
        points: q.points || 1,
        timeLimit: q.timeLimit,
      })),
    });

    // Créer les QuestionState
    const createdQuestions = await this.prisma.question.findMany({
      where: { gameId: game.id },
    });

    await this.prisma.questionState.createMany({
      data: createdQuestions.map((q) => ({
        gameId: game.id,
        questionId: q.id,
        status: QuestionStateStatus.IDLE,
      })),
    });

    return { success: true, questionsCount: questions.count };
  }

  /**
   * Démarre la partie
   */
  async startGame(code: string, mcToken: string) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        questions: true,
        players: true,
      },
    });

    if (!game) {
      throw new NotFoundException('Partie introuvable');
    }

    if (game.mcToken !== mcToken) {
      throw new BadRequestException('Token MC invalide');
    }

    if (game.status !== GameStatus.LOBBY) {
      throw new BadRequestException('La partie a déjà démarré');
    }

    if (game.questions.length === 0) {
      throw new BadRequestException('Aucune question ajoutée');
    }

    if (game.players.length === 0) {
      throw new BadRequestException('Aucun joueur n\'a rejoint');
    }

    await this.prisma.game.update({
      where: { id: game.id },
      data: { status: GameStatus.RUNNING },
    });

    return { success: true, status: GameStatus.RUNNING };
  }

  /**
   * Termine la partie
   */
  async finishGame(code: string, mcToken: string) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!game) {
      throw new NotFoundException('Partie introuvable');
    }

    if (game.mcToken !== mcToken) {
      throw new BadRequestException('Token MC invalide');
    }

    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        status: GameStatus.FINISHED,
        finishedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Récupère le scoreboard
   */
  async getScoreboard(code: string) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        players: {
          orderBy: { score: 'desc' },
          select: {
            id: true,
            name: true,
            score: true,
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Partie introuvable');
    }

    return game.players;
  }
}
