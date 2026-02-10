import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  ListEmployeesInput,
} from '@pawly/validators';

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clinicId: string, filters?: ListEmployeesInput) {
    return this.prisma.employee.findMany({
      where: {
        clinicId,
        ...(filters?.includeInactive ? {} : { isActive: true }),
        ...(filters?.jobType ? { jobType: filters.jobType } : {}),
        ...(filters?.search
          ? {
              OR: [
                { firstName: { contains: filters.search, mode: 'insensitive' as const } },
                { lastName: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { lastName: 'asc' },
    });
  }

  async findById(clinicId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, clinicId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }

    return employee;
  }

  async create(clinicId: string, data: CreateEmployeeInput) {
    return this.prisma.employee.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        jobType: data.jobType,
        contractType: data.contractType,
        contractHours: data.contractHours,
        color: data.color,
        hireDate: data.hireDate ? new Date(data.hireDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        clinicId,
      },
    });
  }

  async update(clinicId: string, data: UpdateEmployeeInput) {
    const { id, ...updateData } = data;

    // Verify employee belongs to clinic
    await this.findById(clinicId, id);

    return this.prisma.employee.update({
      where: { id },
      data: {
        ...(updateData.firstName !== undefined && { firstName: updateData.firstName }),
        ...(updateData.lastName !== undefined && { lastName: updateData.lastName }),
        ...(updateData.email !== undefined && { email: updateData.email || null }),
        ...(updateData.phone !== undefined && { phone: updateData.phone || null }),
        ...(updateData.jobType !== undefined && { jobType: updateData.jobType }),
        ...(updateData.contractType !== undefined && { contractType: updateData.contractType }),
        ...(updateData.contractHours !== undefined && { contractHours: updateData.contractHours }),
        ...(updateData.color !== undefined && { color: updateData.color }),
        ...(updateData.hireDate !== undefined && {
          hireDate: updateData.hireDate ? new Date(updateData.hireDate) : null,
        }),
        ...(updateData.endDate !== undefined && {
          endDate: updateData.endDate ? new Date(updateData.endDate) : null,
        }),
      },
    });
  }

  async toggleActive(clinicId: string, id: string) {
    const employee = await this.findById(clinicId, id);

    return this.prisma.employee.update({
      where: { id },
      data: { isActive: !employee.isActive },
    });
  }
}
