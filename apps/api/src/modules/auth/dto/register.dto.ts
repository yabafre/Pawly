import { IsEmail, IsNotEmpty, IsEnum, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum JobType {
  VET = 'VET',
  ASV = 'ASV',
  APPRENTICE = 'APPRENTICE',
}

export class RegisterDto {
    @ApiProperty()
    @IsEmail()
    email!: string;

    @ApiProperty({ description: 'Password must be 8+ chars with uppercase, lowercase, and numbers (NFR7)' })
    @IsNotEmpty()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    })
    password!: string;

    @ApiProperty()
    @IsNotEmpty()
    firstName!: string;

    @ApiProperty()
    @IsNotEmpty()
    lastName!: string;

    @ApiProperty({ enum: JobType })
    @IsEnum(JobType)
    jobType!: JobType;
}
