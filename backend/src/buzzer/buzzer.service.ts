import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { QuestionStateStatus, BuzzEventResult, Prisma } from '@prisma/client';

@Injectable()
export class BuzzerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ouvre le buzz pour une question (MC action)
   * Protection: ne peut pas ouvrir si déjà RESOLVED
   */
  async openBuzz(gameId: string, questionId: string) {
    const questionState = await this.prisma.questionState.findUnique({
      where: {
        gameId_questionId: {
          gameId,
          questionId,
        },
      },
    });

    if (!questionState) {
      throw new NotFoundException('État de question introuvable');
    }

    if (questionState.status === QuestionStateStatus.RESOLVED) {
      throw new BadRequestException('Cette question est déjà résolue');
    }

    // Réouvrir le buzz (pour les cas où un joueur s'est trompé)
    await this.prisma.questionState.update({
      where: { id: questionState.id },
      data: {
        status: QuestionStateStatus.OPEN,
        openedAt: new Date(),
        winnerPlayerId: null, // Reset winner si réouverture
      },
    });

    return { success: true, status: QuestionStateStatus.OPEN };
  }

  /**
   * Traite un buzz de joueur
   * PROTECTION RACE CONDITION: utilise un UPDATE conditionnel
   */
  async handleBuzz(gameId: string, questionId: string, playerId: string, clientTimestamp: Date) {
    // 1. Vérifier que la question est OPEN
    const questionState = await this.prisma.questionState.findUnique({
      where: {
        gameId_questionId: { gameId, questionId },
      },
      include: {
        lockedPlayers: {
          select: { id: true },
        },
      },
    });

    if (!questionState) {
      // Enregistrer l'événement comme rejeté
      await this.createBuzzEvent(
        gameId,
        questionId,
        playerId,
        clientTimestamp,
        BuzzEventResult.REJECTED_NOT_OPEN,
      );
      throw new BadRequestException('Question introuvable');
    }

    // Vérifier si joueur bloqué
    const isLocked = questionState.lockedPlayers.some((p) => p.id === playerId);
    if (isLocked) {
      await this.createBuzzEvent(
        gameId,
        questionId,
        playerId,
        clientTimestamp,
        BuzzEventResult.REJECTED_LOCKED,
      );
      throw new BadRequestException('Vous êtes bloqué pour cette question');
    }

    // Vérifier si question ouverte
    if (questionState.status !== QuestionStateStatus.OPEN) {
      await this.createBuzzEvent(
        gameId,
        questionId,
        playerId,
        clientTimestamp,
        BuzzEventResult.REJECTED_NOT_OPEN,
      );
      throw new BadRequestException('Le buzz n\'est pas ouvert');
    }

    // 2. ATOMIQUE: tenter de verrouiller ET devenir winner
    // Cette requête ne modifie QUE SI status = OPEN
    // Si une autre requête a déjà changé le status, count = 0
    const updateResult = await this.prisma.$executeRaw`
      UPDATE "QuestionState"
      SET 
        status = ${QuestionStateStatus.LOCKED}::"QuestionStateStatus",
        "winnerPlayerId" = ${playerId},
        "lockedAt" = NOW()
      WHERE 
        id = ${questionState.id}
        AND status = ${QuestionStateStatus.OPEN}::"QuestionStateStatus"
    `;

    // Si updateResult = 0 → un autre joueur a déjà buzzé
    if (updateResult === 0) {
      await this.createBuzzEvent(
        gameId,
        questionId,
        playerId,
        clientTimestamp,
        BuzzEventResult.TOO_LATE,
      );
      throw new BadRequestException('Trop tard, quelqu\'un a déjà buzzé');
    }

    // 3. Le joueur a gagné !
    await this.createBuzzEvent(
      gameId,
      questionId,
      playerId,
      clientTimestamp,
      BuzzEventResult.WINNER,
    );

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });

    return {
      success: true,
      result: BuzzEventResult.WINNER,
      playerId,
      playerName: player.name,
    };
  }

  /**
   * Le MC juge le buzz: correct ou faux
   */
  async judgeBuzz(
    gameId: string,
    questionId: string,
    playerId: string,
    isCorrect: boolean,
    mcToken: string,
  ) {
    // Vérifier MC token
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        questions: {
          where: { id: questionId },
        },
      },
    });

    if (!game || game.mcToken !== mcToken) {
      throw new BadRequestException('Token MC invalide');
    }

    const question = game.questions[0];
    if (!question) {
      throw new NotFoundException('Question introuvable');
    }

    const questionState = await this.prisma.questionState.findUnique({
      where: {
        gameId_questionId: { gameId, questionId },
      },
    });

    if (questionState.status !== QuestionStateStatus.LOCKED) {
      throw new BadRequestException('Aucun buzz en attente de jugement');
    }

    if (questionState.winnerPlayerId !== playerId) {
      throw new BadRequestException('Ce joueur n\'est pas le winner actuel');
    }

    if (isCorrect) {
      // ✅ Réponse correcte: +points, résoudre la question
      await this.prisma.$transaction([
        this.prisma.player.update({
          where: { id: playerId },
          data: {
            score: {
              increment: question.points,
            },
          },
        }),
        this.prisma.questionState.update({
          where: { id: questionState.id },
          data: {
            status: QuestionStateStatus.RESOLVED,
            resolvedAt: new Date(),
          },
        }),
      ]);

      return {
        success: true,
        isCorrect: true,
        points: question.points,
        status: QuestionStateStatus.RESOLVED,
      };
    } else {
      // ❌ Réponse fausse: bloquer le joueur, réouvrir le buzz
      await this.prisma.$transaction([
        // Ajouter le joueur aux bloqués
        this.prisma.questionState.update({
          where: { id: questionState.id },
          data: {
            lockedPlayers: {
              connect: { id: playerId },
            },
            status: QuestionStateStatus.OPEN, // Réouvrir
            winnerPlayerId: null,
          },
        }),
        // Si points négatifs activés
        ...(game.allowNegativePoints
          ? [
              this.prisma.player.update({
                where: { id: playerId },
                data: {
                  score: {
                    decrement: 1,
                  },
                },
              }),
            ]
          : []),
      ]);

      return {
        success: true,
        isCorrect: false,
        penalty: game.allowNegativePoints ? -1 : 0,
        status: QuestionStateStatus.OPEN,
      };
    }
  }

  /**
   * Passe à la question suivante
   */
  async nextQuestion(gameId: string, mcToken: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        questions: {
          orderBy: { index: 'asc' },
        },
      },
    });

    if (!game || game.mcToken !== mcToken) {
      throw new BadRequestException('Token MC invalide');
    }

    const nextIndex = game.currentQuestionIndex + 1;

    if (nextIndex >= game.questions.length) {
      throw new BadRequestException('Plus de questions disponibles');
    }

    await this.prisma.game.update({
      where: { id: gameId },
      data: { currentQuestionIndex: nextIndex },
    });

    return {
      success: true,
      currentQuestionIndex: nextIndex,
      question: game.questions[nextIndex],
    };
  }

  /**
   * Débloquer un joueur manuellement (MC action)
   */
  async unlockPlayer(gameId: string, questionId: string, playerId: string, mcToken: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game || game.mcToken !== mcToken) {
      throw new BadRequestException('Token MC invalide');
    }

    const questionState = await this.prisma.questionState.findUnique({
      where: {
        gameId_questionId: { gameId, questionId },
      },
    });

    if (!questionState) {
      throw new NotFoundException('État de question introuvable');
    }

    await this.prisma.questionState.update({
      where: { id: questionState.id },
      data: {
        lockedPlayers: {
          disconnect: { id: playerId },
        },
      },
    });

    return { success: true };
  }

  /**
   * Crée un événement de buzz (audit)
   */
  private async createBuzzEvent(
    gameId: string,
    questionId: string,
    playerId: string,
    clientTimestamp: Date,
    result: BuzzEventResult,
  ) {
    await this.prisma.buzzEvent.create({
      data: {
        gameId,
        questionId,
        playerId,
        clientTimestamp,
        result,
      },
    });
  }
}
