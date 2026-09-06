-- CreateTable
CREATE TABLE "GoogleAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "scopes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IngestBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "accountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IngestBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GoogleAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT,
    "kind" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "proxyPath" TEXT,
    "thumbPath" TEXT,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "orientation" TEXT NOT NULL,
    "durationSec" REAL,
    "fps" REAL,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" DATETIME,
    "exifJson" TEXT,
    "dominantColorsJson" TEXT,
    "description" TEXT,
    "peopleCount" INTEGER,
    "focalPointX" REAL,
    "focalPointY" REAL,
    "analysisModel" TEXT,
    "analyzedAt" DATETIME,
    "consentCleared" BOOLEAN NOT NULL DEFAULT false,
    "hasIndianFlag" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AssetTag" (
    "assetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "confidence" REAL,
    "source" TEXT NOT NULL DEFAULT 'ai',

    PRIMARY KEY ("assetId", "tagId"),
    CONSTRAINT "AssetTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "colorsJson" TEXT NOT NULL,
    "fontsJson" TEXT NOT NULL,
    "logoPath" TEXT,
    "logoMarkPath" TEXT,
    "handle" TEXT NOT NULL DEFAULT '@neerav_arts_village',
    "website" TEXT NOT NULL DEFAULT 'www.neeravartsvillage.com',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MusicTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "durationSec" REAL NOT NULL,
    "bpm" INTEGER,
    "mood" TEXT,
    "license" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "targetsJson" TEXT NOT NULL,
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "voiceId" TEXT,
    "consentFilter" BOOLEAN NOT NULL DEFAULT true,
    "brandKitId" TEXT,
    "musicTrackId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_musicTrackId_fkey" FOREIGN KEY ("musicTrackId") REFERENCES "MusicTrack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Edl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetSeconds" REAL NOT NULL,
    "actualSeconds" REAL NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Edl_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "edlId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startSec" REAL NOT NULL,
    "endSec" REAL NOT NULL,
    "assetId" TEXT NOT NULL,
    "motion" TEXT NOT NULL,
    "trimStartSec" REAL,
    "trimEndSec" REAL,
    "captionText" TEXT,
    "voiceoverText" TEXT,
    "cropJson" TEXT,
    "regenCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Segment_edlId_fkey" FOREIGN KEY ("edlId") REFERENCES "Edl" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Segment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaptionWord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "segmentId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "startSec" REAL NOT NULL,
    "endSec" REAL NOT NULL,
    CONSTRAINT "CaptionWord_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "target" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "error" TEXT,
    "queueJobId" TEXT,
    "costCents" INTEGER,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "progress" INTEGER,
    "message" TEXT NOT NULL,
    "dataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Render" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "edlId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "durationSec" REAL NOT NULL,
    "videoPath" TEXT NOT NULL,
    "srtPath" TEXT,
    "vttPath" TEXT,
    "thumbPath" TEXT,
    "voicePath" TEXT,
    "bytes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Render_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Render_edlId_fkey" FOREIGN KEY ("edlId") REFERENCES "Edl" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAccount_email_key" ON "GoogleAccount"("email");

-- CreateIndex
CREATE INDEX "IngestBatch_status_idx" ON "IngestBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storagePath_key" ON "Asset"("storagePath");

-- CreateIndex
CREATE INDEX "Asset_kind_consentCleared_idx" ON "Asset"("kind", "consentCleared");

-- CreateIndex
CREATE INDEX "Asset_capturedAt_idx" ON "Asset"("capturedAt");

-- CreateIndex
CREATE INDEX "Asset_checksum_idx" ON "Asset"("checksum");

-- CreateIndex
CREATE INDEX "Asset_batchId_idx" ON "Asset"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "AssetTag_tagId_idx" ON "AssetTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_name_key" ON "BrandKit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MusicTrack_path_key" ON "MusicTrack"("path");

-- CreateIndex
CREATE UNIQUE INDEX "Edl_projectId_target_version_key" ON "Edl"("projectId", "target", "version");

-- CreateIndex
CREATE INDEX "Segment_assetId_idx" ON "Segment"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_edlId_index_key" ON "Segment"("edlId", "index");

-- CreateIndex
CREATE INDEX "CaptionWord_segmentId_startSec_idx" ON "CaptionWord"("segmentId", "startSec");

-- CreateIndex
CREATE INDEX "Job_status_type_idx" ON "Job"("status", "type");

-- CreateIndex
CREATE INDEX "Job_projectId_idx" ON "Job"("projectId");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_createdAt_idx" ON "JobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "Render_edlId_idx" ON "Render"("edlId");

-- CreateIndex
CREATE INDEX "Render_jobId_idx" ON "Render"("jobId");
