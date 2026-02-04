import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
    @ApiProperty({ description: 'Refresh token from login or magic link response' })
    @IsString()
    @IsNotEmpty()
    refresh_token!: string;
}
