import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const admins = [
    { email: 'trishalhedge@gmail.com', name: 'Trishal Hegde' },
    { email: 'trishalhegde@gmail.com', name: 'Trishal Hegde' },
    { email: 'yuvarajkhot2005@gmail.com', name: 'Yuvaraj Khot' }
  ];
  
  for (const admin of admins) {
    const user = await prisma.user.findUnique({ where: { email: admin.email } });
    if (user) {
      await prisma.user.update({
        where: { email: admin.email },
        data: { role: 'ADMIN' }
      });
      console.log(`Updated ${admin.email} to ADMIN`);
    } else {
      console.log(`User ${admin.email} not found, creating as ADMIN...`);
      await prisma.user.create({
        data: { 
          email: admin.email, 
          name: admin.name, 
          googleId: `manual_${admin.email}`, 
          role: 'ADMIN' 
        }
      });
      console.log(`Created ${admin.email} as ADMIN`);
    }
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
