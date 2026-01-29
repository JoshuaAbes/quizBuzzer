import { IsString, MinLength, MaxLength } from 'class-validator';

export class JoinGameDto {
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  @MaxLength(30, { message: 'Le nom ne peut pas dépasser 30 caractères' })
  name: string;
}
