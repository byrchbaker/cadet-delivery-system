import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config';
import { db } from '../db';
import { badRequest } from './http';
import { token } from './ids';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']);

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
      cb(null, config.uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
      cb(null, `${Date.now()}-${token(9)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(badRequest('Upload a photo (JPG, PNG, HEIC) or a PDF.'));
  },
});

export function saveAttachment(
  file: Express.Multer.File,
  opts: { orderId?: number | null; threadId?: number | null; kind: 'receipt' | 'delivery' | 'message' | 'other'; uploadedBy: number },
): number {
  const info = db()
    .prepare('INSERT INTO attachments (order_id, thread_id, kind, name, mime, path, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(opts.orderId ?? null, opts.threadId ?? null, opts.kind, file.originalname.slice(0, 120), file.mimetype, path.basename(file.path), file.size, opts.uploadedBy);
  return Number(info.lastInsertRowid);
}

export function attachmentPath(name: string): string {
  return path.join(config.uploadsDir, path.basename(name));
}
