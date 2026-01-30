import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validation globale des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS pour permettre le frontend local et réseau
  app.enableCors({
    origin: true, // Accepte toutes les origines (pratique pour développement)
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0'); // Écoute sur toutes les interfaces réseau
  console.log(`🚀 QuizBuzzer Backend running on http://localhost:${port}`);
  console.log(`🌐 Accessible depuis le réseau sur http://192.168.115.112:${port}`);
}
bootstrap();
