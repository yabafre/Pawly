import { IsNotEmpty, IsString, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateMagicLinkDto {
    @ApiProperty({ description: 'Magic link token (64-char hex string)' })
    @IsString()
    @IsNotEmpty()
    @Length(64, 64, { message: 'Token must be exactly 64 characters' })
    @Matches(/^[a-f0-9]{64}$/, { message: 'Token must be a valid hex string' })
    token!: string;
}
