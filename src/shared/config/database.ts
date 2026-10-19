import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { configureDatabaseUrl } from "./database-url.js";

process.env.DATABASE_URL = configureDatabaseUrl();

export const prisma = new PrismaClient();

export async function connectToMongoDB(): Promise<void> {
  await prisma.$connect();
  console.log("Conectado ao MongoDB Atlas.");
}

export async function disconnectFromMongoDB(): Promise<void> {
  await prisma.$disconnect();
}