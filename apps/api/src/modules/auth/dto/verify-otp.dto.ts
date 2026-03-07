import { IsEmail, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '428715', description: '6-digit OTP code' })
  @Matches(/^\d{6}$/)
  @Length(6, 6)
  code: string;
}
