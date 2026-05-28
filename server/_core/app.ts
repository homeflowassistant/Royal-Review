import express from "express";
import cors from "cors";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { Express } from "express";
import { registerOAuthRoutes } from "./oauth.js";
import { registerGHLOAuthRoutes } from "../ghl-oauth.js";
import { registerStorageProxy } from "./storageProxy.js";
import { registerDynamicImageRenderRoute } from "../routes/dynamicImageRender.js";
import accountManagementRoutes from "../routes/accountManagement.js";
import { registerZapierRoutes } from "../routes/zapier.js";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { serveStatic } from "./vite.js";

// Configure multer for file uploads (memory storage for direct Buffer access)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

export function createApp(options?: { serveClient?: boolean }): Express {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // CORS configuration: allow explicit origins and enable credentials
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    console.warn("[CORS] No ALLOWED_ORIGINS configured; allowing all origins (development only)");
    app.use(
      cors({
        origin: true,
        credentials: true,
      })
    );
  } else {
    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, false);
          if (allowedOrigins.includes(origin)) return callback(null, true);
          return callback(new Error("CORS origin not allowed"));
        },
        credentials: true,
      })
    );
  }

  registerStorageProxy(app);
  registerDynamicImageRenderRoute(app);
  registerOAuthRoutes(app);
  registerGHLOAuthRoutes(app);
  registerZapierRoutes(app);
  app.use("/api", accountManagementRoutes);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (options?.serveClient) {
    serveStatic(app);
  }

  return app;
}
