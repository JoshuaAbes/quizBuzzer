-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('LOBBY', 'RUNNING', 'PAUSED', 'FINISHED');

-- CreateEnum
CREATE TYPE "QuestionStateStatus" AS ENUM ('IDLE', 'OPEN', 'LOCKED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BuzzEventResult" AS ENUM ('WINNER', 'TOO_LATE', 'REJECTED_LOCKED', 'REJECTED_NOT_OPEN');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'LOBBY',
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "mcToken" TEXT NOT NULL,
    "allowNegativePoints" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "answer" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "timeLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionState" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "status" "QuestionStateStatus" NOT NULL DEFAULT 'IDLE',
    "winnerPlayerId" TEXT,
    "openedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuzzEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "clientTimestamp" TIMESTAMP(3) NOT NULL,
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "BuzzEventResult" NOT NULL,

    CONSTRAINT "BuzzEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LockedPlayers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_code_key" ON "Game"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Game_mcToken_key" ON "Game"("mcToken");

-- CreateIndex
CREATE INDEX "Game_code_idx" ON "Game"("code");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Player_token_key" ON "Player"("token");

-- CreateIndex
CREATE INDEX "Player_gameId_idx" ON "Player"("gameId");

-- CreateIndex
CREATE INDEX "Player_token_idx" ON "Player"("token");

-- CreateIndex
CREATE INDEX "Question_gameId_idx" ON "Question"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_gameId_index_key" ON "Question"("gameId", "index");

-- CreateIndex
CREATE INDEX "QuestionState_gameId_idx" ON "QuestionState"("gameId");

-- CreateIndex
CREATE INDEX "QuestionState_questionId_idx" ON "QuestionState"("questionId");

-- CreateIndex
CREATE INDEX "QuestionState_status_idx" ON "QuestionState"("status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionState_gameId_questionId_key" ON "QuestionState"("gameId", "questionId");

-- CreateIndex
CREATE INDEX "BuzzEvent_gameId_questionId_idx" ON "BuzzEvent"("gameId", "questionId");

-- CreateIndex
CREATE INDEX "BuzzEvent_serverTimestamp_idx" ON "BuzzEvent"("serverTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "_LockedPlayers_AB_unique" ON "_LockedPlayers"("A", "B");

-- CreateIndex
CREATE INDEX "_LockedPlayers_B_index" ON "_LockedPlayers"("B");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionState" ADD CONSTRAINT "QuestionState_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionState" ADD CONSTRAINT "QuestionState_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionState" ADD CONSTRAINT "QuestionState_winnerPlayerId_fkey" FOREIGN KEY ("winnerPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuzzEvent" ADD CONSTRAINT "BuzzEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuzzEvent" ADD CONSTRAINT "BuzzEvent_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuzzEvent" ADD CONSTRAINT "BuzzEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LockedPlayers" ADD CONSTRAINT "_LockedPlayers_A_fkey" FOREIGN KEY ("A") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LockedPlayers" ADD CONSTRAINT "_LockedPlayers_B_fkey" FOREIGN KEY ("B") REFERENCES "QuestionState"("id") ON DELETE CASCADE ON UPDATE CASCADE;
