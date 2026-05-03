import type { Request, Response } from "express";
import { writeAuditLog } from "../services/auditService.js";
import { getPublicUserById, getUserRating, updateUserRole } from "../services/userService.js";
import { normalizeRole, parsePositiveInt } from "../utils/validation.js";

export async function getUser(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id, "id");
  const user = await getPublicUserById(id);
  res.json({ user });
}

export async function getRating(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id, "id");
  const rating = await getUserRating(id);
  res.json({ rating });
}

export async function patchUserRole(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id, "id");
  const role = normalizeRole(req.body?.role);
  if (!role) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "role is required" } });
    return;
  }
  const user = await updateUserRole(id, role);
  await writeAuditLog(req, "USER_ROLE_UPDATE", "success", 200, `user ${id} role -> ${role}`);
  res.json({ user });
}
