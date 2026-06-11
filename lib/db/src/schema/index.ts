import { pgTable, text, serial, integer, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const statusEnum = pgEnum("status", ["pending", "running", "completed", "failed"]);
export const levelEnum = pgEnum("level", ["info", "success", "warning", "error"]);

export const exportJobs = pgTable("export_jobs", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email"),
  courseId: text("course_id").notNull(),
  courseName: text("course_name").notNull(),
  targetFolderId: text("target_folder_id"),
  status: statusEnum("status").notNull().default("pending"),
  totalFiles: integer("total_files").notNull().default(0),
  copiedFiles: integer("copied_files").notNull().default(0),
  skippedFiles: integer("skipped_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("user_email_idx").on(t.userEmail),
  index("status_idx").on(t.status),
  index("created_at_idx").on(t.createdAt),
  index("course_id_idx").on(t.courseId),
]);

export const insertExportJobSchema = createInsertSchema(exportJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExportJob = z.infer<typeof insertExportJobSchema>;
export type ExportJob = typeof exportJobs.$inferSelect;

export const exportLogs = pgTable("export_logs", {
  id: serial("id").primaryKey(),
  exportId: integer("export_id").notNull().references(() => exportJobs.id, { onDelete: "cascade" }),
  level: levelEnum("level").notNull().default("info"),
  message: text("message").notNull(),
  fileId: text("file_id"),
  fileName: text("file_name"),
  sourceName: text("source_name"),
  copiedFileId: text("copied_file_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("export_id_idx").on(t.exportId),
]);

export const insertExportLogSchema = createInsertSchema(exportLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertExportLog = z.infer<typeof insertExportLogSchema>;
export type ExportLog = typeof exportLogs.$inferSelect;
