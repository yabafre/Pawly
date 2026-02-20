import { IsString, IsNotEmpty, Matches, MinLength, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivateAccountDto {
    @ApiProperty({ description: 'Activation token (64-char hex string)' })
    @IsString()
    @IsNotEmpty()
    @Length(64, 64, { message: 'Token must be exactly 64 characters' })
    @Matches(/^[a-f0-9]{64}$/, { message: 'Token must be a valid hex string' })
    token!: string;

    @ApiProperty({ description: 'Admin password (min 8 chars, mixed case, numbers)' })
    @IsString()
    @IsNotEmpty()
    @MinLength(8, { message: 'Password must be at least 8 characters' })
    @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
    @Matches(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
    @Matches(/[0-9]/, { message: 'Password must contain at least one number' })
    password!: string;
}
