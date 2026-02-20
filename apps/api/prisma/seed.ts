import { PrismaClient, Role, JobType, SubscriptionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SEED = {
  clinicName: 'Clinique Zen Dev',
  clinicSlug: 'clinique-zen-dev',
  adminEmail: 'admin@pawly.local',
  adminPassword: 'Admin123!',
  employeeEmail: 'employee@pawly.local',
  employeeFirstName: 'Camille',
  employeeLastName: 'Martin',
  employeeJobType: JobType.ASV,
};

async function main() {
  const {
    clinicName,
    clinicSlug,
    adminEmail,
    adminPassword,
    employeeEmail,
    employeeFirstName,
    employeeLastName,
    employeeJobType,
  } = SEED;

  // 1. Create Clinic first (FK parent for all other records)
  const clinic = await prisma.clinic.upsert({
    where: { slug: clinicSlug },
    update: {
      name: clinicName,
      onboardingCompleted: true,
    },
    create: {
      name: clinicName,
      slug: clinicSlug,
      onboardingCompleted: true,
    },
  });

  // 2. Create Subscription for dev testing
  await prisma.subscription.upsert({
    where: { clinicId: clinic.id },
    update: {
      status: SubscriptionStatus.active,
      planKey: 'starter',
      entitlementTier: 'starter',
    },
    create: {
      clinicId: clinic.id,
      stripeCustomerId: 'cus_dev_seed_000001',
      stripeSubscriptionId: 'sub_dev_seed_000001',
      status: SubscriptionStatus.active,
      planKey: 'starter',
      entitlementTier: 'starter',
    },
  });

  // 3. Create Users linked to Clinic via FK
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.ADMIN,
      clinicId: clinic.id,
      password: adminPasswordHash,
    },
    create: {
      email: adminEmail,
      role: Role.ADMIN,
      clinicId: clinic.id,
      password: adminPasswordHash,
    },
  });

  const employeeUser = await prisma.user.upsert({
    where: { email: employeeEmail },
    update: {
      role: Role.EMPLOYEE,
      clinicId: clinic.id,
      password: null,
    },
    create: {
      email: employeeEmail,
      role: Role.EMPLOYEE,
      clinicId: clinic.id,
    },
  });

  // 4. Create Employee linked to Clinic via FK
  await prisma.employee.upsert({
    where: { userId: employeeUser.id },
    update: {
      firstName: employeeFirstName,
      lastName: employeeLastName,
      jobType: employeeJobType,
      clinicId: clinic.id,
    },
    create: {
      firstName: employeeFirstName,
      lastName: employeeLastName,
      jobType: employeeJobType,
      clinicId: clinic.id,
      userId: employeeUser.id,
    },
  });

  console.log('Seed complete:', {
    clinicId: clinic.id,
    clinicName: clinic.name,
    clinicSlug: clinic.slug,
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
