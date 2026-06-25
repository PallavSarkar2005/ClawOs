-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultProvider" TEXT NOT NULL DEFAULT 'openrouter',
    "autoMemorySave" BOOLEAN NOT NULL DEFAULT true,
    "autoSkillRouting" BOOLEAN NOT NULL DEFAULT true,
    "webSearchDefault" BOOLEAN NOT NULL DEFAULT false,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxContext" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Setting_userId_key" ON "Setting"("userId");

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
