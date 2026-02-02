import { IsEmail, IsNotEmpty, IsEnum } from 'class-validator';
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

    @ApiProperty()
    @IsNotEmpty()
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
