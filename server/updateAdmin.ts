import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Update BOTH possible email spellings to ADMIN
  const emails = ['trishalhedge@gmail.com', 'trishalhegde@gmail.com'];
  
  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.user.update({
        where: { email },
        data: { role: 'ADMIN' }
      });
      console.log(`Updated ${email} to ADMIN`);
    } else {
      console.log(`User ${email} not found, creating as ADMIN...`);
      await prisma.user.create({
        data: { email, name: 'Trishal Hegde', googleId: `manual_${email}`, role: 'ADMIN' }
      });
      console.log(`Created ${email} as ADMIN`);
    }
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
