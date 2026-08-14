import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = 'yuvarajkhot2005@gmail.com'`
    );
    console.log('Confirmed admin user successfully! Rows affected:', result);
  } catch (error) {
    console.error('Failed to confirm user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
