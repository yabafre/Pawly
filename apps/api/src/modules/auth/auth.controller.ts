import { Controller, Post, Body, UseGuards, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ValidateMagicLinkDto } from './dto/validate-magic-link.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthResponseDto, MagicLinkResponseDto, UserProfileDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from '@/common/guards';
import { Public, CurrentUser } from '@/common/decorators';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('login')
    @ApiOperation({ summary: 'Login with email and password (Admin hybrid mode)' })
    @ApiResponse({ status: 200, description: 'JWT tokens returned', type: AuthResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid request body' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 429, description: 'Too many requests' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Public()
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @Post('magic-link/request')
    @ApiOperation({ summary: 'Request a magic link for passwordless login' })
    @ApiResponse({ status: 200, description: 'Magic link sent (if account exists)', type: MagicLinkResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid request body' })
    @ApiResponse({ status: 429, description: 'Too many requests' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    async requestMagicLink(@Body() requestMagicLinkDto: RequestMagicLinkDto) {
        return this.authService.requestMagicLink(requestMagicLinkDto.email);
    }

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Get('magic-link/callback')
    @ApiOperation({ summary: 'Validate a magic link token' })
    @ApiResponse({ status: 200, description: 'JWT tokens returned', type: AuthResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid token format' })
    @ApiResponse({ status: 401, description: 'Invalid or expired magic link' })
    @ApiResponse({ status: 429, description: 'Too many requests' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    async validateMagicLink(@Query() query: ValidateMagicLinkDto) {
        return this.authService.validateMagicLink(query.token);
    }

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('refresh')
    @ApiOperation({ summary: 'Refresh access token using refresh token' })
    @ApiResponse({ status: 200, description: 'New JWT tokens returned', type: AuthResponseDto })
    @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
    @ApiResponse({ status: 429, description: 'Too many requests' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
        return this.authService.refreshToken(refreshTokenDto.refresh_token);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('JWT-auth')
    @Get('profile')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'User profile returned', type: UserProfileDto })
    @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    getProfile(@CurrentUser() user: any) {
        return user;
    }
}
