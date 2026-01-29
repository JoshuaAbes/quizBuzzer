# QuizBuzzer Backend 🎯

Backend API pour QuizBuzzer - Application de quiz avec buzzer en temps réel.

## 🚀 Stack technique

- **Framework**: NestJS 10
- **Database**: PostgreSQL 16
- **ORM**: Prisma 5
- **WebSocket**: Socket.IO
- **Validation**: class-validator

## 📦 Installation

```bash
cd backend
npm install
```

## 🐳 Lancer la base de données

```bash
# Depuis la racine du projet
docker-compose up -d
```

Ceci démarre :
- PostgreSQL sur `localhost:5432`
- pgAdmin sur `http://localhost:5050` (email: `admin@quizbuzzer.local`, password: `admin`)

## 🔧 Configuration

Copier `.env.example` vers `.env` (déjà fait) :

```bash
DATABASE_URL="postgresql://quizbuzzer:quizbuzzer@localhost:5432/quizbuzzer?schema=public"
PORT=3000
```

## 🗄️ Migrations Prisma

```bash
# Générer le client Prisma
npm run prisma:generate

# Créer et appliquer les migrations
npm run prisma:migrate

# Ouvrir Prisma Studio (interface DB)
npm run prisma:studio
```

## ▶️ Lancer le serveur

```bash
# Mode développement (avec hot-reload)
npm run start:dev

# Mode production
npm run build
npm run start:prod
```

Le serveur démarre sur `http://localhost:3000`

## 📡 API Endpoints

### Game (Partie)

- `POST /games` - Créer une partie
- `GET /games/:code` - Récupérer infos partie
- `GET /games/:code/state?mcToken=xxx` - État complet (MC)
- `PUT /games/:code/questions?mcToken=xxx` - Modifier questions
- `POST /games/:code/start?mcToken=xxx` - Démarrer
- `POST /games/:code/finish?mcToken=xxx` - Terminer
- `GET /games/:code/scoreboard` - Classement

### Player (Joueurs)

- `POST /games/:code/players/join` - Rejoindre partie
- `GET /games/:code/players/me?token=xxx` - Infos joueur

## 🔌 WebSocket Events

### Connexion

```typescript
socket.emit('auth:connect', {
  code: 'AB12CD',
  token: 'xxx',
  role: 'mc' | 'player' | 'screen'
});
```

### Events MC → Server

- `mc:open_buzz` - Ouvrir le buzz
- `mc:judge_buzz` - Juger réponse (correct/faux)
- `mc:next_question` - Question suivante
- `mc:unlock_player` - Débloquer joueur

### Events Player → Server

- `player:buzz` - Buzzer

### Events Server → Clients

- `game:state` - État complet du jeu
- `question:opened` - Buzz ouvert
- `question:reopened` - Buzz réouvert (après fausse réponse)
- `buzz:winner` - Premier buzz
- `buzz:rejected` - Buzz rejeté
- `buzz:correct` - Réponse correcte
- `buzz:wrong` - Réponse fausse
- `player:locked` - Joueur bloqué
- `player:unlocked` - Joueur débloqué
- `scoreboard:updated` - Scores mis à jour
- `game:paused` - Jeu en pause (MC déco)

## 🛡️ Protections implémentées

### Race conditions sur les buzz
- **UPDATE conditionnel atomique** : seul le premier buzz qui arrive verrouille la question
- Tous les buzz suivants reçoivent `TOO_LATE`

### Validation serveur
- Vérification des tokens (MC / joueurs)
- Impossible de buzzer si bloqué
- Impossible de buzzer si question pas ouverte

### Gestion déconnexions
- Si MC déconnecte → game en `PAUSED`
- Si joueur déconnecte → `isConnected: false`

## 📊 Modèle de données

```
Game (Partie)
├── code: string (unique, ex: "AB12CD")
├── status: LOBBY | RUNNING | PAUSED | FINISHED
├── mcToken: string
├── allowNegativePoints: boolean
└── currentQuestionIndex: int

Player (Joueur)
├── gameId
├── name
├── score
├── token: string
└── isConnected: boolean

Question
├── gameId
├── index: int
├── text: string
├── answer?: string
├── points: int
└── timeLimit?: int

QuestionState (État runtime)
├── gameId + questionId
├── status: IDLE | OPEN | LOCKED | RESOLVED
├── winnerPlayerId?
└── lockedPlayers: Player[]

BuzzEvent (Audit)
├── gameId + questionId + playerId
├── clientTimestamp
├── serverTimestamp (autoritaire)
└── result: WINNER | TOO_LATE | REJECTED_*
```

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

Réponse :
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

## 🐛 Debug

- Logs détaillés dans la console
- Prisma Studio : `npm run prisma:studio`
- Tous les buzz sont enregistrés dans `BuzzEvent` (audit)

## 📝 TODO

- [ ] Job de cleanup (supprimer parties > 24h)
- [ ] Rate limiting sur les buzz
- [ ] Timeout automatique des questions
- [ ] Export des résultats (CSV/JSON)

## 🔒 Sécurité

- Tokens générés avec `nanoid` (32 caractères)
- Validation des inputs avec `class-validator`
- Transactions atomiques pour les opérations critiques
- CORS configuré pour le frontend local
