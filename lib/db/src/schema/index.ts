import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const exportJobs = pgTable("export_jobs", {
  id: serial("id").primaryKey(),
  courseId: text("course_id").notNull(),
  courseName: text("course_name").notNull(),
  targetFolderId: text("target_folder_id"),
  status: text("status").notNull().default("pending"),
  totalFiles: integer("total_files"),
  copiedFiles: integer("copied_files"),
  skippedFiles: integer("skipped_files"),
  failedFiles: integer("failed_files"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertExportJobSchema = createInsertSchema(exportJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExportJob = z.infer<typeof insertExportJobSchema>;
export type ExportJob = typeof exportJobs.$inferSelect;

export const exportLogs = pgTable("export_logs", {
  id: serial("id").primaryKey(),
  exportId: integer("export_id").notNull().references(() => exportJobs.id),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  fileId: text("file_id"),
  fileName: text("file_name"),
  sourceName: text("source_name"),
  copiedFileId: text("copied_file_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertExportLogSchema = createInsertSchema(exportLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertExportLog = z.infer<typeof insertExportLogSchema>;
export type ExportLog = typeof exportLogs.$inferSelect;
