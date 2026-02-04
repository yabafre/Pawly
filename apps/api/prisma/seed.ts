import { PrismaClient, Role, JobType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SEED = {
  clinicId: '00000000-0000-4000-8000-000000000001',
  adminEmail: 'admin@pawly.local',
  adminPassword: 'Admin123!',
  employeeEmail: 'employee@pawly.local',
  employeeFirstName: 'Camille',
  employeeLastName: 'Martin',
  employeeJobType: JobType.ASV,
};

async function main() {
  const {
    clinicId,
    adminEmail,
    adminPassword,
    employeeEmail,
    employeeFirstName,
    employeeLastName,
    employeeJobType,
  } = SEED;
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.ADMIN,
      clinicId,
      password: adminPasswordHash,
    },
    create: {
      email: adminEmail,
      role: Role.ADMIN,
      clinicId,
      password: adminPasswordHash,
    },
  });

  const employeeUser = await prisma.user.upsert({
    where: { email: employeeEmail },
    update: {
      role: Role.EMPLOYEE,
      clinicId,
      password: null,
    },
    create: {
      email: employeeEmail,
      role: Role.EMPLOYEE,
      clinicId,
    },
  });

  await prisma.employee.upsert({
    where: { userId: employeeUser.id },
    update: {
      firstName: employeeFirstName,
      lastName: employeeLastName,
      jobType: employeeJobType,
      clinicId,
    },
    create: {
      firstName: employeeFirstName,
      lastName: employeeLastName,
      jobType: employeeJobType,
      clinicId,
      userId: employeeUser.id,
    },
  });

  console.log('Seed complete:', {
    clinicId,
    adminEmail: admin.email,
    employeeEmail: employeeUser.email,
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
