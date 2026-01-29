# QuizBuzzer Backend 🎯

Backend API pour QuizBuzzer - Application de quiz avec buzzer en temps réel.

## 🚀 Stack technique

- **Framework**: NestJS 10
- **Database**: PostgreSQL 16
- **ORM**: Prisma 5
- **WebSocket**: Socket.IO
- **Validation**: class-validator

---

## 📁 Architecture du projet

```
backend/
├── prisma/
│   └── schema.prisma          # Modèle de données (Game, Player, Question, etc.)
├── src/
│   ├── main.ts                # Point d'entrée (serveur NestJS + CORS)
│   ├── app.module.ts          # Module racine
│   ├── prisma/                # Module Prisma (DB service global)
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── common/                # Services partagés
│   │   └── code-generator.service.ts  # Génération codes partie + tokens
│   ├── game/                  # Module Game (parties)
│   │   ├── game.module.ts
│   │   ├── game.controller.ts # REST endpoints (/games)
│   │   ├── game.service.ts    # Logique métier
│   │   └── dto/
│   │       └── game.dto.ts    # Validation des inputs
│   ├── player/                # Module Player (joueurs)
│   │   ├── player.module.ts
│   │   ├── player.controller.ts # REST endpoints (/games/:code/players)
│   │   ├── player.service.ts
│   │   └── dto/
│   │       └── player.dto.ts
│   └── buzzer/                # Module Buzzer (WebSocket + logique temps réel)
│       ├── buzzer.module.ts
│       ├── buzzer.gateway.ts  # WebSocket Gateway (Socket.IO)
│       └── buzzer.service.ts  # Logique buzz avec verrous transactionnels
├── .env                       # Variables d'environnement
├── package.json
└── tsconfig.json
```

---

## ⚡ Démarrage rapide

### 1️⃣ Prérequis

- Node.js 20+
- Docker Desktop (pour PostgreSQL)
- npm ou pnpm

### 2️⃣ Installation

```bash
cd backend
npm install
```

### 3️⃣ Lancer la base de données

```bash
# Depuis la racine du projet (/quizBuzzer)
docker-compose up -d
```

**Ce que ça fait** :
- ✅ PostgreSQL sur `localhost:5432`
- ✅ pgAdmin sur `http://localhost:5050` (email: `admin@quizbuzzer.local`, password: `admin`)

### 4️⃣ Configuration

Le fichier `.env` est déjà créé avec :

```env
DATABASE_URL="postgresql://quizbuzzer:quizbuzzer@localhost:5432/quizbuzzer?schema=public"
PORT=3000
```

### 5️⃣ Migrations Prisma

```bash
# Générer le client Prisma
npm run prisma:generate

# Créer et appliquer les migrations
npm run prisma:migrate
```

### 6️⃣ Démarrer le serveur

```bash
npm run start:dev
```

✅ Serveur accessible sur **http://localhost:3000**

---

## 🧪 Tester l'API

### Créer une partie

```bash
curl -X POST http://localhost:3000/games \
  -H "Content-Type: application/json" \
  -d '{
    "allowNegativePoints": false,
    "questions": [
      {"text": "Quelle est la capitale de la France ?", "answer": "Paris", "points": 1}
    ]
  }'
```

**Réponse** :
```json
{
  "gameId": "uuid",
  "code": "AB12CD",
  "mcToken": "xxx",
  "questions": [...]
}
```

### Rejoindre en tant que joueur

```bash
curl -X POST http://localhost:3000/games/AB12CD/players/join \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}'
```

### Voir le scoreboard

```bash
curl http://localhost:3000/games/AB12CD/scoreboard
```

Ou directement dans le navigateur : **http://localhost:3000/games/AB12CD/scoreboard**

## ▶️ Lancer le serveur


---

## 📡 API REST Endpoints

### 🎮 Game (Parties)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| `POST` | `/games` | Créer une partie | - |
| `GET` | `/games/:code` | Infos partie (publique) | - |
| `GET` | `/games/:code/state?mcToken=xxx` | État complet | MC token |
| `PUT` | `/games/:code/questions?mcToken=xxx` | Modifier questions | MC token |
| `POST` | `/games/:code/start?mcToken=xxx` | Démarrer | MC token |
| `POST` | `/games/:code/finish?mcToken=xxx` | Terminer | MC token |
| `GET` | `/games/:code/scoreboard` | Classement | - |

### 👥 Player (Joueurs)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| `POST` | `/games/:code/players/join` | Rejoindre partie | - |
| `GET` | `/games/:code/players/me?token=xxx` | Infos joueur | Player token |

---

## 🔌 WebSocket Events (Socket.IO)

### Connexion

```typescript
socket.emit('auth:connect', {
  code: 'AB12CD',        // Code de la partie
  token: 'xxx',          // mcToken ou playerToken
  role: 'mc' | 'player' | 'screen'
});
```

### Events MC → Server

| Event | Data | Description |
|-------|------|-------------|
| `mc:open_buzz` | `{questionId}` | Ouvrir le buzz pour une question |
| `mc:judge_buzz` | `{questionId, playerId, isCorrect}` | Juger la réponse (✅ ou ❌) |
| `mc:next_question` | - | Passer à la question suivante |
| `mc:unlock_player` | `{questionId, playerId}` | Débloquer un joueur |

### Events Player → Server

| Event | Data | Description |
|-------|------|-------------|
| `player:buzz` | `{questionId, clientTimestamp}` | Buzzer sur une question |

### Events Server → Clients

| Event | Data | Description |
|-------|------|-------------|
| `game:state` | `{status, currentQuestion, players, ...}` | État complet du jeu |
| `question:opened` | `{questionId, timestamp}` | Buzz ouvert |
| `question:reopened` | `{questionId}` | Buzz réouvert (après mauvaise réponse) |
| `buzz:winner` | `{questionId, playerId, playerName}` | Premier buzz |
| `buzz:rejected` | `{questionId, reason}` | Buzz rejeté |
| `buzz:correct` | `{questionId, playerId, points}` | Réponse correcte ✅ |
| `buzz:wrong` | `{questionId, playerId, penalty}` | Réponse fausse ❌ |
| `player:locked` | `{questionId, playerId}` | Joueur bloqué pour cette question |
| `player:unlocked` | `{questionId, playerId}` | Joueur débloqué |
| `scoreboard:updated` | `{players: [...]}` | Scores mis à jour |
| `game:paused` | `{reason}` | Jeu en pause (MC déconnecté) |
| `player:connected` | `{playerId, playerName}` | Joueur connecté |
| `player:disconnected` | `{playerId}` | Joueur déconnecté |

---

## 🛡️ Protections implémentées

### 🔒 Race conditions sur les buzz
```sql
UPDATE "QuestionState"
SET status = 'LOCKED', "winnerPlayerId" = $playerId
WHERE id = $questionStateId
  AND status = 'OPEN'  -- ⚡ Condition atomique
```
- Seul le **premier buzz** qui arrive verrouille la question
- Tous les buzz suivants reçoivent `TOO_LATE`
- Arbitrage serveur par `serverTimestamp` (autoritaire)

### ✅ Validation serveur
- Vérification tokens (MC / joueurs) sur chaque action
- Impossible de buzzer si joueur déjà bloqué
- Impossible de buzzer si question pas `OPEN`
- Transactions atomiques pour score + état

### Gestion déconnexions
- Si MC déconnecte → game en `PAUSED`
- Si joueur déconnecte → `isConnected: false`

## 📊 Modèle de données


---

## 📊 Modèle de données (Prisma)

```prisma
Game (Partie)
├── id: UUID
├── code: String (unique, ex: "AB12CD")
├── status: LOBBY | RUNNING | PAUSED | FINISHED
├── mcToken: String (auth MC)
├── allowNegativePoints: Boolean
├── currentQuestionIndex: Int
└── Relations: players[], questions[], questionStates[]

Player (Joueur)
├── id: UUID
├── gameId: FK → Game
├── name: String
├── score: Int
├── token: String (unique, auth joueur)
└── isConnected: Boolean

Question
├── id: UUID
├── gameId: FK → Game
├── index: Int (ordre dans le quiz)
├── text: String
├── answer: String? (réponse officielle)
├── points: Int
└── timeLimit: Int? (secondes)

QuestionState (État runtime)
├── id: UUID
├── gameId + questionId: Composite unique
├── status: IDLE | OPEN | LOCKED | RESOLVED
├── winnerPlayerId: FK → Player?
├── lockedPlayers: Player[] (many-to-many)
└── Timestamps: openedAt, lockedAt, resolvedAt

BuzzEvent (Audit trail)
├── id: UUID
├── gameId, questionId, playerId
├── clientTimestamp: DateTime (client)
├── serverTimestamp: DateTime (autoritaire)
└── result: WINNER | TOO_LATE | REJECTED_LOCKED | REJECTED_NOT_OPEN
```

---

## 🛠️ Commandes utiles

```bash
# Développement
npm run start:dev          # Serveur avec hot-reload

# Prisma
npm run prisma:generate    # Générer client Prisma
npm run prisma:migrate     # Créer/appliquer migrations
npm run prisma:studio      # Interface DB visuelle

# Build & Production
npm run build              # Compiler TypeScript
npm run start:prod         # Lancer en prod

# Tests & Quality
npm run test               # Tests unitaires
npm run lint               # ESLint
npm run format             # Prettier
```

---

## 🐛 Debug & Monitoring

### Prisma Studio
Interface visuelle pour explorer la DB :
```bash
npm run prisma:studio
# → http://localhost:5555
```

### Logs détaillés
Les logs sont affichés dans la console :
- ✅ Connexions WebSocket
- ✅ Buzz reçus/rejetés
- ✅ Erreurs

### Audit des buzz
Tous les buzz sont enregistrés dans `BuzzEvent` :
```sql
SELECT * FROM "BuzzEvent" 
WHERE "gameId" = 'xxx' 
ORDER BY "serverTimestamp" DESC;
```

---

## 📝 TODO / Améliorations futures

- [ ] Job de cleanup (supprimer parties > 24h)
- [ ] Rate limiting sur les buzz (anti-spam)
- [ ] Timeout automatique des questions
- [ ] Export des résultats (CSV/JSON)
- [ ] Replay des parties (depuis BuzzEvent)
- [ ] Statistiques par joueur

---

## 🔒 Sécurité

- ✅ Tokens générés avec `nanoid` (32 caractères)
- ✅ Validation des inputs avec `class-validator`
- ✅ Transactions atomiques pour opérations critiques
- ✅ CORS configuré pour frontend local
- ✅ Tokens en query params (pas idéal mais OK pour local)
- ⚠️ **Pour production** : ajouter JWT + HTTPS + rate limiting

---

## 📞 Support

Besoin d'aide ? Vérifier :
1. PostgreSQL est bien lancé : `docker ps`
2. Migrations appliquées : `npm run prisma:migrate`
3. Logs serveur : dans le terminal `npm run start:dev`
4. Prisma Studio : `npm run prisma:studio` pour voir la DB
