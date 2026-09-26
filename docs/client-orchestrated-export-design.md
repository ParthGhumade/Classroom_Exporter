# Client-Orchestrated Export & ZIP Generation Architecture

## Overview
This document specifies how **Option 1 (Client-Driven / Serverless)** handles file downloads and exports.

In **Option 1**, the user can:
1. **☁️ Export to Google Drive** — Creates a new folder in Google Drive (`Classroom Export — <Course>`) and copies all files directly.
2. **📦 Download as a single ZIP archive** — Streams all course files directly into a single `.zip` file (e.g., `CS101_Introduction_to_Computer_Science.zip`) downloaded to their computer.

The critical advantage is that **no 512MB Render server sits in the middle** to crash on large files or get cut off by 60-second gateway timeouts.

---

## How ZIP Generation Works (Browser-Side Streaming)

### Problem on Render (Server-Side ZIP)
```
[Google Drive] ──(Downloads into RAM)──► [512MB Render Server] ──(Pipes through Proxy)──► [Browser]
                                                  ▲                           ▲
                                         OOM Crash on >200MB         504 Gateway Timeout
                                         (Kills all users)           at 60-100 seconds
```

### Option 1 Solution (Direct Streaming ZIP)
```
                                     ┌──► [Google Classroom API] (Lists materials)
                                     │
[Browser (React App on Vercel)] ─────┼──► [Google Drive API]     (Fetches file streams with CORS)
                                     │
                                     └──► [In-Browser ZIP Streamer (`client-zip`)]
                                                    │
                                                    ▼
                                     [Saves Single Course.zip to Disk]
```

### Step-by-Step ZIP Creation Flow

1. **Course Discovery**:
   - The React app uses the user's OAuth `access_token` to query the Google Classroom REST API (`https://classroom.googleapis.com/v1/courses/{id}/...`).
   - Gathers all coursework, materials, and announcements.

2. **Folder Hierarchy Construction**:
   - Instead of dumping all files flat into one list, the browser builds an organized file tree:
     ```
     CS101 - Introduction to Computer Science/
     ├── Syllabus & Logistics/
     │   └── Course_Syllabus.docx
     ├── Assignment 1 - Algorithm Analysis/
     │   ├── Problem_Set.pdf
     │   └── starter_code.py
     └── Lecture Slides/
         ├── Week_1_Intro.pptx
         └── Week_2_Complexity.pptx
     ```

3. **In-Browser Streaming to a Single `.zip` File**:
   - The browser uses `client-zip` (lightweight, zero-dependency streaming zip generator that accepts `AsyncIterable` of file streams).
   - Files are fetched chunk-by-chunk from Google's CDN with `fetch()` and piped directly into the ZIP writer.
   - **Zero Memory Bloat**: Files do not need to be loaded into memory all at once. As soon as a file chunk is zipped, the memory is garbage-collected.
   - **Live Progress**: The browser UI shows an exact real-time progress bar:
     > *"Downloading file 18 of 54: Week_3_Notes.docx (3.4 MB / 3.4 MB) — 42% complete"*

4. **Direct Download to Disk**:
   - The browser streams the resulting zip archive directly to the user's filesystem using a standard `<a download="Course.zip">` stream or the Native File System API (`showSaveFilePicker`).
   - The user gets one file: `CourseName.zip`.

---

## How Google Drive Export Works

When the user chooses **Export to Google Drive**:
1. The browser calls `POST https://www.googleapis.com/drive/v3/files` to create the target folder: `Classroom Export — <Course>`.
2. For each file, the browser calls Google Drive API's `drive.files.copy`:
   ```http
   POST https://www.googleapis.com/drive/v3/files/{fileId}/copy
   Authorization: Bearer <accessToken>
   Content-Type: application/json

   {
     "name": "Homework 1.pdf",
     "parents": ["<targetFolderId>"]
   }
   ```
3. **Speed**: Because `files.copy` happens **inside Google's internal datacenter** without transferring file bytes over the public internet to a middleman server, each copy takes **~200–500 milliseconds**.
4. An entire 100-file course can be copied to Google Drive in **under 30–45 seconds**.

---

## Comparison: Why Option 1 Solves the Render / Uptime Issues

| Concern / Point of Failure | Old Setup (Render + UptimeRobot) | Option 1 (Vercel + Direct Stream) |
|---|---|---|
| **Monthly Cost** | Free until Render 750h limit hits or sleeps | **$0 / month forever** (No server hours to exhaust) |
| **Server Sleeping / Cold Start** | 50–90 second spin up if UptimeRobot misses | **0 seconds** (Instant CDN load from Vercel) |
| **UptimeRobot Dependency** | Required 24/7 | **Not needed at all** |
| **ZIP File Size Limit** | Crashes server if files > 200MB (512MB RAM cap) | **Unlimited** (Streams in browser) |
| **HTTP Gateway Timeout** | Render cuts connection after 100 seconds | **No timeout** (Browser keeps connection alive) |
| **Duplicate Filename Handling** | Silently skips and drops duplicate files | **Preserves all files** in topic subfolders |
| **Google Workspace Files (Docs/Sheets)** | Converted on server | Converted via Drive Export endpoint into `.docx`, `.xlsx`, `.pptx` |
