import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    email!: string;

    @ApiProperty()
    role!: string;

    @ApiProperty()
    clinicId!: string;
}

export class AuthResponseDto {
    @ApiProperty({ description: 'JWT access token (24h expiry)' })
    access_token!: string;

    @ApiProperty({ description: 'JWT refresh token (7d expiry)' })
    refresh_token!: string;

    @ApiProperty({ type: UserProfileDto })
    user!: UserProfileDto;
}

export class MagicLinkResponseDto {
    @ApiProperty({ example: 'If an account exists, a magic link has been sent' })
    message!: string;
}
