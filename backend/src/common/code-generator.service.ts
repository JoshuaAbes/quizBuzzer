import { Injectable } from '@nestjs/common';
import { customAlphabet } from 'nanoid';

@Injectable()
export class CodeGeneratorService {
  private readonly nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

  /**
   * Génère un code de partie unique (ex: "AB12CD")
   */
  generateGameCode(): string {
    return this.nanoid();
  }

  /**
   * Génère un token sécurisé (UUID-like)
   */
  generateToken(): string {
    const tokenGenerator = customAlphabet(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      32,
    );
    return tokenGenerator();
  }
}
